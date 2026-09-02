import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { calculerMarge, ligneCompteDansTotal, fmtEUR as fmt, fmtDateFr as fmtDate } from '../lib/calculs'
import { envoyerEmailOutlook, creerBrouillonOutlook } from '../lib/useOutlook'
import { getBankAccounts } from '../lib/useQonto'

// Ordre d'affichage des statuts dans le widget "Vue globale des projets"
// ci-dessous — reprend exactement STATUTS_PROJET de ProjetDetail.jsx/Projets.jsx.
const STATUTS_ORDRE = ['Brouillon', 'Devis envoyé', 'Devis signé', 'En cours', 'Finalisation', 'Clôturé', 'Perdu']

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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement...</div>

  const STATUT_STYLE = {
    'Brouillon': { bg: '#F3F4F6', color: '#6B7280' },
    'Devis envoyé': { bg: '#FFF7ED', color: '#EA580C' },
    'Devis signé': { bg: '#F5F3FF', color: '#7C3AED' },
    'En cours': { bg: '#EFF6FF', color: '#2563EB' },
    'Finalisation': { bg: '#FFF7ED', color: '#EA580C' },
    'Clôturé': { bg: '#F0FDF4', color: '#059669' },
    'Perdu': { bg: '#FEF2F2', color: '#DC2626' },
  }

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
    <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Tableau de bord</h1>
        <p style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Solde bancaire (Qonto) + Compte de résultat — mini-widgets cliquables
          vers Trésorerie/Rapprochement et Compte de résultat, seules portes
          d'entrée vers ces pages maintenant qu'elles n'ont plus d'onglet
          dans le menu (voir Layout.jsx). */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div onClick={() => navigate('/tresorerie')}
          style={{ background: '#1E293B', borderRadius: 12, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = '#25324a'}
          onMouseLeave={e => e.currentTarget.style.background = '#1E293B'}>
          <div>
            <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>💳 Solde bancaire (Qonto)</div>
            {loadingSoldeQonto ? (
              <div style={{ fontSize: 13, color: '#94A3B8' }}>⏳ Chargement...</div>
            ) : soldeQontoError ? (
              <div style={{ fontSize: 12, color: '#FCA5A5' }} title={soldeQontoError}>⚠️ Indisponible — {soldeQontoError}</div>
            ) : (
              <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{fmt(soldeQonto / 100)}</div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: '#93C5FD', fontWeight: 500 }}>Voir la trésorerie →</span>
            <span onClick={e => { e.stopPropagation(); navigate('/rapprochement') }}
              style={{ fontSize: 11, color: '#CBD5E1', fontWeight: 500 }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = '#CBD5E1'}>
              🔗 Rapprocher →
            </span>
          </div>
        </div>

        <div onClick={() => navigate('/resultat')}
          style={{ background: '#1E293B', borderRadius: 12, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = '#25324a'}
          onMouseLeave={e => e.currentTarget.style.background = '#1E293B'}>
          <div>
            <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>🧾 Compte de résultat {new Date().getFullYear()}</div>
            {loadingResultat ? (
              <div style={{ fontSize: 13, color: '#94A3B8' }}>⏳ Chargement...</div>
            ) : resultatError ? (
              <div style={{ fontSize: 12, color: '#FCA5A5' }} title={resultatError}>⚠️ Indisponible — {resultatError}</div>
            ) : (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 10, color: '#64748B' }}>CA HT</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{fmt(resultatAnnee.totalCA)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#64748B' }}>Marge brute</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: resultatAnnee.margeBrute >= 0 ? '#6EE7B7' : '#FCA5A5' }}>{fmt(resultatAnnee.margeBrute)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#64748B' }}>Résultat net</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: resultatAnnee.resultatNet >= 0 ? '#6EE7B7' : '#FCA5A5' }}>{fmt(resultatAnnee.resultatNet)}</div>
                </div>
              </div>
            )}
          </div>
          <span style={{ fontSize: 12, color: '#93C5FD', fontWeight: 500, flexShrink: 0 }}>Voir le détail →</span>
        </div>
      </div>

      {/* Alertes */}
      {stats.nbFfrsEnRetard > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 20, alignItems: 'center' }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 500 }}>{stats.nbFfrsEnRetard} facture(s) fournisseur en retard — voir "Factures frs à payer" ci-dessous</span>
        </div>
      )}

      {stats.nbDepEnRetard > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 20, alignItems: 'center' }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 500 }}>{stats.nbDepEnRetard} dépense(s) générale(s) en retard — voir "Dépenses à payer" ci-dessous</span>
        </div>
      )}

      {/* Modale d'aperçu/édition avant envoi — voir ouvrirRelance() /
          envoyerRelanceDepuisModal(). L'email ne part jamais tant qu'on n'a
          pas validé son contenu ici. */}
      {modalRelance && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>Relance par email</h3>

            {modalRelanceError && (
              <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                {modalRelanceError}
              </div>
            )}

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>À</label>
            <input value={modalRelance.to} onChange={e => setModalRelance(p => ({ ...p, to: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', marginBottom: 14 }} />

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Objet</label>
            <input value={modalRelance.subject} onChange={e => setModalRelance(p => ({ ...p, subject: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', marginBottom: 14 }} />

            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Message</label>
            <textarea value={modalRelance.body} onChange={e => setModalRelance(p => ({ ...p, body: e.target.value }))} rows={9}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', marginBottom: 20, fontFamily: 'inherit', resize: 'vertical' }} />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={creerBrouillonDepuisModal} disabled={modalRelanceBusy || modalRelanceDraftBusy || !modalRelance.to}
                style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 }}>
                {modalRelanceDraftBusy ? '⏳ Création du brouillon...' : 'ou créer un brouillon dans Outlook'}
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setModalRelance(null)} disabled={modalRelanceBusy}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
                <button onClick={envoyerRelanceDepuisModal} disabled={modalRelanceBusy || modalRelanceDraftBusy || !modalRelance.to}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
                  {modalRelanceBusy ? '⏳ Envoi...' : '✉️ Envoyer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Relances à faire — factures clients en retard ; le bouton ouvre un
          aperçu/édition avant tout envoi (voir modale ci-dessus). */}
      {relances.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #FCA5A5', overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #FEE2E2', background: '#FEF2F2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#991B1B' }}>⚠️ Relances à faire · {relances.length} facture(s) client en retard</span>
          </div>
          <div>
            {relances.map((f, i) => {
              const joursRetard = f.date_echeance ? Math.floor((new Date() - new Date(f.date_echeance)) / 86400000) : null
              return (
                <div key={f.id} style={{ padding: '12px 18px', borderBottom: i < relances.length - 1 ? '1px solid #F3F4F6' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => navigate('/projets/' + f.projet_id, { state: { tab: 'factures_cli', focusId: f.id } })}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{f.clients?.nom || 'Client inconnu'} · {f.numero}</div>
                    <div style={{ fontSize: 11, color: '#DC2626' }}>
                      {f.projets?.nom ? f.projets.nom + ' · ' : ''}Échue depuis {joursRetard} jour(s) ({fmtDate(f.date_echeance)})
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#DC2626', flexShrink: 0 }}>{fmt(f.montant_ht)}</div>
                  {f.clients?.email ? (
                    envoiRelance[f.id] === 'envoye' ? (
                      <span style={{ fontSize: 12, color: '#059669', fontWeight: 500, flexShrink: 0 }}>✓ Envoyé</span>
                    ) : (
                      <button onClick={() => ouvrirRelance(f)}
                        style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
                        ✉️ Relancer
                      </button>
                    )
                  ) : (
                    <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }} title="Aucun email renseigné pour ce client">— pas d'email</span>
                  )}
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
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>🔍 Vue globale des projets</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ key: 'prevu', label: '📐 Coût prévu (devis)' }, { key: 'engage', label: '🛒 Coût engagé (commandes)' }].map(b => (
              <button key={b.key} onClick={() => setBaseCoutGlobal(b.key)}
                style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid ' + (baseCoutGlobal === b.key ? '#2563EB' : '#E5E7EB'), background: baseCoutGlobal === b.key ? '#EFF6FF' : '#fff', color: baseCoutGlobal === b.key ? '#2563EB' : '#6B7280', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6' }}>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8 }}>Raccourcis :</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {PRESETS_STATUTS.map(pr => (
              <button key={pr.label} onClick={() => setFiltreStatutsGlobal(new Set(pr.statuts))}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #DDD6FE', background: '#F5F3FF', color: '#7C3AED', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>
                {pr.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8 }}>Ou cocher/décocher un statut à la main :</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATUTS_ORDRE.map(s => {
              const st = STATUT_STYLE[s] || {}
              const actif = filtreStatutsGlobal.has(s)
              return (
                <button key={s} onClick={() => toggleStatutGlobal(s)}
                  style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid ' + (actif ? st.color : '#E5E7EB'), background: actif ? st.bg : '#fff', color: actif ? st.color : '#9CA3AF', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  {actif ? '✓ ' : ''}{s}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { label: 'Projets sélectionnés', value: String(projetsFiltresGlobal.length), color: '#374151' },
            { label: 'CA total HT', value: fmt(caGlobalFiltre), color: '#059669' },
            { label: baseCoutGlobal === 'prevu' ? 'Coût prévu HT' : 'Coût engagé HT', value: fmt(coutGlobalFiltre), color: '#EA580C' },
            { label: 'Marge (' + tauxGlobalFiltre + '%)', value: fmt(margeGlobalFiltre), color: margeGlobalFiltre >= 0 ? '#059669' : '#DC2626' },
          ].map((k, i) => (
            <div key={k.label} style={{ padding: '16px 18px', borderRight: i < 3 ? '1px solid #F3F4F6' : 'none' }}>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {breakdownStatuts.length > 0 && (
          <div style={{ padding: '4px 18px 14px', overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontWeight: 500, color: '#9CA3AF', padding: '8px 4px' }}>Statut</th>
                  <th style={{ textAlign: 'right', fontWeight: 500, color: '#9CA3AF', padding: '8px 4px' }}>Nb</th>
                  <th style={{ textAlign: 'right', fontWeight: 500, color: '#9CA3AF', padding: '8px 4px' }}>CA HT</th>
                  <th style={{ textAlign: 'right', fontWeight: 500, color: '#9CA3AF', padding: '8px 4px' }}>Coût HT</th>
                  <th style={{ textAlign: 'right', fontWeight: 500, color: '#9CA3AF', padding: '8px 4px' }}>Marge</th>
                  <th style={{ textAlign: 'right', fontWeight: 500, color: '#9CA3AF', padding: '8px 4px' }}>Taux</th>
                </tr>
              </thead>
              <tbody>
                {breakdownStatuts.map(b => {
                  const st = STATUT_STYLE[b.statut] || {}
                  return (
                    <tr key={b.statut} style={{ opacity: b.actif ? 1 : 0.4, cursor: 'pointer' }} onClick={() => toggleStatutGlobal(b.statut)}>
                      <td style={{ padding: '6px 4px' }}>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: st.bg, color: st.color, fontWeight: 500 }}>{b.statut}</span>
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: '#374151' }}>{b.nb}</td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: '#374151' }}>{fmt(b.ca)}</td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: '#374151' }}>{fmt(b.cout)}</td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: b.marge >= 0 ? '#059669' : '#DC2626', fontWeight: 600 }}>{fmt(b.marge)}</td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: '#374151' }}>{b.taux}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Projets en cours */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>📋 Projets actifs</span>
            <button onClick={() => navigate('/projets')} style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer' }}>Voir tous →</button>
          </div>
          {projets.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Aucun projet actif</div>
          ) : (
            <div>
              {projets.map((p, i) => {
                const st = STATUT_STYLE[p.statut] || {}
                return (
                  <div key={p.id} onClick={() => navigate('/projets/' + p.id)}
                    style={{ padding: '12px 18px', borderBottom: i < projets.length - 1 ? '1px solid #F3F4F6' : 'none', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF' }}>{p.clients?.nom || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{fmt(p.montant_ht)}</div>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: st.bg, color: st.color, fontWeight: 500 }}>{p.statut}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Commandes en attente */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>🛒 Commandes en attente</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#6B7280' }}>{fmt(stats.totalCommandes)} total</span>
              <button onClick={() => navigate('/commandes-fournisseurs', { state: { statuts: ['Brouillon'] } })}
                style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer' }}>Voir tout →</button>
            </div>
          </div>
          {cmdEnAttente.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Aucune commande en attente</div>
          ) : (
            <div>
              {cmdEnAttente.map((c, i) => (
                <div key={c.id} onClick={() => navigate('/projets/' + c.projet_id, { state: { tab: 'commandes', focusId: c.id } })}
                  style={{ padding: '12px 18px', borderBottom: i < cmdEnAttente.length - 1 ? '1px solid #F3F4F6' : 'none', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: '#111827', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.fournisseurs?.nom || '—'}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.projets?.nom} · {c.numero}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2563EB' }}>{fmt(c.montant_ht)}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>{c.statut}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

        {/* Factures frs à payer */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>📄 Factures frs à payer</span>
            <span style={{ fontSize: 12, color: '#EA580C', fontWeight: 600 }}>{fmt(stats.totalFfrsAPayer)}</span>
          </div>
          {facturesFrsAPayer.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Aucune facture à payer ✓</div>
          ) : (
            <>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {facturesFrsAPayer.map((f, i) => {
                  const enRetard = f.date_echeance && new Date(f.date_echeance) < new Date()
                  return (
                    <div key={f.id} onClick={() => navigate('/projets/' + f.projet_id, { state: { tab: 'factures_frs', focusId: f.id } })}
                      style={{ padding: '12px 18px', borderBottom: i < facturesFrsAPayer.length - 1 ? '1px solid #F3F4F6' : 'none', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: enRetard ? '#FFF5F5' : '#fff' }}
                      onMouseEnter={e => e.currentTarget.style.background = enRetard ? '#FEE2E2' : '#F9FAFB'}
                      onMouseLeave={e => e.currentTarget.style.background = enRetard ? '#FFF5F5' : '#fff'}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, color: '#111827', marginBottom: 2 }}>{f.fournisseurs?.nom || '—'}</div>
                        <div style={{ fontSize: 11, color: enRetard ? '#DC2626' : '#9CA3AF' }}>
                          {enRetard ? '⚠️ En retard · ' : ''}Échéance : {fmtDate(f.date_echeance)}
                        </div>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#EA580C', flexShrink: 0 }}>{fmt(f.montant_ht)}</div>
                    </div>
                  )
                })}
              </div>
              <VoirTout count={facturesFrsAPayer.length} onClick={() => navigate('/factures-fournisseurs', { state: { statuts: ['À payer'] } })} />
            </>
          )}
        </div>

        {/* Factures clients à encaisser */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>💶 Factures clients à encaisser</span>
            <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>{fmt(stats.totalFcliAEncaisser)}</span>
          </div>
          {facturesCliAEncaisser.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Aucune facture en attente ✓</div>
          ) : (
            <>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {facturesCliAEncaisser.map((f, i) => {
                  const enRetard = f.statut === 'Envoyée' && f.date_echeance && new Date(f.date_echeance) < new Date()
                  return (
                    <div key={f.id} onClick={() => navigate('/projets/' + f.projet_id, { state: { tab: 'factures_cli', focusId: f.id } })}
                      style={{ padding: '12px 18px', borderBottom: i < facturesCliAEncaisser.length - 1 ? '1px solid #F3F4F6' : 'none', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: enRetard ? '#FFF5F5' : '#fff' }}
                      onMouseEnter={e => e.currentTarget.style.background = enRetard ? '#FEE2E2' : '#F9FAFB'}
                      onMouseLeave={e => e.currentTarget.style.background = enRetard ? '#FFF5F5' : '#fff'}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, color: '#111827', marginBottom: 2 }}>{f.projets?.nom || '—'}</div>
                        <div style={{ fontSize: 11, color: enRetard ? '#DC2626' : '#9CA3AF' }}>
                          {f.numero} · {enRetard ? '⚠️ En retard · ' : ''}{f.statut === 'À envoyer' ? 'À envoyer' : 'Échéance : ' + fmtDate(f.date_echeance)}
                        </div>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#059669', flexShrink: 0 }}>{fmt(f.montant_ht)}</div>
                    </div>
                  )
                })}
              </div>
              <VoirTout count={facturesCliAEncaisser.length} onClick={() => navigate('/factures-clients', { state: { statuts: ['À envoyer', 'Envoyée'] } })} />
            </>
          )}
        </div>

        {/* Dépenses générales à payer */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>💸 Dépenses à payer</span>
            <span style={{ fontSize: 12, color: '#EA580C', fontWeight: 600 }}>{fmt(stats.totalDepensesAPayer)}</span>
          </div>
          {depensesAPayer.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Aucune dépense à payer ✓</div>
          ) : (
            <>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {depensesAPayer.map((d, i) => {
                  const enRetard = d.date_echeance && new Date(d.date_echeance) < new Date()
                  return (
                    <div key={d.id} onClick={() => navigate('/depenses')}
                      style={{ padding: '12px 18px', borderBottom: i < depensesAPayer.length - 1 ? '1px solid #F3F4F6' : 'none', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: enRetard ? '#FFF5F5' : '#fff' }}
                      onMouseEnter={e => e.currentTarget.style.background = enRetard ? '#FEE2E2' : '#F9FAFB'}
                      onMouseLeave={e => e.currentTarget.style.background = enRetard ? '#FFF5F5' : '#fff'}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, color: '#111827', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.libelle}</div>
                        <div style={{ fontSize: 11, color: enRetard ? '#DC2626' : '#9CA3AF' }}>
                          {enRetard ? '⚠️ En retard · ' : ''}{d.categorie}
                        </div>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#EA580C', flexShrink: 0 }}>{fmt(d.montant_ht)}</div>
                    </div>
                  )
                })}
              </div>
              <VoirTout count={depensesAPayer.length} onClick={() => navigate('/recherche', { state: { types: ['depenses'], statuts: ['À payer'] } })} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Lien "Voir tout (N) →" affiché au pied d'une carte du Dashboard quand elle
// contient plus d'éléments que ce qui tient sans défiler (voir maxHeight sur
// le conteneur juste au-dessus) — renvoie vers Recherche avancée, préfiltrée
// sur le même type/statut que la carte, pour une vue complète et filtrable.
function VoirTout({ count, onClick }) {
  if (count <= 5) return null
  return (
    <button onClick={onClick}
      style={{ display: 'block', width: '100%', padding: '10px 18px', background: '#F9FAFB', border: 'none', borderTop: '1px solid #F3F4F6', color: '#2563EB', cursor: 'pointer', fontSize: 12, fontWeight: 500, textAlign: 'center' }}>
      Voir tout ({count}) →
    </button>
  )
}
