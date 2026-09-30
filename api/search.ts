// Vercel serverless proxy — ซ่อน YT_API_KEY ฝั่ง server
// GET /api/search?q=xxx  → youtube search.list
// GET /api/search?type=trending → videos.list mostPopular TH

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  const key = process.env.YT_API_KEY ?? process.env.VITE_YT_API_KEY
  if (!key) {
    res.status(500).json({ error: 'missing YT_API_KEY' })
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }
  const { q = '', type = '' } = req.query ?? {}
  if (type !== 'trending' && !String(q).trim()) {
    res.status(400).json({ error: 'missing q' })
    return
  }
  const base = 'https://www.googleapis.com/youtube/v3'
  const url =
    type === 'trending'
      ? `${base}/videos?part=snippet,status&chart=mostPopular&regionCode=TH&maxResults=24&key=${key}`
      : `${base}/search?part=snippet&type=video&maxResults=24&q=${encodeURIComponent(String(q))}&key=${key}`

  const r = await fetch(url)
  const body = await r.json()
  res.status(r.status).json(body)
}
