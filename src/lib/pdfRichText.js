// Mise en forme (gras / italique / souligné / couleur) à l'intérieur du
// descriptif d'une ligne de devis — demandé par Alexis : pouvoir mettre en
// valeur un mot important dans une ligne, et le voir vraiment apparaître
// ainsi sur le PDF envoyé au client (pas juste à l'écran).
//
// Syntaxe volontairement minimale (pas un vrai moteur Markdown) :
//   **texte**        -> gras
//   _texte_          -> italique
//   ~texte~          -> souligné
//   {rouge:texte}    -> couleur (voir PALETTE_COULEURS pour les noms valides)
// Les 3 premiers marqueurs sont symétriques à des caractères différents,
// donc jamais ambigus entre eux — pas besoin de gérer un ordre de priorité.
// Combinables en les imbriquant, ex. "**_texte_**" = gras + italique,
// "{rouge:**texte**}" = rouge + gras. Tapés via les boutons G/I/S et la
// palette de couleurs du textarea de ligne (ProjetDetail.jsx, onglet
// Lignes) ou directement à la main.
//
// Rendu PDF : jspdf-autotable ne sait dessiner qu'un seul style par
// cellule — impossible nativement d'avoir un mot en gras au milieu d'une
// cellule en texte normal. Plutôt que de bidouiller son rendu interne (donc
// dépendre de sa mise en page exacte, fragile d'une version à l'autre), les
// fonctions ci-dessous mettent en page et dessinent ce texte entièrement
// nous-mêmes à l'intérieur du rectangle que l'appelant (ProjetDetail.jsx,
// generateDevisPDF, hooks didParseCell/didDrawCell) nous donne — voir
// mettreEnPage (mesure/largeur, pour la hauteur de ligne) et dessiner
// (tracé effectif), qui partagent la même formule de hauteur de ligne pour
// rester cohérentes entre elles sans dépendre de la mise en page interne
// d'autoTable.

const MM_PAR_PT = 0.3528 // jsPDF attend des tailles de police en points, mais dessine en mm (unit: 'mm')

// Palette volontairement restreinte à des couleurs "classiques" faciles à
// reconnaître au premier coup d'œil (demande de Louis) — plutôt qu'un
// sélecteur de couleur libre, qui serait à la fois plus lent à utiliser et
// plus risqué visuellement sur un document commercial. Le jaune est
// volontairement assombri (ambre) : un jaune pur serait quasi illisible sur
// fond blanc, à l'écran comme sur le PDF. Utilisée à la fois pour les
// pastilles de la mini-toolbar (lib/richTextEditeur.js) et pour le rendu
// PDF (dessiner, ci-dessous) — une seule source de vérité pour les deux.
export const PALETTE_COULEURS = [
  ['rouge', '#d32f2f'],
  ['orange', '#e65100'],
  ['jaune', '#b7940b'],
  ['vert', '#2e7d32'],
  ['bleu', '#1565c0'],
  ['violet', '#6a1b9a'],
]

// '#d32f2f' -> [211, 47, 47] — jsPDF (setTextColor/setDrawColor) attend des
// composantes 0-255 séparées, pas une chaîne hexadécimale.
export function hexVersRgb(hex) {
  const n = parseInt(String(hex || '').replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Détection rapide avant de faire tout le travail de parsing/mise en page —
// la grande majorité des lignes n'ont aucune mise en forme.
export function aDeLaMiseEnForme(raw) {
  return /\*\*[^*]+\*\*|_[^_]+_|~[^~]+~|\{\w+:[^}]+\}/.test(String(raw || ''))
}

// '**gras** et _italique_ et {rouge:important}' -> [{text,bold,...}, ...]
// Analyse récursive : les 4 marqueurs ne se chevauchent jamais entre eux
// (caractères différents), donc l'ordre de la regex n'a pas d'importance, et
// le contenu capturé est ré-analysé pour permettre l'imbrication.
function analyser(str, etat) {
  const re = /\*\*(.+?)\*\*|_(.+?)_|~(.+?)~|\{(\w+):(.+?)\}/
  let reste = str
  let segments = []
  while (reste.length) {
    const m = re.exec(reste)
    if (!m) { segments.push({ text: reste, ...etat }); break }
    if (m.index > 0) segments.push({ text: reste.slice(0, m.index), ...etat })
    if (m[1] !== undefined) segments = segments.concat(analyser(m[1], { ...etat, bold: true }))
    else if (m[2] !== undefined) segments = segments.concat(analyser(m[2], { ...etat, italic: true }))
    else if (m[3] !== undefined) segments = segments.concat(analyser(m[3], { ...etat, underline: true }))
    else if (m[4] !== undefined) segments = segments.concat(analyser(m[5], { ...etat, couleur: m[4] }))
    reste = reste.slice(m.index + m[0].length)
  }
  return segments
}

export function analyserMiseEnForme(raw) {
  const segments = analyser(String(raw || ''), { bold: false, italic: false, underline: false, couleur: null }).filter(s => s.text.length > 0)
  const plain = segments.map(s => s.text).join('')
  return { segments, plain }
}

// Style de police jsPDF — Helvetica est la seule police standard du PDF
// avec gras + italique + gras-italique natifs (voir pdfStyle.js, la même
// raison que Courier n'a pas le glyphe €).
function styleFont(bold, italic) {
  if (bold && italic) return 'bolditalic'
  if (bold) return 'bold'
  if (italic) return 'italic'
  return 'normal'
}

// Découpe les segments en "mots" (espaces gardées comme mots à part, pour
// ne jamais perdre une espace entre deux segments de styles différents) et
// les répartit en lignes ne dépassant pas maxWidth — en mesurant chaque mot
// avec SA police (un mot en gras est souvent un peu plus large que le même
// mot normal ; la couleur n'affecte pas la largeur, juste transmise pour le
// tracé). Retourne { lines: [[{text,bold,italic,underline,couleur}]], lineCount }.
export function mettreEnPage(doc, raw, { fontSize, maxWidth, fontNormal = 'helvetica' }) {
  const { segments } = analyserMiseEnForme(raw)
  const mots = []
  for (const seg of segments) {
    const tokens = seg.text.match(/\S+|\s+/g) || []
    for (const tok of tokens) mots.push({ text: tok, bold: seg.bold, italic: seg.italic, underline: seg.underline, couleur: seg.couleur })
  }

  const largeurMot = m => {
    doc.setFont(fontNormal, styleFont(m.bold, m.italic))
    doc.setFontSize(fontSize)
    return doc.getTextWidth(m.text)
  }
  const estEspace = t => /^\s+$/.test(t)

  const lignes = []
  let ligneActuelle = []
  let largeurActuelle = 0
  for (const mot of mots) {
    const espace = estEspace(mot.text)
    const w = largeurMot(mot)
    if (!espace && largeurActuelle + w > maxWidth && ligneActuelle.length) {
      while (ligneActuelle.length && estEspace(ligneActuelle[ligneActuelle.length - 1].text)) ligneActuelle.pop()
      lignes.push(ligneActuelle)
      ligneActuelle = []
      largeurActuelle = 0
    }
    ligneActuelle.push(mot)
    largeurActuelle += w
  }
  while (ligneActuelle.length && estEspace(ligneActuelle[ligneActuelle.length - 1].text)) ligneActuelle.pop()
  if (ligneActuelle.length || lignes.length === 0) lignes.push(ligneActuelle)

  return { lines: lignes, lineCount: lignes.length }
}

// Hauteur de ligne "maison", en mm — utilisée à la fois pour calculer la
// hauteur de cellule nécessaire (mettreEnPage + cette fonction, avant le
// rendu) et pour l'espacement vertical réel au tracé (dessiner ci-dessous),
// pour que les deux restent toujours cohérentes entre elles sans dépendre
// de la formule interne d'autoTable.
export function hauteurLigne(fontSize) {
  return fontSize * 1.15 * MM_PAR_PT
}

// Dessine les lignes obtenues par mettreEnPage, mot par mot, en changeant de
// police à chaque mot et en traçant manuellement le soulignement (jsPDF ne
// le gère pas nativement comme un vrai style de police — seul gras/italique
// en sont vraiment un). `color` est la couleur par défaut (texte sans
// {couleur:...}) ; un mot avec une couleur de PALETTE_COULEURS prend le
// dessus dessus, soulignement compris (le trait suit la couleur du mot).
export function dessiner(doc, lines, { x, y, fontSize, color, fontNormal = 'helvetica' }) {
  const lh = hauteurLigne(fontSize)
  const palette = Object.fromEntries(PALETTE_COULEURS)
  let curY = y
  for (const ligne of lines) {
    let curX = x
    for (const mot of ligne) {
      doc.setFont(fontNormal, styleFont(mot.bold, mot.italic))
      doc.setFontSize(fontSize)
      const w = doc.getTextWidth(mot.text)
      if (!/^\s+$/.test(mot.text)) {
        const rgb = mot.couleur && palette[mot.couleur] ? hexVersRgb(palette[mot.couleur]) : color
        doc.setTextColor(...rgb)
        doc.text(mot.text, curX, curY)
        if (mot.underline) {
          const yTrait = curY + fontSize * MM_PAR_PT * 0.12
          doc.setDrawColor(...rgb)
          doc.setLineWidth(Math.max(0.15, fontSize * MM_PAR_PT * 0.04))
          doc.line(curX, yTrait, curX + w, yTrait)
        }
      }
      curX += w
    }
    curY += lh
  }
}
