import { Routes, Route, Navigate } from 'react-router-dom'
import { DataProvider } from './DataContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Projets from './pages/Projets'
import ProjetDetail from './pages/ProjetDetail'
import Clients from './pages/Clients'
import Fournisseurs from './pages/Fournisseurs'
import Tresorerie from './pages/Tresorerie'

export default function App() {
  return (
    <DataProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="projets" element={<Projets />} />
          <Route path="projets/:id" element={<ProjetDetail />} />
          <Route path="clients" element={<Clients />} />
          <Route path="fournisseurs" element={<Fournisseurs />} />
          <Route path="tresorerie" element={<Tresorerie />} />
        </Route>
      </Routes>
    </DataProvider>
  )
}
