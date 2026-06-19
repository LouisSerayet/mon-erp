import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const Section = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      <div onClick={() => setOpen(!open)} style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: open ? '0.5px solid #e5e5e5' : 'none', background: '#f9f9f7' }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
        <span style={{ color: '#aaa', fontSize: 16 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <div style={{ padding: '16px 18px' }}>{children}</div>}
    </div>
  )
}

const Field = ({ label, value, edit, onChange, type = 'text', half }) => (
  <div style={{ marginBottom: 14, width: half ? '48%' : '100%' }}>
    <label style={{ display: 'block', fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</label>
    {edit ? (
      type === 'textarea' ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={3}
          style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13, resize: 'vertical' }} />
      ) : (
        <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
          style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
      )
    ) : (
      <div style={{ fontSize: 13, color: value ? '#1a1a1a' : '#bbb', padding: '2px 0' }}>{value || '—'}</div>
    )}
  </div>
)

const PctBar = ({ label, value, color }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: 12, color: '#555' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color }}>{value || 0}%</span>
    </div>
    <div style={{ height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: Math.min(value || 0, 100) + '%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
    </div>
  </div>
)

export default function ProjetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [projet, setProjet] = useState(null)
  const [lots, setLots] = useState([])
  const [factures_cli, setFacturesCli] = useState([])
  const [factures_frs, setFacturesFrs] = useState([])
  const [commandes, setCommandes] = useState([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('infos')
  const [showLotForm, setShowLotForm] = useState(false)
  const [lotForm, setLotForm] = useState({ description: '', vente_ht: '', cout_ht: '', pct_facturation: '' })

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [{ data: p }, { data: l }, { data: fc }, { data: ff }, { data: cf }] = await Promise.all([
      supabase.from('projets').select('*').eq('id', id).single(),
      supabase.from('lots_projet').select('*').eq('projet_id', id).order('ordre'),
      supabase.from('factures_clients').select('*').eq('projet_id', id),
      supabase.from('factures_fournisseurs').select('*, fournisseurs(raison_sociale)').eq('projet_id', id),
      supabase.from('commandes_fournisseurs').select('*, fournisseurs(raison_sociale)').eq('projet_id', id),
    ])
    setProjet(p)
    setForm(p || {})
    setLots(l || [])
    setFacturesCli(fc || [])
    setFacturesFrs(ff || [])
    setCommandes(cf || [])
    setLoading(false)
  }

  async function saveProjet() {
    setSaving(true)
    await supabase.from('projets').update(form).eq('id', id)
    setSaving(false)
    setEdit(false)
    fetchAll()
  }

  async function saveLot(e) {
    e.preventDefault()
    await supabase.from('lots_projet').insert([{ ...lotForm, projet_id: id, vente_ht: parseFloat(lotForm.vente_ht) || 0, cout_ht: parseFloat(lotForm.cout_ht) || 0, pct_facturation: parseFloat(lotForm.pct_facturation) || 0, ordre: lots.length + 1 }])
    setShowLotForm(false)
    setLotForm({ description: '', vente_ht: '', cout_ht: '', pct_facturation: '' })
    fetchAll()
  }

  async function deleteLot(lotId) {
    if (!window.confirm('Supprimer ce lot ?')) return
    await supabase.from('lots_projet').delete().eq('id', lotId)
    fetchAll()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Chargement...</div>
  if (!projet) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Projet introuvable.</div>

  const totalFactureCli = factures_cli.reduce((s, f) => s + (f.montant_ht || 0), 0)
  const totalPayeCli = factures_cli.filter(f => f.paye).reduce((s, f) => s + (f.montant_ht || 0), 0)
  const totalCommandes = commandes.reduce((s, c) => s + (c.montant_ht || 0), 0)
  const totalFactureFrs = factures_frs.reduce((s, f) => s + (f.montant_ht || 0), 0)
  const totalPayeFrs = factures_frs.filter(f => f.paye).reduce((s, f) => s + (f.montant_ht || 0), 0)
  const margeEstimee = (projet.montant_ht || 0) - totalCommandes
  const pctMarge = projet.montant_ht > 0 ? Math.round((margeEstimee / projet.montant_ht) * 100) : 0

  const frsStats = {}
  commandes.forEach(c => {
    const nom = c.fournisseurs?.raison_sociale || 'Inconnu'
    if (!frsStats[nom]) frsStats[nom] = { achat: 0, facture: 0 }
    frsStats[nom].achat += c.montant_ht || 0
  })
  factures_frs.forEach(f => {
    const nom = f.fournisseurs?.raison_sociale || 'Inconnu'
    if (!frsStats[nom]) frsStats[nom] = { achat: 0, facture: 0 }
    frsStats[nom].facture += f.montant_ht || 0
  })

  const statusColor = projet.statut === 'En cours' ? { bg: '#EAF3DE', color: '#3B6D11' } : projet.statut === 'Finalisation' ? { bg: '#FAEEDA', color: '#854F0B' } : { bg: '#F1EFE8', color: '#5F5E5A' }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/projets')} style={{ background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', fontSize: 13 }}>← Projets</button>
        <span style={{ color: '#ddd' }}>/</span>
        <span style={{ fontSize: 13, color: '#888' }}>{projet.code}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 500 }}>{projet.nom}</h1>
            <span style={{ background: statusColor.bg, color: statusColor.color, padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 500 }}>{projet.statut}</span>
          </div>
          <p style={{ fontSize: 13, color: '#888' }}>{projet.code} · {projet.client_nom || 'Aucun client'} · {projet.service || ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {edit ? (
            <>
              <button onClick={() => { setEdit(false); setForm(projet) }} style={{ padding: '8px 14px', border: '0.5px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={saveProjet} disabled={saving} style={{ padding: '8px 14px', border: 'none', borderRadius: 8, background: '#185FA5', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                {saving ? 'Enregistrement...' : 'Sauvegarder'}
              </button>
            </>
          ) : (
            <button onClick={() => setEdit(true)} style={{ padding: '8px 14px', border: '0.5px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Modifier</button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '0.5px solid #e5e5e5', paddingBottom: 0 }}>
        {[
          { key: 'infos', label: 'Informations' },
          { key: 'rentabilite', label: 'Rentabilite' },
          { key: 'tresorerie', label: 'Suivi tresorerie' },
          { key: 'lots', label: 'Lots / POC' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '9px 16px', border: 'none', borderBottom: tab === t.key ? '2px solid #185FA5' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, color: tab === t.key ? '#185FA5' : '#555', fontWeight: tab === t.key ? 500 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'infos' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Montant HT', value: (projet.montant_ht || 0).toLocaleString('fr-FR') + ' EUR' },
              { label: 'Marge estimee', value: margeEstimee.toLocaleString('fr-FR') + ' EUR (' + pctMarge + '%)' },
              { label: 'Total commandes', value: totalCommandes.toLocaleString('fr-FR') + ' EUR' },
              { label: 'Facture client', value: totalFactureCli.toLocaleString('fr-FR') + ' EUR' },
            ].map(k => (
              <div key={k.label} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{k.value}</div>
              </div>
            ))}
          </div>

          <Section title="Contact client">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 4%' }}>
              <Field label="Raison sociale" value={form.client_nom} edit={edit} onChange={v => setForm({ ...form, client_nom: v })} half />
              <Field label="Contact" value={form.client_contact} edit={edit} onChange={v => setForm({ ...form, client_contact: v })} half />
              <Field label="Adresse" value={form.client_adresse} edit={edit} onChange={v => setForm({ ...form, client_adresse: v })} />
            </div>
          </Section>

          <Section title="Informations generales">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 4%' }}>
              <Field label="Montant HT (EUR)" value={form.montant_ht} edit={edit} onChange={v => setForm({ ...form, montant_ht: parseFloat(v) || 0 })} type="number" half />
              <Field label="Markup (%)" value={form.markup} edit={edit} onChange={v => setForm({ ...form, markup: parseFloat(v) || 0 })} type="number" half />
              <Field label="Surface (m2)" value={form.surface} edit={edit} onChange={v => setForm({ ...form, surface: parseFloat(v) || 0 })} type="number" half />
              <Field label="Type d'actif" value={form.type_actif} edit={edit} onChange={v => setForm({ ...form, type_actif: v })} half />
              <Field label="Date de debut" value={form.date_debut} edit={edit} onChange={v => setForm({ ...form, date_debut: v })} type="date" half />
              <Field label="Date de fin estimee" value={form.date_fin} edit={edit} onChange={v => setForm({ ...form, date_fin: v })} type="date" half />
              <Field label="Date de fin reelle" value={form.date_fin_reelle} edit={edit} onChange={v => setForm({ ...form, date_fin_reelle: v })} type="date" half />
              <Field label="Service" value={form.service} edit={edit} onChange={v => setForm({ ...form, service: v })} half />
              <Field label="Business line" value={form.business_line} edit={edit} onChange={v => setForm({ ...form, business_line: v })} half />
              <Field label="Code contrat" value={form.code_contrat} edit={edit} onChange={v => setForm({ ...form, code_contrat: v })} half />
              <Field label="Reference interne" value={form.reference_interne} edit={edit} onChange={v => setForm({ ...form, reference_interne: v })} half />
              <Field label="Devise" value={form.devise} edit={edit} onChange={v => setForm({ ...form, devise: v })} half />
            </div>
          </Section>

          <Section title="Notes">
            <Field label="" value={form.notes} edit={edit} onChange={v => setForm({ ...form, notes: v })} type="textarea" />
          </Section>
        </>
      )}

      {tab === 'rentabilite' && (
        <>
          <Section title="Devis initial">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9f9f7' }}>
                  {['', 'Vente HT', 'Achat HT', 'Marge brute', 'Coefficient', '% Marge'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: h ? 'right' : 'left', fontWeight: 500, fontSize: 11, color: '#888', textTransform: 'uppercase', borderBottom: '0.5px solid #e5e5e5' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>Total</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{(projet.montant_ht || 0).toLocaleString('fr-FR')} EUR</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{totalCommandes.toLocaleString('fr-FR')} EUR</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: margeEstimee >= 0 ? '#3B6D11' : '#A32D2D', fontWeight: 500 }}>{margeEstimee.toLocaleString('fr-FR')} EUR</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{totalCommandes > 0 ? ((projet.montant_ht || 0) / totalCommandes).toFixed(2) : '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>{pctMarge}%</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section title="En cours — par fournisseur">
            {Object.keys(frsStats).length === 0 ? (
              <p style={{ color: '#888', fontSize: 13 }}>Aucune commande fournisseur sur ce projet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9f9f7' }}>
                    {['Fournisseur', 'Achat HT', 'Facture HT', 'Ecart', '% Avancement'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Fournisseur' ? 'left' : 'right', fontWeight: 500, fontSize: 11, color: '#888', textTransform: 'uppercase', borderBottom: '0.5px solid #e5e5e5' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(frsStats).map(([nom, s]) => {
                    const ecart = s.achat - s.facture
                    const pct = s.achat > 0 ? Math.round((s.facture / s.achat) * 100) : 0
                    const barColor = pct >= 90 ? '#639922' : pct >= 50 ? '#BA7517' : '#E24B4A'
                    return (
                      <tr key={nom} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{nom}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{s.achat.toLocaleString('fr-FR')} EUR</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{s.facture.toLocaleString('fr-FR')} EUR</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: ecart > 0 ? '#854F0B' : '#3B6D11' }}>{ecart.toLocaleString('fr-FR')} EUR</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                            <div style={{ width: 60, height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: pct + '%', background: barColor, borderRadius: 3 }} />
                            </div>
                            <span style={{ color: barColor, fontWeight: 500, minWidth: 36 }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}

      {tab === 'tresorerie' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <Section title="Avancement du projet" defaultOpen={true}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 4%' }}>
                <div style={{ width: '48%' }}>
                  <label style={{ display: 'block', fontSize: 11, color: '#999', textTransform: 'uppercase', marginBottom: 4 }}>% Travaux</label>
                  {edit ? <input type="number" value={form.pct_travaux || ''} onChange={e => setForm({ ...form, pct_travaux: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} /> : null}
                </div>
                <div style={{ width: '48%' }}>
                  <label style={{ display: 'block', fontSize: 11, color: '#999', textTransform: 'uppercase', marginBottom: 4 }}>% Facturation</label>
                  {edit ? <input type="number" value={form.pct_facturation || ''} onChange={e => setForm({ ...form, pct_facturation: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} /> : null}
                </div>
                <div style={{ width: '48%', marginTop: 8 }}>
                  <label style={{ display: 'block', fontSize: 11, color: '#999', textTransform: 'uppercase', marginBottom: 4 }}>% CF</label>
                  {edit ? <input type="number" value={form.pct_cf || ''} onChange={e => setForm({ ...form, pct_cf: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} /> : null}
                </div>
                <div style={{ width: '48%', marginTop: 8 }}>
                  <label style={{ display: 'block', fontSize: 11, color: '#999', textTransform: 'uppercase', marginBottom: 4 }}>% Couts</label>
                  {edit ? <input type="number" value={form.pct_couts || ''} onChange={e => setForm({ ...form, pct_couts: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} /> : null}
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <PctBar label="% Travaux" value={projet.pct_travaux} color="#185FA5" />
                <PctBar label="% Facturation" value={projet.pct_facturation} color="#639922" />
                <PctBar label="% CF (Commandes)" value={projet.pct_cf} color="#BA7517" />
                <PctBar label="% Couts" value={projet.pct_couts} color="#D85A30" />
              </div>
            </Section>

            <Section title="Synthese financiere" defaultOpen={true}>
              {[
                { label: 'Montant total HT', value: (projet.montant_ht || 0).toLocaleString('fr-FR') + ' EUR', bold: true },
                { label: 'Total commande frs', value: totalCommandes.toLocaleString('fr-FR') + ' EUR' },
                { label: 'Total facture frs', value: totalFactureFrs.toLocaleString('fr-FR') + ' EUR' },
                { label: 'Paye frs', value: totalPayeFrs.toLocaleString('fr-FR') + ' EUR', color: '#3B6D11' },
                { label: 'Total facture client', value: totalFactureCli.toLocaleString('fr-FR') + ' EUR' },
                { label: 'Paye client', value: totalPayeCli.toLocaleString('fr-FR') + ' EUR', color: '#185FA5' },
                { label: 'Reste a facturer', value: ((projet.montant_ht || 0) - totalFactureCli).toLocaleString('fr-FR') + ' EUR', color: '#854F0B' },
              ].map(k => (
                <div key={k.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '0.5px solid #f5f5f5' }}>
                  <span style={{ fontSize: 13, color: '#555' }}>{k.label}</span>
                  <span style={{ fontSize: 13, fontWeight: k.bold ? 600 : 500, color: k.color || '#1a1a1a' }}>{k.value}</span>
                </div>
              ))}
            </Section>
          </div>

          <Section title="Suivi par fournisseur">
            {Object.keys(frsStats).length === 0 ? (
              <p style={{ color: '#888', fontSize: 13 }}>Aucune donnee fournisseur.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9f9f7' }}>
                    {['Fournisseur', 'Achat HT', 'FaV HT', 'HT facture', 'Ecart', 'Avancement'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Fournisseur' ? 'left' : 'right', fontWeight: 500, fontSize: 11, color: '#888', textTransform: 'uppercase', borderBottom: '0.5px solid #e5e5e5' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(frsStats).map(([nom, s]) => {
                    const ecart = s.achat - s.facture
                    const pct = s.achat > 0 ? Math.round((s.facture / s.achat) * 100) : 0
                    const barColor = pct >= 90 ? '#639922' : pct >= 50 ? '#BA7517' : '#E24B4A'
                    return (
                      <tr key={nom} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{nom}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{s.achat.toLocaleString('fr-FR')} EUR</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#888' }}>0 EUR</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{s.facture.toLocaleString('fr-FR')} EUR</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: ecart > 0 ? '#854F0B' : '#3B6D11' }}>{ecart.toLocaleString('fr-FR')} EUR</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                            <div style={{ width: 80, height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: pct + '%', background: barColor, borderRadius: 3 }} />
                            </div>
                            <span style={{ color: barColor, fontWeight: 500, minWidth: 40 }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}

      {tab === 'lots' && (
        <Section title="Lots du projet (POC)">
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowLotForm(true)} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
              + Ajouter un lot
            </button>
          </div>
          {lots.length === 0 ? (
            <p style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Aucun lot. Cliquez sur "+ Ajouter un lot".</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9f9f7' }}>
                  {['N', 'Description', 'Vente HT', 'Cout HT', 'Marge', '% Fact.', 'Action'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: ['Vente HT', 'Cout HT', 'Marge', '% Fact.'].includes(h) ? 'right' : 'left', fontWeight: 500, fontSize: 11, color: '#888', textTransform: 'uppercase', borderBottom: '0.5px solid #e5e5e5' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lots.map((l, i) => {
                  const marge = (l.vente_ht || 0) - (l.cout_ht || 0)
                  return (
                    <tr key={l.id} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                      <td style={{ padding: '10px 12px', color: '#888', fontSize: 11 }}>{i + 1}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{l.description}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{(l.vente_ht || 0).toLocaleString('fr-FR')} EUR</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{(l.cout_ht || 0).toLocaleString('fr-FR')} EUR</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: marge >= 0 ? '#3B6D11' : '#A32D2D', fontWeight: 500 }}>{marge.toLocaleString('fr-FR')} EUR</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{l.pct_facturation || 0}%</td>
                      <td style={{ padding: '10px 12px' }}>
                        <button onClick={() => deleteLot(l.id)} style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', fontSize: 12 }}>Suppr.</button>
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ background: '#f9f9f7', fontWeight: 500 }}>
                  <td colSpan={2} style={{ padding: '10px 12px' }}>Total</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{lots.reduce((s, l) => s + (l.vente_ht || 0), 0).toLocaleString('fr-FR')} EUR</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{lots.reduce((s, l) => s + (l.cout_ht || 0), 0).toLocaleString('fr-FR')} EUR</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#3B6D11' }}>{lots.reduce((s, l) => s + (l.vente_ht || 0) - (l.cout_ht || 0), 0).toLocaleString('fr-FR')} EUR</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          )}
          {showLotForm && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
              <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 480 }}>
                <h2 style={{ fontSize: 17, fontWeight: 500, marginBottom: 20 }}>Ajouter un lot</h2>
                <form onSubmit={saveLot}>
                  {[
                    { label: 'Description', key: 'description', required: true },
                    { label: 'Vente HT (EUR)', key: 'vente_ht', type: 'number' },
                    { label: 'Cout HT (EUR)', key: 'cout_ht', type: 'number' },
                    { label: '% Facturation', key: 'pct_facturation', type: 'number' },
                  ].map(f => (
                    <div key={f.key} style={{ marginBottom: 14 }}>
                      <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>{f.label}</label>
                      <input type={f.type || 'text'} value={lotForm[f.key]} onChange={e => setLotForm({ ...lotForm, [f.key]: e.target.value })} required={f.required}
                        style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button type="button" onClick={() => setShowLotForm(false)} style={{ flex: 1, padding: '9px', border: '0.5px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
                    <button type="submit" style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, background: '#185FA5', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Ajouter</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  )
}
