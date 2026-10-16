import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
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
const Financier = lazy(() => import('./pages/Financier'))
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

// <Navigate> exige une cible "to" statique — pour préserver un lien du
// type /tresorerie/<tab> (ancienne URL par onglet, avant la fusion dans
// Financier) sans perdre l'onglet demandé, il faut lire :tab et choisir
// la cible dynamiquement, d'où ce petit composant au lieu d'une simple
// <Route element={<Navigate .../>} />.
function RedirectTresorerieTab() {
  const { tab } = useParams()
  return <Navigate to={'/financier/' + (tab || 'comptes')} replace />
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
            {/* Financier (ex-"Trésorerie") regroupe Comptes/TVA/
                Rapprochement/Compte de résultat/Dépenses en onglets (voir
                Financier.jsx — Dépenses était avant une page séparée,
                /depenses, fusionnée ici comme un onglet de plus). Les
                anciennes URLs (/tresorerie, /tresorerie/:tab, /resultat,
                /rapprochement, /depenses) redirigent vers l'onglet
                correspondant pour préserver les favoris/liens existants
                (même principe que la redirection /devis -> /projets
                ci-dessus). */}
            <Route path="financier" element={<Navigate to="/financier/comptes" replace />} />
            <Route path="financier/:tab" element={<Financier />} />
            <Route path="tresorerie" element={<Navigate to="/financier/comptes" replace />} />
            <Route path="tresorerie/:tab" element={<RedirectTresorerieTab />} />
            <Route path="resultat" element={<Navigate to="/financier/resultat" replace />} />
            <Route path="rapprochement" element={<Navigate to="/financier/rapprochement" replace />} />
            <Route path="depenses" element={<Navigate to="/financier/depenses" replace />} />
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
