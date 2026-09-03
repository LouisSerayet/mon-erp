// Mise en page commune à tous les PDF générés par l'ERP (devis, factures
// clients, bons de commande) — direction visuelle épurée alignée sur
// src/lib/theme.js (même palette, mêmes principes) : plus de bandeaux
// pleins ni de coins arrondis, la séparation se fait par des filets fins,
// et la couleur reste réservée à ce qui a un vrai sens fonctionnel (la
// section "Options", qui n'entre pas dans le total, garde un ambre discret
// — voir enteteGroupe/footStyles dans ProjetDetail.jsx). Les montants sont
// en police Courier (l'équivalent PDF du JetBrains Mono utilisé côté web)
// pour un alignement en colonnes plus lisible. Voir aussi pdfCgv.js pour
// les conditions générales de vente rattachées aux devis/factures, et
// pdfI18n.js pour les libellés traduits (chaque document peut être généré
// en FR ou en EN).
import { LOGO_PP_BASE64, LOGO_PP_RATIO } from './logo'
import { ENTREPRISE } from './entreprise'
import { L, fmtMontant } from './pdfI18n'

export const INK = [23, 24, 26]
export const MUTED = [117, 116, 109]
export const FAINT = [166, 164, 155]
export const LINE = [231, 228, 220]
export const WARNING = [156, 95, 30]
export const WARNING_BG = [245, 236, 221]
export const PAGE_W = 210
export const MARGIN_L = 14
export const MARGIN_R = 196 // = 210 - 14, bord droit du contenu

// Styles de tableau communs (autoTable / jspdf-autotable) — même trame sur
// tous les documents envoyés à un tiers (devis, commande, facture) : entête
// blanc souligné d'un filet, pied de tableau (sous-totaux) neutre avec un
// filet du haut, pas de remplissage coloré.
export const TABLE_STYLE = { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak', textColor: INK }
export const TABLE_HEAD_STYLE = { fillColor: [255, 255, 255], textColor: MUTED, fontStyle: 'bold', fontSize: 8, lineWidth: { bottom: 0.3 }, lineColor: INK }
export const TABLE_FOOT_STYLE = { fillColor: [255, 255, 255], textColor: INK, fontStyle: 'bold', lineWidth: { top: 0.2 }, lineColor: LINE }
export const TABLE_ALT_ROW_STYLE = { fillColor: [255, 255, 255] }

// NB : on n'utilise pas toLocaleString() ici — en français il insère une
// espace fine insécable (U+202F) comme séparateur de milliers que la police
// standard de jsPDF ne sait pas afficher correctement. On regroupe donc les
// milliers nous-mêmes avec une espace normale (voir fmtMontant, pdfI18n.js).
export function fmt(n, lang = 'fr') {
  const m = fmtMontant(n, lang)
  return m === '—' ? m : m + ' €'
}

// En-tête commun : logo en haut à droite, bloc société en haut à gauche
// (nom, adresse, SIRET, contact), puis le titre du document (DEVIS,
// FACTURE, BON DE COMMANDE...) souligné d'un filet fin. Retourne le Y où
// démarrer le contenu suivant.
export function enTeteDocument(doc, { titre, lang = 'fr' }) {
  const t = L[lang]
  const logoH = 16
  const logoW = logoH * LOGO_PP_RATIO
  doc.addImage(LOGO_PP_BASE64, 'PNG', MARGIN_R - logoW, 12, logoW, logoH)

  let y = 18
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
  doc.text(ENTREPRISE.nom, MARGIN_L, y); y += 6
  doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  doc.text(ENTREPRISE.adresse, MARGIN_L, y); y += 4.5
  doc.text(ENTREPRISE.codePostal + ' ' + ENTREPRISE.ville, MARGIN_L, y); y += 4.5
  doc.text(t.siret + ENTREPRISE.siret, MARGIN_L, y); y += 6
  doc.text(t.contact + ENTREPRISE.contact.nom + ' — ' + ENTREPRISE.contact.tel, MARGIN_L, y); y += 4.5
  doc.text(ENTREPRISE.contact.email, MARGIN_L, y); y += 8

  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(24)
  doc.text(titre, MARGIN_L, y + 4); y += 10

  doc.setDrawColor(...INK); doc.setLineWidth(0.3)
  doc.line(MARGIN_L, y, MARGIN_R, y)
  doc.setLineWidth(0.2)
  return y + 10
}

// En-tête de page "continuation" (synthèse des lots, détail d'un lot,
// lignes hors lot, options) — un simple titre + filet fin, plus de bandeau
// plein couleur. `accent` permet de teinter titre + filet pour la seule
// page où la couleur porte un vrai sens fonctionnel (la page "Options",
// hors du total principal — voir WARNING). Retourne le Y où démarrer le
// tableau qui suit (toujours 20, la convention déjà utilisée partout).
export function enTeteContinuation(doc, { titre, sousTitre, montant, note, accent = INK }) {
  doc.setTextColor(...accent); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text(titre, MARGIN_L, 11)
  if (sousTitre) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(sousTitre, MARGIN_L, 15.5) }
  if (montant != null) {
    doc.setFont('courier', 'bold'); doc.setFontSize(10)
    doc.text(montant, MARGIN_R, 11, { align: 'right' })
  }
  if (note) {
    doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    doc.text(note, MARGIN_L, sousTitre ? 19.5 : 15.5)
  }
  doc.setDrawColor(...accent); doc.setLineWidth(0.3)
  doc.line(MARGIN_L, 17, MARGIN_R, 17)
  doc.setLineWidth(0.2)
  doc.setTextColor(...INK)
  return 24
}

// Bloc méta (N°, date, ...) à gauche + bloc destinataire (client ou
// fournisseur) à droite, comme sur le devis modèle. Retourne le Y suivant.
export function blocMetaEtDestinataire(doc, y, { metaGauche = [], destinataire }) {
  let yG = y
  doc.setFontSize(9)
  for (const [label, valeur] of metaGauche) {
    doc.setTextColor(...INK); doc.setFont('helvetica', 'bold')
    doc.text(label + ' ', MARGIN_L, yG)
    const labelW = doc.getTextWidth(label + ' ')
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED)
    doc.text(String(valeur ?? '—'), MARGIN_L + labelW, yG)
    yG += 6
  }

  let yD = y
  const xD = 110
  if (destinataire) {
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...FAINT)
    doc.text(destinataire.titre.toUpperCase(), xD, yD); yD += 5.5
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK)
    doc.text(destinataire.lignes[0] || '—', xD, yD); yD += 5.5
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED)
    for (const ligne of destinataire.lignes.slice(1)) {
      if (!ligne) continue
      const wrapped = doc.splitTextToSize(ligne, 76)
      doc.text(wrapped, xD, yD)
      yD += 4.5 * wrapped.length
    }
  }

  return Math.max(yG, yD) + 6
}

// Bloc de totaux (Total HT / TVA / Total TTC) — plus de pavés pleins,
// juste des filets fins et le Total TTC mis en avant par un filet plus
// épais au-dessus et une taille plus grande. Montants en police Courier
// (mono), comme les colonnes de montants des tableaux.
// tauxTva : taux réellement appliqué à CE document (20 / 10 / 5,5 / 0 —
// voir le réglage "TVA" du projet/devis), pas une constante figée à 20 %.
export function blocTotaux(doc, y, { totalHt, totalTva, totalTtc, showTva = true, tauxTva = ENTREPRISE.tvaTauxDefaut, lang = 'fr' }) {
  const t = L[lang]
  let yy = y

  doc.setDrawColor(...LINE); doc.setLineWidth(0.2)
  doc.line(MARGIN_L, yy, MARGIN_R, yy); yy += 6

  const ligne = (label, valeur, taille = 9.5, gras = false) => {
    doc.setFont('helvetica', gras ? 'bold' : 'normal'); doc.setFontSize(taille); doc.setTextColor(...(gras ? INK : MUTED))
    doc.text(label, MARGIN_L, yy)
    doc.setFont('courier', gras ? 'bold' : 'normal'); doc.setTextColor(...INK)
    doc.text(fmt(valeur, lang), MARGIN_R, yy, { align: 'right' })
    yy += 6
  }

  ligne(t.totalHt, totalHt)
  if (showTva) ligne(t.totalTva(tauxTva), totalTva)
  yy += 2
  doc.setDrawColor(...INK); doc.setLineWidth(0.4)
  doc.line(MARGIN_L, yy, MARGIN_R, yy); yy += 7
  ligne(t.totalTtc, totalTtc, 12.5, true)

  doc.setTextColor(...INK)
  return yy + 6
}

// Section "Conditions" (courtes, renvoi vers les CGV jointes) + bloc de
// signature "Bon pour accord" — utilisé sur les devis.
export function blocConditionsEtSignature(doc, y, { bullets, avecSignature = true, lang = 'fr' }) {
  const t = L[lang]
  let yy = y
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text(t.conditions, MARGIN_L, yy); yy += 6
  doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  for (const b of bullets) {
    const wrapped = doc.splitTextToSize('• ' + b, MARGIN_R - MARGIN_L)
    doc.text(wrapped, MARGIN_L, yy)
    yy += 4.5 * wrapped.length
  }
  yy += 6

  if (avecSignature) {
    doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text(t.bonPourAccord, MARGIN_L, yy); yy += 5
    doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    doc.text(t.dateSignature, MARGIN_L, yy)
    yy += 4
  }
  return yy
}

// Bloc "Coordonnées bancaires" (banque / IBAN / BIC) — utilisé sur la
// facture client pour que le client ait directement de quoi payer par
// virement, sans avoir à redemander le RIB séparément. Cadre à coins nets,
// pas de remplissage — juste un filet fin, comme le reste du document.
export function blocCoordonneesBancaires(doc, y, { lang = 'fr' } = {}) {
  const t = L[lang]
  const boxH = 24
  if (y + boxH > 275) { doc.addPage(); y = 20 }
  doc.setDrawColor(...LINE); doc.setLineWidth(0.2)
  doc.rect(MARGIN_L, y, MARGIN_R - MARGIN_L, boxH)
  let yy = y + 7
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
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
    doc.text(t.page(i, pageCount), MARGIN_R, 291, { align: 'right' })
  }
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
