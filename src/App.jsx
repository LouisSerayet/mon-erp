import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Projets from './pages/Projets'
import ProjetDetail from './pages/ProjetDetail'
import Clients from './pages/Clients'
import Fournisseurs from './pages/Fournisseurs'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="projets" element={<Projets />} />
        <Route path="projets/:id" element={<ProjetDetail />} />
        <Route path="clients" element={<Clients />} />
        <Route path="fournisseurs" element={<Fournisseurs />} />
      </Route>
    </Routes>
  )
}
