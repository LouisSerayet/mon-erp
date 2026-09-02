import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../lib/useIsMobile'
import { fmtEUR as fmt, fmtDateFr as fmtDate } from '../lib/calculs'

// Page dédiée "Commandes fournisseurs" — vue de navigation/consultation,
// tous projets confondus (contrairement à l'onglet "Commandes" d'un projet,
// qui ne montre que celles de CE projet et sert à les créer/éditer). Le
// clic sur une ligne renvoie vers le projet concerné, avec la commande mise
// en évidence (tab + focusId, voir ProjetDetail.jsx).
const STATUTS = ['Brouillon', 'Validée', 'Annulée']
const STATUT_STYLE = {
  'Brouillon': { bg: '#F3F4F6', color: '#6B7280' },
  'Validée': { bg: '#ECFDF5', color: '#059669' },
  'Annulée': { bg: '#FEF2F2', color: '#DC2626' },
}
const TRIS = [
  { key: 'date_desc', label: 'Date (récent)' },
  { key: 'date_asc', label: 'Date (ancien)' },
  { key: 'montant_desc', label: 'Montant (élevé)' },
  { key: 'montant_asc', label: 'Montant (faible)' },
]

export default function CommandesFournisseurs() {
  const isMobile = useIsMobile()
  const location = useLocation()
  const navigate = useNavigate()
  const [commandes, setCommandes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(location.state?.q || '')
  const [statutsActifs, setStatutsActifs] = useState(() => {
    if (location.state?.statuts) return new Set(location.state.statuts)
    if (location.state?.statut) return new Set([location.state.statut])
    return new Set(STATUTS)
  })
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [tri, setTri] = useState('date_desc')

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('commandes')
        .select('id, numero, description, montant_ht, statut, date_commande, projet_id, projets(nom), fournisseurs(nom)')
        .is('deleted_at', null)
        .order('date_commande', { ascending: false })
      setCommandes(data || [])
      setLoading(false)
    })()
  }, [])

  function toggleStatut(s) {
    setStatutsActifs(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }

  function aller(c) {
    navigate('/projets/' + c.projet_id, { state: { tab: 'commandes', focusId: c.id } })
  }

  const filtrees = commandes.filter(c => {
    const matchSearch = !search ||
      c.numero?.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase()) ||
      c.fournisseurs?.nom?.toLowerCase().includes(search.toLowerCase()) ||
      c.projets?.nom?.toLowerCase().includes(search.toLowerCase())
    const matchStatut = statutsActifs.has(c.statut)
    const matchDateDebut = !dateDebut || (c.date_commande && c.date_commande >= dateDebut)
    const matchDateFin = !dateFin || (c.date_commande && c.date_commande <= dateFin)
    return matchSearch && matchStatut && matchDateDebut && matchDateFin
  }).sort((a, b) => {
    if (tri === 'montant_desc') return (b.montant_ht || 0) - (a.montant_ht || 0)
    if (tri === 'montant_asc') return (a.montant_ht || 0) - (b.montant_ht || 0)
    const da = a.date_commande || '', db = b.date_commande || ''
    return tri === 'date_asc' ? da.localeCompare(db) : db.localeCompare(da)
  })

  const enAttente = commandes.filter(c => c.statut === 'Brouillon').reduce((s, c) => s + (c.montant_ht || 0), 0)
  const validees = commandes.filter(c => c.statut === 'Validée').reduce((s, c) => s + (c.montant_ht || 0), 0)

  return (
    <div style={{ padding: isMobile ? 14 : 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Commandes fournisseurs</h2>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>Toutes les commandes fournisseurs, tous projets confondus</div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'En attente (brouillon)', value: fmt(enAttente), color: '#EA580C', bg: '#FFF7ED' },
          { label: 'Validées', value: fmt(validees), color: '#059669', bg: '#ECFDF5' },
          { label: 'Total commandes', value: commandes.length, color: '#2563EB', bg: '#EFF6FF' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 10, padding: '14px 18px', border: '1px solid ' + k.color + '30' }}>
            <div style={{ fontSize: 11, color: k.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 14, marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {STATUTS.map(s => {
            const st = STATUT_STYLE[s]
            const actif = statutsActifs.has(s)
            return (
              <button key={s} onClick={() => toggleStatut(s)}
                style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid ' + (actif ? st.color : '#E5E7EB'), background: actif ? st.bg : '#fff', color: actif ? st.color : '#9CA3AF', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                {actif ? '✓ ' : ''}{s}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="N°, description, fournisseur, projet..."
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
          <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} title="Date début"
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }} />
          <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} title="Date fin"
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }} />
          <select value={tri} onChange={e => setTri(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
            {TRIS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Liste */}
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Chargement...</div>
        : filtrees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🛒</div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Aucune commande fournisseur</div>
          </div>
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtrees.map(c => {
              const st = STATUT_STYLE[c.statut] || {}
              return (
                <div key={c.id} onClick={() => aller(c)}
                  style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{c.numero || '—'}</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: st.bg, color: st.color, fontWeight: 500, flexShrink: 0 }}>{c.statut}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.fournisseurs?.nom || '—'}{c.projets?.nom ? ' · ' + c.projets.nom : ''}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtDate(c.date_commande)}</span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>{fmt(c.montant_ht)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                  {['Fournisseur', 'Projet', 'N°', 'Description', 'Date', 'Montant HT', 'Statut'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Montant HT' ? 'right' : 'left', color: '#6B7280', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrees.map((c, i) => {
                  const st = STATUT_STYLE[c.statut] || {}
                  return (
                    <tr key={c.id} onClick={() => aller(c)}
                      style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFAFA'}>
                      <td style={{ padding: '11px 14px', fontWeight: 500, color: '#111827' }}>{c.fournisseurs?.nom || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#2563EB' }}>{c.projets?.nom || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#9CA3AF' }}>{c.numero || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#374151', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description || '—'}</td>
                      <td style={{ padding: '11px 14px', color: '#6B7280', whiteSpace: 'nowrap' }}>{fmtDate(c.date_commande)}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 600 }}>{fmt(c.montant_ht)}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: st.bg, color: st.color, fontWeight: 500 }}>{c.statut}</span>
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
