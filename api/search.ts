// Vercel serverless proxy — ซ่อน YT_API_KEY ฝั่ง server
// GET /api/search?q=xxx  → youtube search.list
// GET /api/search?type=trending → videos.list mostPopular TH
// GET /api/search?type=playlist&listId=xxx → playlistItems.list (1 unit/หน้า, loop สูงสุด 4 หน้า = 200 รายการ)

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
  const { q = '', type = '', listId = '', live = '' } = req.query ?? {}

  if (type === 'playlist') {
    if (!/^[A-Za-z0-9_-]+$/.test(String(listId))) {
      res.status(400).json({ error: 'missing listId' })
      return
    }
    // ponytail: loop pageToken ฝั่ง server ทีเดียว ไม่ต้องยิงหลายรอบจาก client
    // + fields กรองเฉพาะที่ใช้ (title/videoId/thumb/channel) — description เต็มๆ ทำให้ช้าจน timeout
    const FIELDS = encodeURIComponent('items(snippet(title,resourceId/videoId,thumbnails/medium/url,channelTitle)),nextPageToken')
    const items: unknown[] = []
    let pageToken = ''
    for (let i = 0; i < 10 && items.length < 500; i++) {
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&fields=${FIELDS}&playlistId=${encodeURIComponent(String(listId))}${pageToken ? `&pageToken=${pageToken}` : ''}&key=${key}`
      const r = await fetch(url)
      const body = await r.json() as { items?: unknown[]; nextPageToken?: string; error?: unknown }
      if (!r.ok) {
        res.setHeader('Cache-Control', 'public, s-maxage=60')
        res.status(r.status).json(body)
        return
      }
      const clean = (body.items ?? []).filter((it) => {
        const t = (it as { snippet?: { title?: string; resourceId?: { videoId?: string } } }).snippet
        return t?.resourceId?.videoId && t.title !== 'Private video' && t.title !== 'Deleted video'
      })
      items.push(...clean)
      pageToken = body.nextPageToken ?? ''
      if (!pageToken) break
    }
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=300')
    res.status(200).json({ items: items.slice(0, 500) })
    return
  }

  if (type !== 'trending' && !String(q).trim()) {
    res.status(400).json({ error: 'missing q' })
    return
  }
  const base = 'https://www.googleapis.com/youtube/v3'
  // ponytail: live=1 ส่ง eventType=live (ต้องมากับ type=video อยู่แล้ว) cost เท่าเดิม 100
  const liveQs = live === '1' ? '&eventType=live' : ''
  const url =
    type === 'trending'
      ? `${base}/videos?part=snippet,status&chart=mostPopular&regionCode=TH&maxResults=24&key=${key}`
      : `${base}/search?part=snippet&type=video&maxResults=24&q=${encodeURIComponent(String(q))}${liveQs}&key=${key}`

  const r = await fetch(url)
  const body = await r.json()
  // ponytail: ให้ Vercel edge cache ช่วยกัน quota — search 10 นาที / trending 1 ชม.
  res.setHeader('Cache-Control', type === 'trending'
    ? 'public, s-maxage=3600, stale-while-revalidate=300'
    : 'public, s-maxage=600, stale-while-revalidate=60')
  res.status(r.status).json(body)
}
