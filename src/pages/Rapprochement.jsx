import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getBankAccounts, getTransactionsPourRapprochement } from '../lib/useQonto'
import { rapprocherFactures, appliquerRapprochement } from '../lib/rapprochement'
import { useIsMobile } from '../lib/useIsMobile'
import { CATEGORIES } from '../lib/depenses'
import { fmtEUR as fmt, fmtDateFr as fmtDate } from '../lib/calculs'

// Nombre max de transactions non rapprochées affichées (les plus récentes
// d'abord) — au-delà, la liste serait juste noyée sous des mouvements
// anciens déjà traités par ailleurs (retraits carte, virements internes...).
const MAX_NON_RAPPROCHEES = 25

const fmtTx = cents => cents !== undefined && cents !== null
  ? (Number(cents) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  : '—'

export default function Rapprochement() {
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dernierRapport, setDernierRapport] = useState(null) // { appliques, echecs }
  const [suggestionsCli, setSuggestionsCli] = useState([])
  const [suggestionsFrs, setSuggestionsFrs] = useState([])
  const [suggestionsDep, setSuggestionsDep] = useState([])
  const [nonRapprochees, setNonRapprochees] = useState([]) // transactions Qonto sans aucune facture/dépense correspondante
  const [nbNonRapprocheesTotal, setNbNonRapprocheesTotal] = useState(0) // avant troncature à MAX_NON_RAPPROCHEES
  const [projetsListe, setProjetsListe] = useState([]) // pour le sélecteur de projet de la modale "Créer une facture client"
  const [historique, setHistorique] = useState([])
  const [busy, setBusy] = useState(null) // clé "table:factureId:transactionId" en cours de confirmation

  // Modale "Créer une dépense" à partir d'une transaction (débit) sans
  // correspondance, et modale "Créer une facture client" (crédit) — voir
  // ouvrirCreationDepense / ouvrirCreationFacture ci-dessous. Une seule des
  // deux est ouverte à la fois.
  const [modalDepense, setModalDepense] = useState(null)
  const [modalFacture, setModalFacture] = useState(null)
  const [modalBusy, setModalBusy] = useState(false)
  const [modalError, setModalError] = useState('')

  useEffect(() => { lancerRapprochement(); chargerHistorique(); chargerProjets() }, [])

  async function chargerProjets() {
    const { data } = await supabase.from('projets').select('id, nom, client_id, clients(nom)').is('deleted_at', null).neq('statut', 'Perdu').order('nom')
    setProjetsListe(data || [])
  }

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

      // 7. Transactions sans AUCUNE correspondance (ni exacte, ni suggestion
      // par montant) — typiquement un paiement/encaissement Qonto pour
      // lequel rien n'a encore été saisi dans l'ERP. On propose de créer
      // directement la dépense (débit) ou la facture client (crédit)
      // correspondante, prérempli depuis la transaction, plutôt que de
      // laisser l'utilisateur ressaisir tout ça à la main ailleurs.
      const idsUtilisees = new Set([
        ...exclues,
        ...resultatsCli.map(r => r.transaction.transaction_id),
        ...resultatsFrs.map(r => r.transaction.transaction_id),
        ...resultatsDep.map(r => r.transaction.transaction_id),
      ])
      const nonMatchees = transactions
        .filter(t => t.status !== 'declined' && (t.side === 'credit' || t.side === 'debit') && !idsUtilisees.has(t.transaction_id))
        .sort((a, b) => new Date(b.settled_at || b.emitted_at || 0) - new Date(a.settled_at || a.emitted_at || 0))
      setNbNonRapprocheesTotal(nonMatchees.length)
      setNonRapprochees(nonMatchees.slice(0, MAX_NON_RAPPROCHEES))

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

  // Une transaction Qonto est toujours en TTC (mouvement bancaire réel) —
  // on préremplit le montant HT à partir d'une TVA à 20 % par défaut
  // (hypothèse la plus courante, éditable avant validation dans la modale).
  function montantHtSuggere(tx) {
    return (Math.abs(tx.amount_cents || 0) / 100 / 1.2).toFixed(2)
  }
  function dateTransaction(tx) {
    return (tx.settled_at || tx.emitted_at || '').slice(0, 10)
  }

  function ouvrirCreationDepense(tx) {
    setModalError('')
    setModalDepense({
      transaction: tx,
      libelle: tx.label || tx.reference || 'Dépense',
      categorie: CATEGORIES[0],
      montant_ht: montantHtSuggere(tx),
      date_facture: dateTransaction(tx),
    })
  }

  function ouvrirCreationFacture(tx) {
    setModalError('')
    setModalFacture({
      transaction: tx,
      projetId: '',
      montant_ht: montantHtSuggere(tx),
      date_facture: dateTransaction(tx),
    })
  }

  // Crée directement la dépense/facture "Payée" et déjà liée à la
  // transaction (qonto_transaction_id) — pas besoin de repasser par le
  // rapprochement classique ensuite, l'argent est déjà là sur le compte.
  async function creerDepenseDepuisTransaction() {
    if (!modalDepense) return
    setModalBusy(true); setModalError('')
    const { error: err } = await supabase.from('depenses_generales').insert([{
      libelle: modalDepense.libelle.trim() || 'Dépense',
      categorie: modalDepense.categorie,
      montant_ht: parseFloat(modalDepense.montant_ht) || 0,
      statut: 'Payée',
      date_facture: modalDepense.date_facture || null,
      qonto_transaction_id: modalDepense.transaction.transaction_id,
      qonto_matched_at: new Date().toISOString(),
      qonto_match_confiance: 'creation',
    }])
    if (err) { setModalError(err.message); setModalBusy(false); return }
    const txId = modalDepense.transaction.transaction_id
    setNonRapprochees(prev => prev.filter(t => t.transaction_id !== txId))
    setModalDepense(null)
    setModalBusy(false)
    chargerHistorique()
  }

  async function creerFactureDepuisTransaction() {
    if (!modalFacture) return
    if (!modalFacture.projetId) { setModalError('Choisis un projet.'); return }
    setModalBusy(true); setModalError('')
    const projet = projetsListe.find(p => p.id === modalFacture.projetId)
    const { data: numeroGenere, error: errNumero } = await supabase.rpc('next_facture_numero')
    if (errNumero) { setModalError(errNumero.message); setModalBusy(false); return }
    const { error: err } = await supabase.from('factures_cli').insert([{
      numero: numeroGenere,
      projet_id: modalFacture.projetId,
      client_id: projet?.client_id || null,
      montant_ht: parseFloat(modalFacture.montant_ht) || 0,
      statut: 'Payée',
      date_facture: modalFacture.date_facture || null,
      qonto_transaction_id: modalFacture.transaction.transaction_id,
      qonto_matched_at: new Date().toISOString(),
      qonto_match_confiance: 'creation',
    }])
    if (err) { setModalError(err.message); setModalBusy(false); return }
    const txId = modalFacture.transaction.transaction_id
    setNonRapprochees(prev => prev.filter(t => t.transaction_id !== txId))
    setModalFacture(null)
    setModalBusy(false)
    chargerHistorique()
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
      {/* Modale "Créer une dépense" à partir d'une transaction Qonto (débit)
          sans correspondance — voir ouvrirCreationDepense /
          creerDepenseDepuisTransaction. */}
      {modalDepense && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 440, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600 }}>Créer une dépense</h3>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 18 }}>
              Depuis la transaction Qonto : {modalDepense.transaction.label || modalDepense.transaction.reference} · {fmtTx(Math.abs(modalDepense.transaction.amount_cents))}
            </div>

            {modalError && (
              <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                {modalError}
              </div>
            )}

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Libellé</label>
            <input value={modalDepense.libelle} onChange={e => setModalDepense(p => ({ ...p, libelle: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', marginBottom: 14 }} />

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Catégorie</label>
            <select value={modalDepense.categorie} onChange={e => setModalDepense(p => ({ ...p, categorie: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', marginBottom: 14 }}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Montant HT (€)</label>
                <input type="number" step="0.01" value={modalDepense.montant_ht} onChange={e => setModalDepense(p => ({ ...p, montant_ht: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Date</label>
                <input type="date" value={modalDepense.date_facture} onChange={e => setModalDepense(p => ({ ...p, date_facture: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 20 }}>
              💡 Montant HT prérempli à partir du montant de la transaction (TVA 20 % déduite) — à corriger si besoin.
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalDepense(null)} disabled={modalBusy}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={creerDepenseDepuisTransaction} disabled={modalBusy}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
                {modalBusy ? '⏳ Création...' : '✓ Créer la dépense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale "Créer une facture client" à partir d'une transaction Qonto
          (crédit) sans correspondance — voir ouvrirCreationFacture /
          creerFactureDepuisTransaction. */}
      {modalFacture && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 440, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600 }}>Créer une facture client</h3>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 18 }}>
              Depuis la transaction Qonto : {modalFacture.transaction.label || modalFacture.transaction.reference} · {fmtTx(Math.abs(modalFacture.transaction.amount_cents))}
            </div>

            {modalError && (
              <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                {modalError}
              </div>
            )}

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Projet</label>
            {projetsListe.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 14 }}>Aucun projet disponible — crée d'abord un projet.</div>
            ) : (
              <select value={modalFacture.projetId} onChange={e => setModalFacture(p => ({ ...p, projetId: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', marginBottom: 14 }}>
                <option value="">— Choisir un projet —</option>
                {projetsListe.map(p => <option key={p.id} value={p.id}>{p.nom}{p.clients?.nom ? ' · ' + p.clients.nom : ''}</option>)}
              </select>
            )}

            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Montant HT (€)</label>
                <input type="number" step="0.01" value={modalFacture.montant_ht} onChange={e => setModalFacture(p => ({ ...p, montant_ht: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Date</label>
                <input type="date" value={modalFacture.date_facture} onChange={e => setModalFacture(p => ({ ...p, date_facture: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 20 }}>
              💡 Montant HT prérempli à partir du montant de la transaction (TVA 20 % déduite) — à corriger si besoin. Le numéro de facture est généré automatiquement et la facture est créée directement au statut "Payée".
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalFacture(null)} disabled={modalBusy}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={creerFactureDepuisTransaction} disabled={modalBusy || projetsListe.length === 0}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
                {modalBusy ? '⏳ Création...' : '✓ Créer la facture'}
              </button>
            </div>
          </div>
        </div>
      )}

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

          {/* Transactions Qonto sans aucune facture/dépense correspondante
              en base — proposer de créer directement l'écriture (dépense ou
              facture client) plutôt que de laisser l'utilisateur ressaisir
              ça à la main ailleurs dans l'app. */}
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
              Transactions non rapprochées <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({nbNonRapprocheesTotal})</span>
            </div>
            {nonRapprochees.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 10, border: '1px dashed #E5E7EB', fontSize: 13 }}>
                Aucune transaction sans correspondance ✓
              </div>
            ) : (
              <>
                {nonRapprochees.map(tx => {
                  const estCredit = tx.side === 'credit'
                  return (
                    <div key={tx.transaction_id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{tx.label || tx.reference || 'Transaction Qonto'}</div>
                        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{fmtDate(tx.settled_at || tx.emitted_at)}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: estCredit ? '#059669' : '#DC2626', flexShrink: 0 }}>
                        {estCredit ? '+ ' : '− '}{fmtTx(Math.abs(tx.amount_cents))}
                      </div>
                      <button onClick={() => estCredit ? ouvrirCreationFacture(tx) : ouvrirCreationDepense(tx)}
                        style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid ' + (estCredit ? '#BBF7D0' : '#FCA5A5'), background: estCredit ? '#F0FDF4' : '#FEF2F2', color: estCredit ? '#059669' : '#DC2626', cursor: 'pointer', fontWeight: 500, fontSize: 13, flexShrink: 0 }}>
                        {estCredit ? '+ Créer une facture client' : '+ Créer une dépense'}
                      </button>
                    </div>
                  )
                })}
                {nbNonRapprocheesTotal > nonRapprochees.length && (
                  <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 6 }}>
                    + {nbNonRapprocheesTotal - nonRapprochees.length} autre(s) transaction(s) plus ancienne(s), non affichée(s)
                  </div>
                )}
              </>
            )}
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
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: h.facture.qonto_match_confiance === 'exact' ? '#EFF6FF' : h.facture.qonto_match_confiance === 'creation' ? '#F0FDF4' : '#FFFBEB', color: h.facture.qonto_match_confiance === 'exact' ? '#2563EB' : h.facture.qonto_match_confiance === 'creation' ? '#059669' : '#B45309' }}>
                            {h.facture.qonto_match_confiance === 'exact' ? '🔗 Auto (n° + montant)' : h.facture.qonto_match_confiance === 'creation' ? '🆕 Créée depuis Qonto' : '✓ Confirmé (montant)'}
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
