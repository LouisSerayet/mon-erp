// Proxy sécurisé vers l'API Pennylane : le token ne quitte jamais le serveur.
// Le front envoie un POST avec { endpoint, method, body } pour un appel JSON
// classique (mise à jour / statut d'une facture déjà envoyée — voir
// updateFactureClientPennylane, updateFactureFrsPennylane, syncFactureClientStatut,
// syncFactureFrsStatut dans src/lib/usePennylane.js). Le push direct de nouvelles
// factures par API (et l'upload de PDF qui allait avec) a été retiré le
// 28/09/2026 — inutilisable tant que l'abonnement Pennylane n'inclut pas l'API,
// voir la note en tête de usePennylane.js.
import { requireAuth } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Utiliser POST avec { endpoint, method, body }' })
  }

  // Seul un utilisateur connecté à l'ERP peut appeler ce proxy — sans ce
  // contrôle, l'URL publique du site suffisait à créer/modifier des
  // factures dans le vrai compte Pennylane sans jamais se connecter.
  const user = await requireAuth(req, res)
  if (!user) return

  const token = process.env.PENNYLANE_API_TOKEN

  if (!token) {
    return res.status(500).json({ error: "PENNYLANE_API_TOKEN manquant (à ajouter dans les variables d'environnement Vercel)" })
  }

  const { endpoint, method = 'GET', body } = req.body || {}

  try {
    if (!endpoint) return res.status(400).json({ error: 'endpoint requis' })

    // Liste blanche : ce proxy transmet un vrai jeton d'accès complet au
    // compte Pennylane (facturation légale) — sans restriction, n'importe
    // quel utilisateur connecté à l'ERP pourrait appeler n'importe quel
    // endpoint avec n'importe quelle méthode (y compris DELETE), bien
    // au-delà de ce que src/lib/usePennylane.js utilise réellement (mise à
    // jour et statut d'une facture déjà envoyée, uniquement — voir la note
    // en tête de fichier).
    const ENDPOINTS_AUTORISES = [
      /^customer_invoices\/[\w-]+$/,
      /^supplier_invoices\/[\w-]+$/,
    ]
    const METHODES_AUTORISEES = ['GET', 'PUT']
    if (!METHODES_AUTORISEES.includes(method)) {
      return res.status(403).json({ error: 'Méthode Pennylane non autorisée' })
    }
    if (!ENDPOINTS_AUTORISES.some(re => re.test(endpoint))) {
      return res.status(403).json({ error: 'Endpoint Pennylane non autorisé' })
    }

    const response = await fetch(`https://app.pennylane.com/api/external/v2/${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: (method === 'GET' || method === 'HEAD') ? undefined : JSON.stringify(body || {}),
    })

    const text = await response.text()
    let data
    try { data = text ? JSON.parse(text) : {} } catch { data = text }

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Erreur Pennylane', status: response.status, details: data })
    }
    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
