import { requireAuth } from './_auth.js'

export default async function handler(req, res) {
  // Seul un utilisateur connecté à l'ERP peut appeler ce proxy — sans ce
  // contrôle, l'URL publique du site suffisait à lire les transactions
  // bancaires réelles sans jamais se connecter.
  const user = await requireAuth(req, res)
  if (!user) return

  const slug = process.env.VITE_QONTO_SLUG
  const key = process.env.VITE_QONTO_KEY

  if (!slug || !key) {
    return res.status(500).json({ error: 'Qonto credentials manquantes' })
  }

  const { endpoint } = req.query
  if (!endpoint) {
    return res.status(400).json({ error: 'endpoint requis' })
  }

  // Liste blanche : ce proxy ne doit exposer que ce que l'app utilise
  // réellement (voir src/lib/useQonto.js) — sans ça, n'importe quel
  // utilisateur connecté à l'ERP pourrait interroger n'importe quel
  // endpoint Qonto en lecture (soldes détaillés, bénéficiaires, cartes...)
  // bien au-delà de ce que l'interface propose.
  const ENDPOINTS_AUTORISES = [/^organizations\/me$/, /^transactions(\?.*)?$/]
  if (!ENDPOINTS_AUTORISES.some(re => re.test(endpoint))) {
    return res.status(403).json({ error: 'Endpoint Qonto non autorisé' })
  }

  // Essayer v2 puis v1
  const urls = [
    `https://thirdparty.qonto.com/v2/${endpoint}`,
    `https://thirdparty.qonto.com/v1/${endpoint}`,
  ]

  // On garde la dernière réponse en échec (statut + corps) pour pouvoir la
  // renvoyer telle quelle si les deux versions échouent — sinon un vrai
  // problème (identifiants Qonto expirés, quota dépassé, etc.) était
  // masqué par un message générique "endpoint non trouvé", qui oriente
  // à tort vers un problème d'URL plutôt que d'identifiants.
  let derniereReponseEchec = null

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `${slug}:${key}`,
          'Content-Type': 'application/json',
        }
      })

      const text = await response.text()

      if (response.ok) {
        try {
          return res.status(200).json(JSON.parse(text))
        } catch {
          return res.status(200).send(text)
        }
      }
      derniereReponseEchec = { status: response.status, body: text }
    } catch (err) {
      console.error('Qonto fetch error for', url, err)
      derniereReponseEchec = { status: 502, body: err.message }
    }
  }

  if (derniereReponseEchec) {
    return res.status(derniereReponseEchec.status).json({
      error: 'Erreur Qonto (' + derniereReponseEchec.status + ')',
      details: derniereReponseEchec.body,
    })
  }
  return res.status(404).json({ error: 'Endpoint non trouvé sur v1 et v2' })
}
