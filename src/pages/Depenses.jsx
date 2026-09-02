import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../lib/useIsMobile'
import { getBankAccounts, getTransactionsPourRapprochement } from '../lib/useQonto'
import { rapprocherFactures, appliquerRapprochement } from '../lib/rapprochement'
import { CATEGORIES } from '../lib/depenses'
import { fmtEUR as fmt, fmtDateFr as fmtDate } from '../lib/calculs'
import { colors, fonts, eyebrow, quietLink } from '../lib/theme'

// Dépenses générales de la société : loyer, comptabilité, assurance,
// abonnements... tout ce qui n'est pas lié à un projet client précis.
// Avant cette page, il fallait créer un faux "projet" (ex. "Frais
// généraux") juste pour avoir un endroit où suivre ces achats — cette
// page remplace ce détour par un vrai espace dédié, avec les mêmes
// fonctionnalités que l'onglet "Factures frs" d'un projet (suivi du
// statut, pièce jointe, rapprochement bancaire Qonto).
// CATEGORIES vit maintenant dans lib/depenses.js (partagé avec
// Rapprochement.jsx) — voir l'import ci-dessus.
const STATUTS = ['À payer', 'Payée']

const fmtTx = cents => cents !== undefined && cents !== null
  ? (Number(cents) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  : '—'

const FORM_VIDE = { libelle: '', categorie: CATEGORIES[0], numero: '', fournisseur_id: '', montant_ht: '', statut: 'À payer', date_facture: '', date_echeance: '' }

const inputUnderline = {
  width: '100%', padding: '8px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}
const fieldLabel = { display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }
const btnPrimary = { background: colors.ink, color: colors.surface, border: 'none', padding: '10px 20px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }
const btnGhost = { background: 'none', color: colors.inkMuted, border: '1px solid ' + colors.line, padding: '10px 18px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }
// Style des champs d'édition inline dans le tableau — souligné, teinte
// ochre discrète tant que la ligne a des changements non enregistrés.
const cellInput = isEdited => ({
  padding: '4px 2px', border: 'none', borderBottom: '1px solid ' + (isEdited ? colors.warning : 'transparent'),
  fontSize: 12.5, background: 'transparent', boxSizing: 'border-box', width: '100%', fontFamily: fonts.display, color: colors.ink,
})

export default function Depenses() {
  const isMobile = useIsMobile()
  const location = useLocation()
  const [depenses, setDepenses] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FORM_VIDE)
  const [fichier, setFichier] = useState(null)
  const [error, setError] = useState('')
  const [savingDepense, setSavingDepense] = useState(false) // garde-fou anti double-clic
  const [editees, setEditees] = useState({}) // édition inline { [id]: {champ: valeur} }
  // Pré-rempli si on arrive depuis la recherche avancée (state.q), même
  // principe que Clients.jsx/Fournisseurs.jsx.
  const [search, setSearch] = useState(location.state?.q || '')
  const [filtreCategorie, setFiltreCategorie] = useState('Toutes')
  const [filtreStatut, setFiltreStatut] = useState('Toutes')
  const [rapprochementBusy, setRapprochementBusy] = useState(false)
  const [rapprochementError, setRapprochementError] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [confirmBusy, setConfirmBusy] = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: d }, { data: f }] = await Promise.all([
      supabase.from('depenses_generales').select('*, fournisseurs(id, nom)').is('deleted_at', null).order('date_facture', { ascending: false }),
      supabase.from('fournisseurs').select('id, nom').is('deleted_at', null).order('nom'),
    ])
    setDepenses(d || [])
    setFournisseurs(f || [])
    setLoading(false)
  }

  async function creerDepense() {
    if (savingDepense) return
    setError('')
    if (!form.libelle.trim()) { setError('Le libellé est obligatoire.'); return }
    // Sans date de facture, la dépense n'apparaît dans aucune période du
    // Compte de résultat (qui filtre sur date_facture) — elle resterait
    // silencieusement invisible dans les totaux même si elle est bien là
    // dans cette liste.
    if (!form.date_facture) { setError('La date de facture est obligatoire (sinon la dépense n\'apparaît pas dans le Compte de résultat).'); return }
    setSavingDepense(true)
    const { data: inserted, error: err } = await supabase.from('depenses_generales').insert([{
      ...form,
      montant_ht: parseFloat(form.montant_ht) || 0,
      fournisseur_id: form.fournisseur_id || null,
      date_facture: form.date_facture || null,
      date_echeance: form.date_echeance || null,
    }]).select().single()
    if (err) { setError(err.message); setSavingDepense(false); return }

    if (fichier && inserted) {
      const fileName = 'depense_' + inserted.id + '_' + fichier.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = 'depenses_generales/' + inserted.id + '/' + fileName
      const { error: uploadErr } = await supabase.storage.from('documents').upload(path, fichier)
      if (!uploadErr) await supabase.from('depenses_generales').update({ fichier_path: path }).eq('id', inserted.id)
    }

    setShowForm(false); setForm(FORM_VIDE); setFichier(null)
    setSavingDepense(false)
    fetchAll()
  }

  function getVal(d, champ) {
    if (editees[d.id] && editees[d.id][champ] !== undefined) return editees[d.id][champ]
    return d[champ] ?? ''
  }
  function editer(dId, champ, valeur) {
    setEditees(prev => ({ ...prev, [dId]: { ...(prev[dId] || {}), [champ]: valeur } }))
  }
  async function sauvegarder(depense) {
    const changes = editees[depense.id]
    if (!changes) return
    const payload = { ...changes }
    if (changes.montant_ht !== undefined) payload.montant_ht = parseFloat(changes.montant_ht) || 0
    if (changes.fournisseur_id !== undefined) payload.fournisseur_id = changes.fournisseur_id || null
    const { error: err } = await supabase.from('depenses_generales').update(payload).eq('id', depense.id)
    if (err) { alert('Erreur lors de l\'enregistrement : ' + err.message); return }
    setEditees(prev => { const n = { ...prev }; delete n[depense.id]; return n })
    fetchAll()
  }

  async function supprimer(id) {
    if (!confirm('Supprimer ? (récupérable depuis la Corbeille)')) return
    const { error: err } = await supabase.from('depenses_generales').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (err) { alert('Erreur lors de la suppression : ' + err.message); return }
    fetchAll()
  }

  async function telechargerFichier(path) {
    const { data, error: err } = await supabase.storage.from('documents').download(path)
    if (err) { alert('Impossible de récupérer le fichier : ' + err.message); return }
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url; a.download = path.split('/').pop()
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Rapprochement bancaire Qonto ────────────────────────────────────
  // Même logique que dans un projet (ProjetDetail.jsx) et sur la page
  // "Rapprochement" globale — src/lib/rapprochement.js est générique et
  // fonctionne sur n'importe quelle table ayant id/numero/montant_ht.
  async function verifierQonto() {
    setRapprochementError(''); setRapprochementBusy(true)
    try {
      const comptes = await getBankAccounts()
      const lots = await Promise.all(comptes.map(c => getTransactionsPourRapprochement(c)))
      const transactions = lots.flat()

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

      const ouvertes = depenses.filter(d => d.statut !== 'Payée')
      const resultats = rapprocherFactures(ouvertes, transactions, 'debit', exclues)
      const exactes = resultats.filter(r => r.confiance === 'exact')
      // appliquerRapprochement peut renvoyer une erreur (ex. policy RLS qui
      // bloque silencieusement la mise à jour) — jusqu'ici ignorée ici, la
      // dépense disparaissait de la liste "à vérifier" comme si tout
      // s'était bien passé alors que rien n'avait été enregistré.
      let echecs = 0
      for (const match of exactes) {
        const { error: errMatch } = await appliquerRapprochement(supabase, 'depenses_generales', match)
        if (errMatch) echecs++
      }
      const idsAppliques = new Set(exactes.map(r => r.facture.id))
      setSuggestions(resultats.filter(r => r.confiance === 'montant' && !idsAppliques.has(r.facture.id)))
      if (exactes.length > 0) fetchAll()
      if (echecs > 0) setRapprochementError(echecs + ' correspondance(s) trouvée(s) mais non enregistrée(s) — la migration sql/qonto_migration.sql a-t-elle été exécutée dans Supabase ?')
    } catch (err) {
      setRapprochementError(err.message)
    }
    setRapprochementBusy(false)
  }

  async function confirmerSuggestion(match) {
    setConfirmBusy(match.facture.id)
    const { error: err } = await appliquerRapprochement(supabase, 'depenses_generales', match)
    if (err) { alert('Erreur : ' + err.message) } else {
      setSuggestions(prev => prev.filter(r => r.facture.id !== match.facture.id))
      fetchAll()
    }
    setConfirmBusy(null)
  }

  const categoriesDispos = ['Toutes', ...CATEGORIES]
  const filtered = depenses.filter(d => {
    const matchSearch = d.libelle?.toLowerCase().includes(search.toLowerCase()) ||
      d.numero?.toLowerCase().includes(search.toLowerCase()) ||
      d.fournisseurs?.nom?.toLowerCase().includes(search.toLowerCase())
    return matchSearch &&
      (filtreCategorie === 'Toutes' || d.categorie === filtreCategorie) &&
      (filtreStatut === 'Toutes' || d.statut === filtreStatut)
  })

  const totalAPayer = depenses.filter(d => d.statut !== 'Payée').reduce((s, d) => s + (d.montant_ht || 0), 0)
  const totalPaye = depenses.filter(d => d.statut === 'Payée').reduce((s, d) => s + (d.montant_ht || 0), 0)

  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <p style={eyebrow}>Partenaires Particuliers</p>
          <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Dépenses</h1>
          <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0' }}>Achats et frais de la société non liés à un projet client</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={verifierQonto} disabled={rapprochementBusy} style={btnGhost}>
            {rapprochementBusy ? 'Vérification...' : 'Vérifier sur Qonto'}
          </button>
          <button onClick={() => { setShowForm(true); setError('') }} style={btnPrimary}>
            + Nouvelle dépense
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : 'repeat(3, 1fr)', gap: 24, margin: '36px 0 32px', paddingBottom: 24, borderBottom: '1px solid ' + colors.line }}>
        <div>
          <div style={eyebrow}>À payer</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 24, fontWeight: 500, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalAPayer)}</div>
        </div>
        <div>
          <div style={eyebrow}>Payé</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 24, fontWeight: 500, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalPaye)}</div>
        </div>
        <div>
          <div style={eyebrow}>Total dépenses</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 24, fontWeight: 500, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{depenses.length}</div>
        </div>
      </div>

      {rapprochementError && (
        <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '10px 14px', marginBottom: 24, fontSize: 13 }}>
          {rapprochementError}
        </div>
      )}

      {suggestions.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...eyebrow, marginBottom: 10 }}>
            À confirmer ({suggestions.length})
          </div>
          <div style={{ borderTop: '1px solid ' + colors.line }}>
            {suggestions.map(r => (
              <div key={r.facture.id + r.transaction.transaction_id}
                style={{ borderBottom: '1px solid ' + colors.line, padding: '14px 0', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.facture.libelle}</div>
                  <div style={{ fontSize: 12, color: colors.inkFaint, marginTop: 2 }}>{r.facture.categorie}</div>
                  <div style={{ fontFamily: fonts.mono, fontSize: 13, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{fmt(r.facture.montant_ht)} HT</div>
                </div>
                <div style={{ fontSize: 12, color: colors.inkMuted, flex: 1, minWidth: 200 }}>
                  <div style={{ marginBottom: 2 }}>↔ {r.transaction.label || r.transaction.reference || 'Transaction Qonto'}</div>
                  <div>{fmtDate(r.transaction.settled_at || r.transaction.emitted_at)} · {fmtTx(r.transaction.amount_cents)} ({r.base})</div>
                </div>
                <button onClick={() => confirmerSuggestion(r)} disabled={confirmBusy === r.facture.id} style={quietLink}>
                  {confirmBusy === r.facture.id ? '...' : 'Marquer payée'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
          style={{ ...inputUnderline, flex: 1, minWidth: 160 }} />
        <select value={filtreCategorie} onChange={e => setFiltreCategorie(e.target.value)}
          style={{ ...inputUnderline, width: 'auto', cursor: 'pointer' }}>
          {categoriesDispos.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
          style={{ ...inputUnderline, width: 'auto', cursor: 'pointer' }}>
          {['Toutes', ...STATUTS].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Modal nouvelle dépense */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ background: colors.surface, padding: 32, width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', border: '1px solid ' + colors.line }}>
            <h3 style={{ margin: '0 0 22px', fontSize: 17, fontWeight: 700 }}>Nouvelle dépense</h3>
            {error && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 16, fontSize: 13 }}>{error}</div>}

            <label style={fieldLabel}>Libellé *</label>
            <input value={form.libelle} onChange={e => setForm(p => ({ ...p, libelle: e.target.value }))} placeholder="Ex. Loyer bureau — août 2026"
              style={{ ...inputUnderline, marginBottom: 16 }} />

            <label style={fieldLabel}>Catégorie</label>
            <select value={form.categorie} onChange={e => setForm(p => ({ ...p, categorie: e.target.value }))}
              style={{ ...inputUnderline, marginBottom: 16, cursor: 'pointer' }}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>

            <label style={fieldLabel}>Fournisseur</label>
            <select value={form.fournisseur_id} onChange={e => setForm(p => ({ ...p, fournisseur_id: e.target.value }))}
              style={{ ...inputUnderline, marginBottom: 16, cursor: 'pointer' }}>
              <option value=''>— Aucun —</option>
              {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>

            <label style={fieldLabel}>N° de facture</label>
            <input value={form.numero} onChange={e => setForm(p => ({ ...p, numero: e.target.value }))}
              style={{ ...inputUnderline, marginBottom: 16 }} />

            <label style={fieldLabel}>Montant HT</label>
            <input type="number" min="0" value={form.montant_ht} onChange={e => setForm(p => ({ ...p, montant_ht: e.target.value }))}
              style={{ ...inputUnderline, marginBottom: 16 }} />

            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>Date facture *</label>
                <input type="date" value={form.date_facture} onChange={e => setForm(p => ({ ...p, date_facture: e.target.value }))}
                  style={inputUnderline} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>Échéance</label>
                <input type="date" value={form.date_echeance} onChange={e => setForm(p => ({ ...p, date_echeance: e.target.value }))}
                  style={inputUnderline} />
              </div>
            </div>

            <label style={fieldLabel}>Statut</label>
            <select value={form.statut} onChange={e => setForm(p => ({ ...p, statut: e.target.value }))}
              style={{ ...inputUnderline, marginBottom: 16, cursor: 'pointer' }}>
              {STATUTS.map(s => <option key={s}>{s}</option>)}
            </select>

            <label style={fieldLabel}>Justificatif (PDF, optionnel)</label>
            <input type="file" accept="application/pdf" onChange={e => setFichier(e.target.files?.[0] || null)}
              style={{ width: '100%', fontSize: 13, marginBottom: 22, fontFamily: fonts.display }} />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setError(''); setForm(FORM_VIDE); setFichier(null) }} style={btnGhost}>Annuler</button>
              <button onClick={creerDepense} disabled={savingDepense}
                style={{ ...btnPrimary, cursor: savingDepense ? 'default' : 'pointer', opacity: savingDepense ? 0.6 : 1 }}>{savingDepense ? 'Création...' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Liste */}
      {loading ? <div style={{ textAlign: 'center', padding: 60, color: colors.inkFaint, fontSize: 13 }}>Chargement...</div>
        : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.ink }}>Aucune dépense</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Libellé', 'Catégorie', 'Fournisseur', 'N°', 'Date', 'Échéance', 'Montant HT', 'Statut', 'Fichier', ''].map(h => (
                    <th key={h} style={{ padding: '0 14px 10px 0', textAlign: h === 'Montant HT' ? 'right' : 'left', color: colors.inkFaint, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap', borderBottom: '1px solid ' + colors.line }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const isEdited = !!editees[d.id]
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid ' + colors.line }}>
                      <td style={{ padding: '8px 14px 8px 0', minWidth: 180 }}>
                        <input value={getVal(d, 'libelle')} onChange={e => editer(d.id, 'libelle', e.target.value)} style={{ ...cellInput(isEdited), fontWeight: 600 }} />
                      </td>
                      <td style={{ padding: '8px 14px', minWidth: 150 }}>
                        <select value={getVal(d, 'categorie')} onChange={e => editer(d.id, 'categorie', e.target.value)}
                          style={{ ...cellInput(isEdited), cursor: 'pointer', color: colors.inkMuted }}>
                          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '8px 14px', minWidth: 140 }}>
                        <select value={getVal(d, 'fournisseur_id') || ''} onChange={e => editer(d.id, 'fournisseur_id', e.target.value)} style={{ ...cellInput(isEdited), cursor: 'pointer' }}>
                          <option value=''>— Aucun —</option>
                          {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '8px 14px', minWidth: 90 }}>
                        <input value={getVal(d, 'numero')} onChange={e => editer(d.id, 'numero', e.target.value)} style={{ ...cellInput(isEdited), width: 90 }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <input type="date" value={getVal(d, 'date_facture')} onChange={e => editer(d.id, 'date_facture', e.target.value)} style={{ ...cellInput(isEdited), width: 130 }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <input type="date" value={getVal(d, 'date_echeance')} onChange={e => editer(d.id, 'date_echeance', e.target.value)}
                          style={{ ...cellInput(isEdited), width: 130, color: d.statut === 'À payer' && d.date_echeance && new Date(d.date_echeance) < new Date() ? colors.danger : colors.ink }} />
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                        <input type="number" min="0" value={getVal(d, 'montant_ht')} onChange={e => editer(d.id, 'montant_ht', e.target.value)}
                          style={{ ...cellInput(isEdited), width: 90, textAlign: 'right', fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <select value={getVal(d, 'statut')} onChange={e => editer(d.id, 'statut', e.target.value)}
                          style={{ ...cellInput(isEdited), cursor: 'pointer', color: d.statut === 'Payée' ? colors.success : colors.warning }}>
                          {STATUTS.map(s => <option key={s}>{s}</option>)}
                        </select>
                        {d.qonto_transaction_id ? (
                          <div title={'Rapproché avec une transaction Qonto (' + (d.qonto_match_confiance === 'exact' ? 'numéro + montant' : 'montant seul') + '), le ' + (d.qonto_matched_at ? new Date(d.qonto_matched_at).toLocaleDateString('fr-FR') : '?')}
                            style={{ fontSize: 10, marginTop: 4, color: colors.focus }}>
                            Qonto{d.qonto_match_confiance === 'montant' ? ' (manuel)' : ''}
                          </div>
                        ) : d.statut === 'Payée' ? (
                          <div style={{ fontSize: 10, marginTop: 4, color: colors.inkFaint }}>saisi manuellement</div>
                        ) : null}
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        {d.fichier_path ? (
                          <button onClick={() => telechargerFichier(d.fichier_path)} style={quietLink}>Voir</button>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px 0 8px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                          {isEdited && (
                            <button onClick={() => sauvegarder(d)} style={quietLink}>Enregistrer</button>
                          )}
                          <button onClick={() => supprimer(d.id)} style={quietLink}>Supprimer</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
