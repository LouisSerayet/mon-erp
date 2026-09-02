import { useEffect, useRef, useState } from 'react'
import { getBankAccounts, getTransactions } from '../lib/useQonto'
import { useIsMobile } from '../lib/useIsMobile'
import { fmtDateFr as fmtDate } from '../lib/calculs'
import { colors, fonts, eyebrow, sectionTitle, quietLink } from '../lib/theme'

export default function Tresorerie() {
  const isMobile = useIsMobile()
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingTx, setLoadingTx] = useState(false)
  const [error, setError] = useState('')
  const [selectedAccount, setSelectedAccount] = useState(null)
  // Miroir synchrone de selectedAccount (le state React n'est pas encore à
  // jour au moment où une requête concurrente se résout) — permet à loadTx
  // de savoir si sa réponse est encore d'actualité avant de l'afficher.
  const selectedAccountRef = useRef(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    setError('')
    try {
      const accs = await getBankAccounts()
      setAccounts(accs)
      if (accs.length > 0) {
        // Si le compte déjà sélectionné existe toujours après le rafraîchissement,
        // on le garde sélectionné au lieu de revenir silencieusement au premier compte.
        const conserve = accs.find(a => a.slug === selectedAccountRef.current?.slug) || accs[0]
        setSelectedAccount(conserve)
        selectedAccountRef.current = conserve
        await loadTx(conserve)
      }
    } catch (err) {
      setError('Impossible de charger les données Qonto : ' + err.message)
    }
    setLoading(false)
  }

  async function loadTx(account) {
    setLoadingTx(true)
    setError('')
    try {
      // Passer tout l'objet compte pour avoir slug + iban disponibles
      const txs = await getTransactions(account)
      // Si l'utilisateur a changé de compte pendant le chargement, on
      // ignore cette réponse devenue obsolète pour ne pas afficher les
      // transactions d'un autre compte que celui actuellement sélectionné.
      if (account?.slug !== undefined && selectedAccountRef.current?.slug !== account.slug) return
      setTransactions(txs)
    } catch (err) {
      console.error('Transactions error:', err)
      setTransactions([])
      setError('Impossible de charger les transactions : ' + err.message)
    }
    setLoadingTx(false)
  }

  async function selectAccount(account) {
    setSelectedAccount(account)
    selectedAccountRef.current = account
    setTransactions([])
    await loadTx(account)
  }

  const fmt = n => n !== undefined && n !== null
    ? (Number(n) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
    : '—'

  const totalSolde = accounts.reduce((s, a) => s + (a.balance_cents || 0), 0)

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: colors.inkFaint, fontFamily: fonts.display, fontSize: 13 }}>
      Chargement des données Qonto...
    </div>
  )

  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <p style={eyebrow}>Partenaires Particuliers</p>
          <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Trésorerie</h1>
          <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0' }}>Données en temps réel via Qonto</p>
        </div>
        <button onClick={fetchData} style={quietLink}>Actualiser</button>
      </div>

      {error && (
        <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '10px 14px', margin: '28px 0 0', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Solde total */}
      <div style={{ margin: '36px 0 32px', paddingBottom: 28, borderBottom: '1px solid ' + colors.line }}>
        <div style={eyebrow}>Solde total</div>
        <div style={{ fontFamily: fonts.mono, fontSize: 40, fontWeight: 500, margin: '10px 0 4px', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalSolde)}</div>
        <div style={{ fontSize: 12, color: colors.inkFaint }}>{accounts.length} compte(s) Qonto</div>
      </div>

      {/* Comptes */}
      {accounts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 0, marginBottom: 40, borderTop: '1px solid ' + colors.line, borderLeft: '1px solid ' + colors.line }}>
          {accounts.map(acc => {
            const actif = selectedAccount?.slug === acc.slug
            return (
              <div key={acc.slug} onClick={() => selectAccount(acc)}
                style={{ padding: '16px 18px', cursor: 'pointer', borderRight: '1px solid ' + colors.line, borderBottom: '2px solid ' + (actif ? colors.ink : 'transparent') }}>
                <div style={{ fontSize: 11, color: colors.inkFaint, marginBottom: 6 }}>{acc.name || 'Compte principal'}</div>
                <div style={{ fontFamily: fonts.mono, fontSize: 17, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: actif ? colors.ink : colors.inkMuted }}>{fmt(acc.balance_cents)}</div>
                <div style={{ fontSize: 10, color: colors.inkFaint, marginTop: 6, fontFamily: fonts.mono }}>{acc.iban}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Transactions */}
      <div>
        <h2 style={sectionTitle}>
          Dernières transactions {selectedAccount ? `— ${selectedAccount.name || 'Compte principal'}` : ''}
        </h2>
        {loadingTx ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13, borderTop: '1px solid ' + colors.line, marginTop: 12 }}>Chargement...</div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13, borderTop: '1px solid ' + colors.line, marginTop: 12 }}>
            Aucune transaction trouvée
          </div>
        ) : isMobile ? (
          // Sur mobile, un tableau à 4 colonnes ne tient pas sur un écran
          // d'iPhone (soit ça déborde, soit le texte devient illisible) —
          // on affiche plutôt une liste de cartes empilées, une transaction
          // par bloc, plus adaptée à la consultation au pouce.
          <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 12 }}>
            {transactions.map((tx, i) => {
              const montant = (tx.amount_cents || 0) / 100
              const isCredit = tx.side === 'credit'
              return (
                <div key={tx.transaction_id || i}
                  style={{ padding: '12px 0', borderBottom: '1px solid ' + colors.line, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.label || tx.reference || '—'}
                    </div>
                    <div style={{ fontSize: 12, color: colors.inkFaint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fmtDate(tx.settled_at || tx.emitted_at)}{tx.counterparty_name ? ' · ' + tx.counterparty_name : ''}
                    </div>
                  </div>
                  <div style={{ fontFamily: fonts.mono, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: isCredit ? colors.success : colors.ink, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {isCredit ? '+' : '-'}{Math.abs(montant).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 12 }}>
            <thead>
              <tr>
                {['Date', 'Libellé', 'Contrepartie', 'Montant'].map(h => (
                  <th key={h} style={{ padding: '0 16px 10px 0', textAlign: h === 'Montant' ? 'right' : 'left', color: colors.inkFaint, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid ' + colors.line }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, i) => {
                const montant = (tx.amount_cents || 0) / 100
                const isCredit = tx.side === 'credit'
                return (
                  <tr key={tx.transaction_id || i} style={{ borderBottom: '1px solid ' + colors.line }}>
                    <td style={{ padding: '11px 16px 11px 0', color: colors.inkMuted, whiteSpace: 'nowrap' }}>{fmtDate(tx.settled_at || tx.emitted_at)}</td>
                    <td style={{ padding: '11px 16px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.label || tx.reference || '—'}
                    </td>
                    <td style={{ padding: '11px 16px', color: colors.inkMuted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.counterparty_name || '—'}
                    </td>
                    <td style={{ padding: '11px 0 11px 16px', textAlign: 'right', fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums', color: isCredit ? colors.success : colors.ink, whiteSpace: 'nowrap' }}>
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
