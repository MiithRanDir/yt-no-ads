import type { VideoItem } from './youtube'

export interface Playlist {
  id: string
  name: string
  items: VideoItem[]
  createdAt: number
  updatedAt: number
  source: 'manual' | 'youtube'
}

export const MAX_PLAYLISTS = 20
export const MAX_ITEMS = 200
const KEY = 'yt-no-ads:playlists:v1'

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ponytail: รองรับทั้ง watch?v=..&list=.. และ /playlist?list=..
export function parseYoutubeListId(url: string): string | null {
  const m = /[?&]list=([A-Za-z0-9_-]+)/.exec(url.trim())
  return m ? m[1] : null
}

export function dedupe(videos: VideoItem[]): VideoItem[] {
  const seen = new Set<string>()
  return videos.filter((v) => (v?.id && !seen.has(v.id) ? (seen.add(v.id), true) : false))
}

function validVideo(v: unknown): v is VideoItem {
  const o = v as Record<string, unknown>
  return !!o && typeof o.id === 'string' && typeof o.title === 'string'
}

function validPlaylist(p: unknown): p is Playlist {
  const o = p as Record<string, unknown>
  return !!o && typeof o.id === 'string' && typeof o.name === 'string' && Array.isArray(o.items) &&
    (o.items as unknown[]).every(validVideo)
}

export function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter(validPlaylist).slice(0, MAX_PLAYLISTS).map((p) => ({
      ...p,
      items: p.items.slice(0, MAX_ITEMS),
    }))
  } catch {
    return []
  }
}

export function savePlaylists(pls: Playlist[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pls.slice(0, MAX_PLAYLISTS).map((p) => ({
      ...p,
      items: p.items.slice(0, MAX_ITEMS),
    }))))
  } catch { /* เต็มก็ช่าง */ }
}

export function exportJSON(pls: Playlist[]): string {
  return JSON.stringify(pls)
}

export function importJSON(raw: string): Playlist[] {
  const arr = JSON.parse(raw) as unknown
  if (!Array.isArray(arr)) throw new Error('ไฟล์ไม่ถูกต้อง: ต้องเป็น array')
  const out = arr.filter(validPlaylist)
  if (out.length === 0) throw new Error('ไฟล์ไม่ถูกต้อง: ไม่มีเพลย์ลิสต์ที่ใช้ได้')
  return out.slice(0, MAX_PLAYLISTS).map((p) => ({ ...p, items: dedupe(p.items).slice(0, MAX_ITEMS) }))
}
