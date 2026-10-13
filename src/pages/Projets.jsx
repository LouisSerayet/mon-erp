import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useIsMobile } from '../lib/useIsMobile'
import { fmtEUR as fmt, ligneCompteDansTotal, calculerMarge } from '../lib/calculs'
import { colors, fonts, eyebrow, sectionTitle, quietLink, marker, statutProjetMarker } from '../lib/theme'
import { IconClient, IconFournisseur, IconCommande } from '../components/Icons'

// Raccourcis de filtrage courants pour le widget "Vue globale des projets"
// (voir plus bas) — l'utilisateur peut aussi cocher/décocher chaque statut
// à la main pour composer sa propre vue. Vivait avant dans Dashboard.jsx ;
// déplacé ici (bouton "Vue globale") car peu consulté au quotidien — voir
// la demande de Louis de dégager le tableau de bord de ce qui n'a pas
// besoin d'y être vu tous les jours.
const PRESETS_STATUTS = [
  { label: 'Prévisionnel', statuts: ['Brouillon', 'Devis envoyé'] },
  { label: 'Signés & actifs', statuts: ['Devis signé', 'En cours'] },
  { label: 'Clôturés', statuts: ['Finalisation', 'Clôturé'] },
  { label: 'Tout (hors perdus)', statuts: ['Brouillon', 'Devis envoyé', 'Devis signé', 'En cours', 'Finalisation', 'Clôturé'] },
  { label: 'Tout', statuts: ['Brouillon', 'Devis envoyé', 'Devis signé', 'En cours', 'Finalisation', 'Clôturé', 'Perdu'] },
]

// Statuts à partir desquels la facturation a un sens à afficher : avant
// "En cours", le projet n'est encore qu'un devis — une barre à 0% ne
// dirait rien d'utile, voir hasBars plus bas.
const STATUTS_AVEC_FACTURATION = ['En cours', 'Finalisation', 'Clôturé']

// Une mini barre "% facturé" (client ou fournisseur) sur la liste des
// projets — voir la simulation validée avec Louis avant déploiement.
// `pct` null = pas assez de données pour calculer un pourcentage (ni
// prévisionnel ni facturé) : on affiche un tiret plutôt qu'une barre à 0%
// trompeuse (même logique que la colonne "Facturé" de l'onglet Commandes
// fournisseurs dans ProjetDetail.jsx).
function BarreFacturation({ pct, Icon, color, title }) {
  if (pct === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon size={12} style={{ color, flexShrink: 0, opacity: 0.5 }} />
        <span style={{ fontSize: 11, color: colors.inkFaint }}>—</span>
      </div>
    )
  }
  const largeur = Math.max(0, Math.min(100, pct))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }} title={title}>
      <Icon size={12} style={{ color, flexShrink: 0 }} />
      <div style={{ flex: 1, height: 4, background: colors.line, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: color, width: largeur + '%' }} />
      </div>
      <span style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.inkMuted, width: 30, textAlign: 'right', flexShrink: 0 }}>{pct}%</span>
    </div>
  )
}

// 'Brouillon' = devis en préparation (pas encore envoyé) ; 'Perdu' = devis
// refusé / projet abandonné. Un projet démarre toujours en 'Brouillon' et
// devient un devis "réel" (Rentabilité, etc.) dès sa création — voir
// ProjetDetail.jsx pour le détail du cycle de vie et le bouton "Marquer perdu".
const STATUTS = ['Brouillon', 'Devis envoyé', 'Devis signé', 'En cours', 'Finalisation', 'Clôturé', 'Perdu']
const TAUX_TVA_OPTIONS = [20, 10, 5.5, 0]

const inputUnderline = {
  width: '100%', padding: '8px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}
const label = { display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }
const btnPrimary = { background: colors.ink, color: colors.surface, border: 'none', padding: '10px 20px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }
const btnGhost = { background: 'none', color: colors.inkMuted, border: '1px solid ' + colors.line, padding: '10px 18px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }

export default function Projets() {
  const [projets, setProjets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('Tous')
  // Filtre par "gérant" du dossier — on réutilise created_by_email (voir
  // sql/projet_createur_migration.sql), déjà utilisé comme contact du
  // projet sur les documents (lib/contacts.js) : c'est la seule notion de
  // "personne responsable" qui existe dans le modèle, pas de champ dédié
  // séparé du créateur à ce jour.
  const [filtreCreateur, setFiltreCreateur] = useState('Tous')
  // 'date' garde l'ordre naturel de fetchAll (created_at décroissant) ;
  // 'statut' regroupe les projets par étape du cycle de vie (voir STATUTS
  // plus haut, qui donne déjà l'ordre du workflow) — pratique pour voir
  // d'un coup d'œil tous les devis envoyés, tous les chantiers en cours...
  // 'createur' regroupe par gérant du dossier (created_by_email).
  const [tri, setTri] = useState('statut')
  // Les projets clôturés ne sont quasiment jamais consultés une fois le
  // chantier terminé — masqués par défaut à chaque ouverture de la page
  // (pas besoin de les supprimer, juste de ne pas les voir), avec une case
  // pour les faire réapparaître ponctuellement. Ne s'applique qu'en vue
  // "Tous" : sélectionner "Clôturé" dans le filtre de statut reste
  // prioritaire et les affiche quand même.
  const [masquerClotures, setMasquerClotures] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [clients, setClients] = useState([])
  // Agrégats de facturation par projet (barres "% facturé"/"% commandé"),
  // calculés une fois au chargement de la liste — voir fetchAll. Objets
  // {projet_id: montant}.
  const [facturation, setFacturation] = useState({ venteParProjet: {}, achatParProjet: {}, factClientParProjet: {}, factFournisseurParProjet: {}, commandeParProjet: {} })
  const [form, setForm] = useState({ nom: '', client_id: '', statut: 'Brouillon', taux_tva: 20, date_debut: '', date_fin_prevue: '', notes: '' })
  const [error, setError] = useState('')
  const [savingProjet, setSavingProjet] = useState(false) // garde-fou anti double-clic
  // Widget "Vue globale des projets" — replié par défaut (voir le bouton
  // dans l'en-tête), avec ses propres filtres : statuts cochés (par défaut,
  // tout sauf les projets perdus, qui fausseraient les totaux) et base de
  // coût utilisée pour la marge — prévu (devis, dispo même sans commande)
  // ou engagé (commandes fournisseurs actives).
  const [showVueGlobale, setShowVueGlobale] = useState(false)
  const [filtreStatutsGlobal, setFiltreStatutsGlobal] = useState(() => new Set(['Brouillon', 'Devis envoyé', 'Devis signé', 'En cours', 'Finalisation', 'Clôturé']))
  const [baseCoutGlobal, setBaseCoutGlobal] = useState('prevu') // 'prevu' | 'engage'
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: p }, { data: c }, { data: fc }, { data: ff }, { data: lg }, { data: cmd }] = await Promise.all([
      supabase.from('projets').select('*, clients(nom)').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('clients').select('id, nom').is('deleted_at', null).order('nom'),
      supabase.from('factures_cli').select('projet_id, montant_ht').is('deleted_at', null),
      supabase.from('factures_frs').select('projet_id, montant_ht').is('deleted_at', null),
      supabase.from('projet_lignes').select('projet_id, type, lot, total_ht, total_achat, categorie_ligne, variante_active').is('deleted_at', null),
      // statut exclu : 'Annulée' — même convention que le "coût engagé" du
      // Dashboard (une commande annulée puis remplacée ne doit pas compter
      // double, ni comme un engagement réel).
      supabase.from('commandes').select('projet_id, montant_ht, statut').is('deleted_at', null),
    ])
    setProjets(p || [])
    setClients(c || [])

    // Même logique que les budgets prévisionnels de l'onglet Rentabilité
    // (ProjetDetail.jsx) : vente/achat prévus = total des lots + lignes
    // sans lot (hors options/variantes non retenues/texte, voir
    // ligneCompteDansTotal) ; facturé = somme des factures du projet.
    const sommeParProjet = (lignes, champ) => (lignes || []).reduce((acc, l) => {
      if (!l.projet_id) return acc
      acc[l.projet_id] = (acc[l.projet_id] || 0) + (l[champ] || 0)
      return acc
    }, {})
    const venteParProjet = {}
    const achatParProjet = {}
    for (const l of lg || []) {
      if (!l.projet_id) continue
      const compteDansBudget = l.type === 'lot' || (l.type === 'ligne' && !l.lot && ligneCompteDansTotal(l))
      if (!compteDansBudget) continue
      venteParProjet[l.projet_id] = (venteParProjet[l.projet_id] || 0) + (l.total_ht || 0)
      achatParProjet[l.projet_id] = (achatParProjet[l.projet_id] || 0) + (l.total_achat || 0)
    }
    const commandeParProjet = (cmd || []).reduce((acc, c) => {
      if (!c.projet_id || c.statut === 'Annulée') return acc
      acc[c.projet_id] = (acc[c.projet_id] || 0) + (c.montant_ht || 0)
      return acc
    }, {})
    setFacturation({
      venteParProjet,
      achatParProjet,
      factClientParProjet: sommeParProjet(fc, 'montant_ht'),
      factFournisseurParProjet: sommeParProjet(ff, 'montant_ht'),
      commandeParProjet,
    })
    setLoading(false)
  }

  async function creerProjet() {
    if (savingProjet) return
    setError('')
    if (!form.nom.trim()) { setError('Le nom est obligatoire.'); return }
    setSavingProjet(true)
    const { data, error } = await supabase.from('projets').insert([{
      nom: form.nom.trim(),
      client_id: form.client_id || null,
      statut: form.statut,
      taux_tva: form.taux_tva ?? 20,
      date_debut: form.date_debut || null,
      date_fin_prevue: form.date_fin_prevue || null,
      notes: form.notes,
      montant_ht: 0,
    }]).select().single()
    if (error) { setError('Erreur : ' + error.message); setSavingProjet(false); return }
    setShowForm(false)
    // Remis à la même valeur que l'état initial ('Brouillon') — avant, ce
    // reset mettait 'En cours', donc un 2e projet créé juste après le 1er
    // démarrait silencieusement avec le mauvais statut par défaut.
    setForm({ nom: '', client_id: '', statut: 'Brouillon', taux_tva: 20, date_debut: '', date_fin_prevue: '', notes: '' })
    setSavingProjet(false)
    navigate('/projets/' + data.id)
  }

  async function supprimerProjet(e, id) {
    e.stopPropagation()
    if (!confirm('Déplacer ce projet et toutes ses données vers la corbeille ? Tu pourras tout restaurer depuis la Corbeille pendant 30 jours.')) return
    // Suppression douce (deleted_at) en cascade, enfants puis parent, au
    // lieu d'un DELETE définitif — voir sql/06_corbeille_soft_delete.sql.
    // On vérifie l'erreur à chaque étape et on s'arrête immédiatement en
    // cas d'échec, pour ne jamais marquer le projet supprimé alors que des
    // données enfants n'ont pas pu être mises à jour (ou l'inverse).
    const maintenant = new Date().toISOString()
    const etapes = [
      ['projet_lignes', 'projet_id'],
      ['commandes', 'projet_id'],
      ['factures_frs', 'projet_id'],
      ['factures_cli', 'projet_id'],
      ['projets', 'id'],
    ]
    for (const [table, colonne] of etapes) {
      const { error } = await supabase.from(table).update({ deleted_at: maintenant }).eq(colonne, id)
      if (error) {
        alert('Erreur lors de la suppression (' + table + ') : ' + error.message + '\n\nLa suppression a été interrompue — vérifie l\'état du projet avant de réessayer.')
        fetchAll()
        return
      }
    }
    fetchAll()
  }

  // Coche/décoche un statut dans le widget "Vue globale des projets".
  function toggleStatutGlobal(s) {
    setFiltreStatutsGlobal(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }

  // Widget "Vue globale des projets" : CA/coût par projet à partir des
  // agrégats déjà chargés par fetchAll (facturation.venteParProjet =
  // vente prévue au devis, achatParProjet = coût prévu, commandeParProjet =
  // coût engagé) — pas de requête supplémentaire, ni la liste `projets`
  // (tous statuts, non filtrée par la recherche/les filtres du tableau
  // ci-dessous) ni ces agrégats ne dépendent de `filtered`.
  const projetsAvecCouts = projets.map(pr => ({
    ...pr,
    ca: pr.montant_ht || facturation.venteParProjet[pr.id] || 0,
    coutPrevu: facturation.achatParProjet[pr.id] || 0,
    coutEngage: facturation.commandeParProjet[pr.id] || 0,
  }))
  // Totaux du périmètre actuellement sélectionné (statuts cochés × base de
  // coût prévu/engagé), + détail par statut pour situer chaque catégorie
  // dans l'ensemble.
  const projetsFiltresGlobal = projetsAvecCouts.filter(p => filtreStatutsGlobal.has(p.statut))
  const caGlobalFiltre = projetsFiltresGlobal.reduce((s, p) => s + (p.ca || 0), 0)
  const coutGlobalFiltre = projetsFiltresGlobal.reduce((s, p) => s + (baseCoutGlobal === 'prevu' ? p.coutPrevu : p.coutEngage), 0)
  const { marge: margeGlobalFiltre, taux: tauxGlobalFiltre, coeff: coeffGlobalFiltre } = calculerMarge(caGlobalFiltre, coutGlobalFiltre)
  const breakdownStatuts = STATUTS.map(s => {
    const ps = projetsAvecCouts.filter(p => p.statut === s)
    const ca = ps.reduce((sum, p) => sum + (p.ca || 0), 0)
    const cout = ps.reduce((sum, p) => sum + (baseCoutGlobal === 'prevu' ? p.coutPrevu : p.coutEngage), 0)
    const { marge, taux, coeff } = calculerMarge(ca, cout)
    return { statut: s, nb: ps.length, ca, cout, marge, taux, coeff, actif: filtreStatutsGlobal.has(s) }
  }).filter(b => b.nb > 0)

  // Liste des gérants distincts présents dans les projets chargés, pour
  // peupler le filtre — triée alphabétiquement sur la partie affichée
  // (avant @), pas sur l'email complet, pour un ordre cohérent avec ce qui
  // est affiché dans le menu.
  const createurs = Array.from(new Set(projets.map(p => p.created_by_email).filter(Boolean)))
    .sort((a, b) => a.split('@')[0].localeCompare(b.split('@')[0]))

  const filtered = projets.filter(p => {
    const matchSearch = p.nom?.toLowerCase().includes(search.toLowerCase()) || p.clients?.nom?.toLowerCase().includes(search.toLowerCase())
    const matchStatut = filtreStatut === 'Tous'
      ? (!masquerClotures || p.statut !== 'Clôturé')
      : p.statut === filtreStatut
    const matchCreateur = filtreCreateur === 'Tous' || p.created_by_email === filtreCreateur
    return matchSearch && matchStatut && matchCreateur
  })
  // .filter() renvoie déjà un nouveau tableau — .sort() en place ici ne
  // touche pas `projets` (l'ordre par date reste intact au prochain fetch).
  // Un statut absent de STATUTS (ne devrait pas arriver) part en fin de
  // liste plutôt que de planter le tri.
  if (tri === 'statut') {
    filtered.sort((a, b) => {
      const ia = STATUTS.indexOf(a.statut), ib = STATUTS.indexOf(b.statut)
      return (ia === -1 ? STATUTS.length : ia) - (ib === -1 ? STATUTS.length : ib)
    })
  } else if (tri === 'createur') {
    // Les projets sans créateur connu (créés avant projet_createur_migration.sql,
    // voir ProjetDetail.jsx) partent en fin de liste plutôt qu'en tête.
    filtered.sort((a, b) => (a.created_by_email || '￿').localeCompare(b.created_by_email || '￿'))
  }

  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40, gap: 14, flexWrap: 'wrap' }}>
        <div>
          <p style={eyebrow}>Partenaires Particuliers</p>
          <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Projets</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowVueGlobale(v => !v)} style={{ ...btnGhost, fontWeight: showVueGlobale ? 600 : 400, borderColor: showVueGlobale ? colors.ink : colors.line, color: showVueGlobale ? colors.ink : colors.inkMuted }}>
            Vue globale
          </button>
          <button onClick={() => { setShowForm(true); setError('') }} style={btnPrimary}>
            + Nouveau projet
          </button>
        </div>
      </div>

      {/* Vue globale des projets — repliée par défaut (voir le bouton
          ci-dessus) : filtres par statut (à cocher/décocher librement) +
          choix de la base de coût (devis prévu / commandes engagées), pour
          composer soi-même la vue voulue : prévisionnel, signés & actifs,
          clôturés, etc. Anciennement sur le tableau de bord — déplacée ici
          car consultée occasionnellement, pas au quotidien. */}
      {showVueGlobale && (
        <div style={{ marginBottom: 40 }}>
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
              {STATUTS.map(s => {
                const actif = filtreStatutsGlobal.has(s)
                return (
                  <button key={s} onClick={() => toggleStatutGlobal(s)}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', padding: '0 0 4px', borderBottom: '2px solid ' + (actif ? statutProjetMarker[s] : 'transparent'), cursor: 'pointer', fontFamily: fonts.display }}>
                    <span style={marker(statutProjetMarker[s])} />
                    <span style={{ fontSize: 12.5, color: actif ? colors.ink : colors.inkFaint, fontWeight: actif ? 600 : 400 }}>{s}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', borderBottom: '1px solid ' + colors.line }}>
            {(() => {
              const parLigne = isMobile ? 2 : 4
              return [
                { label: 'Projets sélectionnés', value: String(projetsFiltresGlobal.length) },
                { label: 'CA total HT', value: fmt(caGlobalFiltre) },
                { label: baseCoutGlobal === 'prevu' ? 'Coût prévu HT' : 'Coût engagé HT', value: fmt(coutGlobalFiltre) },
                { label: 'Marge (' + tauxGlobalFiltre + ' % · coeff. ' + (coeffGlobalFiltre ?? '—') + ')', value: fmt(margeGlobalFiltre), color: margeGlobalFiltre >= 0 ? colors.success : colors.danger },
              ].map((k, i) => {
                const debutLigne = i % parLigne === 0
                return (
                  <div key={k.label} style={{ padding: isMobile ? '14px 14px 16px' : '18px 20px 20px 0', paddingLeft: debutLigne ? (isMobile ? 0 : 0) : (isMobile ? 14 : 20), borderLeft: debutLigne ? 'none' : '1px solid ' + colors.line, borderTop: isMobile && i >= parLigne ? '1px solid ' + colors.line : 'none' }}>
                    <div style={{ fontSize: 11, color: colors.inkMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>{k.label}</div>
                    <div style={{ fontFamily: fonts.mono, fontSize: isMobile ? 17 : 20, fontVariantNumeric: 'tabular-nums', color: k.color || colors.ink }}>{k.value}</div>
                  </div>
                )
              })
            })()}
          </div>

          {breakdownStatuts.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: 12.5 }}>
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
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={marker(statutProjetMarker[b.statut])} />{b.statut}</span>
                      </td>
                      <td style={{ padding: '10px 10px 10px 0', textAlign: 'right', borderBottom: '1px solid ' + colors.line }}>{b.nb}</td>
                      <td style={{ padding: '10px 10px 10px 0', textAlign: 'right', borderBottom: '1px solid ' + colors.line, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(b.ca)}</td>
                      <td style={{ padding: '10px 10px 10px 0', textAlign: 'right', borderBottom: '1px solid ' + colors.line, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(b.cout)}</td>
                      <td style={{ padding: '10px 10px 10px 0', textAlign: 'right', borderBottom: '1px solid ' + colors.line, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums', color: b.marge >= 0 ? colors.success : colors.danger }}>{fmt(b.marge)}</td>
                      <td style={{ padding: '10px 10px 10px 0', textAlign: 'right', borderBottom: '1px solid ' + colors.line, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{b.taux} % (coeff. {b.coeff ?? '—'})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 32, borderBottom: '1px solid ' + colors.line, paddingBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un projet..."
          style={{ ...inputUnderline, flex: 2 }} />
        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
          style={{ ...inputUnderline, flex: 1, cursor: 'pointer' }}>
          <option>Tous</option>
          {STATUTS.map(s => <option key={s}>{s}</option>)}
        </select>
        {createurs.length > 1 && (
          <select value={filtreCreateur} onChange={e => setFiltreCreateur(e.target.value)}
            style={{ ...inputUnderline, flex: 1, cursor: 'pointer' }}>
            <option value="Tous">Tous les gérants</option>
            {createurs.map(c => <option key={c} value={c}>{c.split('@')[0]}</option>)}
          </select>
        )}
        <select value={tri} onChange={e => setTri(e.target.value)}
          style={{ ...inputUnderline, flex: 1, cursor: 'pointer' }}>
          <option value="date">Trier par date</option>
          <option value="statut">Trier par statut</option>
          <option value="createur">Trier par gérant</option>
        </select>
        {filtreStatut === 'Tous' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors.inkMuted, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <input type="checkbox" checked={masquerClotures} onChange={e => setMasquerClotures(e.target.checked)} />
            Masquer les clôturés
          </label>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20, marginBottom: 20, fontSize: 11, color: colors.inkMuted }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconClient size={12} style={{ color: colors.focus }} />% facturé aux clients
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconCommande size={12} style={{ color: colors.success }} />% commandé aux fournisseurs
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconFournisseur size={12} style={{ color: colors.warning }} />% facturé par les fournisseurs
          </div>
          <span style={{ color: colors.inkFaint }}>— à partir du statut "En cours"</span>
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.4)', zIndex: 100, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
          <div style={{ background: colors.surface, padding: isMobile ? 22 : 32, width: isMobile ? '100%' : 500, maxWidth: '100%', maxHeight: isMobile ? '90vh' : 'none', overflow: 'auto', boxSizing: 'border-box', border: '1px solid ' + colors.line }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700 }}>Nouveau projet</h3>
            <p style={{ margin: '0 0 22px', fontSize: 12, color: colors.inkMuted }}>Un projet démarre en devis (Brouillon) : tu retrouveras toutes les infos (lignes, rentabilité...) dans sa fiche, avant même qu'il soit signé.</p>
            {error && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 16, fontSize: 13 }}>{error}</div>}

            <label style={label}>Nom du projet *</label>
            <input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))}
              placeholder="Ex: Aménagement bureaux Tour Eiffel"
              style={{ ...inputUnderline, marginBottom: 18 }} />

            <label style={label}>Client</label>
            <select value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
              style={{ ...inputUnderline, marginBottom: 18, cursor: 'pointer' }}>
              <option value=''>— Aucun —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>

            <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>Date début</label>
                <input type="date" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))}
                  style={inputUnderline} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>Date fin prévue</label>
                <input type="date" value={form.date_fin_prevue} onChange={e => setForm(p => ({ ...p, date_fin_prevue: e.target.value }))}
                  style={inputUnderline} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>Statut</label>
                <select value={form.statut} onChange={e => setForm(p => ({ ...p, statut: e.target.value }))}
                  style={{ ...inputUnderline, cursor: 'pointer' }}>
                  {STATUTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>TVA</label>
                <select value={form.taux_tva} onChange={e => setForm(p => ({ ...p, taux_tva: Number(e.target.value) }))}
                  style={{ ...inputUnderline, cursor: 'pointer' }}>
                  {TAUX_TVA_OPTIONS.map(t => <option key={t} value={t}>{t === 0 ? 'Non applicable (0%)' : t + ' %'}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setError('') }} style={btnGhost}>Annuler</button>
              <button onClick={creerProjet} disabled={savingProjet}
                style={{ ...btnPrimary, cursor: savingProjet ? 'default' : 'pointer', opacity: savingProjet ? 0.6 : 1 }}>{savingProjet ? 'Création...' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 60, color: colors.inkFaint, fontSize: 13 }}>Chargement...</div>
        : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: colors.ink }}>Aucun projet</div>
            <div style={{ fontSize: 13 }}>Crée un projet pour démarrer un devis — il évoluera vers un chantier réel une fois signé</div>
          </div>
        ) : (
          <div>
            {filtered.map((p, i) => {
              // En tri par statut ou par gérant, un petit intitulé au-dessus
              // du premier projet de chaque groupe — sinon le regroupement
              // n'est visible qu'au marqueur de statut de chaque ligne (ou pas
              // du tout pour le gérant), facile à manquer en survolant vite
              // la liste.
              const nouveauGroupe = (tri === 'statut' && (i === 0 || filtered[i - 1].statut !== p.statut))
                || (tri === 'createur' && (i === 0 || filtered[i - 1].created_by_email !== p.created_by_email))

              // Barres "% facturé" — voir BarreFacturation plus haut. Même
              // garde-fou que l'onglet Rentabilité : avant "En cours", un
              // devis n'a normalement aucune facture, une barre à 0% ne
              // ferait que bruiter la liste (voir STATUTS_AVEC_FACTURATION).
              const hasBars = STATUTS_AVEC_FACTURATION.includes(p.statut)
              const ca = p.montant_ht || facturation.venteParProjet[p.id] || 0
              const achatPrevu = facturation.achatParProjet[p.id] || 0
              const factClient = facturation.factClientParProjet[p.id] || 0
              const factFournisseur = facturation.factFournisseurParProjet[p.id] || 0
              const commande = facturation.commandeParProjet[p.id] || 0
              const pctClient = (ca <= 0 && factClient <= 0) ? null : (ca > 0 ? Math.round((factClient / ca) * 100) : 100)
              const pctFournisseur = (achatPrevu <= 0 && factFournisseur <= 0) ? null : (achatPrevu > 0 ? Math.round((factFournisseur / achatPrevu) * 100) : 100)
              const pctCommande = (achatPrevu <= 0 && commande <= 0) ? null : (achatPrevu > 0 ? Math.round((commande / achatPrevu) * 100) : 100)

              return (
                <div key={p.id}>
                  {nouveauGroupe && (
                    <div style={{ ...eyebrow, display: 'flex', alignItems: 'center', gap: 8, margin: i === 0 ? '0 0 8px' : '28px 0 8px' }}>
                      {tri === 'createur'
                        ? (p.created_by_email || 'Gérant inconnu')
                        : <><span style={marker(statutProjetMarker[p.statut])} />{p.statut}</>}
                    </div>
                  )}
                  <div onClick={() => navigate('/projets/' + p.id)}
                    style={{ borderTop: '1px solid ' + colors.line, padding: isMobile ? '14px 0' : '16px 0', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 8 : 16, cursor: 'pointer' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{p.nom}</div>
                      <div style={{ fontSize: 12, color: colors.inkMuted, marginTop: 3 }}>
                        {p.clients?.nom || 'Sans client'}
                        {p.date_debut ? ' · ' + new Date(p.date_debut).toLocaleDateString('fr-FR') : ''}
                        {p.date_fin_prevue ? ' → ' + new Date(p.date_fin_prevue).toLocaleDateString('fr-FR') : ''}
                      </div>
                      {/* Créateur — voir sql/projet_createur_migration.sql.
                          On n'affiche que la partie avant @ (compacte), le
                          titre au survol donne l'adresse complète. */}
                      {p.created_by_email && (
                        <div title={'Créé par ' + p.created_by_email} style={{ fontSize: 11, color: colors.inkFaint, marginTop: 2 }}>
                          Créé par {p.created_by_email.split('@')[0]}
                        </div>
                      )}
                    </div>
                    <div style={{ width: isMobile ? '100%' : 170, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {hasBars ? (
                        <>
                          <BarreFacturation pct={pctClient} Icon={IconClient} color={colors.focus}
                            title={pctClient === null ? undefined : fmt(factClient) + ' facturés aux clients sur ' + fmt(ca) + ' prévus au devis (' + pctClient + '%)'} />
                          <BarreFacturation pct={pctCommande} Icon={IconCommande} color={colors.success}
                            title={pctCommande === null ? undefined : fmt(commande) + ' commandés aux fournisseurs sur ' + fmt(achatPrevu) + ' d’achats prévus (' + pctCommande + '%)'} />
                          <BarreFacturation pct={pctFournisseur} Icon={IconFournisseur} color={colors.warning}
                            title={pctFournisseur === null ? undefined : fmt(factFournisseur) + ' facturés par les fournisseurs sur ' + fmt(achatPrevu) + ' d’achats prévus (' + pctFournisseur + '%)'} />
                        </>
                      ) : (
                        <div style={{ fontSize: 11, color: colors.inkFaint, textAlign: isMobile ? 'left' : 'right' }}>Pas encore facturé</div>
                      )}
                    </div>
                    <div style={{ textAlign: isMobile ? 'left' : 'right', display: 'flex', flexDirection: isMobile ? 'row-reverse' : 'row', justifyContent: isMobile ? 'space-between' : 'flex-start', alignItems: 'center', gap: 20 }}>
                      <div>
                        <div style={{ fontFamily: fonts.mono, fontWeight: 500, fontSize: 15, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{fmt(p.montant_ht)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.inkMuted, justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
                          <span style={marker(statutProjetMarker[p.statut])} />{p.statut}
                        </div>
                      </div>
                      <button onClick={e => supprimerProjet(e, p.id)} style={{ ...quietLink, flexShrink: 0 }}>
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}
