import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

interface Props {
  id: string
  onClose: () => void
  onEnded?: () => void
  onNext?: () => void
  onPrev?: () => void
  onShuffle?: () => void
  hasNext?: boolean
  hasPrev?: boolean
  track?: { title: string; channel: string; thumb: string }
  audioOnly?: boolean
  context?: string
  loopOne?: boolean
  onToggleLoop?: () => void
  onToggleAudio?: () => void
  onPip?: () => void
  onToggleCar?: () => void
}

// ponytail: IFrame API จับ event จบคลิป (ENDED=0) เพื่อ auto-next ไม่ใช้ timer
interface ApiPlayer {
  loadVideoById: (id: string) => void
  destroy: () => void
  playVideo: () => void
  pauseVideo: () => void
  setPlaybackQuality: (q: string) => void
  getCurrentTime: () => number
  getDuration: () => number
  seekTo: (s: number, allowSeekAhead: boolean) => void
  mute: () => void
  unMute: () => void
  isMuted: () => boolean
  setVolume: (v: number) => void
  getVolume: () => number
}

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => ApiPlayer }
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<boolean> | null = null
function loadApi(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.YT?.Player) return Promise.resolve(true)
  if (!apiPromise) {
    apiPromise = new Promise<boolean>((resolve) => {
      let done = false
      const ok = (v: boolean) => { if (!done) { done = true; resolve(v) } }
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => { prev?.(); ok(true) }
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      s.onerror = () => ok(false)
      document.head.appendChild(s)
      // adblock/โหลดไม่ผ่าน → fallback plain iframe (ดูได้ แต่ไม่มี auto-next)
      setTimeout(() => ok(!!window.YT?.Player), 4000)
    })
  }
  return apiPromise
}

function plainSrc(id: string) {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`
}

export default function Player({ id, onClose, onEnded, onNext, onPrev, onShuffle, hasNext, hasPrev, track, audioOnly, context, loopOne, onToggleLoop, onToggleAudio, onPip, onToggleCar }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<ApiPlayer | null>(null)
  const idRef = useRef(id)
  idRef.current = id
  const endedRef = useRef(onEnded)
  endedRef.current = onEnded
  const nextRef = useRef(onNext)
  nextRef.current = onNext
  const prevRef = useRef(onPrev)
  prevRef.current = onPrev
  const trackRef = useRef(track)
  trackRef.current = track
  const audioRef = useRef(audioOnly)
  audioRef.current = audioOnly
  const loopRef = useRef(loopOne)
  loopRef.current = loopOne
  const loopToggleRef = useRef(onToggleLoop)
  loopToggleRef.current = onToggleLoop
  const audioToggleRef = useRef(onToggleAudio)
  audioToggleRef.current = onToggleAudio
  const carToggleRef = useRef(onToggleCar)
  carToggleRef.current = onToggleCar
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const shuffleRef = useRef(onShuffle)
  shuffleRef.current = onShuffle
  const playingRef = useRef(false)
  // ponytail: state ไว้โชว์การ์ด Spotify — playing/progress อัปเดตจาก player ตรงๆ
  const [playing, setPlaying] = useState(false)
  const [ctl, setCtl] = useState(false)
  const [mini, setMini] = useState(false)
  const miniRef = useRef(false)
  miniRef.current = mini
  const [prog, setProg] = useState({ t: 0, d: 0 })
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null

  // ponytail: Media Session — ปุ่มพวงมาลัย/CarPlay/Control Center คุมแอปได้
  // แยก try ทีละ action: browser บางตัว throw กับ action ที่ไม่รองรับ ถ้ารวม try เดียวตัวอื่นจะไม่ติดเลย
  useEffect(() => {
    const ms = navigator.mediaSession
    if (!ms) return
    const set = (a: MediaSessionAction, fn: (d?: { seekTime?: number; seekOffset?: number; playbackRate?: number }) => void) => {
      try { ms.setActionHandler(a as MediaSessionAction, fn as MediaSessionActionHandler) } catch { /* browser นี้ไม่รองรับ */ }
    }
    const safe = (fn: () => void) => () => { try { fn() } catch { /* ข้าม */ } }
    set('play', safe(() => { playerRef.current?.playVideo() }))
    set('pause', safe(() => { playerRef.current?.pauseVideo() }))
    set('previoustrack', () => prevRef.current?.())
    set('nexttrack', () => nextRef.current?.())
    set('seekbackward', (d) => safe(() => {
      const p = playerRef.current
      if (!p) return
      const off = d?.seekOffset ?? 10
      p.seekTo(Math.max(0, p.getCurrentTime() - off), true)
    })())
    set('seekforward', (d) => safe(() => {
      const p = playerRef.current
      if (!p) return
      const off = d?.seekOffset ?? 10
      p.seekTo(Math.min(p.getDuration(), p.getCurrentTime() + off), true)
    })())
    set('seekto', (d) => safe(() => {
      if (d?.seekTime != null) playerRef.current?.seekTo(d.seekTime, true)
    })())
    set('toggleplaypause' as MediaSessionAction, safe(() => {
      const p = playerRef.current
      if (!p) return
      if (playingRef.current) p.pauseVideo(); else p.playVideo()
    }))
  }, [])

  // เปิดจอเพลง: ล็อกสกรอลล์พื้นหลังไว้ จอเดียวพอ ไม่ซ้อนกัน
  useEffect(() => {
    if (!(audioOnly && track)) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [audioOnly, track])

  // ponytail: ส่งสถานะ play/pause ให้ OS — ปุ่ม hardware/lock screen ได้ icon ตรงกัน
  useEffect(() => {
    playingRef.current = playing
    const ms = navigator.mediaSession
    if (!ms) return
    try { ms.playbackState = playing ? 'playing' : 'paused' } catch { /* browser เก่า */ }
  }, [playing])

  // ชื่อเพลง/ปกขึ้นจอรถ + lock screen
  useEffect(() => {
    const ms = navigator.mediaSession
    if (!ms || typeof MediaMetadata === 'undefined') return
    const t = trackRef.current
    try {
      ms.metadata = new MediaMetadata({
        title: t?.title ?? 'YT No Ads',
        artist: t?.channel ?? '',
        album: 'YT No Ads',
        artwork: t?.thumb ? [{ src: t.thumb, sizes: '320x180', type: 'image/jpeg' }] : [],
      })
    } catch { /* ข้าม */ }
  }, [id])
  // เลยให้ React ถือแค่กล่องเปล่า แล้วสร้าง player แบบ imperative ข้างในครั้งเดียว
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    let alive = true
    void loadApi().then((hasApi) => {
      if (!alive || !box.isConnected) return
      if (hasApi && window.YT?.Player) {
        const el = document.createElement('div')
        box.appendChild(el)
        playerRef.current = new window.YT.Player(el, {
          width: '100%',
          height: '100%',
          host: 'https://www.youtube-nocookie.com',
          videoId: idRef.current,
          playerVars: { autoplay: 1, rel: 0 },
          events: {
            onReady: () => { setCtl(true); if (audioRef.current) { try { playerRef.current?.setPlaybackQuality('tiny') } catch { /* ข้าม */ } } },
            onStateChange: (e: { data: number }) => {
              // ponytail: loop เพลงเดียว — จบแล้วกรอกลับเล่นใหม่เอง ไม่ต้องไป App
              if (e.data === 0) {
                if (loopRef.current && playerRef.current) {
                  try { playerRef.current.seekTo(0, true); playerRef.current.playVideo() } catch { endedRef.current?.() }
                } else endedRef.current?.()
              }
              else if (e.data === 1) setPlaying(true)
              else if (e.data === 2) setPlaying(false)
            },
            // ponytail: คลิป unavailable/ห้าม embed ยิง error (ไม่ใช่ ENDED) → รอ 1.5s แล้วข้ามเพลงถ้ายังอยู่ที่เดิม
            onError: () => {
              const bad = idRef.current
              window.setTimeout(() => { if (idRef.current === bad) endedRef.current?.() }, 1500)
            },
          },
        })
      } else {
        const f = document.createElement('iframe')
        f.src = plainSrc(idRef.current)
        f.title = 'player'
        f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
        f.allowFullscreen = true
        f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0'
        box.appendChild(f)
      }
    })
    return () => {
      alive = false
      try { playerRef.current?.destroy() } catch { /* ข้าม */ }
      playerRef.current = null
      box.innerHTML = ''
    }
  }, [])

  // โหมดเสียงอย่างเดียว: บังคับ 144p ประหยัดเครื่อง (กลับปกติใช้ auto)
  useEffect(() => {
    try { playerRef.current?.setPlaybackQuality(audioOnly ? 'tiny' : 'auto') } catch { /* ยังไม่พร้อม */ }
  }, [audioOnly, id])

  // แถบเวลา + Media Session positionState: ถาม player ทุกวิขณะเล่น
  // ponytail: setProg เฉพาะ audioOnly เพื่อไม่ให้วิดีโอปกติ re-render ทุกวิ
  useEffect(() => {
    if (!(audioOnly || playing)) return
    const ms = navigator.mediaSession
    const iv = window.setInterval(() => {
      try {
        const p = playerRef.current
        if (!p) return
        const t = p.getCurrentTime() || 0
        const d = p.getDuration() || 0
        if (audioOnly) setProg({ t, d })
        if (ms && typeof (ms as unknown as { setPositionState?: unknown }).setPositionState === 'function' && d > 0) {
          try { ms.setPositionState({ duration: d, position: t, playbackRate: 1 }) } catch { /* browser เก่า */ }
        }
      } catch { /* ข้าม */ }
    }, 1000)
    return () => window.clearInterval(iv)
  }, [audioOnly, playing, id])

  // ponytail: คีย์ลัดสไตล์ YouTube — Space/K เล่น-หยุด, M mute, ←/→ ±5s, Shift+←/→ ±10s,
  // ↑/↓ ปรับเสียง, L loop, A เสียงอย่างเดียว, C โหมดรถ, F เต็มจอ, Shift+N/P ข้ามเพลง, Esc/X ปิด
  // ผูกผลึกกับ refs เพื่อติด listener แค่ครั้งเดียวตลอด session ที่ Player mount
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.altKey || e.metaKey || e.ctrlKey) return
      const p = playerRef.current
      const k = e.key
      const kl = k.length === 1 ? k.toLowerCase() : k
      const shift = e.shiftKey
      const tryVol = (delta: number) => {
        try {
          if (!p) return
          const cur = p.getVolume?.() ?? 50
          p.setVolume(Math.min(100, Math.max(0, cur + delta)))
        } catch { /* ข้าม */ }
      }
      const trySeek = (delta: number) => {
        try {
          if (!p) return
          const dur = p.getDuration() || 0
          const nt = Math.min(dur, Math.max(0, p.getCurrentTime() + delta))
          p.seekTo(nt, true)
        } catch { /* ข้าม */ }
      }
      // Shift + N/P — ข้ามเพลง (เดิมใน App ย้ายมาไว้ที่นี่เพื่อให้ Player เป็นเจ้าของ shortcut)
      if (shift && (kl === 'n' || kl === 'p')) {
        e.preventDefault()
        if (kl === 'n') nextRef.current?.(); else prevRef.current?.()
        return
      }
      // Arrow keys — ห้ามดักถ้าไม่มี player พร้อม
      if (k === 'ArrowLeft') { e.preventDefault(); trySeek(shift ? -10 : -5); return }
      if (k === 'ArrowRight') { e.preventDefault(); trySeek(shift ? 10 : 5); return }
      if (k === 'ArrowUp') { e.preventDefault(); tryVol(10); return }
      if (k === 'ArrowDown') { e.preventDefault(); tryVol(-10); return }
      if (k === 'Escape') {
        e.preventDefault()
        // ponytail: ถ้าเพิ่งย่อลงแถบล่าง → Esc = ขยายกลับ ถ้าไม่ได้อยู่ในโหมดย่อ → Esc = ปิด player
        if (miniRef.current) setMini(false); else closeRef.current?.()
        return
      }
      if (shift) return
      if (k === ' ' || kl === 'k') {
        e.preventDefault()
        try { if (playingRef.current) p?.pauseVideo(); else p?.playVideo() } catch { /* ข้าม */ }
        return
      }
      if (kl === 'm') {
        e.preventDefault()
        try { if (p?.isMuted()) p.unMute(); else p?.mute() } catch { /* ข้าม */ }
        return
      }
      if (kl === 'l') { e.preventDefault(); loopToggleRef.current?.(); return }
      if (kl === 'a') { e.preventDefault(); audioToggleRef.current?.(); return }
      if (kl === 'c') { e.preventDefault(); carToggleRef.current?.(); return }
      if (kl === 'f') {
        e.preventDefault()
        // ponytail: ตอนย่อลงแถบล่าง iframe สูง 2px — F ต้องขยายก่อน ไม่งั้น fullscreen กล่องจิ๋ว
        if (miniRef.current) setMini(false); else full()
        return
      }
      if (kl === 'x') { e.preventDefault(); closeRef.current?.(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function toggle() {
    try {
      if (playing) playerRef.current?.pauseVideo()
      else playerRef.current?.playVideo()
    } catch { /* ข้าม */ }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const p = playerRef.current
    if (!p || !prog.d) return
    const r = e.currentTarget.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    try { p.seekTo(frac * prog.d, true) } catch { /* ข้าม */ }
  }
  useEffect(() => {
    if (playerRef.current) playerRef.current.loadVideoById(id)
    else {
      const f = boxRef.current?.querySelector('iframe')
      if (f) f.src = plainSrc(id)
    }
  }, [id])

  function full() {
    // ponytail: ใช้ Fullscreen API ของ browser ตรงๆ ไม่ต้อง lib
    const el = wrapRef.current as HTMLDivElement & { webkitRequestFullscreen?: () => void }
    if (document.fullscreenElement) void document.exitFullscreen()
    else if (wrapRef.current?.requestFullscreen) void wrapRef.current.requestFullscreen()
    else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen()
  }
  return (
    <div className={['player-wrap', mini && !audioOnly && 'tucked'].filter(Boolean).join(' ')} ref={wrapRef}>
      <div className="player" ref={boxRef} />
      {audioOnly && track && !mini && (
        <div className="audiofull" style={{ '--art': `url("${track.thumb}")` } as CSSProperties}>
          <button className="carfab" onClick={onToggleCar} title="โหมดรถ (C)">🚗</button>
          <div className="sp-top">
            <button className="sp-chev" onClick={() => setMini(true)} aria-label="ย่อ (เพลงเล่นต่อ)" title="ย่อ (เพลงเล่นต่อ)">⌄</button>
            <div className="sp-context">{context ?? 'กำลังเล่น'}</div>
            <span className="sp-chev" aria-hidden="true" />
          </div>
          <img className="sp-art" src={track.thumb} alt="" loading="lazy" />
          <div className="sp-meta">
            <div className="atitle">{track.title}</div>
            <div className="aartist">{track.channel}</div>
          </div>
          <div className="pbar" onClick={seek}>
            <div className="pfill" style={{ width: `${prog.d ? (prog.t / prog.d) * 100 : 0}%` }} />
          </div>
          <div className="ptime"><span>{fmt(prog.t)}</span><span>-{fmt(Math.max(0, prog.d - prog.t))}</span></div>
          <div className="arow">
            {onShuffle ? <button className="sp-glyph" onClick={onShuffle} title="สุ่ม">🔀</button> : <span />}
            {onPrev ? <button className="sp-glyph big" onClick={onPrev} disabled={!hasPrev} title="ก่อนหน้า (Shift+P)">⏮</button> : <span />}
            {ctl ? (
              <button className="bigplay" onClick={toggle} aria-label={playing ? 'หยุด (Space)' : 'เล่น (Space)'}>
                {playing ? '⏸' : '▶'}
              </button>
            ) : (
              <div className="muted">กำลังโหลด…</div>
            )}
            {onNext ? <button className="sp-glyph big" onClick={onNext} disabled={!hasNext} title="ถัดไป (Shift+N)">⏭</button> : <span />}
            {onToggleLoop && (
              <button className={loopOne ? 'sp-glyph' : 'sp-glyph off'} onClick={onToggleLoop} title="เล่นเพลงนี้ซ้ำ (L)">
                🔂
              </button>
            )}
            <button className="sp-glyph" onClick={onClose} title="ปิด (Esc)">✕</button>
          </div>
          {onPip && (
            <button className="piphelp" onClick={onPip}>📺 เปิด PiP แล้วล็อกจอฟังต่อได้</button>
          )}
        </div>
      )}
      {!audioOnly && (
      <div className="row">
        {(onPrev || onNext || onShuffle) && (
          <>
            <button className="close" onClick={onPrev} disabled={!hasPrev} title="ก่อนหน้า (Shift+P)">‹</button>
            <button className="close" onClick={onNext} disabled={!hasNext} title="ถัดไป (Shift+N)">›</button>
            <button className="close" onClick={onShuffle} title="สุ่ม">🔀</button>
          </>
        )}
        <button className="close" onClick={() => setMini(true)} title="ย่อลงแถบล่าง (เพลงเล่นต่อ)">🗕 ย่อ</button>
        <button className="close" onClick={full} title="เต็มจอ (F)">⛶ เต็มจอ</button>
        <button className="close" onClick={onClose} title="ปิด (Esc)">✕ ปิด</button>
      </div>
      )}
      {track && mini && (
        <div className="minibar">
          <img src={track.thumb} alt="" loading="lazy" />
          <div className="mmeta">
            <div className="mtitle">{track.title}</div>
            {context && <div className="mcontext">{context}</div>}
          </div>
          {ctl && (
            <button onClick={toggle} aria-label={playing ? 'หยุด (Space)' : 'เล่น (Space)'} title={playing ? 'หยุด (Space)' : 'เล่น (Space)'}>{playing ? '⏸' : '▶'}</button>
          )}
          <button onClick={() => setMini(false)} aria-label="ขยาย" title="ขยาย">▲</button>
          <button onClick={onClose} aria-label="ปิด" title="ปิด (Esc)">✕</button>
        </div>
      )}
    </div>
  )
}
