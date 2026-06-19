import { NavLink, Outlet } from 'react-router-dom'

const nav = [
  { to: '/dashboard', label: 'Tableau de bord', icon: '◻' },
  { to: '/projets', label: 'Projets', icon: '📋' },
  { to: '/fournisseurs', label: 'Fournisseurs', icon: '🏢' },
  { to: '/commandes', label: 'Commandes frs', icon: '🛒' },
  { to: '/factures-frs', label: 'Factures frs', icon: '📄' },
  { to: '/factures-cli', label: 'Factures clients', icon: '💶' },
]

export default function Layout() {
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px', fontWeight: 600, fontSize: 16, borderBottom: '1px solid #e5e5e5' }}>
          Mon ERP
        </div>
        <nav style={{ padding: 8, flex: 1 }}>
          {nav.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 6, fontSize: 13,
                marginBottom: 2, color: isActive ? '#185FA5' : '#555',
                background: isActive ? '#E6F1FB' : 'transparent',
                fontWeight: isActive ? 500 : 400, textDecoration: 'none'
              })}
            >
              <span>{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e5e5', fontSize: 12, color: '#aaa' }}>
          Mon ERP v1.0
        </div>
      </aside>
      <main style={{ flex: 1, overflow: 'auto', background: '#f5f5f0' }}>
        <Outlet />
      </main>
    </div>
  )
}
