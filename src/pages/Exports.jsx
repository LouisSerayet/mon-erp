import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../lib/useIsMobile'
import { colors, fonts, eyebrow, sectionTitle, quietLink, marker } from '../lib/theme'
import { genererFactureCliPDF } from '../lib/pdfFacture'
import { envoyerFacturesPennylane } from '../lib/usePennylane'

// Exports Excel pour la comptabilité — factures clients, factures
// fournisseurs et commandes, tous projets confondus, avec un filtre de
// période optionnel (utile pour un export par exercice/trimestre).
//
// Plus bas : envoi groupé vers Pennylane (factures clients régénérées à la
// volée, factures fournisseurs = les PDF déjà archivés à l'upload), par
// email vers les adresses d'import dédiées de Pennylane — repli tant que
// l'abonnement Pennylane de la société n'inclut pas l'API (voir
// usePennylane.js). Le ZIP à télécharger reste disponible en secours, pour
// un import manuel glisser-déposer si besoin.

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

  // ── Envoi groupé vers Pennylane (email) + ZIP de secours ────────────
  const [projets, setProjets] = useState([])
  const [typesLot, setTypesLot] = useState(() => new Set(['clients', 'fournisseurs']))
  const [statutLot, setStatutLot] = useState('toutes')
  const [projetLotId, setProjetLotId] = useState('')
  const [inclureEnvoyees, setInclureEnvoyees] = useState(false)
  const [busyLot, setBusyLot] = useState('') // '' | 'email' | 'zip'
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

  // Résumé textuel commun aux deux actions ci-dessous (email et ZIP).
  function resumerCompte(nbCli, nbFrs, nbFrsIgnorees) {
    const morceaux = []
    if (typesLot.has('clients')) morceaux.push(nbCli + (nbCli > 1 ? ' factures clients' : ' facture client'))
    if (typesLot.has('fournisseurs')) {
      let m = nbFrs + (nbFrs > 1 ? ' factures fournisseurs' : ' facture fournisseur')
      if (nbFrsIgnorees) m += ' (' + nbFrsIgnorees + ' ignorée' + (nbFrsIgnorees > 1 ? 's' : '') + ' — PDF manquant)'
      morceaux.push(m)
    }
    return morceaux.join(' · ')
  }

  // Récupère, selon les filtres actifs (type/statut/projet/période, et par
  // défaut en excluant celles déjà envoyées à Pennylane — voir
  // inclureEnvoyees), les factures clients et fournisseurs concernées.
  // Partagé par l'envoi par email et le ZIP de secours ci-dessous.
  async function recupererFacturesFiltrees() {
    let facturesCli = [], facturesFrs = []

    if (typesLot.has('clients')) {
      let q = supabase.from('factures_cli')
        .select('id, numero, date_facture, date_echeance, montant_ht, statut, type_facture, paiement_comptant, projet_id, pennylane_synced_at, projets(nom, taux_tva, numero_bon_commande_client, clients(nom, email, telephone, adresse, rue, code_postal, ville))')
        .is('deleted_at', null)
        .order('date_facture', { ascending: true })
      q = appliquerPeriode(q, 'date_facture')
      if (projetLotId) q = q.eq('projet_id', projetLotId)
      if (statutLot === 'payees') q = q.eq('statut', 'Payée')
      if (statutLot === 'non_payees') q = q.in('statut', ['À envoyer', 'Envoyée'])
      if (!inclureEnvoyees) q = q.is('pennylane_synced_at', null)
      const { data, error: err } = await q
      if (err) throw err
      facturesCli = data || []
    }

    if (typesLot.has('fournisseurs')) {
      let q = supabase.from('factures_frs')
        .select('id, numero, date_facture, statut, fichier_path, projet_id, pennylane_synced_at')
        .is('deleted_at', null)
        .not('fichier_path', 'is', null)
        .order('date_facture', { ascending: true })
      q = appliquerPeriode(q, 'date_facture')
      if (projetLotId) q = q.eq('projet_id', projetLotId)
      if (statutLot === 'payees') q = q.eq('statut', 'Payée')
      if (statutLot === 'non_payees') q = q.eq('statut', 'À payer')
      if (!inclureEnvoyees) q = q.is('pennylane_synced_at', null)
      const { data, error: err } = await q
      if (err) throw err
      facturesFrs = data || []
    }

    return { facturesCli, facturesFrs }
  }

  // Envoie directement les factures filtrées par email aux adresses
  // d'import Pennylane (voir lib/usePennylane.js — envoyerFacturesPennylane)
  // et marque chaque facture envoyée (pennylane_synced_at) pour qu'elle
  // n'apparaisse plus "à envoyer" côté projet ni dans un futur envoi groupé
  // (sauf à cocher "Inclure les factures déjà envoyées").
  async function envoyerVersPennylane() {
    if (!typesLot.size) { setErrorLot('Sélectionne au moins un type de facture.'); return }
    setBusyLot('email'); setErrorLot(''); setResumeLot('')
    try {
      const { facturesCli, facturesFrs } = await recupererFacturesFiltrees()
      let nbFrsIgnorees = 0, totalEmails = 0
      const maintenant = new Date().toISOString()

      if (facturesCli.length) {
        const pieces = facturesCli.map(f => ({ name: (f.numero || f.id) + '.pdf', blob: genererFactureCliPDF(f, f.projets, 'fr').output('blob') }))
        const res = await envoyerFacturesPennylane('ventes', pieces)
        totalEmails += res.emails
        await supabase.from('factures_cli').update({ pennylane_statut: 'Envoyée par email', pennylane_synced_at: maintenant }).in('id', facturesCli.map(f => f.id))
      }

      const piecesFrs = []
      for (const f of facturesFrs) {
        const { data: blob, error: dlErr } = await supabase.storage.from('documents').download(f.fichier_path)
        if (dlErr || !blob) { nbFrsIgnorees++; continue }
        piecesFrs.push({ id: f.id, name: (f.numero || f.id) + '.pdf', blob })
      }
      if (piecesFrs.length) {
        const res = await envoyerFacturesPennylane('achats', piecesFrs)
        totalEmails += res.emails
        await supabase.from('factures_frs').update({ pennylane_statut: 'Envoyée par email', pennylane_synced_at: maintenant }).in('id', piecesFrs.map(p => p.id))
      }

      const nbFrsEnvoyees = piecesFrs.length
      if (facturesCli.length + nbFrsEnvoyees === 0) {
        throw new Error(inclureEnvoyees
          ? 'Aucune facture ne correspond à ces filtres.'
          : 'Aucune facture à envoyer (tout a déjà été envoyé, ou aucune ne correspond aux filtres) — coche "Inclure les factures déjà envoyées" pour les renvoyer.')
      }

      setResumeLot(resumerCompte(facturesCli.length, nbFrsEnvoyees, nbFrsIgnorees) + ' — ' + totalEmails + ' email' + (totalEmails > 1 ? 's' : '') + ' envoyé' + (totalEmails > 1 ? 's' : '') + ' à Pennylane.')
    } catch (err) {
      setErrorLot('Erreur envoi Pennylane : ' + err.message)
    }
    setBusyLot('')
  }

  // ZIP de secours (pas d'envoi ni de marquage "envoyée") — pour un import
  // manuel glisser-déposer côté Pennylane si l'envoi par email pose souci.
  async function exporterFacturesPDF() {
    if (!typesLot.size) { setErrorLot('Sélectionne au moins un type de facture.'); return }
    setBusyLot('zip'); setErrorLot(''); setResumeLot('')
    try {
      const { facturesCli, facturesFrs } = await recupererFacturesFiltrees()
      const zip = new JSZip()
      let nbFrsIgnorees = 0

      for (const f of facturesCli) {
        const doc = genererFactureCliPDF(f, f.projets, 'fr')
        zip.file('Factures clients/' + (f.numero || f.id) + '.pdf', doc.output('blob'))
      }
      for (const f of facturesFrs) {
        const { data: blob, error: dlErr } = await supabase.storage.from('documents').download(f.fichier_path)
        if (dlErr || !blob) { nbFrsIgnorees++; continue }
        zip.file('Factures fournisseurs/' + (f.numero || f.id) + '.pdf', blob)
      }

      const nbFrsInclues = facturesFrs.length - nbFrsIgnorees
      if (facturesCli.length + nbFrsInclues === 0) throw new Error('Aucune facture ne correspond à ces filtres.')

      const contenu = await zip.generateAsync({ type: 'blob' })
      telechargerBlob(contenu, 'factures' + (du ? '_du-' + du : '') + (au ? '_au-' + au : '') + '.zip')
      setResumeLot(resumerCompte(facturesCli.length, nbFrsInclues, nbFrsIgnorees) + ' — ZIP téléchargé.')
    } catch (err) {
      setErrorLot('Erreur export PDF : ' + err.message)
    }
    setBusyLot('')
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

      {/* ── Envoi groupé vers Pennylane ──────────────────────────── */}
      <div style={{ marginTop: 56, paddingTop: 28, borderTop: '1px solid ' + colors.line }}>
        <h2 style={sectionTitle}>Envoi groupé vers Pennylane</h2>
        <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0', maxWidth: 640 }}>
          Envoie directement les factures par email aux adresses d'import Pennylane (regénérées pour les factures clients, déjà archivées pour les factures fournisseurs) — chaque facture envoyée est marquée comme telle. Le ZIP reste disponible en secours pour un import manuel.
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: colors.inkMuted, cursor: 'pointer', paddingBottom: 8 }}>
            <input type="checkbox" checked={inclureEnvoyees} onChange={e => { setInclureEnvoyees(e.target.checked); setResumeLot('') }} style={{ accentColor: colors.ink, cursor: 'pointer' }} />
            Inclure les factures déjà envoyées
          </label>
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginTop: 22 }}>
          <button onClick={envoyerVersPennylane} disabled={!!busyLot} style={{ ...quietLink, fontSize: 13, paddingBottom: 6 }}>
            {busyLot === 'email' ? 'Envoi en cours...' : 'Envoyer à Pennylane'}
          </button>
          <button onClick={exporterFacturesPDF} disabled={!!busyLot} style={{ ...quietLink, fontSize: 12, color: colors.inkFaint, borderBottomColor: colors.inkFaint }}>
            {busyLot === 'zip' ? 'Export en cours...' : 'ou télécharger en ZIP'}
          </button>
        </div>

        {errorLot && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '10px 14px', marginTop: 20, fontSize: 13 }}>{errorLot}</div>}
        {resumeLot && <div style={{ borderLeft: '2px solid ' + colors.success, color: colors.success, padding: '10px 14px', marginTop: 20, fontSize: 13 }}>{resumeLot}</div>}
      </div>
    </div>
  )
}
