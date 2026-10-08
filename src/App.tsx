import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SearchBar from './components/SearchBar'
import VideoCard from './components/VideoCard'
import Player from './components/Player'
import { useHistory } from './hooks/useHistory'
import { usePlaylists } from './hooks/usePlaylists'
import { debounce, fetchPlaylistItems, getTrending, searchVideos, type VideoItem } from './lib/youtube'
import { COST_PLAYLIST, getQuota, DAILY_LIMIT } from './lib/quota'
import { parseYoutubeListId } from './lib/playlists'

export default function App() {
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [trending, setTrending] = useState<VideoItem[]>([])
  const [current, setCurrent] = useState<VideoItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [quotaTick, setQuotaTick] = useState(0)
  // ponytail: อ่าน quota ใหม่ทุก render ที่ tick เปลี่ยน ไม่ต้อง subscribe
  const quota = getQuota()
  void quotaTick
  const { history, push, clear } = useHistory()
  const { playlists, create, remove, addItem, removeItem, importItems, exportAll, importAll } = usePlaylists()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [queue, setQueue] = useState<VideoItem[]>([])
  const [qi, setQi] = useState(0)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const active = playlists.find((p) => p.id === activeId) ?? null

  useEffect(() => {
    getTrending().then((t) => { setTrending(t); setQuotaTick((n) => n + 1) }).catch(() => {})
  }, [])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      setVideos(await searchVideos(q))
      setQuotaTick((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ค้นหาไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  // ponytail: debounce 500ms ชั้นเดียวขณะพิมพ์ ไม่แยก hook
  const debounced = useMemo(() => debounce(doSearch, 500), [doSearch])

  function play(v: VideoItem) {
    setCurrent(v)
    setQueue([])
    push(v)
    window.scrollTo({ top: 0 })
  }

  function playQueue(items: VideoItem[], start: number) {
    if (!items[start]) return
    setQueue(items)
    setQi(start)
    setCurrent(items[start])
    push(items[start])
    window.scrollTo({ top: 0 })
  }

  function next() {
    if (queue.length === 0) return
    const n = (qi + 1) % queue.length
    setQi(n)
    setCurrent(queue[n])
    push(queue[n])
  }

  function prev() {
    if (queue.length === 0) return
    const n = (qi - 1 + queue.length) % queue.length
    setQi(n)
    setCurrent(queue[n])
    push(queue[n])
  }

  function shuffle() {
    if (queue.length < 2) return
    const n = Math.floor(Math.random() * queue.length)
    setQi(n)
    setCurrent(queue[n])
    push(queue[n])
  }

  function handleAdd(v: VideoItem) {
    let pid = activeId
    if (!pid) {
      pid = create('เพลย์ลิสต์ 1').id
      setActiveId(pid)
    }
    addItem(pid, v)
    setQuotaTick((n) => n + 1) // rerender นับใหม่ ไม่เสีย quota
  }

  async function doImport() {
    const listId = parseYoutubeListId(importUrl)
    if (!listId) { setImportMsg('ลิงก์ไม่ถูกต้อง: หา list= ไม่เจอ'); return }
    setImporting(true)
    setImportMsg('')
    try {
      const items = await fetchPlaylistItems(listId)
      const cost = Math.max(1, Math.ceil(items.length / 50)) * COST_PLAYLIST
      let pid = activeId
      if (!pid) {
        const p = create(`YT ${listId.slice(0, 8)}`, 'youtube')
        pid = p.id
        setActiveId(pid)
      } else {
        importItems(pid, items)
      }
      if (activeId) { /* importItems แล้วข้างบน */ } else {
        importItems(pid, items)
      }
      setQuotaTick((n) => n + 1)
      setImportMsg(`นำเข้า ${items.length} คลิป (~${cost} units) สำเร็จ`)
      setImportUrl('')
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'นำเข้าไม่สำเร็จ')
    } finally {
      setImporting(false)
    }
  }

  function doExport() {
    const blob = new Blob([exportAll()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'playlists.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function doImportFile(f: File | undefined) {
    if (!f) return
    try {
      const pls = importAll(await f.text())
      setActiveId(pls[0]?.id ?? null)
      setImportMsg(`โหลดไฟล์ ${pls.length} เพลย์ลิสต์สำเร็จ`)
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'ไฟล์ไม่ถูกต้อง')
    }
  }

  const list = searched ? videos : trending

  return (
    <div className="app">
      <div className="header">
        <div className="logo">
          <span>▶</span> YT No Ads
        </div>
        <SearchBar onSearch={(q) => { void doSearch(q) }} onType={(q) => { if (q.trim().length >= 3) debounced(q) }} />
        <div className="quota" title={`ใช้ไป ${quota.used}/${DAILY_LIMIT} units รีเซ็ตเที่ยงคืน Pacific (search=100 trending=1 playlist=1/หน้า ไม่นับ cache hit)`}>
          quota เหลือ ~{quota.remaining}/{DAILY_LIMIT}
        </div>
      </div>

      {history.length > 0 && (
        <>
          <div className="section">
            ประวัติ <button className="clear" onClick={clear}>ล้าง</button>
          </div>
          <div className="history">
            {history.map((v) => (
              <button key={v.id} onClick={() => play(v)}>{v.title.slice(0, 30)}…</button>
            ))}
          </div>
        </>
      )}

      <div className="section">
        เพลย์ลิสต์
        <span className="prow">
          <button className="clear" onClick={() => { const p = create(`เพลย์ลิสต์ ${playlists.length + 1}`); setActiveId(p.id) }}>+ สร้าง</button>
          <button className="clear" onClick={doExport} disabled={playlists.length === 0}>⤓ export</button>
          <button className="clear" onClick={() => fileRef.current?.click()}>⤒ import ไฟล์</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { void doImportFile(e.target.files?.[0]); e.target.value = '' }} />
        </span>
      </div>
      <div className="plist">
        {playlists.map((p) => (
          <button key={p.id} className={p.id === activeId ? 'on' : ''} onClick={() => setActiveId(p.id === activeId ? null : p.id)}>
            {p.name} ({p.items.length}){p.source === 'youtube' ? ' ▶' : ''}
          </button>
        ))}
        {playlists.length === 0 && <span className="muted">ยังไม่มี — กด + สร้าง หรือวางลิงก์ YouTube ด้านล่าง</span>}
      </div>
      <div className="prow import">
        <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="วางลิงก์ playlist YouTube… (…?list=XXXX)" aria-label="ลิงก์เพลย์ลิสต์" />
        <button onClick={() => { void doImport() }} disabled={importing || !importUrl.trim()}>{importing ? 'กำลังดึง…' : 'ดึงจาก YouTube'}</button>
        {active && <button className="clear" onClick={() => remove(active.id)}>ลบ “{active.name}”</button>}
      </div>
      {importMsg && <div className="loading">{importMsg}</div>}
      {active && active.items.length > 0 && (
        <div className="history queue">
          {active.items.map((v, i) => (
            <span key={v.id} className="qitem">
              <button onClick={() => playQueue(active.items, i)}>{i + 1}. {v.title.slice(0, 28)}…</button>
              <button className="clear" onClick={() => removeItem(active.id, v.id)} title="ลบออก">✕</button>
            </span>
          ))}
        </div>
      )}

      {current && (
        <Player
          id={current.id}
          onClose={() => { setCurrent(null); setQueue([]) }}
          onEnded={queue.length > 1 ? next : undefined}
          onNext={queue.length > 1 ? next : undefined}
          onPrev={queue.length > 1 ? prev : undefined}
          onShuffle={queue.length > 1 ? shuffle : undefined}
          hasNext={queue.length > 1}
          hasPrev={queue.length > 1}
        />
      )}

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">กำลังค้นหา…</div>}

      <div className="section">{searched ? 'ผลการค้นหา' : '🔥 Trending ไทย'}</div>
      <div className="grid">
        {list.map((v) => (
          <VideoCard key={v.id} v={v} onPlay={play} onAdd={handleAdd} />
        ))}
      </div>
      {!loading && searched && videos.length === 0 && !error && (
        <div className="loading">ไม่พบผลลัพธ์</div>
      )}
    </div>
  )
}
