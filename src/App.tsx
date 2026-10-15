import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SearchBar from './components/SearchBar'
import InstallButton from './components/InstallButton'
import VideoCard from './components/VideoCard'
import Player from './components/Player'
import PlaylistPicker from './components/PlaylistPicker'
import { useHistory } from './hooks/useHistory'
import { usePlaylists } from './hooks/usePlaylists'
import { debounce, fetchPlaylistItems, getTrending, searchVideos, type VideoItem } from './lib/youtube'
import { COST_PLAYLIST, getQuota, DAILY_LIMIT } from './lib/quota'
import { parseYoutubeListId, exportJSON as playlistsToJSON } from './lib/playlists'
import { loadSession, saveSession } from './lib/session'
import { syncLogin, syncLogout, syncPull, syncPush } from './lib/sync'

type Menu = 'home' | 'playlists'

export default function App() {
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [trending, setTrending] = useState<VideoItem[]>([])
  const [current, setCurrent] = useState<VideoItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [liveOnly, setLiveOnly] = useState(false)
  // ponytail: โหมดเสียงอย่างเดียว (ย่อจอ+240p) จำไว้ข้าม session — ช่วยเครื่องเก่าไม่ lag
  const [audioOnly, setAudioOnly] = useState(() => { try { return localStorage.getItem('yt-audio-mode') === '1' } catch { return false } })
  // ponytail: โหมดรถ — ขยายจอ Now Playing + ปุ่มให้กดง่ายบนจอรถ
  const [carMode, setCarMode] = useState(() => { try { return localStorage.getItem('yt-car-mode') === '1' } catch { return false } })
  // ponytail: loop เพลงเดียวซ้ำ จำไว้ข้าม session
  const [loopOne, setLoopOne] = useState(() => { try { return localStorage.getItem('yt-loop-one') === '1' } catch { return false } })
  function toggleLoop() {
    setLoopOne((v) => { const n = !v; try { localStorage.setItem('yt-loop-one', n ? '1' : '0') } catch { /* ข้าม */ } return n })
  }
  // ponytail: ปุ่มลัด PiP — เว็บสั่ง PiP ข้าม iframe ไม่ได้ เลยพากลับจอวิดีโอ + ชี้ปุ่ม PiP ของตัวเล่นให้
  const [pipHint, setPipHint] = useState(false)
  function pipHelp() {
    setAudioOnly(false)
    try { localStorage.setItem('yt-audio-mode', '0') } catch { /* ข้าม */ }
    setPipHint(true)
    window.scrollTo({ top: 0 })
    window.setTimeout(() => setPipHint(false), 9000)
  }
  function toggleCar() {
    setCarMode((v) => { const n = !v; try { localStorage.setItem('yt-car-mode', n ? '1' : '0') } catch { /* ข้าม */ } return n })
  }
  const lastQ = useRef('')
  const [quotaTick, setQuotaTick] = useState(0)
  // ponytail: อ่าน quota ใหม่ทุก render ที่ tick เปลี่ยน ไม่ต้อง subscribe
  const quota = getQuota()
  void quotaTick
  const { history, push, clear } = useHistory()
  const { playlists, create, remove, rename, addItem, removeItem, importItems, replaceAll, exportAll, importAll } = usePlaylists()
  const [menu, setMenu] = useState<Menu>('home')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [queue, setQueue] = useState<VideoItem[]>([])
  const [qi, setQi] = useState(0)
  const [queuePid, setQueuePid] = useState<string | null>(null)
  const [picker, setPicker] = useState<VideoItem | null>(null)
  const [notice, setNotice] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [renameVal, setRenameVal] = useState('')
  // ponytail: server sync — รหัสสั้นครั้งเดียวได้ cookie 1 ปี, lastSynced กัน loop push หลัง pull
  const [needLogin, setNeedLogin] = useState(true) // เริ่มจากล็อกก่อน พิสูจน์ cookie ผ่านค่อยเปิด
  const [pw, setPw] = useState('')
  const [syncStatus, setSyncStatus] = useState('')
  const [syncBusy, setSyncBusy] = useState(false)
  const lastSynced = useRef<string | null>(null)
  const pushTimer = useRef<number | null>(null)
  function stamp(): string {
    return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  }

  async function doSyncPull(silent = false) {
    setSyncBusy(true)
    if (!silent) setSyncStatus('กำลังดึงข้อมูล…')
    try {
      const remote = await syncPull()
      const remoteJson = playlistsToJSON(remote)
      lastSynced.current = remoteJson
      const localJson = playlistsToJSON(playlists)
      if (remote.length === 0 && playlists.length > 0) {
        // ไฟล์กลางว่าง → อัปโหลดของเครื่องนี้ขึ้นไป ห้ามล้างเครื่อง
        await syncPush(playlists)
        lastSynced.current = localJson
        setSyncStatus(`อัปโหลดของเครื่องนี้แล้ว ${stamp()}`)
      } else if (remoteJson !== localJson) {
        replaceAll(remote)
        const first = remote[0]
        if (first && !playlists.some((p) => p.id === activeId)) { setActiveId(first.id); setRenameVal(first.name) }
        setSyncStatus(`ดึงล่าสุดแล้ว ${stamp()} (${remote.length} ลิสต์)`)
      } else {
        setSyncStatus(`ตรงกันแล้ว ${stamp()}`)
      }
      setNeedLogin(false)
    } catch (e) {
      if (e instanceof Error && e.message === 'NEED_LOGIN') {
        setNeedLogin(true)
        setSyncStatus('ใส่รหัสครั้งเดียวเพื่อซิงค์ข้ามเครื่อง')
      } else {
        setSyncStatus(e instanceof Error ? e.message : 'ซิงค์ไม่สำเร็จ')
      }
    } finally {
      setSyncBusy(false)
    }
  }

  async function doLogin() {
    if (!pw.trim()) return
    setSyncBusy(true)
    try {
      await syncLogin(pw)
      setPw('')
      setNeedLogin(false)
      await doSyncPull()
    } catch (e) {
      setSyncStatus(e instanceof Error ? e.message : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setSyncBusy(false)
    }
  }

  // เปิดแอป: resume จาก session ล่าสุด (ไม่ autoplay — browser บล็อกเสียง ให้กดเล่นเอง)
  useEffect(() => {
    try {
      const s = loadSession()
      if (!s) return
      if (s.pid) {
        const p = playlists.find((x) => x.id === s.pid)
        if (!p || p.items.length === 0) return
        let i = s.qi
        if (p.items[i]?.id !== s.item.id) {
          const f = p.items.findIndex((x) => x.id === s.item.id)
          i = f >= 0 ? f : 0
        }
        setQueue(p.items)
        setQi(i)
        setQueuePid(p.id)
        setCurrent(p.items[i])
        flash(`▶ ต่อจากเดิม: “${p.name}” เพลงที่ ${i + 1}/${p.items.length}`)
      } else {
        setQueue([])
        setQi(0)
        setQueuePid(null)
        setCurrent(s.item)
        flash('▶ ต่อจากเพลงล่าสุด')
      }
    } catch { /* ข้าม */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    void doSyncPull(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // แก้ playlist: รอ 4 วิแล้วอัปโหลด (ข้ามถ้าเพิ่ง pull มา / ยังไม่ login ไม่ยิงซ้ำ)
  useEffect(() => {
    if (needLogin) return
    const cur = playlistsToJSON(playlists)
    if (cur === lastSynced.current) return
    if (pushTimer.current) window.clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(() => {
      syncPush(playlists)
        .then(() => { lastSynced.current = playlistsToJSON(playlists); setSyncStatus(`อัปโหลดแล้ว ${stamp()}`) })
        .catch((e: unknown) => {
          if (e instanceof Error && e.message === 'NEED_LOGIN') setNeedLogin(true)
          else setSyncStatus(e instanceof Error ? e.message : 'อัปโหลดไม่สำเร็จ')
        })
    }, 4000)
    return () => { if (pushTimer.current) window.clearTimeout(pushTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlists, needLogin])

  const fileRef = useRef<HTMLInputElement>(null)
  const active = playlists.find((p) => p.id === activeId) ?? null

  useEffect(() => {
    getTrending().then((t) => { setTrending(t); setQuotaTick((n) => n + 1) }).catch(() => {})
  }, [])

  const doSearch = useCallback(async (q: string, live?: boolean) => {
    if (!q.trim()) return
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      setVideos(await searchVideos(q, { liveOnly: live ?? liveOnly }))
      setQuotaTick((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ค้นหาไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [liveOnly])

  // ponytail: debounce 500ms ชั้นเดียวขณะพิมพ์ ไม่แยก hook
  const debounced = useMemo(() => debounce(doSearch, 500), [doSearch])

  function flash(msg: string) {
    setNotice(msg)
    window.setTimeout(() => setNotice((m) => (m === msg ? '' : m)), 2500)
  }

  function play(v: VideoItem) {
    setCurrent(v)
    setQueue([])
    setQueuePid(null)
    saveSession({ pid: null, qi: 0, item: v })
    push(v)
    window.scrollTo({ top: 0 })
  }

  function playQueue(items: VideoItem[], start: number, pid: string | null = null) {
    if (!items[start]) return
    setQueue(items)
    setQi(start)
    setQueuePid(pid)
    setCurrent(items[start])
    saveSession({ pid, qi: start, item: items[start] })
    push(items[start])
    window.scrollTo({ top: 0 })
  }

  function next() {
    if (queue.length === 0) return
    const n = (qi + 1) % queue.length
    setQi(n)
    setCurrent(queue[n])
    saveSession({ pid: queuePid, qi: n, item: queue[n] })
    push(queue[n])
  }

  function prev() {
    if (queue.length === 0) return
    const n = (qi - 1 + queue.length) % queue.length
    setQi(n)
    setCurrent(queue[n])
    saveSession({ pid: queuePid, qi: n, item: queue[n] })
    push(queue[n])
  }

  function shuffle() {
    if (queue.length < 2) return
    const n = Math.floor(Math.random() * queue.length)
    setQi(n)
    setCurrent(queue[n])
    saveSession({ pid: queuePid, qi: n, item: queue[n] })
    push(queue[n])
  }

  // ponytail: shortcut แบบ YouTube — Shift+N ถัดไป / Shift+P ก่อนหน้า (เฉพาะตอนมี queue)
  // ไม่ทำงานตอนพิมพ์ในช่อง input/textarea
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (!e.shiftKey || queue.length < 2) return
      const k = e.key.toLowerCase()
      if (k === 'n') { e.preventDefault(); next() }
      else if (k === 'p') { e.preventDefault(); prev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, qi])

  // popup + เลือก playlist (เช็คซ้ำอยู่ใน picker)
  function pickAdd(pid: string) {
    if (!picker) return
    const p = playlists.find((x) => x.id === pid)
    addItem(pid, picker)
    flash(`เพิ่มลง “${p?.name ?? ''}” แล้ว`)
    setPicker(null)
  }

  function pickCreate(name: string) {
    if (!picker) return
    const p = create(name)
    addItem(p.id, picker)
    flash(`สร้าง “${p.name}” + เพิ่มเพลงแล้ว`)
    setPicker(null)
  }

  function openDetail(id: string) {
    const p = playlists.find((x) => x.id === id)
    setActiveId(id)
    setRenameVal(p?.name ?? '')
    setImportMsg('')
  }

  async function doImport() {
    const listId = parseYoutubeListId(importUrl)
    if (!listId) { setImportMsg('ลิงก์ไม่ถูกต้อง: หา list= ไม่เจอ'); return }
    setImporting(true)
    setImportMsg('')
    try {
      const items = await fetchPlaylistItems(listId)
      const cost = Math.max(1, Math.ceil(items.length / 50)) * COST_PLAYLIST
      const p = create(`YT ${listId.slice(0, 8)}`, 'youtube')
      importItems(p.id, items)
      setActiveId(p.id)
      setRenameVal(p.name)
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
      setRenameVal(pls[0]?.name ?? '')
      setImportMsg(`โหลดไฟล์ ${pls.length} เพลย์ลิสต์สำเร็จ`)
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'ไฟล์ไม่ถูกต้อง')
    }
  }

  const list = searched ? videos : trending

  return (
    <div className={['app', audioOnly && 'audiomode', carMode && 'carmode'].filter(Boolean).join(' ')}>
      <div className="header">
        <div className="logo">
          <span>▶</span> YT No Ads
        </div>
        <nav className="tabs">
          <button className={menu === 'home' ? 'on' : ''} onClick={() => setMenu('home')}>🏠 หน้าแรก</button>
          <button className={menu === 'playlists' ? 'on' : ''} onClick={() => { setMenu('playlists'); setActiveId(null) }}>
            🎵 เพลย์ลิสต์ ({playlists.length})
          </button>
        </nav>
        <InstallButton />
        {menu === 'home' && (
          <>
            <div className="searchrow">
              <SearchBar onSearch={(q) => { lastQ.current = q; void doSearch(q) }} onType={(q) => { lastQ.current = q; if (q.trim().length >= 3) debounced(q) }} />
            </div>
            <div className="controlsrow">
              <button
                className={audioOnly ? 'audiotoggle on' : 'audiotoggle'}
                title="โหมดเสียงอย่างเดียว (ซ่อนจอ+144p ประหยัดเครื่อง)"
                onClick={() => { const v = !audioOnly; setAudioOnly(v); try { localStorage.setItem('yt-audio-mode', v ? '1' : '0') } catch { /* ข้าม */ } }}
              >
                🎧 เสียงอย่างเดียว
              </button>
              <button
                className={carMode ? 'audiotoggle on' : 'audiotoggle'}
                title="โหมดรถ — ขยายจอเพลง + ปุ่มใหญ่"
                onClick={toggleCar}
              >
                🚗 โหมดรถ
              </button>
              <label className="livecheck" title="ติ๊กแล้วค้นหาเฉพาะวิดีโอที่กำลังไลฟ์สด (eventType=live, cost เท่าเดิม 100 units)">
              <input type="checkbox" checked={liveOnly} onChange={(e) => { const v = e.target.checked; setLiveOnly(v); if (searched && lastQ.current.trim()) void doSearch(lastQ.current, v) }} />
              🔴 ไลฟ์สดอย่างเดียว
            </label>
            </div>
          </>
        )}
        <div className="quota" title={`ใช้ไป ${quota.used}/${DAILY_LIMIT} units รีเซ็ตเที่ยงคืน Pacific (search=100 trending=1 playlist=1/หน้า ไม่นับ cache hit)`}>
          quota เหลือ ~{quota.remaining}/{DAILY_LIMIT}
        </div>
      </div>

      {notice && <div className="notice">{notice}</div>}

      {pipHint && current && (
        <div className="notice">📺 กดปุ่ม PiP (สี่เหลี่ยมมีลูกศร) มุมล่างของตัวเล่น → แล้วล็อกจอฟังต่อได้เลย</div>
      )}

      {current && (
        <Player
          id={current.id}
          track={current}
          audioOnly={audioOnly}
          context={queuePid ? (playlists.find((p) => p.id === queuePid)?.name) : undefined}
          loopOne={loopOne}
          onToggleLoop={toggleLoop}
          onPip={pipHelp}
          onToggleCar={toggleCar}
          onClose={() => { setCurrent(null); setQueue([]) }}
          onEnded={queue.length > 1 ? next : undefined}
          onNext={queue.length > 1 ? next : undefined}
          onPrev={queue.length > 1 ? prev : undefined}
          onShuffle={queue.length > 1 ? shuffle : undefined}
          hasNext={queue.length > 1}
          hasPrev={queue.length > 1}
        />
      )}

      {menu === 'home' && (
        <>
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

          {error && <div className="error">{error}</div>}
          {loading && <div className="loading">กำลังค้นหา…</div>}

          <div className="section">{searched ? (liveOnly ? 'ผลการค้นหา 🔴 ไลฟ์สด' : 'ผลการค้นหา') : '🔥 Trending ไทย'}</div>
          <div className="grid">
            {list.map((v) => (
              <VideoCard key={v.id} v={v} onPlay={play} onAdd={setPicker} />
            ))}
          </div>
          {!loading && searched && videos.length === 0 && !error && (
            <div className="loading">ไม่พบผลลัพธ์</div>
          )}
        </>
      )}

      {menu === 'playlists' && !active && (
        <>
          <div className="section">🎵 เพลย์ลิสต์ทั้งหมด</div>
          <div className="syncbox">
            {needLogin ? (
              <>
                <div className="prow import" style={{ margin: 0 }}>
                  <input
                    type="password"
                    inputMode="text"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void doLogin() }}
                    placeholder="รหัสซิงค์…"
                    aria-label="รหัสซิงค์ข้ามเครื่อง"
                  />
                  <button disabled={syncBusy || !pw.trim()} onClick={() => { void doLogin() }}>
                    เข้าสู่ระบบ
                  </button>
                </div>
                <div className="muted">ใส่รหัสสั้นๆ ครั้งเดียว (ตั้งใน Vercel env APP_PASSWORD) จำยาว 1 ปี — ใช้ซิงค์ playlist ข้าม browser/TV</div>
              </>
            ) : (
              <>
                <div className="prow import" style={{ margin: 0 }}>
                  <button disabled={syncBusy} onClick={() => { void doSyncPull() }}>
                    {syncBusy ? 'กำลังซิงค์…' : '⬇ ซิงค์ตอนนี้'}
                  </button>
                  <button className="clear" onClick={() => { void syncLogout().finally(() => { setNeedLogin(true); setSyncStatus(''); lastSynced.current = null }) }}>ออกจากระบบ</button>
                </div>
                {syncStatus && <div className="muted">☁ {syncStatus}</div>}
              </>
            )}
          </div>
          <div className="prow import">
            <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="วางลิงก์ playlist YouTube… (…?list=XXXX)" aria-label="ลิงก์เพลย์ลิสต์" />
            <button onClick={() => { void doImport() }} disabled={importing || !importUrl.trim()}>{importing ? 'กำลังดึง…' : 'ดึงจาก YouTube'}</button>
            <button className="clear" onClick={doExport} disabled={playlists.length === 0}>⤓ export</button>
            <button className="clear" onClick={() => fileRef.current?.click()}>⤒ import ไฟล์</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { void doImportFile(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          {importMsg && <div className="loading">{importMsg}</div>}
          <div className="plistcards">
            <button className="pcard new" onClick={() => { const p = create(`เพลย์ลิสต์ ${playlists.length + 1}`); openDetail(p.id) }}>
              <div className="noart">＋</div>
              <div className="pname">+ สร้างใหม่</div>
            </button>
            {playlists.map((p) => (
              <button key={p.id} className="pcard" onClick={() => openDetail(p.id)}>
                {p.items[0] ? <img src={p.items[0].thumb} alt="" loading="lazy" /> : <div className="noart">🎵</div>}
                <div className="pname">{p.name}</div>
                <div className="muted">{p.items.length} เพลง{p.source === 'youtube' ? ' • YT' : ''}</div>
              </button>
            ))}
          </div>
          {playlists.length === 0 && <div className="loading">ยังไม่มี — สร้างใหม่หรือวางลิงก์ YouTube ด้านบนได้เลย</div>}
        </>
      )}

      {menu === 'playlists' && active && (
        <>
          <div className="section">
            <button className="clear" onClick={() => setActiveId(null)}>‹ กลับ</button>
            {' '}🎵 {active.name} ({active.items.length})
          </div>
          <div className="prow rename">
            <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} placeholder="ชื่อเพลย์ลิสต์…" aria-label="ชื่อเพลย์ลิสต์" />
            <button onClick={() => { rename(active.id, renameVal) }} disabled={!renameVal.trim() || renameVal.trim() === active.name}>บันทึกชื่อ</button>
            <button className="clear" onClick={() => { if (active.items.length > 0) playQueue(active.items, Math.floor(Math.random() * active.items.length), active.id) }} disabled={active.items.length === 0}>🔀 สุ่มเล่น</button>
            <button className="clear" onClick={() => { if (active.items.length > 0) playQueue(active.items, 0, active.id) }} disabled={active.items.length === 0}>▶ เล่นทั้งหมด</button>
            <button className="clear danger" onClick={() => { remove(active.id); setActiveId(null) }}>ลบเพลย์ลิสต์</button>
          </div>
          <div className="grid">
            {active.items.map((v, i) => (
              <div key={v.id} className="qwrap">
                <VideoCard v={v} onPlay={(vv) => playQueue(active.items, active.items.findIndex((x) => x.id === vv.id), active.id)} onAdd={setPicker} />
                <button className="clear" onClick={() => removeItem(active.id, v.id)} title="ลบออกจากเพลย์ลิสต์">ลบออก ({i + 1})</button>
              </div>
            ))}
          </div>
          {active.items.length === 0 && <div className="loading">ยังไม่มีเพลง — กลับหน้าแรกกด + ที่การ์ดเพื่อเพิ่มได้เลย</div>}
        </>
      )}

      {picker && (
        <PlaylistPicker
          video={picker}
          playlists={playlists}
          onPick={pickAdd}
          onCreate={pickCreate}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}
