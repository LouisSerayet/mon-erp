import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [clientOuvert, setClientOuvert] = useState(null)
  const [projets, setProjets] = useState([])
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({ nom: '', contact: '', email: '', telephone: '', adresse: '' })
  const [formEdit, setFormEdit] = useState({})
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').order('nom')
    setClients(data || [])
    setLoading(false)
  }

  async function ouvrirClient(c) {
    const { data: p } = await supabase.from('projets').select('*').eq('client_id', c.id).order('created_at', { ascending: false })
    setProjets(p || [])
    setClientOuvert(c)
    setEditMode(false)
  }

  async function creerClient() {
    setError('')
    if (!form.nom.trim()) { setError('Le nom est obligatoire.'); return }
    const { data, error } = await supabase.from('clients').insert([{ ...form }]).select().single()
    if (error) { setError('Erreur : ' + error.message); return }
    setShowForm(false)
    setForm({ nom: '', contact: '', email: '', telephone: '', adresse: '' })
    await fetchClients()
    ouvrirClient(data)
  }

  async function sauvegarderClient() {
    await supabase.from('clients').update(formEdit).eq('id', clientOuvert.id)
    setClientOuvert(prev => ({ ...prev, ...formEdit }))
    setClients(prev => prev.map(c => c.id === clientOuvert.id ? { ...c, ...formEdit } : c))
    setEditMode(false)
  }

  async function supprimerClient(id) {
    if (!confirm('Supprimer ce client ?')) return
    await supabase.from('clients').delete().eq('id', id)
    setClientOuvert(null)
    fetchClients()
  }

  const filtered = clients.filter(c =>
    c.nom?.toLowerCase().includes(search.toLowerCase()) ||
    c.contact?.toLowerCase().includes(search.toLowerCase())
  )

  const fmt = n => n ? Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €' : '—'
  const STATUT_STYLE = {
    'En cours':    { bg: '#EFF6FF', color: '#2563EB' },
    'Finalisation':{ bg: '#FFF7ED', color: '#EA580C' },
    'Clôturé':     { bg: '#F0FDF4', color: '#059669' },
  }

  // ── Fiche client ─────────────────────────────────────────────
  if (clientOuvert) {
    const totalCA = projets.reduce((s, p) => s + (p.montant_ht || 0), 0)
    return (
      <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setClientOuvert(null)}
            style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
            ← Clients
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{clientOuvert.nom}</h2>
            {clientOuvert.adresse && <div style={{ fontSize: 12, color: '#9CA3AF' }}>📍 {clientOuvert.adresse}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setEditMode(true); setFormEdit({ nom: clientOuvert.nom, contact: clientOuvert.contact || '', email: clientOuvert.email || '', telephone: clientOuvert.telephone || '', adresse: clientOuvert.adresse || '' }) }}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>✏️ Modifier</button>
            <button onClick={() => supprimerClient(clientOuvert.id)}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontSize: 13 }}>Supprimer</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
          {/* Colonne gauche — infos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Infos contact */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', fontSize: 14, fontWeight: 600 }}>Contact</div>
              {editMode ? (
                <div style={{ padding: 16 }}>
                  {[['nom', 'Nom'], ['contact', 'Contact'], ['email', 'Email'], ['telephone', 'Téléphone'], ['adresse', 'Adresse']].map(([key, label]) => (
                    <div key={key} style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</label>
                      <input value={formEdit[key] || ''} onChange={e => setFormEdit(p => ({ ...p, [key]: e.target.value }))}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setEditMode(false)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
                    <button onClick={sauvegarderClient} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>Sauvegarder</button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 16 }}>
                  {[
                    ['👤 Contact', clientOuvert.contact],
                    ['✉️ Email', clientOuvert.email],
                    ['📞 Téléphone', clientOuvert.telephone],
                    ['📍 Adresse', clientOuvert.adresse],
                  ].map(([label, val]) => val ? (
                    <div key={label} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label.split(' ')[0]}</div>
                      <div style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>{val}</div>
                    </div>
                  ) : null)}
                  {!clientOuvert.contact && !clientOuvert.email && !clientOuvert.telephone && (
                    <div style={{ fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' }}>Aucune info de contact</div>
                  )}
                </div>
              )}
            </div>

            {/* Stats */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', fontSize: 14, fontWeight: 600 }}>Statistiques</div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: '#2563EB' }}>Projets</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#1E40AF' }}>{projets.length}</span>
                </div>
                <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: '#059669' }}>CA total</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#065F46' }}>{fmt(totalCA)}</span>
                </div>
                <div style={{ background: '#F5F3FF', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: '#7C3AED' }}>En cours</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#5B21B6' }}>{projets.filter(p => p.statut === 'En cours').length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Colonne droite — projets */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Projets ({projets.length})</span>
              <button onClick={() => navigate('/projets')}
                style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer' }}>+ Nouveau projet →</button>
            </div>
            {projets.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                Aucun projet pour ce client
              </div>
            ) : (
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {projets.map(p => {
                  const st = STATUT_STYLE[p.statut] || {}
                  return (
                    <div key={p.id} onClick={() => navigate('/projets/' + p.id)}
                      style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: '#FAFAFA' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F0F9FF'}
                      onMouseLeave={e => e.currentTarget.style.background = '#FAFAFA'}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', marginBottom: 2 }}>{p.nom}</div>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                          {p.date_debut ? '📅 ' + new Date(p.date_debut).toLocaleDateString('fr-FR') : ''}
                          {p.date_fin_prevue ? ' → ' + new Date(p.date_fin_prevue).toLocaleDateString('fr-FR') : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 3 }}>{fmt(p.montant_ht)}</div>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: st.bg, color: st.color, fontWeight: 500 }}>{p.statut}</span>
                      </div>
                      <span style={{ fontSize: 12, color: '#9CA3AF' }}>→</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Liste clients ─────────────────────────────────────────────
  return (
    <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Clients</h2>
        <button onClick={() => { setShowForm(true); setError('') }}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
          + Nouveau client
        </button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Rechercher un client..."
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 20, boxSizing: 'border-box' }} />

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>Nouveau client</h3>
            {error && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}
            {[['nom', 'Nom *'], ['contact', 'Contact'], ['email', 'Email'], ['telephone', 'Téléphone'], ['adresse', 'Adresse']].map(([key, label]) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>{label}</label>
                <input value={form[key]} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button onClick={() => { setShowForm(false); setError('') }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={creerClient}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>Créer</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Chargement...</div>
        : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏛</div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Aucun client</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(c => (
              <div key={c.id} onClick={() => ouvrirClient(c)}
                style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🏛</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{c.nom}</div>
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                    {[c.contact, c.email, c.telephone].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>→</span>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
