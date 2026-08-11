import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../lib/useIsMobile'
import { getBankAccounts, getTransactionsPourRapprochement } from '../lib/useQonto'
import { rapprocherFactures, appliquerRapprochement } from '../lib/rapprochement'

// Dépenses générales de la société : loyer, comptabilité, assurance,
// abonnements... tout ce qui n'est pas lié à un projet client précis.
// Avant cette page, il fallait créer un faux "projet" (ex. "Frais
// généraux") juste pour avoir un endroit où suivre ces achats — cette
// page remplace ce détour par un vrai espace dédié, avec les mêmes
// fonctionnalités que l'onglet "Factures frs" d'un projet (suivi du
// statut, pièce jointe, rapprochement bancaire Qonto).
const CATEGORIES = ['Loyer & charges', 'Comptabilité & juridique', 'Assurance', 'Abonnements & logiciels', 'Banque & frais financiers', 'Marketing & communication', 'Fournitures & matériel', 'Déplacements', 'Impôts & taxes', 'Autre']
const STATUTS = ['À payer', 'Payée']

const fmt = n => n !== undefined && n !== null
  ? Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  : '—'
const fmtTx = cents => cents !== undefined && cents !== null
  ? (Number(cents) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  : '—'
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—'

const FORM_VIDE = { libelle: '', categorie: CATEGORIES[0], numero: '', fournisseur_id: '', montant_ht: '', statut: 'À payer', date_facture: '', date_echeance: '' }

export default function Depenses() {
  const isMobile = useIsMobile()
  const [depenses, setDepenses] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FORM_VIDE)
  const [fichier, setFichier] = useState(null)
  const [error, setError] = useState('')
  const [editees, setEditees] = useState({}) // édition inline { [id]: {champ: valeur} }
  const [search, setSearch] = useState('')
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
    setError('')
    if (!form.libelle.trim()) { setError('Le libellé est obligatoire.'); return }
    const { data: inserted, error: err } = await supabase.from('depenses_generales').insert([{
      ...form,
      montant_ht: parseFloat(form.montant_ht) || 0,
      fournisseur_id: form.fournisseur_id || null,
      date_facture: form.date_facture || null,
      date_echeance: form.date_echeance || null,
    }]).select().single()
    if (err) { setError(err.message); return }

    if (fichier && inserted) {
      const fileName = 'depense_' + inserted.id + '_' + fichier.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = 'depenses_generales/' + inserted.id + '/' + fileName
      const { error: uploadErr } = await supabase.storage.from('documents').upload(path, fichier)
      if (!uploadErr) await supabase.from('depenses_generales').update({ fichier_path: path }).eq('id', inserted.id)
    }

    setShowForm(false); setForm(FORM_VIDE); setFichier(null)
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
      for (const match of exactes) await appliquerRapprochement(supabase, 'depenses_generales', match)
      const idsAppliques = new Set(exactes.map(r => r.facture.id))
      setSuggestions(resultats.filter(r => r.confiance === 'montant' && !idsAppliques.has(r.facture.id)))
      if (exactes.length > 0) fetchAll()
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
    <div style={{ padding: isMobile ? 14 : 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Dépenses</h2>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>Achats et frais de la société non liés à un projet client</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={verifierQonto} disabled={rapprochementBusy}
            style={{ background: '#fff', color: '#EA580C', border: '1px solid #FED7AA', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
            {rapprochementBusy ? '⏳ Vérification...' : '🔗 Vérifier sur Qonto'}
          </button>
          <button onClick={() => { setShowForm(true); setError('') }}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
            + Nouvelle dépense
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'À payer', value: fmt(totalAPayer), color: '#EA580C', bg: '#FFF7ED' },
          { label: 'Payé', value: fmt(totalPaye), color: '#059669', bg: '#F0FDF4' },
          { label: 'Total dépenses', value: depenses.length, color: '#2563EB', bg: '#EFF6FF' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 10, padding: '14px 18px', border: '1px solid ' + k.color + '30' }}>
            <div style={{ fontSize: 11, color: k.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {rapprochementError && (
        <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
          ⚠️ {rapprochementError}
        </div>
      )}

      {suggestions.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
            À confirmer <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({suggestions.length})</span>
          </div>
          {suggestions.map(r => (
            <div key={r.facture.id + r.transaction.transaction_id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.facture.libelle}</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{r.facture.categorie}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#EA580C', marginTop: 4 }}>{fmt(r.facture.montant_ht)} HT</div>
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', flex: 1, minWidth: 200 }}>
                <div style={{ marginBottom: 2 }}>↔ {r.transaction.label || r.transaction.reference || 'Transaction Qonto'}</div>
                <div>{fmtDate(r.transaction.settled_at || r.transaction.emitted_at)} · {fmtTx(r.transaction.amount_cents)} ({r.base})</div>
              </div>
              <button onClick={() => confirmerSuggestion(r)} disabled={confirmBusy === r.facture.id}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#EA580C', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13, flexShrink: 0 }}>
                {confirmBusy === r.facture.id ? '⏳' : '✓ Marquer payée'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
          style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }} />
        <select value={filtreCategorie} onChange={e => setFiltreCategorie(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
          {categoriesDispos.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
          {['Toutes', ...STATUTS].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Modal nouvelle dépense */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>Nouvelle dépense</h3>
            {error && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Libellé *</label>
            <input value={form.libelle} onChange={e => setForm(p => ({ ...p, libelle: e.target.value }))} placeholder="Ex. Loyer bureau — août 2026"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', marginBottom: 14 }} />

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Catégorie</label>
            <select value={form.categorie} onChange={e => setForm(p => ({ ...p, categorie: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Fournisseur</label>
            <select value={form.fournisseur_id} onChange={e => setForm(p => ({ ...p, fournisseur_id: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
              <option value=''>— Aucun —</option>
              {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>N° de facture</label>
            <input value={form.numero} onChange={e => setForm(p => ({ ...p, numero: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', marginBottom: 14 }} />

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Montant HT</label>
            <input type="number" value={form.montant_ht} onChange={e => setForm(p => ({ ...p, montant_ht: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', marginBottom: 14 }} />

            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Date facture</label>
                <input type="date" value={form.date_facture} onChange={e => setForm(p => ({ ...p, date_facture: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Échéance</label>
                <input type="date" value={form.date_echeance} onChange={e => setForm(p => ({ ...p, date_echeance: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Statut</label>
            <select value={form.statut} onChange={e => setForm(p => ({ ...p, statut: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
              {STATUTS.map(s => <option key={s}>{s}</option>)}
            </select>

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Justificatif (PDF, optionnel)</label>
            <input type="file" accept="application/pdf" onChange={e => setFichier(e.target.files?.[0] || null)}
              style={{ width: '100%', fontSize: 13, marginBottom: 20 }} />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setError(''); setForm(FORM_VIDE); setFichier(null) }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={creerDepense}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>Créer</button>
            </div>
          </div>
        </div>
      )}

      {/* Liste */}
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Chargement...</div>
        : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💸</div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Aucune dépense</div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                  {['Libellé', 'Catégorie', 'Fournisseur', 'N°', 'Date', 'Échéance', 'Montant HT', 'Statut', 'Fichier', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Montant HT' ? 'right' : 'left', color: '#6B7280', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => {
                  const isEdited = !!editees[d.id]
                  const inStyle = { padding: '3px 6px', borderRadius: 4, border: isEdited ? '1px solid #FED7AA' : '1px solid transparent', fontSize: 12, background: isEdited ? '#FFF7ED' : 'transparent', boxSizing: 'border-box', width: '100%' }
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid #F3F4F6', background: isEdited ? '#FFFBEB' : i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '8px 14px', minWidth: 180 }}>
                        <input value={getVal(d, 'libelle')} onChange={e => editer(d.id, 'libelle', e.target.value)} style={{ ...inStyle, fontWeight: 600 }} />
                      </td>
                      <td style={{ padding: '8px 14px', minWidth: 160 }}>
                        <select value={getVal(d, 'categorie')} onChange={e => editer(d.id, 'categorie', e.target.value)}
                          style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 11, cursor: 'pointer', background: '#F5F3FF', color: '#7C3AED' }}>
                          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '8px 14px', minWidth: 140 }}>
                        <select value={getVal(d, 'fournisseur_id') || ''} onChange={e => editer(d.id, 'fournisseur_id', e.target.value)} style={inStyle}>
                          <option value=''>— Aucun —</option>
                          {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '8px 14px', minWidth: 90 }}>
                        <input value={getVal(d, 'numero')} onChange={e => editer(d.id, 'numero', e.target.value)} style={{ ...inStyle, width: 90 }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <input type="date" value={getVal(d, 'date_facture')} onChange={e => editer(d.id, 'date_facture', e.target.value)} style={{ ...inStyle, width: 130 }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <input type="date" value={getVal(d, 'date_echeance')} onChange={e => editer(d.id, 'date_echeance', e.target.value)}
                          style={{ ...inStyle, width: 130, color: d.statut === 'À payer' && d.date_echeance && new Date(d.date_echeance) < new Date() ? '#DC2626' : '#374151' }} />
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                        <input type="number" value={getVal(d, 'montant_ht')} onChange={e => editer(d.id, 'montant_ht', e.target.value)} style={{ ...inStyle, width: 90, textAlign: 'right', fontWeight: 600 }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <select value={getVal(d, 'statut')} onChange={e => editer(d.id, 'statut', e.target.value)}
                          style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 11, cursor: 'pointer', background: d.statut === 'Payée' ? '#ECFDF5' : '#FFF7ED', color: d.statut === 'Payée' ? '#059669' : '#EA580C' }}>
                          {STATUTS.map(s => <option key={s}>{s}</option>)}
                        </select>
                        {d.qonto_transaction_id ? (
                          <div title={'Rapproché avec une transaction Qonto (' + (d.qonto_match_confiance === 'exact' ? 'numéro + montant' : 'montant seul') + '), le ' + (d.qonto_matched_at ? new Date(d.qonto_matched_at).toLocaleDateString('fr-FR') : '?')}
                            style={{ fontSize: 10, marginTop: 4, color: '#2563EB', display: 'flex', alignItems: 'center', gap: 3 }}>
                            🔗 Qonto{d.qonto_match_confiance === 'montant' ? ' (manuel)' : ''}
                          </div>
                        ) : d.statut === 'Payée' ? (
                          <div style={{ fontSize: 10, marginTop: 4, color: '#9CA3AF' }}>saisi manuellement</div>
                        ) : null}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {d.fichier_path ? (
                          <button onClick={() => telechargerFichier(d.fichier_path)}
                            style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 11 }}>
                            📎 Voir
                          </button>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {isEdited && (
                            <button onClick={() => sauvegarder(d)}
                              style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>✓</button>
                          )}
                          <button onClick={() => supprimer(d.id)} style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer' }}>✕</button>
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
