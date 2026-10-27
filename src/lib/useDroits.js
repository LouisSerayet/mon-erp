import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useMonRole } from './useMonRole'

// Droits actifs pour le rôle de l'utilisateur connecté (voir
// sql/droits_roles_migration.sql et src/lib/droits.js). Tant que le rôle
// ou les droits ne sont pas encore chargés, aDroit() renvoie false par
// défaut — on cache l'action plutôt que de la montrer à tort le temps du
// chargement.
export function useDroits() {
  const monRole = useMonRole()
  const [actifsCharges, setActifsCharges] = useState(null) // null = pas encore chargé

  useEffect(() => {
    if (!monRole) return // undefined (session pas encore chargée) ou null (pas connecté) : rien à charger
    let annule = false
    ;(async () => {
      const { data } = await supabase.from('droits_roles').select('droit').eq('role', monRole).eq('actif', true)
      if (!annule) setActifsCharges(new Set((data || []).map(d => d.droit)))
    })()
    return () => { annule = true }
  }, [monRole])

  const actifs = actifsCharges || new Set()
  return { aDroit: cle => actifs.has(cle), charge: monRole === null || actifsCharges !== null }
}
