import { exportJSON, importJSON, type Playlist } from './playlists'

// ponytail: sync ข้ามเครื่องด้วย private gist (ฟรี, ไม่ต้องตั้ง server/DB)
// token กรอกครั้งเดียวต่อ browser เก็บใน localStorage เครื่องนั้นๆ
const TOKEN_KEY = 'yt-gist-token'
const ID_KEY = 'yt-gist-id'
const FILENAME = 'yt-no-ads-playlists.json'

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function saveToken(t: string) {
  try { localStorage.setItem(TOKEN_KEY, t.trim()) } catch { /* ข้าม */ }
}
export function clearSync() {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ID_KEY) } catch { /* ข้าม */ }
}
export function getGistId(): string | null {
  try { return localStorage.getItem(ID_KEY) } catch { return null }
}
function saveGistId(id: string) {
  try { localStorage.setItem(ID_KEY, id) } catch { /* ข้าม */ }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api(token: string, path: string, init?: RequestInit): Promise<any> {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  })
  if (r.status === 401) throw new Error('token ใช้ไม่ได้หรือหมดอายุ (401) — สร้าง token ใหม่ที่มีสิทธิ์ gist')
  if (r.status === 403) throw new Error('GitHub จำกัดอัตรา (403) — รอสักครู่แล้วลองใหม่')
  if (!r.ok) throw new Error(`GitHub API error: ${r.status}`)
  return r.json()
}

// หากิสต์เดิม (จาก id ที่จำไว้ หรือค้นจากไฟล์) ไม่มีก็สร้าง private อันใหม่
export async function ensureGist(token: string): Promise<string> {
  const saved = getGistId()
  if (saved) {
    await api(token, `/gists/${saved}`)
    return saved
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (await api(token, '/gists?per_page=100')) as any[]
  const found = list.find((g) => g.files && g.files[FILENAME])
  if (found) {
    saveGistId(found.id as string)
    return found.id as string
  }
  const created = await api(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: 'yt-no-ads playlists (private)',
      public: false,
      files: { [FILENAME]: { content: '[]' } },
    }),
  })
  saveGistId(created.id as string)
  return created.id as string
}

export async function pullPlaylists(token: string, gistId: string): Promise<Playlist[]> {
  const g = await api(token, `/gists/${gistId}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = (g.files?.[FILENAME]?.content ?? '[]') as string
  if (content.trim() === '' || content.trim() === '[]') return []
  return importJSON(content) // validate โครงสร้างก่อนใช้
}

export async function pushPlaylists(token: string, gistId: string, playlists: Playlist[]): Promise<void> {
  await api(token, `/gists/${gistId}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [FILENAME]: { content: exportJSON(playlists) } } }),
  })
}
