import { useEffect, useRef } from 'react'

interface Props {
  id: string
  onClose: () => void
  onEnded?: () => void
  onNext?: () => void
  onPrev?: () => void
  onShuffle?: () => void
  hasNext?: boolean
  hasPrev?: boolean
}

// ponytail: IFrame API จับ event จบคลิป (ENDED=0) เพื่อ auto-next ไม่ใช้ timer
interface ApiPlayer { loadVideoById: (id: string) => void; destroy: () => void }
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

export default function Player({ id, onClose, onEnded, onNext, onPrev, onShuffle, hasNext, hasPrev }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<ApiPlayer | null>(null)
  const idRef = useRef(id)
  idRef.current = id
  const endedRef = useRef(onEnded)
  endedRef.current = onEnded
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null

  // ponytail: YT.Player แทนที่ node ที่ครอบมัน ห้ามครอบ node ที่ React จัดการ
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
          events: { onStateChange: (e: { data: number }) => { if (e.data === 0) endedRef.current?.() } },
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

  // เปลี่ยนเพลง: สั่ง player เดิมโหลดใหม่ ไม่แตะ DOM
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
      <div className="row">
        {(onPrev || onNext || onShuffle) && (
          <>
            <button className="close" onClick={onPrev} disabled={!hasPrev} title="ก่อนหน้า">‹</button>
            <button className="close" onClick={onNext} disabled={!hasNext} title="ถัดไป">›</button>
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
