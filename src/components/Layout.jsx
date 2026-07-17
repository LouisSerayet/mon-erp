import { NavLink, Outlet, useNavigate } from 'react-router-dom'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: '◻' },
  { to: '/projets', label: 'Projets', icon: '📋' },
  { to: '/tresorerie', label: 'Trésorerie', icon: '🏦' },
  { section: 'Infos & Données' },
  { to: '/clients', label: 'Clients', icon: '👤' },
  { to: '/fournisseurs', label: 'Fournisseurs', icon: '🏢' },
]

export default function Layout() {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside style={{ width: 210, background: '#fff', borderRight: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div onClick={() => navigate('/dashboard')} style={{ padding: '18px 16px', borderBottom: '1px solid #e5e5e5', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: -1, color: '#1a1a1a' }}>PP</div>
          <div style={{ fontSize: 10, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 1 }}>Partenaires Particuliers</div>
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
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e5e5', fontSize: 11, color: '#ccc' }}>v2.0 · 2026</div>
      </aside>
      <main style={{ flex: 1, overflow: 'auto', background: '#f5f5f0' }}>
        <Outlet />
      </main>
    </div>
  )
}
