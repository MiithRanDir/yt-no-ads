import type { VideoItem } from '../lib/youtube'
import { hasCached } from '../lib/videoCache'

export default function VideoCard({ v, onPlay, onAdd }: { v: VideoItem; onPlay: (v: VideoItem) => void; onAdd?: (v: VideoItem) => void }) {
  const cached = hasCached(v.id)
  return (
    <div className="card" onClick={() => onPlay(v)}>
      <div className="thumb">
        <img src={v.thumb} alt={v.title} loading="lazy" />
        {v.live && <span className="livebadge">● ไลฟ์สด</span>}
        {cached && <span className="cachebadge" title="cached">⚡</span>}
      </div>
      <h3>{v.title}</h3>
      <p>{v.channel}</p>
      {onAdd && (
        <button
          className="add"
          title="เพิ่มลงเพลย์ลิสต์"
          onClick={(e) => { e.stopPropagation(); onAdd(v) }}
        >
          +
        </button>
      )}
    </div>
  )
}
