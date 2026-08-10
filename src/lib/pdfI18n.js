// Dictionnaire de traduction pour les PDF générés par l'ERP (devis, factures
// clients, bons de commande + CGV). Un même document peut être généré en
// français ou en anglais au choix de l'utilisateur — voir le bouton
// « PDF FR / PDF EN » sur chaque page qui génère un PDF.
//
// Les données métier (nom du projet, descriptifs de lignes, notes...) sont
// saisies librement par l'utilisateur et ne sont jamais traduites
// automatiquement : seuls les libellés fixes de la mise en page le sont.
export const L = {
  fr: {
    titreDevis: 'DEVIS',
    titreFacture: 'FACTURE',
    titreCommande: 'BON DE COMMANDE',
    contact: 'Contact : ',
    siret: 'SIRET : ',
    numeroDevis: 'N° devis :',
    numeroFacture: 'N° facture :',
    numeroCommande: 'N° :',
    date: 'Date :',
    validite: 'Validité :',
    echeance: 'Échéance :',
    projetLabel: 'Projet :',
    jours30: '30 jours',
    client: 'Client',
    fournisseur: 'Fournisseur',
    totalHt: 'Total HT',
    totalTva: taux => `Total TVA (${taux}%)`,
    totalTtc: 'Total TTC',
    conditions: 'Conditions',
    bonPourAccord: 'Bon pour accord',
    dateSignature: 'Date, signature et cachet du client :',
    tel: 'Tél : ',
    colNumero: 'N°',
    colDesignation: 'Désignation',
    colUnite: 'Unité',
    colQte: 'Qté',
    colPuHt: 'P.U. HT',
    colPuHtEur: 'P.U. HT (€)',
    colTotalHt: 'Total HT',
    colTotalHtEur: 'Total HT (€)',
    colDescription: 'Description',
    colMontantHt: 'Montant HT',
    totalHtFoot: 'TOTAL HT',
    totalLot: numero => 'TOTAL LOT ' + numero,
    lot: numero => 'LOT ' + numero,
    lignesSansLot: 'LIGNES SANS LOT',
    objetCommande: 'Objet de la commande',
    statutLabel: 'Statut : ',
    adresseChantier: 'Adresse chantier : ',
    debutTravaux: 'Début des travaux : ',
    finPrevue: 'Fin prévisionnelle : ',
    surface: 'Surface : ',
    accesLivraison: 'Accès/Livraison : ',
    prestations: 'Prestations — ',
    page: (i, n) => `Page ${i} / ${n}`,
    cgvTitre: 'Conditions générales de vente',
    suite: ' (suite)',
    devisSuffix: '_devis.pdf',
    factureSuffix: '_facture.pdf',
    commandeSuffix: '_commande.pdf',
    bulletsDevisSimple: [
      'Devis valable 30 jours à compter de sa date d’émission.',
      'Montants exprimés en euros HT, TVA au taux de 20 % en sus.',
      'Conditions générales de vente jointes en annexe du présent devis.',
    ],
    bulletsDevisDetaille: [
      'Devis valable 30 jours à compter de sa date d’émission.',
      'Montants exprimés en euros HT, TVA au taux de 20 % en sus.',
      'Le détail par lot figure en annexe ; les conditions générales de vente sont jointes en fin de document.',
    ],
    bulletsFacture: [
      'Facture payable à réception, dans un délai de 30 jours date de facture (voir échéance ci-dessus), par virement bancaire.',
      'Montants exprimés en euros HT, TVA au taux de 20 % en sus.',
      'Tout retard de paiement entraîne l’application d’intérêts de retard et d’une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 et D441-5 du Code de commerce). Aucun escompte pour paiement anticipé.',
      'Les conditions générales de vente sont jointes en fin de document.',
    ],
  },
  en: {
    titreDevis: 'QUOTE',
    titreFacture: 'INVOICE',
    titreCommande: 'PURCHASE ORDER',
    contact: 'Contact: ',
    siret: 'SIRET: ',
    numeroDevis: 'Quote No.:',
    numeroFacture: 'Invoice No.:',
    numeroCommande: 'No.:',
    date: 'Date:',
    validite: 'Validity:',
    echeance: 'Due date:',
    projetLabel: 'Project:',
    jours30: '30 days',
    client: 'Client',
    fournisseur: 'Supplier',
    totalHt: 'Subtotal (excl. VAT)',
    totalTva: taux => `VAT (${taux}%)`,
    totalTtc: 'Total (incl. VAT)',
    conditions: 'Terms',
    bonPourAccord: 'Approved',
    dateSignature: 'Date, signature and client stamp:',
    tel: 'Phone: ',
    colNumero: 'No.',
    colDesignation: 'Description',
    colUnite: 'Unit',
    colQte: 'Qty',
    colPuHt: 'Unit price (excl. VAT)',
    colPuHtEur: 'Unit price (€, excl. VAT)',
    colTotalHt: 'Total (excl. VAT)',
    colTotalHtEur: 'Total (€, excl. VAT)',
    colDescription: 'Description',
    colMontantHt: 'Amount (excl. VAT)',
    totalHtFoot: 'TOTAL (excl. VAT)',
    totalLot: numero => 'TOTAL SECTION ' + numero,
    lot: numero => 'SECTION ' + numero,
    lignesSansLot: 'UNGROUPED ITEMS',
    objetCommande: 'Purchase order details',
    statutLabel: 'Status: ',
    adresseChantier: 'Site address: ',
    debutTravaux: 'Start of works: ',
    finPrevue: 'Expected completion: ',
    surface: 'Surface: ',
    accesLivraison: 'Access/Delivery: ',
    prestations: 'Services — ',
    page: (i, n) => `Page ${i} of ${n}`,
    cgvTitre: 'Terms and Conditions of Sale',
    suite: ' (cont’d)',
    devisSuffix: '_quote_EN.pdf',
    factureSuffix: '_invoice_EN.pdf',
    commandeSuffix: '_EN.pdf',
    bulletsDevisSimple: [
      'This quote is valid for 30 days from its issue date.',
      'Amounts are shown in euros excluding VAT; VAT applies at a rate of 20% in addition.',
      'The general terms and conditions of sale are attached as an appendix to this quote.',
    ],
    bulletsDevisDetaille: [
      'This quote is valid for 30 days from its issue date.',
      'Amounts are shown in euros excluding VAT; VAT applies at a rate of 20% in addition.',
      'The breakdown by section is provided as an appendix; the general terms and conditions of sale are attached at the end of this document.',
    ],
    bulletsFacture: [
      'This invoice is payable on receipt, within 30 days of the invoice date (see due date above), by bank transfer.',
      'Amounts are shown in euros excluding VAT; VAT applies at a rate of 20% in addition.',
      'Late payment automatically incurs late-payment interest and a flat-rate compensation of €40 for collection costs (Articles L441-10 and D441-5 of the French Commercial Code). No discount is granted for early payment.',
      'The general terms and conditions of sale are attached at the end of this document.',
    ],
  },
}

// Formatage des montants sans caractère unicode que jsPDF affiche mal (voir
// lib/pdfStyle.js) : séparateur de milliers « espace » et virgule décimale en
// français, séparateur de milliers « virgule » et point décimal en anglais.
export function fmtMontant(n, lang = 'fr') {
  if (n === null || n === undefined || isNaN(n)) return '—'
  const parts = Number(n).toFixed(2).split('.')
  if (lang === 'en') {
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.join('.')
  }
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return parts.join(',')
}

export function fmtDate(d, lang = 'fr') {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR')
}
