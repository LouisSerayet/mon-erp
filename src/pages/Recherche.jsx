import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../lib/useIsMobile'
import { fmtEUR as fmt, fmtDateFr as fmtDate, termeNettoye, montantSaisi } from '../lib/calculs'
import { colors, fonts, eyebrow, quietLink, sectionTitle } from '../lib/theme'

// Recherche avancée — complète la petite recherche rapide de la barre
// latérale (Layout.jsx) qui ne couvre que clients/fournisseurs/projets/
// factures et se limite à 5 résultats par catégorie. Ici : plus de types de
// données (dépenses, commandes, contacts), plus de champs par type (email,
// ville, numéro de bon de commande...), et des filtres pour une recherche
// vraiment précise (période, montant, ou une combinaison des deux sans même
// taper de texte — ex. "toutes les dépenses de mars entre 100 et 500 €").
//
// Ne cherche que sur les données non supprimées (deleted_at is null), comme
// partout ailleurs dans l'app — les éléments dans la Corbeille ont leur
// propre page.

const TYPES = [
  { key: 'projets', label: 'Projets' },
  { key: 'clients', label: 'Clients' },
  { key: 'fournisseurs', label: 'Fournisseurs' },
  { key: 'contacts', label: 'Contacts clients' },
  { key: 'facturesCli', label: 'Factures clients' },
  { key: 'facturesFrs', label: 'Factures fournisseurs' },
  { key: 'commandes', label: 'Commandes fournisseurs' },
  { key: 'depenses', label: 'Dépenses' },
]
const TOUS_TYPES_ACTIFS = Object.fromEntries(TYPES.map(t => [t.key, true]))

async function chercher({ typesActifs, q, dateDebut, dateFin, montantMin, montantMax, statuts }) {
  const qNet = termeNettoye(q)
  const hasTexte = qNet.length >= 2
  const like = '%' + qNet + '%'
  const montant = hasTexte ? montantSaisi(qNet) : null

  // Applique les filtres période/montant/statut communs aux entités
  // "financières" (celles avec un montant_ht et une date de facture/
  // commande) — les autres colonnes ne sont filtrables que si l'utilisateur
  // a tapé du texte (voir plus bas).
  function avecFiltresFinanciers(query, colDate) {
    if (dateDebut) query = query.gte(colDate, dateDebut)
    if (dateFin) query = query.lte(colDate, dateFin)
    if (montantMin !== '') query = query.gte('montant_ht', parseFloat(montantMin) || 0)
    if (montantMax !== '') query = query.lte('montant_ht', parseFloat(montantMax) || 0)
    if (statuts && statuts.length > 0) query = query.in('statut', statuts)
    return query
  }

  const requetes = {}

  // Chaque type coché est interrogé dès qu'il est actif, texte ou filtre ou
  // pas — sans texte/filtre, ça liste simplement tout (les 30 plus
  // récents/pertinents), pour ne pas obliger à taper quelque chose juste
  // pour voir ce qu'il y a. Le texte/les filtres, quand ils sont renseignés,
  // affinent cette liste au lieu d'être une condition pour la lancer.
  if (typesActifs.projets) {
    let query = supabase.from('projets').select('id, nom, statut, numero_bon_commande_client, clients(nom)').is('deleted_at', null)
    if (hasTexte) query = query.or(`nom.ilike.${like},numero_bon_commande_client.ilike.${like}`)
    requetes.projets = query.order('created_at', { ascending: false }).limit(30)
  }
  if (typesActifs.clients) {
    let query = supabase.from('clients').select('id, nom, email, ville').is('deleted_at', null)
    if (hasTexte) query = query.or(`nom.ilike.${like},email.ilike.${like},ville.ilike.${like}`)
    requetes.clients = query.order('nom').limit(30)
  }
  if (typesActifs.fournisseurs) {
    let query = supabase.from('fournisseurs').select('id, nom, email, ville').is('deleted_at', null)
    if (hasTexte) query = query.or(`nom.ilike.${like},email.ilike.${like},ville.ilike.${like}`)
    requetes.fournisseurs = query.order('nom').limit(30)
  }
  if (typesActifs.contacts) {
    let query = supabase.from('client_contacts').select('id, nom, email, telephone, type, client_id, clients(nom)').is('deleted_at', null)
    if (hasTexte) query = query.or(`nom.ilike.${like},email.ilike.${like}`)
    requetes.contacts = query.order('nom').limit(30)
  }
  if (typesActifs.facturesCli) {
    let query = supabase.from('factures_cli').select('id, numero, montant_ht, statut, date_facture, projet_id, projets(nom)').is('deleted_at', null)
    if (hasTexte) {
      const conds = [`numero.ilike.${like}`]
      if (montant !== null) conds.push(`montant_ht.eq.${montant}`)
      query = query.or(conds.join(','))
    }
    requetes.facturesCli = avecFiltresFinanciers(query, 'date_facture').order('date_facture', { ascending: false }).limit(30)
  }
  if (typesActifs.facturesFrs) {
    let query = supabase.from('factures_frs').select('id, numero, montant_ht, statut, date_facture, projet_id, projets(nom), fournisseurs(nom)').is('deleted_at', null)
    if (hasTexte) {
      const conds = [`numero.ilike.${like}`]
      if (montant !== null) conds.push(`montant_ht.eq.${montant}`)
      query = query.or(conds.join(','))
    }
    requetes.facturesFrs = avecFiltresFinanciers(query, 'date_facture').order('date_facture', { ascending: false }).limit(30)
  }
  if (typesActifs.commandes) {
    let query = supabase.from('commandes').select('id, numero, description, montant_ht, statut, date_commande, projet_id, projets(nom), fournisseurs(nom)').is('deleted_at', null)
    if (hasTexte) {
      const conds = [`numero.ilike.${like}`, `description.ilike.${like}`]
      if (montant !== null) conds.push(`montant_ht.eq.${montant}`)
      query = query.or(conds.join(','))
    }
    requetes.commandes = avecFiltresFinanciers(query, 'date_commande').order('date_commande', { ascending: false }).limit(30)
  }
  if (typesActifs.depenses) {
    let query = supabase.from('depenses_generales').select('id, libelle, numero, montant_ht, statut, date_facture, categorie, fournisseurs(nom)').is('deleted_at', null)
    if (hasTexte) {
      const conds = [`libelle.ilike.${like}`, `numero.ilike.${like}`]
      if (montant !== null) conds.push(`montant_ht.eq.${montant}`)
      query = query.or(conds.join(','))
    }
    requetes.depenses = avecFiltresFinanciers(query, 'date_facture').order('date_facture', { ascending: false }).limit(30)
  }

  const cles = Object.keys(requetes)
  // Ne peut arriver que si tous les types sont décochés — voir le message
  // "aucuneRequete" plus bas dans le composant.
  if (cles.length === 0) return null
  const reponses = await Promise.all(cles.map(k => requetes[k]))
  const out = {}
  cles.forEach((k, i) => { out[k] = reponses[i].data || [] })
  TYPES.forEach(t => { if (!(t.key in out)) out[t.key] = [] })
  return out
}

function totalResultats(r) {
  if (!r) return 0
  return TYPES.reduce((acc, t) => acc + (r[t.key]?.length || 0), 0)
}

const inputUnderline = {
  padding: '8px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}

export default function Recherche() {
  const location = useLocation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [q, setQ] = useState(location.state?.q || '')
  // Arrivée depuis un lien "Voir tout" d'une carte du Dashboard (Dashboard.jsx,
  // VoirTout) : `types` isole un seul type (ex. ['facturesCli']) et `statuts`
  // liste les statuts à afficher (ex. ['À envoyer', 'Envoyée']), pour
  // retrouver exactement le contenu de la carte, en entier et filtrable.
  const [typesActifs, setTypesActifs] = useState(() => (
    location.state?.types
      ? Object.fromEntries(TYPES.map(t => [t.key, location.state.types.includes(t.key)]))
      : TOUS_TYPES_ACTIFS
  ))
  const [statutsFiltre, setStatutsFiltre] = useState(location.state?.statuts || null)
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [montantMin, setMontantMin] = useState('')
  const [montantMax, setMontantMax] = useState('')
  const [resultats, setResultats] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      const r = await chercher({ typesActifs, q, dateDebut, dateFin, montantMin, montantMax, statuts: statutsFiltre })
      setResultats(r)
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [q, typesActifs, dateDebut, dateFin, montantMin, montantMax, statutsFiltre])

  function toggleType(key) {
    setTypesActifs(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function reinitialiserFiltres() {
    setTypesActifs(TOUS_TYPES_ACTIFS)
    setDateDebut(''); setDateFin(''); setMontantMin(''); setMontantMax(''); setStatutsFiltre(null)
  }

  const filtresActifs = dateDebut || dateFin || montantMin !== '' || montantMax !== '' || !!statutsFiltre || TYPES.some(t => !typesActifs[t.key])

  const aucuneRequete = resultats === null && !loading
  const total = totalResultats(resultats)

  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 860, margin: '0 auto' }}>
      <p style={eyebrow}>Partenaires Particuliers</p>
      <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Recherche avancée</h1>
      <p style={{ margin: '10px 0 0', fontSize: 13, color: colors.inkMuted }}>
        Affiche tout par défaut pour les types cochés ci-dessous (les 30 plus récents de chaque) — tape un nom, email, numéro de facture/commande, un montant exact, ou choisis une période/fourchette de montant pour affiner.
      </p>

      {statutsFiltre && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderLeft: '2px solid ' + colors.focus, padding: '8px 14px', marginTop: 24, fontSize: 12, color: colors.ink }}>
          <span>Filtre depuis le Dashboard — statut : {statutsFiltre.join(', ')}</span>
          <button onClick={() => setStatutsFiltre(null)} style={{ ...quietLink, marginLeft: 'auto' }}>Retirer</button>
        </div>
      )}

      <input autoFocus value={q} onChange={e => setQ(e.target.value)}
        placeholder="Nom, email, numéro de facture/commande, montant (ex: 1250,00)..."
        style={{ ...inputUnderline, width: '100%', fontSize: 15, margin: '32px 0 24px' }} />

      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid ' + colors.line }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 22 }}>
          {TYPES.map(t => (
            <button key={t.key} onClick={() => toggleType(t.key)}
              style={{
                background: 'none', border: 'none', padding: '0 0 4px', cursor: 'pointer', fontFamily: fonts.display,
                borderBottom: '1px solid ' + (typesActifs[t.key] ? colors.ink : 'transparent'),
                color: typesActifs[t.key] ? colors.ink : colors.inkFaint,
                fontSize: 12.5, fontWeight: typesActifs[t.key] ? 600 : 400,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Période (factures / commandes / dépenses)</label>
            <div style={{ display: 'flex', gap: 12 }}>
              <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} style={{ ...inputUnderline, flex: 1 }} />
              <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} style={{ ...inputUnderline, flex: 1 }} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Montant HT (factures / commandes / dépenses)</label>
            <div style={{ display: 'flex', gap: 12 }}>
              <input type="number" min="0" placeholder="Min" value={montantMin} onChange={e => setMontantMin(e.target.value)} style={{ ...inputUnderline, flex: 1 }} />
              <input type="number" min="0" placeholder="Max" value={montantMax} onChange={e => setMontantMax(e.target.value)} style={{ ...inputUnderline, flex: 1 }} />
            </div>
          </div>
        </div>

        {filtresActifs && (
          <button onClick={reinitialiserFiltres} style={{ ...quietLink, display: 'inline-block', marginTop: 16 }}>
            Réinitialiser les filtres
          </button>
        )}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: colors.inkFaint, fontSize: 13 }}>Recherche...</div>}

      {!loading && aucuneRequete && (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line }}>
          <div style={{ fontSize: 13 }}>Coche au moins un type ci-dessus pour voir des résultats.</div>
        </div>
      )}

      {!loading && resultats && (
        total === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line }}>
            <div style={{ fontSize: 13 }}>Aucun résultat pour cette recherche.</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: colors.inkFaint, marginBottom: 16 }}>{total} résultat{total > 1 ? 's' : ''}</div>
            {resultats.projets.length > 0 && (
              <Groupe titre="Projets">
                {resultats.projets.map(p => (
                  <Ligne key={p.id} onClick={() => navigate('/projets/' + p.id)}
                    principal={p.nom}
                    secondaire={[p.clients?.nom, p.numero_bon_commande_client ? 'BC ' + p.numero_bon_commande_client : null].filter(Boolean).join(' · ')}
                    droite={p.statut} />
                ))}
              </Groupe>
            )}
            {resultats.clients.length > 0 && (
              <Groupe titre="Clients">
                {resultats.clients.map(c => (
                  <Ligne key={c.id} onClick={() => { navigate('/clients', { state: { q: c.nom } }) }}
                    principal={c.nom} secondaire={[c.email, c.ville].filter(Boolean).join(' · ')} />
                ))}
              </Groupe>
            )}
            {resultats.fournisseurs.length > 0 && (
              <Groupe titre="Fournisseurs">
                {resultats.fournisseurs.map(f => (
                  <Ligne key={f.id} onClick={() => { navigate('/fournisseurs', { state: { q: f.nom } }) }}
                    principal={f.nom} secondaire={[f.email, f.ville].filter(Boolean).join(' · ')} />
                ))}
              </Groupe>
            )}
            {resultats.contacts.length > 0 && (
              <Groupe titre="Contacts clients">
                {resultats.contacts.map(c => (
                  <Ligne key={c.id} onClick={() => { if (c.clients?.nom) navigate('/clients', { state: { q: c.clients.nom } }) }}
                    principal={c.nom + (c.type ? ' (' + c.type + ')' : '')}
                    secondaire={[c.email, c.telephone, c.clients?.nom ? 'chez ' + c.clients.nom : null].filter(Boolean).join(' · ')} />
                ))}
              </Groupe>
            )}
            {resultats.facturesCli.length > 0 && (
              <Groupe titre="Factures clients">
                {resultats.facturesCli.map(f => (
                  <Ligne key={f.id} onClick={() => navigate('/projets/' + f.projet_id, { state: { tab: 'factures_cli', focusId: f.id } })}
                    principal={f.numero} secondaire={[f.projets?.nom, fmtDate(f.date_facture)].filter(Boolean).join(' · ')}
                    droite={fmt(f.montant_ht) + ' · ' + f.statut} />
                ))}
              </Groupe>
            )}
            {resultats.facturesFrs.length > 0 && (
              <Groupe titre="Factures fournisseurs">
                {resultats.facturesFrs.map(f => (
                  <Ligne key={f.id} onClick={() => navigate('/projets/' + f.projet_id, { state: { tab: 'factures_frs', focusId: f.id } })}
                    principal={f.numero} secondaire={[f.fournisseurs?.nom, f.projets?.nom, fmtDate(f.date_facture)].filter(Boolean).join(' · ')}
                    droite={fmt(f.montant_ht) + ' · ' + f.statut} />
                ))}
              </Groupe>
            )}
            {resultats.commandes.length > 0 && (
              <Groupe titre="Commandes fournisseurs">
                {resultats.commandes.map(c => (
                  <Ligne key={c.id} onClick={() => navigate('/projets/' + c.projet_id, { state: { tab: 'commandes', focusId: c.id } })}
                    principal={c.numero} secondaire={[c.fournisseurs?.nom, c.projets?.nom, fmtDate(c.date_commande)].filter(Boolean).join(' · ')}
                    droite={fmt(c.montant_ht) + ' · ' + c.statut} />
                ))}
              </Groupe>
            )}
            {resultats.depenses.length > 0 && (
              <Groupe titre="Dépenses">
                {resultats.depenses.map(d => (
                  <Ligne key={d.id} onClick={() => navigate('/depenses', { state: { q: d.libelle || d.numero } })}
                    principal={d.libelle || d.numero} secondaire={[d.categorie, d.fournisseurs?.nom, fmtDate(d.date_facture)].filter(Boolean).join(' · ')}
                    droite={fmt(d.montant_ht) + ' · ' + d.statut} />
                ))}
              </Groupe>
            )}
          </div>
        )
      )}
    </div>
  )
}

function Groupe({ titre, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={sectionTitle}>{titre}</h2>
      <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 10 }}>
        {children}
      </div>
    </div>
  )
}

function Ligne({ onClick, principal, secondaire, droite }) {
  return (
    <div onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '11px 0', borderBottom: '1px solid ' + colors.line, cursor: 'pointer', fontSize: 13 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{principal}</div>
        {secondaire && <div style={{ fontSize: 11.5, color: colors.inkFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{secondaire}</div>}
      </div>
      {droite && <div style={{ flexShrink: 0, fontSize: 12, color: colors.inkMuted, whiteSpace: 'nowrap' }}>{droite}</div>}
    </div>
  )
}
