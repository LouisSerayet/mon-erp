import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function FacturesCli() {
  const [factures, setFactures] = useState([])
  const [projets, setProjets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState('Tous')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    code: '', projet_id: '', statut: 'Brouillon', type: 'Situation',
    date_creation: new Date().toISOString().slice(0, 10),
    date_echeance: '', montant_ht: '', paye: false
  })

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: f }, { data: p }] = await Promise.all([
      supabase.from('factures_clients').select('*, projets(nom, code, clients(raison_sociale))').order('created_at', { ascending: false }),
      supabase.from('projets').select('id, nom, code, clients(raison_sociale)').order('nom'),
    ])
    setFactures(f || [])
    setProjets(p || [])
    setLoading(false)
  }

  async function saveFacture(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('factures_clients').insert([{
      ...form,
      montant_ht: parseFloat(form.montant_ht) || 0,
      projet_id: form.projet_id || null,
      date_echeance: form.date_echeance || null,
    }])
    setSaving(false)
    setShowForm(false)
    setForm({ code: '', projet_id: '', statut: 'Brouillon', type: 'Situation', date_creation: new Date().toISOString().slice(0, 10), date_echeance: '', montant_ht: '', paye: false })
    fetchAll()
  }

  async function togglePaye(id, current) {
    await supabase.from('factures_clients').update({ paye: !current, statut: !current ? 'Payee' : 'Validee' }).eq('id', id)
    fetchAll()
  }

  async function updateStatut(id, statut) {
    await supabase.from('factures_clients').update({ statut }).eq('id', id)
    fetchAll()
  }

  const filtered = factures
    .filter(f => filtre === 'Tous' || f.statut === filtre)
    .filter(f =>
      (f.code || '').toLowerCase().includes(search.toLowerCase()) ||
      (f.projets?.nom || '').toLowerCase().includes(search.toLowerCase()) ||
      (f.projets?.clients?.raison_sociale || '').toLowerCase().includes(search.toLowerCase())
    )

  const totalFacture = factures.reduce((s, f) => s + (f.montant_ht || 0), 0)
  const totalPaye = factures.filter(f => f.paye).reduce((s, f) => s + (f.montant_ht || 0), 0)
  const resteAFacturer = totalFacture - totalPaye
  const nonPayees = factures.filter(f => !f.paye && f.statut === 'Validee').length

  const today = new Date().toISOString().slice(0, 10)
  const enRetard = factures.filter(f => !f.paye && f.date_echeance && f.date_echeance < today).length

  const pillColor = (s) => {
    if (s === 'Validee') return { bg: '#EAF3DE', color: '#3B6D11' }
    if (s === 'Payee') return { bg: '#E6F1FB', color: '#185FA5' }
    if (s === 'Brouillon') return { bg: '#F1EFE8', color: '#5F5E5A' }
    if (s === 'Impayee') return { bg: '#FCEBEB', color: '#A32D2D' }
    return { bg: '#eee', color: '#555' }
  }

  const typeColor = (t) => {
    if (t === 'Acompte') return { bg: '#EEEDFE', color: '#3C3489' }
    if (t === 'Situation') return { bg: '#E6F1FB', color: '#185FA5' }
    if (t === 'Solde') return { bg: '#EAF3DE', color: '#3B6D11' }
    return { bg: '#eee', color: '#555' }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Factures clients</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 2 }}>{factures.length} factures · Total facture {totalFacture.toLocaleString('fr-FR')} EUR</p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
          + Nouvelle facture
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total facture HT', value: totalFacture.toLocaleString('fr-FR') + ' EUR' },
          { label: 'Paye', value: totalPaye.toLocaleString('fr-FR') + ' EUR' },
          { label: 'Reste a encaisser', value: resteAFacturer.toLocaleString('fr-FR') + ' EUR', warn: resteAFacturer > 0 },
          { label: 'Non payees', value: nonPayees, warn: nonPayees > 0 },
          { label: 'En retard', value: enRetard, warn: enRetard > 0 },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: k.warn ? '#A32D2D' : 'inherit' }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
          style={{ padding: '7px 12px', border: '0.5px solid #ddd', borderRadius: 8, fontSize: 13, width: 200, background: '#fff' }} />
        {['Tous', 'Brouillon', 'Validee', 'Payee', 'Impayee'].map(s => (
          <button key={s} onClick={() => setFiltre(s)}
            style={{ padding: '5px 12px', borderRadius: 20, border: '0.5px solid #ddd', fontSize: 12, cursor: 'pointer', background: filtre === s ? '#185FA5' : '#fff', color: filtre === s ? '#fff' : '#555', fontWeight: filtre === s ? 500 : 400 }}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Aucune facture client.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9f9f7' }}>
                  {['Code', 'Projet', 'Client', 'Type', 'Statut', 'Montant HT', 'Date creation', 'Echeance', 'Paye', 'Action'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, fontSize: 11, color: '#888', textTransform: 'uppercase', borderBottom: '0.5px solid #e5e5e5', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => {
                  const pc = pillColor(f.statut)
                  const tc = typeColor(f.type)
                  const estEnRetard = !f.paye && f.date_echeance && f.date_echeance < today
                  return (
                    <tr key={f.id} style={{ borderBottom: '0.5px solid #f0f0f0', background: estEnRetard ? '#FFF8F8' : '' }}
                      onMouseEnter={e => e.currentTarget.style.background = estEnRetard ? '#FFF0F0' : '#fafaf8'}
                      onMouseLeave={e => e.currentTarget.style.background = estEnRetard ? '#FFF8F8' : ''}>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 11, color: '#888' }}>{f.code}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 500, whiteSpace: 'nowrap' }}>{f.projets ? f.projets.nom : ''}</td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#555' }}>{f.projets?.clients?.raison_sociale || ''}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ background: tc.bg, color: tc.color, padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 500 }}>{f.type}</span>
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <select value={f.statut} onChange={e => updateStatut(f.id, e.target.value)}
                          style={{ background: pc.bg, color: pc.color, border: 'none', borderRadius: 10, padding: '3px 8px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                          <option>Brouillon</option>
                          <option>Validee</option>
                          <option>Payee</option>
                          <option>Impayee</option>
                        </select>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 500, whiteSpace: 'nowrap' }}>{(f.montant_ht || 0).toLocaleString('fr-FR')} EUR</td>
                      <td style={{ padding: '10px 12px', color: '#888', whiteSpace: 'nowrap' }}>{f.date_creation || ''}</td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: estEnRetard ? '#A32D2D' : '#888', fontWeight: estEnRetard ? 500 : 400 }}>
                        {f.date_echeance || ''}
                        {estEnRetard && <span style={{ marginLeft: 4, fontSize: 10, background: '#FCEBEB', color: '#A32D2D', padding: '1px 5px', borderRadius: 4 }}>RETARD</span>}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button onClick={() => togglePaye(f.id, f.paye)}
                          style={{ background: f.paye ? '#EAF3DE' : '#F1EFE8', color: f.paye ? '#3B6D11' : '#888', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 500 }}>
                          {f.paye ? 'Oui' : 'Non'}
                        </button>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button onClick={async () => { if (window.confirm('Supprimer ?')) { await supabase.from('factures_clients').delete().eq('id', f.id); fetchAll() } }}
                          style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', fontSize: 12 }}>
                          Suppr.
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 520, maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 17, fontWeight: 500, marginBottom: 20 }}>Nouvelle facture client</h2>
            <form onSubmit={saveFacture}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Code facture</label>
                  <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="ex: FACT-CLI-001" required
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Projet</label>
                  <select value={form.projet_id} onChange={e => setForm({ ...form, projet_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                    <option value="">Selectionnez un projet...</option>
                    {projets.map(p => <option key={p.id} value={p.id}>{p.code} - {p.nom} {p.clients ? '(' + p.clients.raison_sociale + ')' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Type</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                    <option>Acompte</option>
                    <option>Situation</option>
                    <option>Solde</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Statut</label>
                  <select value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                    <option>Brouillon</option>
                    <option>Validee</option>
                    <option>Payee</option>
                    <option>Impayee</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Montant HT (EUR)</label>
                  <input type="number" value={form.montant_ht} onChange={e => setForm({ ...form, montant_ht: e.target.value })} placeholder="0"
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Date creation</label>
                  <input type="date" value={form.date_creation} onChange={e => setForm({ ...form, date_creation: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Date echeance</label>
                  <input type="date" value={form.date_echeance} onChange={e => setForm({ ...form, date_echeance: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setShowForm(false)}
                  style={{ flex: 1, padding: '9px', border: '0.5px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, background: '#185FA5', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  {saving ? 'Enregistrement...' : 'Creer la facture'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
