import { exportJSON, importJSON, type Playlist } from './playlists'
import { exportCached, mergeCached } from './videoCache'

// ponytail: sync ผ่าน server กลาง (/api/sync) — browser ไม่ต้องถือ token ใดๆ
// login ด้วยรหัสสั้นครั้งเดียว ได้ cookie 1 ปี (TV พิมพ์ทีเดียวจบ)

export async function syncPull(): Promise<Playlist[]> {
  const r = await fetch('/api/sync')
  if (r.status === 401) throw new Error('NEED_LOGIN')
  if (!r.ok) {
    const b = await r.json().catch(() => ({})) as { error?: string }
    throw new Error(b.error ?? 'ดึงข้อมูลไม่สำเร็จ')
  }
  const { content, videoCache } = (await r.json()) as { content: string; videoCache?: Record<string, { id: string; title: string; channel: string; thumb: string; live?: boolean; cachedAt: number }> }
  if (!content || content.trim() === '' || content.trim() === '[]') return []
  const playlists = importJSON(content) // validate โครงสร้างก่อนใช้
  if (videoCache) mergeCached(videoCache) // cachedAt ใหม่ชนะ
  return playlists
}

export async function syncPush(playlists: Playlist[]): Promise<void> {
  const r = await fetch('/api/sync', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: exportJSON(playlists), videoCache: exportCached() }),
  })
  if (r.status === 401) throw new Error('NEED_LOGIN')
  if (!r.ok) {
    const b = await r.json().catch(() => ({})) as { error?: string }
    throw new Error(b.error ?? 'อัปโหลดไม่สำเร็จ')
  }
}

export async function syncLogin(password: string): Promise<void> {
  const r = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', password }),
  })
  if (r.status === 401) throw new Error('รหัสไม่ถูกต้อง')
  if (!r.ok) {
    const b = await r.json().catch(() => ({})) as { error?: string }
    throw new Error(b.error ?? 'เข้าสู่ระบบไม่สำเร็จ')
  }
}

export async function syncLogout(): Promise<void> {
  await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'logout' }),
  })
}
