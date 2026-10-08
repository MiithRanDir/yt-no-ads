import type { VideoItem } from '../lib/youtube'

export default function VideoCard({ v, onPlay, onAdd }: { v: VideoItem; onPlay: (v: VideoItem) => void; onAdd?: (v: VideoItem) => void }) {
  return (
    <div className="card" onClick={() => onPlay(v)}>
      <img src={v.thumb} alt={v.title} loading="lazy" />
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
