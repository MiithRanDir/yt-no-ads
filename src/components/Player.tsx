import { useRef } from 'react'

export default function Player({ id, onClose }: { id: string; onClose: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null
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
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title="player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="row">
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
