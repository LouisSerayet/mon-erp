import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { calculerMarge, ligneCompteDansTotal, fmtEUR as fmt, fmtDateFr as fmtDate } from '../lib/calculs'
import { envoyerEmailOutlook, creerBrouillonOutlook } from '../lib/useOutlook'
import { getBankAccounts } from '../lib/useQonto'
import { colors, fonts, eyebrow, sectionTitle, quietLink, marker } from '../lib/theme'

// Ordre d'affichage des statuts dans le widget "Vue globale des projets"
// ci-dessous — reprend exactement STATUTS_PROJET de ProjetDetail.jsx/Projets.jsx.
const STATUTS_ORDRE = ['Brouillon', 'Devis envoyé', 'Devis signé', 'En cours', 'Finalisation', 'Clôturé', 'Perdu']

// Repère de couleur par statut — utilisé uniquement dans les vues d'analyse
// (tableau de répartition ci-dessous) pour différencier les statuts d'un
// coup d'œil ; les listes simples (Projets actifs, Commandes en attente)
// restent en texte neutre, la couleur étant réservée à ce qui a vraiment
// besoin d'attirer l'œil (retard, succès) plutôt qu'à la décoration.
const STATUT_MARKER = {
  'Brouillon': colors.inkFaint,
  'Devis envoyé': colors.warning,
  'Devis signé': '#5b6f8a',
  'En cours': colors.focus,
  'Finalisation': colors.warning,
  'Clôturé': colors.success,
  'Perdu': colors.danger,
}

// Raccourcis de filtrage courants pour le widget — l'utilisateur peut aussi
// cocher/décocher chaque statut à la main pour composer sa propre vue.
const PRESETS_STATUTS = [
  { label: 'Prévisionnel', statuts: ['Brouillon', 'Devis envoyé'] },
  { label: 'Signés & actifs', statuts: ['Devis signé', 'En cours'] },
  { label: 'Clôturés', statuts: ['Finalisation', 'Clôturé'] },
  { label: 'Tout (hors perdus)', statuts: ['Brouillon', 'Devis envoyé', 'Devis signé', 'En cours', 'Finalisation', 'Clôturé'] },
  { label: 'Tout', statuts: STATUTS_ORDRE },
]

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [projets, setProjets] = useState([])
  // Tous les projets (non tronqués/filtrés comme `projets` ci-dessus), avec
  // leur CA et deux lectures de coût précalculées — alimente le widget
  // "Vue globale des projets" (filtres par statut + prévisionnel/engagé).
  const [projetsGlobal, setProjetsGlobal] = useState([])
  const [cmdEnAttente, setCmdEnAttente] = useState([])
  const [facturesFrsAPayer, setFacturesFrsAPayer] = useState([])
  const [facturesCliAEncaisser, setFacturesCliAEncaisser] = useState([])
  const [depensesAPayer, setDepensesAPayer] = useState([])
  const [relances, setRelances] = useState([])
  const [loading, setLoading] = useState(true)
  // Widget "Vue globale des projets" : statuts cochés (par défaut, tout sauf
  // les projets perdus, qui fausseraient les totaux) et base de coût
  // utilisée pour la marge — prévu (devis, dispo même sans commande) ou
  // engagé (commandes fournisseurs actives).
  const [filtreStatutsGlobal, setFiltreStatutsGlobal] = useState(() => new Set(['Brouillon', 'Devis envoyé', 'Devis signé', 'En cours', 'Finalisation', 'Clôturé']))
  const [baseCoutGlobal, setBaseCoutGlobal] = useState('prevu') // 'prevu' | 'engage'
  // État d'envoi par facture (id -> 'envoye'), uniquement pour le retour
  // visuel une fois l'envoi confirmé depuis la modale ci-dessous.
  const [envoiRelance, setEnvoiRelance] = useState({})
  // Modale d'aperçu/édition avant envoi — { factureId, to, subject, body } ou
  // null si fermée. L'email ne part jamais directement au clic sur
  // "Relancer" : on ouvre toujours cette modale pour valider/corriger le
  // contenu avant l'envoi réel (voir ouvrirRelance / envoyerRelanceDepuisModal).
  const [modalRelance, setModalRelance] = useState(null)
  const [modalRelanceBusy, setModalRelanceBusy] = useState(false)
  const [modalRelanceError, setModalRelanceError] = useState('')
  // Busy state séparé pour "créer un brouillon dans Outlook" (voir
  // creerBrouillonDepuisModal) — distinct de l'envoi direct ci-dessus.
  const [modalRelanceDraftBusy, setModalRelanceDraftBusy] = useState(false)
  // Mini-widget "Solde bancaire" — appel Qonto séparé de fetchAll() (données
  // Supabase) : un souci Qonto (clé absente/expirée, voir Tresorerie.jsx qui
  // a le même appel) ne doit pas empêcher le reste du dashboard de
  // s'afficher, d'où le try/catch dédié et son propre état de chargement.
  const [soldeQonto, setSoldeQonto] = useState(null) // en centimes, ou null tant que pas chargé
  const [soldeQontoError, setSoldeQontoError] = useState('')
  const [loadingSoldeQonto, setLoadingSoldeQonto] = useState(true)
  // Mini-widget "Compte de résultat" — reprend une version simplifiée du
  // calcul de Resultat.jsx (CA / marge brute / résultat net), uniquement
  // pour l'année en cours et sans le détail par mois/catégorie, juste pour
  // donner un chiffre d'ensemble cliquable vers la page complète. Même
  // logique de try/catch séparé que le solde Qonto ci-dessus : un souci ici
  // ne doit pas empêcher le reste du dashboard de s'afficher.
  const [resultatAnnee, setResultatAnnee] = useState(null) // { totalCA, margeBrute, resultatNet } ou null
  const [resultatError, setResultatError] = useState('')
  const [loadingResultat, setLoadingResultat] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { fetchAll() }, [])
  useEffect(() => {
    (async () => {
      setLoadingSoldeQonto(true)
      setSoldeQontoError('')
      try {
        const accs = await getBankAccounts()
        setSoldeQonto(accs.reduce((s, a) => s + (a.balance_cents || 0), 0))
      } catch (err) {
        setSoldeQontoError(err.message)
      }
      setLoadingSoldeQonto(false)
    })()
  }, [])
  useEffect(() => {
    (async () => {
      setLoadingResultat(true)
      setResultatError('')
      try {
        const annee = new Date().getFullYear()
        const debut = annee + '-01-01'
        const fin = annee + '-12-31'
        const [{ data: fcli, error: fcliErr }, { data: ffrs, error: ffrsErr }, { data: dep }] = await Promise.all([
          supabase.from('factures_cli').select('montant_ht').is('deleted_at', null).gte('date_facture', debut).lte('date_facture', fin),
          supabase.from('factures_frs').select('montant_ht').is('deleted_at', null).gte('date_facture', debut).lte('date_facture', fin),
          // depenses_generales peut ne pas encore exister (migration non
          // exécutée) — ignoré silencieusement, comme dans Resultat.jsx.
          supabase.from('depenses_generales').select('montant_ht').is('deleted_at', null).gte('date_facture', debut).lte('date_facture', fin),
        ])
        if (fcliErr) throw fcliErr
        if (ffrsErr) throw ffrsErr
        const totalCA = (fcli || []).reduce((s, f) => s + (f.montant_ht || 0), 0)
        const totalAchats = (ffrs || []).reduce((s, f) => s + (f.montant_ht || 0), 0)
        const totalDepenses = (dep || []).reduce((s, d) => s + (d.montant_ht || 0), 0)
        const margeBrute = totalCA - totalAchats
        const resultatNet = margeBrute - totalDepenses
        setResultatAnnee({ totalCA, margeBrute, resultatNet })
      } catch (err) {
        setResultatError(err.message)
      }
      setLoadingResultat(false)
    })()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: p }, { data: cmd }, { data: ffrs }, { data: fcli }, { data: dep }] = await Promise.all([
      supabase.from('projets').select('*, clients(nom)').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('commandes').select('*, projets(nom), fournisseurs(nom)').is('deleted_at', null).eq('statut', 'Brouillon').order('created_at', { ascending: false }),
      supabase.from('factures_frs').select('*, projets(nom), fournisseurs(nom)').is('deleted_at', null).eq('statut', 'À payer').order('date_echeance', { ascending: true }),
      supabase.from('factures_cli').select('*, projets(nom), clients(nom, email, telephone)').is('deleted_at', null).in('statut', ['À envoyer', 'Envoyée']).order('date_echeance', { ascending: true }),
      // Dépenses générales (loyer, compta, assurance...) — non liées à un
      // projet, voir src/pages/Depenses.jsx. La table peut ne pas encore
      // exister si sql/depenses_generales_migration.sql n'a pas été
      // exécuté — dans ce cas Supabase renvoie une erreur et `dep` reste
      // undefined, géré par le `|| []` ci-dessous, sans planter le dashboard.
      supabase.from('depenses_generales').select('*, fournisseurs(nom)').is('deleted_at', null).eq('statut', 'À payer').order('date_echeance', { ascending: true }),
    ])

    const projetsData = p || []
    const cmdData = cmd || []
    const ffrsData = ffrs || []
    const fcliData = fcli || []
    const depData = dep || []

    const today = new Date()
    // CA total / Marge brute : uniquement les projets réellement "En cours"
    // (pas les devis envoyés/signés, pas les projets finalisés/clôturés) —
    // choix confirmé par l'utilisateur.
    const projetsEnCours = projetsData.filter(x => x.statut === 'En cours')
    const totalCA = projetsEnCours.reduce((s, x) => s + (x.montant_ht || 0), 0)
    const totalFfrs = ffrsData.reduce((s, x) => s + (x.montant_ht || 0), 0)
    const totalFcli = fcliData.reduce((s, x) => s + (x.montant_ht || 0), 0)
    const totalDepenses = depData.reduce((s, x) => s + (x.montant_ht || 0), 0)
    const ffrsEnRetard = ffrsData.filter(f => f.date_echeance && new Date(f.date_echeance) < today)
    const fcliEnRetard = fcliData.filter(f => f.statut === 'Envoyée' && f.date_echeance && new Date(f.date_echeance) < today)
    const depEnRetard = depData.filter(d => d.date_echeance && new Date(d.date_echeance) < today)

    // Coût pour la marge : commandes des projets "En cours" uniquement (même
    // périmètre que le CA ci-dessus), en excluant les commandes annulées —
    // sinon une commande annulée puis remplacée était comptée deux fois.
    const idsProjetsEnCours = new Set(projetsEnCours.map(p => p.id))
    const [{ data: allCmd }, { data: allLignes }] = await Promise.all([
      supabase.from('commandes').select('montant_ht, statut, projet_id').is('deleted_at', null),
      // Lignes de tous les projets (lots + lignes hors lot) — sert à calculer
      // un coût "prévu" (devis) par projet pour le widget "Vue globale des
      // projets" ci-dessous, disponible même pour un devis pas encore
      // commandé (contrairement au coût "engagé", basé sur les commandes).
      supabase.from('projet_lignes').select('projet_id, type, lot, total_ht, total_achat, categorie_ligne, variante_active').is('deleted_at', null),
    ])
    const totalCmdEnCours = (allCmd || [])
      .filter(c => c.statut !== 'Annulée' && idsProjetsEnCours.has(c.projet_id))
      .reduce((s, c) => s + (c.montant_ht || 0), 0)
    // Formule centralisée dans lib/calculs.js (calculerMarge) pour rester
    // identique à celle utilisée dans l'onglet Rentabilité d'un projet.
    const { marge: margeGlobale, taux: tauxMargeGlobale } = calculerMarge(totalCA, totalCmdEnCours)

    // Coût engagé (commandes actives) par projet, tous statuts confondus —
    // même exclusion des commandes "Annulée" que ci-dessus.
    const coutEngageParProjet = new Map()
    for (const c of (allCmd || [])) {
      if (c.statut === 'Annulée') continue
      coutEngageParProjet.set(c.projet_id, (coutEngageParProjet.get(c.projet_id) || 0) + (c.montant_ht || 0))
    }
    // Coût prévu (devis) par projet : lots + lignes hors lot, en excluant
    // Options/variantes non retenues/texte — même méthode que l'onglet
    // Rentabilité d'un projet (voir ProjetDetail.jsx, tab 'rentabilite').
    // Les lots stockent déjà des totaux pré-filtrés (voir ligneCompteDansTotal
    // dans lib/calculs.js), seules les lignes hors lot doivent être filtrées ici.
    const lignesParProjet = new Map()
    for (const l of (allLignes || [])) {
      if (!lignesParProjet.has(l.projet_id)) lignesParProjet.set(l.projet_id, [])
      lignesParProjet.get(l.projet_id).push(l)
    }
    const projetsAvecCouts = projetsData.map(pr => {
      const ls = lignesParProjet.get(pr.id) || []
      const lots = ls.filter(l => l.type === 'lot')
      const lignesSansLot = ls.filter(l => l.type === 'ligne' && !l.lot && ligneCompteDansTotal(l))
      const coutPrevu = lots.reduce((s, l) => s + (l.total_achat || 0), 0) + lignesSansLot.reduce((s, l) => s + (l.total_achat || 0), 0)
      const venteLignes = lots.reduce((s, l) => s + (l.total_ht || 0), 0) + lignesSansLot.reduce((s, l) => s + (l.total_ht || 0), 0)
      const ca = pr.montant_ht || venteLignes || 0
      return { ...pr, ca, coutPrevu, coutEngage: coutEngageParProjet.get(pr.id) || 0 }
    })
    setProjetsGlobal(projetsAvecCouts)

    // "Commandes en attente" (carte + total affiché) : même périmètre que la
    // liste réellement montrée juste en dessous (statuts En attente/Envoyée),
    // pas le total de toutes les commandes jamais passées.
    const totalCmdEnAttente = cmdData.reduce((s, x) => s + (x.montant_ht || 0), 0)

    setStats({
      nbProjets: projetsData.length,
      nbEnCours: projetsData.filter(x => x.statut === 'En cours').length,
      nbFinalisation: projetsData.filter(x => x.statut === 'Finalisation').length,
      nbClotures: projetsData.filter(x => x.statut === 'Clôturé').length,
      totalCA,
      totalCommandes: totalCmdEnAttente,
      totalFfrsAPayer: totalFfrs,
      totalFcliAEncaisser: totalFcli,
      totalDepensesAPayer: totalDepenses,
      nbFfrsEnRetard: ffrsEnRetard.length,
      nbFcliEnRetard: fcliEnRetard.length,
      nbDepEnRetard: depEnRetard.length,
      margeGlobale,
      tauxMarge: tauxMargeGlobale,
    })
    setProjets(projetsData.filter(p => p.statut !== 'Clôturé' && p.statut !== 'Perdu').slice(0, 6))
    setCmdEnAttente(cmdData.slice(0, 5))
    // Pas de slice(0, 5) sur ces trois listes : au-delà de 5 éléments, la
    // carte devient défilante (voir le style maxHeight/overflowY plus bas)
    // plutôt que de cacher silencieusement le reste — avec un lien "Voir
    // tout" vers Recherche avancée, préfiltrée sur le même statut.
    setFacturesFrsAPayer(ffrsData)
    setFacturesCliAEncaisser(fcliData)
    setDepensesAPayer(depData)
    // Liste complète (pas limitée à 5) pour la section "Relances à faire" —
    // c'est celle-là qu'on veut pouvoir suivre jusqu'au bout, pas un aperçu.
    setRelances(fcliEnRetard)
    setLoading(false)
  }

  function contenuRelance(f) {
    const joursRetard = f.date_echeance ? Math.floor((new Date() - new Date(f.date_echeance)) / 86400000) : null
    const sujet = 'Relance facture ' + (f.numero || '') + ' — ' + (f.projets?.nom || '')
    const corps = 'Bonjour,\n\nSauf erreur de notre part, la facture ' + (f.numero || '') +
      (f.projets?.nom ? ' (' + f.projets.nom + ')' : '') +
      ' d\'un montant de ' + Number(f.montant_ht || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' € HT' +
      (joursRetard !== null ? ', échue depuis ' + joursRetard + ' jour(s),' : '') +
      ' ne semble pas encore réglée.\n\nPourriez-vous nous indiquer où en est son règlement ?\n\nMerci d\'avance,\nCordialement'
    return { sujet, corps }
  }

  // Ouvre l'aperçu/édition avant envoi — l'email ne part jamais directement
  // au clic sur "Relancer", il faut valider (et éventuellement corriger) le
  // contenu dans la modale qui s'ouvre ensuite. Voir modalRelance ci-dessous.
  function ouvrirRelance(f) {
    if (!f.clients?.email) return
    const { sujet, corps } = contenuRelance(f)
    setModalRelance({ factureId: f.id, to: f.clients.email, subject: sujet, body: corps })
    setModalRelanceError('')
  }

  async function envoyerRelanceDepuisModal() {
    if (!modalRelance) return
    setModalRelanceBusy(true)
    setModalRelanceError('')
    try {
      await envoyerEmailOutlook({ to: modalRelance.to, subject: modalRelance.subject, body: modalRelance.body })
      setEnvoiRelance(prev => ({ ...prev, [modalRelance.factureId]: 'envoye' }))
      setModalRelance(null)
    } catch (err) {
      setModalRelanceError(err.message)
    }
    setModalRelanceBusy(false)
  }

  // Alternative à l'envoi automatique : enregistre le message comme
  // brouillon dans la boîte Outlook configurée puis l'ouvre dans un nouvel
  // onglet (Outlook sur le web), pour que Louis le relise et l'envoie
  // lui-même directement depuis Outlook.
  async function creerBrouillonDepuisModal() {
    if (!modalRelance) return
    setModalRelanceDraftBusy(true)
    setModalRelanceError('')
    try {
      const webLink = await creerBrouillonOutlook({ to: modalRelance.to, subject: modalRelance.subject, body: modalRelance.body })
      if (webLink) window.open(webLink, '_blank', 'noopener,noreferrer')
      setModalRelance(null)
    } catch (err) {
      setModalRelanceError(err.message)
    }
    setModalRelanceDraftBusy(false)
  }


  // Coche/décoche un statut dans le widget "Vue globale des projets".
  function toggleStatutGlobal(s) {
    setFiltreStatutsGlobal(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: colors.inkFaint, fontFamily: fonts.display }}>Chargement...</div>

  // Widget "Vue globale des projets" : totaux du périmètre actuellement
  // sélectionné (statuts cochés × base de coût prévu/engagé), + détail par
  // statut pour situer chaque catégorie dans l'ensemble.
  const projetsFiltresGlobal = projetsGlobal.filter(p => filtreStatutsGlobal.has(p.statut))
  const caGlobalFiltre = projetsFiltresGlobal.reduce((s, p) => s + (p.ca || 0), 0)
  const coutGlobalFiltre = projetsFiltresGlobal.reduce((s, p) => s + (baseCoutGlobal === 'prevu' ? p.coutPrevu : p.coutEngage), 0)
  const { marge: margeGlobalFiltre, taux: tauxGlobalFiltre } = calculerMarge(caGlobalFiltre, coutGlobalFiltre)
  const breakdownStatuts = STATUTS_ORDRE.map(s => {
    const ps = projetsGlobal.filter(p => p.statut === s)
    const ca = ps.reduce((sum, p) => sum + (p.ca || 0), 0)
    const cout = ps.reduce((sum, p) => sum + (baseCoutGlobal === 'prevu' ? p.coutPrevu : p.coutEngage), 0)
    const { marge, taux } = calculerMarge(ca, cout)
    return { statut: s, nb: ps.length, ca, cout, marge, taux, actif: filtreStatutsGlobal.has(s) }
  }).filter(b => b.nb > 0)

  return (
    <div style={{ padding: '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
      {/* Header */}
      <p style={eyebrow}>Partenaires Particuliers</p>
      <h1 style={{ margin: '14px 0 0', fontSize: 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Tableau de bord</h1>
      <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0', textTransform: 'capitalize' }}>
        {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      {/* Solde bancaire (Qonto) + Compte de résultat — mini-widgets cliquables
          vers Trésorerie/Rapprochement et Compte de résultat, seules portes
          d'entrée vers ces pages maintenant qu'elles n'ont plus d'onglet
          dans le menu (voir Layout.jsx). */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginTop: 44 }}>
        <div onClick={() => navigate('/tresorerie')} style={{ padding: '26px 32px 26px 0', cursor: 'pointer' }}>
          <div style={{ ...eyebrow, marginBottom: 14 }}>Solde bancaire — Qonto</div>
          {loadingSoldeQonto ? (
            <div style={{ fontSize: 13, color: colors.inkFaint }}>Chargement...</div>
          ) : soldeQontoError ? (
            <div style={{ fontSize: 12, color: colors.danger }} title={soldeQontoError}>Indisponible — {soldeQontoError}</div>
          ) : (
            <div style={{ fontFamily: fonts.mono, fontSize: 34, fontWeight: 500, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{fmt(soldeQonto / 100)}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <a style={quietLink}>Voir la trésorerie</a>
            <a onClick={e => { e.stopPropagation(); navigate('/rapprochement') }} style={quietLink}>Rapprocher</a>
          </div>
        </div>

        <div onClick={() => navigate('/resultat')} style={{ padding: '26px 0 26px 32px', borderLeft: '1px solid ' + colors.line, cursor: 'pointer' }}>
          <div style={{ ...eyebrow, marginBottom: 14 }}>Compte de résultat — {new Date().getFullYear()}</div>
          {loadingResultat ? (
            <div style={{ fontSize: 13, color: colors.inkFaint }}>Chargement...</div>
          ) : resultatError ? (
            <div style={{ fontSize: 12, color: colors.danger }} title={resultatError}>Indisponible — {resultatError}</div>
          ) : (
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: fonts.mono, fontSize: 21, fontVariantNumeric: 'tabular-nums' }}>{fmt(resultatAnnee.totalCA)}</div>
                <div style={{ fontSize: 11, color: colors.inkFaint, marginTop: 4 }}>CA HT</div>
              </div>
              <div>
                <div style={{ fontFamily: fonts.mono, fontSize: 21, fontVariantNumeric: 'tabular-nums', color: resultatAnnee.margeBrute >= 0 ? colors.success : colors.danger }}>{fmt(resultatAnnee.margeBrute)}</div>
                <div style={{ fontSize: 11, color: colors.inkFaint, marginTop: 4 }}>Marge brute</div>
              </div>
              <div>
                <div style={{ fontFamily: fonts.mono, fontSize: 21, fontVariantNumeric: 'tabular-nums', color: resultatAnnee.resultatNet >= 0 ? colors.success : colors.danger }}>{fmt(resultatAnnee.resultatNet)}</div>
                <div style={{ fontSize: 11, color: colors.inkFaint, marginTop: 4 }}>Résultat net</div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <a style={quietLink}>Voir le détail</a>
          </div>
        </div>
      </div>

      {/* Alertes */}
      {(stats.nbFfrsEnRetard > 0 || stats.nbDepEnRetard > 0) && (
        <div style={{ marginTop: 8 }}>
          {stats.nbFfrsEnRetard > 0 && (
            <div style={{ borderTop: '1px solid ' + colors.line, padding: '14px 0', display: 'flex', gap: 14, alignItems: 'baseline', fontSize: 13 }}>
              <span style={{ ...marker(colors.danger), marginTop: 5 }} />
              <span>{stats.nbFfrsEnRetard} facture(s) fournisseur en retard <span style={{ color: colors.inkMuted }}>— voir « Factures frs. à payer » ci-dessous</span></span>
            </div>
          )}
          {stats.nbDepEnRetard > 0 && (
            <div style={{ borderTop: '1px solid ' + colors.line, borderBottom: stats.nbFfrsEnRetard ? 'none' : '1px solid ' + colors.line, padding: '14px 0', display: 'flex', gap: 14, alignItems: 'baseline', fontSize: 13 }}>
              <span style={{ ...marker(colors.warning), marginTop: 5 }} />
              <span>{stats.nbDepEnRetard} dépense(s) générale(s) en retard <span style={{ color: colors.inkMuted }}>— voir « Dépenses à payer » ci-dessous</span></span>
            </div>
          )}
          <div style={{ borderBottom: '1px solid ' + colors.line }} />
        </div>
      )}

      {/* Modale d'aperçu/édition avant envoi — voir ouvrirRelance() /
          envoyerRelanceDepuisModal(). L'email ne part jamais tant qu'on n'a
          pas validé son contenu ici. */}
      {modalRelance && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ background: colors.surface, padding: 32, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 22px', fontSize: 16, fontWeight: 600 }}>Relance par email</h3>

            {modalRelanceError && (
              <div style={{ background: colors.dangerBg, color: colors.danger, padding: '8px 12px', marginBottom: 14, fontSize: 13 }}>
                {modalRelanceError}
              </div>
            )}

            <label style={{ display: 'block', fontSize: 11, color: colors.inkMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>À</label>
            <input value={modalRelance.to} onChange={e => setModalRelance(p => ({ ...p, to: e.target.value }))}
              style={{ width: '100%', padding: '9px 0', border: 'none', borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box', marginBottom: 18, fontFamily: fonts.display, background: 'transparent' }} />

            <label style={{ display: 'block', fontSize: 11, color: colors.inkMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>Objet</label>
            <input value={modalRelance.subject} onChange={e => setModalRelance(p => ({ ...p, subject: e.target.value }))}
              style={{ width: '100%', padding: '9px 0', border: 'none', borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box', marginBottom: 18, fontFamily: fonts.display, background: 'transparent' }} />

            <label style={{ display: 'block', fontSize: 11, color: colors.inkMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>Message</label>
            <textarea value={modalRelance.body} onChange={e => setModalRelance(p => ({ ...p, body: e.target.value }))} rows={9}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box', marginBottom: 22, fontFamily: 'inherit', resize: 'vertical', background: 'transparent' }} />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={creerBrouillonDepuisModal} disabled={modalRelanceBusy || modalRelanceDraftBusy || !modalRelance.to} style={{ ...quietLink, fontSize: 12 }}>
                {modalRelanceDraftBusy ? 'Création du brouillon...' : 'ou créer un brouillon dans Outlook'}
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setModalRelance(null)} disabled={modalRelanceBusy}
                  style={{ padding: '9px 18px', border: '1px solid ' + colors.line, background: 'transparent', cursor: 'pointer', fontSize: 13, fontFamily: fonts.display, color: colors.ink }}>Annuler</button>
                <button onClick={envoyerRelanceDepuisModal} disabled={modalRelanceBusy || modalRelanceDraftBusy || !modalRelance.to}
                  style={{ padding: '9px 20px', border: 'none', background: colors.ink, color: colors.surface, cursor: 'pointer', fontWeight: 500, fontSize: 13, fontFamily: fonts.display }}>
                  {modalRelanceBusy ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Relances à faire — factures clients en retard ; le bouton ouvre un
          aperçu/édition avant tout envoi (voir modale ci-dessus). */}
      {relances.length > 0 && (
        <div style={{ marginTop: 48 }}>
          <div style={{ ...sectionTitle, marginBottom: 18, color: colors.danger }}>
            Relances à faire <span style={{ color: colors.inkFaint, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— {relances.length} facture(s) client en retard</span>
          </div>
          <div style={{ borderTop: '1px solid ' + colors.line }}>
            {relances.map(f => {
              const joursRetard = f.date_echeance ? Math.floor((new Date() - new Date(f.date_echeance)) / 86400000) : null
              return (
                <div key={f.id} style={{ borderLeft: '2px solid ' + colors.danger, paddingLeft: 14, marginLeft: -16, borderBottom: '1px solid ' + colors.line, padding: '13px 0 13px 14px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => navigate('/projets/' + f.projet_id, { state: { tab: 'factures_cli', focusId: f.id } })}>
                    <div style={{ fontWeight: 500, fontSize: 13.5 }}>{f.clients?.nom || 'Client inconnu'} · {f.numero}</div>
                    <div style={{ fontSize: 11.5, color: colors.danger, marginTop: 2 }}>
                      {f.projets?.nom ? f.projets.nom + ' · ' : ''}Échue depuis {joursRetard} jour(s) ({fmtDate(f.date_echeance)})
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: fonts.mono, fontSize: 13.5, fontVariantNumeric: 'tabular-nums', color: colors.danger }}>{fmt(f.montant_ht)}</div>
                    {f.clients?.email ? (
                      envoiRelance[f.id] === 'envoye' ? (
                        <span style={{ fontSize: 11, color: colors.success, fontWeight: 500 }}>Envoyé</span>
                      ) : (
                        <a onClick={() => ouvrirRelance(f)} style={{ ...quietLink, fontSize: 11 }}>Relancer</a>
                      )
                    ) : (
                      <span style={{ fontSize: 11, color: colors.inkFaint }} title="Aucun email renseigné pour ce client">pas d'email</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Vue globale des projets — filtres par statut (à cocher/décocher
          librement) + choix de la base de coût (devis prévu / commandes
          engagées), pour composer soi-même la vue voulue : prévisionnel,
          signés & actifs, clôturés, etc. */}
      <div style={{ marginTop: 48 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          <h2 style={sectionTitle}>Vue globale des projets</h2>
          <div style={{ display: 'flex', gap: 18 }}>
            {[{ key: 'prevu', label: 'Coût prévu (devis)' }, { key: 'engage', label: 'Coût engagé (commandes)' }].map(b => (
              <button key={b.key} onClick={() => setBaseCoutGlobal(b.key)}
                style={{ background: 'none', border: 'none', padding: '0 0 4px', borderBottom: '2px solid ' + (baseCoutGlobal === b.key ? colors.ink : 'transparent'), color: baseCoutGlobal === b.key ? colors.ink : colors.inkFaint, fontSize: 12, fontWeight: baseCoutGlobal === b.key ? 600 : 400, cursor: 'pointer', fontFamily: fonts.display }}>
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ paddingBottom: 20, borderBottom: '1px solid ' + colors.line }}>
          <div style={{ fontSize: 11, color: colors.inkFaint, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>Raccourcis</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 18 }}>
            {PRESETS_STATUTS.map(pr => (
              <a key={pr.label} onClick={() => setFiltreStatutsGlobal(new Set(pr.statuts))} style={{ ...quietLink, fontSize: 12.5 }}>
                {pr.label}
              </a>
            ))}
          </div>
          <div style={{ fontSize: 11, color: colors.inkFaint, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>Ou cocher/décocher un statut</div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {STATUTS_ORDRE.map(s => {
              const actif = filtreStatutsGlobal.has(s)
              return (
                <button key={s} onClick={() => toggleStatutGlobal(s)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', padding: '0 0 4px', borderBottom: '2px solid ' + (actif ? STATUT_MARKER[s] : 'transparent'), cursor: 'pointer', fontFamily: fonts.display }}>
                  <span style={marker(STATUT_MARKER[s])} />
                  <span style={{ fontSize: 12.5, color: actif ? colors.ink : colors.inkFaint, fontWeight: actif ? 600 : 400 }}>{s}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid ' + colors.line }}>
          {[
            { label: 'Projets sélectionnés', value: String(projetsFiltresGlobal.length) },
            { label: 'CA total HT', value: fmt(caGlobalFiltre) },
            { label: baseCoutGlobal === 'prevu' ? 'Coût prévu HT' : 'Coût engagé HT', value: fmt(coutGlobalFiltre) },
            { label: 'Marge (' + tauxGlobalFiltre + ' %)', value: fmt(margeGlobalFiltre), color: margeGlobalFiltre >= 0 ? colors.success : colors.danger },
          ].map((k, i) => (
            <div key={k.label} style={{ padding: '18px 20px 20px 0', paddingLeft: i > 0 ? 20 : 0, borderLeft: i > 0 ? '1px solid ' + colors.line : 'none' }}>
              <div style={{ fontSize: 11, color: colors.inkMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>{k.label}</div>
              <div style={{ fontFamily: fonts.mono, fontSize: 20, fontVariantNumeric: 'tabular-nums', color: k.color || colors.ink }}>{k.value}</div>
            </div>
          ))}
        </div>

        {breakdownStatuts.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {['Statut', 'Nb', 'CA HT', 'Coût HT', 'Marge', 'Taux'].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontWeight: 500, color: colors.inkFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', padding: '12px 10px 10px 0', borderBottom: '1px solid ' + colors.line }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {breakdownStatuts.map(b => (
                  <tr key={b.statut} style={{ opacity: b.actif ? 1 : 0.4, cursor: 'pointer' }} onClick={() => toggleStatutGlobal(b.statut)}>
                    <td style={{ padding: '10px 10px 10px 0', borderBottom: '1px solid ' + colors.line }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={marker(STATUT_MARKER[b.statut])} />{b.statut}</span>
                    </td>
                    <td style={{ padding: '10px 10px 10px 0', textAlign: 'right', borderBottom: '1px solid ' + colors.line }}>{b.nb}</td>
                    <td style={{ padding: '10px 10px 10px 0', textAlign: 'right', borderBottom: '1px solid ' + colors.line, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(b.ca)}</td>
                    <td style={{ padding: '10px 10px 10px 0', textAlign: 'right', borderBottom: '1px solid ' + colors.line, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(b.cout)}</td>
                    <td style={{ padding: '10px 10px 10px 0', textAlign: 'right', borderBottom: '1px solid ' + colors.line, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums', color: b.marge >= 0 ? colors.success : colors.danger }}>{fmt(b.marge)}</td>
                    <td style={{ padding: '10px 10px 10px 0', textAlign: 'right', borderBottom: '1px solid ' + colors.line, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{b.taux} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, marginTop: 48 }}>

        {/* Projets en cours */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <h2 style={sectionTitle}>Projets actifs</h2>
            <a onClick={() => navigate('/projets')} style={quietLink}>Voir tous</a>
          </div>
          <div style={{ borderTop: '1px solid ' + colors.line }}>
            {projets.length === 0 ? (
              <div style={{ padding: '20px 0', color: colors.inkFaint, fontSize: 13, borderBottom: '1px solid ' + colors.line }}>Aucun projet actif</div>
            ) : projets.map(p => (
              <div key={p.id} onClick={() => navigate('/projets/' + p.id)}
                style={{ padding: '13px 0', borderBottom: '1px solid ' + colors.line, display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</div>
                  <div style={{ fontSize: 11.5, color: colors.inkMuted, marginTop: 2 }}>{p.clients?.nom || '—'}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: fonts.mono, fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>{fmt(p.montant_ht)}</div>
                  <div style={{ fontSize: 10.5, color: colors.inkFaint, marginTop: 3 }}>{p.statut}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Commandes en attente */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
            <h2 style={sectionTitle}>Commandes en attente</h2>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <span style={{ fontSize: 12, color: colors.inkFaint }}>{fmt(stats.totalCommandes)} total</span>
              <a onClick={() => navigate('/commandes-fournisseurs', { state: { statuts: ['Brouillon'] } })} style={quietLink}>Voir tout</a>
            </div>
          </div>
          <div style={{ borderTop: '1px solid ' + colors.line }}>
            {cmdEnAttente.length === 0 ? (
              <div style={{ padding: '20px 0', color: colors.inkFaint, fontSize: 13, borderBottom: '1px solid ' + colors.line }}>Aucune commande en attente</div>
            ) : cmdEnAttente.map(c => (
              <div key={c.id} onClick={() => navigate('/projets/' + c.projet_id, { state: { tab: 'commandes', focusId: c.id } })}
                style={{ padding: '13px 0', borderBottom: '1px solid ' + colors.line, display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.fournisseurs?.nom || '—'}</div>
                  <div style={{ fontSize: 11.5, color: colors.inkMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.projets?.nom} · {c.numero}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: fonts.mono, fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>{fmt(c.montant_ht)}</div>
                  <div style={{ fontSize: 10.5, color: colors.inkFaint, marginTop: 3 }}>{c.statut}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 40, marginTop: 48 }}>

        {/* Factures frs à payer */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <h2 style={sectionTitle}>Factures frs. à payer</h2>
            <span style={{ fontSize: 12, color: colors.warning }}>{fmt(stats.totalFfrsAPayer)}</span>
          </div>
          <div style={{ borderTop: '1px solid ' + colors.line }}>
            {facturesFrsAPayer.length === 0 ? (
              <div style={{ padding: '20px 0', color: colors.inkFaint, fontSize: 13, borderBottom: '1px solid ' + colors.line }}>Aucune facture à payer</div>
            ) : (
              <>
                {facturesFrsAPayer.map(f => {
                  const enRetard = f.date_echeance && new Date(f.date_echeance) < new Date()
                  return (
                    <div key={f.id} onClick={() => navigate('/projets/' + f.projet_id, { state: { tab: 'factures_frs', focusId: f.id } })}
                      style={{ padding: '12px 0', borderBottom: '1px solid ' + colors.line, display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', borderLeft: enRetard ? '2px solid ' + colors.danger : 'none', paddingLeft: enRetard ? 12 : 0, marginLeft: enRetard ? -14 : 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{f.fournisseurs?.nom || '—'}</div>
                        <div style={{ fontSize: 11, color: enRetard ? colors.danger : colors.inkMuted, marginTop: 2 }}>
                          {enRetard ? 'En retard · ' : ''}Échéance : {fmtDate(f.date_echeance)}
                        </div>
                      </div>
                      <div style={{ fontFamily: fonts.mono, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: enRetard ? colors.danger : colors.warning, flexShrink: 0 }}>{fmt(f.montant_ht)}</div>
                    </div>
                  )
                })}
                <VoirTout count={facturesFrsAPayer.length} onClick={() => navigate('/factures-fournisseurs', { state: { statuts: ['À payer'] } })} />
              </>
            )}
          </div>
        </div>

        {/* Factures clients à encaisser */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <h2 style={sectionTitle}>Factures cli. à encaisser</h2>
            <span style={{ fontSize: 12, color: colors.success }}>{fmt(stats.totalFcliAEncaisser)}</span>
          </div>
          <div style={{ borderTop: '1px solid ' + colors.line }}>
            {facturesCliAEncaisser.length === 0 ? (
              <div style={{ padding: '20px 0', color: colors.inkFaint, fontSize: 13, borderBottom: '1px solid ' + colors.line }}>Aucune facture en attente</div>
            ) : (
              <>
                {facturesCliAEncaisser.map(f => {
                  const enRetard = f.statut === 'Envoyée' && f.date_echeance && new Date(f.date_echeance) < new Date()
                  return (
                    <div key={f.id} onClick={() => navigate('/projets/' + f.projet_id, { state: { tab: 'factures_cli', focusId: f.id } })}
                      style={{ padding: '12px 0', borderBottom: '1px solid ' + colors.line, display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', borderLeft: enRetard ? '2px solid ' + colors.danger : 'none', paddingLeft: enRetard ? 12 : 0, marginLeft: enRetard ? -14 : 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{f.projets?.nom || '—'}</div>
                        <div style={{ fontSize: 11, color: enRetard ? colors.danger : colors.inkMuted, marginTop: 2 }}>
                          {f.numero} · {enRetard ? 'En retard · ' : ''}{f.statut === 'À envoyer' ? 'À envoyer' : 'Échéance : ' + fmtDate(f.date_echeance)}
                        </div>
                      </div>
                      <div style={{ fontFamily: fonts.mono, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: enRetard ? colors.danger : colors.success, flexShrink: 0 }}>{fmt(f.montant_ht)}</div>
                    </div>
                  )
                })}
                <VoirTout count={facturesCliAEncaisser.length} onClick={() => navigate('/factures-clients', { state: { statuts: ['À envoyer', 'Envoyée'] } })} />
              </>
            )}
          </div>
        </div>

        {/* Dépenses générales à payer */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <h2 style={sectionTitle}>Dépenses à payer</h2>
            <span style={{ fontSize: 12, color: colors.warning }}>{fmt(stats.totalDepensesAPayer)}</span>
          </div>
          <div style={{ borderTop: '1px solid ' + colors.line }}>
            {depensesAPayer.length === 0 ? (
              <div style={{ padding: '20px 0', color: colors.inkFaint, fontSize: 13, borderBottom: '1px solid ' + colors.line }}>Aucune dépense à payer</div>
            ) : (
              <>
                {depensesAPayer.map(d => {
                  const enRetard = d.date_echeance && new Date(d.date_echeance) < new Date()
                  return (
                    <div key={d.id} onClick={() => navigate('/depenses')}
                      style={{ padding: '12px 0', borderBottom: '1px solid ' + colors.line, display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', borderLeft: enRetard ? '2px solid ' + colors.danger : 'none', paddingLeft: enRetard ? 12 : 0, marginLeft: enRetard ? -14 : 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.libelle}</div>
                        <div style={{ fontSize: 11, color: enRetard ? colors.danger : colors.inkMuted, marginTop: 2 }}>
                          {enRetard ? 'En retard · ' : ''}{d.categorie}
                        </div>
                      </div>
                      <div style={{ fontFamily: fonts.mono, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: enRetard ? colors.danger : colors.warning, flexShrink: 0 }}>{fmt(d.montant_ht)}</div>
                    </div>
                  )
                })}
                <VoirTout count={depensesAPayer.length} onClick={() => navigate('/recherche', { state: { types: ['depenses'], statuts: ['À payer'] } })} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Lien "Voir tout (N)" affiché au pied d'une liste du Dashboard quand elle
// contient plus d'éléments que ce qui tient sans défiler — renvoie vers la
// page dédiée (ou Recherche avancée pour les dépenses), préfiltrée sur le
// même statut que la liste, pour une vue complète et filtrable.
function VoirTout({ count, onClick }) {
  if (count <= 5) return null
  return (
    <div style={{ padding: '12px 0 0' }}>
      <a onClick={onClick} style={{ ...quietLink, fontSize: 12 }}>Voir tout ({count})</a>
    </div>
  )
}
