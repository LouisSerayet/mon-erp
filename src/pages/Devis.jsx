import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const UNITES = ['m2', 'm3', 'ml', 'u', 'ens', 'sem', 'VA', 'CA', 'forfait']
const TYPES = ['Negoce', 'Total', 'Chapitre']

const Modal = ({ title, onClose, onSave, value, onChange }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
    <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 380 }}>
      <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>{title}</h3>
      <input autoFocus value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSave()}
        placeholder="Nom..."
        style={{ width: '100%', padding: '9px 12px', border: '0.5px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '8px', border: '0.5px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
        <button onClick={onSave} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 8, background: '#1a1a1a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Ajouter</button>
      </div>
    </div>
  </div>
)

// Composant ligne éditable — état local pour éviter rechargement à chaque frappe
const LigneRow = ({ lg, index, fournisseurs, onSave, onDelete }) => {
  const [vals, setVals] = useState({
    description: lg.description || '',
    type: lg.type || 'Negoce',
    unite: lg.unite || 'u',
    quantite: lg.quantite ?? 1,
    prix_achat: lg.prix_achat ?? 0,
    coefficient: lg.coefficient ?? 1.21,
    prix_vente: lg.prix_vente ?? 0,
    fournisseur_id: lg.fournisseur_id || '',
  })

  useEffect(() => {
    setVals({
      description: lg.description || '',
      type: lg.type || 'Negoce',
      unite: lg.unite || 'u',
      quantite: lg.quantite ?? 1,
      prix_achat: lg.prix_achat ?? 0,
      coefficient: lg.coefficient ?? 1.21,
      prix_vente: lg.prix_vente ?? 0,
      fournisseur_id: lg.fournisseur_id || '',
    })
  }, [lg.id])

  function handleChange(field, value) {
    const next = { ...vals, [field]: value }
    if (field === 'prix_achat' || field === 'coefficient') {
      const pa = field === 'prix_achat' ? parseFloat(value) || 0 : parseFloat(vals.prix_achat) || 0
      const coef = field === 'coefficient' ? parseFloat(value) || 1 : parseFloat(vals.coefficient) || 1.21
      next.prix_vente = Math.round(pa * coef * 100) / 100
    }
    setVals(next)
  }

  function handleBlur(field) {
    onSave(lg.id, field, vals[field], vals)
  }

  const totalVente = (vals.prix_vente || 0) * (vals.quantite || 0)
  const inp = { border: 'none', background: 'transparent', fontSize: 12, width: '100%', padding: '2px 4px', borderRadius: 3, outline: 'none', fontFamily: 'inherit' }

  return (
    <tr style={{ borderBottom: '0.5px solid #f0f0f0' }}
      onMouseEnter={e => e.currentTarget.style.background = '#fafff7'}
      onMouseLeave={e => e.currentTarget.style.background = ''}>
      <td style={{ padding: '5px 10px', color: '#bbb', fontSize: 10 }}>{index}</td>
      <td style={{ padding: '5px 6px', minWidth: 70 }}>
        <select value={vals.type} onChange={e => { handleChange('type', e.target.value); onSave(lg.id, 'type', e.target.value, { ...vals, type: e.target.value }) }}
          style={{ ...inp, fontSize: 11 }}>
          {TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </td>
      <td style={{ padding: '5px 6px', minWidth: 220 }}>
        <input value={vals.description}
          onChange={e => handleChange('description', e.target.value)}
          onBlur={() => handleBlur('description')}
          onFocus={e => e.target.style.background = '#EEF5FF'}
          style={{ ...inp }} />
      </td>
      <td style={{ padding: '5px 6px', minWidth: 65 }}>
        <select value={vals.unite} onChange={e => { handleChange('unite', e.target.value); onSave(lg.id, 'unite', e.target.value, { ...vals, unite: e.target.value }) }}
          style={{ ...inp, fontSize: 11 }}>
          {UNITES.map(u => <option key={u}>{u}</option>)}
        </select>
      </td>
      <td style={{ padding: '5px 6px', minWidth: 60 }}>
        <input type="number" value={vals.quantite}
          onChange={e => handleChange('quantite', e.target.value)}
          onBlur={() => handleBlur('quantite')}
          onFocus={e => e.target.style.background = '#EEF5FF'}
          style={{ ...inp, textAlign: 'right' }} />
      </td>
      <td style={{ padding: '5px 6px', minWidth: 85 }}>
        <input type="number" value={vals.prix_achat}
          onChange={e => handleChange('prix_achat', e.target.value)}
          onBlur={() => onSave(lg.id, 'prix_achat', vals.prix_achat, vals)}
          onFocus={e => e.target.style.background = '#EEF5FF'}
          style={{ ...inp, textAlign: 'right' }} />
      </td>
      <td style={{ padding: '5px 6px', minWidth: 60 }}>
        <input type="number" step="0.01" value={vals.coefficient}
          onChange={e => handleChange('coefficient', e.target.value)}
          onBlur={() => onSave(lg.id, 'coefficient', vals.coefficient, vals)}
          onFocus={e => e.target.style.background = '#EEF5FF'}
          style={{ ...inp, textAlign: 'right' }} />
      </td>
      <td style={{ padding: '5px 10px', textAlign: 'right', color: '#185FA5', fontWeight: 500, minWidth: 85, fontSize: 12 }}>
        {(vals.prix_vente || 0).toLocaleString('fr-FR')}
      </td>
      <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 600, minWidth: 95 }}>
        {totalVente.toLocaleString('fr-FR')}
      </td>
      <td style={{ padding: '5px 6px', minWidth: 130 }}>
        <select value={vals.fournisseur_id} onChange={e => { handleChange('fournisseur_id', e.target.value); onSave(lg.id, 'fournisseur_id', e.target.value || null, { ...vals, fournisseur_id: e.target.value }) }}
          style={{ ...inp, fontSize: 11 }}>
          <option value="">—</option>
          {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.raison_sociale}</option>)}
        </select>
      </td>
      <td style={{ padding: '5px 6px', textAlign: 'right' }}>
        <button onClick={() => onDelete(lg.id)} style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </td>
    </tr>
  )
}

export default function Devis() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [projet, setProjet] = useState(null)
  const [chapitres, setChapitres] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [modalVal, setModalVal] = useState('')
  const [modalTarget, setModalTarget] = useState(null)
  const printRef = useRef()

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [{ data: p }, { data: ch }, { data: lots }, { data: lignes }, { data: frs }] = await Promise.all([
      supabase.from('projets').select('*').eq('id', id).single(),
      supabase.from('devis_chapitres').select('*').eq('projet_id', id).order('ordre'),
      supabase.from('devis_lots').select('*').eq('projet_id', id).order('ordre'),
      supabase.from('devis_lignes').select('*, fournisseurs(raison_sociale)').eq('projet_id', id).order('ordre'),
      supabase.from('fournisseurs').select('id, raison_sociale').order('raison_sociale'),
    ])
    const chapitresWithData = (ch || []).map(c => ({
      ...c,
      lots: (lots || []).filter(l => l.chapitre_id === c.id).map(l => ({
        ...l,
        lignes: (lignes || []).filter(lg => lg.lot_id === l.id)
      }))
    }))
    setProjet(p)
    setChapitres(chapitresWithData)
    setFournisseurs(frs || [])
    setLoading(false)
  }

  async function handleModalSave() {
    if (!modalVal.trim()) return
    if (modal === 'chapitre') {
      await supabase.from('devis_chapitres').insert([{ projet_id: id, titre: modalVal, ordre: chapitres.length + 1 }])
    } else if (modal === 'lot') {
      const ch = chapitres.find(c => c.id === modalTarget)
      await supabase.from('devis_lots').insert([{ projet_id: id, chapitre_id: modalTarget, titre: modalVal, ordre: (ch?.lots?.length || 0) + 1 }])
    }
    setModal(null); setModalVal(''); setModalTarget(null)
    fetchAll()
  }

  async function addLigne(lotId) {
    await supabase.from('devis_lignes').insert([{ projet_id: id, lot_id: lotId, description: 'Nouvelle ligne', quantite: 1, prix_achat: 0, coefficient: 1.21, prix_vente: 0, unite: 'u', type: 'Negoce', ordre: 99 }])
    fetchAll()
  }

  async function saveLigne(ligneId, field, value, allVals) {
    const update = { [field]: value }
    if (field === 'prix_achat' || field === 'coefficient') {
      const pa = field === 'prix_achat' ? parseFloat(value) || 0 : parseFloat(allVals.prix_achat) || 0
      const coef = field === 'coefficient' ? parseFloat(value) || 1 : parseFloat(allVals.coefficient) || 1.21
      update.prix_vente = Math.round(pa * coef * 100) / 100
    }
    await supabase.from('devis_lignes').update(update).eq('id', ligneId)
    if (field === 'prix_achat' || field === 'coefficient' || field === 'quantite') fetchAll()
  }

  async function deleteLigne(ligneId) {
    await supabase.from('devis_lignes').delete().eq('id', ligneId)
    fetchAll()
  }

  async function deleteLot(lotId) {
    await supabase.from('devis_lignes').delete().eq('lot_id', lotId)
    await supabase.from('devis_lots').delete().eq('id', lotId)
    fetchAll()
  }

  async function deleteChapitre(chapId) {
    const ch = chapitres.find(c => c.id === chapId)
    for (const lot of ch?.lots || []) {
      await supabase.from('devis_lignes').delete().eq('lot_id', lot.id)
      await supabase.from('devis_lots').delete().eq('id', lot.id)
    }
    await supabase.from('devis_chapitres').delete().eq('id', chapId)
    fetchAll()
  }

  function exportPDF() {
    const content = printRef.current
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Devis - ${projet?.nom}</title>
    <style>* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; color: #1a1a1a; }
    .cover { width: 100%; height: 100vh; display: flex; flex-direction: column; justify-content: space-between; padding: 60px; page-break-after: always; }
    .logo { font-size: 52px; font-weight: 800; letter-spacing: -3px; } .cover-title { font-size: 32px; font-weight: 200; letter-spacing: 4px; text-transform: uppercase; margin-bottom: 8px; }
    .cover-sub { font-size: 16px; color: #555; margin-bottom: 4px; } .cover-date { font-size: 13px; color: #999; margin-top: 16px; } .cover-footer { font-size: 11px; color: #aaa; }
    .content { padding: 40px; } table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 20px; }
    th { background: #1a1a1a; color: #fff; padding: 7px 8px; text-align: left; font-weight: 500; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 6px 8px; border-bottom: 0.5px solid #f0f0f0; font-size: 11px; }
    .ch td { background: #1a1a1a; color: #fff; font-weight: 700; font-size: 12px; padding: 9px 8px; }
    .lot td { background: #f5f5f5; font-weight: 600; font-size: 11px; } .grand td { background: #1a1a1a; color: #fff; font-weight: 700; font-size: 13px; }
    @media print { .cover { break-after: page; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }</style>
    </head><body>
    <div class="cover"><div class="logo">PP</div><div><div class="cover-title">Devis</div>
    <div class="cover-sub">${projet?.client_nom || ''}</div><div class="cover-sub" style="font-weight:600;font-size:18px">${projet?.nom || ''}</div>
    <div class="cover-date">${new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
    <div class="cover-footer">Partenaires Particuliers &nbsp;·&nbsp; Document confidentiel</div></div>
    <div class="content">${content.innerHTML}</div>
    <script>window.onload=function(){window.print()}<\/script></body></html>`)
    w.document.close()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Chargement...</div>

  const allLignes = chapitres.flatMap(c => c.lots).flatMap(l => l.lignes)
  const totalVente = allLignes.reduce((s, l) => s + ((l.prix_vente || 0) * (l.quantite || 0)), 0)
  const totalAchat = allLignes.reduce((s, l) => s + ((l.prix_achat || 0) * (l.quantite || 0)), 0)
  const marge = totalVente - totalAchat
  const pctMarge = totalVente > 0 ? Math.round((marge / totalVente) * 100) : 0

  return (
    <div style={{ padding: 24 }}>
      {modal && <Modal title={modal === 'chapitre' ? 'Nouveau chapitre' : 'Nouveau lot'} value={modalVal} onChange={setModalVal} onClose={() => { setModal(null); setModalVal('') }} onSave={handleModalSave} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/projets/' + id)} style={{ background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', fontSize: 13 }}>← Fiche projet</button>
        <span style={{ color: '#ddd' }}>/</span>
        <span style={{ fontSize: 13, color: '#888' }}>Devis</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Devis — {projet?.nom}</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 2 }}>{projet?.client_nom || 'Aucun client'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setModal('chapitre'); setModalVal('') }}
            style={{ background: '#fff', color: '#185FA5', border: '0.5px solid #185FA5', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
            + Chapitre
          </button>
          <button onClick={exportPDF}
            style={{ background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
            Exporter PDF
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total vente HT', value: totalVente.toLocaleString('fr-FR') + ' EUR', bold: true },
          { label: 'Total achat HT', value: totalAchat.toLocaleString('fr-FR') + ' EUR' },
          { label: 'Marge brute', value: marge.toLocaleString('fr-FR') + ' EUR', color: marge >= 0 ? '#3B6D11' : '#A32D2D' },
          { label: '% Marge', value: pctMarge + '%', color: pctMarge >= 15 ? '#3B6D11' : pctMarge >= 5 ? '#854F0B' : '#A32D2D' },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: k.bold ? 600 : 500, color: k.color || 'inherit' }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div ref={printRef} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
          <thead>
            <tr style={{ background: '#1a1a1a' }}>
              {['N', 'Type', 'Description', 'Unite', 'Qte', 'Prix achat', 'Coef', 'Prix vente', 'Total vente', 'Fournisseur', ''].map((h, i) => (
                <th key={i} style={{ padding: '10px 10px', textAlign: ['Prix achat', 'Prix vente', 'Total vente', 'Coef', 'Qte'].includes(h) ? 'right' : 'left', fontWeight: 500, fontSize: 10, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chapitres.length === 0 ? (
              <tr><td colSpan={11} style={{ padding: 40, textAlign: 'center', color: '#888' }}>Aucun chapitre. Cliquez sur "+ Chapitre" pour commencer.</td></tr>
            ) : chapitres.map((ch, ci) => {
              const chTotal = ch.lots.flatMap(l => l.lignes).reduce((s, l) => s + ((l.prix_vente || 0) * (l.quantite || 0)), 0)
              return [
                <tr key={'ch-' + ch.id} style={{ background: '#1a1a1a' }}>
                  <td style={{ padding: '10px', color: '#fff', fontWeight: 700, fontSize: 13 }} colSpan={8}>{ci + 1}. {ch.titre}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#fff', fontWeight: 700 }}>{chTotal.toLocaleString('fr-FR')}</td>
                  <td style={{ padding: '10px', color: '#888', fontSize: 10 }}></td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => { setModal('lot'); setModalTarget(ch.id); setModalVal('') }}
                        style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>+ Lot</button>
                      <button onClick={() => deleteChapitre(ch.id)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: 13 }}>✕</button>
                    </div>
                  </td>
                </tr>,
                ...ch.lots.map((lot, li) => {
                  const lotTotal = lot.lignes.reduce((s, l) => s + ((l.prix_vente || 0) * (l.quantite || 0)), 0)
                  return [
                    <tr key={'lot-' + lot.id} style={{ background: '#f5f5f5' }}>
                      <td style={{ padding: '8px 10px', color: '#888', fontSize: 11 }}>{ci + 1}.{li + 1}</td>
                      <td colSpan={7} style={{ padding: '8px 10px', fontWeight: 600, fontStyle: 'italic' }}>{lot.titre}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{lotTotal.toLocaleString('fr-FR')}</td>
                      <td></td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button onClick={() => addLigne(lot.id)} style={{ background: '#639922', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>+ Ligne</button>
                          <button onClick={() => deleteLot(lot.id)} style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', fontSize: 13 }}>✕</button>
                        </div>
                      </td>
                    </tr>,
                    ...lot.lignes.map((lg, lgi) => (
                      <LigneRow key={lg.id} lg={lg} index={`${ci+1}.${li+1}.${lgi+1}`} fournisseurs={fournisseurs} onSave={saveLigne} onDelete={deleteLigne} />
                    ))
                  ]
                }),
              ]
            })}
            {chapitres.length > 0 && (
              <tr style={{ background: '#1a1a1a' }}>
                <td colSpan={8} style={{ padding: '12px 10px', color: '#fff', fontWeight: 700, fontSize: 13 }}>TOTAL GENERAL HT</td>
                <td style={{ padding: '12px 10px', textAlign: 'right', color: '#fff', fontWeight: 700, fontSize: 14 }}>{totalVente.toLocaleString('fr-FR')} EUR</td>
                <td colSpan={2} style={{ padding: '12px 10px', textAlign: 'right', color: '#aaa', fontSize: 11 }}>Marge: {pctMarge}% · Achat: {totalAchat.toLocaleString('fr-FR')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
