import type { VideoItem } from './youtube'

// ponytail: จำ session การเล่น (playlist ไหน/เพลงไหน) เปิดใหม่ resume ต่อได้เลย
export interface PlaySession {
  pid: string | null
  qi: number
  item: VideoItem
  at: number
}

const KEY = 'yt-session:v1'

export function loadSession(): PlaySession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<PlaySession>
    if (!s.item || typeof s.item.id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(s.item.id)) return null
    if (typeof s.qi !== 'number' || s.qi < 0) return null
    return { pid: typeof s.pid === 'string' ? s.pid : null, qi: Math.floor(s.qi), item: s.item, at: Date.now() }
  } catch {
    return null
  }
}

export function saveSession(s: Omit<PlaySession, 'at'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, at: Date.now() }))
  } catch { /* เต็มก็ช่าง */ }
}
