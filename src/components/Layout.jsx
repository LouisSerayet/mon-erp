import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useIsMobile } from '../lib/useIsMobile'
import { colors, fonts, quietLink } from '../lib/theme'

// Dashboard, Compte de résultat, Trésorerie et Rapprochement n'ont plus
// d'entrée ici : le logo (desktop) / l'onglet Dashboard (mobile) ouvre
// toujours le Dashboard, et les trois autres pages ne sont plus atteintes
// que via leurs widgets sur le Dashboard (solde Qonto → Trésorerie +
// Rapprochement, mini-widget compte de résultat → Compte de résultat).
const nav = [
  { to: '/projets', label: 'Projets', icon: '📋' },
  { to: '/depenses', label: 'Dépenses', icon: '💸' },
  { section: 'Comptes' },
  { to: '/clients', label: 'Clients', icon: '👤' },
  { to: '/fournisseurs', label: 'Fournisseurs', icon: '🏢' },
  { section: 'Factures & commandes' },
  { to: '/factures-clients', label: 'Factures clients', icon: '💶' },
  { to: '/factures-fournisseurs', label: 'Factures fournisseurs', icon: '📄' },
  { to: '/commandes-fournisseurs', label: 'Commandes fournisseurs', icon: '🛒' },
  { section: 'Support' },
  { to: '/corbeille', label: 'Corbeille', icon: '🗑' },
  { to: '/recherche', label: 'Recherche avancée', icon: '🔎' },
  { to: '/historique', label: 'Historique', icon: '🕓' },
  { to: '/exports', label: 'Exports', icon: '📤' },
]

// Sur mobile, il n'y a pas de logo cliquable comme sur desktop pour revenir
// au Dashboard — on lui garde donc son propre onglet dans la barre du bas,
// à côté de Projets et Dépenses (les deux usages "coup d'œil rapide" du
// haut du nouveau menu desktop). Le reste (Comptes, Commandes/Factures,
// Support) est regroupé derrière "Plus".
const NAV_MOBILE_PRINCIPALE = [
  { to: '/dashboard', label: 'Dashboard', icon: '◻' },
  ...nav.filter(n => n.to && ['/projets', '/depenses'].includes(n.to)),
]
const NAV_MOBILE_PLUS = nav.filter(n => n.section || (n.to && !['/projets', '/depenses'].includes(n.to)))

// ── Recherche globale ────────────────────────────────────────────
// Cherche un client/fournisseur/projet/facture par nom ou numéro depuis
// n'importe quelle page, sans avoir à naviguer onglet par onglet.
function useRechercheGlobale(terme) {
  const [resultats, setResultats] = useState(null) // null = pas encore de recherche lancée
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = terme.trim()
    // Rien à faire pour une recherche trop courte — l'appelant n'affiche
    // de toute façon le menu déroulant qu'à partir de 2 caractères, pas
    // besoin de vider "resultats" ici (voir la note ESLint plus bas : un
    // effet ne doit pas se contenter d'un setState synchrone sans y
    // enchaîner un abonnement/traitement asynchrone).
    if (q.length < 2) return
    // setLoading(true) est déclenché depuis le timer (donc de façon
    // asynchrone) plutôt que directement dans le corps de l'effet, pour
    // éviter un setState synchrone en effet (voir react-hooks/set-state-in-effect).
    const timer = setTimeout(async () => {
      setLoading(true)
      const like = '%' + q + '%'
      const [{ data: clients }, { data: fournisseurs }, { data: projets }, { data: fcli }, { data: ffrs }] = await Promise.all([
        supabase.from('clients').select('id, nom').is('deleted_at', null).ilike('nom', like).limit(5),
        supabase.from('fournisseurs').select('id, nom').is('deleted_at', null).ilike('nom', like).limit(5),
        supabase.from('projets').select('id, nom').is('deleted_at', null).ilike('nom', like).limit(5),
        supabase.from('factures_cli').select('id, numero, projet_id, projets(nom)').is('deleted_at', null).ilike('numero', like).limit(5),
        supabase.from('factures_frs').select('id, numero, projet_id, projets(nom)').is('deleted_at', null).ilike('numero', like).limit(5),
      ])
      setResultats({
        clients: clients || [],
        fournisseurs: fournisseurs || [],
        projets: projets || [],
        facturesCli: fcli || [],
        facturesFrs: ffrs || [],
      })
      setLoading(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [terme])

  return { resultats, loading }
}

function totalResultats(r) {
  if (!r) return 0
  return r.clients.length + r.fournisseurs.length + r.projets.length + r.facturesCli.length + r.facturesFrs.length
}

function ListeResultats({ resultats, onNavigerClient, onNavigerFournisseur, onNavigerProjet, onRechercheAvancee }) {
  const GROUPES = [
    { items: resultats.projets, icon: '📋', rendu: p => ({ label: p.nom, onClick: () => onNavigerProjet(p.id) }) },
    { items: resultats.clients, icon: '👤', rendu: c => ({ label: c.nom, onClick: () => onNavigerClient(c.nom) }) },
    { items: resultats.fournisseurs, icon: '🏢', rendu: f => ({ label: f.nom, onClick: () => onNavigerFournisseur(f.nom) }) },
    { items: resultats.facturesCli, icon: '💶', rendu: f => ({ label: f.numero + (f.projets?.nom ? ' — ' + f.projets.nom : ''), onClick: () => onNavigerProjet(f.projet_id) }) },
    { items: resultats.facturesFrs, icon: '📄', rendu: f => ({ label: f.numero + (f.projets?.nom ? ' — ' + f.projets.nom : ''), onClick: () => onNavigerProjet(f.projet_id) }) },
  ]

  const aucun = totalResultats(resultats) === 0

  // Cette recherche rapide ne couvre que 5 types de données (5 résultats
  // chacun) — le lien vers la recherche avancée reste utile même sans
  // résultat ici, puisqu'elle cherche aussi dans les dépenses, commandes et
  // contacts, avec des filtres période/montant en plus.
  return (
    <div>
      {aucun ? (
        <div style={{ padding: '16px', fontSize: 13, color: colors.inkFaint, textAlign: 'center' }}>Aucun résultat rapide</div>
      ) : (
        GROUPES.map((g, gi) => g.items.map((item, i) => {
          const { label, onClick } = g.rendu(item)
          return (
            <div key={gi + '-' + i} onClick={onClick}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', fontSize: 13, color: colors.ink }}
              onMouseEnter={e => e.currentTarget.style.background = colors.bg}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{g.icon}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
          )
        }))
      )}
      <div onClick={onRechercheAvancee}
        style={{ borderTop: '1px solid ' + colors.line, padding: '10px 14px', fontSize: 12, color: colors.inkMuted, cursor: 'pointer', textAlign: 'center', fontWeight: 500 }}
        onMouseEnter={e => e.currentTarget.style.background = colors.bg}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        Recherche avancée →
      </div>
    </div>
  )
}

export default function Layout() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const isMobile = useIsMobile()
  const [plusOuvert, setPlusOuvert] = useState(false)
  const [rechercheQ, setRechercheQ] = useState('')
  const [rechercheOuverte, setRechercheOuverte] = useState(false)
  const [rechercheMobileOuverte, setRechercheMobileOuverte] = useState(false)
  const { resultats, loading: rechercheEnCours } = useRechercheGlobale(rechercheQ)

  async function logout() {
    await supabase.auth.signOut()
  }

  function fermerRecherche() {
    setRechercheOuverte(false)
    setRechercheMobileOuverte(false)
    setRechercheQ('')
  }
  // Clients/Fournisseurs n'ont pas de route dédiée par fiche (juste une
  // liste avec sélection en mémoire) — on navigue vers la liste en lui
  // passant le nom recherché, qu'elle utilise pour pré-filtrer sa propre
  // barre de recherche, façon de s'approcher d'un lien direct.
  function allerVersClient(nom) { fermerRecherche(); navigate('/clients', { state: { q: nom } }) }
  function allerVersFournisseur(nom) { fermerRecherche(); navigate('/fournisseurs', { state: { q: nom } }) }
  function allerVersProjet(id) { fermerRecherche(); navigate('/projets/' + id) }
  function allerVersRechercheAvancee() { const terme = rechercheQ; fermerRecherche(); navigate('/recherche', { state: { q: terme } }) }

  if (isMobile) {
    const linkStyle = ({ isActive }) => ({
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      flex: 1, padding: '6px 4px', color: isActive ? colors.ink : colors.inkFaint,
      textDecoration: 'none', fontSize: 10, fontWeight: isActive ? 600 : 400,
      fontFamily: fonts.display,
    })
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', background: colors.surface, borderBottom: '1px solid ' + colors.line, flexShrink: 0 }}>
          <button onClick={() => setRechercheMobileOuverte(true)}
            style={{ background: 'none', border: 'none', fontSize: 15, cursor: 'pointer', padding: 4, color: colors.inkMuted, fontFamily: fonts.display }}>
            Rechercher
          </button>
        </div>

        <main style={{ flex: 1, overflow: 'auto', background: colors.bg, WebkitOverflowScrolling: 'touch' }}>
          <Outlet />
        </main>

        {rechercheMobileOuverte && (
          <div style={{ position: 'fixed', inset: 0, background: colors.surface, zIndex: 30, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid ' + colors.line, paddingTop: 'calc(10px + env(safe-area-inset-top))' }}>
              <input autoFocus value={rechercheQ} onChange={e => setRechercheQ(e.target.value)}
                placeholder="Rechercher un client, projet, facture..."
                style={{ flex: 1, padding: '8px 2px', background: 'transparent', border: 'none', borderBottom: '1px solid ' + colors.line, fontSize: 14, fontFamily: fonts.display, color: colors.ink }} />
              <button onClick={fermerRecherche} style={{ background: 'none', border: 'none', fontSize: 14, color: colors.inkMuted, cursor: 'pointer', padding: 4, fontFamily: fonts.display }}>Annuler</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {rechercheEnCours ? (
                <div style={{ padding: 16, fontSize: 13, color: colors.inkFaint, textAlign: 'center' }}>Recherche...</div>
              ) : resultats ? (
                <ListeResultats resultats={resultats} onNavigerClient={allerVersClient} onNavigerFournisseur={allerVersFournisseur} onNavigerProjet={allerVersProjet} onRechercheAvancee={allerVersRechercheAvancee} />
              ) : (
                <div style={{ padding: 16, fontSize: 13, color: colors.inkFaint, textAlign: 'center' }}>Tape au moins 2 caractères</div>
              )}
            </div>
          </div>
        )}

        {plusOuvert && (
          <div onClick={() => setPlusOuvert(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.4)', zIndex: 20, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: colors.surface, width: '100%', borderTop: '1px solid ' + colors.line, padding: '4px 0 calc(10px + env(safe-area-inset-bottom))' }}>
              {NAV_MOBILE_PLUS.map((n, i) => n.section ? (
                <div key={i} style={{ fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '14px 20px 4px', fontWeight: 600 }}>{n.section}</div>
              ) : (
                <NavLink key={i} to={n.to} state={n.state} onClick={() => setPlusOuvert(false)}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px',
                    fontSize: 15, color: (isActive && !n.state) ? colors.ink : colors.inkMuted, textDecoration: 'none',
                    fontWeight: (isActive && !n.state) ? 600 : 400, fontFamily: fonts.display,
                  })}>
                  {n.label}
                </NavLink>
              ))}
              <div style={{ borderTop: '1px solid ' + colors.line, margin: '8px 0' }} />
              {session?.user?.email && (
                <div style={{ padding: '6px 20px', fontSize: 12, color: colors.inkFaint }}>{session.user.email}</div>
              )}
              <button onClick={logout}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '13px 20px', fontSize: 15, color: colors.inkMuted, background: 'none', border: 'none', fontFamily: fonts.display }}>
                Se déconnecter
              </button>
            </div>
          </div>
        )}

        <nav style={{
          display: 'flex', background: colors.surface, borderTop: '1px solid ' + colors.line,
          paddingBottom: 'env(safe-area-inset-bottom)', flexShrink: 0,
        }}>
          {NAV_MOBILE_PRINCIPALE.map((n, i) => (
            <NavLink key={i} to={n.to} style={linkStyle}>
              {n.label}
            </NavLink>
          ))}
          <button onClick={() => setPlusOuvert(true)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1, padding: '6px 4px', background: 'none', border: 'none', color: plusOuvert ? colors.ink : colors.inkFaint, fontSize: 10, fontWeight: plusOuvert ? 600 : 400, fontFamily: fonts.display }}>
            Plus
          </button>
        </nav>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside style={{ width: 210, background: colors.surface, borderRight: '1px solid ' + colors.line, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div onClick={() => navigate('/dashboard')} style={{ padding: '18px 16px', borderBottom: '1px solid ' + colors.line, cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = colors.bg}
          onMouseLeave={e => e.currentTarget.style.background = colors.surface}>
          <img src="/logo-pp.png" alt="Partenaires Particuliers" style={{ height: 30, width: 'auto', display: 'block' }} />
          <div style={{ fontSize: 10, color: colors.inkFaint, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>Partenaires Particuliers</div>
        </div>

        {/* Recherche globale */}
        <div style={{ padding: '10px 10px 0', position: 'relative' }}>
          <input value={rechercheQ}
            onChange={e => setRechercheQ(e.target.value)}
            onFocus={() => setRechercheOuverte(true)}
            onBlur={() => setTimeout(() => setRechercheOuverte(false), 150)}
            placeholder="Rechercher..."
            style={{ width: '100%', padding: '7px 2px', background: 'transparent', border: 'none', borderBottom: '1px solid ' + colors.line, fontSize: 12, boxSizing: 'border-box', fontFamily: fonts.display, color: colors.ink }} />
          {rechercheOuverte && rechercheQ.trim().length >= 2 && (
            <div style={{ position: 'absolute', top: '100%', left: 10, right: 10, marginTop: 4, background: colors.surface, border: '1px solid ' + colors.line, zIndex: 50, maxHeight: 320, overflow: 'auto' }}>
              {rechercheEnCours ? (
                <div style={{ padding: 16, fontSize: 13, color: colors.inkFaint, textAlign: 'center' }}>Recherche...</div>
              ) : resultats ? (
                <ListeResultats resultats={resultats} onNavigerClient={allerVersClient} onNavigerFournisseur={allerVersFournisseur} onNavigerProjet={allerVersProjet} onRechercheAvancee={allerVersRechercheAvancee} />
              ) : null}
            </div>
          )}
        </div>

        <nav style={{ padding: '8px', flex: 1, overflow: 'auto' }}>
          {nav.map((n, i) => n.section ? (
            <div key={i} style={{ fontSize: 10, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '16px 10px 4px', fontWeight: 600 }}>{n.section}</div>
          ) : (
            <NavLink key={i} to={n.to} state={n.state}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px 7px 8px', fontSize: 13,
                marginBottom: 1, color: (isActive && !n.state) ? colors.ink : colors.inkMuted,
                borderLeft: (isActive && !n.state) ? '2px solid ' + colors.ink : '2px solid transparent',
                fontWeight: (isActive && !n.state) ? 600 : 400, textDecoration: 'none'
              })}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '12px 16px', borderTop: '1px solid ' + colors.line }}>
          {session?.user?.email && (
            <div style={{ fontSize: 11, color: colors.inkFaint, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={session.user.email}>
              {session.user.email}
            </div>
          )}
          <button onClick={logout} style={{ ...quietLink, fontSize: 11, padding: 0, marginBottom: 6, display: 'inline-block' }}>
            Se déconnecter
          </button>
          <div style={{ fontSize: 11, color: colors.inkFaint }}>v2.0 · 2026</div>
        </div>
      </aside>
      <main style={{ flex: 1, overflow: 'auto', background: colors.bg }}>
        <Outlet />
      </main>
    </div>
  )
}
