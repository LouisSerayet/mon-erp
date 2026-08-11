import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { DataProvider } from './DataContext'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'

// Chargement différé : chaque page n'est téléchargée que lorsqu'on y
// accède, au lieu de tout charger d'un bloc au premier écran — utile
// surtout sur mobile/4G où le premier chargement compte. Login reste en
// chargement immédiat car c'est le tout premier écran vu par quelqu'un de
// non connecté, pas la peine de lui ajouter un aller-retour réseau.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Projets = lazy(() => import('./pages/Projets'))
const ProjetDetail = lazy(() => import('./pages/ProjetDetail'))
const Devis = lazy(() => import('./pages/Devis'))
const Clients = lazy(() => import('./pages/Clients'))
const Fournisseurs = lazy(() => import('./pages/Fournisseurs'))
const Depenses = lazy(() => import('./pages/Depenses'))
const Resultat = lazy(() => import('./pages/Resultat'))
const Tresorerie = lazy(() => import('./pages/Tresorerie'))
const Rapprochement = lazy(() => import('./pages/Rapprochement'))
const Corbeille = lazy(() => import('./pages/Corbeille'))
const Historique = lazy(() => import('./pages/Historique'))
const Exports = lazy(() => import('./pages/Exports'))

function ChargementPage() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
      Chargement...
    </div>
  )
}

function Gate() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
        Chargement...
      </div>
    )
  }

  if (!session) return <Login />

  return (
    <DataProvider>
      <Suspense fallback={<ChargementPage />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="projets" element={<Projets />} />
            <Route path="projets/:id" element={<ProjetDetail />} />
            <Route path="devis" element={<Devis />} />
            <Route path="clients" element={<Clients />} />
            <Route path="fournisseurs" element={<Fournisseurs />} />
            <Route path="depenses" element={<Depenses />} />
            <Route path="resultat" element={<Resultat />} />
            <Route path="tresorerie" element={<Tresorerie />} />
            <Route path="rapprochement" element={<Rapprochement />} />
            <Route path="corbeille" element={<Corbeille />} />
            <Route path="historique" element={<Historique />} />
            <Route path="exports" element={<Exports />} />
          </Route>
        </Routes>
      </Suspense>
    </DataProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
