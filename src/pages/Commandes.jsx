import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STATUTS = ['Tous', 'Brouillon', 'Attente validation', 'Validee niv 1', 'Validee niv 2', 'Annulee']

const pillColor = (s) => {
  if (s === 'Validee niv 2') return { bg: '#EAF3DE', color: '#3B6D11' }
  if (s === 'Validee niv 1') return { bg: '#E6F1FB', color: '#185FA5' }
  if (s === 'Brouillon') return { bg: '#F1EFE8', color: '#5F5E5A' }
  if (s === 'Attente validation') return { bg: '#FAEEDA', color: '#854F0B' }
  if (s === 'Annulee') return { bg: '#FCEBEB', color: '#A32D2D' }
  return { bg: '#eee', color: '#555' }
}

export default function Commandes() {
  const [commandes, setCommandes] = useState([])
  const [projets, setProjets] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState('Tous')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    code: '', projet_id: '', fournisseur_id: '', statut: 'Brouillon',
    montant_ht: '', categorie_cout: '', description: '',
    date_creation: new Date().toISOString().slice(0, 10), cloturee: false
  })

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: c }, { data: p }, { data: f }] = await Promise.all([
      supabase.from('commandes_fournisseurs').select('*, projets(nom, code), fournisseurs(raison_sociale)').order('created_at', { ascending: false }),
      supabase.from('projets').select('id, nom, code').order('nom'),
      supabase.from('fournisseurs').select('id, raison_sociale').order('raison_sociale'),
    ])
    setCommandes(c || [])
    setProjets(p || [])
    setFournisseurs(f || [])
    setLoading(false)
  }

  async function saveCommande(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('commandes_fournisseurs').insert([{
      ...form,
      montant_ht: parseFloat(form.montant_ht) || 0,
      projet_id: form.projet_id || null,
      fournisseur_id: form.fournisseur_id || null,
    }])
    setSaving(false)
    setShowForm(false)
    setForm({ code: '', projet_id: '', fournisseur_id: '', statut: 'Brouillon', montant_ht: '', categorie_cout: '', description: '', date_creation: new Date().toISOString().slice(0, 10), cloturee: false })
    fetchAll()
  }

  async function toggleCloture(id, current) {
    await supabase.from('commandes_fournisseurs').update({ cloturee: !current }).eq('id', id)
    fetchAll()
  }

  async function updateStatut(id, statut) {
    await supabase.from('commandes_fournisseurs').update({ statut }).eq('id', id)
    fetchAll()
  }

  const filtered = commandes
    .filter(c => filtre === 'Tous' || c.statut === filtre)
    .filter(c =>
      (c.code || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.fournisseurs?.raison_sociale || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.projets?.nom || '').toLowerCase().includes(search.toLowerCase())
    )

  const totalCommande = commandes.reduce((s, c) => s + (c.montant_ht || 0), 0)
  const enAttente = commandes.filter(c => c.statut === 'Attente validation').length

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Commandes fournisseurs</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 2 }}>{commandes.length} commandes · Total {totalCommande.toLocaleString('fr-FR')} EUR</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
          + Nouvelle commande
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total commande HT', value: totalCommande.toLocaleString('fr-FR') + ' EUR' },
          { label: 'Commandes ouvertes', value: commandes.filter(c => !c.cloturee).length },
          { label: 'En attente validation', value: enAttente, warn: enAttente > 0 },
          { label: 'Cloturees', value: commandes.filter(c => c.cloturee).length },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: k.warn ? '#854F0B' : 'inherit' }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
          style={{ padding: '7px 12px', border: '0.5px solid #ddd', borderRadius: 8, fontSize: 13, width: 200, background: '#fff' }} />
        {STATUTS.map(s => (
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
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Aucune commande.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9f9f7' }}>
                  {['Code CF', 'Projet', 'Fournisseur', 'Categorie', 'Statut', 'Montant HT', 'Date', 'Cloturee', 'Action'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, fontSize: 11, color: '#888', textTransform: 'uppercase', borderBottom: '0.5px solid #e5e5e5', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const pc = pillColor(c.statut)
                  return (
                    <tr key={c.id} style={{ borderBottom: '0.5px solid #f0f0f0' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafaf8'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '10px 12px', color: '#888', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{c.code}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 500, whiteSpace: 'nowrap' }}>{c.projets ? c.projets.nom : ''}</td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{c.fournisseurs ? c.fournisseurs.raison_sociale : ''}</td>
                      <td style={{ padding: '10px 12px', color: '#555' }}>{c.categorie_cout || ''}</td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <select value={c.statut} onChange={e => updateStatut(c.id, e.target.value)}
                          style={{ background: pc.bg, color: pc.color, border: 'none', borderRadius: 10, padding: '3px 8px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                          <option>Brouillon</option>
                          <option>Attente validation</option>
                          <option>Validee niv 1</option>
                          <option>Validee niv 2</option>
                          <option>Annulee</option>
                        </select>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 500, whiteSpace: 'nowrap' }}>{(c.montant_ht || 0).toLocaleString('fr-FR')} EUR</td>
                      <td style={{ padding: '10px 12px', color: '#888', whiteSpace: 'nowrap' }}>{c.date_creation || ''}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <button onClick={() => toggleCloture(c.id, c.cloturee)}
                          style={{ background: c.cloturee ? '#EAF3DE' : '#F1EFE8', color: c.cloturee ? '#3B6D11' : '#888', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 500 }}>
                          {c.cloturee ? 'Oui' : 'Non'}
                        </button>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button onClick={async () => { if (window.confirm('Supprimer ?')) { await supabase.from('commandes_fournisseurs').delete().eq('id', c.id); fetchAll() } }}
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
            <h2 style={{ fontSize: 17, fontWeight: 500, marginBottom: 20 }}>Nouvelle commande fournisseur</h2>
            <form onSubmit={saveCommande}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Code CF</label>
                  <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="ex: IHY120069836/29" required
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Projet</label>
                  <select value={form.projet_id} onChange={e => setForm({ ...form, projet_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                    <option value="">Selectionnez...</option>
                    {projets.map(p => <option key={p.id} value={p.id}>{p.code} - {p.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Fournisseur</label>
                  <select value={form.fournisseur_id} onChange={e => setForm({ ...form, fournisseur_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                    <option value="">Selectionnez...</option>
                    {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.raison_sociale}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Montant HT (EUR)</label>
                  <input type="number" value={form.montant_ht} onChange={e => setForm({ ...form, montant_ht: e.target.value })} placeholder="0"
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Categorie de cout</label>
                  <input value={form.categorie_cout} onChange={e => setForm({ ...form, categorie_cout: e.target.value })} placeholder="ex: Electricite"
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Statut</label>
                  <select value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                    <option>Brouillon</option>
                    <option>Attente validation</option>
                    <option>Validee niv 1</option>
                    <option>Validee niv 2</option>
                    <option>Annulee</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Date</label>
                  <input type="date" value={form.date_creation} onChange={e => setForm({ ...form, date_creation: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Description</label>
                  <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description des travaux..." rows={3}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13, resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setShowForm(false)}
                  style={{ flex: 1, padding: '9px', border: '0.5px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, background: '#185FA5', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  {saving ? 'Enregistrement...' : 'Creer la commande'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
