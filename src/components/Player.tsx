export default function Player({ id, onClose }: { id: string; onClose: () => void }) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null
  return (
    <div className="player-wrap">
      <div className="player">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title="player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <button className="close" onClick={onClose}>
        ✕ ปิด
      </button>
    </div>
  )
}
