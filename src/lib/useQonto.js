import { supabase } from './supabase'

// Le proxy /api/qonto exige désormais d'être connecté à l'ERP (voir
// api/_auth.js) — on transmet le jeton de la session Supabase en cours.
async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function qontoFetch(endpoint) {
  const res = await fetch(`/api/qonto?endpoint=${encodeURIComponent(endpoint)}`, {
    headers: await authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    let data = null
    try { data = JSON.parse(text) } catch { /* réponse non-JSON, on gardera le texte brut */ }
    const message = data?.details
      ? (typeof data.details === 'string' ? data.details : JSON.stringify(data.details))
      : (data?.error || text)
    throw new Error(message)
  }
  return res.json()
}

export async function getOrganization() {
  const data = await qontoFetch('organizations/me')
  return data.organization
}

export async function getBankAccounts() {
  const org = await getOrganization()
  return org.bank_accounts || []
}

// Essaie les différents formats d'endpoint connus de l'API Qonto (le compte
// peut être identifié par slug ou par IBAN selon les organisations) et
// renvoie la réponse brute (pas seulement .transactions) pour que l'appelant
// puisse aussi lire .meta (pagination). additionalParams : query string
// supplémentaire, ex. "&current_page=2".
async function fetchTransactionsPage(account, perPage, additionalParams = '') {
  const slug = account?.slug || account
  const attempts = [
    `transactions?bank_account_slug=${slug}&per_page=${perPage}${additionalParams}`,
    `transactions?iban=${account?.iban}&per_page=${perPage}${additionalParams}`,
    `transactions?per_page=${perPage}${additionalParams}`,
  ]

  let derniereErreur = null
  for (const endpoint of attempts) {
    try {
      const data = await qontoFetch(endpoint)
      if (data.transactions) return data
    } catch (err) {
      derniereErreur = err
    }
  }
  if (derniereErreur) throw derniereErreur
  return { transactions: [] }
}

// NB : per_page=100 (max habituel côté Qonto), une seule page — au-delà, il
// faudrait une vraie pagination (page suivante) qui n'est pas branchée côté
// UI (Tresorerie.jsx n'affiche que ce premier lot de transactions). Pour un
// historique plus large, voir getTransactionsPourRapprochement ci-dessous.
export async function getTransactions(account, perPage = 100) {
  const data = await fetchTransactionsPage(account, perPage)
  return data.transactions || []
}

// Utilisé par le rapprochement Qonto <-> factures : une facture peut être
// réglée plusieurs semaines après son émission, un seul lot de 100
// transactions récentes ne suffit pas toujours. On enchaîne quelques pages
// supplémentaires (via meta.next_page, convention Qonto) jusqu'à maxPages,
// pour couvrir un historique plus large sans requêtes illimitées.
export async function getTransactionsPourRapprochement(account, { maxPages = 5, perPage = 100 } = {}) {
  const toutes = []
  let page = 1
  while (page <= maxPages) {
    const data = await fetchTransactionsPage(account, perPage, `&current_page=${page}`)
    const lot = data.transactions || []
    toutes.push(...lot)
    const suivante = data.meta?.next_page
    if (!suivante || lot.length < perPage) break
    page = suivante
  }
  return toutes
}
