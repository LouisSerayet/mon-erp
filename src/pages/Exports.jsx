import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../lib/useIsMobile'
import { colors, fonts, eyebrow, sectionTitle, quietLink, marker } from '../lib/theme'
import { genererFactureCliPDF } from '../lib/pdfFacture'

// Exports Excel pour la comptabilité — factures clients, factures
// fournisseurs et commandes, tous projets confondus, avec un filtre de
// période optionnel (utile pour un export par exercice/trimestre).
//
// Plus bas : export PDF groupé (factures clients régénérées à la volée,
// factures fournisseurs = les PDF déjà archivés à l'upload), en ZIP, pour
// une reprise en main manuelle côté Pennylane (import PDF natif, en
// attendant que la synchro API fonctionne à nouveau — voir usePennylane.js).

function telechargerExcel(lignes, feuille, fichier) {
  const ws = XLSX.utils.json_to_sheet(lignes)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, feuille)
  XLSX.writeFile(wb, fichier)
}

function telechargerBlob(blob, nomFichier) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}

const fmtDateFr = d => d ? new Date(d).toLocaleDateString('fr-FR') : ''

const inputUnderline = {
  padding: '7px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}
const fieldLabel = { display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }

const STATUTS_LOT = [
  { key: 'toutes', label: 'Toutes' },
  { key: 'non_payees', label: 'Non payées' },
  { key: 'payees', label: 'Payées' },
]
const TYPES_LOT = [
  { key: 'clients', label: 'Factures clients', color: colors.focus },
  { key: 'fournisseurs', label: 'Factures fournisseurs', color: colors.warning },
]

export default function Exports() {
  const isMobile = useIsMobile()
  const [du, setDu] = useState('')
  const [au, setAu] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  // ── Export PDF groupé (ZIP) ─────────────────────────────────────────
  const [projets, setProjets] = useState([])
  const [typesLot, setTypesLot] = useState(() => new Set(['clients', 'fournisseurs']))
  const [statutLot, setStatutLot] = useState('toutes')
  const [projetLotId, setProjetLotId] = useState('')
  const [busyLot, setBusyLot] = useState(false)
  const [errorLot, setErrorLot] = useState('')
  const [resumeLot, setResumeLot] = useState('')

  useEffect(() => {
    supabase.from('projets').select('id, nom').order('nom').then(({ data }) => setProjets(data || []))
  }, [])

  function toggleTypeLot(key) {
    setTypesLot(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
    setResumeLot('')
  }

  function appliquerPeriode(query, champDate) {
    let q = query
    if (du) q = q.gte(champDate, du)
    if (au) q = q.lte(champDate, au)
    return q
  }

  async function exporterFacturesCli() {
    setBusy('facturesCli'); setError('')
    try {
      const { data, error: err } = await appliquerPeriode(
        supabase.from('factures_cli').select('numero, date_facture, date_echeance, montant_ht, statut, projets(nom)').is('deleted_at', null).order('date_facture', { ascending: true }),
        'date_facture'
      )
      if (err) throw err
      const lignes = (data || []).map(f => ({
        'N° facture': f.numero,
        'Projet': f.projets?.nom || '',
        'Date facture': fmtDateFr(f.date_facture),
        'Date échéance': fmtDateFr(f.date_echeance),
        'Montant HT': f.montant_ht || 0,
        'Statut': f.statut,
      }))
      telechargerExcel(lignes, 'Factures clients', 'factures-clients.xlsx')
    } catch (err) {
      setError('Erreur export factures clients : ' + err.message)
    }
    setBusy('')
  }

  async function exporterFacturesFrs() {
    setBusy('facturesFrs'); setError('')
    try {
      const { data, error: err } = await appliquerPeriode(
        supabase.from('factures_frs').select('numero, date_facture, date_echeance, montant_ht, statut, projets(nom), fournisseurs(nom)').is('deleted_at', null).order('date_facture', { ascending: true }),
        'date_facture'
      )
      if (err) throw err
      const lignes = (data || []).map(f => ({
        'N° facture': f.numero,
        'Fournisseur': f.fournisseurs?.nom || '',
        'Projet': f.projets?.nom || '',
        'Date facture': fmtDateFr(f.date_facture),
        'Date échéance': fmtDateFr(f.date_echeance),
        'Montant HT': f.montant_ht || 0,
        'Statut': f.statut,
      }))
      telechargerExcel(lignes, 'Factures fournisseurs', 'factures-fournisseurs.xlsx')
    } catch (err) {
      setError('Erreur export factures fournisseurs : ' + err.message)
    }
    setBusy('')
  }

  async function exporterCommandes() {
    setBusy('commandes'); setError('')
    try {
      const { data, error: err } = await appliquerPeriode(
        supabase.from('commandes').select('numero, description, date_commande, montant_ht, statut, projets(nom), fournisseurs(nom)').is('deleted_at', null).order('date_commande', { ascending: true }),
        'date_commande'
      )
      if (err) throw err
      const lignes = (data || []).map(c => ({
        'N° commande': c.numero || '',
        'Description': c.description || '',
        'Fournisseur': c.fournisseurs?.nom || '',
        'Projet': c.projets?.nom || '',
        'Date commande': fmtDateFr(c.date_commande),
        'Montant HT': c.montant_ht || 0,
        'Statut': c.statut,
      }))
      telechargerExcel(lignes, 'Commandes', 'commandes.xlsx')
    } catch (err) {
      setError('Erreur export commandes : ' + err.message)
    }
    setBusy('')
  }

  // Regroupe en un ZIP les factures clients (régénérées en PDF à la volée,
  // même mise en page que le PDF téléchargé depuis un projet) et/ou les
  // factures fournisseurs (le PDF déjà archivé lors de l'upload — voir
  // fichier_path sur factures_frs) qui correspondent aux filtres, tous
  // projets confondus. Une fournisseur sans PDF archivé est ignorée (elle
  // n'a rien à zipper) et comptée à part dans le résumé.
  async function exporterFacturesPDF() {
    if (!typesLot.size) { setErrorLot('Sélectionne au moins un type de facture.'); return }
    setBusyLot(true); setErrorLot(''); setResumeLot('')
    try {
      const zip = new JSZip()
      let nbCli = 0, nbFrs = 0, nbFrsIgnorees = 0

      if (typesLot.has('clients')) {
        let q = supabase.from('factures_cli')
          .select('id, numero, date_facture, date_echeance, montant_ht, statut, type_facture, paiement_comptant, projet_id, projets(nom, taux_tva, numero_bon_commande_client, clients(nom, email, telephone, adresse, rue, code_postal, ville))')
          .is('deleted_at', null)
          .order('date_facture', { ascending: true })
        q = appliquerPeriode(q, 'date_facture')
        if (projetLotId) q = q.eq('projet_id', projetLotId)
        if (statutLot === 'payees') q = q.eq('statut', 'Payée')
        if (statutLot === 'non_payees') q = q.in('statut', ['À envoyer', 'Envoyée'])
        const { data, error: err } = await q
        if (err) throw err
        for (const f of (data || [])) {
          const doc = genererFactureCliPDF(f, f.projets, 'fr')
          zip.file('Factures clients/' + (f.numero || f.id) + '.pdf', doc.output('blob'))
          nbCli++
        }
      }

      if (typesLot.has('fournisseurs')) {
        let q = supabase.from('factures_frs')
          .select('id, numero, date_facture, statut, fichier_path, projet_id')
          .is('deleted_at', null)
          .not('fichier_path', 'is', null)
          .order('date_facture', { ascending: true })
        q = appliquerPeriode(q, 'date_facture')
        if (projetLotId) q = q.eq('projet_id', projetLotId)
        if (statutLot === 'payees') q = q.eq('statut', 'Payée')
        if (statutLot === 'non_payees') q = q.eq('statut', 'À payer')
        const { data, error: err } = await q
        if (err) throw err
        for (const f of (data || [])) {
          const { data: blob, error: dlErr } = await supabase.storage.from('documents').download(f.fichier_path)
          if (dlErr || !blob) { nbFrsIgnorees++; continue }
          zip.file('Factures fournisseurs/' + (f.numero || f.id) + '.pdf', blob)
          nbFrs++
        }
      }

      if (nbCli + nbFrs === 0) throw new Error('Aucune facture ne correspond à ces filtres.')

      const contenu = await zip.generateAsync({ type: 'blob' })
      telechargerBlob(contenu, 'factures' + (du ? '_du-' + du : '') + (au ? '_au-' + au : '') + '.zip')

      const morceaux = []
      if (typesLot.has('clients')) morceaux.push(nbCli + (nbCli > 1 ? ' factures clients' : ' facture client'))
      if (typesLot.has('fournisseurs')) {
        let m = nbFrs + (nbFrs > 1 ? ' factures fournisseurs' : ' facture fournisseur')
        if (nbFrsIgnorees) m += ' (' + nbFrsIgnorees + ' ignorée' + (nbFrsIgnorees > 1 ? 's' : '') + ' — PDF manquant)'
        morceaux.push(m)
      }
      setResumeLot(morceaux.join(' · ') + ' exportées dans le ZIP.')
    } catch (err) {
      setErrorLot('Erreur export PDF : ' + err.message)
    }
    setBusyLot(false)
  }

  const CARTES = [
    { key: 'facturesCli', label: 'Factures clients', action: exporterFacturesCli },
    { key: 'facturesFrs', label: 'Factures fournisseurs', action: exporterFacturesFrs },
    { key: 'commandes', label: 'Commandes', action: exporterCommandes },
  ]

  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
      <p style={eyebrow}>Partenaires Particuliers</p>
      <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Exports</h1>
      <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0' }}>Exporte les données en Excel, prêtes à transmettre à ta comptabilité.</p>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, alignItems: isMobile ? 'stretch' : 'flex-end', margin: '32px 0', paddingBottom: 24, borderBottom: '1px solid ' + colors.line }}>
        <div>
          <label style={fieldLabel}>Du (optionnel)</label>
          <input type="date" value={du} onChange={e => setDu(e.target.value)} style={inputUnderline} />
        </div>
        <div>
          <label style={fieldLabel}>Au (optionnel)</label>
          <input type="date" value={au} onChange={e => setAu(e.target.value)} style={inputUnderline} />
        </div>
        <div style={{ fontSize: 12, color: colors.inkFaint }}>Laisse vide pour tout exporter, quelle que soit la date — la période s'applique aussi à l'export PDF groupé ci-dessous.</div>
      </div>

      {error && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '10px 14px', marginBottom: 24, fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)' }}>
        {CARTES.map((c, i) => (
          <div key={c.key} style={{ padding: isMobile ? '20px 0' : '0 28px', borderLeft: (!isMobile && i > 0) ? '1px solid ' + colors.line : 'none', borderTop: (isMobile && i > 0) ? '1px solid ' + colors.line : 'none' }}>
            <div style={eyebrow}>{c.label}</div>
            <button onClick={c.action} disabled={busy === c.key} style={{ ...quietLink, display: 'inline-block', marginTop: 14 }}>
              {busy === c.key ? 'Export...' : 'Exporter en Excel'}
            </button>
          </div>
        ))}
      </div>

      {/* ── Export PDF groupé ────────────────────────────────────── */}
      <div style={{ marginTop: 56, paddingTop: 28, borderTop: '1px solid ' + colors.line }}>
        <h2 style={sectionTitle}>Export PDF groupé</h2>
        <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0', maxWidth: 640 }}>
          Un ZIP avec un PDF par facture (regénérées pour les factures clients, déjà archivées pour les factures fournisseurs) — utile pour un import manuel côté Pennylane.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, margin: '24px 0 20px' }}>
          {TYPES_LOT.map(({ key, label, color }) => {
            const actif = typesLot.has(key)
            return (
              <button key={key} onClick={() => toggleTypeLot(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', padding: '0 0 4px', borderBottom: '2px solid ' + (actif ? color : 'transparent'), cursor: 'pointer', fontFamily: fonts.display }}>
                <span style={marker(color)} />
                <span style={{ fontSize: 12.5, color: actif ? colors.ink : colors.inkFaint, fontWeight: actif ? 600 : 400 }}>{label}</span>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 20, flexWrap: 'wrap', alignItems: isMobile ? 'stretch' : 'flex-end' }}>
          <div>
            <label style={fieldLabel}>Statut</label>
            <select value={statutLot} onChange={e => { setStatutLot(e.target.value); setResumeLot('') }} style={{ ...inputUnderline, cursor: 'pointer', minWidth: 140 }}>
              {STATUTS_LOT.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={fieldLabel}>Projet (optionnel)</label>
            <select value={projetLotId} onChange={e => { setProjetLotId(e.target.value); setResumeLot('') }} style={{ ...inputUnderline, cursor: 'pointer', minWidth: 200 }}>
              <option value="">Tous les projets</option>
              {projets.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <button onClick={exporterFacturesPDF} disabled={busyLot} style={{ ...quietLink, fontSize: 13, paddingBottom: 6 }}>
            {busyLot ? 'Export en cours...' : 'Exporter en ZIP'}
          </button>
        </div>

        {errorLot && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '10px 14px', marginTop: 20, fontSize: 13 }}>{errorLot}</div>}
        {resumeLot && <div style={{ borderLeft: '2px solid ' + colors.success, color: colors.success, padding: '10px 14px', marginTop: 20, fontSize: 13 }}>{resumeLot}</div>}
      </div>
    </div>
  )
}
