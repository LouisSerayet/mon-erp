import { supabase } from './supabase'

// Le proxy /api/import-factures-frs exige d'être connecté à l'ERP (voir
// api/_auth.js) — même principe que useOutlook.js / usePennylane.js.
async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Déclenche une vérification à la demande de la boîte de réception des
// factures fournisseurs (voir api/import-factures-frs.js et
// BoiteReceptionFactures.jsx) : lit les emails non lus de la boîte dédiée
// (OUTLOOK_FACTURES_MAILBOX), en tire un brouillon par facture reçue dans
// factures_frs_a_traiter. Renvoie un résumé de ce qui a été fait.
export async function verifierNouvellesFactures() {
  const res = await fetch('/api/import-factures-frs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error || 'Erreur inconnue lors de la vérification des emails.')
  }
  return data
}
