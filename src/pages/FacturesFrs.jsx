import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function FacturesFrs() {
  const [factures, setFactures] = useState([])
  const [commandes, setCommandes] = useState([])
  const [projets, setProjets] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState('Tous')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    numero: '', commande_id: '', projet_id: '', fournisseur_id: '',
    statut: 'En attente', date_facture: new Date().toISOString().slice(0, 10),
    montant_ht: '', paye: false
  })

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: f }, { data: c }, { data: p }, { data: frs }] = await Promise.all([
      supabase.from('factures_fournisseurs').select('*, projets(nom, code), fournisseurs(raison_sociale), commandes_fournisseurs(code)').order('created_at', { ascending: false }),
      supabase.from('commandes_fournisseurs').select('id, code, montant_ht, fournisseur_id, projet_id').order('code'),
      supabase.from('projets').select('id, nom, code').order('nom'),
      supabase.from('fournisseurs').select('id, raison_sociale').order('raison_sociale'),
    ])
    setFactures(f || [])
    setCommandes(c || [])
    setProjets(p || [])
    setFournisseurs(frs || [])
    setLoading(false)
  }

  async function saveFacture(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('factures_fournisseurs').insert([{
      ...form,
      montant_ht: parseFloat(form.montant_ht) || 0,
      commande_id: form.commande_id || null,
      projet_id: form.projet_id || null,
      fournisseur_id: form.fournisseur_id || null,
    }])
    setSaving(false)
    setShowForm(false)
    setForm({ numero: '', commande_id: '', projet_id: '', fournisseur_id: '', statut: 'En attente', date_facture: new Date().toISOString().slice(0, 10), montant_ht: '', paye: false })
    fetchAll()
  }

  async function togglePaye(id, current) {
    await supabase.from('factures_fournisseurs').update({ paye: !current, statut: !current ? 'Payee' : 'Validee' }).eq('id', id)
    fetchAll()
  }

  async function updateStatut(id, statut) {
    await supabase.from('factures_fournisseurs').update({ statut }).eq('id', id)
    fetchAll()
  }

  const filtered = factures
    .filter(f => filtre === 'Tous' || f.statut === filtre)
    .filter(f =>
      (f.numero || '').toLowerCase().includes(search.toLowerCase()) ||
      (f.fournisseurs?.raison_sociale || '').toLowerCase().includes(search.toLowerCase()) ||
      (f.projets?.nom || '').toLowerCase().includes(search.toLowerCase())
    )

  const totalValide = factures.reduce((s, f) => s + (f.montant_ht || 0), 0)
  const totalPaye = factures.filter(f => f.paye).reduce((s, f) => s + (f.montant_ht || 0), 0)
  const resteAPayer = totalValide - totalPaye
  const enAttente = factures.filter(f => f.statut === 'En attente').length

  const pillColor = (s) => {
    if (s === 'Validee') return { bg: '#EAF3DE', color: '#3B6D11' }
    if (s === 'Payee') return { bg: '#E6F1FB', color: '#185FA5' }
    if (s === 'En attente') return { bg: '#FAEEDA', color: '#854F0B' }
    if (s === 'Refusee') return { bg: '#FCEBEB', color: '#A32D2D' }
    return { bg: '#eee', color: '#555' }
  }

  const pct = (val, total) => total > 0 ? Math.round((val / total) * 100) : 0

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Factures fournisseurs</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 2 }}>{factures.length} factures · Total {totalValide.toLocaleString('fr-FR')} EUR</p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
          + Nouvelle facture
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total factures HT', value: totalValide.toLocaleString('fr-FR') + ' EUR' },
          { label: 'Paye', value: totalPaye.toLocaleString('fr-FR') + ' EUR', sub: pct(totalPaye, totalValide) + '%' },
          { label: 'Reste a payer', value: resteAPayer.toLocaleString('fr-FR') + ' EUR', warn: resteAPayer > 0 },
          { label: 'En attente validation', value: enAttente, warn: enAttente > 0 },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: k.warn ? '#854F0B' : 'inherit' }}>{k.value}</div>
            {k.sub && <div style={{ fontSize: 11, color: '#3B6D11', marginTop: 2 }}>{k.sub} paye</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
          style={{ padding: '7px 12px', border: '0.5px solid #ddd', borderRadius: 8, fontSize: 13, width: 200, background: '#fff' }} />
        {['Tous', 'En attente', 'Validee', 'Payee', 'Refusee'].map(s => (
          <button key={s} onClick={() => setFiltre(s)}
            style={{ padding: '5px 12px', borderRadius: 20, border: '0.5px solid #ddd', fontSize: 12, cursor: 'pointer', background: filtre === s ? '#185FA5' : '#fff', color: filtre === s ? '#fff' : '#555', fontWeight: filtre === s ? 500 : 400 }}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Aucune facture.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9f9f7' }}>
                  {['N Facture', 'Projet', 'Fournisseur', 'Commande', 'Statut', 'Montant HT', 'Date', 'Paye', 'Action'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, fontSize: 11, color: '#888', textTransform: 'uppercase', borderBottom: '0.5px solid #e5e5e5', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => {
                  const pc = pillColor(f.statut)
                  return (
                    <tr key={f.id} style={{ borderBottom: '0.5px solid #f0f0f0' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafaf8'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 11, color: '#888' }}>{f.numero || ''}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 500, whiteSpace: 'nowrap' }}>{f.projets ? f.projets.nom : ''}</td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{f.fournisseurs ? f.fournisseurs.raison_sociale : ''}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#888' }}>{f.commandes_fournisseurs ? f.commandes_fournisseurs.code : ''}</td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <select value={f.statut} onChange={e => updateStatut(f.id, e.target.value)}
                          style={{ background: pc.bg, color: pc.color, border: 'none', borderRadius: 10, padding: '3px 8px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                          <option>En attente</option>
                          <option>Validee</option>
                          <option>Payee</option>
                          <option>Refusee</option>
                        </select>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 500, whiteSpace: 'nowrap' }}>{(f.montant_ht || 0).toLocaleString('fr-FR')} EUR</td>
                      <td style={{ padding: '10px 12px', color: '#888', whiteSpace: 'nowrap' }}>{f.date_facture || ''}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <button onClick={() => togglePaye(f.id, f.paye)}
                          style={{ background: f.paye ? '#EAF3DE' : '#F1EFE8', color: f.paye ? '#3B6D11' : '#888', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 500 }}>
                          {f.paye ? 'Oui' : 'Non'}
                        </button>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button onClick={async () => { if (window.confirm('Supprimer ?')) { await supabase.from('factures_fournisseurs').delete().eq('id', f.id); fetchAll() } }}
                          style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', fontSize: 12 }}>
                          Suppr.
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 520, maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 17, fontWeight: 500, marginBottom: 20 }}>Nouvelle facture fournisseur</h2>
            <form onSubmit={saveFacture}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Numero de facture</label>
                  <input value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} placeholder="ex: FAC-2026-001" required
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Projet</label>
                  <select value={form.projet_id} onChange={e => setForm({ ...form, projet_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                    <option value="">Selectionnez...</option>
                    {projets.map(p => <option key={p.id} value={p.id}>{p.code} - {p.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Fournisseur</label>
                  <select value={form.fournisseur_id} onChange={e => setForm({ ...form, fournisseur_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                    <option value="">Selectionnez...</option>
                    {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.raison_sociale}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Commande associee (optionnel)</label>
                  <select value={form.commande_id} onChange={e => setForm({ ...form, commande_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                    <option value="">Aucune</option>
                    {commandes.map(c => <option key={c.id} value={c.id}>{c.code} - {(c.montant_ht || 0).toLocaleString('fr-FR')} EUR</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Montant HT (EUR)</label>
                  <input type="number" value={form.montant_ht} onChange={e => setForm({ ...form, montant_ht: e.target.value })} placeholder="0"
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Date facture</label>
                  <input type="date" value={form.date_facture} onChange={e => setForm({ ...form, date_facture: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Statut</label>
                  <select value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                    <option>En attente</option>
                    <option>Validee</option>
                    <option>Payee</option>
                    <option>Refusee</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setShowForm(false)}
                  style={{ flex: 1, padding: '9px', border: '0.5px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, background: '#185FA5', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  {saving ? 'Enregistrement...' : 'Creer la facture'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
