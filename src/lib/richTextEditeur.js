// Pont entre la syntaxe de mise en forme stockée en base (**gras**,
// _italique_, ~souligné~ — voir lib/pdfRichText.js, lue telle quelle par
// generateDevisPDF) et l'édition "vraiment visuelle" du descriptif d'une
// ligne de devis (ProjetDetail.jsx, onglet Lignes).
//
// Premier essai (voir git log) : un <textarea> affichant littéralement
// "**gras**", avec des boutons G/I/S qui ajoutaient/retiraient ces
// astérisques à la main autour de la sélection. Trop peu pratique en usage
// réel (retour de Louis) : une fois le marqueur posé, le retirer proprement
// oblige à resélectionner exactement le texte + les astérisques. On passe
// donc à un <div contentEditable> qui affiche vraiment le mot en gras/
// italique/souligné, avec les boutons qui utilisent document.execCommand
// (bold/italic/underline) — la même API qu'utilise un navigateur pour la
// barre de formatage d'un webmail, qui gère nativement le bascule marche/
// arrêt (réappliquer "gras" sur une sélection déjà en gras l'enlève, même
// si la sélection déborde légèrement) : réimplémenter nous-mêmes cette
// détection serait refaire ce que le navigateur fait déjà correctement.
//
// La donnée stockée en base reste TOUJOURS la syntaxe **/_/~ (aucune
// migration nécessaire, les lignes déjà saisies continuent de s'afficher
// correctement) — seule la zone d'édition change. markupVersHtml convertit
// cette syntaxe vers du HTML pour l'affichage initial ; domVersMarkup fait
// le chemin inverse après une frappe ou un clic G/I/S, en relisant le style
// CALCULÉ de chaque fragment de texte plutôt que les balises exactes posées
// par execCommand (b/strong, i/em, u ou style inline selon le navigateur) —
// ça reste donc correct quel que soit le HTML précis que le navigateur
// choisit de produire.
import { analyserMiseEnForme } from './pdfRichText'

function echapperHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// '**gras** et _italique_' -> '<strong>gras</strong> et <em>italique</em>'
// — utilisé pour initialiser l'affichage du contentEditable avec le
// contenu déjà enregistré en base.
export function markupVersHtml(raw) {
  const { segments } = analyserMiseEnForme(raw)
  if (!segments.length) return ''
  return segments.map(s => {
    let html = echapperHtml(s.text).replace(/\n/g, '<br>')
    if (s.underline) html = `<u>${html}</u>`
    if (s.italic) html = `<em>${html}</em>`
    if (s.bold) html = `<strong>${html}</strong>`
    return html
  }).join('')
}

// Enveloppe un fragment de texte brut avec les marqueurs de son style —
// ordre fixe (gras à l'extérieur, italique puis souligné à l'intérieur)
// pour toujours produire une forme qu'analyserMiseEnForme (parsing
// récursif, voir pdfRichText.js) relit telle quelle.
function envelopperMarqueurs(text, bold, italic, underline) {
  let t = text
  if (underline) t = `~${t}~`
  if (italic) t = `_${t}_`
  if (bold) t = `**${t}**`
  return t
}

// Relit le contenu actuel du contentEditable (après une frappe ou un clic
// G/I/S) et le re-sérialise en syntaxe **/_/~ — seule forme stockée en
// base et lue par generateDevisPDF. Le style de chaque fragment de texte
// est lu via getComputedStyle (gras = graisse ≥ 600, pas une liste de noms
// de balises), donc indépendant de ce qu'écrit exactement execCommand.
export function domVersMarkup(el) {
  if (!el) return ''
  let out = ''
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let node
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'BR') out += '\n'
      continue
    }
    const text = node.nodeValue
    if (!text) continue
    const style = node.parentElement ? window.getComputedStyle(node.parentElement) : null
    const bold = !!style && parseInt(style.fontWeight, 10) >= 600
    const italic = !!style && style.fontStyle === 'italic'
    const underline = !!style && !!style.textDecorationLine && style.textDecorationLine.includes('underline')
    out += envelopperMarqueurs(text, bold, italic, underline)
  }
  return out
}

// Chrome/Safari insèrent par défaut un nouveau bloc (<div>) à chaque Entrée
// dans un contentEditable plutôt qu'un simple <br> — bien plus difficile à
// re-sérialiser proprement (et sans équivalent dans le rendu PDF, qui ne
// connaît que \n). On intercepte Entrée pour forcer un <br> à la place.
export function interceptionEntree(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    document.execCommand('insertLineBreak')
  }
}

// Un collage depuis Word/une page web peut apporter sa propre mise en
// forme (polices, couleurs...) qu'on ne veut pas récupérer — seul le texte
// brut est inséré ; mettre en gras/italique/souligné reste un choix fait
// ensuite avec les boutons G/I/S.
export function interceptionCollage(e) {
  e.preventDefault()
  const texte = (e.clipboardData || window.clipboardData).getData('text/plain')
  document.execCommand('insertText', false, texte)
}
