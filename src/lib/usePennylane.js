import { supabase } from './supabase'
import { envoyerEmailOutlook } from './useOutlook'

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

async function pennylaneUploadFile(file) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const res = await fetch('/api/pennylane', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ upload: { filename: file.name, base64 } }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(pennylaneErrorMessage(data, 'Erreur Pennylane (upload)'))
  }
  return data
}

// ── Clients / Fournisseurs : trouver ou créer côté Pennylane ───
export async function ensureCustomerPennylane(client) {
  if (client.pennylane_customer_id) return client.pennylane_customer_id
  if (!client.rue || !client.code_postal || !client.ville) {
    throw new Error(`Adresse incomplète pour "${client.nom}" — complète rue / code postal / ville dans la fiche client avant de synchroniser avec Pennylane.`)
  }

  const filter = encodeURIComponent(JSON.stringify([{ field: 'name', operator: 'eq', value: client.nom }]))
  const search = await pennylaneCall(`company_customers?filter=${filter}`)
  const existing = (search.items || search.customers || search.data || []).find(
    c => (c.name || '').toLowerCase() === client.nom.toLowerCase()
  )

  let customerId = existing?.id
  if (!customerId) {
    const created = await pennylaneCall('company_customers', {
      method: 'POST',
      body: {
        name: client.nom,
        emails: client.email ? [client.email] : undefined,
        billing_address: {
          street: client.rue,
          postal_code: client.code_postal,
          city: client.ville,
          country: client.pays || 'FR',
        },
      },
    })
    customerId = created.id
  }

  await supabase.from('clients').update({ pennylane_customer_id: customerId }).eq('id', client.id)
  return customerId
}

// NB : l'endpoint "company_suppliers" est supposé symétrique à
// "company_customers" (non vérifié dans la doc publique au moment de
// l'écriture) — à ajuster si Pennylane répond une erreur de schéma.
export async function ensureSupplierPennylane(fournisseur) {
  if (fournisseur.pennylane_supplier_id) return fournisseur.pennylane_supplier_id
  if (!fournisseur.rue || !fournisseur.code_postal || !fournisseur.ville) {
    throw new Error(`Adresse incomplète pour "${fournisseur.nom}" — complète rue / code postal / ville dans la fiche fournisseur avant de synchroniser avec Pennylane.`)
  }

  const filter = encodeURIComponent(JSON.stringify([{ field: 'name', operator: 'eq', value: fournisseur.nom }]))
  const search = await pennylaneCall(`company_suppliers?filter=${filter}`)
  const existing = (search.items || search.suppliers || search.data || []).find(
    s => (s.name || '').toLowerCase() === fournisseur.nom.toLowerCase()
  )

  let supplierId = existing?.id
  if (!supplierId) {
    const created = await pennylaneCall('company_suppliers', {
      method: 'POST',
      body: {
        name: fournisseur.nom,
        emails: fournisseur.email ? [fournisseur.email] : undefined,
        billing_address: {
          street: fournisseur.rue,
          postal_code: fournisseur.code_postal,
          city: fournisseur.ville,
          country: fournisseur.pays || 'FR',
        },
      },
    })
    supplierId = created.id
  }

  await supabase.from('fournisseurs').update({ pennylane_supplier_id: supplierId }).eq('id', fournisseur.id)
  return supplierId
}

// ── Push ERP → Pennylane ────────────────────────────────────────

// Crée la facture client dans Pennylane EN BROUILLON (draft: true) —
// volontaire : rien n'est finalisé/numéroté côté Pennylane sans que tu
// ailles valider toi-même (ou ton expert-comptable) dans son interface.
export async function pushFactureClientPennylane(facture, client, projetNom) {
  const customerId = await ensureCustomerPennylane(client)

  const created = await pennylaneCall('customer_invoices', {
    method: 'POST',
    body: {
      customer_id: customerId,
      date: facture.date_facture || new Date().toISOString().slice(0, 10),
      deadline: facture.date_echeance || undefined,
      external_reference: facture.numero,
      draft: true,
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
    pennylane_invoice_id: created.id,
    pennylane_statut: created.status || (created.draft ? 'Brouillon (Pennylane)' : 'Créée (Pennylane)'),
    pennylane_synced_at: new Date().toISOString(),
  }).eq('id', facture.id)

  return created
}

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

// Importe la facture fournisseur dans Pennylane (nécessite un PDF).
// Hypothèse : TVA à 20% (FR_200) faute de taux stocké dans l'ERP —
// à adapter si certaines factures ont un taux différent.
export async function pushFactureFrsPennylane(facture, fournisseur, file) {
  if (!file) throw new Error("Un PDF de la facture est requis pour l'envoyer à Pennylane.")

  const ledgerAccountId = import.meta.env.VITE_PENNYLANE_LEDGER_ACHATS_ID
  if (!ledgerAccountId) {
    throw new Error("VITE_PENNYLANE_LEDGER_ACHATS_ID n'est pas configuré — demande à ton expert-comptable quel compte comptable d'achat utiliser, puis ajoute-le dans les variables d'environnement Vercel.")
  }

  const supplierId = await ensureSupplierPennylane(fournisseur)
  const attachment = await pennylaneUploadFile(file)

  const montantHt = Number(facture.montant_ht) || 0
  const tva = Math.round(montantHt * 0.2 * 100) / 100
  const montantTtc = Math.round((montantHt + tva) * 100) / 100

  const created = await pennylaneCall('supplier_invoices/import', {
    method: 'POST',
    body: {
      file_attachment_id: attachment.id,
      supplier_id: supplierId,
      date: facture.date_facture || new Date().toISOString().slice(0, 10),
      deadline: facture.date_echeance || undefined,
      currency_amount_before_tax: montantHt.toFixed(2),
      currency_tax: tva.toFixed(2),
      currency_amount: montantTtc.toFixed(2),
      invoice_lines: [{
        ledger_account_id: Number(ledgerAccountId),
        currency_amount: montantTtc.toFixed(2),
        currency_tax: tva.toFixed(2),
        vat_rate: 'FR_200',
      }],
    },
  })

  await supabase.from('factures_frs').update({
    pennylane_invoice_id: created.id,
    pennylane_statut: created.status || 'Importée (Pennylane)',
    pennylane_synced_at: new Date().toISOString(),
  }).eq('id', facture.id)

  return created
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
// (voir pushFactureClientPennylane/pushFactureFrsPennylane ci-dessus,
// verrouillées derrière le plan "Essentiel" et supérieur) : Pennylane
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
