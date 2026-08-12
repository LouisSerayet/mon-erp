import { supabase } from './supabase'

// Le proxy /api/outlook exige d'être connecté à l'ERP (voir api/_auth.js) —
// même principe que useQonto.js / usePennylane.js.
async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Envoie un email depuis le compte Outlook configuré côté serveur (voir
// api/outlook.js). Lève une erreur explicite (message lisible) si la
// connexion Outlook n'est pas encore configurée ou si l'envoi échoue, pour
// que l'UI puisse proposer un repli (ex. lien mailto) plutôt que de planter
// silencieusement.
export async function envoyerEmailOutlook({ to, subject, body, cc }) {
  const res = await fetch('/api/outlook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ to, subject, body, cc }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    const message = data?.details
      ? (typeof data.details === 'string' ? data.details : JSON.stringify(data.details))
      : (data?.error || 'Erreur inconnue lors de l\'envoi.')
    throw new Error(message)
  }
  return true
}
