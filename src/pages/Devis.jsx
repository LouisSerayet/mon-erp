import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useNavigate } from 'react-router-dom'
import { calculerLigne } from '../lib/calculs'
import { enTeteDocument, blocMetaEtDestinataire, blocTotaux, blocConditionsEtSignature, piedDePage, lignesAdresse } from '../lib/pdfStyle'
import { ajouterPagesCGV } from '../lib/pdfCgv'
import { L, fmtMontant, fmtDate } from '../lib/pdfI18n'

const STATUTS = ['Brouillon', 'Envoyé', 'Accepté', 'Refusé']
// Taux de TVA sélectionnables sur un devis — voir aussi ProjetDetail.jsx
// (le réglage est repris tel quel quand le devis devient un projet).
const TAUX_TVA_OPTIONS = [20, 10, 5.5, 0]
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
  const [form, setForm] = useState({ client_id: '', titre: '', statut: 'Brouillon', notes: '', taux_tva: 20 })
  const [showAddLigne, setShowAddLigne] = useState(false)
  const [formLigne, setFormLigne] = useState({ lot: '', descriptif: '', unite: '', qte: '', prix_achat_ht: '', coeff: '1.30' })
  const [savingLigne, setSavingLigne] = useState(false)
  const [lignesEditees, setLignesEditees] = useState({})
  const [modeLignes, setModeLignes] = useState({})
  const [savingLignes, setSavingLignes] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: d }, { data: c }] = await Promise.all([
      supabase.from('devis').select('*, clients(nom, email, telephone, adresse, rue, code_postal, ville, pays)').order('created_at', { ascending: false }),
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
    setLignesEditees({}); setModeLignes({}); setShowAddLigne(false)
  }

  // ── Édition manuelle des lignes (même logique que ProjetDetail.jsx) ──────
  function editLigne(ligneId, champ, valeur, ligne) {
    const modeLocal = modeLignes[ligneId] || 'ac'
    setLignesEditees(prev => {
      const current = calculerLigne({ modeLocal, champ, valeur, current: prev[ligneId] || {}, ligne })
      return { ...prev, [ligneId]: current }
    })
  }

  function getLigneVal(ligne, champ) {
    if (lignesEditees[ligne.id] && lignesEditees[ligne.id][champ] !== undefined) {
      return lignesEditees[ligne.id][champ]
    }
    const val = ligne[champ]
    if (val === null || val === undefined) return ''
    if (['qte', 'prix_unit_ht', 'prix_achat_ht', 'total_ht', 'total_achat', 'coeff'].includes(champ)) {
      return val === 0 ? '' : val
    }
    return val
  }

  // Recalcule le total_ht de chaque lot à partir de ses lignes, puis le
  // montant_ht global du devis (lots + lignes sans lot) — appelé après tout
  // ajout / édition / suppression de ligne pour que les totaux restent justes.
  async function recalcLotsEtMontant(lignesArr) {
    const lotsData = lignesArr.filter(l => l.type === 'lot')
    const lignesData = lignesArr.filter(l => l.type === 'ligne')
    for (const lot of lotsData) {
      const lgLot = lignesData.filter(l => l.lot === lot.numero)
      const newTotalHt = lgLot.reduce((s, l) => s + (l.total_ht || 0), 0)
      const newTotalAchat = lgLot.reduce((s, l) => s + (l.total_achat || 0), 0)
      if (newTotalHt !== lot.total_ht || newTotalAchat !== lot.total_achat) {
        await supabase.from('devis_lignes').update({ total_ht: newTotalHt, total_achat: newTotalAchat }).eq('id', lot.id)
      }
    }
    const { data: lgFinal } = await supabase.from('devis_lignes').select('*').eq('devis_id', devisOuvert.id).order('ordre')
    const total = (lgFinal || []).reduce((s, l) => {
      if (l.type === 'lot') return s + (l.total_ht || 0)
      if (l.type === 'ligne' && !l.lot) return s + (l.total_ht || 0)
      return s
    }, 0)
    await supabase.from('devis').update({ montant_ht: total }).eq('id', devisOuvert.id)
    setDevisOuvert(prev => ({ ...prev, lignes: lgFinal || [], montant_ht: total }))
    await fetchAll()
  }

  async function ajouterLigneDevis() {
    if (!devisOuvert || !formLigne.descriptif.trim()) return
    setSavingLigne(true)
    const qte = parseFloat(formLigne.qte) || 0
    const prixAchat = parseFloat(formLigne.prix_achat_ht) || 0
    const coeff = parseFloat(formLigne.coeff) || 1
    const prixVente = prixAchat * coeff
    const maxOrdre = Math.max(...(devisOuvert.lignes || []).map(l => l.ordre || 0), 0)
    const { error } = await supabase.from('devis_lignes').insert([{
      devis_id: devisOuvert.id,
      type: 'ligne',
      lot: formLigne.lot || null,
      descriptif: formLigne.descriptif.trim(),
      unite: formLigne.unite,
      qte,
      prix_achat_ht: prixAchat,
      prix_unit_ht: prixVente,
      coeff,
      total_ht: qte * prixVente,
      total_achat: qte * prixAchat,
      ordre: maxOrdre + 1,
    }])
    if (error) { alert('Erreur : ' + error.message); setSavingLigne(false); return }
    const { data: lg } = await supabase.from('devis_lignes').select('*').eq('devis_id', devisOuvert.id).order('ordre')
    await recalcLotsEtMontant(lg || [])
    setShowAddLigne(false)
    setFormLigne({ lot: '', descriptif: '', unite: '', qte: '', prix_achat_ht: '', coeff: '1.30' })
    setSavingLigne(false)
  }

  async function supprimerLigneDevis(ligneId) {
    if (!devisOuvert || !confirm('Supprimer cette ligne ?')) return
    const { error } = await supabase.from('devis_lignes').delete().eq('id', ligneId)
    if (error) { alert('Erreur lors de la suppression : ' + error.message); return }
    const { data: lg } = await supabase.from('devis_lignes').select('*').eq('devis_id', devisOuvert.id).order('ordre')
    await recalcLotsEtMontant(lg || [])
  }

  async function saveLignes() {
    if (!devisOuvert) return
    setSavingLignes(true)
    const updates = Object.entries(lignesEditees)
    const echecs = []
    const reussies = []
    for (const [ligneId, changes] of updates) {
      const ligne = (devisOuvert.lignes || []).find(l => l.id === ligneId)
      if (ligne) {
        const qte = parseFloat(changes.qte ?? ligne.qte) || 0
        const prixUnit = parseFloat(changes.prix_unit_ht ?? ligne.prix_unit_ht) || 0
        const prixAchat = parseFloat(changes.prix_achat_ht ?? ligne.prix_achat_ht) || 0
        const coeff = parseFloat(changes.coeff ?? ligne.coeff) || 0
        const payload = { ...changes, qte, prix_unit_ht: prixUnit, prix_achat_ht: prixAchat, total_ht: qte * prixUnit, total_achat: qte * prixAchat, coeff }
        const { error } = await supabase.from('devis_lignes').update(payload).eq('id', ligneId)
        if (error) echecs.push(ligne.descriptif || ligneId); else reussies.push(ligneId)
      }
    }
    setLignesEditees(prev => {
      const n = { ...prev }
      for (const lId of reussies) delete n[lId]
      return n
    })
    if (echecs.length) alert('Erreur : certaines lignes n\'ont pas pu être enregistrées (' + echecs.join(', ') + ').')
    const { data: lg } = await supabase.from('devis_lignes').select('*').eq('devis_id', devisOuvert.id).order('ordre')
    await recalcLotsEtMontant(lg || [])
    setSavingLignes(false)
  }

  async function creerDevis() {
    setCreateError('')
    if (!form.titre.trim()) { setCreateError('Le titre est obligatoire.'); return }
    if (!form.client_id) { setCreateError('Sélectionne un client.'); return }
    const { data, error } = await supabase.from('devis').insert([{ titre: form.titre.trim(), statut: form.statut, notes: form.notes, client_id: form.client_id, montant_ht: 0, taux_tva: form.taux_tva ?? 20 }]).select().single()
    if (error) { setCreateError('Erreur : ' + error.message); return }
    setShowForm(false); setCreateError(''); setForm({ client_id: '', titre: '', statut: 'Brouillon', notes: '', taux_tva: 20 })
    await fetchAll(); ouvrirDevis(data)
  }

  async function updateStatut(id, statut) {
    await supabase.from('devis').update({ statut }).eq('id', id)
    setDevisOuvert(prev => ({ ...prev, statut }))
    fetchAll()
  }

  async function updateTauxTva(id, taux_tva) {
    await supabase.from('devis').update({ taux_tva }).eq('id', id)
    setDevisOuvert(prev => ({ ...prev, taux_tva }))
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
      taux_tva: devisOuvert.taux_tva ?? 20,
    }]).select().single()
    if (error) { alert('Erreur : ' + error.message); setCreatingProjet(false); return }

    // Copier les lignes du devis (lots, titres, lignes + coefficients) vers le projet
    // pour que l'onglet Rentabilité puisse calculer le prévisionnel
    const { data: devisLignes, error: lignesFetchError } = await supabase
      .from('devis_lignes').select('*').eq('devis_id', devisOuvert.id).order('ordre')
    if (lignesFetchError) {
      alert("Projet créé, mais erreur lors de la récupération des lignes du devis : " + lignesFetchError.message)
    } else if (devisLignes && devisLignes.length > 0) {
      const toInsert = devisLignes.map(({ id: _id, devis_id: _devisId, created_at: _createdAt, ...rest }) => ({
        ...rest,
        projet_id: projet.id,
      }))
      const { error: lignesInsertError } = await supabase.from('projet_lignes').insert(toInsert)
      if (lignesInsertError) {
        alert("Projet créé, mais erreur lors de la copie des lignes vers le projet : " + lignesInsertError.message)
      }
    }

    // Le devis accepté sort automatiquement en PDF au moment du passage en
    // projet, pour garder une trace signée/datée de ce qui a été accepté.
    generatePDF(devisOuvert, 'fr')

    // Une fois transformé en projet, le devis n'a plus sa place dans la
    // liste des devis : on le supprime (lignes puis devis). On détache
    // d'abord le projet du devis (devis_id) pour ne jamais laisser une
    // éventuelle contrainte de clé étrangère bloquer cette suppression.
    await supabase.from('projets').update({ devis_id: null }).eq('id', projet.id)
    await supabase.from('devis_lignes').delete().eq('devis_id', devisOuvert.id)
    const { data: devisSupprime, error: deleteDevisError } = await supabase
      .from('devis').delete().eq('id', devisOuvert.id).select()
    if (deleteDevisError) {
      alert("Projet créé, mais le devis n'a pas pu être supprimé : " + deleteDevisError.message)
    } else if (!devisSupprime || devisSupprime.length === 0) {
      // Supabase peut renvoyer un succès "silencieux" (0 ligne affectée) si
      // une policy RLS bloque la suppression sans lever d'erreur explicite.
      alert("Projet créé, mais le devis n'a pas pu être supprimé (probablement une policy de sécurité Supabase qui bloque la suppression sur la table devis).")
    }

    setCreatingProjet(false)
    navigate('/projets/' + projet.id)
  }

  function generatePDF(d, lang = 'fr') {
    const t = L[lang]
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    // Valeurs "effectives" (édition en cours non enregistrée comprise, via
    // getLigneVal — même logique que ce qui s'affiche à l'écran) plutôt que
    // les valeurs brutes de `d.lignes`/`d.montant_ht` (dernier état enregistré
    // en base) : sinon un export PDF juste après une modification de ligne
    // non sauvegardée affichait des totaux à 0 ou obsolètes.
    const lignesEff = (d.lignes || []).map(l => {
      if (l.type !== 'ligne') return l
      const qte = parseFloat(getLigneVal(l, 'qte')) || 0
      const prixUnit = parseFloat(getLigneVal(l, 'prix_unit_ht')) || 0
      const prixAchat = parseFloat(getLigneVal(l, 'prix_achat_ht')) || 0
      return { ...l, qte, prix_unit_ht: prixUnit, prix_achat_ht: prixAchat, total_ht: qte * prixUnit, total_achat: qte * prixAchat }
    })
    const lots = lignesEff.filter(l => l.type === 'lot').map(lot => {
      const enfants = lignesEff.filter(l => l.type === 'ligne' && l.lot === lot.numero)
      return {
        ...lot,
        total_ht: enfants.reduce((s, l) => s + (l.total_ht || 0), 0),
        total_achat: enfants.reduce((s, l) => s + (l.total_achat || 0), 0),
      }
    })
    const lignesParLot = lignesEff.reduce((acc, l) => {
      if (l.type !== 'lot') { const lot = l.lot || 'sans'; if (!acc[lot]) acc[lot] = []; acc[lot].push(l) }
      return acc
    }, {})
    // On n'utilise pas toLocaleString() ici — voir fmtMontant (lib/pdfI18n.js)
    // pour la raison (caractère parasite affiché par la police jsPDF).
    const fmtN = (n) => (n > 0 ? fmtMontant(n, lang) : '')
    const lignesSansLotEff = lignesEff.filter(l => (l.type === 'ligne' || l.type === 'titre') && !l.lot)
    const totalHt = lots.reduce((s, l) => s + (l.total_ht || 0), 0)
      + lignesSansLotEff.filter(l => l.type === 'ligne').reduce((s, l) => s + (l.total_ht || 0), 0)
    // Taux de TVA du devis (réglage "TVA" — voir le sélecteur dans l'en-tête
    // du devis ouvert) — 20 % par défaut, ramenable à 10 / 5,5 / 0 %.
    const tauxTva = Number(d.taux_tva ?? 20)
    const totalTva = totalHt * (tauxTva / 100)
    const totalTtc = totalHt + totalTva

    let y = enTeteDocument(doc, { titre: t.titreDevis, lang })
    y = blocMetaEtDestinataire(doc, y, {
      metaGauche: [
        [t.numeroDevis, d.titre],
        [t.date, fmtDate(d.created_at, lang)],
        [t.validite, t.jours30],
      ],
      destinataire: d.clients ? { titre: t.client, lignes: [d.clients.nom, ...lignesAdresse(d.clients, lang)] } : null,
    })

    for (const lot of lots) {
      const lignes = lignesParLot[lot.numero] || []
      if (!lignes.length) continue
      if (y > 250) { doc.addPage(); y = 20 }
      doc.setFillColor(30, 41, 59); doc.rect(14, y - 5, 182, 8, 'F')
      doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold')
      doc.text(t.lot(lot.numero) + ' — ' + (lot.categorie || '') + '   ' + fmtN(lot.total_ht) + ' €', 16, y)
      doc.setTextColor(30, 41, 59); y += 4
      autoTable(doc, {
        startY: y,
        head: [[t.colNumero, t.colDesignation, t.colUnite, t.colQte, t.colPuHt, t.colTotalHt]],
        body: lignes.map(l => l.type === 'titre'
          ? [{ content: l.descriptif || '', colSpan: 6, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [71, 85, 105] } }]
          : [l.numero || '', l.descriptif || '', l.unite || '', l.qte > 0 ? l.qte : '', fmtN(l.prix_unit_ht), fmtN(l.total_ht)]
        ),
        styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
        headStyles: { fillColor: [248, 250, 252], textColor: [107, 114, 128], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 12 }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 12, halign: 'right' }, 4: { cellWidth: 26, halign: 'right' }, 5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      })
      y = doc.lastAutoTable.finalY + 8
    }

    // Lignes créées manuellement sans être rattachées à un lot
    const lignesSansLot = lignesSansLotEff
    if (lignesSansLot.length) {
      if (y > 250) { doc.addPage(); y = 20 }
      doc.setFillColor(55, 65, 81); doc.rect(14, y - 5, 182, 8, 'F')
      doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold')
      doc.text(t.lignesSansLot, 16, y)
      doc.setTextColor(30, 41, 59); y += 4
      autoTable(doc, {
        startY: y,
        head: [[t.colNumero, t.colDesignation, t.colUnite, t.colQte, t.colPuHt, t.colTotalHt]],
        body: lignesSansLot.map(l => l.type === 'titre'
          ? [{ content: l.descriptif || '', colSpan: 6, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [71, 85, 105] } }]
          : [l.numero || '', l.descriptif || '', l.unite || '', l.qte > 0 ? l.qte : '', fmtN(l.prix_unit_ht), fmtN(l.total_ht)]
        ),
        styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
        headStyles: { fillColor: [248, 250, 252], textColor: [107, 114, 128], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 12 }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 12, halign: 'right' }, 4: { cellWidth: 26, halign: 'right' }, 5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      })
      y = doc.lastAutoTable.finalY + 8
    }

    if (y > 240) { doc.addPage(); y = 20 }
    y = blocTotaux(doc, y, { totalHt, totalTva, totalTtc, tauxTva, lang })
    if (y > 250) { doc.addPage(); y = 20 }
    blocConditionsEtSignature(doc, y, { bullets: t.bulletsDevisSimple(tauxTva), lang })

    ajouterPagesCGV(doc, lang)
    piedDePage(doc, d.titre, lang)
    doc.save(d.titre.replace(/[^a-z0-9]/gi, '_') + t.devisSuffix)
  }

  const fmt = (n) => n ? Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '—'
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

    // Une ligne (ou un titre) éditable, partagée entre les sections "lot" et
    // "sans lot" — même logique que ProjetDetail.jsx (mode ac/vc/av par ligne).
    function ligneRow(l, i) {
      const isEdited = !!lignesEditees[l.id]
      const inputStyle = { width: '100%', padding: '3px 6px', borderRadius: 4, border: '1px solid #BFDBFE', fontSize: 12, textAlign: 'right', boxSizing: 'border-box', background: '#EFF6FF' }
      if (l.type === 'titre') return (
        <tr key={i} style={{ background: '#F1F5F9' }}>
          <td style={{ padding: '6px 10px', color: '#475569', fontWeight: 600, fontSize: 11 }}>{l.numero}</td>
          <td colSpan={9} style={{ padding: '6px 10px', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{l.descriptif}</td>
        </tr>
      )
      const qte = parseFloat(getLigneVal(l, 'qte')) || 0
      const puVente = parseFloat(getLigneVal(l, 'prix_unit_ht')) || 0
      const puAchat = parseFloat(getLigneVal(l, 'prix_achat_ht')) || 0
      const totalVente = qte * puVente
      const totalAchat = qte * puAchat
      const modeLocal = modeLignes[l.id] || 'ac'
      return (
        <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', background: isEdited ? '#FFFBEB' : i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
          <td style={{ padding: '4px 6px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 11 }}>{l.numero}</span>
              <button onClick={() => supprimerLigneDevis(l.id)}
                style={{ background: 'none', border: 'none', color: '#FCA5A5', cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1, opacity: 0.6 }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>✕</button>
            </div>
          </td>
          <td style={{ padding: '4px 6px', color: '#374151' }}>
            <input value={getLigneVal(l, 'descriptif')} title={getLigneVal(l, 'descriptif')} onChange={e => editLigne(l.id, 'descriptif', e.target.value, l)}
              style={{ width: '100%', padding: '3px 6px', borderRadius: 4, border: isEdited ? '1px solid #BFDBFE' : '1px solid transparent', fontSize: 12, background: isEdited ? '#EFF6FF' : 'transparent', boxSizing: 'border-box' }} />
          </td>
          <td style={{ padding: '4px 4px', textAlign: 'center' }}>
            <input value={getLigneVal(l, 'unite')} onChange={e => editLigne(l.id, 'unite', e.target.value, l)}
              style={{ width: 44, padding: '3px 4px', borderRadius: 4, border: isEdited ? '1px solid #BFDBFE' : '1px solid transparent', fontSize: 12, textAlign: 'center', background: isEdited ? '#EFF6FF' : 'transparent' }} />
          </td>
          <td style={{ padding: '4px 4px' }}>
            <input type="number" value={getLigneVal(l, 'qte')} onChange={e => editLigne(l.id, 'qte', e.target.value, l)}
              style={{ ...inputStyle, border: isEdited ? '1px solid #BFDBFE' : '1px solid transparent', background: isEdited ? '#EFF6FF' : 'transparent' }} />
          </td>
          <td style={{ padding: '4px 4px' }}>
            {modeLocal === 'ac' ? (
              <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: '#9CA3AF', background: '#F3F4F6', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                {getLigneVal(l, 'prix_unit_ht') || '—'}
              </div>
            ) : (
              <input type="number" value={getLigneVal(l, 'prix_unit_ht')} onChange={e => editLigne(l.id, 'prix_unit_ht', e.target.value, l)}
                style={{ ...inputStyle, border: isEdited ? '1px solid #BBF7D0' : '1px solid transparent', background: isEdited ? '#F0FDF4' : 'transparent', color: '#065F46' }} />
            )}
          </td>
          <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: totalVente > 0 ? '#065F46' : '#9CA3AF' }}>
            {totalVente > 0 ? Number(totalVente).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
          </td>
          <td style={{ padding: '4px 4px' }}>
            {modeLocal === 'av' ? (
              <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: '#9CA3AF', background: '#F3F4F6', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                {getLigneVal(l, 'coeff') || '—'}
              </div>
            ) : (
              <input type="number" value={getLigneVal(l, 'coeff')} onChange={e => editLigne(l.id, 'coeff', e.target.value, l)}
                style={{ width: '100%', padding: '3px 6px', borderRadius: 4, border: isEdited ? '1px solid #E9D5FF' : '1px solid transparent', fontSize: 12, textAlign: 'right', boxSizing: 'border-box', background: isEdited ? '#F5F3FF' : 'transparent', color: '#7C3AED' }} />
            )}
          </td>
          <td style={{ padding: '4px 4px' }}>
            {modeLocal === 'vc' ? (
              <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: '#9CA3AF', background: '#F3F4F6', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                {getLigneVal(l, 'prix_achat_ht') || '—'}
              </div>
            ) : (
              <input type="number" value={getLigneVal(l, 'prix_achat_ht')} onChange={e => editLigne(l.id, 'prix_achat_ht', e.target.value, l)}
                style={{ ...inputStyle, border: isEdited ? '1px solid #BFDBFE' : '1px solid transparent', background: isEdited ? '#EFF6FF' : 'transparent', color: '#2563EB' }} />
            )}
          </td>
          <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: totalAchat > 0 ? '#2563EB' : '#9CA3AF' }}>
            {totalAchat > 0 ? Number(totalAchat).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
          </td>
          <td style={{ padding: '4px 4px', whiteSpace: 'nowrap' }}>
            <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              {[['ac', 'A×C'], ['vc', 'V÷C'], ['av', 'V÷A']].map(([mode, label]) => (
                <button key={mode} onClick={() => setModeLignes(prev => ({ ...prev, [l.id]: mode }))}
                  style={{ padding: '2px 5px', borderRadius: 4, border: '1px solid ' + (modeLocal === mode ? '#7C3AED' : '#E5E7EB'),
                    background: modeLocal === mode ? '#F5F3FF' : '#fff', color: modeLocal === mode ? '#7C3AED' : '#9CA3AF',
                    cursor: 'pointer', fontSize: 10, fontWeight: modeLocal === mode ? 600 : 400 }}>
                  {label}
                </button>
              ))}
            </div>
          </td>
        </tr>
      )
    }

    return (
      <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => { setDevisOuvert(null); setLignesEditees({}); setModeLignes({}); setShowAddLigne(false) }}
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
            <select value={devisOuvert.taux_tva ?? 20} onChange={e => updateTauxTva(devisOuvert.id, parseFloat(e.target.value))}
              title="Taux de TVA appliqué sur ce devis"
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: '#fff', color: '#374151', fontWeight: 500, cursor: 'pointer' }}>
              {TAUX_TVA_OPTIONS.map(tx => <option key={tx} value={tx}>TVA {tx === 0 ? '0 % (non applicable)' : tx + ' %'}</option>)}
            </select>
            <button onClick={() => setShowAddLigne(!showAddLigne)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              + Ligne manuelle
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#2563EB', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {importing ? '⏳' : '⬆'} Importer Excel
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => handleImport(e, devisOuvert.id)} />
            </label>
            <button onClick={() => generatePDF(devisOuvert, 'fr')}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#059669', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              ⬇ PDF FR
            </button>
            <button onClick={() => generatePDF(devisOuvert, 'en')}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#2563EB', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              ⬇ PDF EN
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

        {/* Formulaire ajout ligne manuelle */}
        {showAddLigne && (
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Nouvelle ligne</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>N° Lot</label>
                <select value={formLigne.lot} onChange={e => setFormLigne(p => ({ ...p, lot: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
                  <option value=''>— Sans lot —</option>
                  {lots.map(l => <option key={l.numero} value={l.numero}>LOT {l.numero} — {l.categorie}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '2 / -1' }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Désignation *</label>
                <input value={formLigne.descriptif} onChange={e => setFormLigne(p => ({ ...p, descriptif: e.target.value }))}
                  placeholder="Description de la prestation"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Unité</label>
                <input value={formLigne.unite} onChange={e => setFormLigne(p => ({ ...p, unite: e.target.value }))} placeholder="m², ens, U..."
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Quantité</label>
                <input type="number" value={formLigne.qte} onChange={e => setFormLigne(p => ({ ...p, qte: e.target.value }))} placeholder="1"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Prix achat HT (€)</label>
                <input type="number" value={formLigne.prix_achat_ht} onChange={e => setFormLigne(p => ({ ...p, prix_achat_ht: e.target.value }))} placeholder="0"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Coefficient</label>
                <input type="number" value={formLigne.coeff} onChange={e => setFormLigne(p => ({ ...p, coeff: e.target.value }))} placeholder="1.30"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>
            {formLigne.prix_achat_ht && formLigne.coeff && (
              <div style={{ fontSize: 12, color: '#059669', marginBottom: 12, fontWeight: 500 }}>
                → Prix vente HT : {(parseFloat(formLigne.prix_achat_ht) * parseFloat(formLigne.coeff)).toFixed(2)} €
                {formLigne.qte ? ` · Total : ${(parseFloat(formLigne.qte) * parseFloat(formLigne.prix_achat_ht) * parseFloat(formLigne.coeff)).toFixed(2)} €` : ''}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowAddLigne(false)}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={ajouterLigneDevis} disabled={savingLigne}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
                {savingLigne ? '⏳...' : '+ Ajouter'}
              </button>
            </div>
          </div>
        )}

        {Object.keys(lignesEditees).length > 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: '#92400E', fontWeight: 500 }}>⚠️ {Object.keys(lignesEditees).length} ligne(s) modifiée(s) non sauvegardée(s)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setLignesEditees({})} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={saveLignes} disabled={savingLignes} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
                {savingLignes ? '⏳ Sauvegarde...' : '✓ Sauvegarder'}
              </button>
            </div>
          </div>
        )}

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
            <div style={{ fontSize: 13 }}>Ajoute une ligne manuellement ou importe ton Excel pour peupler le devis</div>
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
                  {['N°', 'Désignation', 'Unité', 'Qté', 'P.U. Vente', 'Total Vente', 'Coeff.', 'P.U. Achat', 'Total Achat', 'Mode'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Désignation' || h === 'N°' ? 'left' : h === 'Mode' ? 'center' : 'right', color: '#6B7280', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(lignesParLot[lot.numero] || []).map((l, i) => ligneRow(l, i))}
              </tbody>
            </table>
          </div>
        ))}

        {/* Lignes sans lot */}
        {(lignesParLot['sans'] || []).filter(l => l.type === 'ligne' || l.type === 'titre').length > 0 && (
          <div style={{ marginBottom: 20, borderRadius: 10, overflow: 'hidden', border: '1px solid #E5E7EB' }}>
            <div style={{ background: '#374151', color: '#fff', padding: '10px 16px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Lignes sans lot</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                {fmt((lignesParLot['sans'] || []).reduce((s, l) => s + (l.total_ht || 0), 0))}
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                  {['N°', 'Désignation', 'Unité', 'Qté', 'P.U. Vente', 'Total Vente', 'Coeff.', 'P.U. Achat', 'Total Achat', 'Mode'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Désignation' || h === 'N°' ? 'left' : h === 'Mode' ? 'center' : 'right', color: '#6B7280', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(lignesParLot['sans'] || []).map((l, i) => ligneRow(l, i))}
              </tbody>
            </table>
          </div>
        )}
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
            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>TVA</label>
            <select value={form.taux_tva ?? 20} onChange={e => setForm(prev => ({ ...prev, taux_tva: parseFloat(e.target.value) }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
              {TAUX_TVA_OPTIONS.map(tx => <option key={tx} value={tx}>{tx === 0 ? '0 % (non applicable)' : tx + ' %'}</option>)}
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
