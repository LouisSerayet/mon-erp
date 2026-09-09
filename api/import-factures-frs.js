import { requireAuth, authedClient } from './_auth.js'
import { extractText, getDocumentProxy } from 'unpdf'
// unpdf plutôt que pdf-parse (v2) : ce dernier embarque pdfjs-dist en mode
// "legacy" qui tente de charger @napi-rs/canvas (module natif) au chargement
// même, pour des polyfills DOMMatrix/ImageData/Path2D dont on n'a pas besoin
// pour de la simple extraction de texte — absent sur Vercel, ça fait planter
// toute la fonction serverless avant même d'envoyer une réponse ("Erreur
// inconnue" côté client, cf. logs Vercel : "ReferenceError: DOMMatrix is not
// defined"). unpdf est conçu pour tourner dans des environnements serverless
// sans dépendance native.

// Boîte de réception des factures fournisseurs par email — voir
// sql/factures_frs_a_traiter_migration.sql pour le contexte général.
//
// Déclenché à la demande (bouton "Vérifier les nouvelles factures" côté
// BoiteReceptionFactures.jsx), pas par un cron : ça marche quel que soit
// l'abonnement Vercel de Louis (les cron jobs fréquents nécessitent un
// abonnement Pro), et ça lui laisse la main sur le moment où il veut voir
// arriver ses nouvelles factures plutôt qu'un traitement silencieux en
// arrière-plan.
//
// Principe : Louis (ou ses fournisseurs directement) transfèrent les
// emails de facture vers une boîte dédiée (OUTLOOK_FACTURES_MAILBOX) — on
// va y lire les messages non lus, on télécharge chaque PDF joint, on en
// extrait le texte pour y chercher le numéro de commande qu'il a
// communiqué au fournisseur (format "PP-<PROJET>-<NNN>", voir
// genNumeroCommande dans ProjetDetail.jsx), et on dépose un brouillon par
// facture dans factures_frs_a_traiter — jamais directement dans
// factures_frs, qui exige un projet et déclencherait l'envoi automatique
// vers Pennylane avant même validation par Louis (voir usePennylane.js).
export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' },
  },
  maxDuration: 60, // le max autorisé sur Hobby ; Pro peut aller plus haut mais 60s suffit largement pour un lot de quelques emails
}

// Nombre de messages traités par appel — reste raisonnable pour tenir
// dans le temps d'exécution d'une fonction Vercel (téléchargement +
// extraction de texte PDF pour chacun). Louis peut recliquer sur
// "Vérifier" s'il en reste davantage — la réponse l'indique.
const LOT_MAX = 8

// Même format que genNumeroCommande() dans ProjetDetail.jsx : "PP-" suivi
// du nom du projet nettoyé (lettres/chiffres) puis "-NNN".
const REGEX_NUMERO_COMMANDE = /\bPP-[A-Z0-9]{2,20}-\d{3}\b/i

// Numéro de facture et montant HT : contrairement au numéro de commande
// (format imposé par Louis, donc fiable), ces deux valeurs n'ont aucun
// format garanti — chaque fournisseur présente sa facture à sa façon. On
// tente quand même une extraction best-effort, mais le résultat n'est
// qu'une SUGGESTION pré-remplie côté BoiteReceptionFactures.jsx : Louis
// la revoit et la corrige à la validation, elle n'est jamais utilisée
// telle quelle. Motifs testés sur une facture réelle (AJS) : "FACTURE /
// N° F20252026-0304" et "Total HT   5 275,00 €".
const REGEX_NUMERO_FACTURE = [
  /\bfacture\s*n[°ºo]\s*[:-]?\s*([A-Za-z0-9][A-Za-z0-9/.-]{2,29})/i,
  /\bn[°ºo]\s*(?:de\s*)?facture\s*[:-]?\s*([A-Za-z0-9][A-Za-z0-9/.-]{2,29})/i,
  /\binvoice\s*(?:number|no\.?|#)\s*[:-]?\s*([A-Za-z0-9][A-Za-z0-9/.-]{2,29})/i,
]
const REGEX_MONTANT_HT = /(?:total|montant|sous[-\s]?total)\s*h\.?\s*t\.?\s*[:-]?\s*(\d[\d\s.,]*\d)(?:\s*€)?/gi

function extraireNumeroFacture(texte) {
  for (const re of REGEX_NUMERO_FACTURE) {
    const m = texte.match(re)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

function extraireMontantHT(texte) {
  const matches = [...texte.matchAll(REGEX_MONTANT_HT)]
  if (!matches.length) return null
  // La dernière occurrence correspond en général au total général
  // (après d'éventuels sous-totaux intermédiaires).
  const brut = matches[matches.length - 1][1]
  const nombre = parseFloat(brut.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(nombre) ? nombre : null
}

async function obtenirJetonGraph() {
  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Connexion Microsoft non configurée (variables AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET manquantes sur Vercel).')
  }
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
    console.error('import-factures-frs: échec récupération du jeton', tokenRes.status, JSON.stringify(tokenData))
    throw new Error('Impossible de récupérer un jeton Microsoft : ' + (tokenData.error_description || tokenRes.status))
  }
  return tokenData.access_token
}

async function grapheAppel(token, chemin, options = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${chemin}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
  if (!res.ok) {
    let details = null
    try { details = await res.json() } catch { /* pas de corps JSON exploitable */ }
    console.error('import-factures-frs: Graph a refusé', chemin, res.status, JSON.stringify(details))
    const messageDetaille = details?.error ? `[${details.error.code}] ${details.error.message}` : res.status
    throw new Error('Microsoft Graph : ' + messageDetaille)
  }
  if (res.status === 204) return null
  return res.json()
}

export default async function handler(req, res) {
  const user = await requireAuth(req, res)
  if (!user) return
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }

  const boiteEmail = process.env.OUTLOOK_FACTURES_MAILBOX
  if (!boiteEmail) {
    return res.status(500).json({ error: "Boîte de réception non configurée — ajoute OUTLOOK_FACTURES_MAILBOX dans les variables d'environnement Vercel (l'adresse dédiée où transférer les factures fournisseurs)." })
  }

  const db = authedClient(req)
  if (!db) return res.status(401).json({ error: 'Session invalide.' })

  try {
    const token = await obtenirJetonGraph()

    // Messages non lus de la boîte dédiée, les plus anciens d'abord (on
    // traite dans l'ordre d'arrivée). On limite aux champs utiles pour
    // rester léger.
    const boite = encodeURIComponent(boiteEmail)
    const liste = await grapheAppel(token, `/users/${boite}/mailFolders/Inbox/messages?$filter=isRead eq false&$orderby=receivedDateTime asc&$top=${LOT_MAX}&$select=id,subject,from,receivedDateTime,hasAttachments`)
    const messages = liste?.value || []

    let nbImportees = 0, nbSansPdf = 0, nbSansCommande = 0, nbDejaTraitees = 0
    const erreurs = []

    // Fournisseurs et commandes chargés une fois pour tout le lot — évite
    // un aller-retour Supabase par email pour un rapprochement qui ne
    // porte de toute façon que sur quelques centaines de lignes.
    const [{ data: fournisseurs }, { data: commandes }] = await Promise.all([
      db.from('fournisseurs').select('id, nom, email').is('deleted_at', null),
      db.from('commandes').select('id, numero, projet_id, fournisseur_id').is('deleted_at', null),
    ])

    for (const msg of messages) {
      if (!msg.hasAttachments) {
        // Rien à en tirer — on marque quand même comme lu pour ne pas le
        // revoir à chaque clic sur "Vérifier" (ex. accusé de réception,
        // relance sans PDF...).
        await grapheAppel(token, `/users/${boite}/messages/${msg.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isRead: true }) }).catch(() => {})
        nbSansPdf++
        continue
      }

      // Déjà importé lors d'un précédent clic (le message est resté non
      // lu côté Graph pour une raison quelconque) — on ne double pas.
      const { data: existant } = await db.from('factures_frs_a_traiter').select('id').eq('message_id', msg.id).maybeSingle()
      if (existant) { nbDejaTraitees++; continue }

      try {
        const piecesJointes = await grapheAppel(token, `/users/${boite}/messages/${msg.id}/attachments`)
        const pdfs = (piecesJointes?.value || []).filter(p =>
          p['@odata.type'] === '#microsoft.graph.fileAttachment' &&
          (p.contentType === 'application/pdf' || /\.pdf$/i.test(p.name || ''))
        )

        if (!pdfs.length) {
          nbSansPdf++
          await grapheAppel(token, `/users/${boite}/messages/${msg.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isRead: true }) }).catch(() => {})
          continue
        }

        // On ne garde que la première pièce jointe PDF — le cas
        // "plusieurs factures dans un seul email" restera à traiter à la
        // main (l'alerte le mentionne).
        const pdf = pdfs[0]
        const buffer = Buffer.from(pdf.contentBytes, 'base64')

        let texte = ''
        try {
          const pdfProxy = await getDocumentProxy(new Uint8Array(buffer))
          const resultat = await extractText(pdfProxy, { mergePages: true })
          texte = resultat?.text || ''
        } catch (errPdf) {
          console.error('import-factures-frs: extraction PDF échouée pour', msg.id, errPdf.message)
        }

        const expediteurEmail = (msg.from?.emailAddress?.address || '').toLowerCase()
        const matchNumero = (texte.match(REGEX_NUMERO_COMMANDE) || (msg.subject || '').match(REGEX_NUMERO_COMMANDE) || [])[0]
        const numeroFactureDetecte = texte ? extraireNumeroFacture(texte) : null
        const montantHtDetecte = texte ? extraireMontantHT(texte) : null
        const commandeMatch = matchNumero
          ? (commandes || []).find(c => (c.numero || '').toLowerCase() === matchNumero.toLowerCase())
          : null
        const fournisseurMatch = commandeMatch
          ? (fournisseurs || []).find(f => f.id === commandeMatch.fournisseur_id)
          : (fournisseurs || []).find(f => (f.email || '').toLowerCase() === expediteurEmail)

        let alerte = null
        if (!matchNumero) alerte = "Aucun numéro de commande trouvé sur la facture — demande au fournisseur de le rappeler (référence donnée à la commande)."
        else if (!commandeMatch) alerte = `Référence "${matchNumero}" trouvée mais ne correspond à aucune commande connue — vérifie l'orthographe ou choisis la commande à la main.`

        // Archive du PDF dans le même bucket que le reste de l'ERP.
        const nomFichier = 'facture_' + Date.now() + '_' + (pdf.name || 'facture.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')
        const cheminStorage = 'factures_frs_a_traiter/' + msg.id + '/' + nomFichier
        const { error: uploadErr } = await db.storage.from('documents').upload(cheminStorage, buffer, { contentType: 'application/pdf' })
        if (uploadErr) throw new Error('Upload du PDF échoué : ' + uploadErr.message)

        const { error: insertErr } = await db.from('factures_frs_a_traiter').insert([{
          message_id: msg.id,
          recu_le: msg.receivedDateTime || null,
          expediteur: msg.from?.emailAddress?.address || null,
          sujet: msg.subject || null,
          fournisseur_id: fournisseurMatch?.id || null,
          commande_id: commandeMatch?.id || null,
          projet_id: commandeMatch?.projet_id || null,
          numero_commande_detecte: matchNumero || null,
          numero_facture_detecte: numeroFactureDetecte,
          montant_ht_detecte: montantHtDetecte,
          fichier_path: cheminStorage,
          texte_extrait: texte ? texte.slice(0, 20000) : null, // borne large mais raisonnable, pas la peine de stocker un roman
          alerte,
        }])
        if (insertErr) throw new Error('Enregistrement échoué : ' + insertErr.message)

        if (!commandeMatch) nbSansCommande++
        nbImportees++

        await grapheAppel(token, `/users/${boite}/messages/${msg.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isRead: true }) })
      } catch (errMsg) {
        console.error('import-factures-frs: échec sur le message', msg.id, errMsg.message)
        erreurs.push((msg.subject || msg.id) + ' : ' + errMsg.message)
        // On laisse ce message non lu — il sera retenté au prochain clic
        // sur "Vérifier" plutôt que silencieusement perdu.
      }
    }

    return res.status(200).json({
      ok: true,
      vus: messages.length,
      importees: nbImportees,
      sansPdf: nbSansPdf,
      sansCommande: nbSansCommande,
      dejaTraitees: nbDejaTraitees,
      autresRestantes: messages.length === LOT_MAX,
      erreurs,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
