import { supabase } from './supabase'
import { envoyerEmailOutlook } from './useOutlook'
import { genererFactureCliPDF } from './pdfFacture'

// Le proxy /api/pennylane renvoie toujours { error: <message générique>,
// details: <réponse brute de Pennylane> } en cas d'échec. Le message utile
// (ex. "vat_rate is invalid") est dans "details", pas dans "error" — on le
// privilégie pour que l'utilisateur voie la vraie raison du refus plutôt
// qu'un "Erreur Pennylane" générique et inexploitable.
function pennylaneErrorMessage(data, fallback) {
  if (data && data.details) {
    if (typeof data.details === 'string') return data.details
    try { return JSON.stringify(data.details) } catch { /* ignore */ }
  }
  if (data && typeof data.error === 'string') return data.error
  return fallback
}

// Le proxy /api/pennylane exige désormais d'être connecté à l'ERP (voir
// api/_auth.js) — on transmet le jeton de la session Supabase en cours.
async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ── Bas niveau : appels au proxy /api/pennylane ────────────────
async function pennylaneCall(endpoint, { method = 'GET', body } = {}) {
  const res = await fetch('/api/pennylane', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ endpoint, method, body }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(pennylaneErrorMessage(data, 'Erreur Pennylane'))
  }
  return data
}

// ── Push ERP → Pennylane ────────────────────────────────────────
// NB : la création directe (bouton "Envoyer" déclenchant un appel API
// customer_invoices/supplier_invoices/import) a été retirée le 28/09/2026 —
// inutilisable en pratique tant que l'abonnement Pennylane n'inclut pas
// l'API (voir envoyerFacturesPennylane plus bas, le vrai circuit actif), et
// elle portait deux bugs jamais rencontrés en prod pour cette raison :
// vat_rate toujours à FR_200 (ignore projet.taux_tva) côté facture client,
// et deadline non transmis quand date_echeance est vide alors que Pennylane
// l'exige. Les fonctions ensureCustomerPennylane/ensureSupplierPennylane
// (recherche/création de la fiche client ou fournisseur côté Pennylane) et
// pushFactureClientPennylane/pushFactureFrsPennylane sont parties avec.
// Réintroduire proprement (taux de TVA réel + échéance obligatoire) le jour
// où l'abonnement inclut l'API.

// Met à jour une facture client déjà envoyée (brouillon la plupart du
// temps) — utilisé quand tu modifies une facture depuis l'ERP après
// l'avoir déjà synchronisée une première fois.
export async function updateFactureClientPennylane(facture, projetNom) {
  if (!facture.pennylane_invoice_id) throw new Error("Cette facture n'a pas encore été envoyée à Pennylane.")

  const updated = await pennylaneCall(`customer_invoices/${facture.pennylane_invoice_id}`, {
    method: 'PUT',
    body: {
      date: facture.date_facture || undefined,
      deadline: facture.date_echeance || undefined,
      external_reference: facture.numero,
      invoice_lines: [{
        label: `${projetNom} — ${facture.numero}`,
        quantity: 1,
        unit: 'unité',
        raw_currency_unit_price: String(facture.montant_ht),
        vat_rate: 'FR_200',
      }],
    },
  })

  await supabase.from('factures_cli').update({
    pennylane_statut: updated.status || facture.pennylane_statut,
    pennylane_synced_at: new Date().toISOString(),
  }).eq('id', facture.id)

  return updated
}

// Met à jour une facture fournisseur déjà importée (montant/dates —
// le PDF déjà joint n'est pas remplacé, Pennylane ne le permet pas
// via cet endpoint).
export async function updateFactureFrsPennylane(facture) {
  if (!facture.pennylane_invoice_id) throw new Error("Cette facture n'a pas encore été envoyée à Pennylane.")

  const montantHt = Number(facture.montant_ht) || 0
  const tva = Math.round(montantHt * 0.2 * 100) / 100
  const montantTtc = Math.round((montantHt + tva) * 100) / 100

  const updated = await pennylaneCall(`supplier_invoices/${facture.pennylane_invoice_id}`, {
    method: 'PUT',
    body: {
      date: facture.date_facture || undefined,
      deadline: facture.date_echeance || undefined,
      invoice_number: facture.numero,
      currency_amount_before_tax: montantHt.toFixed(2),
      currency_tax: tva.toFixed(2),
      currency_amount: montantTtc.toFixed(2),
    },
  })

  await supabase.from('factures_frs').update({
    pennylane_statut: updated.status || facture.pennylane_statut,
    pennylane_synced_at: new Date().toISOString(),
  }).eq('id', facture.id)

  return updated
}

// ── Pull Pennylane → ERP (statuts) ──────────────────────────────
export async function syncFactureClientStatut(facture) {
  if (!facture.pennylane_invoice_id) return null
  const data = await pennylaneCall(`customer_invoices/${facture.pennylane_invoice_id}`)
  const statut = data.status || (data.draft ? 'Brouillon (Pennylane)' : 'Créée (Pennylane)')
  await supabase.from('factures_cli').update({
    pennylane_statut: statut,
    pennylane_synced_at: new Date().toISOString(),
  }).eq('id', facture.id)
  return statut
}

export async function syncFactureFrsStatut(facture) {
  if (!facture.pennylane_invoice_id) return null
  const data = await pennylaneCall(`supplier_invoices/${facture.pennylane_invoice_id}`)
  const statut = data.status || 'Importée (Pennylane)'
  await supabase.from('factures_frs').update({
    pennylane_statut: statut,
    pennylane_synced_at: new Date().toISOString(),
  }).eq('id', facture.id)
  return statut
}

// ── Envoi par email vers les adresses d'import Pennylane ────────────────
// Repli tant que l'abonnement Pennylane de la société n'inclut pas l'API
// (voir la note en tête de fichier — le push direct par API a été retiré,
// verrouillé derrière le plan "Essentiel" et supérieur) : Pennylane
// fournit une adresse email dédiée par dossier pour chaque flux
// (achats/ventes — Paramètres > Transmission de factures > Adresses
// e-mail, côté Pennylane), qui importe automatiquement CHAQUE pièce
// jointe comme une facture séparée, y compris plusieurs pièces jointes
// dans un même email (confirmé par le centre d'aide Pennylane). On
// regroupe donc les factures à transmettre en lots qui restent sous une
// taille prudente par email : l'envoi simple de Microsoft Graph (voir
// api/outlook.js) a une limite totale autour de 4 Mo, pièces jointes
// encodées en base64 comprises.
const PENNYLANE_EMAIL_ACHATS = import.meta.env.VITE_PENNYLANE_EMAIL_ACHATS
const PENNYLANE_EMAIL_VENTES = import.meta.env.VITE_PENNYLANE_EMAIL_VENTES
const TAILLE_MAX_LOT_OCTETS = 2.2 * 1024 * 1024 // ~2,2 Mo réels par lot ≈ 3 Mo une fois en base64

function blobVersBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// `pieces` : [{ name, blob }] — blob = Blob/File du PDF (généré à la volée
// pour une facture client, déjà stocké pour une facture fournisseur).
// Renvoie { factures, emails } — le nombre de factures transmises et le
// nombre d'emails effectivement envoyés (plusieurs si le lot dépassait la
// taille max par email).
export async function envoyerFacturesPennylane(type, pieces) {
  const adresse = type === 'achats' ? PENNYLANE_EMAIL_ACHATS : PENNYLANE_EMAIL_VENTES
  if (!adresse) {
    throw new Error(`Adresse Pennylane (${type}) non configurée — ajoute VITE_PENNYLANE_EMAIL_${type === 'achats' ? 'ACHATS' : 'VENTES'} dans les variables d'environnement Vercel (voir Paramètres > Transmission de factures > Adresses e-mail dans Pennylane).`)
  }
  if (!pieces.length) return { factures: 0, emails: 0 }

  const lots = []
  let lotCourant = [], tailleCourante = 0
  for (const piece of pieces) {
    const taille = piece.blob?.size || 0
    if (lotCourant.length && tailleCourante + taille > TAILLE_MAX_LOT_OCTETS) {
      lots.push(lotCourant); lotCourant = []; tailleCourante = 0
    }
    lotCourant.push(piece); tailleCourante += taille
  }
  if (lotCourant.length) lots.push(lotCourant)

  for (let i = 0; i < lots.length; i++) {
    const attachments = await Promise.all(lots[i].map(async p => ({
      name: p.name, contentType: 'application/pdf', contentBytes: await blobVersBase64(p.blob),
    })))
    await envoyerEmailOutlook({
      to: adresse,
      subject: (type === 'achats' ? 'Factures fournisseurs' : 'Factures clients') + ' — import Pennylane' + (lots.length > 1 ? ` (lot ${i + 1}/${lots.length})` : ''),
      body: attachments.length + ' facture(s) jointe(s) pour import automatique dans Pennylane.',
      attachments,
    })
  }
  return { factures: pieces.length, emails: lots.length }
}

// ── Envoi automatique unitaire, déclenché par un changement de statut ──
// Utilisé par ProjetDetail.jsx dès qu'une facture client passe à
// "Envoyée" (envoi de l'email au client, ou simple changement manuel du
// statut) : régénère son PDF et l'envoie immédiatement à Pennylane, sans
// attendre un passage par l'envoi groupé de la page Exports. Idempotent —
// ne fait rien si la facture a déjà été envoyée (pennylane_synced_at déjà
// renseigné), pour ne jamais créer de doublon côté Pennylane si le statut
// est modifié plusieurs fois ou si les deux déclencheurs se chevauchent.
// L'envoi groupé de Exports.jsx reste disponible en secours (factures plus
// anciennes, échec de cet envoi automatique, etc.) — il ignore lui aussi
// les factures déjà marquées envoyées, sauf case "Inclure..." cochée.
export async function envoyerFactureCliAutoPennylane(facture, projet) {
  if (facture.pennylane_synced_at) return null
  const doc = genererFactureCliPDF(facture, projet, 'fr')
  await envoyerFacturesPennylane('ventes', [{ name: (facture.numero || facture.id) + '.pdf', blob: doc.output('blob') }])
  await supabase.from('factures_cli').update({
    pennylane_statut: 'Envoyée par email',
    pennylane_synced_at: new Date().toISOString(),
  }).eq('id', facture.id)
}

// Équivalent côté factures fournisseurs : pas de statut "Envoyée" pour
// elles (juste "À payer"/"Payée"), donc le déclencheur choisi est la
// création — le PDF est désormais obligatoire à ce moment-là (voir
// ajouterFactureFrs), donc le document est déjà complet et disponible.
// `file` est le PDF tout juste sélectionné/uploadé, pas besoin de le
// retélécharger depuis le storage. Idempotent, même garde-fou que
// envoyerFactureCliAutoPennylane.
export async function envoyerFactureFrsAutoPennylane(facture, file) {
  if (facture.pennylane_synced_at) return null
  await envoyerFacturesPennylane('achats', [{ name: (facture.numero || facture.id) + '.pdf', blob: file }])
  await supabase.from('factures_frs').update({
    pennylane_statut: 'Envoyée par email',
    pennylane_synced_at: new Date().toISOString(),
  }).eq('id', facture.id)
}
