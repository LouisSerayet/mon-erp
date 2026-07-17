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

  const baseUrl = 'https://thirdparty.qonto.com/v2'
  const url = `${baseUrl}/${endpoint}`

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `${slug}:${key}`,
        'Content-Type': 'application/json',
      }
    })

    if (!response.ok) {
      const error = await response.text()
      return res.status(response.status).json({ error })
    }

    const data = await response.json()
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
