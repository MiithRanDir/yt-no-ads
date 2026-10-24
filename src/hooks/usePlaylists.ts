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

  // ponytail: target index อ้างอิงรายการก่อนย้าย (drag ลงช่องว่างหลังการ์ด i = วางที่ i)
  // ถ้าจะย้ายลง ต้องข้ามของที่ยังไม่ขยับ → afterRemove = to > from ? to - 1 : to
  function reorderItem(pid: string, from: number, to: number) {
    update((prev) => prev.map((p) => {
      if (p.id !== pid) return p
      const n = p.items.length
      if (from < 0 || from >= n || to < 0 || to >= n || from === to) return p
      const items = p.items.slice()
      const [moved] = items.splice(from, 1)
      const insertAt = to > from ? to - 1 : to
      items.splice(insertAt, 0, moved)
      return { ...p, items, updatedAt: Date.now() }
    }))
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

  return { playlists, create, remove, rename, addItem, removeItem, reorderItem, importItems, replaceAll, exportAll, importAll }
}
