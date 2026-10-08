import { useState } from 'react'
import type { VideoItem } from '../lib/youtube'
import { dedupe, loadPlaylists, savePlaylists, exportJSON, importJSON, uid, MAX_ITEMS, type Playlist } from '../lib/playlists'

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>(loadPlaylists)

  // ponytail: functional update ทุกตัว — create ต่อด้วย addItem/importItems ใน tick เดียวกัน
  // ถ้าใช้ playlists จาก closure ตัวหลังจะเขียนทับตัวแรก (playlist หาย)
  function update(fn: (prev: Playlist[]) => Playlist[]) {
    setPlaylists((prev) => {
      const next = fn(prev)
      savePlaylists(next)
      return next
    })
  }

  function create(name: string, source: Playlist['source'] = 'manual'): Playlist {
    const p: Playlist = { id: uid(), name: name.trim() || 'เพลย์ลิสต์', items: [], createdAt: Date.now(), updatedAt: Date.now(), source }
    update((prev) => [p, ...prev])
    return p
  }

  function remove(id: string) {
    update((prev) => prev.filter((p) => p.id !== id))
  }

  function rename(id: string, name: string) {
    const n = name.trim()
    if (!n) return
    update((prev) => prev.map((p) => (p.id === id ? { ...p, name: n, updatedAt: Date.now() } : p)))
  }

  function addItem(pid: string, video: VideoItem) {
    update((prev) => prev.map((p) => (p.id === pid && !p.items.some((x) => x.id === video.id)
      ? { ...p, items: [...p.items, video].slice(0, MAX_ITEMS), updatedAt: Date.now() }
      : p)))
  }

  function removeItem(pid: string, videoId: string) {
    update((prev) => prev.map((p) => (p.id === pid
      ? { ...p, items: p.items.filter((x) => x.id !== videoId), updatedAt: Date.now() }
      : p)))
  }

  function importItems(pid: string, videos: VideoItem[]) {
    update((prev) => prev.map((p) => (p.id === pid
      ? { ...p, items: dedupe([...p.items, ...videos]).slice(0, MAX_ITEMS), updatedAt: Date.now() }
      : p)))
  }

  function replaceAll(pls: Playlist[]) {
    update(() => pls)
  }

  function exportAll(): string {
    return exportJSON(playlists)
  }

  function importAll(raw: string): Playlist[] {
    const pls = importJSON(raw)
    update(() => pls)
    return pls
  }

  return { playlists, create, remove, rename, addItem, removeItem, importItems, replaceAll, exportAll, importAll }
}
