import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useIsMobile } from '../lib/useIsMobile'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: '◻' },
  { to: '/projets', label: 'Projets', icon: '📋' },
  { to: '/devis', label: 'Devis', icon: '📝' },
  { to: '/tresorerie', label: 'Trésorerie', icon: '🏦' },
  { section: 'Infos & Données' },
  { to: '/clients', label: 'Clients', icon: '👤' },
  { to: '/fournisseurs', label: 'Fournisseurs', icon: '🏢' },
  { to: '/corbeille', label: 'Corbeille', icon: '🗑' },
  { to: '/historique', label: 'Historique', icon: '🕓' },
]

// Sur mobile, seuls les 3 usages "coup d'œil rapide" ont leur propre onglet
// dans la barre du bas — le reste (Devis, Clients, Fournisseurs) est
// regroupé derrière "Plus" pour ne pas surcharger une barre pensée pour un
// pouce, pas pour une souris.
const NAV_MOBILE_PRINCIPALE = nav.filter(n => n.to && ['/dashboard', '/projets', '/tresorerie'].includes(n.to))
const NAV_MOBILE_PLUS = nav.filter(n => n.to && !['/dashboard', '/projets', '/tresorerie'].includes(n.to))

export default function Layout() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const isMobile = useIsMobile()
  const [plusOuvert, setPlusOuvert] = useState(false)

  async function logout() {
    await supabase.auth.signOut()
  }

  if (isMobile) {
    const linkStyle = ({ isActive }) => ({
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      flex: 1, padding: '6px 4px', color: isActive ? '#185FA5' : '#8A8A8A',
      textDecoration: 'none', fontSize: 10, fontWeight: isActive ? 600 : 400,
    })
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        <main style={{ flex: 1, overflow: 'auto', background: '#f5f5f0', WebkitOverflowScrolling: 'touch' }}>
          <Outlet />
        </main>

        {plusOuvert && (
          <div onClick={() => setPlusOuvert(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 20, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: '#fff', width: '100%', borderRadius: '16px 16px 0 0', padding: '10px 0 calc(10px + env(safe-area-inset-bottom))', boxShadow: '0 -4px 24px rgba(0,0,0,0.15)' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E5E7EB', margin: '4px auto 12px' }} />
              {NAV_MOBILE_PLUS.map(n => (
                <NavLink key={n.to} to={n.to} onClick={() => setPlusOuvert(false)}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px',
                    fontSize: 15, color: isActive ? '#185FA5' : '#1a1a1a', textDecoration: 'none',
                    fontWeight: isActive ? 600 : 400,
                  })}>
                  <span style={{ fontSize: 18 }}>{n.icon}</span>{n.label}
                </NavLink>
              ))}
              <div style={{ borderTop: '1px solid #F3F4F6', margin: '8px 0' }} />
              {session?.user?.email && (
                <div style={{ padding: '6px 20px', fontSize: 12, color: '#9CA3AF' }}>{session.user.email}</div>
              )}
              <button onClick={logout}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '13px 20px', fontSize: 15, color: '#DC2626', background: 'none', border: 'none' }}>
                <span style={{ fontSize: 18 }}>↩</span>Se déconnecter
              </button>
            </div>
          </div>
        )}

        <nav style={{
          display: 'flex', background: '#fff', borderTop: '1px solid #e5e5e5',
          paddingBottom: 'env(safe-area-inset-bottom)', flexShrink: 0,
        }}>
          {NAV_MOBILE_PRINCIPALE.map(n => (
            <NavLink key={n.to} to={n.to} style={linkStyle}>
              <span style={{ fontSize: 20 }}>{n.icon}</span>{n.label}
            </NavLink>
          ))}
          <button onClick={() => setPlusOuvert(true)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1, padding: '6px 4px', background: 'none', border: 'none', color: plusOuvert ? '#185FA5' : '#8A8A8A', fontSize: 10, fontWeight: plusOuvert ? 600 : 400 }}>
            <span style={{ fontSize: 20 }}>⋯</span>Plus
          </button>
        </nav>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside style={{ width: 210, background: '#fff', borderRight: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div onClick={() => navigate('/dashboard')} style={{ padding: '18px 16px', borderBottom: '1px solid #e5e5e5', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
          <img src="/logo-pp.png" alt="Partenaires Particuliers" style={{ height: 30, width: 'auto', display: 'block' }} />
          <div style={{ fontSize: 10, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>Partenaires Particuliers</div>
        </div>
        <nav style={{ padding: '8px', flex: 1, overflow: 'auto' }}>
          {nav.map((n, i) => n.section ? (
            <div key={i} style={{ fontSize: 10, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '16px 10px 4px', fontWeight: 500 }}>{n.section}</div>
          ) : (
            <NavLink key={n.to} to={n.to}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 6, fontSize: 13,
                marginBottom: 1, color: isActive ? '#185FA5' : '#555',
                background: isActive ? '#E6F1FB' : 'transparent',
                fontWeight: isActive ? 500 : 400, textDecoration: 'none'
              })}>
              <span style={{ fontSize: 14 }}>{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e5e5' }}>
          {session?.user?.email && (
            <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={session.user.email}>
              {session.user.email}
            </div>
          )}
          <button onClick={logout} style={{ fontSize: 11, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 6 }}>
            ↩ Se déconnecter
          </button>
          <div style={{ fontSize: 11, color: '#ccc' }}>v2.0 · 2026</div>
        </div>
      </aside>
      <main style={{ flex: 1, overflow: 'auto', background: '#f5f5f0' }}>
        <Outlet />
      </main>
    </div>
  )
}
