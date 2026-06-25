import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const METIERS = ['Électricité', 'Plomberie', 'CVC', 'Menuiserie', 'Cloisons', 'Sols', 'Peinture', 'Serrurerie', 'Informatique', 'Autre']

export default function Fournisseurs() {
  const [fournisseurs, setFournisseurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtreMetier, setFiltreMetier] = useState('Tous')
  const [showForm, setShowForm] = useState(false)
  const [fournisseurOuvert, setFournisseurOuvert] = useState(null)
  const [commandes, setCommandes] = useState([])
  const [form, setForm] = useState({ nom: '', contact: '', email: '', telephone: '', metier: '' })
  const [error, setError] = useState('')

  useEffect(() => { fetchFournisseurs() }, [])

  async function fetchFournisseurs() {
    setLoading(true)
    const { data } = await supabase.from('fournisseurs').select('*').order('nom')
    setFournisseurs(data || [])
    setLoading(false)
  }

  async function ouvrirFournisseur(f) {
    const { data } = await supabase
      .from('commandes')
      .select('*, projets(nom)')
      .eq('fournisseur_id', f.id)
      .order('created_at', { ascending: false })
    setCommandes(data || [])
    setFournisseurOuvert(f)
  }

  async function creerFournisseur() {
    setError('')
    if (!form.nom.trim()) { setError('Le nom est obligatoire.'); return }
    const { error } = await supabase.from('fournisseurs').insert([{ ...form }])
    if (error) { setError('Erreur : ' + error.message); return }
    setShowForm(false)
    setForm({ nom: '', contact: '', email: '', telephone: '', metier: '' })
    fetchFournisseurs()
  }

  async function supprimerFournisseur(id) {
    if (!confirm('Supprimer ce fournisseur ?')) return
    await supabase.from('fournisseurs').delete().eq('id', id)
    setFournisseurOuvert(null)
    fetchFournisseurs()
  }

  const metiersDispos = ['Tous', ...new Set(fournisseurs.map(f => f.metier).filter(Boolean))]
  const filtered = fournisseurs.filter(f => {
    const matchSearch = f.nom?.toLowerCase().includes(search.toLowerCase()) ||
      f.metier?.toLowerCase().includes(search.toLowerCase()) ||
      f.contact?.toLowerCase().includes(search.toLowerCase())
    return matchSearch && (filtreMetier === 'Tous' || f.metier === filtreMetier)
  })

  const fmt = n => n ? Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €' : '—'
  const totalCommandes = commandes.reduce((s, c) => s + (c.montant_ht || 0), 0)

  // ── Vue détail fournisseur ────────────────────────────────────
  if (fournisseurOuvert) {
    return (
      <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setFournisseurOuvert(null)}
            style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
            ← Retour
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{fournisseurOuvert.nom}</h2>
            {fournisseurOuvert.metier && (
              <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: '#EFF6FF', color: '#2563EB', fontWeight: 500 }}>
                {fournisseurOuvert.metier}
              </span>
            )}
          </div>
          <button onClick={() => supprimerFournisseur(fournisseurOuvert.id)}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontSize: 13 }}>
            Supprimer
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Infos contact */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 20 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Contact</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['👤 Contact', fournisseurOuvert.contact],
                ['✉️ Email', fournisseurOuvert.email],
                ['📞 Téléphone', fournisseurOuvert.telephone],
                ['🔧 Métier', fournisseurOuvert.metier],
              ].map(([label, val]) => val ? (
                <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#6B7280', minWidth: 100 }}>{label}</span>
                  <span style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>{val}</span>
                </div>
              ) : null)}
            </div>
          </div>

          {/* Stats */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 20 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Statistiques</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#2563EB' }}>Commandes</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1E40AF' }}>{commandes.length}</span>
              </div>
              <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#059669' }}>Total commandé</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#065F46' }}>{fmt(totalCommandes)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Historique commandes */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', fontSize: 14, fontWeight: 600 }}>
            Commandes liées
          </div>
          {commandes.length === 0 ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
              Aucune commande pour ce fournisseur
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Projet', 'N°', 'Description', 'Date', 'Montant HT', 'Statut'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: h === 'Montant HT' ? 'right' : 'left', color: '#6B7280', fontWeight: 500, borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commandes.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500, color: '#2563EB' }}>{c.projets?.nom || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#9CA3AF', fontSize: 12 }}>{c.numero || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{c.description}</td>
                    <td style={{ padding: '10px 14px', color: '#9CA3AF' }}>{c.date_commande ? new Date(c.date_commande).toLocaleDateString('fr-FR') : '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{fmt(c.montant_ht)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6,
                        background: c.statut === 'Reçue' ? '#ECFDF5' : c.statut === 'Annulée' ? '#FEF2F2' : '#EFF6FF',
                        color: c.statut === 'Reçue' ? '#059669' : c.statut === 'Annulée' ? '#DC2626' : '#2563EB',
                        fontWeight: 500 }}>{c.statut}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  // ── Liste fournisseurs ────────────────────────────────────────
  return (
    <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Fournisseurs</h2>
        <button onClick={() => { setShowForm(true); setError('') }}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
          + Nouveau fournisseur
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total fournisseurs', value: fournisseurs.length, color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Métiers', value: metiersDispos.length - 1, color: '#7C3AED', bg: '#F5F3FF' },
          { label: 'Ce mois', value: fournisseurs.filter(f => new Date(f.created_at) > new Date(Date.now() - 30*24*60*60*1000)).length, color: '#059669', bg: '#F0FDF4' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 10, padding: '14px 18px', border: '1px solid ' + k.color + '30' }}>
            <div style={{ fontSize: 11, color: k.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }} />
        <select value={filtreMetier} onChange={e => setFiltreMetier(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
          {metiersDispos.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* Modal nouveau fournisseur */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>Nouveau fournisseur</h3>
            {error && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}
            {[['nom', 'Nom *'], ['contact', 'Contact'], ['email', 'Email'], ['telephone', 'Téléphone']].map(([key, label]) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>{label}</label>
                <input value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Métier</label>
            <select value={form.metier} onChange={e => setForm(p => ({ ...p, metier: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 20, cursor: 'pointer' }}>
              <option value=''>— Sélectionner —</option>
              {METIERS.map(m => <option key={m}>{m}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setError('') }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={creerFournisseur}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>Créer</button>
            </div>
          </div>
        </div>
      )}

      {/* Liste */}
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Chargement...</div>
        : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Aucun fournisseur</div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                  {['Nom', 'Contact', 'Email', 'Téléphone', 'Métier'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#6B7280', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((f, i) => (
                  <tr key={f.id} onClick={() => ouvrirFournisseur(f)}
                    style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFAFA'}>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: '#111827' }}>{f.nom}</td>
                    <td style={{ padding: '11px 14px', color: '#6B7280' }}>{f.contact || '—'}</td>
                    <td style={{ padding: '11px 14px', color: '#6B7280' }}>{f.email || '—'}</td>
                    <td style={{ padding: '11px 14px', color: '#6B7280' }}>{f.telephone || '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      {f.metier ? (
                        <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 6, background: '#EFF6FF', color: '#2563EB', fontWeight: 500 }}>{f.metier}</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
