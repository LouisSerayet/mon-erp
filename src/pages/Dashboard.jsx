import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { fmtEUR as fmt, fmtDateFr as fmtDate } from '../lib/calculs'
import { envoyerEmailOutlook, creerBrouillonOutlook } from '../lib/useOutlook'
import { getBankAccounts } from '../lib/useQonto'
import { useIsMobile } from '../lib/useIsMobile'
import { colors, fonts, eyebrow, sectionTitle, quietLink, marker } from '../lib/theme'

export default function Dashboard() {
  const isMobile = useIsMobile()
  const [stats, setStats] = useState(null)
  const [cmdEnAttente, setCmdEnAttente] = useState([])
  const [facturesFrsAPayer, setFacturesFrsAPayer] = useState([])
  const [facturesCliAEncaisser, setFacturesCliAEncaisser] = useState([])
  const [depensesAPayer, setDepensesAPayer] = useState([])
  const [relances, setRelances] = useState([])
  const [loading, setLoading] = useState(true)
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
  // Supabase) : un souci Qonto (clé absente/expirée, voir Financier.jsx qui
  // a le même appel) ne doit pas empêcher le reste du dashboard de
  // s'afficher, d'où le try/catch dédié et son propre état de chargement.
  const [soldeQonto, setSoldeQonto] = useState(null) // en centimes, ou null tant que pas chargé
  const [soldeQontoError, setSoldeQontoError] = useState('')
  const [loadingSoldeQonto, setLoadingSoldeQonto] = useState(true)
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

  async function fetchAll() {
    setLoading(true)
    const [{ data: cmd }, { data: ffrs }, { data: fcli }, { data: dep }] = await Promise.all([
      supabase.from('commandes').select('*, projets(nom), fournisseurs(nom)').is('deleted_at', null).eq('statut', 'Brouillon').order('created_at', { ascending: false }),
      supabase.from('factures_frs').select('*, projets(nom), fournisseurs(nom)').is('deleted_at', null).eq('statut', 'À payer').order('date_echeance', { ascending: true }),
      // Le client vient du projet (projets → clients), pas du client_id
      // propre à la facture : celui-ci n'est qu'une copie figée au moment
      // de la création de la facture (voir ProjetDetail.jsx) — si le
      // client est rattaché au projet après coup, une facture déjà créée
      // reste orpheline pour toujours si on la lit directement (même
      // correctif que FacturesClients.jsx, voir ce fichier pour le détail).
      supabase.from('factures_cli').select('*, projets(nom, clients(nom, email, telephone))').is('deleted_at', null).in('statut', ['À envoyer', 'Envoyée']).order('date_echeance', { ascending: true }),
      // Dépenses générales (loyer, compta, assurance...) — non liées à un
      // projet, voir src/pages/Depenses.jsx. La table peut ne pas encore
      // exister si sql/depenses_generales_migration.sql n'a pas été
      // exécuté — dans ce cas Supabase renvoie une erreur et `dep` reste
      // undefined, géré par le `|| []` ci-dessous, sans planter le dashboard.
      supabase.from('depenses_generales').select('*, fournisseurs(nom)').is('deleted_at', null).eq('statut', 'À payer').order('date_echeance', { ascending: true }),
    ])

    const cmdData = cmd || []
    const ffrsData = ffrs || []
    const fcliData = fcli || []
    const depData = dep || []

    const today = new Date()
    const totalFfrs = ffrsData.reduce((s, x) => s + (x.montant_ht || 0), 0)
    const totalFcli = fcliData.reduce((s, x) => s + (x.montant_ht || 0), 0)
    const totalDepenses = depData.reduce((s, x) => s + (x.montant_ht || 0), 0)
    const ffrsEnRetard = ffrsData.filter(f => f.date_echeance && new Date(f.date_echeance) < today)
    const fcliEnRetard = fcliData.filter(f => f.statut === 'Envoyée' && f.date_echeance && new Date(f.date_echeance) < today)
    const depEnRetard = depData.filter(d => d.date_echeance && new Date(d.date_echeance) < today)

    // "Commandes en attente" (carte + total affiché) : même périmètre que la
    // liste réellement montrée juste en dessous (statuts En attente/Envoyée),
    // pas le total de toutes les commandes jamais passées.
    const totalCmdEnAttente = cmdData.reduce((s, x) => s + (x.montant_ht || 0), 0)

    setStats({
      totalCommandes: totalCmdEnAttente,
      totalFfrsAPayer: totalFfrs,
      totalFcliAEncaisser: totalFcli,
      totalDepensesAPayer: totalDepenses,
      nbFfrsEnRetard: ffrsEnRetard.length,
      nbFcliEnRetard: fcliEnRetard.length,
      nbDepEnRetard: depEnRetard.length,
    })
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
    if (!f.projets?.clients?.email) return
    const { sujet, corps } = contenuRelance(f)
    setModalRelance({ factureId: f.id, to: f.projets.clients.email, subject: sujet, body: corps })
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


  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: colors.inkFaint, fontFamily: fonts.display }}>Chargement...</div>

  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
      {/* Header */}
      <p style={eyebrow}>Partenaires Particuliers</p>
      <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Tableau de bord</h1>
      <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0', textTransform: 'capitalize' }}>
        {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      {/* Solde bancaire (Qonto) — juste le solde, rien d'autre : pas de
          bouton/lien (Rapprocher, Voir le financier...), ces actions vivent
          déjà dans l'onglet Comptes de Financier (voir
          pages/tresorerie/Comptes.jsx), atteignable directement depuis le
          menu (voir Layout.jsx). */}
      <div style={{ marginTop: isMobile ? 36 : 56, padding: '0 0 28px', textAlign: 'center' }}>
        <div style={{ ...eyebrow, marginBottom: 14 }}>Solde bancaire — Qonto</div>
        {loadingSoldeQonto ? (
          <div style={{ fontSize: 13, color: colors.inkFaint }}>Chargement...</div>
        ) : soldeQontoError ? (
          <div style={{ fontSize: 12, color: colors.danger }} title={soldeQontoError}>Indisponible — {soldeQontoError}</div>
        ) : (
          <div style={{ fontFamily: fonts.mono, fontSize: isMobile ? 34 : 44, fontWeight: 500, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{fmt(soldeQonto / 100)}</div>
        )}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.45)', zIndex: 200, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 14 }}>
          <div style={{ background: colors.surface, padding: isMobile ? 20 : 32, width: isMobile ? '100%' : 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
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
                    <div style={{ fontWeight: 500, fontSize: 13.5 }}>{f.projets?.clients?.nom || 'Client inconnu'} · {f.numero}</div>
                    <div style={{ fontSize: 11.5, color: colors.danger, marginTop: 2 }}>
                      {f.projets?.nom ? f.projets.nom + ' · ' : ''}Échue depuis {joursRetard} jour(s) ({fmtDate(f.date_echeance)})
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: fonts.mono, fontSize: 13.5, fontVariantNumeric: 'tabular-nums', color: colors.danger }}>{fmt(f.montant_ht)}</div>
                    {f.projets?.clients?.email ? (
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

      {/* Commandes en attente, factures frs./cli., dépenses — la "Vue
          globale des projets" (filtres par statut, prévu/engagé) et
          "Projets actifs" ont été retirés de ce tableau de bord, remplacés
          respectivement par le bouton "Vue globale" de l'onglet Projets
          (voir Projets.jsx) et par le hub Financier (qui regroupe déjà
          tout le suivi financier). */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 36 : 48, marginTop: 48 }}>

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
                    <div key={d.id} onClick={() => navigate('/financier/depenses')}
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
