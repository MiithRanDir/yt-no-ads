import { addQuota, COST_PLAYLIST, COST_SEARCH, COST_TRENDING } from './quota'

export interface VideoItem {
  id: string
  title: string
  channel: string
  thumb: string
  live?: boolean // ponytail: ไลฟ์สดไหม (จาก liveBroadcastContent) — ไว้อวด badge + filter
}

const SEARCH_TTL = 30 * 60 * 1000 // 30 นาที — search เปลี่ยนบ่อยแต่กันพิมพ์ซ้ำเผา quota
const TRENDING_TTL = 2 * 60 * 60 * 1000 // 2 ชม. — trending เปลี่ยนช้า cache นานได้
const MAX = 100 // ponytail: กัน Map โตไม่จำกัด ลบตัวเก่าสุดออก
const cache = new Map<string, { at: number; data: VideoItem[] }>()

function ttlFor(key: string) {
  return key.startsWith('trending') ? TRENDING_TTL : SEARCH_TTL
}

// ponytail: persistent cache ลง localStorage รอด reload ประหยัด quota ได้เยอะ
function lsGet(key: string): VideoItem[] | null {
  try {
    const raw = localStorage.getItem(`yt-cache:${key}`)
    if (!raw) return null
    const hit = JSON.parse(raw) as { at: number; data: VideoItem[] }
    if (Date.now() - hit.at < ttlFor(key)) return hit.data
    localStorage.removeItem(`yt-cache:${key}`)
  } catch { /* storage เต็ม/ปิดไว้ก็ข้าม */ }
  return null
}

function lsSet(key: string, data: VideoItem[]) {
  try {
    localStorage.setItem(`yt-cache:${key}`, JSON.stringify({ at: Date.now(), data }))
  } catch { /* เต็มก็ช่าง */ }
}

function setCache(key: string, data: VideoItem[]) {
  if (cache.size >= MAX) cache.delete(cache.keys().next().value as string)
  cache.set(key, { at: Date.now(), data })
  lsSet(key, data)
}

function getCache(key: string): VideoItem[] | null {
  const hit = cache.get(key)
  if (hit) {
    if (Date.now() - hit.at < ttlFor(key)) return hit.data
    cache.delete(key)
  }
  return lsGet(key)
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
      const live = (v as { snippet?: { liveBroadcastContent?: string } }).snippet?.liveBroadcastContent === 'live'
      return {
        id,
        title: v.snippet?.title ?? id,
        channel: v.snippet?.channelTitle ?? '',
        thumb: v.snippet?.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        ...(live ? { live: true as const } : {}),
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
      const live = (v as { snippet?: { liveBroadcastContent?: string } }).snippet?.liveBroadcastContent === 'live'
      return {
        id: v.id,
        title: v.snippet?.title ?? v.id,
        channel: v.snippet?.channelTitle ?? '',
        thumb: v.snippet?.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
        ...(live ? { live: true as const } : {}),
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

export async function searchVideos(q: string, opts?: { liveOnly?: boolean }): Promise<VideoItem[]> {
  const query = q.trim()
  if (!query) return []
  const liveOnly = opts?.liveOnly ?? false
  const key = liveOnly ? `s:live:${query}` : `s:${query}` // ponytail: แยก cache ไลฟ์/ปกติ กันปนกัน
  const hit = getCache(key)
  if (hit) return hit

  // 1) ลองผ่าน proxy ก่อน (prod บน Vercel ซ่อน key)
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(query)}${liveOnly ? '&live=1' : ''}`)
    if (r.ok) {
      const data = mapSearch(await r.json())
      setCache(key, data)
      addQuota(COST_SEARCH) // นับเฉพาะยิงจริง ไม่นับ cache hit
      return data
    }
  } catch {
    /* fallback ข้างล่าง */
  }

  // 2) fallback ตรง (dev local ใช้ VITE_YT_API_KEY)
  const apiKey = (import.meta.env.VITE_YT_API_KEY as string | undefined) ?? ''
  if (!apiKey) throw new Error('ยังไม่ได้ตั้งค่า API key — ดู .env.example (VITE_YT_API_KEY) หรือตั้ง YT_API_KEY บน Vercel')
  const url = `${DIRECT}/search?part=snippet&type=video&maxResults=24&q=${encodeURIComponent(query)}${liveOnly ? '&eventType=live' : ''}&key=${apiKey}`
  const data = mapSearch(await fetchJson(url))
  setCache(key, data)
  addQuota(COST_SEARCH)
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
      setCache(key, data)
      addQuota(COST_TRENDING)
      return data
    }
  } catch {
    /* fallback */
  }

  const apiKey = (import.meta.env.VITE_YT_API_KEY as string | undefined) ?? ''
  if (!apiKey) return [] // หน้าแรกว่างได้ถ้าไม่มี key ไม่ต้อง throw
  const url = `${DIRECT}/videos?part=snippet,status&chart=mostPopular&regionCode=TH&maxResults=24&key=${apiKey}`
  const data = mapVideos(await fetchJson(url))
  setCache(key, data)
  addQuota(COST_TRENDING)
  return data
}

// ponytail: import playlist ผ่าน proxy หน้าเดียว (server loop 4 หน้าให้แล้ว) นับ quota ตามจำนวนที่ได้
function mapPlaylist(json: unknown): VideoItem[] {
  const items = (json as { items?: unknown[] })?.items ?? []
  return items
    .map((it) => {
      const v = it as {
        snippet?: { title?: string; channelTitle?: string; resourceId?: { videoId?: string }; thumbnails?: { medium?: { url?: string } } }
      }
      const id = v.snippet?.resourceId?.videoId ?? ''
      const title = v.snippet?.title ?? ''
      if (!id || title === 'Private video' || title === 'Deleted video') return null
      return {
        id,
        title: title || id,
        channel: v.snippet?.channelTitle ?? '',
        thumb: v.snippet?.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      } as VideoItem
    })
    .filter(Boolean) as VideoItem[]
}

export async function fetchPlaylistItems(listId: string): Promise<VideoItem[]> {
  if (!/^[A-Za-z0-9_-]+$/.test(listId)) throw new Error('ลิงก์ไม่ถูกต้อง: หา playlist id ไม่เจอ')
  try {
    const r = await fetch(`/api/search?type=playlist&listId=${encodeURIComponent(listId)}`)
    if (!r.ok) quotaError(r.status)
    const data = mapPlaylist(await r.json())
    if (data.length === 0) throw new Error('เพลย์ลิสต์ว่าง / ส่วนตัว / ไม่มีสิทธิ์เข้าถึง')
    addQuota(Math.max(1, Math.ceil(data.length / 50)) * COST_PLAYLIST)
    return data
  } catch (e) {
    if (e instanceof Error && !e.message.startsWith('YouTube API')) throw e
    // fallback ตรง (dev local): ดึงหน้าเดียว 50 รายการพอ
    const apiKey = (import.meta.env.VITE_YT_API_KEY as string | undefined) ?? ''
    if (!apiKey) throw e instanceof Error ? e : new Error('ดึงเพลย์ลิสต์ไม่สำเร็จ')
    const url = `${DIRECT}/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(listId)}&key=${apiKey}`
    const data = mapPlaylist(await fetchJson(url))
    if (data.length === 0) throw new Error('เพลย์ลิสต์ว่าง / ส่วนตัว / ไม่มีสิทธิ์เข้าถึง')
    addQuota(COST_PLAYLIST)
    return data
  }
}
