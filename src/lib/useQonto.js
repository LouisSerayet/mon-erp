export async function qontoFetch(endpoint) {
  const res = await fetch(`/api/qonto?endpoint=${encodeURIComponent(endpoint)}`)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err)
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

export async function getTransactions(accountSlug, perPage = 25) {
  // L'API Qonto v2 utilise bank_account_slug pour filtrer les transactions
  try {
    const data = await qontoFetch(`transactions?bank_account_slug=${accountSlug}&per_page=${perPage}&sort_by=settled_at:desc`)
    return data.transactions || []
  } catch {
    try {
      // Fallback sans filtre
      const data = await qontoFetch(`transactions?per_page=${perPage}`)
      return data.transactions || []
    } catch {
      return []
    }
  }
}
