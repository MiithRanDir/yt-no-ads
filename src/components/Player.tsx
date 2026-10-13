import { useEffect, useRef, useState } from 'react'

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

export default function Player({ id, onClose, onEnded, onNext, onPrev, onShuffle, hasNext, hasPrev, track, audioOnly }: Props) {
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
  // ponytail: state ไว้โชว์การ์ด Spotify — playing/progress อัปเดตจาก player ตรงๆ
  const [playing, setPlaying] = useState(false)
  const [ctl, setCtl] = useState(false)
  const [prog, setProg] = useState({ t: 0, d: 0 })
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null

  // ponytail: Media Session — ปุ่มพวงมาลัย/CarPlay/Control Center คุมแอปได้ (play/pause/next/prev)
  useEffect(() => {
    const ms = navigator.mediaSession
    if (!ms) return
    try {
      ms.setActionHandler('play', () => { try { playerRef.current?.playVideo() } catch { /* ข้าม */ } ms.playbackState = 'playing' })
      ms.setActionHandler('pause', () => { try { playerRef.current?.pauseVideo() } catch { /* ข้าม */ } ms.playbackState = 'paused' })
      ms.setActionHandler('previoustrack', () => prevRef.current?.())
      ms.setActionHandler('nexttrack', () => nextRef.current?.())
    } catch { /* browser ไม่รองรับบาง action */ }
  }, [])

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
              if (e.data === 0) endedRef.current?.()
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

  // แถบเวลา: ถาม player ทุกวิ (โหมดเสียงเท่านั้น)
  useEffect(() => {
    if (!audioOnly) return
    const iv = window.setInterval(() => {
      try {
        const p = playerRef.current
        if (p) setProg({ t: p.getCurrentTime() || 0, d: p.getDuration() || 0 })
      } catch { /* ข้าม */ }
    }, 1000)
    return () => window.clearInterval(iv)
  }, [audioOnly, id])

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
    <div className="player-wrap" ref={wrapRef}>
      <div className="player" ref={boxRef} />
      {audioOnly && track && (
        <div className="audiocard">
          <img src={track.thumb} alt="" loading="lazy" />
          <div className="atitle">{track.title}</div>
          <div className="aartist">{track.channel}</div>
          <div className="pbar" onClick={seek}>
            <div className="pfill" style={{ width: `${prog.d ? (prog.t / prog.d) * 100 : 0}%` }} />
          </div>
          <div className="ptime"><span>{fmt(prog.t)}</span><span>{fmt(prog.d)}</span></div>
          {ctl && (
            <button className="bigplay" onClick={toggle} aria-label={playing ? 'หยุด' : 'เล่น'}>
              {playing ? '⏸' : '▶'}
            </button>
          )}
        </div>
      )}
      <div className="row">
        {(onPrev || onNext || onShuffle) && (
          <>
            <button className="close" onClick={onPrev} disabled={!hasPrev} title="ก่อนหน้า (Shift+P)">‹</button>
            <button className="close" onClick={onNext} disabled={!hasNext} title="ถัดไป (Shift+N)">›</button>
            <button className="close" onClick={onShuffle} title="สุ่ม">🔀</button>
          </>
        )}
        <button className="close" onClick={full}>
          ⛶ เต็มจอ
        </button>
        <button className="close" onClick={onClose}>
          ✕ ปิด
        </button>
      </div>
    </div>
  )
}
