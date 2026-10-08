import { useState } from 'react'
import type { VideoItem } from '../lib/youtube'
import type { Playlist } from '../lib/playlists'

interface Props {
  video: VideoItem
  playlists: Playlist[]
  onPick: (pid: string) => void
  onCreate: (name: string) => void
  onClose: () => void
}

// ponytail: popup เลือก playlist ปลายทาง เช็คซ้ำให้เลย ไม่ต้อง dropdown ซับซ้อน
export default function PlaylistPicker({ video, playlists, onPick, onCreate, onClose }: Props) {
  const [name, setName] = useState('')
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">เพิ่มลงเพลย์ลิสต์</div>
        <div className="sheet-sub">{video.title.slice(0, 60)}</div>
        {playlists.length === 0 && <div className="muted">ยังไม่มีเพลย์ลิสต์ — ตั้งชื่อสร้างใหม่ด้านล่างได้เลย</div>}
        <div className="picklist">
          {playlists.map((p) => {
            const has = p.items.some((x) => x.id === video.id)
            return (
              <button key={p.id} className="pickrow" disabled={has} onClick={() => onPick(p.id)}>
                <span>{has ? '✓ ' : '+ '}{p.name}</span>
                <span className="muted">{p.items.length} เพลง{has ? ' • มีแล้ว' : ''}</span>
              </button>
            )
          })}
        </div>
        <div className="prow import">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อเพลย์ลิสต์ใหม่…"
            aria-label="ชื่อเพลย์ลิสต์ใหม่"
          />
          <button onClick={() => onCreate(name.trim() || `เพลย์ลิสต์ ${playlists.length + 1}`)}>สร้าง + เพิ่ม</button>
        </div>
        <button className="clear" onClick={onClose}>ยกเลิก</button>
      </div>
    </div>
  )
}
