import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [projets, setProjets] = useState([])
  const [cmdEnAttente, setCmdEnAttente] = useState([])
  const [facturesFrsAPayer, setFacturesFrsAPayer] = useState([])
  const [facturesCliAEncaisser, setFacturesCliAEncaisser] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: p }, { data: cmd }, { data: ffrs }, { data: fcli }] = await Promise.all([
      supabase.from('projets').select('*, clients(nom)').order('created_at', { ascending: false }),
      supabase.from('commandes').select('*, projets(nom), fournisseurs(nom)').in('statut', ['En attente', 'Envoyée']).order('created_at', { ascending: false }),
      supabase.from('factures_frs').select('*, projets(nom), fournisseurs(nom)').eq('statut', 'À payer').order('date_echeance', { ascending: true }),
      supabase.from('factures_cli').select('*, projets(nom)').in('statut', ['À envoyer', 'Envoyée']).order('date_echeance', { ascending: true }),
    ])

    const projetsData = p || []
    const cmdData = cmd || []
    const ffrsData = ffrs || []
    const fcliData = fcli || []

    const today = new Date()
    const totalCA = projetsData.reduce((s, x) => s + (x.montant_ht || 0), 0)
    const totalCommandes = cmdData.reduce((s, x) => s + (x.montant_ht || 0), 0)
    const totalFfrs = ffrsData.reduce((s, x) => s + (x.montant_ht || 0), 0)
    const totalFcli = fcliData.reduce((s, x) => s + (x.montant_ht || 0), 0)
    const ffrsEnRetard = ffrsData.filter(f => f.date_echeance && new Date(f.date_echeance) < today)
    const fcliEnRetard = fcliData.filter(f => f.statut === 'Envoyée' && f.date_echeance && new Date(f.date_echeance) < today)

    // Calcul marge globale sur tous les projets
    const { data: allCmd } = await supabase.from('commandes').select('montant_ht')
    const totalTousCmd = (allCmd || []).reduce((s, c) => s + (c.montant_ht || 0), 0)
    const margeGlobale = totalCA - totalTousCmd

    setStats({
      nbProjets: projetsData.length,
      nbEnCours: projetsData.filter(x => x.statut === 'En cours').length,
      nbFinalisation: projetsData.filter(x => x.statut === 'Finalisation').length,
      nbClotures: projetsData.filter(x => x.statut === 'Clôturé').length,
      totalCA,
      totalCommandes: totalTousCmd,
      totalFfrsAPayer: totalFfrs,
      totalFcliAEncaisser: totalFcli,
      nbFfrsEnRetard: ffrsEnRetard.length,
      nbFcliEnRetard: fcliEnRetard.length,
      margeGlobale,
      tauxMarge: totalCA > 0 ? ((margeGlobale / totalCA) * 100).toFixed(1) : 0,
    })
    setProjets(projetsData.filter(p => p.statut !== 'Clôturé').slice(0, 6))
    setCmdEnAttente(cmdData.slice(0, 5))
    setFacturesFrsAPayer(ffrsData.slice(0, 5))
    setFacturesCliAEncaisser(fcliData.slice(0, 5))
    setLoading(false)
  }

  const fmt = n => n ? Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €' : '—'
  const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—'

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement...</div>

  const STATUT_STYLE = {
    'En cours': { bg: '#EFF6FF', color: '#2563EB' },
    'Finalisation': { bg: '#FFF7ED', color: '#EA580C' },
    'Clôturé': { bg: '#F0FDF4', color: '#059669' },
  }

  return (
    <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Tableau de bord</h1>
        <p style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Alertes */}
      {(stats.nbFfrsEnRetard > 0 || stats.nbFcliEnRetard > 0) && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 20, alignItems: 'center' }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          {stats.nbFfrsEnRetard > 0 && <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 500 }}>{stats.nbFfrsEnRetard} facture(s) fournisseur en retard</span>}
          {stats.nbFcliEnRetard > 0 && <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 500 }}>{stats.nbFcliEnRetard} facture(s) client en retard</span>}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Projets actifs', value: stats.nbEnCours + stats.nbFinalisation, sub: stats.nbEnCours + ' en cours · ' + stats.nbFinalisation + ' finalisation', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
          { label: 'CA total HT', value: fmt(stats.totalCA), sub: stats.nbProjets + ' projets au total', color: '#059669', bg: '#F0FDF4', border: '#BBF7D0' },
          { label: 'Marge brute', value: fmt(stats.margeGlobale), sub: 'Taux : ' + stats.tauxMarge + '%', color: stats.margeGlobale >= 0 ? '#059669' : '#DC2626', bg: stats.margeGlobale >= 0 ? '#F0FDF4' : '#FEF2F2', border: stats.margeGlobale >= 0 ? '#BBF7D0' : '#FCA5A5' },
          { label: 'À encaisser', value: fmt(stats.totalFcliAEncaisser), sub: 'Factures clients non payées', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, border: '1px solid ' + k.border, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: k.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color, marginBottom: 4 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: k.color + '99' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Projets en cours */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>📋 Projets actifs</span>
            <button onClick={() => navigate('/projets')} style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer' }}>Voir tous →</button>
          </div>
          {projets.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Aucun projet actif</div>
          ) : (
            <div>
              {projets.map((p, i) => {
                const st = STATUT_STYLE[p.statut] || {}
                return (
                  <div key={p.id} onClick={() => navigate('/projets/' + p.id)}
                    style={{ padding: '12px 18px', borderBottom: i < projets.length - 1 ? '1px solid #F3F4F6' : 'none', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF' }}>{p.clients?.nom || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{fmt(p.montant_ht)}</div>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: st.bg, color: st.color, fontWeight: 500 }}>{p.statut}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Commandes en attente */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>🛒 Commandes en attente</span>
            <span style={{ fontSize: 12, color: '#6B7280' }}>{fmt(stats.totalCommandes)} total</span>
          </div>
          {cmdEnAttente.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Aucune commande en attente</div>
          ) : (
            <div>
              {cmdEnAttente.map((c, i) => (
                <div key={c.id} onClick={() => navigate('/projets/' + c.projet_id)}
                  style={{ padding: '12px 18px', borderBottom: i < cmdEnAttente.length - 1 ? '1px solid #F3F4F6' : 'none', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: '#111827', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.fournisseurs?.nom || '—'}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.projets?.nom} · {c.numero}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2563EB' }}>{fmt(c.montant_ht)}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>{c.statut}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Factures frs à payer */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>📄 Factures frs à payer</span>
            <span style={{ fontSize: 12, color: '#EA580C', fontWeight: 600 }}>{fmt(stats.totalFfrsAPayer)}</span>
          </div>
          {facturesFrsAPayer.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Aucune facture à payer ✓</div>
          ) : (
            <div>
              {facturesFrsAPayer.map((f, i) => {
                const enRetard = f.date_echeance && new Date(f.date_echeance) < new Date()
                return (
                  <div key={f.id} onClick={() => navigate('/projets/' + f.projet_id)}
                    style={{ padding: '12px 18px', borderBottom: i < facturesFrsAPayer.length - 1 ? '1px solid #F3F4F6' : 'none', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: enRetard ? '#FFF5F5' : '#fff' }}
                    onMouseEnter={e => e.currentTarget.style.background = enRetard ? '#FEE2E2' : '#F9FAFB'}
                    onMouseLeave={e => e.currentTarget.style.background = enRetard ? '#FFF5F5' : '#fff'}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, color: '#111827', marginBottom: 2 }}>{f.fournisseurs?.nom || '—'}</div>
                      <div style={{ fontSize: 11, color: enRetard ? '#DC2626' : '#9CA3AF' }}>
                        {enRetard ? '⚠️ En retard · ' : ''}Échéance : {fmtDate(f.date_echeance)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#EA580C', flexShrink: 0 }}>{fmt(f.montant_ht)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Factures clients à encaisser */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>💶 Factures clients à encaisser</span>
            <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>{fmt(stats.totalFcliAEncaisser)}</span>
          </div>
          {facturesCliAEncaisser.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Aucune facture en attente ✓</div>
          ) : (
            <div>
              {facturesCliAEncaisser.map((f, i) => {
                const enRetard = f.statut === 'Envoyée' && f.date_echeance && new Date(f.date_echeance) < new Date()
                return (
                  <div key={f.id} onClick={() => navigate('/projets/' + f.projet_id)}
                    style={{ padding: '12px 18px', borderBottom: i < facturesCliAEncaisser.length - 1 ? '1px solid #F3F4F6' : 'none', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: enRetard ? '#FFF5F5' : '#fff' }}
                    onMouseEnter={e => e.currentTarget.style.background = enRetard ? '#FEE2E2' : '#F9FAFB'}
                    onMouseLeave={e => e.currentTarget.style.background = enRetard ? '#FFF5F5' : '#fff'}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, color: '#111827', marginBottom: 2 }}>{f.projets?.nom || '—'}</div>
                      <div style={{ fontSize: 11, color: enRetard ? '#DC2626' : '#9CA3AF' }}>
                        {f.numero} · {enRetard ? '⚠️ En retard · ' : ''}{f.statut === 'À envoyer' ? 'À envoyer' : 'Échéance : ' + fmtDate(f.date_echeance)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#059669', flexShrink: 0 }}>{fmt(f.montant_ht)}</div>
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
