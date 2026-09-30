export interface VideoItem {
  id: string
  title: string
  channel: string
  thumb: string
}

const TTL = 5 * 60 * 1000 // 5 นาที
const cache = new Map<string, { at: number; data: VideoItem[] }>()

function getCache(key: string): VideoItem[] | null {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.data
  cache.delete(key)
  return null
}

// ponytail: debounce แบบ function เดียว ไม่ใช้ lodash
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<F extends (...args: any[]) => void>(fn: F, ms = 500) {
  let t: ReturnType<typeof setTimeout>
  return (...args: Parameters<F>) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

function mapSearch(json: unknown): VideoItem[] {
  const items = (json as { items?: unknown[] })?.items ?? []
  return items
    .map((it) => {
      const v = it as {
        id?: { videoId?: string } | string
        snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string } } }
      }
      const id = typeof v.id === 'string' ? v.id : v.id?.videoId ?? ''
      if (!id) return null
      return {
        id,
        title: v.snippet?.title ?? id,
        channel: v.snippet?.channelTitle ?? '',
        thumb: v.snippet?.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      } as VideoItem
    })
    .filter(Boolean) as VideoItem[]
}

function mapVideos(json: unknown): VideoItem[] {
  const items = (json as { items?: unknown[] })?.items ?? []
  return items
    .map((it) => {
      const v = it as {
        id?: string
        snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string } } }
        status?: { embeddable?: boolean }
      }
      if (!v.id) return null
      if (v.status && v.status.embeddable === false) return null // filter embeddable
      return {
        id: v.id,
        title: v.snippet?.title ?? v.id,
        channel: v.snippet?.channelTitle ?? '',
        thumb: v.snippet?.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
      } as VideoItem
    })
    .filter(Boolean) as VideoItem[]
}

function quotaError(status: number): never {
  if (status === 403) throw new Error('YouTube API quota หมดหรือ key ไม่ถูกต้อง (403) — รอพรุ่งนี้หรือเช็ค key')
  throw new Error(`YouTube API error: ${status}`)
}

async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url)
  if (!r.ok) quotaError(r.status)
  return r.json()
}

const DIRECT = 'https://www.googleapis.com/youtube/v3'

export async function searchVideos(q: string): Promise<VideoItem[]> {
  const query = q.trim()
  if (!query) return []
  const key = `s:${query}`
  const hit = getCache(key)
  if (hit) return hit

  // 1) ลองผ่าน proxy ก่อน (prod บน Vercel ซ่อน key)
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
    if (r.ok) {
      const data = mapSearch(await r.json())
      cache.set(key, { at: Date.now(), data })
      return data
    }
  } catch {
    /* fallback ข้างล่าง */
  }

  // 2) fallback ตรง (dev local ใช้ VITE_YT_API_KEY)
  const apiKey = (import.meta.env.VITE_YT_API_KEY as string | undefined) ?? ''
  if (!apiKey) throw new Error('ยังไม่ได้ตั้งค่า API key — ดู .env.example (VITE_YT_API_KEY) หรือตั้ง YT_API_KEY บน Vercel')
  const url = `${DIRECT}/search?part=snippet&type=video&maxResults=24&q=${encodeURIComponent(query)}&key=${apiKey}`
  const data = mapSearch(await fetchJson(url))
  cache.set(key, { at: Date.now(), data })
  return data
}

export async function getTrending(): Promise<VideoItem[]> {
  const key = 'trending:TH'
  const hit = getCache(key)
  if (hit) return hit

  try {
    const r = await fetch('/api/search?type=trending')
    if (r.ok) {
      const data = mapVideos(await r.json())
      cache.set(key, { at: Date.now(), data })
      return data
    }
  } catch {
    /* fallback */
  }

  const apiKey = (import.meta.env.VITE_YT_API_KEY as string | undefined) ?? ''
  if (!apiKey) return [] // หน้าแรกว่างได้ถ้าไม่มี key ไม่ต้อง throw
  const url = `${DIRECT}/videos?part=snippet,status&chart=mostPopular&regionCode=TH&maxResults=24&key=${apiKey}`
  const data = mapVideos(await fetchJson(url))
  cache.set(key, { at: Date.now(), data })
  return data
}
