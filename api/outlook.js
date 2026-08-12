import { requireAuth } from './_auth.js'

// Envoi d'email via le compte Outlook (Microsoft 365) de Louis, utilisé par
// les boutons "Relancer" du Dashboard (et plus tard, envoi de devis/factures)
// — remplace le simple lien mailto qui se contentait d'ouvrir la messagerie
// par défaut sans jamais envoyer quoi que ce soit automatiquement.
//
// Authentification "app-only" (client credentials) auprès de Microsoft
// Graph : un jeu d'identifiants Azure AD à configurer une seule fois, pas de
// connexion interactive ni de jeton de rafraîchissement à renouveler. Voir
// les instructions de configuration transmises séparément (App registration
// Azure + variables d'environnement Vercel ci-dessous).
export default async function handler(req, res) {
  // Seul un utilisateur connecté à l'ERP peut déclencher un envoi — sans ce
  // contrôle, l'URL publique du site suffirait à envoyer des emails depuis
  // la boîte Outlook de la société.
  const user = await requireAuth(req, res)
  if (!user) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }

  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  const senderEmail = process.env.OUTLOOK_SENDER_EMAIL

  if (!tenantId || !clientId || !clientSecret || !senderEmail) {
    return res.status(500).json({
      error: 'Connexion Outlook non configurée (variables AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / OUTLOOK_SENDER_EMAIL manquantes sur Vercel).',
    })
  }

  const { to, subject, body, cc } = req.body || {}
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'to, subject et body sont requis.' })
  }

  try {
    // 1) Jeton d'application (client credentials) auprès d'Azure AD.
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || !tokenData.access_token) {
      return res.status(502).json({ error: 'Impossible de récupérer un jeton Microsoft.', details: tokenData.error_description || tokenData })
    }

    // 2) Envoi via Microsoft Graph, "au nom de" la boîte configurée.
    const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'Text', content: body },
          toRecipients: [{ emailAddress: { address: to } }],
          ...(cc ? { ccRecipients: [{ emailAddress: { address: cc } }] } : {}),
        },
        saveToSentItems: true,
      }),
    })

    if (!sendRes.ok) {
      let details = null
      try { details = await sendRes.json() } catch { /* pas de corps JSON exploitable */ }
      return res.status(502).json({ error: 'Microsoft Graph a refusé l\'envoi.', details: details?.error?.message || details })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
