export default async function handler(req, res) {
  const slug = process.env.VITE_QONTO_SLUG
  const key = process.env.VITE_QONTO_KEY

  if (!slug || !key) {
    return res.status(500).json({ error: 'Qonto credentials manquantes' })
  }

  const { endpoint } = req.query
  if (!endpoint) {
    return res.status(400).json({ error: 'endpoint requis' })
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
        res.setHeader('Access-Control-Allow-Origin', '*')
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
