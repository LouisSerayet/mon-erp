import { createClient } from '@supabase/supabase-js'
import { envoyerMailGraph } from './_graphMail.js'

// Récap quotidien des factures clients en cours (non payées) — voir
// vercel.json pour l'horaire (actuellement "0 5 * * *" = 5h UTC, soit 7h à
// Paris en heure d'été/CEST et 6h en heure d'hiver/CET — un planning cron
// est fixe en UTC, il ne suit pas le changement d'heure tout seul). Sur le
// plan Vercel Hobby, l'horaire n'est de toute façon garanti qu'à l'heure
// près (déclenchement entre 5h00 et 5h59 UTC) ; le plan Pro donne une
// précision à la minute — voir https://vercel.com/docs/cron-jobs/usage-and-pricing.
// Déclenché par le planificateur de cron de Vercel (aucune session
// utilisateur), donc :
//   - authentification différente de api/outlook.js : on vérifie
//     l'en-tête Authorization envoyé automatiquement par Vercel contre
//     CRON_SECRET (voir https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs),
//     pas un jeton de session Supabase ;
//   - lecture des données via la clé service_role (contourne les policies
//     RLS "authenticated", puisqu'il n'y a justement personne
//     d'authentifié ici) — jamais exposée au navigateur, uniquement une
//     variable d'environnement Vercel côté serveur.
//
// Contenu du mail : toutes les factures clients "en cours" (statut À
// envoyer/Envoyée), avec le nombre de jours de retard pour celles dont
// l'échéance est dépassée. Les avoirs (type_facture='avoir') sont exclus —
// ce sont des notes de crédit, pas des sommes à encaisser, la notion de
// "retard" n'a pas de sens pour eux.

const EMAIL_DESTINATAIRE = 'lserayet@partenaires-particuliers.com'

function joursDeRetard(dateEcheance) {
  if (!dateEcheance) return null
  const jours = Math.floor((new Date() - new Date(dateEcheance)) / 86400000)
  return jours > 0 ? jours : null
}

function fmtEuros(n) {
  return Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function fmtDateFr(d) {
  return d ? new Date(d).toLocaleDateString('fr-FR') : '—'
}

function construireTableauHtml(factures) {
  const lignes = factures.map(f => {
    const retard = joursDeRetard(f.date_echeance)
    const couleurRetard = retard ? '#c0392b' : '#555'
    return `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;">${f.clients?.nom || '—'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;">${f.projets?.nom || '—'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-family:monospace;">${f.numero || '—'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;text-align:right;font-family:monospace;">${fmtEuros(f.montant_ht)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;">${fmtDateFr(f.date_echeance)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;">${f.statut}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;text-align:right;color:${couleurRetard};font-weight:${retard ? '600' : '400'};">${retard ? retard + ' j' : '—'}</td>
      </tr>`
  }).join('')

  return `
    <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:6px 10px;text-align:left;">Client</th>
          <th style="padding:6px 10px;text-align:left;">Projet</th>
          <th style="padding:6px 10px;text-align:left;">N° facture</th>
          <th style="padding:6px 10px;text-align:right;">Montant HT</th>
          <th style="padding:6px 10px;text-align:left;">Échéance</th>
          <th style="padding:6px 10px;text-align:left;">Statut</th>
          <th style="padding:6px 10px;text-align:right;">Retard</th>
        </tr>
      </thead>
      <tbody>${lignes}</tbody>
    </table>`
}

export default async function handler(req, res) {
  // Vercel envoie automatiquement "Authorization: Bearer <CRON_SECRET>" pour
  // ses propres invocations planifiées — voir vercel.json. Sans ce contrôle,
  // l'URL (publique) suffirait à déclencher l'envoi depuis n'importe où.
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.authorization || ''
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Non autorisé.' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://mpxhdkhayoxjzqsagkhp.supabase.co'
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  const senderEmail = process.env.OUTLOOK_SENDER_EMAIL

  if (!serviceRoleKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante sur Vercel.' })
  }
  if (!tenantId || !clientId || !clientSecret || !senderEmail) {
    return res.status(500).json({ error: 'Connexion Outlook non configurée (variables AZURE_*/OUTLOOK_SENDER_EMAIL manquantes).' })
  }

  const db = createClient(supabaseUrl, serviceRoleKey)

  try {
    const { data: factures, error } = await db.from('factures_cli')
      .select('*, projets(nom), clients(nom)')
      .is('deleted_at', null)
      .in('statut', ['À envoyer', 'Envoyée'])
      .neq('type_facture', 'avoir')
      .order('date_echeance', { ascending: true })
    if (error) throw error

    const fData = factures || []
    // Retard d'abord (le plus en retard en tête), puis le reste par échéance
    // croissante (déjà l'ordre de la requête) — un simple tri stable sur
    // "a du retard ou non" suffit à faire remonter l'urgent sans perturber
    // l'ordre par échéance à l'intérieur de chaque groupe.
    const enRetard = fData.filter(f => joursDeRetard(f.date_echeance) !== null).sort((a, b) => joursDeRetard(b.date_echeance) - joursDeRetard(a.date_echeance))
    const aVenir = fData.filter(f => joursDeRetard(f.date_echeance) === null)
    const facturesTriees = [...enRetard, ...aVenir]

    const totalHt = fData.reduce((s, f) => s + (f.montant_ht || 0), 0)
    const totalEnRetardHt = enRetard.reduce((s, f) => s + (f.montant_ht || 0), 0)
    const aujourdhui = new Date().toLocaleDateString('fr-FR')

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">
        <p>Récap factures clients en cours au ${aujourdhui} :</p>
        <ul>
          <li><strong>${fData.length}</strong> facture(s) en cours, pour un total de <strong>${fmtEuros(totalHt)}</strong> HT</li>
          <li><strong>${enRetard.length}</strong> en retard de paiement, pour <strong>${fmtEuros(totalEnRetardHt)}</strong> HT</li>
        </ul>
        ${fData.length > 0 ? construireTableauHtml(facturesTriees) : '<p>Aucune facture client en cours — RAS.</p>'}
      </div>`

    await envoyerMailGraph({
      tenantId, clientId, clientSecret, senderEmail,
      to: EMAIL_DESTINATAIRE,
      subject: `Récap factures clients — ${aujourdhui}${enRetard.length > 0 ? ' (' + enRetard.length + ' en retard)' : ''}`,
      htmlBody,
    })

    // Best-effort : une erreur de journalisation ne doit jamais faire
    // échouer le job alors que le mail est déjà parti — même principe que
    // api/outlook.js.
    try {
      await db.from('email_send_log').insert([{
        user_id: null, user_email: 'cron-recap-factures', destinataire: EMAIL_DESTINATAIRE,
        sujet: 'Récap factures clients — ' + aujourdhui, brouillon: false,
      }])
    } catch (logErr) {
      console.error('email_send_log: échec de la journalisation', logErr.message)
    }

    return res.status(200).json({ ok: true, nbFactures: fData.length, nbEnRetard: enRetard.length })
  } catch (err) {
    console.error('cron-recap-factures: échec', err.message)
    return res.status(500).json({ error: err.message })
  }
}
