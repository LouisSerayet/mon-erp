import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

// Déconnexion automatique après ce délai d'inactivité (souris, clavier,
// tactile, scroll) — redemande le mot de passe si quelqu'un laisse l'ERP
// ouvert sans surveillance (ex: onglet oublié sur un poste partagé).
const IDLE_TIMEOUT_MS = 10 * 60 * 1000

export function AuthProvider({ children }) {
  // undefined = session pas encore chargée, null = pas connecté, objet = connecté
  const [session, setSession] = useState(undefined)
  // Initialisé à null puis renseigné dans l'effet ci-dessous (via
  // markActive) au lieu d'appeler Date.now() ici — un ref ne doit pas être
  // initialisé avec le résultat d'un appel impur pendant le rendu.
  const lastActivityRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  const isLoggedIn = Boolean(session)

  useEffect(() => {
    // Dépend uniquement du booléen connecté/déconnecté, pas de l'objet
    // `session` lui-même : Supabase rafraîchit le token en tâche de fond
    // (événement TOKEN_REFRESHED) sans aucune action de l'utilisateur, ce
    // qui recréerait un nouvel objet `session` — si l'effet en dépendait,
    // le timer d'inactivité serait réinitialisé à chaque refresh silencieux
    // et ne se déclencherait donc jamais, même après des heures sans que
    // personne ne touche à l'app.
    if (!isLoggedIn) return

    function markActive() { lastActivityRef.current = Date.now() }
    markActive()

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel']
    events.forEach(e => window.addEventListener(e, markActive, { passive: true }))

    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
        supabase.auth.signOut()
      }
    }, 15000)

    return () => {
      events.forEach(e => window.removeEventListener(e, markActive))
      clearInterval(interval)
    }
  }, [isLoggedIn])

  return (
    <AuthContext.Provider value={{ session, loading: session === undefined }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
