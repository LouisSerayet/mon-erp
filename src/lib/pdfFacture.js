// Génération du PDF d'une facture client — extrait de ProjetDetail.jsx
// (où il servait à un seul projet à la fois, `projet` venant de l'état du
// composant) pour être réutilisable ailleurs, notamment l'export PDF
// groupé multi-projets de la page Exports (voir exporterFacturesPDF dans
// Exports.jsx). Même charte graphique que le devis (voir pdfStyle.js),
// mais sans les CGV en annexe et avec les coordonnées bancaires pour le
// règlement — deux différences volontaires propres à la facture. Pas de
// bloc signature non plus (une facture n'a pas besoin d'un "bon pour
// accord").
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  fmt as fmtEUR, enTeteDocument, bandeauHaut, blocMetaEtDestinataire, blocTotaux,
  blocConditionsEtSignature, blocCoordonneesBancaires, piedDePage, lignesAdresse,
  TABLE_STYLE, TABLE_HEAD_STYLE, TABLE_ALT_ROW_STYLE, MUTED,
} from './pdfStyle'
import { L, fmtDate as fmtDatePdf } from './pdfI18n'

// `facture` : ligne factures_cli. `projet` : le projet auquel elle est
// rattachée, avec projet.clients déjà chargé (voir l'appelant) — c'est
// tout ce dont ce PDF a besoin, il ne touche jamais la base lui-même.
// `contact` (optionnel) : { nom, tel, email } du créateur du projet, déjà
// résolu par l'appelant (voir lib/contacts.js) — à défaut, ENTREPRISE.contact.
export function genererFactureCliPDF(facture, projet, lang = 'fr', contact) {
  const t = L[lang]
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const totalHt = facture.montant_ht || 0
  const tauxTva = Number(projet?.taux_tva ?? 20)
  const totalTva = totalHt * (tauxTva / 100)
  const totalTtc = totalHt + totalTva
  const estAvoir = facture.type_facture === 'avoir'
  const description = estAvoir
    // Avoir : mentionne la facture corrigée quand elle est renseignée (voir
    // sql/avoir_facture_cli_migration.sql, facture_origine_numero) plutôt
    // que la description générique "Prestations — ...".
    ? (facture.facture_origine_numero ? t.avoirSurFacture(facture.facture_origine_numero) : t.avoirLabel) + ' — ' + (projet?.nom || '')
    : t.prestations + (projet?.nom || '')
  // Facture d'acompte : titre distinct ("FACTURE D'ACOMPTE") et, si réglée
  // comptant, conditions de paiement sans mention de délai de 30 jours —
  // voir sql/facture_cli_type_migration.sql et lib/pdfI18n.js. Avoir : titre
  // "AVOIR" et conditions dédiées (pas de délai de paiement puisque ce n'est
  // pas une somme due par le client) — voir sql/avoir_facture_cli_migration.sql.
  const titreDoc = estAvoir ? t.titreAvoir : facture.type_facture === 'acompte' ? t.titreFactureAcompte : t.titreFacture
  const bullets = estAvoir ? t.bulletsAvoir(tauxTva) : facture.paiement_comptant ? t.bulletsFactureComptant(tauxTva) : t.bulletsFacture(tauxTva)

  // Libellé de facturation — texte libre sur la fiche client (voir
  // sql/libelle_facturation_migration.sql), pour les clients "grand
  // compte" qui imposent une entité/adresse de facturation précise (et
  // parfois un code de routage e-facturation) différente de leur fiche
  // standard. Quand rempli, remplace ENTIÈREMENT le nom + l'adresse
  // habituels — ligne par ligne, tel que saisi sur la fiche client.
  const lignesDestinataire = projet?.clients?.libelle_facturation
    ? projet.clients.libelle_facturation.split('\n').map(l => l.trim()).filter(Boolean)
    : [projet?.clients?.nom, ...lignesAdresse(projet?.clients, lang)]

  let y = enTeteDocument(doc, { titre: titreDoc, lang, contact })
  y = blocMetaEtDestinataire(doc, y, {
    metaGauche: [
      [estAvoir ? t.numeroAvoir : t.numeroFacture, facture.numero || '—'],
      [t.date, facture.date_facture ? fmtDatePdf(facture.date_facture, lang) : fmtDatePdf(new Date(), lang)],
      [t.echeance, facture.date_echeance ? fmtDatePdf(facture.date_echeance, lang) : '—'],
      // Réf. bon de commande client — un seul numéro par projet (voir
      // onglet Infos), repris automatiquement quand il est renseigné.
      ...(projet?.numero_bon_commande_client ? [[t.referenceBonCommandeClient, projet.numero_bon_commande_client]] : []),
    ],
    destinataire: { titre: t.client, lignes: lignesDestinataire },
  })

  // Adresse d'intervention — même champ et même présentation discrète que
  // sur le devis/bon de commande (voir generateDevisPDF dans
  // ProjetDetail.jsx), absente jusqu'ici de la facture.
  if (projet?.adresse_chantier) {
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED)
    const adresseLignes = doc.splitTextToSize(t.adresseChantier + projet.adresse_chantier, 182)
    doc.text(adresseLignes, 14, y); y += adresseLignes.length * 4.5 + 1.5
  }

  autoTable(doc, {
    startY: y,
    head: [[t.colDesignation, t.colMontantHt]],
    body: [[description, fmtEUR(totalHt, lang)]],
    styles: TABLE_STYLE,
    headStyles: TABLE_HEAD_STYLE,
    alternateRowStyles: TABLE_ALT_ROW_STYLE,
    // Helvetica plutôt que Courier : Courier n'a pas le glyphe « € » (voir
    // pdfStyle.js), et cette cellule ne contient qu'une seule ligne — pas
    // besoin d'alignement en colonnes de chiffres façon tableau.
    columnStyles: { 1: { halign: 'right', cellWidth: 40, fontStyle: 'bold', font: 'helvetica' } },
    margin: { left: 14, right: 14 },
  })

  y = doc.lastAutoTable.finalY + 10
  if (y > 220) { doc.addPage(); bandeauHaut(doc); y = 20 }
  y = blocTotaux(doc, y, { totalHt, totalTva, totalTtc, tauxTva, lang })
  if (y > 250) { doc.addPage(); bandeauHaut(doc); y = 20 }
  y = blocConditionsEtSignature(doc, y, { bullets, avecSignature: false, lang })
  if (y > 260) { doc.addPage(); bandeauHaut(doc); y = 20 }
  blocCoordonneesBancaires(doc, y, { lang })

  piedDePage(doc, facture.numero || projet?.nom || '', lang)
  return doc
}
