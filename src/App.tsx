import { useCallback, useEffect, useMemo, useState } from 'react'
import SearchBar from './components/SearchBar'
import VideoCard from './components/VideoCard'
import Player from './components/Player'
import { useHistory } from './hooks/useHistory'
import { debounce, getTrending, searchVideos, type VideoItem } from './lib/youtube'
import { getQuota, DAILY_LIMIT } from './lib/quota'

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
    push(v)
    window.scrollTo({ top: 0 })
  }

  const list = searched ? videos : trending

  return (
    <div className="app">
      <div className="header">
        <div className="logo">
          <span>▶</span> YT No Ads
        </div>
        <SearchBar onSearch={(q) => { void doSearch(q) }} onType={(q) => { if (q.trim().length >= 3) debounced(q) }} />
        <div className="quota" title={`ใช้ไป ${quota.used}/${DAILY_LIMIT} units รีเซ็ตเที่ยงคืน Pacific (search=100 trending=1 ไม่นับ cache hit)`}>
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

      {current && <Player id={current.id} onClose={() => setCurrent(null)} />}

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">กำลังค้นหา…</div>}

      <div className="section">{searched ? 'ผลการค้นหา' : '🔥 Trending ไทย'}</div>
      <div className="grid">
        {list.map((v) => (
          <VideoCard key={v.id} v={v} onPlay={play} />
        ))}
      </div>
      {!loading && searched && videos.length === 0 && !error && (
        <div className="loading">ไม่พบผลลัพธ์</div>
      )}
    </div>
  )
}
