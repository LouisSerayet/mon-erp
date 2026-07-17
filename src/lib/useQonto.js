// Hook pour appeler l'API Qonto via le proxy Vercel
export async function qontoFetch(endpoint) {
  const res = await fetch(`/api/qonto?endpoint=${encodeURIComponent(endpoint)}`)
  if (!res.ok) throw new Error('Erreur Qonto : ' + res.status)
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

export async function getTransactions(ibanSlug, perPage = 25) {
  const data = await qontoFetch(`transactions?iban=${ibanSlug}&per_page=${perPage}&sort_by=settled_at:desc&status=completed`)
  return data.transactions || []
}
