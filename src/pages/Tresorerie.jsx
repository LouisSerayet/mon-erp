import { useEffect, useState } from 'react'
import { getBankAccounts, getTransactions } from '../lib/useQonto'

export default function Tresorerie() {
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingTx, setLoadingTx] = useState(false)
  const [error, setError] = useState('')
  const [selectedAccount, setSelectedAccount] = useState(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    setError('')
    try {
      const accs = await getBankAccounts()
      setAccounts(accs)
      if (accs.length > 0) {
        setSelectedAccount(accs[0])
        await loadTx(accs[0])
      }
    } catch (err) {
      setError('Impossible de charger les données Qonto : ' + err.message)
    }
    setLoading(false)
  }

  async function loadTx(account) {
    setLoadingTx(true)
    try {
      // Passer tout l'objet compte pour avoir slug + iban disponibles
      const txs = await getTransactions(account)
      setTransactions(txs)
    } catch (err) {
      console.error('Transactions error:', err)
      setTransactions([])
    }
    setLoadingTx(false)
  }

  async function selectAccount(account) {
    setSelectedAccount(account)
    setTransactions([])
    await loadTx(account)
  }

  const fmt = n => n !== undefined && n !== null
    ? (Number(n) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
    : '—'

  const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—'
  const totalSolde = accounts.reduce((s, a) => s + (a.balance_cents || 0), 0)

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
      Chargement des données Qonto...
    </div>
  )

  return (
    <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Trésorerie</h2>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>Données en temps réel via Qonto</div>
        </div>
        <button onClick={fetchData}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
          🔄 Actualiser
        </button>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '12px 16px', borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Solde total */}
      <div style={{ background: '#1E293B', borderRadius: 12, padding: '20px 24px', marginBottom: 20, color: '#fff' }}>
        <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Solde total</div>
        <div style={{ fontSize: 32, fontWeight: 800 }}>{fmt(totalSolde)}</div>
        <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{accounts.length} compte(s) Qonto</div>
      </div>

      {/* Comptes */}
      {accounts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          {accounts.map(acc => (
            <div key={acc.slug} onClick={() => selectAccount(acc)}
              style={{ background: selectedAccount?.slug === acc.slug ? '#EFF6FF' : '#fff', border: '1px solid ' + (selectedAccount?.slug === acc.slug ? '#2563EB' : '#E5E7EB'), borderRadius: 10, padding: '14px 16px', cursor: 'pointer' }}>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>{acc.name || 'Compte principal'}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: selectedAccount?.slug === acc.slug ? '#2563EB' : '#111827' }}>{fmt(acc.balance_cents)}</div>
              <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4, fontFamily: 'monospace' }}>{acc.iban}</div>
            </div>
          ))}
        </div>
      )}

      {/* Transactions */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', fontSize: 14, fontWeight: 600 }}>
          Dernières transactions {selectedAccount ? `— ${selectedAccount.name || 'Compte principal'}` : ''}
        </div>
        {loadingTx ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>⏳ Chargement...</div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
            Aucune transaction trouvée
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                {['Date', 'Libellé', 'Contrepartie', 'Montant'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Montant' ? 'right' : 'left', color: '#6B7280', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, i) => {
                const montant = (tx.amount_cents || 0) / 100
                const isCredit = tx.side === 'credit'
                return (
                  <tr key={tx.transaction_id || i} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '10px 16px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{fmtDate(tx.settled_at || tx.emitted_at)}</td>
                    <td style={{ padding: '10px 16px', color: '#374151', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.label || tx.reference || '—'}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6B7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.counterparty_name || '—'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: isCredit ? '#059669' : '#DC2626', whiteSpace: 'nowrap' }}>
                      {isCredit ? '+' : '-'}{Math.abs(montant).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
