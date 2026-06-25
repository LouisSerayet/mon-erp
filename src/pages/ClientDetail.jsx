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

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [projets, setProjets] = useState([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('infos')

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('projets').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    ])
    setClient(c)
    setForm(c || {})
    setProjets(p || [])
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    await supabase.from('clients').update(form).eq('id', id)
    setSaving(false)
    setEdit(false)
    fetchAll()
  }

  async function deleteClient() {
    if (!window.confirm('Supprimer ce client ?')) return
    await supabase.from('clients').delete().eq('id', id)
    navigate('/clients')
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Chargement...</div>
  if (!client) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Client introuvable.</div>

  const totalCA = projets.reduce((s, p) => s + (p.montant_ht || 0), 0)
  const enCours = projets.filter(p => p.statut === 'En cours').length

  const pillStyle = (statut) => {
    if (statut === 'En cours') return { bg: '#EAF3DE', color: '#3B6D11' }
    if (statut === 'Finalisation') return { bg: '#FAEEDA', color: '#854F0B' }
    return { bg: '#F1EFE8', color: '#5F5E5A' }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/clients')} style={{ background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', fontSize: 13 }}>← Clients</button>
        <span style={{ color: '#ddd' }}>/</span>
        <span style={{ fontSize: 13, color: '#888' }}>{client.raison_sociale}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500 }}>{client.raison_sociale}</h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            {client.nature && <span style={{ background: '#E6F1FB', color: '#185FA5', padding: '2px 8px', borderRadius: 8, fontSize: 12, marginRight: 8 }}>{client.nature}</span>}
            {client.ville || ''} {client.code_postal || ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {edit ? (
            <>
              <button onClick={() => { setEdit(false); setForm(client) }}
                style={{ padding: '8px 14px', border: '0.5px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={save} disabled={saving}
                style={{ padding: '8px 14px', border: 'none', borderRadius: 8, background: '#185FA5', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                {saving ? 'Enregistrement...' : 'Sauvegarder'}
              </button>
            </>
          ) : (
            <>
              <button onClick={deleteClient}
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
          { label: 'Total projets', value: projets.length },
          { label: 'En cours', value: enCours, color: '#3B6D11' },
          { label: 'CA total HT', value: totalCA.toLocaleString('fr-FR') + ' EUR' },
          { label: 'CA moyen / projet', value: projets.length > 0 ? Math.round(totalCA / projets.length).toLocaleString('fr-FR') + ' EUR' : '—' },
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
          { key: 'projets', label: 'Projets (' + projets.length + ')' },
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
            <Field label="Code client" value={form.code_client} edit={edit} onChange={v => setForm({ ...form, code_client: v })} />
            <Field label="Contact" value={form.contact_nom} edit={edit} onChange={v => setForm({ ...form, contact_nom: v })} />
            <Field label="Email" value={form.contact_email} edit={edit} onChange={v => setForm({ ...form, contact_email: v })} type="email" />
            <Field label="Telephone" value={form.contact_tel} edit={edit} onChange={v => setForm({ ...form, contact_tel: v })} />
            <Field label="Nature" value={form.nature} edit={edit} onChange={v => setForm({ ...form, nature: v })} />
            <Field label="Adresse" value={form.adresse} edit={edit} onChange={v => setForm({ ...form, adresse: v })} />
            <Field label="Ville" value={form.ville} edit={edit} onChange={v => setForm({ ...form, ville: v })} />
            <Field label="Code postal" value={form.code_postal} edit={edit} onChange={v => setForm({ ...form, code_postal: v })} />
            <Field label="Pays" value={form.pays} edit={edit} onChange={v => setForm({ ...form, pays: v })} />
          </div>
          {edit && (
            <div style={{ marginTop: 8 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Notes</label>
              <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3}
                style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13, resize: 'vertical' }} />
            </div>
          )}
          {!edit && client.notes && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '0.5px solid #f0f0f0' }}>
              <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>{client.notes}</div>
            </div>
          )}
        </div>
      )}

      {tab === 'projets' && (
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
          {projets.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Aucun projet pour ce client.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9f9f7' }}>
                  {['Code', 'Nom', 'Statut', 'Montant HT', 'Markup', 'Service'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, fontSize: 11, color: '#888', textTransform: 'uppercase', borderBottom: '0.5px solid #e5e5e5' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projets.map(p => {
                  const ps = pillStyle(p.statut)
                  return (
                    <tr key={p.id} style={{ borderBottom: '0.5px solid #f0f0f0', cursor: 'pointer' }}
                      onClick={() => navigate('/projets/' + p.id)}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafaf8'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: '#888' }}>{p.code}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 500, color: '#185FA5' }}>{p.nom}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: ps.bg, color: ps.color, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 500 }}>{p.statut}</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>{(p.montant_ht || 0).toLocaleString('fr-FR')} EUR</td>
                      <td style={{ padding: '10px 14px' }}>{p.markup ? p.markup + '%' : '—'}</td>
                      <td style={{ padding: '10px 14px', color: '#555' }}>{p.service || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9f9f7' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', fontWeight: 500 }}>Total</td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{totalCA.toLocaleString('fr-FR')} EUR</td>
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
