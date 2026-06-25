import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useNavigate } from 'react-router-dom'

const STATUTS = ['Brouillon', 'Envoyé', 'Accepté', 'Refusé']
const STATUS_STYLE = {
  'Brouillon': { bg: '#F3F4F6', color: '#6B7280' },
  'Envoyé':    { bg: '#EFF6FF', color: '#2563EB' },
  'Accepté':   { bg: '#ECFDF5', color: '#059669' },
  'Refusé':    { bg: '#FEF2F2', color: '#DC2626' },
}

export default function Devis() {
  const [devis, setDevis] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [devisOuvert, setDevisOuvert] = useState(null)
  const [search, setSearch] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('Tous')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [createError, setCreateError] = useState('')
  const [creatingProjet, setCreatingProjet] = useState(false)
  const [form, setForm] = useState({ client_id: '', titre: '', statut: 'Brouillon', notes: '' })
  const navigate = useNavigate()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: d }, { data: c }] = await Promise.all([
      supabase.from('devis').select('*, clients(nom)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, nom').order('nom')
    ])
    setDevis(d || [])
    setClients(c || [])
    setLoading(false)
  }

  function parseExcel(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
          const lignes = []
          let currentLot = null
          let totalGeneral = 0
          for (let i = 1; i < rows.length; i++) {
            const r = rows[i]
            const num = String(r[0] || '').trim()
            const categorie = String(r[1] || '').trim()
            const descriptif = String(r[2] || '').trim()
            const unite = String(r[3] || '').trim()
            const qte = parseFloat(r[4]) || 0
            const prixUnit = parseFloat(r[5]) || 0
            const totalPrixUnit = parseFloat(r[6]) || 0
            const coeff = parseFloat(r[7]) || 0
            const prixAchat = parseFloat(r[8]) || 0
            const totalAchat = parseFloat(r[9]) || 0
            const fournisseur = String(r[10] || '').trim()
            if (!num && !categorie && !descriptif) continue
            if (descriptif.toLowerCase() === 'total' && totalPrixUnit > 0) { totalGeneral = totalPrixUnit; continue }
            const isLot = /^\d+$/.test(num) && categorie && totalPrixUnit > 0
            if (isLot) { currentLot = num; lignes.push({ type: 'lot', numero: num, categorie, descriptif, total_ht: totalPrixUnit, total_achat: totalAchat, coeff }); continue }
            const isTitre = num && !categorie && !unite && qte === 0 && prixUnit === 0 && descriptif
            if (isTitre) { lignes.push({ type: 'titre', numero: num, descriptif, lot: currentLot }); continue }
            if (num || descriptif) lignes.push({ type: 'ligne', numero: num, lot: currentLot, descriptif, unite, qte, prix_unit_ht: prixUnit, total_ht: totalPrixUnit, coeff, prix_achat_ht: prixAchat, total_achat: totalAchat, fournisseur })
          }
          resolve({ lignes, totalGeneral })
        } catch (err) { reject(err) }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }

  async function handleImport(e, devisId) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true); setImportError('')
    try {
      const { lignes, totalGeneral } = await parseExcel(file)
      await supabase.from('devis_lignes').delete().eq('devis_id', devisId)
      const { error } = await supabase.from('devis_lignes').insert(lignes.map((l, idx) => ({ ...l, devis_id: devisId, ordre: idx })))
      if (error) throw error
      await supabase.from('devis').update({ montant_ht: totalGeneral }).eq('id', devisId)
      await fetchAll()
      const { data: lignesData } = await supabase.from('devis_lignes').select('*').eq('devis_id', devisId).order('ordre')
      setDevisOuvert(prev => ({ ...prev, lignes: lignesData, montant_ht: totalGeneral }))
    } catch (err) { setImportError("Erreur import : " + err.message) }
    setImporting(false); e.target.value = ''
  }

  async function ouvrirDevis(d) {
    const { data: lignes } = await supabase.from('devis_lignes').select('*').eq('devis_id', d.id).order('ordre')
    setDevisOuvert({ ...d, lignes: lignes || [] })
  }

  async function creerDevis() {
    setCreateError('')
    if (!form.titre.trim()) { setCreateError('Le titre est obligatoire.'); return }
    if (!form.client_id) { setCreateError('Sélectionne un client.'); return }
    const { data, error } = await supabase.from('devis').insert([{ titre: form.titre.trim(), statut: form.statut, notes: form.notes, client_id: form.client_id, montant_ht: 0 }]).select().single()
    if (error) { setCreateError('Erreur : ' + error.message); return }
    setShowForm(false); setCreateError(''); setForm({ client_id: '', titre: '', statut: 'Brouillon', notes: '' })
    await fetchAll(); ouvrirDevis(data)
  }

  async function updateStatut(id, statut) {
    await supabase.from('devis').update({ statut }).eq('id', id)
    setDevisOuvert(prev => ({ ...prev, statut }))
    fetchAll()
  }

  async function supprimerDevis(id) {
    if (!confirm('Supprimer ce devis ?')) return
    await supabase.from('devis_lignes').delete().eq('devis_id', id)
    await supabase.from('devis').delete().eq('id', id)
    setDevisOuvert(null); fetchAll()
  }

  async function creerProjetDepuisDevis() {
    if (!devisOuvert) return
    setCreatingProjet(true)
    const { data: projet, error } = await supabase.from('projets').insert([{
      nom: devisOuvert.titre,
      client_id: devisOuvert.client_id,
      devis_id: devisOuvert.id,
      montant_ht: devisOuvert.montant_ht,
      statut: 'En cours',
    }]).select().single()
    if (error) { alert('Erreur : ' + error.message); setCreatingProjet(false); return }
    await supabase.from('devis').update({ statut: 'Accepté' }).eq('id', devisOuvert.id)
    setCreatingProjet(false)
    navigate('/projets/' + projet.id)
  }

  function generatePDF(d) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const lots = (d.lignes || []).filter(l => l.type === 'lot')
    const lignesParLot = (d.lignes || []).reduce((acc, l) => {
      if (l.type !== 'lot') { const lot = l.lot || 'sans'; if (!acc[lot]) acc[lot] = []; acc[lot].push(l) }
      return acc
    }, {})
    const fmtN = (n) => n > 0 ? Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''

    doc.setFillColor(30, 41, 59); doc.rect(0, 0, 297, 22, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text(d.titre, 14, 12)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal')
    doc.text('Date : ' + new Date(d.created_at).toLocaleDateString('fr-FR'), 240, 12)
    if (d.clients?.nom) doc.text('Client : ' + d.clients.nom, 14, 19)
    doc.setTextColor(30, 41, 59)

    autoTable(doc, {
      startY: 28,
      head: [['N° Lot', 'Désignation', 'Total HT']],
      body: lots.map(l => ['LOT ' + l.numero, (l.categorie || '') + (l.descriptif ? ' — ' + l.descriptif : ''), fmtN(l.total_ht) + ' €']),
      foot: [['', 'TOTAL GÉNÉRAL HT', fmtN(d.montant_ht) + ' €']],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [240, 253, 244], textColor: [6, 95, 70], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 22 }, 2: { halign: 'right', cellWidth: 38 } },
      margin: { left: 14, right: 14 },
    })

    let y = doc.lastAutoTable.finalY + 10
    for (const lot of lots) {
      const lignes = lignesParLot[lot.numero] || []
      if (!lignes.length) continue
      if (y > 170) { doc.addPage(); y = 14 }
      doc.setFillColor(30, 41, 59); doc.rect(14, y - 5, 269, 8, 'F')
      doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold')
      doc.text('LOT ' + lot.numero + ' — ' + (lot.categorie || '') + '   ' + fmtN(lot.total_ht) + ' €', 16, y)
      doc.setTextColor(30, 41, 59); y += 4
      autoTable(doc, {
        startY: y,
        head: [['N°', 'Désignation', 'Unité', 'Qté', 'P.U. HT', 'Total HT']],
        body: lignes.map(l => l.type === 'titre'
          ? [{ content: l.descriptif || '', colSpan: 6, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [71, 85, 105] } }]
          : [l.numero || '', l.descriptif || '', l.unite || '', l.qte > 0 ? l.qte : '', fmtN(l.prix_unit_ht), fmtN(l.total_ht)]
        ),
        styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
        headStyles: { fillColor: [248, 250, 252], textColor: [107, 114, 128], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 14 }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 14, halign: 'right' }, 4: { cellWidth: 30, halign: 'right' }, 5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      })
      y = doc.lastAutoTable.finalY + 8
    }
    const n = doc.getNumberOfPages()
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(7); doc.setTextColor(156, 163, 175)
      doc.text('Page ' + i + ' / ' + n, 283, 205, { align: 'right' })
      doc.text(d.titre, 14, 205)
    }
    doc.save(d.titre.replace(/[^a-z0-9]/gi, '_') + '.pdf')
  }

  const fmt = (n) => n ? Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €' : '—'
  const devisFiltres = devis.filter(d => {
    const matchSearch = d.titre?.toLowerCase().includes(search.toLowerCase()) || d.clients?.nom?.toLowerCase().includes(search.toLowerCase())
    return matchSearch && (filtreStatut === 'Tous' || d.statut === filtreStatut)
  })

  // ── Vue détail ────────────────────────────────────────────────
  if (devisOuvert) {
    const lots = (devisOuvert.lignes || []).filter(l => l.type === 'lot')
    const lignesParLot = (devisOuvert.lignes || []).reduce((acc, l) => {
      if (l.type !== 'lot') { const lot = l.lot || 'sans'; if (!acc[lot]) acc[lot] = []; acc[lot].push(l) }
      return acc
    }, {})

    return (
      <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setDevisOuvert(null)}
            style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>← Retour</button>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{devisOuvert.titre}</h2>
            {devisOuvert.clients?.nom && <span style={{ fontSize: 12, color: '#6B7280' }}>Client : {devisOuvert.clients.nom}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={devisOuvert.statut} onChange={e => updateStatut(devisOuvert.id, e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: STATUS_STYLE[devisOuvert.statut]?.bg, color: STATUS_STYLE[devisOuvert.statut]?.color, fontWeight: 500, cursor: 'pointer' }}>
              {STATUTS.map(s => <option key={s}>{s}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#2563EB', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {importing ? '⏳' : '⬆'} Importer Excel
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => handleImport(e, devisOuvert.id)} />
            </label>
            <button onClick={() => generatePDF(devisOuvert)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#059669', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              ⬇ PDF
            </button>
            {devisOuvert.statut === 'Accepté' && (
              <button onClick={creerProjetDepuisDevis} disabled={creatingProjet}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {creatingProjet ? '⏳' : '🚀'} Créer le projet
              </button>
            )}
            <button onClick={() => supprimerDevis(devisOuvert.id)}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontSize: 13 }}>
              Supprimer
            </button>
          </div>
        </div>

        {importError && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{importError}</div>}

        {/* Cartes résumé */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '14px 20px', flex: 1 }}>
            <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total HT</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#065F46', marginTop: 4 }}>{fmt(devisOuvert.montant_ht)}</div>
          </div>
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '14px 20px', flex: 1 }}>
            <div style={{ fontSize: 11, color: '#2563EB', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lots</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1E40AF', marginTop: 4 }}>{lots.length}</div>
          </div>
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 20px', flex: 1 }}>
            <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lignes</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#374151', marginTop: 4 }}>{(devisOuvert.lignes || []).filter(l => l.type === 'ligne').length}</div>
          </div>
        </div>

        {/* Bandeau "Créer le projet" si Accepté */}
        {devisOuvert.statut === 'Accepté' && (
          <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#5B21B6', fontSize: 14 }}>✅ Devis accepté</div>
              <div style={{ fontSize: 12, color: '#7C3AED', marginTop: 2 }}>Tu peux maintenant créer le projet et commencer à gérer les commandes fournisseurs.</div>
            </div>
            <button onClick={creerProjetDepuisDevis} disabled={creatingProjet}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
              {creatingProjet ? '⏳ Création...' : '🚀 Créer le projet'}
            </button>
          </div>
        )}

        {(devisOuvert.lignes || []).length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Aucune ligne</div>
            <div style={{ fontSize: 13 }}>Importe ton Excel pour peupler le devis</div>
          </div>
        )}

        {lots.map(lot => (
          <div key={lot.numero} style={{ marginBottom: 20, borderRadius: 10, overflow: 'hidden', border: '1px solid #E5E7EB' }}>
            <div style={{ background: '#1E293B', color: '#fff', padding: '10px 16px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>LOT {lot.numero} — {lot.categorie}{lot.descriptif ? ' · ' + lot.descriptif : ''}</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{fmt(lot.total_ht)}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                  {['N°', 'Désignation', 'Unité', 'Qté', 'P.U. HT', 'Total HT', 'Coeff.', 'Achat HT'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Désignation' || h === 'N°' ? 'left' : 'right', color: '#6B7280', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(lignesParLot[lot.numero] || []).map((l, i) => l.type === 'titre' ? (
                  <tr key={i} style={{ background: '#F1F5F9' }}>
                    <td style={{ padding: '6px 10px', color: '#475569', fontWeight: 600, fontSize: 11 }}>{l.numero}</td>
                    <td colSpan={7} style={{ padding: '6px 10px', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{l.descriptif}</td>
                  </tr>
                ) : (
                  <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '7px 10px', color: '#9CA3AF', fontSize: 11 }}>{l.numero}</td>
                    <td style={{ padding: '7px 10px', color: '#374151', maxWidth: 400, wordBreak: 'break-word' }}>{l.descriptif}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', color: '#6B7280' }}>{l.unite}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{l.qte > 0 ? l.qte : '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>{l.prix_unit_ht > 0 ? Number(l.prix_unit_ht).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: l.total_ht > 0 ? '#065F46' : '#9CA3AF' }}>{l.total_ht > 0 ? Number(l.total_ht).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#6B7280' }}>{l.coeff > 0 ? '×' + l.coeff : '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#2563EB' }}>{l.total_achat > 0 ? Number(l.total_achat).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    )
  }

  // ── Liste devis ───────────────────────────────────────────────
  return (
    <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Devis</h2>
        <button onClick={() => { setShowForm(true); setCreateError('') }}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
          + Nouveau devis
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }} />
        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
          <option>Tous</option>
          {STATUTS.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>Nouveau devis</h3>
            {createError && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{createError}</div>}
            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Client *</label>
            <select value={form.client_id} onChange={e => setForm(prev => ({ ...prev, client_id: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
              <option value=''>— Sélectionner un client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Titre *</label>
            <input value={form.titre} onChange={e => setForm(prev => ({ ...prev, titre: e.target.value }))}
              placeholder="Ex: Aménagement bureau 3ème étage"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', marginBottom: 14 }} />
            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Statut</label>
            <select value={form.statut} onChange={e => setForm(prev => ({ ...prev, statut: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
              {STATUTS.map(s => <option key={s}>{s}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setCreateError('') }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={creerDevis}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>Créer</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Chargement...</div>
        : devisFiltres.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Aucun devis</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {devisFiltres.map(d => {
              const st = STATUS_STYLE[d.statut] || {}
              return (
                <div key={d.id} onClick={() => ouvrirDevis(d)}
                  style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#111827', marginBottom: 2 }}>{d.titre}</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                      {d.clients?.nom ? '👤 ' + d.clients.nom : 'Sans client'} · {new Date(d.created_at).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>{fmt(d.montant_ht)}</div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: st.bg, color: st.color, fontWeight: 500 }}>{d.statut}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}
