import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../lib/useIsMobile'
import { colors, fonts, eyebrow, sectionTitle, quietLink, marker } from '../lib/theme'
import { genererFactureCliPDF } from '../lib/pdfFacture'
import { envoyerFacturesPennylane } from '../lib/usePennylane'
import { chargerProfilsParEmail, contactPourProjet } from '../lib/contacts'

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
  { key: 'depenses', label: 'Dépenses', color: colors.success },
]

export default function Exports() {
  const isMobile = useIsMobile()
  const [du, setDu] = useState('')
  const [au, setAu] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  // ── Envoi groupé vers Pennylane (email) + ZIP de secours ────────────
  const [projets, setProjets] = useState([])
  // Contact à afficher sur les factures clients régénérées ici — celui du
  // créateur de chaque projet, voir lib/contacts.js.
  const [profilsParEmail, setProfilsParEmail] = useState(new Map())
  const [typesLot, setTypesLot] = useState(() => new Set(['clients', 'fournisseurs', 'depenses']))
  const [statutLot, setStatutLot] = useState('toutes')
  const [projetLotId, setProjetLotId] = useState('')
  const [inclureEnvoyees, setInclureEnvoyees] = useState(false)
  const [busyLot, setBusyLot] = useState('') // '' | 'email' | 'zip'
  const [errorLot, setErrorLot] = useState('')
  const [resumeLot, setResumeLot] = useState('')

  useEffect(() => {
    supabase.from('projets').select('id, nom').order('nom').then(({ data }) => setProjets(data || []))
    chargerProfilsParEmail().then(setProfilsParEmail)
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

  // ── Flux de trésorerie prévisionnel ─────────────────────────────────
  // Demandé par Louis (nov. 2026) : une synthèse des encaissements et
  // décaissements à venir, tous projets confondus — pas un simple export
  // brut d'une table comme les 3 boutons ci-dessus, mais un vrai calcul :
  // les échéances connues (factures clients/fournisseurs non soldées)
  // réparties par mois, + les engagements très probables mais sans
  // échéance connue (commandes validées pas encore facturées par le
  // fournisseur, reste à facturer aux clients sur les projets en cours)
  // à part, pour ne pas les faire peser sur un mois arbitraire.
  // Volontairement indépendant du filtre de période (du/au) ci-dessus :
  // une prévision regarde toujours "à partir d'aujourd'hui", quelle que
  // soit la période choisie pour les exports bruts.
  async function exporterTresoreriePrevisionnelle() {
    setBusy('tresorerie'); setError('')
    try {
      const [{ data: facCli, error: errCli }, { data: facFrs, error: errFrs }, { data: cmd, error: errCmd }, { data: proj, error: errProj }] = await Promise.all([
        supabase.from('factures_cli').select('numero, date_echeance, montant_ht, statut, projet_id, projets(nom)').is('deleted_at', null),
        supabase.from('factures_frs').select('numero, date_echeance, montant_ht, statut, commande_id, projets(nom), fournisseurs(nom)').is('deleted_at', null),
        supabase.from('commandes').select('id, numero, montant_ht, statut, projets(nom), fournisseurs(nom)').is('deleted_at', null),
        supabase.from('projets').select('id, nom, statut, montant_ht').is('deleted_at', null),
      ])
      if (errCli) throw errCli
      if (errFrs) throw errFrs
      if (errCmd) throw errCmd
      if (errProj) throw errProj

      const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0)
      // 12 mois glissants à partir du mois en cours.
      const MOIS = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() + i, 1)
        return { cle: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }
      })
      // 'retard' = échéance déjà dépassée (ou absente) — isolé du mois en
      // cours plutôt que noyé dedans, pour que ça saute aux yeux.
      const cleMois = (dateStr) => {
        if (!dateStr) return 'retard'
        const d = new Date(dateStr)
        return d < aujourdhui ? 'retard' : (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'))
      }

      const encaissements = {}
      const decaissements = {}
      const ajouter = (bucket, cle, montant) => { bucket[cle] = (bucket[cle] || 0) + montant }

      const cliAEncaisser = (facCli || []).filter(f => f.statut !== 'Payée')
      cliAEncaisser.forEach(f => ajouter(encaissements, cleMois(f.date_echeance), f.montant_ht || 0))

      const frsAPayer = (facFrs || []).filter(f => f.statut === 'À payer')
      frsAPayer.forEach(f => ajouter(decaissements, cleMois(f.date_echeance), f.montant_ht || 0))

      const arrondi = v => Math.round(v * 100) / 100
      const lignesSynthese = [{
        'Mois': 'En retard (échéance dépassée)',
        'Encaissements prévus (clients)': arrondi(encaissements['retard'] || 0),
        'Décaissements prévus (fournisseurs)': arrondi(decaissements['retard'] || 0),
      }]
      let cumul = 0
      MOIS.forEach(m => {
        const enc = arrondi(encaissements[m.cle] || 0)
        const dec = arrondi(decaissements[m.cle] || 0)
        cumul = arrondi(cumul + enc - dec)
        lignesSynthese.push({ 'Mois': m.label, 'Encaissements prévus (clients)': enc, 'Décaissements prévus (fournisseurs)': dec, 'Net du mois': arrondi(enc - dec), 'Variation cumulée (hors retard)': cumul })
      })

      // Détail des échéances derrière la synthèse ci-dessus, pour
      // traçabilité (même esprit que les 3 exports bruts au-dessus).
      const detailCli = cliAEncaisser.map(f => ({
        'N° facture': f.numero, 'Projet': f.projets?.nom || '', 'Date échéance': fmtDateFr(f.date_echeance),
        'Montant HT': f.montant_ht || 0, 'Statut': f.statut,
      }))
      const detailFrs = frsAPayer.map(f => ({
        'N° facture': f.numero, 'Fournisseur': f.fournisseurs?.nom || '', 'Projet': f.projets?.nom || '',
        'Date échéance': fmtDateFr(f.date_echeance), 'Montant HT': f.montant_ht || 0,
      }))

      // Engagements non datés : commandes validées pas encore facturées par
      // le fournisseur, et reste à facturer aux clients sur les projets en
      // cours — des sorties/entrées très probables mais sans échéance
      // connue, donc volontairement hors du tableau mensuel ci-dessus.
      // Même calcul que la colonne "Facturé" de l'onglet Commandes
      // fournisseurs et que le passage automatique en Finalisation, voir
      // ProjetDetail.jsx.
      const factureFrsParCommande = {}
      ;(facFrs || []).forEach(f => { if (f.commande_id) factureFrsParCommande[f.commande_id] = (factureFrsParCommande[f.commande_id] || 0) + (f.montant_ht || 0) })
      const commandesNonFacturees = (cmd || [])
        .filter(c => c.statut === 'Validée')
        .map(c => ({ ...c, reste: arrondi((c.montant_ht || 0) - (factureFrsParCommande[c.id] || 0)) }))
        .filter(c => c.reste > 0.01)

      const factureCliParProjet = {}
      ;(facCli || []).forEach(f => { if (f.projet_id) factureCliParProjet[f.projet_id] = (factureCliParProjet[f.projet_id] || 0) + (f.montant_ht || 0) })
      const projetsResteAFacturer = (proj || [])
        .filter(p => p.statut === 'En cours')
        .map(p => ({ ...p, reste: arrondi((p.montant_ht || 0) - (factureCliParProjet[p.id] || 0)) }))
        .filter(p => p.reste > 0.01)

      const totalCommandesNonFacturees = arrondi(commandesNonFacturees.reduce((s, c) => s + c.reste, 0))
      const totalResteAFacturerClients = arrondi(projetsResteAFacturer.reduce((s, p) => s + p.reste, 0))
      const lignesEngagements = [
        ...commandesNonFacturees.map(c => ({ 'Type': 'Décaissement probable (commande fournisseur)', 'Tiers / Projet': (c.fournisseurs?.nom || '') + ' — ' + (c.projets?.nom || ''), 'N°': c.numero || '', 'Montant HT restant': c.reste })),
        { 'Type': 'TOTAL décaissements probables fournisseurs', 'Tiers / Projet': '', 'N°': '', 'Montant HT restant': totalCommandesNonFacturees },
        ...projetsResteAFacturer.map(p => ({ 'Type': 'Encaissement probable (reste à facturer client)', 'Tiers / Projet': p.nom, 'N°': '', 'Montant HT restant': p.reste })),
        { 'Type': 'TOTAL encaissements probables clients', 'Tiers / Projet': '', 'N°': '', 'Montant HT restant': totalResteAFacturerClients },
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignesSynthese), 'Synthèse mensuelle')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailCli), 'Factures clients à encaisser')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailFrs), 'Factures frs à payer')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignesEngagements), 'Engagements non datés')
      XLSX.writeFile(wb, 'tresorerie-previsionnelle.xlsx')
    } catch (err) {
      setError('Erreur export trésorerie prévisionnelle : ' + err.message)
    }
    setBusy('')
  }

  // Résumé textuel commun aux deux actions ci-dessous (email et ZIP).
  function resumerCompte({ nbCli = 0, nbFrs = 0, nbFrsIgnorees = 0, nbDep = 0, nbDepIgnorees = 0 } = {}) {
    const morceaux = []
    if (typesLot.has('clients')) morceaux.push(nbCli + (nbCli > 1 ? ' factures clients' : ' facture client'))
    if (typesLot.has('fournisseurs')) {
      let m = nbFrs + (nbFrs > 1 ? ' factures fournisseurs' : ' facture fournisseur')
      if (nbFrsIgnorees) m += ' (' + nbFrsIgnorees + ' ignorée' + (nbFrsIgnorees > 1 ? 's' : '') + ' — PDF manquant)'
      morceaux.push(m)
    }
    if (typesLot.has('depenses')) {
      let m = nbDep + (nbDep > 1 ? ' dépenses' : ' dépense')
      if (nbDepIgnorees) m += ' (' + nbDepIgnorees + ' ignorée' + (nbDepIgnorees > 1 ? 's' : '') + ' — justificatif manquant)'
      morceaux.push(m)
    }
    return morceaux.join(' · ')
  }

  // Récupère, selon les filtres actifs (type/statut/projet/période, et par
  // défaut en excluant celles déjà envoyées à Pennylane — voir
  // inclureEnvoyees), les factures clients, factures fournisseurs et
  // dépenses générales concernées. Partagé par l'envoi par email et le ZIP
  // de secours ci-dessous. Les dépenses générales ne sont jamais liées à un
  // projet (voir tresorerie/Depenses.jsx) : elles sont ignorées dès qu'un projet
  // précis est sélectionné, puisqu'aucune ne pourrait y correspondre.
  async function recupererFacturesFiltrees() {
    let facturesCli = [], facturesFrs = [], depenses = []

    if (typesLot.has('clients')) {
      let q = supabase.from('factures_cli')
        .select('id, numero, date_facture, date_echeance, montant_ht, statut, type_facture, paiement_comptant, projet_id, pennylane_synced_at, projets(nom, taux_tva, numero_bon_commande_client, created_by_email, adresse_chantier, clients(nom, email, telephone, adresse, rue, code_postal, ville, libelle_facturation))')
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

    if (typesLot.has('depenses') && !projetLotId) {
      let q = supabase.from('depenses_generales')
        .select('id, libelle, numero, date_facture, statut, fichier_path, pennylane_synced_at')
        .is('deleted_at', null)
        .not('fichier_path', 'is', null)
        .order('date_facture', { ascending: true })
      q = appliquerPeriode(q, 'date_facture')
      if (statutLot === 'payees') q = q.eq('statut', 'Payée')
      if (statutLot === 'non_payees') q = q.eq('statut', 'À payer')
      if (!inclureEnvoyees) q = q.is('pennylane_synced_at', null)
      const { data, error: err } = await q
      if (err) throw err
      depenses = data || []
    }

    return { facturesCli, facturesFrs, depenses }
  }

  // Envoie directement les factures/dépenses filtrées par email aux
  // adresses d'import Pennylane (voir lib/usePennylane.js —
  // envoyerFacturesPennylane) et marque chaque élément envoyé
  // (pennylane_synced_at) pour qu'il n'apparaisse plus "à envoyer" côté
  // projet ni dans un futur envoi groupé (sauf à cocher "Inclure les
  // factures déjà envoyées"). Les dépenses générales sont des achats comme
  // les factures fournisseurs : elles partent dans le même lot d'emails,
  // vers la même adresse "achats".
  async function envoyerVersPennylane() {
    if (!typesLot.size) { setErrorLot('Sélectionne au moins un type de facture.'); return }
    setBusyLot('email'); setErrorLot(''); setResumeLot('')
    try {
      const { facturesCli, facturesFrs, depenses } = await recupererFacturesFiltrees()
      let nbFrsIgnorees = 0, nbDepIgnorees = 0, totalEmails = 0

      // Marquage "envoyée" fait lot par lot, tout de suite après que CE lot
      // soit parti avec succès (voir onLotEnvoye dans envoyerFacturesPennylane)
      // — jamais en un seul .update() groupé après coup, sinon un lot déjà
      // parti reste marqué "à envoyer" si un lot suivant échoue, et se
      // retrouve renvoyé (donc dupliqué chez Pennylane) au prochain essai.
      if (facturesCli.length) {
        const pieces = facturesCli.map(f => ({ id: f.id, name: (f.numero || f.id) + '.pdf', blob: genererFactureCliPDF(f, f.projets, 'fr', contactPourProjet(f.projets, profilsParEmail)).output('blob') }))
        const res = await envoyerFacturesPennylane('ventes', pieces, async lot => {
          await supabase.from('factures_cli').update({ pennylane_statut: 'Envoyée par email', pennylane_synced_at: new Date().toISOString() }).in('id', lot.map(p => p.id))
        })
        totalEmails += res.emails
      }

      const piecesFrs = []
      for (const f of facturesFrs) {
        const { data: blob, error: dlErr } = await supabase.storage.from('documents').download(f.fichier_path)
        if (dlErr || !blob) { nbFrsIgnorees++; continue }
        piecesFrs.push({ id: f.id, table: 'factures_frs', name: (f.numero || f.id) + '.pdf', blob })
      }
      const piecesDep = []
      for (const d of depenses) {
        const { data: blob, error: dlErr } = await supabase.storage.from('documents').download(d.fichier_path)
        if (dlErr || !blob) { nbDepIgnorees++; continue }
        piecesDep.push({ id: d.id, table: 'depenses_generales', name: (d.numero || d.libelle || d.id) + '.pdf', blob })
      }
      const piecesAchats = [...piecesFrs, ...piecesDep]
      if (piecesAchats.length) {
        // Un même lot "achats" peut mélanger factures_frs et
        // depenses_generales (voir piecesAchats ci-dessus) — on marque donc
        // séparément les id de chaque table présents dans le lot.
        const res = await envoyerFacturesPennylane('achats', piecesAchats, async lot => {
          const maintenant = new Date().toISOString()
          const idsFrs = lot.filter(p => p.table === 'factures_frs').map(p => p.id)
          const idsDep = lot.filter(p => p.table === 'depenses_generales').map(p => p.id)
          if (idsFrs.length) await supabase.from('factures_frs').update({ pennylane_statut: 'Envoyée par email', pennylane_synced_at: maintenant }).in('id', idsFrs)
          if (idsDep.length) await supabase.from('depenses_generales').update({ pennylane_statut: 'Envoyée par email', pennylane_synced_at: maintenant }).in('id', idsDep)
        })
        totalEmails += res.emails
      }

      const nbFrsEnvoyees = piecesFrs.length, nbDepEnvoyees = piecesDep.length
      if (facturesCli.length + nbFrsEnvoyees + nbDepEnvoyees === 0) {
        throw new Error(inclureEnvoyees
          ? 'Aucune facture ne correspond à ces filtres.'
          : 'Aucune facture à envoyer (tout a déjà été envoyé, ou aucune ne correspond aux filtres) — coche "Inclure les factures déjà envoyées" pour les renvoyer.')
      }

      setResumeLot(resumerCompte({ nbCli: facturesCli.length, nbFrs: nbFrsEnvoyees, nbFrsIgnorees, nbDep: nbDepEnvoyees, nbDepIgnorees }) + ' — ' + totalEmails + ' email' + (totalEmails > 1 ? 's' : '') + ' envoyé' + (totalEmails > 1 ? 's' : '') + ' à Pennylane.')
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
      const { facturesCli, facturesFrs, depenses } = await recupererFacturesFiltrees()
      const zip = new JSZip()
      let nbFrsIgnorees = 0, nbDepIgnorees = 0

      for (const f of facturesCli) {
        const doc = genererFactureCliPDF(f, f.projets, 'fr', contactPourProjet(f.projets, profilsParEmail))
        zip.file('Factures clients/' + (f.numero || f.id) + '.pdf', doc.output('blob'))
      }
      for (const f of facturesFrs) {
        const { data: blob, error: dlErr } = await supabase.storage.from('documents').download(f.fichier_path)
        if (dlErr || !blob) { nbFrsIgnorees++; continue }
        zip.file('Factures fournisseurs/' + (f.numero || f.id) + '.pdf', blob)
      }
      for (const d of depenses) {
        const { data: blob, error: dlErr } = await supabase.storage.from('documents').download(d.fichier_path)
        if (dlErr || !blob) { nbDepIgnorees++; continue }
        zip.file('Dépenses/' + (d.numero || d.libelle || d.id) + '.pdf', blob)
      }

      const nbFrsInclues = facturesFrs.length - nbFrsIgnorees
      const nbDepInclues = depenses.length - nbDepIgnorees
      if (facturesCli.length + nbFrsInclues + nbDepInclues === 0) throw new Error('Aucune facture ne correspond à ces filtres.')

      const contenu = await zip.generateAsync({ type: 'blob' })
      telechargerBlob(contenu, 'factures' + (du ? '_du-' + du : '') + (au ? '_au-' + au : '') + '.zip')
      setResumeLot(resumerCompte({ nbCli: facturesCli.length, nbFrs: nbFrsInclues, nbFrsIgnorees, nbDep: nbDepInclues, nbDepIgnorees }) + ' — ZIP téléchargé.')
    } catch (err) {
      setErrorLot('Erreur export PDF : ' + err.message)
    }
    setBusyLot('')
  }

  const CARTES = [
    { key: 'facturesCli', label: 'Factures clients', action: exporterFacturesCli },
    { key: 'facturesFrs', label: 'Factures fournisseurs', action: exporterFacturesFrs },
    { key: 'commandes', label: 'Commandes', action: exporterCommandes },
    { key: 'tresorerie', label: 'Trésorerie prévisionnelle', action: exporterTresoreriePrevisionnelle },
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

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(' + CARTES.length + ', 1fr)' }}>
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
          Envoie directement les factures et dépenses par email aux adresses d'import Pennylane (regénérées pour les factures clients, déjà archivées pour les factures fournisseurs et les dépenses) — chaque élément envoyé est marqué comme tel. Les dépenses partent avec les factures fournisseurs, vers l'adresse achats. Le ZIP reste disponible en secours pour un import manuel.
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
