import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../lib/useIsMobile'
import { fmtEUR as fmt, fmtDateFr as fmtDate } from '../lib/calculs'
import { colors, fonts, eyebrow, marker } from '../lib/theme'

// Page dédiée "Factures clients" — vue de navigation/consultation, tous
// projets confondus (contrairement à l'onglet "Factures clients" d'un
// projet, qui ne montre que celles de CE projet et sert à les créer/éditer).
// Le clic sur une ligne renvoie vers le projet concerné, avec la facture
// mise en évidence — même mécanisme (tab + focusId) que les cartes du
// Dashboard, voir ProjetDetail.jsx (focusId).
const STATUTS = ['À envoyer', 'Envoyée', 'Payée']
const STATUT_MARKER = { 'À envoyer': colors.inkFaint, 'Envoyée': colors.focus, 'Payée': colors.success }
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

export default function FacturesClients() {
  const isMobile = useIsMobile()
  const location = useLocation()
  const navigate = useNavigate()
  const [factures, setFactures] = useState([])
  const [loading, setLoading] = useState(true)
  // Pré-rempli si on arrive depuis un lien du Dashboard ou du menu — même
  // principe que Clients.jsx/Fournisseurs.jsx (state.q) ; state.statut
  // (une valeur) ou state.statuts (plusieurs) présélectionnent les chips de
  // statut ci-dessous.
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
      const { data } = await supabase.from('factures_cli')
        .select('id, numero, montant_ht, statut, date_facture, date_echeance, projet_id, projets(nom), clients(nom)')
        .is('deleted_at', null)
        .order('date_facture', { ascending: false })
      setFactures(data || [])
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

  function aller(f) {
    navigate('/projets/' + f.projet_id, { state: { tab: 'factures_cli', focusId: f.id } })
  }

  const filtrees = factures.filter(f => {
    const matchSearch = !search ||
      f.numero?.toLowerCase().includes(search.toLowerCase()) ||
      f.clients?.nom?.toLowerCase().includes(search.toLowerCase()) ||
      f.projets?.nom?.toLowerCase().includes(search.toLowerCase())
    const matchStatut = statutsActifs.has(f.statut)
    const matchDateDebut = !dateDebut || (f.date_facture && f.date_facture >= dateDebut)
    const matchDateFin = !dateFin || (f.date_facture && f.date_facture <= dateFin)
    return matchSearch && matchStatut && matchDateDebut && matchDateFin
  }).sort((a, b) => {
    if (tri === 'montant_desc') return (b.montant_ht || 0) - (a.montant_ht || 0)
    if (tri === 'montant_asc') return (a.montant_ht || 0) - (b.montant_ht || 0)
    const da = a.date_facture || '', db = b.date_facture || ''
    return tri === 'date_asc' ? da.localeCompare(db) : db.localeCompare(da)
  })

  const aEncaisser = factures.filter(f => f.statut !== 'Payée').reduce((s, f) => s + (f.montant_ht || 0), 0)
  const enRetard = factures.filter(f => f.statut === 'Envoyée' && f.date_echeance && new Date(f.date_echeance) < new Date())

  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
      <p style={eyebrow}>Partenaires Particuliers</p>
      <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Factures clients</h1>
      <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0' }}>Toutes les factures clients, tous projets confondus</p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : 'repeat(3, 1fr)', gap: 24, margin: '36px 0 32px', paddingBottom: 24, borderBottom: '1px solid ' + colors.line }}>
        <div>
          <div style={eyebrow}>À encaisser</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 24, fontWeight: 500, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{fmt(aEncaisser)}</div>
        </div>
        <div>
          <div style={eyebrow}>En retard</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 24, fontWeight: 500, marginTop: 8, fontVariantNumeric: 'tabular-nums', color: enRetard.length > 0 ? colors.danger : colors.ink }}>{enRetard.length}</div>
        </div>
        <div>
          <div style={eyebrow}>Total factures</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 24, fontWeight: 500, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{factures.length}</div>
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="N°, client, projet..."
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
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.ink }}>Aucune facture client</div>
          </div>
        ) : isMobile ? (
          <div>
            {filtrees.map(f => {
              const enRetardF = f.statut === 'Envoyée' && f.date_echeance && new Date(f.date_echeance) < new Date()
              return (
                <div key={f.id} onClick={() => aller(f)}
                  style={{ borderTop: '1px solid ' + colors.line, borderLeft: enRetardF ? '2px solid ' + colors.danger : 'none', padding: '14px 0 14px ' + (enRetardF ? '10px' : '0'), cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{f.numero}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.inkMuted }}>
                      <span style={marker(STATUT_MARKER[f.statut])} />{f.statut}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: colors.inkMuted, marginBottom: 5 }}>
                    {f.clients?.nom || '—'}{f.projets?.nom ? ' · ' + f.projets.nom : ''}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: enRetardF ? colors.danger : colors.inkFaint }}>
                      {enRetardF ? 'En retard · ' : ''}Échéance : {fmtDate(f.date_echeance)}
                    </span>
                    <span style={{ fontFamily: fonts.mono, fontWeight: 500, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{fmt(f.montant_ht)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Client', 'Projet', 'N°', 'Date', 'Échéance', 'Montant HT', 'Statut'].map(h => (
                  <th key={h} style={{ padding: '0 14px 10px 0', textAlign: h === 'Montant HT' ? 'right' : 'left', color: colors.inkFaint, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap', borderBottom: '1px solid ' + colors.line }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrees.map(f => {
                const enRetardF = f.statut === 'Envoyée' && f.date_echeance && new Date(f.date_echeance) < new Date()
                return (
                  <tr key={f.id} onClick={() => aller(f)}
                    style={{ borderBottom: '1px solid ' + colors.line, borderLeft: enRetardF ? '2px solid ' + colors.danger : 'none', cursor: 'pointer' }}>
                    <td style={{ padding: '12px 14px 12px ' + (enRetardF ? '12px' : '0'), fontWeight: 500 }}>{f.clients?.nom || '—'}</td>
                    <td style={{ padding: '12px 14px', color: colors.inkMuted }}>{f.projets?.nom || '—'}</td>
                    <td style={{ padding: '12px 14px', color: colors.inkFaint }}>{f.numero}</td>
                    <td style={{ padding: '12px 14px', color: colors.inkMuted, whiteSpace: 'nowrap' }}>{fmtDate(f.date_facture)}</td>
                    <td style={{ padding: '12px 14px', color: enRetardF ? colors.danger : colors.inkMuted, whiteSpace: 'nowrap' }}>
                      {fmtDate(f.date_echeance)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(f.montant_ht)}</td>
                    <td style={{ padding: '12px 0 12px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.inkMuted }}>
                        <span style={marker(STATUT_MARKER[f.statut])} />{f.statut}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
    </div>
  )
}
