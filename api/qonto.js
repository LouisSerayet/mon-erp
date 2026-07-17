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
    } catch (err) {
      continue
    }
  }

  return res.status(404).json({ error: 'Endpoint non trouvé sur v1 et v2' })
}
