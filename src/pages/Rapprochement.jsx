import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getBankAccounts, getTransactionsPourRapprochement } from '../lib/useQonto'
import { rapprocherFactures, appliquerRapprochement } from '../lib/rapprochement'
import { useIsMobile } from '../lib/useIsMobile'

const fmt = n => n !== undefined && n !== null
  ? Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  : '—'
const fmtTx = cents => cents !== undefined && cents !== null
  ? (Number(cents) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  : '—'
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—'

export default function Rapprochement() {
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dernierRapport, setDernierRapport] = useState(null) // { appliques, echecs }
  const [suggestionsCli, setSuggestionsCli] = useState([])
  const [suggestionsFrs, setSuggestionsFrs] = useState([])
  const [busy, setBusy] = useState(null) // clé "table:factureId:transactionId" en cours de confirmation

  useEffect(() => { lancerRapprochement() }, [])

  async function lancerRapprochement() {
    setLoading(true)
    setError('')
    setDernierRapport(null)
    try {
      // 1. Transactions Qonto — tous les comptes, plusieurs pages pour
      // couvrir un historique de paiement suffisant (pas seulement les 100
      // dernières transactions).
      const comptes = await getBankAccounts()
      const lots = await Promise.all(comptes.map(c => getTransactionsPourRapprochement(c)))
      const transactions = lots.flat()

      // 2. Factures ouvertes (pas encore payées), avec contexte projet/tiers
      const [{ data: fcli, error: fcliErr }, { data: ffrs, error: ffrsErr }] = await Promise.all([
        supabase.from('factures_cli')
          .select('id, numero, montant_ht, statut, date_facture, projet_id, projets(nom, clients(nom))')
          .neq('statut', 'Payée').is('deleted_at', null),
        supabase.from('factures_frs')
          .select('id, numero, montant_ht, statut, date_facture, projet_id, fournisseur_id, projets(nom), fournisseurs(nom)')
          .neq('statut', 'Payée').is('deleted_at', null),
      ])
      if (fcliErr) throw fcliErr
      if (ffrsErr) throw ffrsErr

      // 3. Transactions déjà liées à une facture (payée précédemment) — à ne
      // jamais reproposer sur une autre facture.
      const [{ data: liensCli }, { data: liensFrs }] = await Promise.all([
        supabase.from('factures_cli').select('qonto_transaction_id').not('qonto_transaction_id', 'is', null),
        supabase.from('factures_frs').select('qonto_transaction_id').not('qonto_transaction_id', 'is', null),
      ])
      const exclues = new Set([
        ...(liensCli || []).map(l => l.qonto_transaction_id),
        ...(liensFrs || []).map(l => l.qonto_transaction_id),
      ])

      // 4. Rapprochement — clients (encaissements, side "credit") et
      // fournisseurs (paiements sortants, side "debit")
      const resultatsCli = rapprocherFactures(fcli || [], transactions, 'credit', exclues)
      const resultatsFrs = rapprocherFactures(ffrs || [], transactions, 'debit', exclues)

      // 5. Application automatique des correspondances exactes
      const exactesCli = resultatsCli.filter(r => r.confiance === 'exact')
      const exactesFrs = resultatsFrs.filter(r => r.confiance === 'exact')
      let appliques = 0
      let echecs = 0
      for (const match of exactesCli) {
        const { error: err } = await appliquerRapprochement(supabase, 'factures_cli', match)
        err ? echecs++ : appliques++
      }
      for (const match of exactesFrs) {
        const { error: err } = await appliquerRapprochement(supabase, 'factures_frs', match)
        err ? echecs++ : appliques++
      }
      setDernierRapport({ appliques, echecs })

      // 6. Suggestions à valider (montant seul, sans numéro trouvé) — on
      // exclut les factures déjà réglées automatiquement à l'étape 5.
      const idsAppliquesCli = new Set(exactesCli.map(r => r.facture.id))
      const idsAppliquesFrs = new Set(exactesFrs.map(r => r.facture.id))
      setSuggestionsCli(resultatsCli.filter(r => r.confiance === 'montant' && !idsAppliquesCli.has(r.facture.id)))
      setSuggestionsFrs(resultatsFrs.filter(r => r.confiance === 'montant' && !idsAppliquesFrs.has(r.facture.id)))
    } catch (err) {
      setError('Impossible de lancer le rapprochement : ' + err.message)
    }
    setLoading(false)
  }

  async function confirmer(table, match) {
    const cle = table + ':' + match.facture.id + ':' + match.transaction.transaction_id
    setBusy(cle)
    const { error: err } = await appliquerRapprochement(supabase, table, match)
    if (err) {
      alert('Erreur : ' + err.message)
    } else if (table === 'factures_cli') {
      setSuggestionsCli(prev => prev.filter(r => r.facture.id !== match.facture.id))
    } else {
      setSuggestionsFrs(prev => prev.filter(r => r.facture.id !== match.facture.id))
    }
    setBusy(null)
  }

  function CarteSuggestion({ r, table, couleur }) {
    const cle = table + ':' + r.facture.id + ':' + r.transaction.transaction_id
    const tiers = table === 'factures_cli' ? r.facture.projets?.clients?.nom : r.facture.fournisseurs?.nom
    return (
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 220 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.facture.numero}</div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
            {tiers || '—'}{r.facture.projets?.nom ? ' · ' + r.facture.projets.nom : ''}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: couleur, marginTop: 4 }}>{fmt(r.facture.montant_ht)} HT</div>
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', flex: 1, minWidth: 200 }}>
          <div style={{ marginBottom: 2 }}>↔ {r.transaction.label || r.transaction.reference || 'Transaction Qonto'}</div>
          <div>{fmtDate(r.transaction.settled_at || r.transaction.emitted_at)} · {fmtTx(r.transaction.amount_cents)} ({r.base})</div>
        </div>
        <button onClick={() => confirmer(table, r)} disabled={busy === cle}
          style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: couleur, color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13, flexShrink: 0 }}>
          {busy === cle ? '⏳' : '✓ Marquer payée'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? 14 : 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Rapprochement</h2>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>Factures ouvertes rapprochées des transactions Qonto</div>
        </div>
        <button onClick={lancerRapprochement} disabled={loading}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
          {loading ? '⏳ Rapprochement...' : '🔄 Relancer'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '12px 16px', borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {dernierRapport && (
        <div style={{ background: dernierRapport.appliques > 0 ? '#F0FDF4' : '#F8FAFC', color: dernierRapport.appliques > 0 ? '#059669' : '#6B7280', padding: '12px 16px', borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
          {dernierRapport.appliques > 0
            ? `✓ ${dernierRapport.appliques} facture(s) marquée(s) payée(s) automatiquement (numéro de facture retrouvé dans une transaction Qonto correspondante).`
            : 'Aucune correspondance exacte trouvée automatiquement cette fois-ci.'}
          {dernierRapport.echecs > 0 ? ` (${dernierRapport.echecs} échec(s) d'enregistrement — la migration sql/qonto_migration.sql a-t-elle été exécutée dans Supabase ?)` : ''}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>⏳ Chargement des transactions Qonto et des factures ouvertes...</div>
      ) : (
        <>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
              Factures clients à confirmer <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({suggestionsCli.length})</span>
            </div>
            {suggestionsCli.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 10, border: '1px dashed #E5E7EB', fontSize: 13 }}>
                Aucune suggestion en attente.
              </div>
            ) : suggestionsCli.map(r => <CarteSuggestion key={r.facture.id + r.transaction.transaction_id} r={r} table="factures_cli" couleur="#059669" />)}
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
              Factures fournisseurs à confirmer <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({suggestionsFrs.length})</span>
            </div>
            {suggestionsFrs.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 10, border: '1px dashed #E5E7EB', fontSize: 13 }}>
                Aucune suggestion en attente.
              </div>
            ) : suggestionsFrs.map(r => <CarteSuggestion key={r.facture.id + r.transaction.transaction_id} r={r} table="factures_frs" couleur="#EA580C" />)}
          </div>
        </>
      )}
    </div>
  )
}
