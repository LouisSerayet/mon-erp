import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Projets from './pages/Projets'
import Fournisseurs from './pages/Fournisseurs'
import Commandes from './pages/Commandes'
import FacturesFrs from './pages/FacturesFrs'
import FacturesCli from './pages/FacturesCli'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/projets" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="projets" element={<Projets />} />
        <Route path="fournisseurs" element={<Fournisseurs />} />
        <Route path="commandes" element={<Commandes />} />
        <Route path="factures-frs" element={<FacturesFrs />} />
        <Route path="factures-cli" element={<FacturesCli />} />
      </Route>
    </Routes>
  )
}
