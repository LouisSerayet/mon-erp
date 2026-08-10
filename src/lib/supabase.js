import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mpxhdkhayoxjzqsagkhp.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1weGhka2hheW94anpxc2Fna2hwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NTg4MjIsImV4cCI6MjA5NzQzNDgyMn0.ohbwRkOCazVHp007ZD01xq2RJn9gSkeEEMtaeMsmX68'

// persistSession: true — la connexion est gardée entre les rechargements de
// page (recharger ne redemande plus le mot de passe). La déconnexion se
// fait uniquement après 10 min d'inactivité (voir AuthContext.jsx) ou en
// cliquant sur "Se déconnecter".
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
  },
})
