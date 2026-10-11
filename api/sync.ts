import { createHash, timingSafeEqual } from 'node:crypto'

// ponytail: sync ข้ามเครื่อง — ไฟล์กลางบน branch `data` + รหัสสั้น (env APP_PASSWORD)
// TV พิมพ์รหัสครั้งเดียว ได้ cookie 1 ปี ไม่ต้องกรอก token ยาวๆ
// ไฟล์กลางไม่ trigger deploy (Vercel ดูแค่ main)

const REPO = 'MiithRanDir/yt-no-ads'
const BRANCH = 'data'
const FILE = 'playlists.json'
const COOKIE = 'yt_sync'
const ONE_YEAR = 31536000

function expected(): Buffer | null {
  const pw = process.env.APP_PASSWORD
  if (!pw) return null
  return createHash('sha256').update(`yt-no-ads:${pw}`).digest()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function authed(req: any): boolean {
  const exp = expected()
  if (!exp) return false
  const m = /yt_sync=([a-f0-9]{64})/.exec(req.headers?.cookie ?? '')
  if (!m) return false
  const got = Buffer.from(m[1], 'hex')
  return got.length === exp.length && timingSafeEqual(got, exp)
}

async function gh(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.SYNC_GITHUB_TOKEN}`,
      ...(init?.headers ?? {}),
    },
  })
}

function readBody(req: unknown): Record<string, unknown> {
  const r = req as { body?: unknown }
  if (typeof r.body === 'string') {
    try { return JSON.parse(r.body || '{}') as Record<string, unknown> } catch { return {} }
  }
  return (r.body ?? {}) as Record<string, unknown>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  if (!process.env.APP_PASSWORD || !process.env.SYNC_GITHUB_TOKEN) {
    res.status(500).json({ error: 'server ยังไม่ได้ตั้ง APP_PASSWORD / SYNC_GITHUB_TOKEN (ดู Vercel → Settings → Environment Variables)' })
    return
  }

  if (req.method === 'POST') {
    const body = readBody(req)
    if (body.action === 'logout') {
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)
      res.status(200).json({ ok: true })
      return
    }
    if (body.action === 'login' && typeof body.password === 'string') {
      const exp = expected() as Buffer
      const got = createHash('sha256').update(`yt-no-ads:${body.password}`).digest()
      if (got.length === exp.length && timingSafeEqual(got, exp)) {
        res.setHeader('Set-Cookie', `${COOKIE}=${got.toString('hex')}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ONE_YEAR}`)
        res.status(200).json({ ok: true })
      } else {
        res.status(401).json({ error: 'รหัสไม่ถูกต้อง' })
      }
      return
    }
    res.status(400).json({ error: 'bad action' })
    return
  }

  if (!authed(req)) {
    res.status(401).json({ error: 'need login' })
    return
  }

  if (req.method === 'GET') {
    const r = await gh(`/repos/${REPO}/contents/${FILE}?ref=${BRANCH}`, {
      headers: { Accept: 'application/vnd.github.raw' },
    })
    if (r.status === 404) {
      res.status(200).json({ content: '[]' })
      return
    }
    if (!r.ok) {
      res.status(502).json({ error: 'อ่านไฟล์กลางไม่สำเร็จ' })
      return
    }
    res.status(200).json({ content: await r.text() })
    return
  }

  if (req.method === 'PUT') {
    const body = readBody(req)
    const content = String(body.content ?? '')
    if (content.length > 1500000) {
      res.status(400).json({ error: 'ข้อมูลใหญ่เกินไป' })
      return
    }
    // last-write-wins: อ่าน sha ล่าสุดก่อนเขียน (ชนกันยากเพราะใช้คนเดียว)
    const cur = await gh(`/repos/${REPO}/contents/${FILE}?ref=${BRANCH}`)
    let sha: string | undefined
    if (cur.status !== 404) {
      if (!cur.ok) {
        res.status(502).json({ error: 'อ่านไฟล์กลางไม่สำเร็จ' })
        return
      }
      sha = (await cur.json() as { sha: string }).sha
    }
    const put = await gh(`/repos/${REPO}/contents/${FILE}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'sync playlists',
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      }),
    })
    if (!put.ok) {
      res.status(409).json({ error: 'เขียนชนกัน — แก้ต่ออีกนิดแล้วจะอัปโหลดใหม่เอง' })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  res.status(405).json({ error: 'method not allowed' })
}
