// Mise en page commune à tous les PDF générés par l'ERP (devis, factures
// clients, bons de commande) — un même style simple, épuré et classique
// (bandeau bleu marine, tableaux clairs) pour que tous les documents envoyés
// à un tiers soient cohérents. Voir aussi pdfCgv.js pour les conditions
// générales de vente rattachées aux devis/factures.
import { LOGO_PP_BASE64, LOGO_PP_RATIO } from './logo'
import { ENTREPRISE } from './entreprise'

export const NAVY = [30, 41, 59]
export const GRAY = [107, 114, 128]
export const LIGHT_GRAY = [229, 231, 235]
export const GREEN = [5, 150, 105]
export const PAGE_W = 210
export const MARGIN_L = 14
export const MARGIN_R = 196 // = 210 - 14, bord droit du contenu

// NB : on n'utilise pas toLocaleString('fr-FR') ici — il insère une espace
// fine insécable (U+202F) comme séparateur de milliers que la police
// standard de jsPDF ne sait pas afficher correctement. On regroupe donc les
// milliers nous-mêmes avec une espace normale (même pattern que les autres
// générateurs PDF de l'app, voir ProjetDetail.jsx).
export function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  const parts = Number(n).toFixed(2).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return parts.join(',') + ' €'
}

// En-tête commun : logo en haut à droite, bloc société en haut à gauche
// (nom, adresse, SIRET, contact), puis le titre du document (DEVIS,
// FACTURE, BON DE COMMANDE...) souligné d'un filet fin bleu marine.
// Retourne le Y où démarrer le contenu suivant.
export function enTeteDocument(doc, { titre }) {
  const logoH = 16
  const logoW = logoH * LOGO_PP_RATIO
  doc.addImage(LOGO_PP_BASE64, 'PNG', MARGIN_R - logoW, 12, logoW, logoH)

  let y = 18
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
  doc.text(ENTREPRISE.nom, MARGIN_L, y); y += 6
  doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  doc.text(ENTREPRISE.adresse, MARGIN_L, y); y += 4.5
  doc.text(ENTREPRISE.codePostal + ' ' + ENTREPRISE.ville, MARGIN_L, y); y += 4.5
  doc.text('SIRET : ' + ENTREPRISE.siret, MARGIN_L, y); y += 6
  doc.text('Contact : ' + ENTREPRISE.contact.nom + ' — ' + ENTREPRISE.contact.tel, MARGIN_L, y); y += 4.5
  doc.text(ENTREPRISE.contact.email, MARGIN_L, y); y += 8

  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(26)
  doc.text(titre, MARGIN_L, y + 4); y += 10

  doc.setDrawColor(...NAVY); doc.setLineWidth(0.6)
  doc.line(MARGIN_L, y, MARGIN_R, y)
  doc.setLineWidth(0.2)
  return y + 10
}

// Bloc méta (N°, date, ...) à gauche + bloc destinataire (client ou
// fournisseur) à droite, comme sur le devis modèle. Retourne le Y suivant.
export function blocMetaEtDestinataire(doc, y, { metaGauche = [], destinataire }) {
  let yG = y
  doc.setFontSize(9)
  for (const [label, valeur] of metaGauche) {
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold')
    doc.text(label + ' ', MARGIN_L, yG)
    const labelW = doc.getTextWidth(label + ' ')
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY)
    doc.text(String(valeur ?? '—'), MARGIN_L + labelW, yG)
    yG += 6
  }

  let yD = y
  const xD = 110
  if (destinataire) {
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GRAY)
    doc.text(destinataire.titre.toUpperCase(), xD, yD); yD += 6
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
    doc.text(destinataire.lignes[0] || '—', xD, yD); yD += 5.5
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY)
    for (const ligne of destinataire.lignes.slice(1)) {
      if (!ligne) continue
      const wrapped = doc.splitTextToSize(ligne, 76)
      doc.text(wrapped, xD, yD)
      yD += 4.5 * wrapped.length
    }
  }

  return Math.max(yG, yD) + 6
}

// Bloc de totaux (Total HT / TVA / Total TTC), aligné à droite façon devis
// modèle — la ligne Total TTC est mise en avant en bleu marine plein.
export function blocTotaux(doc, y, { totalHt, totalTva, totalTtc, showTva = true }) {
  const xLabel = MARGIN_L, wLabel = 120
  const xVal = MARGIN_L + wLabel, wVal = MARGIN_R - xVal
  const rowH = 9
  let yy = y

  const ligne = (label, valeur, pleine) => {
    if (pleine) {
      doc.setFillColor(...NAVY)
      doc.rect(xLabel, yy, wLabel + wVal, rowH, 'F')
    } else {
      doc.setFillColor(...NAVY)
      doc.rect(xLabel, yy, wLabel, rowH, 'F')
      doc.setFillColor(255, 255, 255)
      doc.rect(xVal, yy, wVal, rowH, 'F')
      doc.setDrawColor(...LIGHT_GRAY)
      doc.rect(xVal, yy, wVal, rowH)
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(pleine ? 11 : 9.5)
    // Libellé — toujours sur fond bleu marine, donc toujours en blanc.
    doc.setTextColor(255, 255, 255)
    doc.text(label, xLabel + 4, yy + rowH / 2 + 3)
    // Montant — blanc si la ligne est pleine (Total TTC), bleu marine sur
    // fond blanc sinon.
    doc.setTextColor(...(pleine ? [255, 255, 255] : NAVY))
    doc.text(fmt(valeur), MARGIN_R - 4, yy + rowH / 2 + 3, { align: 'right' })
    yy += rowH
  }

  ligne('Total HT', totalHt, false)
  if (showTva) ligne('Total TVA (' + ENTREPRISE.tvaTauxDefaut + '%)', totalTva, false)
  ligne('Total TTC', totalTtc, true)

  doc.setTextColor(...NAVY)
  return yy + 8
}

// Section "Conditions" (courtes, renvoi vers les CGV jointes) + bloc de
// signature "Bon pour accord" — utilisé sur les devis.
export function blocConditionsEtSignature(doc, y, { bullets, avecSignature = true }) {
  let yy = y
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('Conditions', MARGIN_L, yy); yy += 6
  doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  for (const b of bullets) {
    const wrapped = doc.splitTextToSize('• ' + b, MARGIN_R - MARGIN_L)
    doc.text(wrapped, MARGIN_L, yy)
    yy += 4.5 * wrapped.length
  }
  yy += 6

  if (avecSignature) {
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text('Bon pour accord', MARGIN_L, yy); yy += 5
    doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    doc.text('Date, signature et cachet du client :', MARGIN_L, yy)
    yy += 4
  }
  return yy
}

// Pied de page (numéro de page + libellé) sur toutes les pages du document.
export function piedDePage(doc, docLabel) {
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal')
    doc.text('Partenaires Particuliers — ' + docLabel, MARGIN_L, 291)
    doc.text('Page ' + i + ' / ' + pageCount, MARGIN_R, 291, { align: 'right' })
  }
}

// Formatte l'adresse d'un client/fournisseur en tenant compte du fait que
// certaines fiches n'ont qu'un champ "adresse" libre, d'autres des champs
// structurés (rue/code_postal/ville) saisis pour la synchro Pennylane.
export function lignesAdresse(entite) {
  if (!entite) return []
  const lignes = []
  if (entite.rue || entite.code_postal || entite.ville) {
    if (entite.rue) lignes.push(entite.rue)
    const cpVille = [entite.code_postal, entite.ville].filter(Boolean).join(' ')
    if (cpVille) lignes.push(cpVille)
  } else if (entite.adresse) {
    lignes.push(entite.adresse)
  }
  if (entite.telephone) lignes.push('Tél : ' + entite.telephone)
  if (entite.email) lignes.push(entite.email)
  return lignes
}
