import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useIsMobile } from '../lib/useIsMobile'

const STATUTS = ['Devis envoyé', 'Devis signé', 'En cours', 'Finalisation', 'Clôturé']
const STATUT_STYLE = {
  'Devis envoyé': { bg: '#FFF7ED', color: '#EA580C', icon: '📤' },
  'Devis signé':  { bg: '#F5F3FF', color: '#7C3AED', icon: '✍️' },
  'En cours':     { bg: '#EFF6FF', color: '#2563EB', icon: '🔨' },
  'Finalisation': { bg: '#ECFDF5', color: '#059669', icon: '✅' },
  'Clôturé':      { bg: '#F3F4F6', color: '#6B7280', icon: '🏁' },
}

export default function Projets() {
  const [projets, setProjets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('Tous')
  const [showForm, setShowForm] = useState(false)
  const [clients, setClients] = useState([])
  const [form, setForm] = useState({ nom: '', client_id: '', statut: 'Devis envoyé', date_debut: '', date_fin_prevue: '', notes: '' })
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('projets').select('*, clients(nom)').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('clients').select('id, nom').is('deleted_at', null).order('nom')
    ])
    setProjets(p || [])
    setClients(c || [])
    setLoading(false)
  }

  async function creerProjet() {
    setError('')
    if (!form.nom.trim()) { setError('Le nom est obligatoire.'); return }
    const { data, error } = await supabase.from('projets').insert([{
      nom: form.nom.trim(),
      client_id: form.client_id || null,
      statut: form.statut,
      date_debut: form.date_debut || null,
      date_fin_prevue: form.date_fin_prevue || null,
      notes: form.notes,
      montant_ht: 0,
    }]).select().single()
    if (error) { setError('Erreur : ' + error.message); return }
    setShowForm(false)
    // Remis à la même valeur que l'état initial ('Devis envoyé') — avant, ce
    // reset mettait 'En cours', donc un 2e projet créé juste après le 1er
    // démarrait silencieusement avec le mauvais statut par défaut.
    setForm({ nom: '', client_id: '', statut: 'Devis envoyé', date_debut: '', date_fin_prevue: '', notes: '' })
    navigate('/projets/' + data.id)
  }

  async function supprimerProjet(e, id) {
    e.stopPropagation()
    if (!confirm('Déplacer ce projet et toutes ses données vers la corbeille ? Tu pourras tout restaurer depuis la Corbeille pendant 30 jours.')) return
    // Suppression douce (deleted_at) en cascade, enfants puis parent, au
    // lieu d'un DELETE définitif — voir sql/06_corbeille_soft_delete.sql.
    // On vérifie l'erreur à chaque étape et on s'arrête immédiatement en
    // cas d'échec, pour ne jamais marquer le projet supprimé alors que des
    // données enfants n'ont pas pu être mises à jour (ou l'inverse).
    const maintenant = new Date().toISOString()
    const etapes = [
      ['projet_lignes', 'projet_id'],
      ['commandes', 'projet_id'],
      ['factures_frs', 'projet_id'],
      ['factures_cli', 'projet_id'],
      ['projets', 'id'],
    ]
    for (const [table, colonne] of etapes) {
      const { error } = await supabase.from(table).update({ deleted_at: maintenant }).eq(colonne, id)
      if (error) {
        alert('Erreur lors de la suppression (' + table + ') : ' + error.message + '\n\nLa suppression a été interrompue — vérifie l\'état du projet avant de réessayer.')
        fetchAll()
        return
      }
    }
    fetchAll()
  }

  const filtered = projets.filter(p => {
    const matchSearch = p.nom?.toLowerCase().includes(search.toLowerCase()) || p.clients?.nom?.toLowerCase().includes(search.toLowerCase())
    return matchSearch && (filtreStatut === 'Tous' || p.statut === filtreStatut)
  })

  const fmt = n => n ? Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €' : '—'

  return (
    <div style={{ padding: isMobile ? 14 : 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Projets</h2>
        <button onClick={() => { setShowForm(true); setError('') }}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
          + Nouveau projet
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10, marginBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un projet..."
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
          <option>Tous</option>
          {STATUTS.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '14px 14px 0 0' : 14, padding: isMobile ? 20 : 28, width: isMobile ? '100%' : 500, maxWidth: '100%', maxHeight: isMobile ? '90vh' : 'none', overflow: 'auto', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>Nouveau projet</h3>
            {error && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Nom du projet *</label>
            <input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))}
              placeholder="Ex: Aménagement bureaux Tour Eiffel"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', marginBottom: 14 }} />

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Client</label>
            <select value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
              <option value=''>— Aucun —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Date début</label>
                <input type="date" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Date fin prévue</label>
                <input type="date" value={form.date_fin_prevue} onChange={e => setForm(p => ({ ...p, date_fin_prevue: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Statut</label>
            <select value={form.statut} onChange={e => setForm(p => ({ ...p, statut: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
              {STATUTS.map(s => <option key={s}>{s}</option>)}
            </select>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setError('') }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={creerProjet}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>Créer</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Chargement...</div>
        : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Aucun projet</div>
            <div style={{ fontSize: 13 }}>Crée un projet ou génère-en un depuis un devis accepté</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(p => {
              const st = STATUT_STYLE[p.statut] || {}
              return (
                <div key={p.id} onClick={() => navigate('/projets/' + p.id)}
                  style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: isMobile ? '14px 16px' : '16px 20px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 16, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: '#111827', marginBottom: 3 }}>{p.nom}</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                      {p.clients?.nom ? '👤 ' + p.clients.nom : 'Sans client'}
                      {p.date_debut ? ' · 📅 ' + new Date(p.date_debut).toLocaleDateString('fr-FR') : ''}
                      {p.date_fin_prevue ? ' → ' + new Date(p.date_fin_prevue).toLocaleDateString('fr-FR') : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: isMobile ? 'left' : 'right', display: 'flex', flexDirection: isMobile ? 'row-reverse' : 'row', justifyContent: isMobile ? 'space-between' : 'flex-start', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', marginBottom: 4 }}>{fmt(p.montant_ht)}</div>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: st.bg, color: st.color, fontWeight: 500 }}>{st.icon} {p.statut}</span>
                    </div>
                    <button onClick={e => supprimerProjet(e, p.id)}
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>
                      🗑
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}
