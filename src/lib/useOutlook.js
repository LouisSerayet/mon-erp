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
// configurée côté serveur, SANS l'envoyer. Le brouillon est créé
// directement dans la vraie boîte Outlook de Louis (voir OUTLOOK_SENDER_EMAIL
// côté api/outlook.js) : il apparaît donc de lui-même dans le dossier
// Brouillons, aussi bien dans l'app de bureau que sur le web, sans qu'on ait
// besoin d'ouvrir quoi que ce soit depuis ici. Le webLink renvoyé par
// Microsoft Graph pointe toujours vers Outlook sur le web (OWA) — Graph ne
// fournit aucun moyen fiable d'ouvrir un brouillon précis dans l'app de
// bureau — donc l'appelant ne doit PAS l'ouvrir automatiquement dans un
// onglet (voir ProjetDetail.jsx, creerBrouillonEmailDepuisModal). Alternative
// au "mailto:" qui ouvre la messagerie par défaut du système (pas forcément
// Outlook) et ne permet pas de joindre de fichier.
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
