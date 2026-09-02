import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../lib/useIsMobile'
import { fmtEUR as fmt, fmtDateFr as fmtDate } from '../lib/calculs'
import { colors, fonts, eyebrow, marker } from '../lib/theme'

// Page dédiée "Commandes fournisseurs" — vue de navigation/consultation,
// tous projets confondus (contrairement à l'onglet "Commandes" d'un projet,
// qui ne montre que celles de CE projet et sert à les créer/éditer). Le
// clic sur une ligne renvoie vers le projet concerné, avec la commande mise
// en évidence (tab + focusId, voir ProjetDetail.jsx).
const STATUTS = ['Brouillon', 'Validée', 'Annulée']
const STATUT_MARKER = { 'Brouillon': colors.inkFaint, 'Validée': colors.success, 'Annulée': colors.danger }
const TRIS = [
  { key: 'date_desc', label: 'Date (récent)' },
  { key: 'date_asc', label: 'Date (ancien)' },
  { key: 'montant_desc', label: 'Montant (élevé)' },
  { key: 'montant_asc', label: 'Montant (faible)' },
]

const inputUnderline = {
  padding: '8px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}

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
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
      <p style={eyebrow}>Partenaires Particuliers</p>
      <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Commandes fournisseurs</h1>
      <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0' }}>Toutes les commandes fournisseurs, tous projets confondus</p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : 'repeat(3, 1fr)', gap: 24, margin: '36px 0 32px', paddingBottom: 24, borderBottom: '1px solid ' + colors.line }}>
        <div>
          <div style={eyebrow}>En attente (brouillon)</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 24, fontWeight: 500, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{fmt(enAttente)}</div>
        </div>
        <div>
          <div style={eyebrow}>Validées</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 24, fontWeight: 500, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{fmt(validees)}</div>
        </div>
        <div>
          <div style={eyebrow}>Total commandes</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 24, fontWeight: 500, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{commandes.length}</div>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 18 }}>
          {STATUTS.map(s => {
            const actif = statutsActifs.has(s)
            return (
              <button key={s} onClick={() => toggleStatut(s)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', padding: '0 0 4px', borderBottom: '2px solid ' + (actif ? STATUT_MARKER[s] : 'transparent'), cursor: 'pointer', fontFamily: fonts.display }}>
                <span style={marker(STATUT_MARKER[s])} />
                <span style={{ fontSize: 12.5, color: actif ? colors.ink : colors.inkFaint, fontWeight: actif ? 600 : 400 }}>{s}</span>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 20, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="N°, description, fournisseur, projet..."
            style={{ ...inputUnderline, flex: 2, minWidth: 160 }} />
          <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} title="Date début" style={{ ...inputUnderline, flex: 1 }} />
          <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} title="Date fin" style={{ ...inputUnderline, flex: 1 }} />
          <select value={tri} onChange={e => setTri(e.target.value)} style={{ ...inputUnderline, flex: 1, cursor: 'pointer' }}>
            {TRIS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Liste */}
      {loading ? <div style={{ textAlign: 'center', padding: 60, color: colors.inkFaint, fontSize: 13 }}>Chargement...</div>
        : filtrees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.ink }}>Aucune commande fournisseur</div>
          </div>
        ) : isMobile ? (
          <div>
            {filtrees.map(c => (
              <div key={c.id} onClick={() => aller(c)}
                style={{ borderTop: '1px solid ' + colors.line, padding: '14px 0', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{c.numero || '—'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.inkMuted }}>
                    <span style={marker(STATUT_MARKER[c.statut])} />{c.statut}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: colors.inkMuted, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.fournisseurs?.nom || '—'}{c.projets?.nom ? ' · ' + c.projets.nom : ''}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: colors.inkFaint }}>{fmtDate(c.date_commande)}</span>
                  <span style={{ fontFamily: fonts.mono, fontWeight: 500, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{fmt(c.montant_ht)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Fournisseur', 'Projet', 'N°', 'Description', 'Date', 'Montant HT', 'Statut'].map(h => (
                  <th key={h} style={{ padding: '0 14px 10px 0', textAlign: h === 'Montant HT' ? 'right' : 'left', color: colors.inkFaint, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap', borderBottom: '1px solid ' + colors.line }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrees.map(c => (
                <tr key={c.id} onClick={() => aller(c)} style={{ borderBottom: '1px solid ' + colors.line, cursor: 'pointer' }}>
                  <td style={{ padding: '12px 14px 12px 0', fontWeight: 500 }}>{c.fournisseurs?.nom || '—'}</td>
                  <td style={{ padding: '12px 14px', color: colors.inkMuted }}>{c.projets?.nom || '—'}</td>
                  <td style={{ padding: '12px 14px', color: colors.inkFaint }}>{c.numero || '—'}</td>
                  <td style={{ padding: '12px 14px', color: colors.inkMuted, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description || '—'}</td>
                  <td style={{ padding: '12px 14px', color: colors.inkMuted, whiteSpace: 'nowrap' }}>{fmtDate(c.date_commande)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(c.montant_ht)}</td>
                  <td style={{ padding: '12px 0 12px 14px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.inkMuted }}>
                      <span style={marker(STATUT_MARKER[c.statut])} />{c.statut}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  )
}
