import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const Field = ({ label, value, edit, onChange, type = 'text' }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</label>
    {edit ? (
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '7px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
    ) : (
      <div style={{ fontSize: 13, color: value ? '#1a1a1a' : '#bbb' }}>{value || '—'}</div>
    )}
  </div>
)

export default function FournisseurDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [fournisseur, setFournisseur] = useState(null)
  const [commandes, setCommandes] = useState([])
  const [factures, setFactures] = useState([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('infos')

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [{ data: f }, { data: c }, { data: fac }] = await Promise.all([
      supabase.from('fournisseurs').select('*').eq('id', id).single(),
      supabase.from('commandes_fournisseurs').select('*, projets(nom, code)').eq('fournisseur_id', id).order('created_at', { ascending: false }),
      supabase.from('factures_fournisseurs').select('*, projets(nom, code)').eq('fournisseur_id', id).order('created_at', { ascending: false }),
    ])
    setFournisseur(f)
    setForm(f || {})
    setCommandes(c || [])
    setFactures(fac || [])
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    await supabase.from('fournisseurs').update(form).eq('id', id)
    setSaving(false)
    setEdit(false)
    fetchAll()
  }

  async function deleteFournisseur() {
    if (!window.confirm('Supprimer ce fournisseur ? Cette action est irreversible.')) return
    await supabase.from('fournisseurs').delete().eq('id', id)
    navigate('/fournisseurs')
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Chargement...</div>
  if (!fournisseur) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Fournisseur introuvable.</div>

  const totalCommandes = commandes.reduce((s, c) => s + (c.montant_ht || 0), 0)
  const totalFactures = factures.reduce((s, f) => s + (f.montant_ht || 0), 0)
  const totalPaye = factures.filter(f => f.paye).reduce((s, f) => s + (f.montant_ht || 0), 0)
  const resteAPayer = totalFactures - totalPaye

  const pillColor = (s) => {
    if (s === 'Validee niv 2') return { bg: '#EAF3DE', color: '#3B6D11' }
    if (s === 'Validee niv 1') return { bg: '#E6F1FB', color: '#185FA5' }
    if (s === 'Brouillon') return { bg: '#F1EFE8', color: '#5F5E5A' }
    if (s === 'Attente validation') return { bg: '#FAEEDA', color: '#854F0B' }
    if (s === 'Annulee') return { bg: '#FCEBEB', color: '#A32D2D' }
    return { bg: '#eee', color: '#555' }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/fournisseurs')} style={{ background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', fontSize: 13 }}>← Fournisseurs</button>
        <span style={{ color: '#ddd' }}>/</span>
        <span style={{ fontSize: 13, color: '#888' }}>{fournisseur.raison_sociale}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500 }}>{fournisseur.raison_sociale}</h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            {fournisseur.categorie && <span style={{ background: '#E6F1FB', color: '#185FA5', padding: '2px 8px', borderRadius: 8, fontSize: 12, marginRight: 8 }}>{fournisseur.categorie}</span>}
            {fournisseur.contact || ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {edit ? (
            <>
              <button onClick={() => { setEdit(false); setForm(fournisseur) }}
                style={{ padding: '8px 14px', border: '0.5px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={save} disabled={saving}
                style={{ padding: '8px 14px', border: 'none', borderRadius: 8, background: '#185FA5', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                {saving ? 'Enregistrement...' : 'Sauvegarder'}
              </button>
            </>
          ) : (
            <>
              <button onClick={deleteFournisseur}
                style={{ padding: '8px 14px', border: '0.5px solid #E24B4A', borderRadius: 8, background: '#fff', color: '#E24B4A', cursor: 'pointer', fontSize: 13 }}>
                Supprimer
              </button>
              <button onClick={() => setEdit(true)}
                style={{ padding: '8px 14px', border: '0.5px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                Modifier
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total commande HT', value: totalCommandes.toLocaleString('fr-FR') + ' EUR' },
          { label: 'Total facture HT', value: totalFactures.toLocaleString('fr-FR') + ' EUR' },
          { label: 'Paye', value: totalPaye.toLocaleString('fr-FR') + ' EUR', color: '#3B6D11' },
          { label: 'Reste a payer', value: resteAPayer.toLocaleString('fr-FR') + ' EUR', color: resteAPayer > 0 ? '#854F0B' : '#3B6D11' },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: k.color || 'inherit' }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '0.5px solid #e5e5e5' }}>
        {[
          { key: 'infos', label: 'Informations' },
          { key: 'commandes', label: 'Commandes (' + commandes.length + ')' },
          { key: 'factures', label: 'Factures (' + factures.length + ')' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '9px 16px', border: 'none', borderBottom: tab === t.key ? '2px solid #185FA5' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, color: tab === t.key ? '#185FA5' : '#555', fontWeight: tab === t.key ? 500 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'infos' && (
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
            <Field label="Raison sociale" value={form.raison_sociale} edit={edit} onChange={v => setForm({ ...form, raison_sociale: v })} />
            <Field label="Contact" value={form.contact} edit={edit} onChange={v => setForm({ ...form, contact: v })} />
            <Field label="Categorie" value={form.categorie} edit={edit} onChange={v => setForm({ ...form, categorie: v })} />
          </div>
        </div>
      )}

      {tab === 'commandes' && (
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
          {commandes.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Aucune commande pour ce fournisseur.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9f9f7' }}>
                  {['Code CF', 'Projet', 'Statut', 'Montant HT', 'Date', 'Cloturee'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, fontSize: 11, color: '#888', textTransform: 'uppercase', borderBottom: '0.5px solid #e5e5e5' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commandes.map(c => {
                  const pc = pillColor(c.statut)
                  return (
                    <tr key={c.id} style={{ borderBottom: '0.5px solid #f0f0f0' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafaf8'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: '#888' }}>{c.code}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 500 }}>{c.projets ? c.projets.nom : ''}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: pc.bg, color: pc.color, padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 500 }}>{c.statut}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 500 }}>{(c.montant_ht || 0).toLocaleString('fr-FR')} EUR</td>
                      <td style={{ padding: '10px 14px', color: '#888' }}>{c.date_creation || ''}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: c.cloturee ? '#EAF3DE' : '#F1EFE8', color: c.cloturee ? '#3B6D11' : '#888', padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>
                          {c.cloturee ? 'Oui' : 'Non'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9f9f7' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', fontWeight: 500, fontSize: 13 }}>Total</td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{totalCommandes.toLocaleString('fr-FR')} EUR</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {tab === 'factures' && (
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
          {factures.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Aucune facture pour ce fournisseur.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9f9f7' }}>
                  {['N Facture', 'Projet', 'Statut', 'Montant HT', 'Date', 'Paye'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, fontSize: 11, color: '#888', textTransform: 'uppercase', borderBottom: '0.5px solid #e5e5e5' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {factures.map(f => (
                  <tr key={f.id} style={{ borderBottom: '0.5px solid #f0f0f0' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fafaf8'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: '#888' }}>{f.numero || ''}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{f.projets ? f.projets.nom : ''}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: f.statut === 'Validee' ? '#EAF3DE' : f.statut === 'Payee' ? '#E6F1FB' : '#FAEEDA', color: f.statut === 'Validee' ? '#3B6D11' : f.statut === 'Payee' ? '#185FA5' : '#854F0B', padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 500 }}>{f.statut}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{(f.montant_ht || 0).toLocaleString('fr-FR')} EUR</td>
                    <td style={{ padding: '10px 14px', color: '#888' }}>{f.date_facture || ''}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: f.paye ? '#EAF3DE' : '#F1EFE8', color: f.paye ? '#3B6D11' : '#888', padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>
                        {f.paye ? 'Oui' : 'Non'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9f9f7' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', fontWeight: 500 }}>Total</td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{totalFactures.toLocaleString('fr-FR')} EUR</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
