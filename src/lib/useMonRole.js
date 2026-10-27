import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

// Rôle de l'utilisateur connecté (voir sql/roles_utilisateurs_migration.sql
// et src/lib/roles.js) — à consommer par du futur code de restriction de
// fonctionnalités (ex. "réservé au Gérant") sans avoir à refaire une requête
// profils_utilisateurs à chaque endroit. Tant qu'aucune règle n'utilise
// encore ce hook, il sert uniquement à la page "Rôles de l'équipe" pour
// savoir si l'utilisateur courant peut y accéder.
export function useMonRole() {
  const { session } = useAuth()
  const [roleCharge, setRoleCharge] = useState(undefined)

  useEffect(() => {
    if (!session?.user?.id) return
    let annule = false
    ;(async () => {
      const { data } = await supabase.from('profils_utilisateurs').select('role').eq('user_id', session.user.id).maybeSingle()
      if (!annule) setRoleCharge(data?.role || 'Collaborateur')
    })()
    return () => { annule = true }
  }, [session?.user?.id])

  if (session === undefined) return undefined // session pas encore chargée
  if (session === null) return null // pas connecté
  return roleCharge
}
