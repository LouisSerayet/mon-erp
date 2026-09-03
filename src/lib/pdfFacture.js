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
  fmt as fmtEUR, enTeteDocument, blocMetaEtDestinataire, blocTotaux,
  blocConditionsEtSignature, blocCoordonneesBancaires, piedDePage, lignesAdresse,
  TABLE_STYLE, TABLE_HEAD_STYLE, TABLE_ALT_ROW_STYLE,
} from './pdfStyle'
import { L, fmtDate as fmtDatePdf } from './pdfI18n'

// `facture` : ligne factures_cli. `projet` : le projet auquel elle est
// rattachée, avec projet.clients déjà chargé (voir l'appelant) — c'est
// tout ce dont ce PDF a besoin, il ne touche jamais la base lui-même.
export function genererFactureCliPDF(facture, projet, lang = 'fr') {
  const t = L[lang]
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const totalHt = facture.montant_ht || 0
  const tauxTva = Number(projet?.taux_tva ?? 20)
  const totalTva = totalHt * (tauxTva / 100)
  const totalTtc = totalHt + totalTva
  const description = t.prestations + (projet?.nom || '')
  // Facture d'acompte : titre distinct ("FACTURE D'ACOMPTE") et, si réglée
  // comptant, conditions de paiement sans mention de délai de 30 jours —
  // voir sql/facture_cli_type_migration.sql et lib/pdfI18n.js.
  const titreDoc = facture.type_facture === 'acompte' ? t.titreFactureAcompte : t.titreFacture
  const bullets = facture.paiement_comptant ? t.bulletsFactureComptant(tauxTva) : t.bulletsFacture(tauxTva)

  let y = enTeteDocument(doc, { titre: titreDoc, lang })
  y = blocMetaEtDestinataire(doc, y, {
    metaGauche: [
      [t.numeroFacture, facture.numero || '—'],
      [t.date, facture.date_facture ? fmtDatePdf(facture.date_facture, lang) : fmtDatePdf(new Date(), lang)],
      [t.echeance, facture.date_echeance ? fmtDatePdf(facture.date_echeance, lang) : '—'],
      // Réf. bon de commande client — un seul numéro par projet (voir
      // onglet Infos), repris automatiquement quand il est renseigné.
      ...(projet?.numero_bon_commande_client ? [[t.referenceBonCommandeClient, projet.numero_bon_commande_client]] : []),
    ],
    destinataire: { titre: t.client, lignes: [projet?.clients?.nom, ...lignesAdresse(projet?.clients, lang)] },
  })

  autoTable(doc, {
    startY: y,
    head: [[t.colDesignation, t.colMontantHt]],
    body: [[description, fmtEUR(totalHt, lang)]],
    styles: TABLE_STYLE,
    headStyles: TABLE_HEAD_STYLE,
    alternateRowStyles: TABLE_ALT_ROW_STYLE,
    columnStyles: { 1: { halign: 'right', cellWidth: 40, fontStyle: 'bold', font: 'courier' } },
    margin: { left: 14, right: 14 },
  })

  y = doc.lastAutoTable.finalY + 10
  if (y > 220) { doc.addPage(); y = 20 }
  y = blocTotaux(doc, y, { totalHt, totalTva, totalTtc, tauxTva, lang })
  if (y > 250) { doc.addPage(); y = 20 }
  y = blocConditionsEtSignature(doc, y, { bullets, avecSignature: false, lang })
  if (y > 260) { doc.addPage(); y = 20 }
  blocCoordonneesBancaires(doc, y, { lang })

  piedDePage(doc, facture.numero || projet?.nom || '', lang)
  return doc
}
