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

// NB : per_page=100 (max habituel côté Qonto) — au-delà, il faudrait une
// vraie pagination (page suivante) qui n'est pas encore branchée côté UI
// (Tresorerie.jsx n'affiche que ce premier lot de transactions).
export async function getTransactions(account, perPage = 100) {
  // Récupérer le slug depuis l'objet compte complet
  const slug = account?.slug || account

  // Essayer tous les formats possibles de l'API Qonto
  const attempts = [
    `transactions?bank_account_slug=${slug}&per_page=${perPage}`,
    `transactions?iban=${account?.iban}&per_page=${perPage}`,
    `transactions?per_page=${perPage}`,
  ]

  let derniereErreur = null
  for (const endpoint of attempts) {
    try {
      const data = await qontoFetch(endpoint)
      if (data.transactions) return data.transactions
    } catch (err) {
      derniereErreur = err
    }
  }
  // Si aucun des 3 formats n'a fonctionné, c'est probablement une vraie
  // erreur (identifiants invalides, API en panne...) et pas un compte vide
  // — on la remonte pour que l'appelant puisse l'afficher, plutôt que de
  // rendre un tableau vide indiscernable d'un compte réellement sans
  // transaction.
  if (derniereErreur) throw derniereErreur
  return []
}
