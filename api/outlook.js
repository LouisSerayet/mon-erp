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

  // attachments : tableau optionnel de pièces jointes déjà encodées en
  // base64 côté client (ex. PDF de facture/commande généré avec jsPDF), au
  // format attendu par Microsoft Graph — voir construction ci-dessous.
  //
  // draftOnly : si true, on ne fait qu'enregistrer le message dans le
  // dossier Brouillons de la boîte configurée (sans l'envoyer) et on
  // renvoie son webLink — pratique pour ouvrir directement le brouillon
  // dans Outlook (web ou app) et laisser Louis l'envoyer lui-même depuis
  // là, plutôt que de forcer un envoi automatique.
  const { to, subject, body, cc, attachments, draftOnly } = req.body || {}
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'to, subject et body sont requis.' })
  }

  const messagePayload = {
    subject,
    body: { contentType: 'Text', content: body },
    toRecipients: [{ emailAddress: { address: to } }],
    ...(cc ? { ccRecipients: [{ emailAddress: { address: cc } }] } : {}),
    ...(Array.isArray(attachments) && attachments.length > 0 ? {
      attachments: attachments.map(a => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.name,
        contentType: a.contentType || 'application/pdf',
        contentBytes: a.contentBytes,
      })),
    } : {}),
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
      console.error('Outlook: échec récupération du jeton', tokenRes.status, JSON.stringify(tokenData))
      return res.status(502).json({ error: 'Impossible de récupérer un jeton Microsoft.', details: tokenData.error_description || tokenData })
    }

    if (draftOnly) {
      // 2a) Création d'un brouillon (dossier Drafts de la boîte configurée)
      // — POST /messages sans passer par /sendMail équivaut à enregistrer
      // un brouillon. On renvoie son webLink pour l'ouvrir directement.
      const draftRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagePayload),
      })
      if (!draftRes.ok) {
        let details = null
        try { details = await draftRes.json() } catch { /* pas de corps JSON exploitable */ }
        // Log complet côté serveur (visible dans Vercel > Logs) pour
        // diagnostiquer les refus Graph — le message renvoyé au client est
        // volontairement résumé, mais le code d'erreur Graph (ex.
        // ErrorAccessDenied) et l'éventuel innerError donnent la vraie cause.
        console.error('Outlook draft refusé par Graph', draftRes.status, JSON.stringify(details))
        const messageDetaille = details?.error ? `[${details.error.code}] ${details.error.message}` : details
        return res.status(502).json({ error: 'Microsoft Graph a refusé la création du brouillon.', details: messageDetaille })
      }
      const draftData = await draftRes.json()
      return res.status(200).json({ ok: true, webLink: draftData.webLink, id: draftData.id })
    }

    // 2b) Envoi direct via Microsoft Graph, "au nom de" la boîte configurée.
    const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: messagePayload, saveToSentItems: true }),
    })

    if (!sendRes.ok) {
      let details = null
      try { details = await sendRes.json() } catch { /* pas de corps JSON exploitable */ }
      // Log complet côté serveur (visible dans Vercel > Logs) pour
      // diagnostiquer les refus Graph — le message renvoyé au client est
      // volontairement résumé, mais le code d'erreur Graph (ex.
      // ErrorAccessDenied) et l'éventuel innerError donnent la vraie cause.
      console.error('Outlook sendMail refusé par Graph', sendRes.status, JSON.stringify(details))
      const messageDetaille = details?.error ? `[${details.error.code}] ${details.error.message}` : details
      return res.status(502).json({ error: 'Microsoft Graph a refusé l\'envoi.', details: messageDetaille })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
