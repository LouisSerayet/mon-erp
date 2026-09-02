import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getBankAccounts, getTransactionsPourRapprochement } from '../lib/useQonto'
import { rapprocherFactures, appliquerRapprochement, appliquerRapprochementGroupe } from '../lib/rapprochement'
import { useIsMobile } from '../lib/useIsMobile'
import { CATEGORIES } from '../lib/depenses'
import { fmtEUR as fmt, fmtDateFr as fmtDate } from '../lib/calculs'
import { colors, fonts, eyebrow, quietLink, marker } from '../lib/theme'

// Nombre max de transactions non rapprochées affichées (les plus récentes
// d'abord) — au-delà, la liste serait juste noyée sous des mouvements
// anciens déjà traités par ailleurs (retraits carte, virements internes...).
const MAX_NON_RAPPROCHEES = 25

// Libellé + couleur (marqueur) du badge "Confiance" dans l'historique,
// selon qonto_match_confiance ('exact' et 'montant' viennent de
// rapprocherFactures() dans lib/rapprochement.js, 'creation' et
// 'manuel_groupe' des actions manuelles de cette page — voir
// creerFactureDepuisTransaction / creerDepenseDepuisTransaction et
// appliquerRapprochementGroupe).
const BADGE_CONFIANCE = {
  exact: { label: 'Auto (n° + montant)', color: colors.focus },
  creation: { label: 'Créée depuis Qonto', color: colors.success },
  manuel_groupe: { label: 'Paiement groupé', color: '#7c4a8e' },
  montant: { label: 'Confirmé (montant)', color: colors.warning },
}

// Couleur de catégorisation par type de rapprochement (clients/fournisseurs/
// dépenses) — un simple repère visuel, pas un statut fonctionnel.
const TYPE_MARKER = { factures_cli: colors.success, factures_frs: colors.warning, depenses_generales: colors.focus }

const fmtTx = cents => cents !== undefined && cents !== null
  ? (Number(cents) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  : '—'

const inputUnderline = {
  width: '100%', padding: '8px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}
const fieldLabel = { display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }
const btnPrimary = { background: colors.ink, color: colors.surface, border: 'none', padding: '10px 20px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }
const btnGhost = { background: 'none', color: colors.inkMuted, border: '1px solid ' + colors.line, padding: '10px 18px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }

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

  // Modale "Associer plusieurs factures" — pour un virement/paiement groupé
  // qui règle plusieurs factures en une seule transaction (voir
  // appliquerRapprochementGroupe dans lib/rapprochement.js) : l'utilisateur
  // choisit lui-même les factures concernées parmi celles encore ouvertes.
  // { transaction, table ('factures_cli' | 'factures_frs'), factures,
  //   selection (Set d'ids), loading, error } ou null si fermée.
  const [modalGroupe, setModalGroupe] = useState(null)
  const [modalGroupeBusy, setModalGroupeBusy] = useState(false)

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
      ...(hCli || []).map(f => ({ table: 'factures_cli', facture: f, tiers: f.projets?.clients?.nom })),
      ...(hFrs || []).map(f => ({ table: 'factures_frs', facture: f, tiers: f.fournisseurs?.nom })),
      ...(hDep || []).map(d => ({ table: 'depenses_generales', facture: d, tiers: d.fournisseurs?.nom || d.categorie })),
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

  // Ouvre la modale "Associer plusieurs factures" pour une transaction sans
  // correspondance — charge les factures encore ouvertes du bon type
  // (clients pour un crédit, fournisseurs pour un débit) à la volée, plutôt
  // que de dépendre d'une liste chargée plus tôt qui pourrait être obsolète.
  async function ouvrirAssociationGroupee(tx, table) {
    setModalGroupe({ transaction: tx, table, factures: [], selection: new Set(), loading: true, error: '' })
    const query = table === 'factures_cli'
      ? supabase.from('factures_cli').select('id, numero, montant_ht, date_facture, projets(nom, clients(nom))').neq('statut', 'Payée').is('deleted_at', null).order('date_facture', { ascending: false })
      : supabase.from('factures_frs').select('id, numero, montant_ht, date_facture, projets(nom), fournisseurs(nom)').neq('statut', 'Payée').is('deleted_at', null).order('date_facture', { ascending: false })
    const { data, error: err } = await query
    // Si l'utilisateur a déjà fermé/changé de modale pendant le chargement,
    // on ignore cette réponse devenue obsolète.
    setModalGroupe(prev => (prev && prev.transaction.transaction_id === tx.transaction_id)
      ? { ...prev, factures: data || [], loading: false, error: err ? err.message : '' }
      : prev)
  }

  function toggleFactureGroupe(id) {
    setModalGroupe(prev => {
      if (!prev) return prev
      const next = new Set(prev.selection)
      if (next.has(id)) next.delete(id); else next.add(id)
      return { ...prev, selection: next }
    })
  }

  async function confirmerAssociationGroupee() {
    if (!modalGroupe || modalGroupe.selection.size === 0) return
    setModalGroupeBusy(true)
    const facturesChoisies = modalGroupe.factures.filter(f => modalGroupe.selection.has(f.id)).map(f => ({ id: f.id, numero: f.numero }))
    const { appliques, echecs } = await appliquerRapprochementGroupe(supabase, modalGroupe.table, facturesChoisies, modalGroupe.transaction)
    setModalGroupeBusy(false)
    if (appliques === 0 && echecs > 0) {
      setModalGroupe(prev => ({ ...prev, error: "Échec de l'enregistrement — la migration sql/qonto_migration.sql a-t-elle été exécutée dans Supabase ?" }))
      return
    }
    const txId = modalGroupe.transaction.transaction_id
    setNonRapprochees(prev => prev.filter(t => t.transaction_id !== txId))
    setNbNonRapprocheesTotal(prev => Math.max(0, prev - 1))
    setModalGroupe(null)
    chargerHistorique()
    if (echecs > 0) alert(`${appliques} facture(s) marquée(s) payée(s), ${echecs} échec(s) — vérifie l'historique.`)
  }

  function CarteSuggestion({ r, table }) {
    const cle = table + ':' + r.facture.id + ':' + r.transaction.transaction_id
    const tiers = table === 'factures_cli' ? r.facture.projets?.clients?.nom
      : table === 'depenses_generales' ? (r.facture.fournisseurs?.nom || r.facture.categorie)
      : r.facture.fournisseurs?.nom
    return (
      <div style={{ borderBottom: '1px solid ' + colors.line, padding: '14px 0', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 13 }}>
            <span style={marker(TYPE_MARKER[table])} />{r.facture.numero || r.facture.libelle}
          </div>
          <div style={{ fontSize: 12, color: colors.inkFaint, marginTop: 3 }}>
            {tiers || '—'}{r.facture.projets?.nom ? ' · ' + r.facture.projets.nom : ''}
          </div>
          <div style={{ fontFamily: fonts.mono, fontSize: 13, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{fmt(r.facture.montant_ht)} HT</div>
        </div>
        <div style={{ fontSize: 12, color: colors.inkMuted, flex: 1, minWidth: 200 }}>
          <div style={{ marginBottom: 2 }}>↔ {r.transaction.label || r.transaction.reference || 'Transaction Qonto'}</div>
          <div>{fmtDate(r.transaction.settled_at || r.transaction.emitted_at)} · {fmtTx(r.transaction.amount_cents)} ({r.base})</div>
        </div>
        <button onClick={() => confirmer(table, r)} disabled={busy === cle} style={quietLink}>
          {busy === cle ? '...' : 'Marquer payée'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
      {/* Modale "Créer une dépense" à partir d'une transaction Qonto (débit)
          sans correspondance — voir ouvrirCreationDepense /
          creerDepenseDepuisTransaction. */}
      {modalDepense && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ background: colors.surface, padding: 32, width: 440, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', border: '1px solid ' + colors.line }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>Créer une dépense</h3>
            <div style={{ fontSize: 12, color: colors.inkMuted, marginBottom: 20 }}>
              Depuis la transaction Qonto : {modalDepense.transaction.label || modalDepense.transaction.reference} · {fmtTx(Math.abs(modalDepense.transaction.amount_cents))}
            </div>

            {modalError && (
              <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 16, fontSize: 13 }}>
                {modalError}
              </div>
            )}

            <label style={fieldLabel}>Libellé</label>
            <input value={modalDepense.libelle} onChange={e => setModalDepense(p => ({ ...p, libelle: e.target.value }))}
              style={{ ...inputUnderline, marginBottom: 16 }} />

            <label style={fieldLabel}>Catégorie</label>
            <select value={modalDepense.categorie} onChange={e => setModalDepense(p => ({ ...p, categorie: e.target.value }))}
              style={{ ...inputUnderline, marginBottom: 16, cursor: 'pointer' }}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>

            <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>Montant HT (€)</label>
                <input type="number" step="0.01" value={modalDepense.montant_ht} onChange={e => setModalDepense(p => ({ ...p, montant_ht: e.target.value }))}
                  style={inputUnderline} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>Date</label>
                <input type="date" value={modalDepense.date_facture} onChange={e => setModalDepense(p => ({ ...p, date_facture: e.target.value }))}
                  style={inputUnderline} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: colors.inkFaint, margin: '10px 0 22px' }}>
              Montant HT prérempli à partir du montant de la transaction (TVA 20 % déduite) — à corriger si besoin.
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalDepense(null)} disabled={modalBusy} style={btnGhost}>Annuler</button>
              <button onClick={creerDepenseDepuisTransaction} disabled={modalBusy} style={btnPrimary}>
                {modalBusy ? 'Création...' : 'Créer la dépense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale "Créer une facture client" à partir d'une transaction Qonto
          (crédit) sans correspondance — voir ouvrirCreationFacture /
          creerFactureDepuisTransaction. */}
      {modalFacture && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ background: colors.surface, padding: 32, width: 440, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', border: '1px solid ' + colors.line }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>Créer une facture client</h3>
            <div style={{ fontSize: 12, color: colors.inkMuted, marginBottom: 20 }}>
              Depuis la transaction Qonto : {modalFacture.transaction.label || modalFacture.transaction.reference} · {fmtTx(Math.abs(modalFacture.transaction.amount_cents))}
            </div>

            {modalError && (
              <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 16, fontSize: 13 }}>
                {modalError}
              </div>
            )}

            <label style={fieldLabel}>Projet</label>
            {projetsListe.length === 0 ? (
              <div style={{ fontSize: 12, color: colors.inkFaint, marginBottom: 16 }}>Aucun projet disponible — crée d'abord un projet.</div>
            ) : (
              <select value={modalFacture.projetId} onChange={e => setModalFacture(p => ({ ...p, projetId: e.target.value }))}
                style={{ ...inputUnderline, marginBottom: 16, cursor: 'pointer' }}>
                <option value="">— Choisir un projet —</option>
                {projetsListe.map(p => <option key={p.id} value={p.id}>{p.nom}{p.clients?.nom ? ' · ' + p.clients.nom : ''}</option>)}
              </select>
            )}

            <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>Montant HT (€)</label>
                <input type="number" step="0.01" value={modalFacture.montant_ht} onChange={e => setModalFacture(p => ({ ...p, montant_ht: e.target.value }))}
                  style={inputUnderline} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>Date</label>
                <input type="date" value={modalFacture.date_facture} onChange={e => setModalFacture(p => ({ ...p, date_facture: e.target.value }))}
                  style={inputUnderline} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: colors.inkFaint, margin: '10px 0 22px' }}>
              Montant HT prérempli à partir du montant de la transaction (TVA 20 % déduite) — à corriger si besoin. Le numéro de facture est généré automatiquement et la facture est créée directement au statut "Payée".
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalFacture(null)} disabled={modalBusy} style={btnGhost}>Annuler</button>
              <button onClick={creerFactureDepuisTransaction} disabled={modalBusy || projetsListe.length === 0} style={btnPrimary}>
                {modalBusy ? 'Création...' : 'Créer la facture'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale "Associer plusieurs factures" — paiement groupé qui règle
          plusieurs factures en une transaction — voir ouvrirAssociationGroupee
          / confirmerAssociationGroupee. */}
      {modalGroupe && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ background: colors.surface, padding: 32, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', border: '1px solid ' + colors.line }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>Associer plusieurs factures</h3>
            <div style={{ fontSize: 12, color: colors.inkMuted, marginBottom: 20 }}>
              Transaction Qonto : {modalGroupe.transaction.label || modalGroupe.transaction.reference || 'Transaction Qonto'} · {fmtDate(modalGroupe.transaction.settled_at || modalGroupe.transaction.emitted_at)} · {fmtTx(Math.abs(modalGroupe.transaction.amount_cents))}
            </div>

            {modalGroupe.error && (
              <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 16, fontSize: 13 }}>
                {modalGroupe.error}
              </div>
            )}

            {modalGroupe.loading ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13 }}>Chargement des factures ouvertes...</div>
            ) : modalGroupe.factures.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13 }}>Aucune facture ouverte de ce type pour l'instant.</div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: colors.inkMuted, marginBottom: 10 }}>Coche les factures réglées par cette transaction :</div>
                <div style={{ borderTop: '1px solid ' + colors.line, marginBottom: 16, maxHeight: 280, overflowY: 'auto' }}>
                  {modalGroupe.factures.map(f => {
                    const tiers = modalGroupe.table === 'factures_cli' ? f.projets?.clients?.nom : f.fournisseurs?.nom
                    const coche = modalGroupe.selection.has(f.id)
                    return (
                      <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid ' + colors.line, cursor: 'pointer' }}>
                        <input type="checkbox" checked={coche} onChange={() => toggleFactureGroupe(f.id)} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: coche ? 600 : 500, fontSize: 13 }}>{f.numero}</div>
                          <div style={{ fontSize: 11, color: colors.inkFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tiers || '—'}{f.projets?.nom ? ' · ' + f.projets.nom : ''}
                          </div>
                        </div>
                        <div style={{ fontFamily: fonts.mono, fontSize: 13, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(f.montant_ht)} HT</div>
                      </label>
                    )
                  })}
                </div>

                {(() => {
                  const choisies = modalGroupe.factures.filter(f => modalGroupe.selection.has(f.id))
                  const totalHt = choisies.reduce((s, f) => s + (f.montant_ht || 0), 0)
                  const totalTtc = totalHt * 1.2
                  const montantTx = Math.abs(modalGroupe.transaction.amount_cents || 0) / 100
                  const okHt = Math.abs(totalHt - montantTx) <= 0.02
                  const okTtc = Math.abs(totalTtc - montantTx) <= 0.02
                  const correspond = okHt || okTtc
                  return (
                    <div style={{ borderLeft: '2px solid ' + (correspond ? colors.success : colors.warning), padding: '8px 14px', color: colors.ink, fontSize: 12, marginBottom: 22 }}>
                      {choisies.length} facture(s) sélectionnée(s) · {fmt(totalHt)} HT (≈ {fmt(totalTtc)} TTC) — transaction : {fmtTx(Math.abs(modalGroupe.transaction.amount_cents))}
                      {correspond ? ' — le total correspond' : ' — le total ne correspond pas exactement, vérifie ta sélection'}
                    </div>
                  )
                })()}
              </>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalGroupe(null)} disabled={modalGroupeBusy} style={btnGhost}>Annuler</button>
              <button onClick={confirmerAssociationGroupee} disabled={modalGroupeBusy || modalGroupe.selection.size === 0} style={btnPrimary}>
                {modalGroupeBusy ? 'Enregistrement...' : `Marquer ${modalGroupe.selection.size || ''} facture(s) payée(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <p style={eyebrow}>Partenaires Particuliers</p>
          <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Rapprochement</h1>
          <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0' }}>Factures ouvertes rapprochées des transactions Qonto</p>
        </div>
        <button onClick={lancerRapprochement} disabled={loading} style={quietLink}>
          {loading ? 'Rapprochement...' : 'Relancer'}
        </button>
      </div>

      {error && (
        <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '10px 14px', margin: '28px 0 0', fontSize: 13 }}>
          {error}
        </div>
      )}

      {dernierRapport && (
        <div style={{ borderLeft: '2px solid ' + (dernierRapport.appliques > 0 ? colors.success : colors.line), color: colors.ink, padding: '10px 14px', margin: '28px 0 0', fontSize: 13 }}>
          {dernierRapport.appliques > 0
            ? `${dernierRapport.appliques} facture(s) marquée(s) payée(s) automatiquement (numéro de facture retrouvé dans une transaction Qonto correspondante).`
            : 'Aucune correspondance exacte trouvée automatiquement cette fois-ci.'}
          {dernierRapport.echecs > 0 ? ` (${dernierRapport.echecs} échec(s) d'enregistrement — la migration sql/qonto_migration.sql a-t-elle été exécutée dans Supabase ?)` : ''}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13 }}>Chargement des transactions Qonto et des factures ouvertes...</div>
      ) : (
        <>
          <div style={{ marginTop: 36 }}>
            <div style={{ ...eyebrow, marginBottom: 4 }}>
              Factures clients à confirmer ({suggestionsCli.length})
            </div>
            {suggestionsCli.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13, borderTop: '1px solid ' + colors.line, marginTop: 10 }}>
                Aucune suggestion en attente.
              </div>
            ) : <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 10 }}>{suggestionsCli.map(r => <CarteSuggestion key={r.facture.id + r.transaction.transaction_id} r={r} table="factures_cli" />)}</div>}
          </div>

          <div style={{ marginTop: 32 }}>
            <div style={{ ...eyebrow, marginBottom: 4 }}>
              Factures fournisseurs à confirmer ({suggestionsFrs.length})
            </div>
            {suggestionsFrs.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13, borderTop: '1px solid ' + colors.line, marginTop: 10 }}>
                Aucune suggestion en attente.
              </div>
            ) : <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 10 }}>{suggestionsFrs.map(r => <CarteSuggestion key={r.facture.id + r.transaction.transaction_id} r={r} table="factures_frs" />)}</div>}
          </div>

          <div style={{ marginTop: 32 }}>
            <div style={{ ...eyebrow, marginBottom: 4 }}>
              Dépenses générales à confirmer ({suggestionsDep.length})
            </div>
            {suggestionsDep.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13, borderTop: '1px solid ' + colors.line, marginTop: 10 }}>
                Aucune suggestion en attente.
              </div>
            ) : <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 10 }}>{suggestionsDep.map(r => <CarteSuggestion key={r.facture.id + r.transaction.transaction_id} r={r} table="depenses_generales" />)}</div>}
          </div>

          {/* Transactions Qonto sans aucune facture/dépense correspondante
              en base — proposer de créer directement l'écriture (dépense ou
              facture client) plutôt que de laisser l'utilisateur ressaisir
              ça à la main ailleurs dans l'app. */}
          <div style={{ marginTop: 32 }}>
            <div style={{ ...eyebrow, marginBottom: 4 }}>
              Transactions non rapprochées ({nbNonRapprocheesTotal})
            </div>
            {nonRapprochees.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13, borderTop: '1px solid ' + colors.line, marginTop: 10 }}>
                Aucune transaction sans correspondance
              </div>
            ) : (
              <>
                <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 10 }}>
                  {nonRapprochees.map(tx => {
                    const estCredit = tx.side === 'credit'
                    return (
                      <div key={tx.transaction_id} style={{ borderBottom: '1px solid ' + colors.line, padding: '14px 0', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{tx.label || tx.reference || 'Transaction Qonto'}</div>
                          <div style={{ fontSize: 12, color: colors.inkFaint, marginTop: 3 }}>{fmtDate(tx.settled_at || tx.emitted_at)}</div>
                        </div>
                        <div style={{ fontFamily: fonts.mono, fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: estCredit ? colors.success : colors.ink, flexShrink: 0 }}>
                          {estCredit ? '+ ' : '− '}{fmtTx(Math.abs(tx.amount_cents))}
                        </div>
                        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                          <button onClick={() => ouvrirAssociationGroupee(tx, estCredit ? 'factures_cli' : 'factures_frs')} style={quietLink}
                            title="Paiement groupé : cette transaction règle plusieurs factures à la fois">
                            Associer à des factures {estCredit ? 'clients' : 'fournisseurs'}
                          </button>
                          <button onClick={() => estCredit ? ouvrirCreationFacture(tx) : ouvrirCreationDepense(tx)} style={quietLink}>
                            {estCredit ? '+ Créer une facture client' : '+ Créer une dépense'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {nbNonRapprocheesTotal > nonRapprochees.length && (
                  <div style={{ fontSize: 12, color: colors.inkFaint, textAlign: 'center', marginTop: 12 }}>
                    + {nbNonRapprocheesTotal - nonRapprochees.length} autre(s) transaction(s) plus ancienne(s), non affichée(s)
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ marginTop: 40 }}>
            <div style={{ ...eyebrow, marginBottom: 4 }}>
              Historique des rapprochements ({historique.length})
            </div>
            {historique.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13, borderTop: '1px solid ' + colors.line, marginTop: 10 }}>
                Aucune facture rapprochée avec Qonto pour l'instant.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr>
                    {['N°', 'Tiers / Projet', 'Montant HT', 'Confiance', 'Rapproché le'].map(h => (
                      <th key={h} style={{ padding: '0 14px 10px 0', textAlign: h === 'Montant HT' ? 'right' : 'left', color: colors.inkFaint, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid ' + colors.line }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {historique.map(h => (
                      <tr key={h.table + h.facture.id} style={{ borderBottom: '1px solid ' + colors.line }}>
                        <td style={{ padding: '10px 14px 10px 0', fontWeight: 600 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={marker(TYPE_MARKER[h.table])} />{h.facture.numero || h.facture.libelle}</span>
                        </td>
                        <td style={{ padding: '10px 14px', color: colors.inkMuted }}>
                          {h.tiers || '—'}{h.facture.projets?.nom ? ' · ' + h.facture.projets.nom : ''}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(h.facture.montant_ht)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.inkMuted }}>
                            <span style={marker((BADGE_CONFIANCE[h.facture.qonto_match_confiance] || BADGE_CONFIANCE.montant).color)} />
                            {(BADGE_CONFIANCE[h.facture.qonto_match_confiance] || BADGE_CONFIANCE.montant).label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 0 10px 14px', color: colors.inkFaint }}>{fmtDate(h.facture.qonto_matched_at)}</td>
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
