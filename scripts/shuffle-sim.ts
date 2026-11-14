// Property test ของ smart shuffle — รัน: node scripts/shuffle-sim.ts
// ใช้ seeded RNG เพื่อให้ผล reproduce ได้ (repo ไม่มี test framework → รันด้วย node type-stripping ตรงๆ)
import {
  ARTIST_GAP,
  advance,
  buildOrder,
  currentId,
  newRound,
  playId,
  recencyWindow,
  repairOrder,
  retreat,
  shuffled,
  type ShuffleRound,
  type ShuffleTrack,
} from '../src/lib/shuffle.ts'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function playlist(n: number, artists: number): ShuffleTrack[] {
  return Array.from({ length: n }, (_, i) => ({ id: `v${i}`, channel: `a${i % artists}` }))
}

function dups(ids: string[]): string[] {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const id of ids) if (seen.has(id)) dup.add(id)
  else seen.add(id)
  return [...dup]
}

function minGap(stream: string[]): number {
  const last = new Map<string, number>()
  let best = stream.length
  stream.forEach((id, i) => {
    if (last.has(id)) best = Math.min(best, i - (last.get(id) as number))
    last.set(id, i)
  })
  return best
}

// เล่น auto-advance ต่อเนื่องหลายรอบ → ลำดับที่คนฟังจริง + จุดขึ้นรอบใหม่ (done หดเหลือ 1)
function walk(tracks: ShuffleTrack[], plays: number, seed: number) {
  const rand = rng(seed)
  let round: ShuffleRound = newRound(tracks, {}, rand)
  const heard: string[] = []
  const roundStarts: number[] = [0]
  for (let i = 0; i < plays; i++) {
    round = advance(round, tracks, rand)
    const id = currentId(round) as string
    if (heard.length > 0 && heard[heard.length - 1] === id) throw new Error('next() คืนเพลงเดิมติดกัน')
    heard.push(id)
    if (round.done.length === 1 && heard.length > 1) roundStarts.push(heard.length - 1)
  }
  return { heard, roundStarts, round, rand }
}

console.log('\n[1] ไม่เล่นซ้ำจนครบ playlist (5 รอบ x หลายขนาด)')
for (const [n, artists] of [[8, 4], [20, 5], [50, 12], [200, 30], [500, 60]] as const) {
  for (const seed of [1, 7, 99]) {
    const tracks = playlist(n, artists)
    const { heard, roundStarts } = walk(tracks, n * 5, seed)
    const bad: string[] = []
    for (let r = 0; r < roundStarts.length - 1; r++) {
      const slice = heard.slice(roundStarts[r], roundStarts[r + 1])
      if (slice.length === n) bad.push(...dups(slice))
    }
    check(`n=${n} artists=${artists} seed=${seed}`, bad.length === 0, `ซ้ำ ${bad.length} ครั้ง/${heard.length} เพลง`)
  }
}

console.log('\n[2] ลำดับเป็น permutation ครบทุกเพลงพอดี')
for (const [n, artists] of [[13, 3], [60, 20], [500, 40]] as const) {
  const tracks = playlist(n, artists)
  const order = buildOrder(tracks, {}, rng(n))
  const missing = tracks.filter((t) => !order.includes(t.id)).map((t) => t.id)
  check(`n=${n}`, order.length === n && missing.length === 0, `len=${order.length} missing=${missing.length}`)
}

console.log('\n[3] next/prev สมมาตร (ข้ามแล้วกดกลับ = เพลงเดิม, ถอยแล้วกดข้าม = กลับเพลงที่เพิ่งทิ้งไว้)')
for (const [n, artists] of [[10, 3], [80, 15]] as const) {
  const tracks = playlist(n, artists)
  const rand = rng(n * 3)
  let round: ShuffleRound = advance(newRound(tracks, {}, rand), tracks, rand)
  let broken = 0
  let resumed = 0
  let boundaries = 0
  for (let i = 0; i < n * 3; i++) {
    const before = currentId(round)
    const stepped = advance(round, tracks, rand)
    if (stepped.done.length === 1) {
      boundaries++ // เพิ่งขึ้นรอบใหม่ = ไม่มีประวัติย้อนกลับข้ามรอบ (ยอมรับได้)
      round = stepped
      continue
    }
    if (currentId(retreat(stepped, tracks, rand)) !== before) broken++ // ⏮ หลัง ⏭ = เพลงเดิม
    round = retreat(stepped, tracks, rand)
    if (currentId(advance(round, tracks, rand)) !== currentId(stepped)) resumed++ // ⏭ ต่อ = กลับเพลงที่ทิ้งไว้
    round = advance(round, tracks, rand)
  }
  check(`n=${n} prev หลัง next`, broken === 0, `พลาด ${broken} ครั้ง (ข้ามรอบ ${boundaries})`)
  check(`n=${n} next หลัง prev`, resumed === 0, `พลาด ${resumed} ครั้ง`)
}

console.log('\n[4] รอบใหม่กันเพลงที่เพิ่งฟังจริงออกจากหัวรอบ (recency window)')
for (const [n, artists] of [[15, 4], [60, 12]] as const) {
  const tracks = playlist(n, artists)
  const tail = recencyWindow(n)
  const { heard, roundStarts } = walk(tracks, n * 4, n)
  let bad = 0
  for (let r = 1; r < roundStarts.length; r++) {
    const prevTail = heard.slice(roundStarts[r] - tail, roundStarts[r])
    const newHead = heard.slice(roundStarts[r], roundStarts[r] + n - tail)
    bad += newHead.filter((id) => prevTail.includes(id)).length
  }
  check(`n=${n} window=${tail} เพลงที่เพิ่งฟังไม่โผล่ต้นรอบใหม่`, bad === 0, `โผล่ ${bad} ครั้ง`)
}

console.log('\n[5] กันศิลปินเดิมภายใน ARTIST_GAP เพลง')
for (const [n, artists] of [[100, 50], [100, 8], [100, 2], [100, 1]] as const) {
  const tracks = playlist(n, artists)
  const order = buildOrder(tracks, {}, rng(n + artists))
  const artistOf = new Map(tracks.map((t) => [t.id, t.channel as string]))
  let violations = 0
  for (let i = ARTIST_GAP; i < order.length; i++) {
    for (let j = i - ARTIST_GAP; j < i; j++) if (artistOf.get(order[i]) === artistOf.get(order[j])) violations++
  }
  const rate = violations / (order.length - ARTIST_GAP)
  const realistic = artists >= ARTIST_GAP * 4
  check(`n=${n} artists=${artists}`, !realistic || rate <= 0.05, `vio=${(rate * 100).toFixed(1)}%`)
}

console.log('\n[6] playlist แก้ไขกลางรอบ (ลบ/เพิ่มเพลง) ไม่ทำให้ลำดับพัง')
for (const [n, artists] of [[40, 10], [120, 25]] as const) {
  const rand = rng(n)
  const tracks = playlist(n, artists)
  let round: ShuffleRound = { ...newRound(tracks, {}, rand) }
  for (let i = 0; i < 6; i++) round = advance(round, tracks, rand)
  const playing = currentId(round) as string
  const removed = new Set(shuffled(tracks.slice(0, n / 2).map((t) => t.id), rand).slice(0, Math.floor(n * 0.2)))
  const edited = [...tracks.filter((t) => !removed.has(t.id)), ...playlist(3, 3).map((t) => ({ ...t, id: `new${t.id}` }))]
  const fixed = advance(round, edited, rand)
  const ids = edited.map((t) => t.id)
  const complete = ids.every((id) => fixed.order.includes(id)) && fixed.order.length === ids.length && dups(fixed.order).length === 0
  const keptSong = currentId(round) === playing && repairOrder(round, edited, rand).pos >= 0
  check(`n=${n} เก็บเพลงปัจจุบัน + ครบทุกเพลง`, complete && keptSong, `pos=${fixed.pos}`)
}

console.log('\n[7] playId (user จิ้มเพลงเอง) ไม่สร้างเพลงซ้ำในลำดับ')
for (const [n, artists] of [[30, 6], [30, 2]] as const) {
  const tracks = playlist(n, artists)
  const rand = rng(n)
  let round: ShuffleRound = newRound(tracks, {}, rand)
  let bad = 0
  for (const target of ['v0', 'v17', 'v29', 'v3', 'v17']) {
    round = playId(round, target)
    if (currentId(round) !== target) bad++
    if (dups(round.order).length > 0 || round.order.length !== n) bad++
    round = advance(round, tracks, rand)
  }
  check(`n=${n} artists=${artists} จิ้มแล้วไม่เพี้ยน`, bad === 0, `bad=${bad}`)
}

console.log('\n[8] user จิ้มเลือกเพลงเองสลับกับ auto-advance (กรณีที่ E2E จับได้รอบแรก)')
for (const [n, artists] of [[12, 4], [40, 10]] as const) {
  const tracks = playlist(n, artists)
  const rand = rng(n * 7)
  let round: ShuffleRound = newRound(tracks, {}, rand)
  const stream: string[] = []
  const kinds: string[] = []
  const newRoundAt: boolean[] = []
  for (let i = 0; i < n * 8; i++) {
    if (i % 5 === 4) {
      round = playId(round, tracks[Math.floor(rand() * n)].id) // user กดเอง = ไม่นับเป็นผลของ shuffle
      kinds.push('U')
      newRoundAt.push(false)
    } else {
      round = advance(round, tracks, rand)
      kinds.push('A')
      newRoundAt.push(round.done.length === 1) // done เหลือตัวเดียว = เพิ่งเริ่มรอบใหม่
    }
    stream.push(currentId(round) as string)
  }
  const last = new Map<string, number>()
  let minAlways = stream.length
  let minAutoToAuto = stream.length
  let servedTwice = 0 // shuffle หยิบเพลงที่รอบนี้ถูกฟังไปแล้ว (auto หรือ user จิ้มเอง)
  const heardThisRound = new Set<string>()
  stream.forEach((id, i) => {
    if (newRoundAt[i]) heardThisRound.clear()
    if (kinds[i] === 'A' && heardThisRound.has(id)) servedTwice++
    heardThisRound.add(id)
    if (kinds[i] === 'A' && last.has(id)) {
      const gap = i - (last.get(id) as number)
      minAlways = Math.min(minAlways, gap)
      if (kinds[i - 1] === 'A') minAutoToAuto = Math.min(minAutoToAuto, gap) // user จิ้มเพลงเองลาก playhead เข้าเขตป้องกัน = ยอมรับได้
    }
    last.set(id, i)
  })
  const w = recencyWindow(n)
  check(`n=${n} shuffle ไม่หยิบเพลงที่ฟังแล้วในรอบนี้`, servedTwice === 0, `ซ้ำ ${servedTwice} ครั้ง`)
  check(`n=${n} auto ต่อ auto ไม่หยิบเพลงใน ${w} เพลงล่าสุด`, minAutoToAuto >= w, `min=${minAutoToAuto}`)
  check(`n=${n} ไม่หยิบเพลงเดิมติดกันเด็ดขาด`, minAlways >= 2, `min=${minAlways}`)
}

console.log('\n[9] เทียบของเดิม: ระยะห่างขั้นต่ำก่อนจะเจอเพลงเดิม (ยิ่งมากยิ่งดี)')
{
  const n = 40
  // อัลกอริทึมเดิมใน App.tsx (ก่อนแก้): สุ่มจาก "ยังไม่เล่น" แต่ playedRef ถูกล้างเหลือเพลงเดียว
  // ทุกครั้งที่ปิดจอเพลง/เปิดแอปใหม่แล้วกด playlist เดิม (App.tsx:440 + :259)
  function oldBehaviour(seed: number, resetEvery: number) {
    const rand = rng(seed)
    const heard: string[] = []
    let played = new Set<string>([`v${Math.floor(rand() * n)}`])
    for (let i = 1; i < 240; i++) {
      if (i % resetEvery === 0) played = new Set([heard[i - 1]])
      const rest = Array.from({ length: n }, (_, k) => `v${k}`).filter((id) => !played.has(id))
      const pick = rest.length === 0 ? `v${Math.floor(rand() * n)}` : rest[Math.floor(rand() * rest.length)]
      played.add(pick)
      heard.push(pick)
    }
    return heard
  }
  const old = minGap(oldBehaviour(3, 8))
  const smart = minGap(walk(playlist(n, 10), 240, 3).heard)
  console.log(`  info ของเดิม: เจอเพลงเดิมเร็วสุดหลัง ${old} เพลง / playlist ${n} เพลง`)
  console.log(`  info แบบใหม่: เจอเพลงเดิมเร็วสุดหลัง ${smart} เพลง / playlist ${n} เพลง`)
  check('แบบใหม่ไม่เจอเพลงเดิมก่อนฟังครึ่ง playlist', smart >= n / 2, `min=${smart}`)
  check('แบบใหม่ดีกว่าของเดิมชัดเจน', smart > old)
}

console.log(failed === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ${failed} รายการไม่ผ่าน`)
process.exit(failed === 0 ? 0 : 1)
