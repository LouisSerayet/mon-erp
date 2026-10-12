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
const Clients = lazy(() => import('./pages/Clients'))
const Fournisseurs = lazy(() => import('./pages/Fournisseurs'))
const FacturesClients = lazy(() => import('./pages/FacturesClients'))
const FacturesFournisseurs = lazy(() => import('./pages/FacturesFournisseurs'))
const CommandesFournisseurs = lazy(() => import('./pages/CommandesFournisseurs'))
const Recherche = lazy(() => import('./pages/Recherche'))
const Depenses = lazy(() => import('./pages/Depenses'))
const Tresorerie = lazy(() => import('./pages/Tresorerie'))
const Corbeille = lazy(() => import('./pages/Corbeille'))
const Historique = lazy(() => import('./pages/Historique'))
const Exports = lazy(() => import('./pages/Exports'))
const BoiteReceptionFactures = lazy(() => import('./pages/BoiteReceptionFactures'))
const Parametres = lazy(() => import('./pages/Parametres'))

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
            {/* Ancien onglet "Devis" fusionné dans Projets (un projet démarre
                directement en devis, statut "Brouillon") — on garde une
                redirection pour les anciens liens/favoris. */}
            <Route path="devis" element={<Navigate to="/projets" replace />} />
            <Route path="clients" element={<Clients />} />
            <Route path="fournisseurs" element={<Fournisseurs />} />
            <Route path="factures-clients" element={<FacturesClients />} />
            <Route path="factures-fournisseurs" element={<FacturesFournisseurs />} />
            <Route path="commandes-fournisseurs" element={<CommandesFournisseurs />} />
            <Route path="boite-reception-factures" element={<BoiteReceptionFactures />} />
            <Route path="recherche" element={<Recherche />} />
            <Route path="depenses" element={<Depenses />} />
            {/* Trésorerie regroupe maintenant Comptes/TVA/Rapprochement/
                Compte de résultat en onglets (voir Tresorerie.jsx) — les
                anciennes pages séparées /resultat et /rapprochement
                redirigent vers l'onglet correspondant pour préserver les
                favoris/liens existants (même principe que la redirection
                /devis -> /projets ci-dessus). */}
            <Route path="tresorerie" element={<Navigate to="/tresorerie/comptes" replace />} />
            <Route path="tresorerie/:tab" element={<Tresorerie />} />
            <Route path="resultat" element={<Navigate to="/tresorerie/resultat" replace />} />
            <Route path="rapprochement" element={<Navigate to="/tresorerie/rapprochement" replace />} />
            <Route path="corbeille" element={<Corbeille />} />
            <Route path="historique" element={<Historique />} />
            <Route path="exports" element={<Exports />} />
            <Route path="parametres" element={<Parametres />} />
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
