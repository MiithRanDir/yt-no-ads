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
declare global {
  interface Window { YT?: { Player: new (el: HTMLIFrameElement, opts: unknown) => { destroy: () => void } }; onYouTubeIframeAPIReady?: () => void }
}

let apiPromise: Promise<void> | null = null
function loadApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.YT?.Player) return Promise.resolve()
  if (!apiPromise) {
    apiPromise = new Promise<void>((resolve) => {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve() }
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(s)
      // fallback ถ้า callback ไม่มา (adblock): resolve หลัง 5s ให้ปุ่ม manual ยังใช้ได้
      setTimeout(() => resolve(), 5000)
    })
  }
  return apiPromise
}

export default function Player({ id, onClose, onEnded, onNext, onPrev, onShuffle, hasNext, hasPrev }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const endedRef = useRef(onEnded)
  endedRef.current = onEnded
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null

  useEffect(() => {
    let player: { destroy: () => void } | null = null
    let alive = true
    void loadApi().then(() => {
      if (!alive || !frameRef.current || !window.YT?.Player) return
      player = new window.YT.Player(frameRef.current, {
        events: { onStateChange: (e: { data: number }) => { if (e.data === 0) endedRef.current?.() } },
      })
    })
    return () => { alive = false; try { player?.destroy() } catch { /* ข้าม */ } }
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
      <div className="player">
        <iframe
          ref={frameRef}
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&enablejsapi=1`}
          title="player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
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
