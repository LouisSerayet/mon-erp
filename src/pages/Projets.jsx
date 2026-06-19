import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const STATUTS = ['Tous', 'En cours', 'Finalisation', 'Cloture']

export default function Projets() {
  const [projets, setProjets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState('Tous')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ code: '', nom: '', statut: 'En cours', montant_ht: '', markup: '', type_projet: '', service: '', client_nom: '' })
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { fetchProjets() }, [])

  async function fetchProjets() {
    setLoading(true)
    const { data } = await supabase.from('projets').select('*').order('created_at', { ascending: false })
    setProjets(data || [])
    setLoading(false)
  }

  async function saveProjet(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('projets').insert([{
      ...form,
      montant_ht: parseFloat(form.montant_ht) || 0,
      markup: parseFloat(form.markup) || 0
    }])
    setSaving(false)
    setShowForm(false)
    setForm({ code: '', nom: '', statut: 'En cours', montant_ht: '', markup: '', type_projet: '', service: '', client_nom: '' })
    fetchProjets()
  }

  const filtered = projets
    .filter(p => filtre === 'Tous' || p.statut === filtre)
    .filter(p =>
      (p.nom || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.code || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.client_nom || '').toLowerCase().includes(search.toLowerCase())
    )

  const totalCA = projets.reduce((s, p) => s + (p.montant_ht || 0), 0)

  const pillStyle = (statut) => {
    if (statut === 'En cours') return { bg: '#EAF3DE', color: '#3B6D11' }
    if (statut === 'Finalisation') return { bg: '#FAEEDA', color: '#854F0B' }
    return { bg: '#F1EFE8', color: '#5F5E5A' }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Projets</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 2 }}>
            {projets.length} projets · CA total {totalCA.toLocaleString('fr-FR')} EUR
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
          + Nouveau projet
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Projets actifs', value: projets.filter(p => p.statut === 'En cours').length },
          { label: 'CA total HT', value: totalCA.toLocaleString('fr-FR') + ' EUR' },
          { label: 'En finalisation', value: projets.filter(p => p.statut === 'Finalisation').length },
          { label: 'Clotures', value: projets.filter(p => p.statut === 'Cloture').length },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 500 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un projet..."
          style={{ padding: '7px 12px', border: '0.5px solid #ddd', borderRadius: 8, fontSize: 13, width: 240, background: '#fff' }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUTS.map(s => (
            <button key={s} onClick={() => setFiltre(s)}
              style={{ padding: '5px 14px', borderRadius: 20, border: '0.5px solid #ddd', fontSize: 12, cursor: 'pointer', background: filtre === s ? '#185FA5' : '#fff', color: filtre === s ? '#fff' : '#555', fontWeight: filtre === s ? 500 : 400 }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
            Aucun projet. Cliquez sur "+ Nouveau projet" pour commencer.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9f9f7' }}>
                {['Code', 'Nom du projet', 'Client', 'Statut', 'Montant HT', 'Markup', 'Service'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '0.5px solid #e5e5e5' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const ps = pillStyle(p.statut)
                return (
                  <tr key={p.id} style={{ borderBottom: '0.5px solid #f0f0f0', cursor: 'pointer' }}
                    onClick={() => navigate('/projets/' + p.id)}
                    onMouseEnter={e => e.currentTarget.style.background = '#fafaf8'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '11px 14px', color: '#888', fontFamily: 'monospace', fontSize: 11 }}>{p.code}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 500, color: '#185FA5' }}>{p.nom}</td>
                    <td style={{ padding: '11px 14px', color: '#555' }}>{p.client_nom || ''}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ background: ps.bg, color: ps.color, padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 500 }}>{p.statut}</span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>{(p.montant_ht || 0).toLocaleString('fr-FR')} EUR</td>
                    <td style={{ padding: '11px 14px' }}>{p.markup ? p.markup + '%' : ''}</td>
                    <td style={{ padding: '11px 14px', color: '#555' }}>{p.service || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 520, maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 17, fontWeight: 500, marginBottom: 20 }}>Nouveau projet</h2>
            <form onSubmit={saveProjet}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  { label: 'Code projet', key: 'code', required: true, full: true },
                  { label: 'Nom du projet', key: 'nom', required: true, full: true },
                  { label: 'Client', key: 'client_nom', full: true },
                  { label: 'Montant HT (EUR)', key: 'montant_ht', type: 'number' },
                  { label: 'Markup (%)', key: 'markup', type: 'number' },
                  { label: 'Type de projet', key: 'type_projet' },
                  { label: 'Service', key: 'service' },
                ].map(f => (
                  <div key={f.key} style={{ gridColumn: f.full ? '1 / -1' : 'auto', marginBottom: 2 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>{f.label}</label>
                    <input type={f.type || 'text'} value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                      required={f.required || false}
                      style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Statut</label>
                  <select value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                    <option>En cours</option>
                    <option>Finalisation</option>
                    <option>Cloture</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setShowForm(false)}
                  style={{ flex: 1, padding: '9px', border: '0.5px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, background: '#185FA5', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  {saving ? 'Enregistrement...' : 'Creer le projet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
