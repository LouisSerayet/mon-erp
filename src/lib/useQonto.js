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

export async function getTransactions(account, perPage = 25) {
  // Récupérer le slug depuis l'objet compte complet
  const slug = account?.slug || account
  
  // Essayer tous les formats possibles de l'API Qonto
  const attempts = [
    `transactions?bank_account_slug=${slug}&per_page=${perPage}`,
    `transactions?iban=${account?.iban}&per_page=${perPage}`,
    `transactions?per_page=${perPage}`,
  ]

  for (const endpoint of attempts) {
    try {
      const data = await qontoFetch(endpoint)
      if (data.transactions && data.transactions.length > 0) {
        return data.transactions
      }
      if (data.transactions) return data.transactions
    } catch {
      continue
    }
  }
  return []
}
