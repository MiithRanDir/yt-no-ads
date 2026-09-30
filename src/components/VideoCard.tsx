import type { VideoItem } from '../lib/youtube'

export default function VideoCard({ v, onPlay }: { v: VideoItem; onPlay: (v: VideoItem) => void }) {
  return (
    <button className="card" onClick={() => onPlay(v)}>
      <img src={v.thumb} alt={v.title} loading="lazy" />
      <h3>{v.title}</h3>
      <p>{v.channel}</p>
    </button>
  )
}
