// ponytail: YouTube API ไม่มี endpoint บอก quota คงเหลือ เลยนับเองแบบประมาณ
// search.list = 100 units, videos.list = 1 unit, รีเซ็ตเที่ยงคืน Pacific
export const DAILY_LIMIT = 10000
export const COST_SEARCH = 100
export const COST_TRENDING = 1
export const COST_PLAYLIST = 1 // playlistItems.list = 1 unit/หน้า

const KEY = 'yt-quota:v1'

function pacificDay(): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function getQuota(): { used: number; remaining: number; date: string } {
  try {
    const raw = localStorage.getItem(KEY)
    const today = pacificDay()
    if (!raw) return { used: 0, remaining: DAILY_LIMIT, date: today }
    const s = JSON.parse(raw) as { date: string; used: number }
    if (s.date !== today) return { used: 0, remaining: DAILY_LIMIT, date: today }
    return { used: s.used, remaining: Math.max(0, DAILY_LIMIT - s.used), date: s.date }
  } catch {
    return { used: 0, remaining: DAILY_LIMIT, date: pacificDay() }
  }
}

export function addQuota(cost: number): { used: number; remaining: number } {
  const cur = getQuota()
  const used = cur.used + cost
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: cur.date, used }))
  } catch { /* เต็มก็ช่าง */ }
  return { used, remaining: Math.max(0, DAILY_LIMIT - used) }
}
