import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useParams, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const TABS = [
  { id: 'infos', label: '📋 Infos' },
  { id: 'lignes', label: '📐 Lignes' },
  { id: 'commandes', label: '🛒 Commandes frs' },
  { id: 'factures_frs', label: '📄 Factures frs' },
  { id: 'factures_cli', label: '💶 Factures clients' },
  { id: 'rentabilite', label: '📊 Rentabilité' },
  { id: 'documents', label: '📁 Documents' },
]

const STATUTS_PROJET = ['Devis envoyé', 'Devis signé', 'En cours', 'Finalisation', 'Clôturé']
const STATUTS_CMD = ['En attente', 'Envoyée', 'Reçue', 'Annulée']
const STATUTS_FFRS = ['À payer', 'Payée']
const STATUTS_FCLI = ['À envoyer', 'Envoyée', 'Payée']
const STATUT_COLOR = {
  'Devis envoyé': '#EA580C',
  'Devis signé':  '#7C3AED',
  'En cours':     '#2563EB',
  'Finalisation': '#059669',
  'Clôturé':      '#6B7280',
}
const STATUT_ICON = {
  'Devis envoyé': '📤',
  'Devis signé':  '✍️',
  'En cours':     '🔨',
  'Finalisation': '✅',
  'Clôturé':      '🏁',
}

export default function ProjetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('infos')
  const [projet, setProjet] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fournisseurs, setFournisseurs] = useState([])
  const [commandes, setCommandes] = useState([])
  const [facturesFrs, setFacturesFrs] = useState([])
  const [facturesCli, setFacturesCli] = useState([])
  const [lignes, setLignes] = useState([])
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [editInfos, setEditInfos] = useState(false)
  const [formInfos, setFormInfos] = useState({})
  const [formCmd, setFormCmd] = useState({ fournisseur_id: '', numero: '', description: '', montant_ht: '', statut: 'En attente', date_commande: '' })
  const [formFfrs, setFormFfrs] = useState({ fournisseur_id: '', commande_id: '', numero: '', montant_ht: '', statut: 'À payer', date_facture: '', date_echeance: '' })
  const [formFcli, setFormFcli] = useState({ numero: '', montant_ht: '', statut: 'À envoyer', date_facture: '', date_echeance: '' })
  const [lignesEditees, setLignesEditees] = useState({}) // { [id]: {champ: valeur} }
  const [savingLignes, setSavingLignes] = useState(false)
  const [lotsReduits, setLotsReduits] = useState({}) // { [lotNumero]: true/false }
  const [showAddLigne, setShowAddLigne] = useState(false)
  const [showValidation, setShowValidation] = useState(false) // modale de validation étape
  const [validationDoc, setValidationDoc] = useState(null) // fichier uploadé
  const [validationDate, setValidationDate] = useState('') // date de début
  const [validationError, setValidationError] = useState('')
  const [validating, setValidating] = useState(false)
  const [formLigne, setFormLigne] = useState({ lot: '', descriptif: '', unite: '', qte: '', prix_achat_ht: '', coeff: '1.30', type: 'ligne' })
  const [savingLigne, setSavingLigne] = useState(false)
  const [modeLignes, setModeLignes] = useState({}) // { [ligneId]: 'ac' | 'vc' | 'av' }
  function generateDevisPDF() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const lotsData = lignes.filter(l => l.type === 'lot')
    const lignesParLot = lignes.reduce((acc, l) => {
      if (l.type !== 'lot') { const lot = l.lot || 'sans'; if (!acc[lot]) acc[lot] = []; acc[lot].push(l) }
      return acc
    }, {})
    // Formatage sans séparateur de milliers problématique — espace insécable
    const fmtN = n => {
      if (!n || n <= 0) return '—'
      const parts = Number(n).toFixed(2).split('.')
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
      return parts.join(',') + ' EUR'
    }
    const fmtNR = n => {
      if (!n || n <= 0) return '—'
      const s = Math.round(Number(n)).toString()
      return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' EUR'
    }
    const totalHT = lotsData.reduce((s, l) => s + (l.total_ht || 0), 0)
    const totalTVA = totalHT * 0.20
    const totalTTC = totalHT + totalTVA

    // ── PAGE 1 : PRÉSENTATION ─────────────────────────────────
    // Fond header
    doc.setFillColor(30, 41, 59)
    doc.rect(0, 0, 210, 60, 'F')

    // Logo / Société
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(26); doc.setFont('helvetica', 'bold')
    doc.text('PP', 14, 24)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal')
    doc.text('PARTENAIRES PARTICULIERS', 14, 31)

    // Titre DEVIS
    doc.setFontSize(28); doc.setFont('helvetica', 'bold')
    doc.text('DEVIS', 210 - 14, 24, { align: 'right' })
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text('N° ' + projet.nom.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10).toUpperCase() + '-' + new Date().getFullYear(), 210 - 14, 31, { align: 'right' })
    doc.text('Date : ' + new Date().toLocaleDateString('fr-FR'), 210 - 14, 37, { align: 'right' })

    // Nom du projet
    doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text(projet.nom, 14, 46)
    if (projet.adresse_chantier) {
      doc.setFontSize(9); doc.setFont('helvetica', 'normal')
      doc.text(projet.adresse_chantier, 14, 53)
    }

    doc.setTextColor(30, 41, 59)

    // Bloc client
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(14, 68, 85, 40, 3, 3, 'F')
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(107, 114, 128)
    doc.text('CLIENT', 20, 76)
    doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text(projet.clients?.nom || '—', 20, 83)
    if (projet.clients?.email) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(projet.clients.email, 20, 89) }
    if (projet.clients?.telephone) { doc.setFontSize(8); doc.text(projet.clients.telephone, 20, 94) }
    if (projet.clients?.adresse) { doc.setFontSize(8); doc.text(projet.clients.adresse, 20, 99) }

    // Bloc montant
    doc.setFillColor(240, 253, 244)
    doc.roundedRect(111, 68, 85, 40, 3, 3, 'F')
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(107, 114, 128)
    doc.text('MONTANT', 117, 76)
    doc.setTextColor(6, 95, 70); doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
    doc.text(fmtNR(totalHT), 117, 86)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128)
    doc.text('HT', 117, 92)
    doc.setFontSize(8); doc.setTextColor(30, 41, 59)
    doc.text('TVA 20% : ' + fmtNR(totalTVA), 117, 99)
    doc.text('TTC : ' + fmtNR(totalTTC), 117, 104)

    // Infos projet
    doc.setTextColor(30, 41, 59)
    let yInfo = 118
    if (projet.date_debut || projet.date_fin_prevue) {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal')
      if (projet.date_debut) doc.text('Début des travaux : ' + new Date(projet.date_debut).toLocaleDateString('fr-FR'), 14, yInfo)
      if (projet.date_fin_prevue) doc.text('Fin prévisionnelle : ' + new Date(projet.date_fin_prevue).toLocaleDateString('fr-FR'), 111, yInfo)
      yInfo += 7
    }
    if (projet.surface) {
      doc.setFontSize(8)
      doc.text('Surface : ' + projet.surface + ' m²', 14, yInfo)
      yInfo += 7
    }
    if (projet.acces_livraison) {
      doc.setFontSize(8)
      doc.text('Accès/Livraison : ' + projet.acces_livraison, 14, yInfo)
      yInfo += 7
    }
    if (projet.notes) {
      doc.setFillColor(255, 251, 235)
      doc.roundedRect(14, yInfo, 182, 20, 2, 2, 'F')
      doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 80, 0)
      const notesLines = doc.splitTextToSize(projet.notes, 174)
      doc.text(notesLines, 18, yInfo + 7)
      yInfo += 26
    }

    // Ligne de séparation décorative
    doc.setDrawColor(229, 231, 235)
    doc.line(14, yInfo + 4, 196, yInfo + 4)

    // ── PAGE 2 : CGV (placeholder) ────────────────────────────
    doc.addPage()
    doc.setFillColor(248, 250, 252)
    doc.rect(0, 0, 210, 297, 'F')
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 16, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
    doc.text('CONDITIONS GÉNÉRALES DE VENTE', 14, 11)
    doc.setTextColor(156, 163, 175); doc.setFontSize(9); doc.setFont('helvetica', 'italic')
    doc.text('Les conditions générales de vente seront intégrées ici.', 14, 40)
    doc.text('(Section à compléter)', 14, 50)

    // ── PAGES DÉTAIL PAR LOT ─────────────────────────────────
    for (const lot of lotsData) {
      const lgLot = lignesParLot[lot.numero] || []
      if (!lgLot.length) continue
      doc.addPage()

      // Header lot
      doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 16, 'F')
      doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
      doc.text('LOT ' + lot.numero + ' — ' + (lot.categorie || ''), 14, 10)
      if (lot.descriptif) { doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text(lot.descriptif, 14, 15) }
      doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      doc.text(fmtN(lot.total_ht), 196, 10, { align: 'right' })
      doc.setTextColor(30, 41, 59)

      const body = []
      let lastTitreIdx = -1
      for (let li = 0; li < lgLot.length; li++) {
        const l = lgLot[li]
        if (l.type === 'titre') {
          // On n'ajoute le titre que s'il y a au moins une ligne avec montant après lui
          const hasLignesAvecMontant = lgLot.slice(li + 1).some(
            ll => ll.type !== 'titre' && (ll.total_ht > 0 || ll.prix_unit_ht > 0)
          )
          if (hasLignesAvecMontant) {
            lastTitreIdx = body.length
            body.push([{ content: (l.descriptif || '').toUpperCase(), colSpan: 6,
              styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [71, 85, 105], fontSize: 7 } }])
          }
        } else {
          // Ignorer les lignes sans montant ni prix
          if (!l.total_ht && !l.prix_unit_ht && !l.qte) continue
          body.push([
            l.numero || '',
            l.descriptif || '',
            l.unite || '',
            l.qte > 0 ? String(l.qte) : '',
            l.prix_unit_ht > 0 ? (Number(l.prix_unit_ht).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')) : '',
            l.total_ht > 0 ? (Number(l.total_ht).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')) : '',
          ])
        }
      }

      autoTable(doc, {
        startY: 20,
        head: [['N°', 'Désignation', 'Unité', 'Qté', 'P.U. HT (€)', 'Total HT (€)']],
        body,
        foot: [['', '', '', '', 'TOTAL LOT ' + lot.numero, lot.total_ht > 0 ? (Number(lot.total_ht).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')) : '']],
        styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [248, 250, 252], textColor: [107, 114, 128], fontStyle: 'bold', lineWidth: 0.1, lineColor: [229, 231, 235] },
        footStyles: { fillColor: [240, 253, 244], textColor: [6, 95, 70], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 14 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 14, halign: 'center' },
          3: { cellWidth: 12, halign: 'right' },
          4: { cellWidth: 28, halign: 'right' },
          5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        margin: { left: 14, right: 14 },
      })
    }

    // ── PAGE RÉCAP FINALE ─────────────────────────────────────
    doc.addPage()
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 16, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
    doc.text('RÉCAPITULATIF GÉNÉRAL', 14, 11)
    doc.setTextColor(30, 41, 59)

    autoTable(doc, {
      startY: 24,
      head: [['N° Lot', 'Désignation', 'Total HT (€)']],
      body: lotsData.map(l => ['LOT ' + l.numero, (l.categorie || '') + (l.descriptif ? ' — ' + l.descriptif : ''), fmtN(l.total_ht)]),
      foot: [
        ['', 'TOTAL HT', fmtN(totalHT)],
        ['', 'TVA 20%', fmtN(totalTVA)],
        ['', 'TOTAL TTC', fmtN(totalTTC)],
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [240, 253, 244], textColor: [6, 95, 70], fontStyle: 'bold', fontSize: 10 },
      columnStyles: { 0: { cellWidth: 22 }, 2: { halign: 'right', cellWidth: 40 } },
      margin: { left: 14, right: 14 },
    })

    // Signature
    const ySign = doc.lastAutoTable.finalY + 20
    if (ySign < 240) {
      doc.setDrawColor(229, 231, 235)
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128)
      doc.text('Bon pour accord — Signature client :', 14, ySign)
      doc.rect(14, ySign + 4, 80, 25)
      doc.text('Date et signature :', 120, ySign)
      doc.rect(120, ySign + 4, 70, 25)
    }

    // Pied de page sur toutes les pages
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(7); doc.setTextColor(156, 163, 175)
      doc.text('Partenaires Particuliers — ' + projet.nom, 14, 291)
      doc.text('Page ' + i + ' / ' + pageCount, 196, 291, { align: 'right' })
    }

    doc.save(projet.nom.replace(/[^a-z0-9]/gi, '_') + '_devis.pdf')
  }

    const [modeCalc, setModeCalc] = useState('achat_coeff') // 'achat_coeff' | 'vente_coeff' | 'achat_vente'
  const [cmdEditees, setCmdEditees] = useState({}) // édition inline commandes
  const [showPdfPreview, setShowPdfPreview] = useState(null) // commande en preview PDF
  const [showLignesSelector, setShowLignesSelector] = useState(false) // sélecteur lignes projet
  const [documents, setDocuments] = useState({ projet: [], officiels: [] }) // documents du projet
  const [cmdDocs, setCmdDocs] = useState({}) // { [cmdId]: [docs] }
  const [uploadingDoc, setUploadingDoc] = useState(null) // cmdId ou 'projet'
  const [expandedCmd, setExpandedCmd] = useState(null) // commande ouverte pour voir ses docs

  useEffect(() => { fetchAll() }, [id])

  function editLigne(ligneId, champ, valeur, ligne) {
    setLignesEditees(prev => {
      const current = { ...(prev[ligneId] || {}) }
      current[champ] = valeur

      // Recalcul automatique selon le mode
      const qte = parseFloat(current.qte ?? ligne.qte) || 0
      const puA = parseFloat(champ === 'prix_achat_ht' ? valeur : (current.prix_achat_ht ?? ligne.prix_achat_ht)) || 0
      const puV = parseFloat(champ === 'prix_unit_ht' ? valeur : (current.prix_unit_ht ?? ligne.prix_unit_ht)) || 0
      const co = parseFloat(champ === 'coeff' ? valeur : (current.coeff ?? ligne.coeff)) || 0

      if (modeCalc === 'achat_coeff') {
        // Achat + Coeff → Vente
        if ((champ === 'prix_achat_ht' || champ === 'coeff') && puA > 0 && co > 0) {
          current.prix_unit_ht = (puA * co).toFixed(2)
        }
      } else if (modeCalc === 'vente_coeff') {
        // Vente + Coeff → Achat
        if ((champ === 'prix_unit_ht' || champ === 'coeff') && puV > 0 && co > 0) {
          current.prix_achat_ht = (puV / co).toFixed(2)
        }
      } else if (modeCalc === 'achat_vente') {
        // Achat + Vente → Coeff
        if ((champ === 'prix_achat_ht' || champ === 'prix_unit_ht') && puA > 0 && puV > 0) {
          current.coeff = (puV / puA).toFixed(2)
        }
      }

      return { ...prev, [ligneId]: current }
    })
  }

  function getLigneVal(ligne, champ) {
    if (lignesEditees[ligne.id] && lignesEditees[ligne.id][champ] !== undefined) {
      return lignesEditees[ligne.id][champ]
    }
    const val = ligne[champ]
    if (val === null || val === undefined) return ''
    // Pour les champs numériques, retourner le nombre brut (pas formaté)
    if (['qte', 'prix_unit_ht', 'prix_achat_ht', 'total_ht', 'total_achat', 'coeff'].includes(champ)) {
      return val === 0 ? '' : val
    }
    return val
  }

  async function ajouterLigne() {
    if (!formLigne.descriptif.trim()) return
    setSavingLigne(true)
    const qte = parseFloat(formLigne.qte) || 0
    const prixAchat = parseFloat(formLigne.prix_achat_ht) || 0
    const coeff = parseFloat(formLigne.coeff) || 1
    const prixVente = prixAchat * coeff
    const totalHt = qte * prixVente
    const totalAchat = qte * prixAchat
    const maxOrdre = Math.max(...lignes.map(l => l.ordre || 0), 0)
    const { error } = await supabase.from('projet_lignes').insert([{
      projet_id: id,
      type: 'ligne',
      lot: formLigne.lot || null,
      descriptif: formLigne.descriptif.trim(),
      unite: formLigne.unite,
      qte,
      prix_achat_ht: prixAchat,
      prix_unit_ht: prixVente,
      coeff,
      total_ht: totalHt,
      total_achat: totalAchat,
      ordre: maxOrdre + 1,
    }])
    if (!error) {
      const { data: lg } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).order('ordre')
      setLignes(lg || [])
      setShowAddLigne(false)
      setFormLigne({ lot: '', descriptif: '', unite: '', qte: '', prix_achat_ht: '', coeff: '1.30', type: 'ligne' })
    }
    setSavingLigne(false)
  }

  async function supprimerLigne(ligneId) {
    if (!confirm('Supprimer cette ligne ?')) return
    await supabase.from('projet_lignes').delete().eq('id', ligneId)
    const { data: lg } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).order('ordre')
    setLignes(lg || [])
  }

  async function saveLignes() {
    setSavingLignes(true)
    const updates = Object.entries(lignesEditees)
    for (const [ligneId, changes] of updates) {
      // Recalculer total_ht et total_achat si qte ou prix changent
      const ligne = lignes.find(l => l.id === ligneId)
      if (ligne) {
        const qte = parseFloat(changes.qte ?? ligne.qte) || 0
        const prixUnit = parseFloat(changes.prix_unit_ht ?? ligne.prix_unit_ht) || 0
        const prixAchat = parseFloat(changes.prix_achat_ht ?? ligne.prix_achat_ht) || 0
        const coeff = parseFloat(changes.coeff ?? ligne.coeff) || 0
        const payload = {
          ...changes,
          qte,
          prix_unit_ht: prixUnit,
          prix_achat_ht: prixAchat,
          total_ht: qte * prixUnit,
          total_achat: qte * prixAchat,
          coeff,
        }
        await supabase.from('projet_lignes').update(payload).eq('id', ligneId)
      }
    }
    setLignesEditees({})
    const { data: lg } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).order('ordre')
    const lgData = lg || []
    setLignes(lgData)

    // Recalculer et mettre à jour les totaux de chaque lot
    const lotsData = lgData.filter(l => l.type === 'lot')
    const lignesData = lgData.filter(l => l.type === 'ligne')
    for (const lot of lotsData) {
      const lgLot = lignesData.filter(l => l.lot === lot.numero)
      const newTotalHt = lgLot.reduce((s, l) => s + (l.total_ht || 0), 0)
      const newTotalAchat = lgLot.reduce((s, l) => s + (l.total_achat || 0), 0)
      await supabase.from('projet_lignes').update({ total_ht: newTotalHt, total_achat: newTotalAchat }).eq('id', lot.id)
    }

    // Recharger avec les lots mis à jour
    const { data: lgFinal } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).order('ordre')
    setLignes(lgFinal || [])

    // Mettre à jour montant_ht du projet
    const totalVenteFinal = (lgFinal || []).filter(l => l.type === 'lot').reduce((s, l) => s + (l.total_ht || 0), 0)
    if (totalVenteFinal > 0) {
      await supabase.from('projets').update({ montant_ht: totalVenteFinal }).eq('id', id)
      setProjet(prev => ({ ...prev, montant_ht: totalVenteFinal }))
    }

    setSavingLignes(false)
  }

  async function fetchAll() {
    setLoading(true)
    const [{ data: p }, { data: f }, { data: cmd }, { data: ffrs }, { data: fcli }, { data: lg }] = await Promise.all([
      supabase.from('projets').select('*, clients(nom, email, telephone, adresse)').eq('id', id).single(),
      supabase.from('fournisseurs').select('id, nom').order('nom'),
      supabase.from('commandes').select('*, fournisseurs(nom)').eq('projet_id', id).order('created_at', { ascending: false }),
      supabase.from('factures_frs').select('*, fournisseurs(nom), commandes(numero)').eq('projet_id', id).order('created_at', { ascending: false }),
      supabase.from('factures_cli').select('*').eq('projet_id', id).order('created_at', { ascending: false }),
      supabase.from('projet_lignes').select('*').eq('projet_id', id).order('ordre'),
    ])
    setProjet(p)
    setFournisseurs(f || [])
    setCommandes(cmd || [])
    setFacturesFrs(ffrs || [])
    setFacturesCli(fcli || [])
    setLignes(lg || [])
    // Fetch documents - deux dossiers
    const [{ data: docsProjet }, { data: docsOfficiels }] = await Promise.all([
      supabase.storage.from('documents').list('projets/' + id, { sortBy: { column: 'created_at', order: 'desc' } }),
      supabase.storage.from('documents').list('projets/' + id + '/officiels', { sortBy: { column: 'created_at', order: 'desc' } }),
    ])
    setDocuments({ projet: (docsProjet || []).filter(d => d.name && !d.name.startsWith('.')), officiels: docsOfficiels || [] })
    setLoading(false)
  }

  async function fetchCmdDocs(cmdId) {
    const { data } = await supabase.storage.from('documents').list('commandes/' + cmdId, { sortBy: { column: 'created_at', order: 'desc' } })
    setCmdDocs(prev => ({ ...prev, [cmdId]: data || [] }))
  }

  async function uploadDoc(file, path, onDone) {
    const fileName = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fullPath = path + '/' + fileName
    const { error } = await supabase.storage.from('documents').upload(fullPath, file)
    if (error) { alert('Erreur upload : ' + error.message); return }
    onDone()
  }

  async function deleteDoc(path) {
    if (!confirm('Supprimer ce document ?')) return
    await supabase.storage.from('documents').remove([path])
    const { data } = await supabase.storage.from('documents').list('projets/' + id, { sortBy: { column: 'created_at', order: 'desc' } })
    setDocuments(prev => ({ ...prev, projet: (data || []).filter(d => d.name && !d.name.startsWith('.')) }))
  }

  async function deleteCmdDoc(cmdId, path) {
    if (!confirm('Supprimer ce document ?')) return
    await supabase.storage.from('documents').remove([path])
    fetchCmdDocs(cmdId)
  }

  function getDocUrl(path) {
    const { data } = supabase.storage.from('documents').getPublicUrl(path)
    return data.publicUrl
  }

  // ── Import Excel lignes ───────────────────────────────────────
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

  async function handleImportLignes(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true); setImportError('')
    try {
      const { lignes: parsed, totalGeneral } = await parseExcel(file)
      await supabase.from('projet_lignes').delete().eq('projet_id', id)
      const toInsert = parsed.map((l, idx) => ({ ...l, projet_id: id, ordre: idx }))
      const { error } = await supabase.from('projet_lignes').insert(toInsert)
      if (error) throw error
      if (totalGeneral > 0) {
        await supabase.from('projets').update({ montant_ht: totalGeneral }).eq('id', id)
        setProjet(prev => ({ ...prev, montant_ht: totalGeneral }))
      }
      const { data: lg } = await supabase.from('projet_lignes').select('*').eq('projet_id', id).order('ordre')
      setLignes(lg || [])
    } catch (err) { setImportError("Erreur import : " + err.message) }
    setImporting(false); e.target.value = ''
  }

  // ── Save infos ────────────────────────────────────────────────
  async function saveInfos() {
    await supabase.from('projets').update(formInfos).eq('id', id)
    setProjet(prev => ({ ...prev, ...formInfos }))
    setEditInfos(false)
  }

  // ── Commandes ─────────────────────────────────────────────────
  function genNumeroCommande(projet, existingCommandes) {
    const nomCourt = (projet?.nom || 'PROJ').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase()
    const n = (existingCommandes?.length || 0) + 1
    const num = String(n).padStart(3, '0')
    return 'PP-' + nomCourt + '-' + num
  }

  async function ajouterCommande() {
    setError('')
    if (!formCmd.description.trim()) { setError('La description est obligatoire.'); return }
    const numeroAuto = formCmd.numero || genNumeroCommande(projet, commandes)
    const { error } = await supabase.from('commandes').insert([{
      ...formCmd,
      numero: numeroAuto,
      projet_id: id,
      montant_ht: parseFloat(formCmd.montant_ht) || 0,
      fournisseur_id: formCmd.fournisseur_id || null,
      date_commande: formCmd.date_commande || new Date().toISOString().split('T')[0]
    }])
    if (error) { setError(error.message); return }
    setShowForm(false)
    setFormCmd({ fournisseur_id: '', numero: '', description: '', montant_ht: '', statut: 'En attente', date_commande: '' })
    const { data } = await supabase.from('commandes').select('*, fournisseurs(nom)').eq('projet_id', id).order('created_at', { ascending: false })
    setCommandes(data || [])
  }

  async function saveCmd(cmdId) {
    const changes = cmdEditees[cmdId]
    if (!changes) return
    const payload = { ...changes }
    if (changes.montant_ht) payload.montant_ht = parseFloat(changes.montant_ht) || 0
    await supabase.from('commandes').update(payload).eq('id', cmdId)
    setCmdEditees(prev => { const n = { ...prev }; delete n[cmdId]; return n })
    const { data } = await supabase.from('commandes').select('*, fournisseurs(nom)').eq('projet_id', id).order('created_at', { ascending: false })
    setCommandes(data || [])
  }

  function getCmdVal(cmd, champ) {
    if (cmdEditees[cmd.id] && cmdEditees[cmd.id][champ] !== undefined) return cmdEditees[cmd.id][champ]
    return cmd[champ] ?? ''
  }

  function editCmd(cmdId, champ, valeur) {
    setCmdEditees(prev => ({ ...prev, [cmdId]: { ...(prev[cmdId] || {}), [champ]: valeur } }))
  }

  function generateCmdPDF(cmd) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    // En-tête
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 28, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont('helvetica', 'bold')
    doc.text('BON DE COMMANDE', 14, 14)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    doc.text(cmd.numero || '', 14, 22)
    doc.text('Date : ' + (cmd.date_commande ? new Date(cmd.date_commande).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')), 150, 22)
    doc.setTextColor(30, 41, 59)

    // Infos projet + fournisseur
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold'); doc.text('ÉMETTEUR', 14, 38)
    doc.setFont('helvetica', 'normal')
    doc.text('Partenaires Particuliers', 14, 44)
    doc.text(projet?.nom || '', 14, 49)
    if (projet?.adresse_chantier) doc.text(projet.adresse_chantier, 14, 54)

    doc.setFont('helvetica', 'bold'); doc.text('FOURNISSEUR', 110, 38)
    doc.setFont('helvetica', 'normal')
    doc.text(cmd.fournisseurs?.nom || '—', 110, 44)

    // Ligne séparation
    doc.setDrawColor(229, 231, 235); doc.line(14, 62, 196, 62)

    // Description de la commande
    doc.setFontSize(10); doc.setFont('helvetica', 'bold')
    doc.text('OBJET DE LA COMMANDE', 14, 72)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    const descLines = doc.splitTextToSize(cmd.description || '', 180)
    doc.text(descLines, 14, 79)

    let y = 79 + descLines.length * 5 + 8

    // Tableau montant
    autoTable(doc, {
      startY: y,
      head: [['Description', 'Montant HT']],
      body: [[cmd.description || '', (cmd.montant_ht ? Number(cmd.montant_ht).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €' : '—')]],
      foot: [['TOTAL HT', (cmd.montant_ht ? Number(cmd.montant_ht).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €' : '—')]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      footStyles: { fillColor: [240, 253, 244], textColor: [6, 95, 70], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
      margin: { left: 14, right: 14 },
    })

    y = doc.lastAutoTable.finalY + 15

    // Statut
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128)
    doc.text('Statut : ' + (cmd.statut || ''), 14, y)

    // Pied de page
    doc.setFontSize(7); doc.setTextColor(156, 163, 175)
    doc.text('Partenaires Particuliers — ' + (cmd.numero || ''), 14, 287)
    doc.text('Document généré le ' + new Date().toLocaleDateString('fr-FR'), 150, 287)

    return doc
  }

  async function ajouterFactureFrs() {
    setError('')
    if (!formFfrs.numero.trim()) { setError('Le numéro est obligatoire.'); return }
    const { error } = await supabase.from('factures_frs').insert([{ ...formFfrs, projet_id: id, montant_ht: parseFloat(formFfrs.montant_ht) || 0, fournisseur_id: formFfrs.fournisseur_id || null, commande_id: formFfrs.commande_id || null }])
    if (error) { setError(error.message); return }
    setShowForm(false); setFormFfrs({ fournisseur_id: '', commande_id: '', numero: '', montant_ht: '', statut: 'À payer', date_facture: '', date_echeance: '' })
    const { data } = await supabase.from('factures_frs').select('*, fournisseurs(nom), commandes(numero)').eq('projet_id', id).order('created_at', { ascending: false })
    setFacturesFrs(data || [])
  }

  async function ajouterFactureCli() {
    setError('')
    if (!formFcli.numero.trim()) { setError('Le numéro est obligatoire.'); return }
    const { error } = await supabase.from('factures_cli').insert([{ ...formFcli, projet_id: id, client_id: projet?.client_id || null, montant_ht: parseFloat(formFcli.montant_ht) || 0 }])
    if (error) { setError(error.message); return }
    setShowForm(false); setFormFcli({ numero: '', montant_ht: '', statut: 'À envoyer', date_facture: '', date_echeance: '' })
    const { data } = await supabase.from('factures_cli').select('*').eq('projet_id', id).order('created_at', { ascending: false })
    setFacturesCli(data || [])
  }

  async function supprimer(table, itemId) {
    if (!confirm('Supprimer ?')) return
    await supabase.from(table).delete().eq('id', itemId)
    if (table === 'commandes') { const { data } = await supabase.from('commandes').select('*, fournisseurs(nom)').eq('projet_id', id).order('created_at', { ascending: false }); setCommandes(data || []) }
    if (table === 'factures_frs') { const { data } = await supabase.from('factures_frs').select('*, fournisseurs(nom), commandes(numero)').eq('projet_id', id).order('created_at', { ascending: false }); setFacturesFrs(data || []) }
    if (table === 'factures_cli') { const { data } = await supabase.from('factures_cli').select('*').eq('projet_id', id).order('created_at', { ascending: false }); setFacturesCli(data || []) }
  }

  const fmt = n => n ? Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €' : '—'
  const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—'
  const totalCommandes = commandes.reduce((s, c) => s + (c.montant_ht || 0), 0)
  const totalFfrs = facturesFrs.reduce((s, f) => s + (f.montant_ht || 0), 0)
  const totalFcli = facturesCli.reduce((s, f) => s + (f.montant_ht || 0), 0)
  const marge = (projet?.montant_ht || 0) - totalCommandes

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement...</div>
  if (!projet) return <div style={{ padding: 40, textAlign: 'center', color: '#DC2626' }}>Projet introuvable</div>

  const lots = lignes.filter(l => l.type === 'lot')
  const lignesParLot = lignes.reduce((acc, l) => {
    if (l.type !== 'lot') { const lot = l.lot || 'sans'; if (!acc[lot]) acc[lot] = []; acc[lot].push(l) }
    return acc
  }, {})

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <button onClick={() => navigate('/projets')}
          style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, color: '#374151', flexShrink: 0 }}>← Projets</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{projet.nom}</h1>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>
            {projet.clients?.nom ? '👤 ' + projet.clients.nom : ''}
            {projet.date_debut ? ' · 📅 ' + fmtDate(projet.date_debut) + (projet.date_fin_prevue ? ' → ' + fmtDate(projet.date_fin_prevue) : '') : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: '#111827' }}>{fmt(projet.montant_ht)}</div>
          <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: (STATUT_COLOR[projet.statut] || '#2563EB') + '18', color: STATUT_COLOR[projet.statut] || '#2563EB', fontWeight: 600 }}>
            {STATUT_ICON[projet.statut]} {projet.statut}
          </span>
          <button onClick={generateDevisPDF}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#059669', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
            ⬇ Devis PDF
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', display: 'flex', paddingLeft: 16, overflowX: 'auto', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setShowForm(false); setError('') }}
            style={{ padding: '11px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
              fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? '#2563EB' : '#6B7280',
              borderBottom: tab === t.id ? '2px solid #2563EB' : '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>

        {/* ── INFOS ── */}
        {tab === 'infos' && (
          <div style={{ maxWidth: 720 }}>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Informations du projet</div>
                {!editInfos && (
                  <button onClick={() => { setEditInfos(true); setFormInfos({ nom: projet.nom, statut: projet.statut, surface: projet.surface || '', adresse_chantier: projet.adresse_chantier || '', date_debut: projet.date_debut || '', date_fin_prevue: projet.date_fin_prevue || '', notes: projet.notes || '', acces_livraison: projet.acces_livraison || '' }) }}
                    style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 12 }}>✏️ Modifier</button>
                )}
              </div>

              {/* Bandeau progression */}
            {(() => {
              const flux = ['Devis envoyé', 'Devis signé', 'En cours', 'Finalisation', 'Clôturé']
              const currentIdx = flux.indexOf(projet.statut)
              const icons = ['📤', '✍️', '🔨', '✅', '🏁']
              const colors = ['#EA580C', '#7C3AED', '#2563EB', '#059669', '#6B7280']
              const nextStatut = flux[currentIdx + 1]
              const prevStatut = flux[currentIdx - 1]

              // Descriptions des preuves requises
              const preuves = {
                'Devis signé': { label: 'Uploader le devis signé', type: 'upload' },
                'En cours': { label: 'Renseigner la date de début de chantier', type: 'date' },
                'Finalisation': { label: 'Toutes les commandes doivent être en statut "Reçue"', type: 'auto' },
                'Clôturé': { label: 'Toutes les factures clients doivent être "Payées"', type: 'auto' },
              }

              async function validerEtape() {
                setValidationError('')
                setValidating(true)
                const preuve = preuves[nextStatut]

                if (preuve?.type === 'upload') {
                  if (!validationDoc) { setValidationError('Veuillez uploader le devis signé.'); setValidating(false); return }
                  const fileName = Date.now() + '_' + validationDoc.name.replace(/[^a-zA-Z0-9._-]/g, '_')
                  const { error: uploadError } = await supabase.storage.from('documents').upload('projets/' + id + '/officiels/' + fileName, validationDoc)
                  if (uploadError) { setValidationError('Erreur upload : ' + uploadError.message); setValidating(false); return }
                  // Rafraîchir les docs officiels
                  const { data: newDocs } = await supabase.storage.from('documents').list('projets/' + id + '/officiels')
                  setDocuments(prev => ({ ...prev, officiels: newDocs || [] }))
                }

                if (preuve?.type === 'date') {
                  if (!validationDate) { setValidationError('Veuillez renseigner la date de début.'); setValidating(false); return }
                  await supabase.from('projets').update({ date_debut: validationDate }).eq('id', id)
                  setProjet(prev => ({ ...prev, date_debut: validationDate }))
                }

                if (preuve?.type === 'auto' && nextStatut === 'Finalisation') {
                  const cmdNonRecues = commandes.filter(c => c.statut !== 'Reçue' && c.statut !== 'Annulée')
                  if (cmdNonRecues.length > 0) { setValidationError(cmdNonRecues.length + ' commande(s) ne sont pas encore en statut "Reçue".'); setValidating(false); return }
                }

                if (preuve?.type === 'auto' && nextStatut === 'Clôturé') {
                  const factNonPayees = facturesCli.filter(f => f.statut !== 'Payée')
                  if (factNonPayees.length > 0) { setValidationError(factNonPayees.length + ' facture(s) client ne sont pas encore "Payées".'); setValidating(false); return }
                }

                await supabase.from('projets').update({ statut: nextStatut }).eq('id', id)
                setProjet(prev => ({ ...prev, statut: nextStatut }))
                setShowValidation(false)
                setValidationDoc(null)
                setValidationDate('')
                setValidating(false)
              }

              return (
                <>
                {/* Modale de validation */}
                {showValidation && nextStatut && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                      <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>Passer à : {icons[currentIdx + 1]} {nextStatut}</h3>
                      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
                        Pour valider ce changement d'étape, merci de fournir la preuve requise.
                      </p>

                      {validationError && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{validationError}</div>}

                      {preuves[nextStatut]?.type === 'upload' && (
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 6 }}>📎 {preuves[nextStatut].label}</label>
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                            onChange={e => setValidationDoc(e.target.files[0])}
                            style={{ fontSize: 13 }} />
                          {validationDoc && <div style={{ fontSize: 12, color: '#059669', marginTop: 6 }}>✓ {validationDoc.name}</div>}
                        </div>
                      )}

                      {preuves[nextStatut]?.type === 'date' && (
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 6 }}>📅 {preuves[nextStatut].label}</label>
                          <input type="date" value={validationDate} onChange={e => setValidationDate(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
                        </div>
                      )}

                      {preuves[nextStatut]?.type === 'auto' && (
                        <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: '#374151' }}>
                          ℹ️ {preuves[nextStatut].label}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setShowValidation(false); setValidationError(''); setValidationDoc(null); setValidationDate('') }}
                          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
                        <button onClick={validerEtape} disabled={validating}
                          style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: colors[currentIdx + 1], color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                          {validating ? '⏳...' : 'Valider ✓'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '16px 20px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Avancement du projet</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {prevStatut && (
                        <button onClick={async () => {
                          if (!confirm('Revenir à "' + prevStatut + '" ?')) return
                          await supabase.from('projets').update({ statut: prevStatut }).eq('id', id)
                          setProjet(prev => ({ ...prev, statut: prevStatut }))
                        }}
                          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', cursor: 'pointer', fontSize: 12 }}>
                          ← Revenir
                        </button>
                      )}
                      {nextStatut && (
                        <button onClick={() => setShowValidation(true)}
                          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: colors[currentIdx + 1], color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          Passer à : {icons[currentIdx + 1]} {nextStatut}
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    {flux.map((s, idx) => {
                      const done = idx <= currentIdx
                      const active = idx === currentIdx
                      return (
                        <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: done ? colors[idx] : '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, border: active ? '3px solid ' + colors[idx] : 'none', boxShadow: active ? '0 0 0 4px ' + colors[idx] + '22' : 'none', transition: 'all 0.2s' }}>
                              {done ? <span>{icons[idx]}</span> : <span style={{ fontSize: 11, color: '#9CA3AF' }}>{idx + 1}</span>}
                            </div>
                            <div style={{ fontSize: 9, color: done ? colors[idx] : '#9CA3AF', fontWeight: active ? 700 : 400, marginTop: 4, textAlign: 'center', whiteSpace: 'nowrap' }}>{s}</div>
                          </div>
                          {idx < flux.length - 1 && (
                            <div style={{ height: 2, flex: 0.5, background: idx < currentIdx ? colors[idx] : '#E5E7EB', marginBottom: 16 }} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                </>
              )
            })()}

            {editInfos ? (
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Nom du projet</label>
                      <input value={formInfos.nom || ''} onChange={e => setFormInfos(p => ({ ...p, nom: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Statut</label>
                      <select value={formInfos.statut || ''} onChange={e => setFormInfos(p => ({ ...p, statut: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
                        {STATUTS_PROJET.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Surface (m²)</label>
                      <input value={formInfos.surface || ''} onChange={e => setFormInfos(p => ({ ...p, surface: e.target.value }))} placeholder="465"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Date début</label>
                      <input type="date" value={formInfos.date_debut || ''} onChange={e => setFormInfos(p => ({ ...p, date_debut: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Date fin prévue</label>
                      <input type="date" value={formInfos.date_fin_prevue || ''} onChange={e => setFormInfos(p => ({ ...p, date_fin_prevue: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Adresse chantier</label>
                      <input value={formInfos.adresse_chantier || ''} onChange={e => setFormInfos(p => ({ ...p, adresse_chantier: e.target.value }))} placeholder="12 rue de la Paix, 75001 Paris"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Accès / Livraison</label>
                      <input value={formInfos.acces_livraison || ''} onChange={e => setFormInfos(p => ({ ...p, acces_livraison: e.target.value }))} placeholder="Livraison quai nord, accès badge..."
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Notes</label>
                      <textarea value={formInfos.notes || ''} onChange={e => setFormInfos(p => ({ ...p, notes: e.target.value }))} rows={3}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setEditInfos(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
                    <button onClick={saveInfos} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>Sauvegarder</button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 32px' }}>
                    {[
                      ['Client', projet.clients?.nom],
                      ['Statut', projet.statut],
                      ['Surface', projet.surface ? projet.surface + ' m²' : null],
                      ['Montant HT', fmt(projet.montant_ht)],
                      ['Date début', fmtDate(projet.date_debut)],
                      ['Date fin prévue', fmtDate(projet.date_fin_prevue)],
                      ['Adresse chantier', projet.adresse_chantier],
                      ['Accès / Livraison', projet.acces_livraison],
                    ].map(([label, value]) => value ? (
                      <div key={label}>
                        <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 14, color: '#111827', fontWeight: 500 }}>{value}</div>
                      </div>
                    ) : null)}
                  </div>
                  {projet.notes && (
                    <div style={{ marginTop: 16, padding: 12, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 13, color: '#374151' }}>
                      📝 {projet.notes}
                    </div>
                  )}
                  {projet.clients && (
                    <div style={{ marginTop: 16, padding: 14, background: '#F8FAFC', borderRadius: 8, fontSize: 13 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>👤 {projet.clients.nom}</div>
                      {projet.clients.email && <div style={{ color: '#6B7280' }}>✉️ {projet.clients.email}</div>}
                      {projet.clients.telephone && <div style={{ color: '#6B7280' }}>📞 {projet.clients.telephone}</div>}
                      {projet.clients.adresse && <div style={{ color: '#6B7280' }}>📍 {projet.clients.adresse}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── LIGNES ── */}
        {tab === 'lignes' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                Lignes du projet
                {lignes.length > 0 && <span style={{ marginLeft: 8, fontSize: 13, color: '#6B7280', fontWeight: 400 }}>{lots.length} lots · {lignes.filter(l => l.type === 'ligne').length} lignes</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowAddLigne(!showAddLigne)}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  + Ligne manuelle
                </button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#2563EB', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  {importing ? '⏳ Import...' : '⬆ Importer Excel'}
                  <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportLignes} />
                </label>
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
                {/* Preview du prix vente */}
                {formLigne.prix_achat_ht && formLigne.coeff && (
                  <div style={{ fontSize: 12, color: '#059669', marginBottom: 12, fontWeight: 500 }}>
                    → Prix vente HT : {(parseFloat(formLigne.prix_achat_ht) * parseFloat(formLigne.coeff)).toFixed(2)} € 
                    {formLigne.qte ? ` · Total : ${(parseFloat(formLigne.qte) * parseFloat(formLigne.prix_achat_ht) * parseFloat(formLigne.coeff)).toFixed(2)} €` : ''}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setShowAddLigne(false)}
                    style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
                  <button onClick={ajouterLigne} disabled={savingLigne}
                    style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
                    {savingLigne ? '⏳...' : '+ Ajouter'}
                  </button>
                </div>
              </div>
            )}

            {/* Sélecteur de mode de calcul */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>Mode de calcul :</span>
              {[
                { id: 'achat_coeff', label: 'Achat × Coeff → Vente' },
                { id: 'vente_coeff', label: 'Vente ÷ Coeff → Achat' },
                { id: 'achat_vente', label: 'Vente ÷ Achat → Coeff' },
              ].map(m => (
                <button key={m.id} onClick={() => setModeCalc(m.id)}
                  style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid ' + (modeCalc === m.id ? '#2563EB' : '#E5E7EB'),
                    background: modeCalc === m.id ? '#EFF6FF' : '#fff', color: modeCalc === m.id ? '#2563EB' : '#6B7280',
                    cursor: 'pointer', fontSize: 12, fontWeight: modeCalc === m.id ? 600 : 400 }}>
                  {m.label}
                </button>
              ))}
            </div>

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

            {lignes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📐</div>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Aucune ligne</div>
                <div style={{ fontSize: 13 }}>Importe ton Excel (même format que le devis)</div>
              </div>
            ) : (<>
              {/* Récap global */}
              {(() => {
                // Inclure aussi les lignes sans lot
                const lignesSansLot = (lignesParLot['sans'] || []).filter(l => l.type === 'ligne')
                const venteLotsOnly = lots.reduce((s, l) => s + (l.total_ht || 0), 0)
                const achatLotsOnly = lots.reduce((s, l) => s + (l.total_achat || 0), 0)
                const venteSansLot = lignesSansLot.reduce((s, l) => s + (l.total_ht || 0), 0)
                const achatSansLot = lignesSansLot.reduce((s, l) => s + (l.total_achat || 0), 0)
                const totalVenteGlobal = venteLotsOnly + venteSansLot
                const totalAchatGlobal = achatLotsOnly + achatSansLot
                const margeGlobal = totalVenteGlobal - totalAchatGlobal
                const tauxGlobal = totalVenteGlobal > 0 ? ((margeGlobal / totalVenteGlobal) * 100).toFixed(1) : 0
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                    {[
                      { label: 'Total Vente HT', value: totalVenteGlobal, color: '#059669', bg: '#F0FDF4', border: '#BBF7D0' },
                      { label: 'Total Achat HT', value: totalAchatGlobal, color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
                      { label: 'Marge brute', value: margeGlobal, color: margeGlobal >= 0 ? '#059669' : '#DC2626', bg: margeGlobal >= 0 ? '#F0FDF4' : '#FEF2F2', border: margeGlobal >= 0 ? '#BBF7D0' : '#FCA5A5' },
                      { label: 'Taux de marge', value: tauxGlobal + '%', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', isText: true },
                    ].map(({ label, value, color, bg, border, isText }) => (
                      <div key={label} style={{ background: bg, border: '1px solid ' + border, borderRadius: 10, padding: '12px 16px' }}>
                        <div style={{ fontSize: 11, color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color }}>{isText ? value : Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'}</div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {lots.map(lot => {
                const estReduit = lotsReduits[lot.numero]
                const totalVenteLot = lot.total_ht || 0
                const totalAchatLot = lot.total_achat || 0
                const margeLot = totalVenteLot - totalAchatLot
                return (
                <div key={lot.numero} style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                  <div onClick={() => setLotsReduits(prev => ({ ...prev, [lot.numero]: !prev[lot.numero] }))}
                    style={{ background: '#1E293B', color: '#fff', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 14, color: '#94A3B8', transition: 'transform 0.2s', display: 'inline-block', transform: estReduit ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>LOT {lot.numero} — {lot.categorie}{lot.descriptif ? ' · ' + lot.descriptif : ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#86EFAC' }}>Vente : {Number(totalVenteLot).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €</span>
                      <span style={{ fontSize: 12, color: '#93C5FD' }}>Achat : {Number(totalAchatLot).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €</span>
                      <span style={{ fontSize: 12, color: margeLot >= 0 ? '#86EFAC' : '#FCA5A5', fontWeight: 600 }}>Marge : {Number(margeLot).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €</span>
                    </div>
                  </div>
                  {!estReduit && <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                        <th style={{ padding: '7px 10px', textAlign: 'left', color: '#6B7280', fontWeight: 500, width: 50 }}>N°</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', color: '#6B7280', fontWeight: 500 }}>Désignation</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center', color: '#6B7280', fontWeight: 500, width: 50 }}>Unité</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: '#6B7280', fontWeight: 500, width: 50 }}>Qté</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: '#059669', fontWeight: 600, width: 95 }}>P.U. Vente</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: '#059669', fontWeight: 600, width: 100 }}>Total Vente</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: '#6B7280', fontWeight: 500, width: 60 }}>Coeff.</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: '#2563EB', fontWeight: 600, width: 95 }}>P.U. Achat</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: '#2563EB', fontWeight: 600, width: 100 }}>Total Achat</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center', color: '#6B7280', fontWeight: 500, width: 80 }}>Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(lignesParLot[lot.numero] || []).map((l, i) => {
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
                        const coeff = parseFloat(getLigneVal(l, 'coeff')) || 0
                        const totalVente = isEdited ? qte * puVente : (l.total_ht || 0)
                        const totalAchat = isEdited ? qte * puAchat : (l.total_achat || 0)
                        const modeLocal = modeLignes[l.id] || 'ac'
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', background: isEdited ? '#FFFBEB' : i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                            <td style={{ padding: '4px 6px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <span style={{ fontSize: 11 }}>{l.numero}</span>
                                <button onClick={() => supprimerLigne(l.id)}
                                  style={{ background: 'none', border: 'none', color: '#FCA5A5', cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1, opacity: 0.6 }}
                                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                  onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>✕</button>
                              </div>
                            </td>
                            <td style={{ padding: '4px 6px', color: '#374151', maxWidth: 300 }}>
                              <input value={getLigneVal(l, 'descriptif')} onChange={e => editLigne(l.id, 'descriptif', e.target.value, l)}
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
                              {/* P.U. Vente — bloqué en mode A×C (calculé) */}
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
                              {/* Coeff — bloqué en mode V÷A (calculé) */}
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
                              {/* P.U. Achat — bloqué en mode V÷C (calculé) */}
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
                              <div style={{ display: 'flex', gap: 2 }}>
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
                      })}
                    </tbody>
                  </table>}
                </div>
              )
              })}
              {/* Lignes sans lot */}
              {(lignesParLot['sans'] || []).filter(l => l.type === 'ligne' || l.type === 'titre').length > 0 && (
                <div style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                  <div style={{ background: '#374151', color: '#fff', padding: '10px 16px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Lignes sans lot</span>
                    <span style={{ fontSize: 12, color: '#D1FAE5' }}>
                      Vente : {Number((lignesParLot['sans'] || []).reduce((s, l) => s + (l.total_ht || 0), 0)).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                        <th style={{ padding: '7px 10px', textAlign: 'left', color: '#6B7280', fontWeight: 500, width: 50 }}>N°</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', color: '#6B7280', fontWeight: 500 }}>Désignation</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center', color: '#6B7280', fontWeight: 500, width: 50 }}>Unité</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: '#6B7280', fontWeight: 500, width: 50 }}>Qté</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: '#059669', fontWeight: 600, width: 95 }}>P.U. Vente</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: '#059669', fontWeight: 600, width: 100 }}>Total Vente</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: '#6B7280', fontWeight: 500, width: 60 }}>Coeff.</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: '#2563EB', fontWeight: 600, width: 95 }}>P.U. Achat</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', color: '#2563EB', fontWeight: 600, width: 100 }}>Total Achat</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center', color: '#6B7280', fontWeight: 500, width: 80 }}>Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(lignesParLot['sans'] || []).map((l, i) => {
                        const isEdited = !!lignesEditees[l.id]
                        const modeLocal = modeLignes[l.id] || 'ac'
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
                        const totalVente = isEdited ? qte * puVente : (l.total_ht || 0)
                        const totalAchat = isEdited ? qte * puAchat : (l.total_achat || 0)
                        return (
                          <>
                          <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', background: isEdited ? '#FFFBEB' : i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                            <td style={{ padding: '4px 6px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <span style={{ fontSize: 11 }}>{l.numero}</span>
                                <button onClick={() => supprimerLigne(l.id)} style={{ background: 'none', border: 'none', color: '#FCA5A5', cursor: 'pointer', fontSize: 11, padding: '0 2px', opacity: 0.6 }}
                                  onMouseEnter={e => e.currentTarget.style.opacity='1'} onMouseLeave={e => e.currentTarget.style.opacity='0.6'}>✕</button>
                              </div>
                            </td>
                            <td style={{ padding: '4px 6px', color: '#374151', maxWidth: 300 }}>
                              <input value={getLigneVal(l, 'descriptif')} onChange={e => editLigne(l.id, 'descriptif', e.target.value, l)}
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
                              {modeLocal === 'ac' ? <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: '#9CA3AF', background: '#F3F4F6', borderRadius: 4, border: '1px solid #E5E7EB' }}>{getLigneVal(l, 'prix_unit_ht') || '—'}</div>
                              : <input type="number" value={getLigneVal(l, 'prix_unit_ht')} onChange={e => editLigne(l.id, 'prix_unit_ht', e.target.value, l)} style={{ ...inputStyle, border: isEdited ? '1px solid #BBF7D0' : '1px solid transparent', background: isEdited ? '#F0FDF4' : 'transparent', color: '#065F46' }} />}
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: totalVente > 0 ? '#065F46' : '#9CA3AF' }}>
                              {totalVente > 0 ? Number(totalVente).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              {modeLocal === 'av' ? <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: '#9CA3AF', background: '#F3F4F6', borderRadius: 4, border: '1px solid #E5E7EB' }}>{getLigneVal(l, 'coeff') || '—'}</div>
                              : <input type="number" value={getLigneVal(l, 'coeff')} onChange={e => editLigne(l.id, 'coeff', e.target.value, l)} style={{ width: '100%', padding: '3px 6px', borderRadius: 4, border: isEdited ? '1px solid #E9D5FF' : '1px solid transparent', fontSize: 12, textAlign: 'right', boxSizing: 'border-box', background: isEdited ? '#F5F3FF' : 'transparent', color: '#7C3AED' }} />}
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              {modeLocal === 'vc' ? <div style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', color: '#9CA3AF', background: '#F3F4F6', borderRadius: 4, border: '1px solid #E5E7EB' }}>{getLigneVal(l, 'prix_achat_ht') || '—'}</div>
                              : <input type="number" value={getLigneVal(l, 'prix_achat_ht')} onChange={e => editLigne(l.id, 'prix_achat_ht', e.target.value, l)} style={{ ...inputStyle, border: isEdited ? '1px solid #BFDBFE' : '1px solid transparent', background: isEdited ? '#EFF6FF' : 'transparent', color: '#2563EB' }} />}
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: totalAchat > 0 ? '#2563EB' : '#9CA3AF' }}>
                              {totalAchat > 0 ? Number(totalAchat).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </td>
                            <td style={{ padding: '4px 4px', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', gap: 2 }}>
                                {[['ac', 'C×A'], ['vc', 'C×V'], ['av', 'V/A']].map(([mode, label]) => (
                                  <button key={mode} onClick={() => setModeLignes(prev => ({ ...prev, [l.id]: mode }))}
                                    style={{ padding: '2px 5px', borderRadius: 4, border: '1px solid ' + (modeLocal === mode ? '#7C3AED' : '#E5E7EB'), background: modeLocal === mode ? '#F5F3FF' : '#fff', color: modeLocal === mode ? '#7C3AED' : '#9CA3AF', cursor: 'pointer', fontSize: 10, fontWeight: modeLocal === mode ? 600 : 400 }}>
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>)}
          </div>
        )}

        {/* ── COMMANDES ── */}
        {tab === 'commandes' && (
          <div>
            {/* PDF Preview Modal */}
            {showPdfPreview && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Aperçu — {showPdfPreview.numero}</h3>
                  <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 20, marginBottom: 20, fontSize: 13, lineHeight: 1.7 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                      <div><div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 2 }}>N° Commande</div><div style={{ fontWeight: 600 }}>{showPdfPreview.numero}</div></div>
                      <div><div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 2 }}>Date</div><div>{fmtDate(showPdfPreview.date_commande)}</div></div>
                      <div><div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 2 }}>Fournisseur</div><div style={{ fontWeight: 600 }}>{showPdfPreview.fournisseurs?.nom || '—'}</div></div>
                      <div><div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 2 }}>Montant HT</div><div style={{ fontWeight: 700, color: '#059669', fontSize: 15 }}>{fmt(showPdfPreview.montant_ht)}</div></div>
                    </div>
                    <div><div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 4 }}>Description</div><div style={{ color: '#374151' }}>{showPdfPreview.description}</div></div>
                    <div style={{ marginTop: 12 }}><div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 4 }}>Projet</div><div>{projet?.nom}</div></div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowPdfPreview(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Fermer</button>
                    <button onClick={() => { generateCmdPDF(showPdfPreview).save((showPdfPreview.numero || 'commande') + '.pdf'); setShowPdfPreview(null) }}
                      style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
                      ⬇ Télécharger PDF
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Commandes fournisseurs · <span style={{ color: '#2563EB' }}>{fmt(totalCommandes)}</span></div>
              <button onClick={() => { setShowForm(true); setError('');
                setFormCmd({ fournisseur_id: '', numero: genNumeroCommande(projet, commandes), description: '', montant_ht: '', statut: 'En attente', date_commande: new Date().toISOString().split('T')[0] }) }}
                style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
                + Nouvelle commande
              </button>
            </div>

            {showForm && (
              <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #E5E7EB', marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Nouvelle commande</h4>
                {error && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Fournisseur</label>
                    <select value={formCmd.fournisseur_id} onChange={e => setFormCmd(p => ({ ...p, fournisseur_id: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
                      <option value=''>— Aucun —</option>
                      {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>N° commande (auto)</label>
                    <input value={formCmd.numero} onChange={e => setFormCmd(p => ({ ...p, numero: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', background: '#F9FAFB' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label style={{ fontSize: 12, color: '#6B7280' }}>Description *</label>
                      <button onClick={() => setShowLignesSelector(!showLignesSelector)}
                        style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#2563EB', cursor: 'pointer' }}>
                        📐 Depuis lignes projet
                      </button>
                    </div>
                    {showLignesSelector && (
                      <div style={{ background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 8, padding: 10, marginBottom: 8, maxHeight: 200, overflow: 'auto' }}>
                        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 6 }}>Cliquer sur un lot ou une ligne pour l'utiliser :</div>
                        {lignes.filter(l => l.type === 'lot').map(lot => (
                          <div key={lot.id}>
                            <div onClick={() => { setFormCmd(p => ({ ...p, description: 'LOT ' + lot.numero + ' — ' + (lot.categorie || '') + (lot.descriptif ? ' · ' + lot.descriptif : ''), montant_ht: lot.total_achat || lot.total_ht || '' })); setShowLignesSelector(false) }}
                              style={{ padding: '5px 8px', cursor: 'pointer', borderRadius: 4, fontWeight: 600, fontSize: 12, color: '#1E293B', background: '#E2E8F0', marginBottom: 2 }}
                              onMouseEnter={e => e.currentTarget.style.background = '#CBD5E1'}
                              onMouseLeave={e => e.currentTarget.style.background = '#E2E8F0'}>
                              LOT {lot.numero} — {lot.categorie} · {lot.total_achat > 0 ? Number(lot.total_achat).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €' : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <input value={formCmd.description} onChange={e => setFormCmd(p => ({ ...p, description: e.target.value }))} placeholder="Ex: Cloisons vitrées lot 3"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Montant HT (€)</label>
                    <input type="number" value={formCmd.montant_ht} onChange={e => setFormCmd(p => ({ ...p, montant_ht: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Date commande</label>
                    <input type="date" value={formCmd.date_commande} onChange={e => setFormCmd(p => ({ ...p, date_commande: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Statut</label>
                    <select value={formCmd.statut} onChange={e => setFormCmd(p => ({ ...p, statut: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
                      {STATUTS_CMD.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowForm(false); setError(''); setShowLignesSelector(false) }} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
                  <button onClick={ajouterCommande} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>Créer la commande</button>
                </div>
              </div>
            )}

            {commandes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🛒</div><div style={{ fontSize: 14, fontWeight: 500 }}>Aucune commande</div>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                      {['Code CF', 'Statut', 'Date', 'Fournisseur', 'Description', 'Achat HT', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Achat HT' ? 'right' : 'left', color: '#6B7280', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {commandes.map((c, i) => {
                      const isEdited = !!cmdEditees[c.id]
                      const inStyle = { padding: '3px 6px', borderRadius: 4, border: isEdited ? '1px solid #BFDBFE' : '1px solid transparent', fontSize: 12, background: isEdited ? '#EFF6FF' : 'transparent', boxSizing: 'border-box', width: '100%' }
                      return (
                        <>
                        <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6', background: isEdited ? '#FFFBEB' : i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                          <td style={{ padding: '8px 14px', fontWeight: 600, color: '#2563EB', fontSize: 12, whiteSpace: 'nowrap' }}>
                            <input value={getCmdVal(c, 'numero')} onChange={e => editCmd(c.id, 'numero', e.target.value)}
                              style={{ ...inStyle, width: 140, fontWeight: 600, color: '#2563EB' }} />
                          </td>
                          <td style={{ padding: '8px 14px' }}>
                            <select value={getCmdVal(c, 'statut')} onChange={e => { editCmd(c.id, 'statut', e.target.value) }}
                              style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 11, cursor: 'pointer',
                                background: c.statut === 'Reçue' ? '#ECFDF5' : c.statut === 'Annulée' ? '#FEF2F2' : c.statut === 'Envoyée' ? '#F0FDF4' : '#EFF6FF',
                                color: c.statut === 'Reçue' ? '#059669' : c.statut === 'Annulée' ? '#DC2626' : c.statut === 'Envoyée' ? '#059669' : '#2563EB' }}>
                              {STATUTS_CMD.map(s => <option key={s}>{s}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '8px 14px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                            <input type="date" value={getCmdVal(c, 'date_commande')} onChange={e => editCmd(c.id, 'date_commande', e.target.value)}
                              style={{ ...inStyle, width: 120, color: '#6B7280' }} />
                          </td>
                          <td style={{ padding: '8px 14px' }}>
                            <select value={getCmdVal(c, 'fournisseur_id') || ''} onChange={e => editCmd(c.id, 'fournisseur_id', e.target.value)}
                              style={{ ...inStyle, width: 160 }}>
                              <option value=''>— Aucun —</option>
                              {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '8px 14px' }}>
                            <input value={getCmdVal(c, 'description')} onChange={e => editCmd(c.id, 'description', e.target.value)}
                              style={{ ...inStyle, minWidth: 200 }} />
                          </td>
                          <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                            <input type="number" value={getCmdVal(c, 'montant_ht')} onChange={e => editCmd(c.id, 'montant_ht', e.target.value)}
                              style={{ ...inStyle, width: 100, textAlign: 'right', fontWeight: 600, color: '#111827' }} />
                          </td>
                          <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              {isEdited && (
                                <button onClick={() => saveCmd(c.id)}
                                  style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>✓</button>
                              )}
                              <button onClick={() => setShowPdfPreview({ ...c, ...cmdEditees[c.id], fournisseurs: fournisseurs.find(f => f.id === (cmdEditees[c.id]?.fournisseur_id || c.fournisseur_id)) })}
                                style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#059669', cursor: 'pointer', fontSize: 11 }}>👁 PDF</button>
                              <button onClick={() => { if (expandedCmd === c.id) { setExpandedCmd(null) } else { setExpandedCmd(c.id); fetchCmdDocs(c.id) } }}
                                style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #E9D5FF', background: '#F5F3FF', color: '#7C3AED', cursor: 'pointer', fontSize: 11 }}>
                                📎 {cmdDocs[c.id]?.length > 0 ? cmdDocs[c.id].length : ''}
                              </button>
                              <button onClick={() => supprimer('commandes', c.id)}
                                style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 13 }}>✕</button>
                            </div>
                          </td>
                        </tr>
                        {/* Zone documents commande */}
                        {expandedCmd === c.id && (
                          <tr key={c.id + '_docs'} style={{ background: '#F5F3FF' }}>
                            <td colSpan={7} style={{ padding: '12px 20px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#7C3AED' }}>📎 Pièces jointes — {c.numero}</span>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: '#7C3AED', color: '#fff', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>
                                  {uploadingDoc === c.id ? '⏳' : '+ Ajouter'}
                                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }}
                                    onChange={async (e) => {
                                      const file = e.target.files[0]; if (!file) return
                                      setUploadingDoc(c.id)
                                      await uploadDoc(file, 'commandes/' + c.id, () => fetchCmdDocs(c.id))
                                      setUploadingDoc(null)
                                      e.target.value = ''
                                    }} />
                                </label>
                              </div>
                              {!cmdDocs[c.id] || cmdDocs[c.id].length === 0 ? (
                                <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>Aucun document — ajoutez le devis fournisseur, bon de livraison...</div>
                              ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                  {cmdDocs[c.id].map(doc => (
                                    <div key={doc.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#fff', borderRadius: 8, border: '1px solid #DDD6FE', fontSize: 12 }}>
                                      <span>{doc.name.includes('.pdf') ? '📄' : doc.name.match(/\.(jpg|jpeg|png)/) ? '🖼' : '📎'}</span>
                                      <a href={getDocUrl('commandes/' + c.id + '/' + doc.name)} target="_blank" rel="noopener noreferrer"
                                        style={{ color: '#7C3AED', textDecoration: 'none', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {doc.name.replace(/^\d+_/, '')}
                                      </a>
                                      <button onClick={() => deleteCmdDoc(c.id, 'commandes/' + c.id + '/' + doc.name)}
                                        style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── FACTURES FRS ── */}
        {tab === 'factures_frs' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Factures fournisseurs · <span style={{ color: '#EA580C' }}>{fmt(totalFfrs)}</span></div>
              <button onClick={() => { setShowForm(true); setError('') }} style={{ background: '#EA580C', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>+ Nouvelle facture</button>
            </div>
            {showForm && (
              <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #E5E7EB', marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Nouvelle facture fournisseur</h4>
                {error && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>N° facture *</label>
                    <input value={formFfrs.numero} onChange={e => setFormFfrs(p => ({ ...p, numero: e.target.value }))} placeholder="FAC-2026-001"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} /></div>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Fournisseur</label>
                    <select value={formFfrs.fournisseur_id} onChange={e => setFormFfrs(p => ({ ...p, fournisseur_id: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
                      <option value=''>— Aucun —</option>{fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}</select></div>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Commande liée</label>
                    <select value={formFfrs.commande_id} onChange={e => setFormFfrs(p => ({ ...p, commande_id: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
                      <option value=''>— Aucune —</option>{commandes.map(c => <option key={c.id} value={c.id}>{c.numero || c.description}</option>)}</select></div>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Montant HT (€)</label>
                    <input type="number" value={formFfrs.montant_ht} onChange={e => setFormFfrs(p => ({ ...p, montant_ht: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} /></div>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Date facture</label>
                    <input type="date" value={formFfrs.date_facture} onChange={e => setFormFfrs(p => ({ ...p, date_facture: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} /></div>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Date échéance</label>
                    <input type="date" value={formFfrs.date_echeance} onChange={e => setFormFfrs(p => ({ ...p, date_echeance: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} /></div>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Statut</label>
                    <select value={formFfrs.statut} onChange={e => setFormFfrs(p => ({ ...p, statut: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
                      {STATUTS_FFRS.map(s => <option key={s}>{s}</option>)}</select></div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowForm(false); setError('') }} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
                  <button onClick={ajouterFactureFrs} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#EA580C', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>Ajouter</button>
                </div>
              </div>
            )}
            {facturesFrs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div><div style={{ fontSize: 14, fontWeight: 500 }}>Aucune facture fournisseur</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #E5E7EB', fontSize: 13 }}>
                <thead><tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                  {['N°', 'Fournisseur', 'Commande', 'Date', 'Échéance', 'Montant HT', 'Statut', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Montant HT' ? 'right' : 'left', color: '#6B7280', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {facturesFrs.map((f, i) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500 }}>{f.numero}</td>
                      <td style={{ padding: '10px 14px' }}>{f.fournisseurs?.nom || '—'}</td>
                      <td style={{ padding: '10px 14px', color: '#9CA3AF', fontSize: 12 }}>{f.commandes?.numero || '—'}</td>
                      <td style={{ padding: '10px 14px', color: '#9CA3AF' }}>{fmtDate(f.date_facture)}</td>
                      <td style={{ padding: '10px 14px', color: f.statut === 'À payer' && f.date_echeance && new Date(f.date_echeance) < new Date() ? '#DC2626' : '#9CA3AF', fontWeight: f.statut === 'À payer' && f.date_echeance && new Date(f.date_echeance) < new Date() ? 600 : 400 }}>{fmtDate(f.date_echeance)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{fmt(f.montant_ht)}</td>
                      <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: f.statut === 'Payée' ? '#ECFDF5' : '#FFF7ED', color: f.statut === 'Payée' ? '#059669' : '#EA580C', fontWeight: 500 }}>{f.statut}</span></td>
                      <td style={{ padding: '10px 14px' }}><button onClick={() => supprimer('factures_frs', f.id)} style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer' }}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── FACTURES CLI ── */}
        {tab === 'factures_cli' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Factures clients · <span style={{ color: '#059669' }}>{fmt(totalFcli)}</span></div>
              <button onClick={() => { setShowForm(true); setError('') }} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>+ Nouvelle facture</button>
            </div>
            {showForm && (
              <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #E5E7EB', marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Nouvelle facture client</h4>
                {error && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>N° facture *</label>
                    <input value={formFcli.numero} onChange={e => setFormFcli(p => ({ ...p, numero: e.target.value }))} placeholder="FACT-2026-001"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} /></div>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Montant HT (€)</label>
                    <input type="number" value={formFcli.montant_ht} onChange={e => setFormFcli(p => ({ ...p, montant_ht: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} /></div>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Date facture</label>
                    <input type="date" value={formFcli.date_facture} onChange={e => setFormFcli(p => ({ ...p, date_facture: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} /></div>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Date échéance</label>
                    <input type="date" value={formFcli.date_echeance} onChange={e => setFormFcli(p => ({ ...p, date_echeance: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} /></div>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Statut</label>
                    <select value={formFcli.statut} onChange={e => setFormFcli(p => ({ ...p, statut: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
                      {STATUTS_FCLI.map(s => <option key={s}>{s}</option>)}</select></div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowForm(false); setError('') }} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
                  <button onClick={ajouterFactureCli} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>Ajouter</button>
                </div>
              </div>
            )}
            {facturesCli.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>💶</div><div style={{ fontSize: 14, fontWeight: 500 }}>Aucune facture client</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #E5E7EB', fontSize: 13 }}>
                <thead><tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                  {['N°', 'Date', 'Échéance', 'Montant HT', 'Statut', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Montant HT' ? 'right' : 'left', color: '#6B7280', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {facturesCli.map((f, i) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500 }}>{f.numero}</td>
                      <td style={{ padding: '10px 14px', color: '#9CA3AF' }}>{fmtDate(f.date_facture)}</td>
                      <td style={{ padding: '10px 14px', color: '#9CA3AF' }}>{fmtDate(f.date_echeance)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>{fmt(f.montant_ht)}</td>
                      <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: f.statut === 'Payée' ? '#ECFDF5' : f.statut === 'Envoyée' ? '#EFF6FF' : '#F9FAFB', color: f.statut === 'Payée' ? '#059669' : f.statut === 'Envoyée' ? '#2563EB' : '#6B7280', fontWeight: 500 }}>{f.statut}</span></td>
                      <td style={{ padding: '10px 14px' }}><button onClick={() => supprimer('factures_cli', f.id)} style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer' }}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── RENTABILITÉ ── */}
        {tab === 'rentabilite' && (() => {
          // CA = montant du marché (unique)
          const ca = projet.montant_ht || 0

          // Calculs prévisionnels depuis les LOTS (totaux agrégés fiables)
          const lotsSeuls = lignes.filter(l => l.type === 'lot')
          const lignesSeules = lignes.filter(l => l.type === 'ligne') // pour le message d'info
          const achatPrevu = lotsSeuls.reduce((s, l) => s + (l.total_achat || 0), 0)
          const margePrevu = ca - achatPrevu
          const tauxMargePrevu = ca > 0 ? ((margePrevu / ca) * 100).toFixed(1) : 0

          // Calculs réels depuis les commandes
          const achatReel = totalCommandes
          const margeReelle = ca - achatReel
          const tauxMargeReelle = ca > 0 ? ((margeReelle / ca) * 100).toFixed(1) : 0

          // Écarts
          const ecartAchat = achatReel - achatPrevu
          const ecartMarge = margeReelle - margePrevu

          const col = (val, positifBon = true) => {
            if (val === 0) return '#6B7280'
            if (positifBon) return val > 0 ? '#059669' : '#DC2626'
            return val > 0 ? '#DC2626' : '#059669'
          }

          return (
            <div style={{ maxWidth: 720 }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600 }}>Rentabilité</h3>

              {/* Tableau comparatif */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', background: '#1E293B', color: '#fff' }}>
                  <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}></div>
                  <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, textAlign: 'right', color: '#93C5FD' }}>📐 Prévisionnel</div>
                  <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, textAlign: 'right', color: '#86EFAC' }}>📊 Réel</div>
                  <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, textAlign: 'right', color: '#FDE68A' }}>Écart</div>
                </div>

                {[
                  { label: "Chiffre d'affaires (vente)", prev: ca, reel: ca, showEcart: false },
                  { label: 'Coût achats', prev: achatPrevu, reel: achatReel, showEcart: true, ecartPositifMauvais: true },
                  { label: 'Marge brute', prev: margePrevu, reel: margeReelle, showEcart: true, ecartPositifMauvais: false, bold: true },
                  { label: 'Taux de marge', prev: tauxMargePrevu + '%', reel: tauxMargeReelle + '%', showEcart: false, isTaux: true },
                ].map(({ label, prev, reel, showEcart, ecartPositifMauvais, bold, isTaux }, i) => {
                  const ecart = isTaux ? null : (typeof reel === 'number' && typeof prev === 'number' ? reel - prev : null)
                  return (
                    <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', borderBottom: i < 3 ? '1px solid #F3F4F6' : 'none', background: bold ? '#F0FDF4' : i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <div style={{ padding: '14px 16px', fontSize: 13, fontWeight: bold ? 700 : 500, color: '#374151' }}>{label}</div>
                      <div style={{ padding: '14px 16px', textAlign: 'right', fontSize: 13, fontWeight: bold ? 700 : 500, color: '#2563EB' }}>
                        {isTaux ? prev : fmt(prev)}
                      </div>
                      <div style={{ padding: '14px 16px', textAlign: 'right', fontSize: 13, fontWeight: bold ? 700 : 500, color: '#059669' }}>
                        {isTaux ? reel : fmt(reel)}
                      </div>
                      <div style={{ padding: '14px 16px', textAlign: 'right', fontSize: 13, fontWeight: bold ? 700 : 400 }}>
                        {showEcart && ecart !== null ? (
                          <span style={{ color: col(ecart, !ecartPositifMauvais), fontWeight: 600 }}>
                            {ecart > 0 ? '+' : ''}{fmt(ecart)}
                          </span>
                        ) : '—'}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Cartes résumé */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: '#2563EB', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>📐 Marge prévisionnelle</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: margePrevu >= 0 ? '#1E40AF' : '#DC2626', marginBottom: 4 }}>{fmt(margePrevu)}</div>
                  <div style={{ fontSize: 12, color: '#3B82F6' }}>Taux : {tauxMargePrevu}%</div>
                </div>
                <div style={{ background: margeReelle >= 0 ? '#F0FDF4' : '#FEF2F2', border: '1px solid ' + (margeReelle >= 0 ? '#BBF7D0' : '#FCA5A5'), borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: margeReelle >= 0 ? '#059669' : '#DC2626', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>📊 Marge réelle (commandes)</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: margeReelle >= 0 ? '#065F46' : '#991B1B', marginBottom: 4 }}>{fmt(margeReelle)}</div>
                  <div style={{ fontSize: 12, color: margeReelle >= 0 ? '#059669' : '#DC2626' }}>Taux : {tauxMargeReelle}%</div>
                </div>
              </div>

              {/* Écart global */}
              {ca > 0 && (
                <div style={{ background: ecartMarge >= 0 ? '#F0FDF4' : '#FEF2F2', border: '2px solid ' + (ecartMarge >= 0 ? '#059669' : '#DC2626'), borderRadius: 12, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: ecartMarge >= 0 ? '#065F46' : '#991B1B' }}>
                      {ecartMarge >= 0 ? '✅ Meilleure marge que prévu' : '⚠️ Marge inférieure au prévisionnel'}
                    </div>
                    <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                      Écart achat : <strong style={{ color: col(ecartAchat, false) }}>{ecartAchat > 0 ? '+' : ''}{fmt(ecartAchat)}</strong>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: ecartMarge >= 0 ? '#065F46' : '#991B1B' }}>{ecartMarge > 0 ? '+' : ''}{fmt(ecartMarge)}</div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>sur la marge</div>
                  </div>
                </div>
              )}

              {/* Info si pas de lignes */}
              {lotsSeuls.length === 0 && (
                <div style={{ marginTop: 12, padding: '10px 16px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12, color: '#92400E' }}>
                  💡 Importez les lignes du projet (onglet Lignes) pour voir le prévisionnel avec coefficients
                </div>
              )}
            </div>
          )
        })()}

        {/* ── DOCUMENTS ── */}
        {tab === 'documents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Dossier Documents officiels */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>🔏 Documents officiels</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 14px', borderRadius: 8, background: '#7C3AED', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  {uploadingDoc === 'officiels' ? '⏳...' : '+ Ajouter'}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files[0]; if (!file) return
                      setUploadingDoc('officiels')
                      const fileName = 'officiel_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
                      await supabase.storage.from('documents').upload('projets/' + id + '/officiels/' + fileName, file)
                      const { data } = await supabase.storage.from('documents').list('projets/' + id + '/officiels')
                      setDocuments(prev => ({ ...prev, officiels: data || [] }))
                      setUploadingDoc(null)
                      e.target.value = ''
                    }} />
                </label>
              </div>
              <div style={{ padding: 16 }}>
                {(!documents.officiels || documents.officiels.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: '#9CA3AF', fontSize: 13 }}>
                    Devis signé, ordre de service, PV de réception...
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {documents.officiels.map(doc => (
                      <div key={doc.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                        <span style={{ fontSize: 20 }}>{doc.name.includes('.pdf') ? '📄' : '📎'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <a href={getDocUrl('projets/' + id + '/officiels/' + doc.name)} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 13, fontWeight: 500, color: '#7C3AED', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                            {doc.name.replace(/^officiel_\d+_/, '')}
                          </a>
                        </div>
                        <button onClick={async () => {
                          if (!confirm('Supprimer ?')) return
                          await supabase.storage.from('documents').remove(['projets/' + id + '/officiels/' + doc.name])
                          const { data } = await supabase.storage.from('documents').list('projets/' + id + '/officiels')
                          setDocuments(prev => ({ ...prev, officiels: data || [] }))
                        }} style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 13 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Dossier Documents du projet */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>📁 Documents du projet</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 14px', borderRadius: 8, background: '#2563EB', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  {uploadingDoc === 'projet' ? '⏳...' : '+ Ajouter'}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files[0]; if (!file) return
                      setUploadingDoc('projet')
                      await uploadDoc(file, 'projets/' + id, async () => {
                        const { data } = await supabase.storage.from('documents').list('projets/' + id)
                        const docsProjet = (data || []).filter(d => !d.id || d.id !== '.emptyFolderPlaceholder')
                        setDocuments(prev => ({ ...prev, projet: docsProjet }))
                      })
                      setUploadingDoc(null)
                      e.target.value = ''
                    }} />
                </label>
              </div>
              <div style={{ padding: 16 }}>
                {(!documents.projet || documents.projet.filter(d => d.name && !d.name.startsWith('.')).length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: '#9CA3AF', fontSize: 13 }}>
                    Plans, photos chantier, rapports...
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                    {(documents.projet || []).filter(d => d.name && !d.name.startsWith('.')).map(doc => (
                      <div key={doc.name} style={{ background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20 }}>{doc.name.includes('.pdf') ? '📄' : doc.name.match(/jpg|jpeg|png/i) ? '🖼' : doc.name.match(/xls/i) ? '📊' : '📎'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <a href={getDocUrl('projets/' + id + '/' + doc.name)} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 12, fontWeight: 500, color: '#2563EB', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.name.replace(/^\d+_/, '')}
                          </a>
                        </div>
                        <button onClick={() => deleteDoc('projets/' + id + '/' + doc.name)}
                          style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 13 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
