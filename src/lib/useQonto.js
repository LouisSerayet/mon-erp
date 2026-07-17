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
  // Essayer d'abord avec le slug du compte, sinon sans filtre iban
  try {
    const data = await qontoFetch(`transactions?slug=${ibanSlug}&per_page=${perPage}&sort_by=settled_at:desc&status[]=completed&status[]=pending`)
    return data.transactions || []
  } catch {
    try {
      const data = await qontoFetch(`transactions?per_page=${perPage}&sort_by=settled_at:desc`)
      return data.transactions || []
    } catch {
      return []
    }
  }
}
