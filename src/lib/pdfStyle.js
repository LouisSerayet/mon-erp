// Mise en page commune à tous les PDF générés par l'ERP (devis, factures
// clients, bons de commande) — direction visuelle validée avec Louis/Alexis
// sur une maquette de devis (logo d'Alexis, bandeau navy, blocs de totaux
// centrés en barres pleines) puis étendue aux trois types de documents pour
// qu'ils restent visuellement cohérents entre eux. Les montants restent en
// police Courier (l'équivalent PDF du JetBrains Mono utilisé côté web) pour
// un alignement en colonnes plus lisible. Voir aussi pdfCgv.js pour les
// conditions générales de vente rattachées aux devis/factures, et
// pdfI18n.js pour les libellés traduits (chaque document peut être généré
// en FR ou en EN).
import { LOGO_ALEXIS_BASE64, LOGO_ALEXIS_RATIO } from './logo'
import { ENTREPRISE } from './entreprise'
import { L, fmtMontant } from './pdfI18n'

export const NAVY = [22, 46, 82]         // #162E52 — accent fort (bandeau, HT, en-têtes de tableau)
export const NAVY_SOFT = [231, 236, 245] // #E7ECF5 — bandeaux clairs (destinataire, TVA)
export const INK = [23, 24, 26]
export const MUTED = [107, 114, 128]
export const FAINT = [156, 163, 175]
export const LINE = [226, 229, 234]
export const WARNING = [156, 95, 30]
export const WARNING_BG = [245, 236, 221]
export const PAGE_W = 210
export const MARGIN_L = 14
export const MARGIN_R = 196 // = 210 - 14, bord droit du contenu

// Styles de tableau communs (autoTable / jspdf-autotable) — même trame sur
// tous les documents envoyés à un tiers (devis, commande, facture) : entête
// bleu marine plein, pied de tableau (sous-totaux) neutre avec un filet du
// haut, pas d'autre remplissage coloré (sauf le groupe "Options", ambre —
// voir enteteGroupe/footStyles dans ProjetDetail.jsx, seul endroit où la
// couleur porte un vrai sens fonctionnel : signaler que ces lignes sont
// hors du total principal).
export const TABLE_STYLE = { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak', textColor: INK }
export const TABLE_HEAD_STYLE = { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 }
export const TABLE_FOOT_STYLE = { fillColor: [255, 255, 255], textColor: INK, fontStyle: 'bold', lineWidth: { top: 0.2 }, lineColor: LINE }
export const TABLE_ALT_ROW_STYLE = { fillColor: [249, 250, 251] }

// NB : on n'utilise pas toLocaleString() ici — en français il insère une
// espace fine insécable (U+202F) comme séparateur de milliers que la police
// standard de jsPDF ne sait pas afficher correctement. On regroupe donc les
// milliers nous-mêmes avec une espace normale (voir fmtMontant, pdfI18n.js).
export function fmt(n, lang = 'fr') {
  const m = fmtMontant(n, lang)
  return m === '—' ? m : m + ' €'
}

// La police Courier standard de jsPDF n'a pas le glyphe « € » : le caractère
// est silencieusement omis au rendu (constaté sur les devis/factures/BC
// réels — c'est la cause du "€ pas affiché / pas centré" remonté plusieurs
// fois). Partout où un montant Courier doit afficher le €, on le dessine
// donc à part, juste après, en Helvetica — seule police standard qui le
// supporte. Petit utilitaire pour ce calcul (largeur du " €" en Helvetica à
// une taille donnée, dans l'unité du document) :
function largeurEuro(doc, taille, style = 'normal') {
  doc.setFont('helvetica', style); doc.setFontSize(taille)
  return doc.getStringUnitWidth(' €') * taille / doc.internal.scaleFactor
}
// Idem pour "(€)" : à cette taille de police, le glyphe € n'est plus jamais
// entouré de parenthèses collées dans les libellés (voir pdfI18n.js) — ce
// n'était pas qu'un souci Courier : même en Helvetica, "(€)" affiche le €
// mal centré verticalement entre les deux parenthèses (glyphe plus haut).

// Bandeau bleu marine de 3mm en haut de la page courante — répété sur
// chaque page (page 1 via enTeteDocument, pages suivantes via le
// didDrawPage des tableaux ou un appel direct après doc.addPage()).
export function bandeauHaut(doc) {
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, PAGE_W, 3, 'F')
}

// En-tête commun : bandeau navy, logo d'Alexis en haut à droite, bloc
// société en haut à gauche (nom, adresse, SIRET, contact), puis le titre du
// document (DEVIS, FACTURE, BON DE COMMANDE...) souligné d'un filet navy.
// Retourne le Y où démarrer le bloc méta (voir blocMetaBand ci-dessous).
// `contact` (optionnel) : { nom, tel, email } à afficher à la place des
// coordonnées par défaut (ENTREPRISE.contact, toujours Louis) — utilisé
// pour afficher celles du créateur du projet, voir lib/contacts.js.
export function enTeteDocument(doc, { titre, lang = 'fr', contact }) {
  const t = L[lang]
  const c = contact || ENTREPRISE.contact
  bandeauHaut(doc)

  const logoH = 22
  const logoW = logoH * LOGO_ALEXIS_RATIO
  doc.addImage(LOGO_ALEXIS_BASE64, 'PNG', MARGIN_R - logoW, 12, logoW, logoH)

  let y = 17
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text(ENTREPRISE.nom.toUpperCase(), MARGIN_L, y); y += 5.5
  doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  doc.text(ENTREPRISE.adresse + ' · ' + ENTREPRISE.codePostal + ' ' + ENTREPRISE.ville, MARGIN_L, y); y += 4
  doc.text(t.siret + ENTREPRISE.siret, MARGIN_L, y); y += 4
  doc.text(c.nom + ' · ' + c.tel, MARGIN_L, y); y += 4
  doc.text(c.email, MARGIN_L, y); y += 9

  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(24)
  doc.text(titre, MARGIN_L, y); y += 4
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.6)
  doc.line(MARGIN_L, y, MARGIN_R, y)
  doc.setLineWidth(0.2)
  return y + 9
}

// Bloc méta (N° document, date, validité/échéance...) réparti en colonnes
// horizontales égales — jusqu'à 4 items, comme sur la maquette validée.
// `items` : liste de [label, valeur]. Retourne le Y suivant.
export function blocMetaBand(doc, y, items) {
  if (!items.length) return y
  const colW = (MARGIN_R - MARGIN_L) / items.length
  items.forEach(([label, valeur], i) => {
    const x = MARGIN_L + i * colW
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...FAINT)
    doc.text(String(label).toUpperCase(), x, y)
    doc.setFontSize(10.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK)
    doc.text(String(valeur ?? '—'), x, y + 5.5)
  })
  doc.setTextColor(...INK)
  return y + 14
}

// Bandeau méta (voir blocMetaBand) suivi d'un bandeau clair (NAVY_SOFT)
// avec le destinataire (client ou fournisseur) à gauche et, optionnellement,
// un second bloc à droite (ex. le projet, sur un devis). Retourne le Y
// suivant. `metaGauche` : liste de [label, valeur] pour blocMetaBand.
export function blocMetaEtDestinataire(doc, y, { metaGauche = [], destinataire, destinataireDroite }) {
  let yy = blocMetaBand(doc, y, metaGauche)

  if (destinataire) {
    const blocs = destinataireDroite ? [destinataire, destinataireDroite] : [destinataire]
    const colW = (MARGIN_R - MARGIN_L) / blocs.length
    // Hauteur : calculée sur le bloc le plus long (nombre de lignes
    // d'adresse) plutôt que fixe — un client avec beaucoup de lignes
    // d'adresse ne doit pas déborder du bandeau.
    const nbLignesMax = Math.max(...blocs.map(b => 1 + (b.lignes || []).filter(Boolean).length))
    const bandH = Math.max(24, 11 + nbLignesMax * 4.5)
    doc.setFillColor(...NAVY_SOFT)
    doc.rect(MARGIN_L, yy, MARGIN_R - MARGIN_L, bandH, 'F')

    blocs.forEach((bloc, i) => {
      const x = MARGIN_L + i * colW + 5
      let by = yy + 6.5
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
      doc.text(bloc.titre.toUpperCase(), x, by); by += 5.5
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK)
      doc.text(bloc.lignes[0] || '—', x, by); by += 5
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED)
      for (const ligne of bloc.lignes.slice(1)) {
        if (!ligne) continue
        const wrapped = doc.splitTextToSize(ligne, colW - 10)
        doc.text(wrapped, x, by)
        by += 4.2 * wrapped.length
      }
    })
    yy += bandH + 10
  } else {
    yy += 4
  }

  doc.setTextColor(...INK)
  return yy
}

// Titre de section en milieu de flux (synthèse des lots, détail d'un lot,
// lignes hors lot, options) — remplace l'ancien enTeteContinuation, qui
// supposait toujours un début de page à Y fixe ; ici Y est fourni par
// l'appelant, ce qui permet à une section d'enchaîner directement après la
// précédente sur la même page (fini le "un lot = une page" qui laissait de
// grandes pages blanches pour un lot court). `accent` permet de teinter
// titre + filet pour la seule page où la couleur porte un vrai sens
// fonctionnel (la page "Options", hors du total principal — voir WARNING).
// `montant` : chaîne déjà formatée (fmtMontant), sans le € — dessiné à part
// en Helvetica juste après (voir largeurEuro plus haut). Retourne le Y où
// démarrer le tableau qui suit.
export function titreSection(doc, y, { titre, sousTitre, montant, note, accent = INK }) {
  doc.setTextColor(...accent); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text(titre, MARGIN_L, y)
  if (montant != null) {
    const taille = 10
    const euroW = largeurEuro(doc, taille, 'bold')
    doc.setTextColor(...accent); doc.setFont('helvetica', 'bold'); doc.setFontSize(taille)
    doc.text(' €', MARGIN_R, y, { align: 'right' })
    doc.setFont('courier', 'bold')
    doc.text(montant, MARGIN_R - euroW, y, { align: 'right' })
  }
  let yLigne = y + 6
  if (sousTitre) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...accent)
    doc.text(sousTitre, MARGIN_L, y + 4.5)
    yLigne = y + 8.5
  }
  if (note) {
    doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    doc.text(note, MARGIN_L, yLigne - 2.3)
  }
  doc.setDrawColor(...accent); doc.setLineWidth(0.3)
  doc.line(MARGIN_L, yLigne, MARGIN_R, yLigne)
  doc.setLineWidth(0.2)
  doc.setTextColor(...INK)
  return yLigne + 7
}

// Bloc de totaux (Total HT / TVA / Total TTC) — barres pleines centrées,
// HT mis en évidence (barre navy, comme sur la maquette validée), TVA/TTC
// discrets. Chaque ligne (étiquette + montant) est composée comme UN seul
// bloc centré horizontalement dans sa barre plutôt qu'étiquette à
// gauche / montant à droite — c'est ce centrage qui avait révélé le bug du
// glyphe € manquant en Courier (voir largeurEuro plus haut).
// tauxTva : taux réellement appliqué à CE document (20 / 10 / 5,5 / 0 —
// voir le réglage "TVA" du projet/devis), pas une constante figée à 20 %.
export function blocTotaux(doc, y, { totalHt, totalTva, totalTtc, showTva = true, tauxTva = ENTREPRISE.tvaTauxDefaut, lang = 'fr' }) {
  const t = L[lang]
  const totX = 128, totW = MARGIN_R - totX
  let yy = y

  const ligne = (label, valeur, { fillColor, labelColor, montantColor, labelSize, montantSize, gras, hauteur }) => {
    doc.setFillColor(...fillColor)
    doc.rect(totX, yy, totW, hauteur, 'F')
    const style = gras ? 'bold' : 'normal'
    const ty = yy + hauteur / 2 + montantSize * 0.35
    doc.setFont('helvetica', style); doc.setFontSize(labelSize)
    const labelW = doc.getStringUnitWidth(label) * labelSize / doc.internal.scaleFactor
    const montantNum = fmtMontant(valeur, lang)
    doc.setFont('courier', style); doc.setFontSize(montantSize)
    const montantNumW = doc.getStringUnitWidth(montantNum) * montantSize / doc.internal.scaleFactor
    const euroW = largeurEuro(doc, montantSize, style)
    const gap = 6
    const startX = totX + (totW - (labelW + gap + montantNumW + euroW)) / 2

    doc.setTextColor(...labelColor); doc.setFont('helvetica', style); doc.setFontSize(labelSize)
    doc.text(label, startX, ty)
    doc.setTextColor(...montantColor)
    doc.setFont('courier', style); doc.setFontSize(montantSize)
    doc.text(montantNum, startX + labelW + gap, ty)
    doc.setFont('helvetica', style)
    doc.text(' €', startX + labelW + gap + montantNumW, ty)
    yy += hauteur
  }

  ligne(t.totalHt, totalHt, { fillColor: NAVY, labelColor: [255, 255, 255], montantColor: [255, 255, 255], labelSize: 11, montantSize: 12, gras: true, hauteur: 11 })
  if (showTva) ligne(t.totalTva(tauxTva), totalTva, { fillColor: NAVY_SOFT, labelColor: MUTED, montantColor: INK, labelSize: 8.5, montantSize: 8.5, gras: false, hauteur: 8 })
  ligne(t.totalTtc, totalTtc, { fillColor: [245, 246, 248], labelColor: MUTED, montantColor: MUTED, labelSize: 8.5, montantSize: 8.5, gras: false, hauteur: 8 })

  doc.setTextColor(...INK)
  return yy + 8
}

// Section "Conditions" (courtes, renvoi vers les CGV jointes) + bloc de
// signature "Bon pour accord" — utilisé sur les devis.
export function blocConditionsEtSignature(doc, y, { bullets, avecSignature = true, lang = 'fr' }) {
  const t = L[lang]
  let yy = y
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
  doc.text(t.conditions, MARGIN_L, yy); yy += 5.5
  doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  for (const b of bullets) {
    const wrapped = doc.splitTextToSize('•  ' + b, MARGIN_R - MARGIN_L)
    doc.text(wrapped, MARGIN_L, yy)
    yy += 4.2 * wrapped.length
  }
  yy += 6

  if (avecSignature) {
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
    doc.text(t.bonPourAccord, MARGIN_L, yy); yy += 5.5
    doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(t.dateSignature, MARGIN_L, yy); yy += 5
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2)
    doc.rect(MARGIN_L, yy, MARGIN_R - MARGIN_L, 26)
    yy += 26 + 4
  }
  doc.setTextColor(...INK)
  return yy
}

// Bloc "Coordonnées bancaires" (banque / IBAN / BIC) — utilisé sur la
// facture client pour que le client ait directement de quoi payer par
// virement, sans avoir à redemander le RIB séparément. Cadre à coins nets,
// pas de remplissage — juste un filet fin, comme le reste du document.
export function blocCoordonneesBancaires(doc, y, { lang = 'fr' } = {}) {
  const t = L[lang]
  const boxH = 24
  if (y + boxH > 275) { doc.addPage(); bandeauHaut(doc); y = 20 }
  doc.setDrawColor(...LINE); doc.setLineWidth(0.2)
  doc.rect(MARGIN_L, y, MARGIN_R - MARGIN_L, boxH)
  let yy = y + 7
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text(t.coordonneesBancaires, MARGIN_L + 5, yy); yy += 5.5
  doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  doc.text(t.banqueLabel + ENTREPRISE.banque.nom + '   —   ' + t.ibanLabel + ENTREPRISE.banque.iban, MARGIN_L + 5, yy); yy += 5
  doc.text(t.bicLabel + ENTREPRISE.banque.bic, MARGIN_L + 5, yy)
  return y + boxH + 8
}

// Pied de page (numéro de page + libellé) sur toutes les pages du document.
export function piedDePage(doc, docLabel, lang = 'fr') {
  const t = L[lang]
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7); doc.setTextColor(...FAINT); doc.setFont('helvetica', 'normal')
    doc.text('Partenaires Particuliers — ' + docLabel, MARGIN_L, 291)
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold')
    doc.text(t.page(i, pageCount), MARGIN_R, 291, { align: 'right' })
  }
  doc.setTextColor(...INK)
}

// Formatte l'adresse d'un client/fournisseur en tenant compte du fait que
// certaines fiches n'ont qu'un champ "adresse" libre, d'autres des champs
// structurés (rue/code_postal/ville) saisis pour la synchro Pennylane.
export function lignesAdresse(entite, lang = 'fr') {
  if (!entite) return []
  const t = L[lang]
  const lignes = []
  if (entite.rue || entite.code_postal || entite.ville) {
    if (entite.rue) lignes.push(entite.rue)
    const cpVille = [entite.code_postal, entite.ville].filter(Boolean).join(' ')
    if (cpVille) lignes.push(cpVille)
  } else if (entite.adresse) {
    lignes.push(entite.adresse)
  }
  if (entite.telephone) lignes.push(t.tel + entite.telephone)
  if (entite.email) lignes.push(entite.email)
  return lignes
}
