// Vérifie que la requête vient bien d'un utilisateur connecté à l'ERP,
// avant d'autoriser l'accès aux proxys Qonto/Pennylane. Sans ce contrôle,
// ces deux fonctions serverless étaient appelables directement par
// n'importe qui connaissant l'URL du site (elle est publique), ce qui
// donnait un accès en lecture aux transactions bancaires et en
// lecture/écriture à la comptabilité Pennylane sans jamais passer par la
// connexion de l'ERP.
//
// Le front (src/lib/useQonto.js, src/lib/usePennylane.js) envoie le jeton
// de session Supabase de l'utilisateur connecté dans l'en-tête
// "Authorization: Bearer <token>". On vérifie ce jeton auprès de Supabase
// avec la clé publique (anon) — c'est la même clé que celle utilisée côté
// navigateur, elle ne donne aucun accès supplémentaire ; seule la
// vérification du jeton compte ici.
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mpxhdkhayoxjzqsagkhp.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1weGhka2hheW94anpxc2Fna2hwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NTg4MjIsImV4cCI6MjA5NzQzNDgyMn0.ohbwRkOCazVHp007ZD01xq2RJn9gSkeEEMtaeMsmX68'

export async function requireAuth(req, res) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Non autorisé — connecte-toi à l\'ERP.' })
    return null
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    res.status(401).json({ error: 'Session invalide ou expirée — reconnecte-toi à l\'ERP.' })
    return null
  }
  return data.user
}
