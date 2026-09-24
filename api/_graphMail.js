// Envoi d'email via Microsoft Graph, pour les jobs serveur qui n'ont pas de
// session utilisateur (ex. api/cron-recap-factures.js) — donc pas la même
// route que api/outlook.js, qui exige requireAuth() et un jeton de session
// Supabase venant du navigateur. Même compte Outlook, même flux "app-only"
// (client credentials), juste sans tout l'habillage HTTP (req/res,
// journalisation email_send_log, limite de débit) qui n'a pas de sens pour
// un job planifié plutôt qu'un clic utilisateur.
//
// Volontairement un module à part plutôt qu'un refactor d'outlook.js — ce
// dernier est déjà en production (boutons "Relancer", envoi facture/devis),
// pas de raison d'y toucher pour ce nouveau besoin.

export async function envoyerMailGraph({ tenantId, clientId, clientSecret, senderEmail, to, subject, htmlBody }) {
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
    throw new Error('Jeton Microsoft refusé : ' + (tokenData.error_description || JSON.stringify(tokenData)))
  }

  const toList = String(to || '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
  const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: htmlBody },
        toRecipients: toList.map(a => ({ emailAddress: { address: a } })),
      },
      saveToSentItems: true,
    }),
  })

  if (!sendRes.ok) {
    let details = null
    try { details = await sendRes.json() } catch { /* pas de corps JSON exploitable */ }
    const messageDetaille = details?.error ? `[${details.error.code}] ${details.error.message}` : JSON.stringify(details)
    throw new Error('Microsoft Graph a refusé l\'envoi : ' + messageDetaille)
  }
}
