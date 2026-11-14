// ponytail: อัลกอริทึม smart shuffle แยกเป็น pure module — App ถือแค่ state, เทสด้วย node ตรงๆ ได้
// Spotify-style: ตรึงลำดับสุ่มทั้งรอบ (permutation) → prev/next เดินบนลำดับเดียวกัน + ไม่ซ้ำจนครบรอบ
// "smart" = กัน channel (ศิลปิน) เดิมภายใน ARTIST_GAP เพลง + รอบใหม่กันเพลงที่เพิ่งฟังจริงออกจากหัวรอบ

export interface ShuffleTrack {
  id: string
  channel?: string
}

export interface ShuffleRound {
  order: string[] // ลำดับสุ่มของทั้งรอบ (permutation ของ playlist)
  pos: number // ดัชนีเพลงที่เล่นอยู่, -1 = ยังไม่เริ่มรอบ
  done: string[] // เพลงที่บริโภคแล้วในรอบนี้ — กดเลือกเพลงเองจะไม่ข้ามเพลงอื่นให้เสียรอบ
  recent: string[] // เพลงที่ได้ฟังจริงล่าสุด recencyWindow ตัวท้าย ใช้กันของเก่าเด้งกลับมาต้นรอบใหม่
  resume?: string // เพลงที่เพิ่งกด ⏮ ออกมา → กด ⏭ ต่อต้องกลับไปหาเพลงนี้ ไม่ใช่กระโดดไปท้ายรอบ
}

export const ARTIST_GAP = 2

type Rand = () => number

// กันเพลงที่เพิ่งฟังจริงออกจากหัวรอบใหม่ = ครึ่งหลังของ playlist
// W = n/2 คือจุดที่ระยะห่างขั้นต่ำก่อนเจอเพลงเดิมใหญ่สุด (≈ W + 1)
// เล็กกว่านี้ เช่น n/4 = เพลงท้ายรอบยังเด้งกลับมาในไม่กี่เพลง ซึ่งเป็นอาการที่ user รายงาน
export function recencyWindow(size: number): number {
  return Math.min(size, Math.max(ARTIST_GAP * 2, Math.round(size / 2)))
}

export function shuffled<T>(src: readonly T[], rand: Rand = Math.random): T[] {
  const out = src.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

// สุ่มเรียงทีละเพลง ห้ามเลือก channel ที่เพิ่งเล่นภายใน ARTIST_GAP เพลง
// ถ้าไม่มีเพลงผ่านเกณฑ์ (playlist มีศิลปินน้อย/เหลือเพลงท้ายๆ) → ปล่อยผ่าน ไม่ deadlock
function spread(ids: string[], channelOf: (id: string) => string, played: string[], rand: Rand): string[] {
  const pool = ids.slice()
  const out: string[] = []
  while (pool.length > 0) {
    const banned = new Set(played.slice(played.length - ARTIST_GAP).map(channelOf))
    let pick = -1
    for (let i = 0; i < pool.length; i++) {
      const cand = Math.floor(rand() * pool.length)
      if (!banned.has(channelOf(pool[cand]))) {
        pick = cand
        break
      }
    }
    if (pick < 0) pick = Math.floor(rand() * pool.length)
    const [taken] = pool.splice(pick, 1)
    out.push(taken)
    played.push(taken)
  }
  return out
}

// ลำดับรอบใหม่ — avoidFirst = เพลงที่เพิ่งฟัง (จะถูกเลื่อนไปอยู่ท้ายรอบ)
export function buildOrder(tracks: readonly ShuffleTrack[], opts: { avoidFirst?: readonly string[] } = {}, rand: Rand = Math.random): string[] {
  const channelOf = new Map(tracks.map((t) => [t.id, t.channel ?? '']))
  const avoid = new Set(opts.avoidFirst ?? [])
  const fresh = tracks.filter((t) => !avoid.has(t.id)).map((t) => t.id)
  const delayed = shuffled(tracks.filter((t) => avoid.has(t.id)).map((t) => t.id), rand)
  const played: string[] = []
  const safe = (id: string) => channelOf.get(id) ?? ''
  return [...spread(fresh, safe, played, rand), ...spread(delayed, safe, played, rand)]
}

export function newRound(
  tracks: readonly ShuffleTrack[],
  opts: { avoidFirst?: readonly string[]; recent?: readonly string[] } = {},
  rand: Rand = Math.random,
): ShuffleRound {
  const order = buildOrder(tracks, { avoidFirst: opts.avoidFirst }, rand)
  return { order, pos: -1, done: [], recent: (opts.recent ?? []).slice(-recencyWindow(order.length)) }
}

function consume(round: ShuffleRound, id: string): ShuffleRound {
  const done = round.done.includes(id) ? round.done : [...round.done, id]
  const recent = [...round.recent.filter((x) => x !== id), id].slice(-recencyWindow(round.order.length))
  return { ...round, done, recent }
}

// playlist แก้ไขระหว่างรอบ → ตัดเพลงที่ถูกลบ, ต่อท้ายเพลงที่เพิ่มใหม่ (ไม่สลับเพลงที่คนกำลังฟัง)
export function repairOrder(round: ShuffleRound, tracks: readonly ShuffleTrack[], rand: Rand = Math.random): ShuffleRound {
  const ids = tracks.map((t) => t.id)
  if (ids.length === 0) return { order: [], pos: -1, done: [], recent: [] }
  const known = new Set(ids)
  const seen = new Set<string>()
  const kept = round.order.filter((id) => known.has(id) && !seen.has(id) && (seen.add(id), true))
  const added = ids.filter((id) => !seen.has(id))
  const order = kept.length === 0 ? buildOrder(tracks, {}, rand) : [...kept, ...shuffled(added, rand)]
  const inOrder = new Set(order)
  const playing = round.pos >= 0 ? round.order[round.pos] : undefined
  const pos = playing !== undefined && inOrder.has(playing) ? order.indexOf(playing) : -1
  const resume = round.resume && inOrder.has(round.resume) ? round.resume : undefined
  return { order, pos, done: round.done.filter((id) => inOrder.has(id)), recent: round.recent.filter((id) => inOrder.has(id)), resume }
}

export function currentId(round: ShuffleRound): string | undefined {
  return round.pos < 0 ? undefined : round.order[round.pos]
}

// user จิ้มเลือกเพลงเอง = ตั้งเป็นเพลงปัจจุบัน + นับว่าบริโภคแล้ว (ไม่แตะลำดับเพลงอื่นในรอบ)
export function playId(round: ShuffleRound, id: string): ShuffleRound {
  const at = round.order.indexOf(id)
  if (at < 0) return round
  const { resume, ...rest } = { ...round, pos: at }
  return consume(rest, id)
}

// ขึ้นรอบใหม่แล้วชี้ไปที่เพลงแรกของรอบทันที (caller ต้องอ่าน currentId ได้เสมอ)
// recent ต้องส่งต่อข้ามรอบด้วย — ไม่งั้นเพลงที่เพิ่งฟังก่อนเปลี่ยนรอบจะหลุดจากเขตกั้นทันที
function startNewRound(tracks: readonly ShuffleTrack[], recent: readonly string[], rand: Rand): ShuffleRound {
  const fresh = newRound(tracks, { avoidFirst: recent, recent }, rand)
  return fresh.order.length > 0 ? consume({ ...fresh, pos: 0 }, fresh.order[0]) : fresh
}

// เพลงถัดไปของรอบ = เพลงแรกในลำดับรอบที่ยังไม่เล่น และ (ถ้าเลือกได้) ไม่อยู่ใน window ที่เพิ่งฟัง
// ครบรอบแล้ว = ขึ้นรอบใหม่โดยกันเพลงที่เพิ่งฟังจริงออกไปอยู่ท้ายรอบ
// ถ้าเพิ่งกด ⏮ ออกมาจากเพลงไหน ให้กลับไปเพลงนั้นก่อน (คนกดถอยเพื่อฟังต่อ ไม่ใช่เพื่อข้าม)
export function advance(round: ShuffleRound, tracks: readonly ShuffleTrack[], rand: Rand = Math.random): ShuffleRound {
  const fixed = repairOrder(round, tracks, rand)
  if (fixed.order.length === 0) return fixed
  if (fixed.resume) {
    const at = fixed.order.indexOf(fixed.resume)
    if (at >= 0) {
      const { resume, ...rest } = fixed
      return consume({ ...rest, pos: at }, fixed.order[at])
    }
  }
  const done = new Set(fixed.done)
  if (done.size >= fixed.order.length) return startNewRound(tracks, fixed.recent, rand)
  const start = Math.max(fixed.pos, -1)
  const recent = new Set(fixed.recent)
  const at = (step: number) => (start + step + fixed.order.length) % fixed.order.length
  for (let step = 1; step <= fixed.order.length; step++) {
    const id = fixed.order[at(step)]
    if (!done.has(id) && !recent.has(id)) return consume({ ...fixed, pos: at(step) }, id)
  }
  for (let step = 1; step <= fixed.order.length; step++) {
    const id = fixed.order[at(step)]
    if (!done.has(id)) return consume({ ...fixed, pos: at(step) }, id)
  }
  return startNewRound(tracks, fixed.recent, rand)
}

// ⏮ = ถอยกลับตามประวัติกดเล่นจริง (done คือลำดับที่ฟังมาแล้วของรอบนี้) ไม่ใช่ถอยตาม index ใน order
// เพลงที่เพิ่งออกจากหน้าจอจะถูกปล่อยกลับเข้า pool ให้ advance หยิบกลับมาได้ (ผ่าน resume)
export function retreat(round: ShuffleRound, tracks: readonly ShuffleTrack[], rand: Rand = Math.random): ShuffleRound {
  const fixed = repairOrder(round, tracks, rand)
  if (fixed.done.length === 0) return fixed
  const resume = currentId(fixed)
  const done = fixed.done.slice(0, -1)
  const back = done[done.length - 1]
  const pos = back === undefined ? -1 : fixed.order.indexOf(back)
  return { ...fixed, pos, done, resume }
}
