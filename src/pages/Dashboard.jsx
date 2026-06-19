import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [projets, setProjets] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: p }, { data: cf }, { data: ff }, { data: fc }] = await Promise.all([
      supabase.from('projets').select('*').order('created_at', { ascending: false }),
      supabase.from('commandes_fournisseurs').select('montant_ht, statut, cloturee'),
      supabase.from('factures_fournisseurs').select('montant_ht, paye, statut'),
      supabase.from('factures_clients').select('montant_ht, paye, statut, date_echeance'),
    ])

    const today = new Date().toISOString().slice(0, 10)
    const totalCA = (p || []).reduce((s, x) => s + (x.montant_ht || 0), 0)
    const totalCommandes = (cf || []).reduce((s, x) => s + (x.montant_ht || 0), 0)
    const totalFactureFrs = (ff || []).reduce((s, x) => s + (x.montant_ht || 0), 0)
    const totalPayeFrs = (ff || []).filter(x => x.paye).reduce((s, x) => s + (x.montant_ht || 0), 0)
    const totalFactureCli = (fc || []).reduce((s, x) => s + (x.montant_ht || 0), 0)
    const totalPayeCli = (fc || []).filter(x => x.paye).reduce((s, x) => s + (x.montant_ht || 0), 0)
    const enRetard = (fc || []).filter(x => !x.paye && x.date_echeance && x.date_echeance < today).length
    const cmdEnAttente = (cf || []).filter(x => x.statut === 'Attente validation').length
    const frsEnAttente = (ff || []).filter(x => x.statut === 'En attente').length

    setStats({
      totalCA, totalCommandes, totalFactureFrs, totalPayeFrs,
      totalFactureCli, totalPayeCli, enRetard, cmdEnAttente, frsEnAttente,
      nbProjets: (p || []).length,
      nbEnCours: (p || []).filter(x => x.statut === 'En cours').length,
      nbFinalisation: (p || []).filter(x => x.statut === 'Finalisation').length,
    })
    setProjets((p || []).slice(0, 8))
    setLoading(false)
  }

  const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0

  const ProgressBar = ({ value, color }) => (
    <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden', minWidth: 80 }}>
      <div style={{ height: '100%', width: Math.min(value, 100) + '%', background: color || '#185FA5', borderRadius: 3, transition: 'width 0.3s' }} />
    </div>
  )

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Chargement...</div>

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500 }}>Tableau de bord</h1>
        <p style={{ color: '#888', fontSize: 13, marginTop: 2 }}>Vue globale de ton activite</p>
      </div>

      {(stats.enRetard > 0 || stats.cmdEnAttente > 0 || stats.frsEnAttente > 0) && (
        <div style={{ background: '#FAEEDA', border: '0.5px solid #EF9F27', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#854F0B', fontWeight: 500 }}>Alertes :</span>
          {stats.enRetard > 0 && <span style={{ fontSize: 13, color: '#A32D2D' }}>{stats.enRetard} facture(s) client en retard</span>}
          {stats.cmdEnAttente > 0 && <span style={{ fontSize: 13, color: '#854F0B' }}>{stats.cmdEnAttente} commande(s) en attente de validation</span>}
          {stats.frsEnAttente > 0 && <span style={{ fontSize: 13, color: '#854F0B' }}>{stats.frsEnAttente} facture(s) frs en attente</span>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: '16px 18px', gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Projets</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Total', value: stats.nbProjets },
              { label: 'En cours', value: stats.nbEnCours, color: '#3B6D11' },
              { label: 'Finalisation', value: stats.nbFinalisation, color: '#854F0B' },
              { label: 'CA total HT', value: stats.totalCA.toLocaleString('fr-FR') + ' EUR', big: true },
            ].map(k => (
              <div key={k.label}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: k.big ? 22 : 18, fontWeight: 500, color: k.color || 'inherit' }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Achats fournisseurs</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: '#555' }}>Total commande</span>
              <span style={{ fontWeight: 500 }}>{stats.totalCommandes.toLocaleString('fr-FR')} EUR</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: '#555' }}>Total facture frs</span>
              <span style={{ fontWeight: 500 }}>{stats.totalFactureFrs.toLocaleString('fr-FR')} EUR</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
              <span style={{ color: '#555' }}>Paye frs</span>
              <span style={{ fontWeight: 500, color: '#3B6D11' }}>{stats.totalPayeFrs.toLocaleString('fr-FR')} EUR</span>
            </div>
            <ProgressBar value={pct(stats.totalPayeFrs, stats.totalFactureFrs)} color="#639922" />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{pct(stats.totalPayeFrs, stats.totalFactureFrs)}% paye</div>
          </div>
          <button onClick={() => navigate('/commandes')} style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Voir les commandes →
          </button>
        </div>

        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Facturation clients</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: '#555' }}>Total facture</span>
              <span style={{ fontWeight: 500 }}>{stats.totalFactureCli.toLocaleString('fr-FR')} EUR</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: '#555' }}>Encaisse</span>
              <span style={{ fontWeight: 500, color: '#3B6D11' }}>{stats.totalPayeCli.toLocaleString('fr-FR')} EUR</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
              <span style={{ color: '#555' }}>Reste a encaisser</span>
              <span style={{ fontWeight: 500, color: '#A32D2D' }}>{(stats.totalFactureCli - stats.totalPayeCli).toLocaleString('fr-FR')} EUR</span>
            </div>
            <ProgressBar value={pct(stats.totalPayeCli, stats.totalFactureCli)} color="#185FA5" />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{pct(stats.totalPayeCli, stats.totalFactureCli)}% encaisse</div>
          </div>
          <button onClick={() => navigate('/factures-cli')} style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Voir les factures →
          </button>
        </div>

        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Marge globale</div>
          <div style={{ fontSize: 28, fontWeight: 500, color: '#185FA5', marginBottom: 4 }}>
            {(stats.totalCA - stats.totalCommandes).toLocaleString('fr-FR')} EUR
          </div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
            Marge brute estimee : {pct(stats.totalCA - stats.totalCommandes, stats.totalCA)}%
          </div>
          <ProgressBar value={pct(stats.totalCA - stats.totalCommandes, stats.totalCA)} color="#1D9E75" />
        </div>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '0.5px solid #e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Projets recents</span>
          <button onClick={() => navigate('/projets')} style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer' }}>
            Voir tous →
          </button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9f9f7' }}>
              {['Code', 'Projet', 'Statut', 'CA HT', 'Markup', '% Fact.', '% Couts'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 500, fontSize: 11, color: '#888', textTransform: 'uppercase', borderBottom: '0.5px solid #e5e5e5' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projets.map(p => {
              const pillC = p.statut === 'En cours' ? { bg: '#EAF3DE', color: '#3B6D11' } : p.statut === 'Finalisation' ? { bg: '#FAEEDA', color: '#854F0B' } : { bg: '#F1EFE8', color: '#5F5E5A' }
              return (
                <tr key={p.id} style={{ borderBottom: '0.5px solid #f0f0f0', cursor: 'pointer' }}
                  onClick={() => navigate('/projets')}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafaf8'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '10px 14px', color: '#888', fontSize: 11, fontFamily: 'monospace' }}>{p.code}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{p.nom}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: pillC.bg, color: pillC.color, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 500 }}>{p.statut}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>{(p.montant_ht || 0).toLocaleString('fr-FR')} EUR</td>
                  <td style={{ padding: '10px 14px' }}>{p.markup ? p.markup + '%' : ''}</td>
                  <td style={{ padding: '10px 14px', color: '#888' }}>—</td>
                  <td style={{ padding: '10px 14px', color: '#888' }}>—</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
