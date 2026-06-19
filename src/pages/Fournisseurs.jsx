import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Fournisseurs() {
  const [fournisseurs, setFournisseurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ raison_sociale: '', contact: '', categorie: '' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchFournisseurs() }, [])

  async function fetchFournisseurs() {
    setLoading(true)
    const { data } = await supabase.from('fournisseurs').select('*').order('raison_sociale')
    setFournisseurs(data || [])
    setLoading(false)
  }

  async function saveFournisseur(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('fournisseurs').insert([{ ...form }])
    setSaving(false)
    setShowForm(false)
    setForm({ raison_sociale: '', contact: '', categorie: '' })
    fetchFournisseurs()
  }

  async function deleteFournisseur(id) {
    if (!window.confirm('Supprimer ce fournisseur ?')) return
    await supabase.from('fournisseurs').delete().eq('id', id)
    fetchFournisseurs()
  }

  const filtered = fournisseurs.filter(f =>
    f.raison_sociale.toLowerCase().includes(search.toLowerCase()) ||
    (f.categorie || '').toLowerCase().includes(search.toLowerCase())
  )

  const categories = [...new Set(fournisseurs.map(f => f.categorie).filter(Boolean))]

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Fournisseurs</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 2 }}>{fournisseurs.length} fournisseurs</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
        >
          + Nouveau fournisseur
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total fournisseurs', value: fournisseurs.length },
          { label: 'Categories', value: categories.length },
          { label: 'Recents (ce mois)', value: fournisseurs.filter(f => new Date(f.created_at) > new Date(Date.now() - 30*24*60*60*1000)).length },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 500 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un fournisseur..."
          style={{ width: '100%', padding: '9px 12px', border: '0.5px solid #ddd', borderRadius: 8, fontSize: 13, background: '#fff' }}
        />
      </div>

      <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
            Aucun fournisseur. Cliquez sur "+ Nouveau fournisseur" pour commencer.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9f9f7' }}>
                {['Raison sociale', 'Contact', 'Categorie', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '0.5px solid #e5e5e5' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr
                  key={f.id}
                  style={{ borderBottom: '0.5px solid #f0f0f0' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafaf8'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ padding: '11px 14px', fontWeight: 500 }}>{f.raison_sociale}</td>
                  <td style={{ padding: '11px 14px', color: '#555' }}>{f.contact || ''}</td>
                  <td style={{ padding: '11px 14px' }}>
                    {f.categorie && (
                      <span style={{ background: '#E6F1FB', color: '#185FA5', padding: '3px 10px', borderRadius: 10, fontSize: 12 }}>
                        {f.categorie}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <button
                      onClick={() => deleteFournisseur(f.id)}
                      style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', fontSize: 12 }}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 440 }}>
            <h2 style={{ fontSize: 17, fontWeight: 500, marginBottom: 20 }}>Nouveau fournisseur</h2>
            <form onSubmit={saveFournisseur}>
              {[
                { label: 'Raison sociale', key: 'raison_sociale', placeholder: 'ex: CIGC', required: true },
                { label: 'Contact', key: 'contact', placeholder: 'ex: Jean Dupont' },
                { label: 'Categorie', key: 'categorie', placeholder: 'ex: Electricite, Menuiserie...' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>{f.label}</label>
                  <input
                    value={form[f.key]}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    required={f.required || false}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setShowForm(false)}
                  style={{ flex: 1, padding: '9px', border: '0.5px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, background: '#185FA5', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  {saving ? 'Enregistrement...' : 'Creer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
