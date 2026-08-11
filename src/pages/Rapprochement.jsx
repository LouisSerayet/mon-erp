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
  const [suggestionsDep, setSuggestionsDep] = useState([])
  const [historique, setHistorique] = useState([])
  const [busy, setBusy] = useState(null) // clé "table:factureId:transactionId" en cours de confirmation

  useEffect(() => { lancerRapprochement(); chargerHistorique() }, [])

  // Historique de tout ce qui a déjà été rapproché avec Qonto (auto ou
  // confirmé manuellement), tous statuts confondus — sert de trace après
  // qu'une facture soit passée "Payée" et ait donc disparu des sections
  // "à confirmer" ci-dessus.
  async function chargerHistorique() {
    const [{ data: hCli }, { data: hFrs }, { data: hDep }] = await Promise.all([
      supabase.from('factures_cli')
        .select('id, numero, montant_ht, qonto_transaction_id, qonto_matched_at, qonto_match_confiance, projets(nom, clients(nom))')
        .not('qonto_transaction_id', 'is', null).is('deleted_at', null),
      supabase.from('factures_frs')
        .select('id, numero, montant_ht, qonto_transaction_id, qonto_matched_at, qonto_match_confiance, projets(nom), fournisseurs(nom)')
        .not('qonto_transaction_id', 'is', null).is('deleted_at', null),
      // Dépenses générales — peut échouer si sql/depenses_generales_migration.sql
      // n'a pas encore été exécuté, `hDep` reste alors undefined (géré par `|| []`).
      supabase.from('depenses_generales')
        .select('id, libelle, categorie, montant_ht, qonto_transaction_id, qonto_matched_at, qonto_match_confiance, fournisseurs(nom)')
        .not('qonto_transaction_id', 'is', null).is('deleted_at', null),
    ])
    const combine = [
      ...(hCli || []).map(f => ({ table: 'factures_cli', facture: f, tiers: f.projets?.clients?.nom, couleur: '#059669' })),
      ...(hFrs || []).map(f => ({ table: 'factures_frs', facture: f, tiers: f.fournisseurs?.nom, couleur: '#EA580C' })),
      ...(hDep || []).map(d => ({ table: 'depenses_generales', facture: d, tiers: d.fournisseurs?.nom || d.categorie, couleur: '#7C3AED' })),
    ].sort((a, b) => new Date(b.facture.qonto_matched_at || 0) - new Date(a.facture.qonto_matched_at || 0))
    setHistorique(combine)
  }

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

      // 2. Factures/dépenses ouvertes (pas encore payées), avec contexte
      // projet/tiers. La requête depenses_generales peut échouer si
      // sql/depenses_generales_migration.sql n'a pas encore été exécuté —
      // dans ce cas `dep` reste undefined, géré par le `|| []` plus bas.
      const [{ data: fcli, error: fcliErr }, { data: ffrs, error: ffrsErr }, { data: dep }] = await Promise.all([
        supabase.from('factures_cli')
          .select('id, numero, montant_ht, statut, date_facture, projet_id, projets(nom, clients(nom))')
          .neq('statut', 'Payée').is('deleted_at', null),
        supabase.from('factures_frs')
          .select('id, numero, montant_ht, statut, date_facture, projet_id, fournisseur_id, projets(nom), fournisseurs(nom)')
          .neq('statut', 'Payée').is('deleted_at', null),
        supabase.from('depenses_generales')
          .select('id, libelle, categorie, numero, montant_ht, statut, date_facture, fournisseurs(nom)')
          .neq('statut', 'Payée').is('deleted_at', null),
      ])
      if (fcliErr) throw fcliErr
      if (ffrsErr) throw ffrsErr

      // 3. Transactions déjà liées à une facture (payée précédemment) — à ne
      // jamais reproposer sur une autre facture.
      // Important : on ignore les lignes supprimées (deleted_at) — sinon une
      // facture envoyée à la Corbeille garde sa transaction "réservée" pour
      // toujours et bloque tout rapprochement futur sur cette transaction.
      const [{ data: liensCli }, { data: liensFrs }, { data: liensDep }] = await Promise.all([
        supabase.from('factures_cli').select('qonto_transaction_id').not('qonto_transaction_id', 'is', null).is('deleted_at', null),
        supabase.from('factures_frs').select('qonto_transaction_id').not('qonto_transaction_id', 'is', null).is('deleted_at', null),
        supabase.from('depenses_generales').select('qonto_transaction_id').not('qonto_transaction_id', 'is', null).is('deleted_at', null),
      ])
      const exclues = new Set([
        ...(liensCli || []).map(l => l.qonto_transaction_id),
        ...(liensFrs || []).map(l => l.qonto_transaction_id),
        ...(liensDep || []).map(l => l.qonto_transaction_id),
      ])

      // 4. Rapprochement — clients (encaissements, side "credit"),
      // fournisseurs et dépenses générales (paiements sortants, side "debit")
      const resultatsCli = rapprocherFactures(fcli || [], transactions, 'credit', exclues)
      const resultatsFrs = rapprocherFactures(ffrs || [], transactions, 'debit', exclues)
      const resultatsDep = rapprocherFactures(dep || [], transactions, 'debit', exclues)

      // 5. Application automatique des correspondances exactes
      const exactesCli = resultatsCli.filter(r => r.confiance === 'exact')
      const exactesFrs = resultatsFrs.filter(r => r.confiance === 'exact')
      const exactesDep = resultatsDep.filter(r => r.confiance === 'exact')
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
      for (const match of exactesDep) {
        const { error: err } = await appliquerRapprochement(supabase, 'depenses_generales', match)
        err ? echecs++ : appliques++
      }
      setDernierRapport({ appliques, echecs })

      // 6. Suggestions à valider (montant seul, sans numéro trouvé) — on
      // exclut les factures déjà réglées automatiquement à l'étape 5.
      const idsAppliquesCli = new Set(exactesCli.map(r => r.facture.id))
      const idsAppliquesFrs = new Set(exactesFrs.map(r => r.facture.id))
      const idsAppliquesDep = new Set(exactesDep.map(r => r.facture.id))
      setSuggestionsCli(resultatsCli.filter(r => r.confiance === 'montant' && !idsAppliquesCli.has(r.facture.id)))
      setSuggestionsFrs(resultatsFrs.filter(r => r.confiance === 'montant' && !idsAppliquesFrs.has(r.facture.id)))
      setSuggestionsDep(resultatsDep.filter(r => r.confiance === 'montant' && !idsAppliquesDep.has(r.facture.id)))
      if (appliques > 0) chargerHistorique()
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
      chargerHistorique()
    } else if (table === 'factures_frs') {
      setSuggestionsFrs(prev => prev.filter(r => r.facture.id !== match.facture.id))
      chargerHistorique()
    } else {
      setSuggestionsDep(prev => prev.filter(r => r.facture.id !== match.facture.id))
      chargerHistorique()
    }
    setBusy(null)
  }

  function CarteSuggestion({ r, table, couleur }) {
    const cle = table + ':' + r.facture.id + ':' + r.transaction.transaction_id
    const tiers = table === 'factures_cli' ? r.facture.projets?.clients?.nom
      : table === 'depenses_generales' ? (r.facture.fournisseurs?.nom || r.facture.categorie)
      : r.facture.fournisseurs?.nom
    return (
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 220 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.facture.numero || r.facture.libelle}</div>
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

          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
              Dépenses générales à confirmer <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({suggestionsDep.length})</span>
            </div>
            {suggestionsDep.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 10, border: '1px dashed #E5E7EB', fontSize: 13 }}>
                Aucune suggestion en attente.
              </div>
            ) : suggestionsDep.map(r => <CarteSuggestion key={r.facture.id + r.transaction.transaction_id} r={r} table="depenses_generales" couleur="#7C3AED" />)}
          </div>

          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
              Historique des rapprochements <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({historique.length})</span>
            </div>
            {historique.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 10, border: '1px dashed #E5E7EB', fontSize: 13 }}>
                Aucune facture rapprochée avec Qonto pour l'instant.
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                    {['N°', 'Tiers / Projet', 'Montant HT', 'Confiance', 'Rapproché le'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Montant HT' ? 'right' : 'left', color: '#6B7280', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {historique.map((h, i) => (
                      <tr key={h.table + h.facture.id} style={{ borderBottom: i === historique.length - 1 ? 'none' : '1px solid #F3F4F6' }}>
                        <td style={{ padding: '9px 14px', fontWeight: 600 }}>{h.facture.numero || h.facture.libelle}</td>
                        <td style={{ padding: '9px 14px', color: '#6B7280' }}>
                          {h.tiers || '—'}{h.facture.projets?.nom ? ' · ' + h.facture.projets.nom : ''}
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: h.couleur }}>{fmt(h.facture.montant_ht)}</td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: h.facture.qonto_match_confiance === 'exact' ? '#EFF6FF' : '#FFFBEB', color: h.facture.qonto_match_confiance === 'exact' ? '#2563EB' : '#B45309' }}>
                            {h.facture.qonto_match_confiance === 'exact' ? '🔗 Auto (n° + montant)' : '✓ Confirmé (montant)'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 14px', color: '#9CA3AF' }}>{fmtDate(h.facture.qonto_matched_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
