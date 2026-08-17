// Proxy sécurisé vers l'API Pennylane : le token ne quitte jamais le serveur.
// Le front envoie toujours un POST avec { endpoint, method, body } pour un
// appel JSON classique, ou { upload: { filename, base64 } } pour joindre un
// fichier (facture fournisseur au format PDF).
import { requireAuth } from './_auth.js'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Utiliser POST avec { endpoint, method, body } ou { upload }' })
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

  const { endpoint, method = 'GET', body, upload } = req.body || {}

  try {
    // ── Upload de fichier (multipart) ──────────────────────────
    if (upload) {
      const buffer = Buffer.from(upload.base64, 'base64')
      const form = new FormData()
      form.append('file', new Blob([buffer], { type: 'application/pdf' }), upload.filename || 'facture.pdf')

      const response = await fetch('https://app.pennylane.com/api/external/v2/file_attachments', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form,
      })
      const text = await response.text()
      let data
      try { data = text ? JSON.parse(text) : {} } catch { data = text }
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Erreur Pennylane (upload fichier)', status: response.status, details: data })
      }
      return res.status(200).json(data)
    }

    // ── Appel JSON classique ───────────────────────────────────
    if (!endpoint) return res.status(400).json({ error: 'endpoint requis' })

    // Liste blanche : ce proxy transmet un vrai jeton d'accès complet au
    // compte Pennylane (facturation légale) — sans restriction, n'importe
    // quel utilisateur connecté à l'ERP pourrait appeler n'importe quel
    // endpoint avec n'importe quelle méthode (y compris DELETE), bien
    // au-delà de ce que src/lib/usePennylane.js utilise réellement.
    const ENDPOINTS_AUTORISES = [
      /^company_customers(\?.*)?$/,
      /^company_suppliers(\?.*)?$/,
      /^customer_invoices$/,
      /^customer_invoices\/[\w-]+$/,
      /^supplier_invoices\/import$/,
      /^supplier_invoices\/[\w-]+$/,
    ]
    const METHODES_AUTORISEES = ['GET', 'POST', 'PUT']
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
