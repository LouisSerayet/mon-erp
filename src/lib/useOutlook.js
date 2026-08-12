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
//
// attachments (optionnel) : tableau de { name, contentType, contentBytes }
// — contentBytes en base64 pur (pas de préfixe data:...;base64,). Utilisé
// pour joindre automatiquement le PDF d'une facture/commande à l'envoi.
export async function envoyerEmailOutlook({ to, subject, body, cc, attachments }) {
  const res = await fetch('/api/outlook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ to, subject, body, cc, attachments }),
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

// Crée un brouillon dans le dossier Brouillons de la boîte Outlook
// configurée côté serveur, SANS l'envoyer, et renvoie son webLink — à
// ouvrir dans un nouvel onglet pour que Louis retrouve le message
// directement dans Outlook (web ou app) et l'envoie lui-même quand il le
// souhaite. Alternative au "mailto:" qui ouvre la messagerie par défaut du
// système (pas forcément Outlook) et ne permet pas de joindre de fichier.
export async function creerBrouillonOutlook({ to, subject, body, cc, attachments }) {
  const res = await fetch('/api/outlook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ to, subject, body, cc, attachments, draftOnly: true }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    const message = data?.details
      ? (typeof data.details === 'string' ? data.details : JSON.stringify(data.details))
      : (data?.error || 'Erreur inconnue lors de la création du brouillon.')
    throw new Error(message)
  }
  const data = await res.json()
  return data.webLink
}
