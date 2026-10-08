import { useState } from 'react'
import type { VideoItem } from '../lib/youtube'
import { dedupe, loadPlaylists, savePlaylists, exportJSON, importJSON, uid, MAX_ITEMS, type Playlist } from '../lib/playlists'

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>(loadPlaylists)

  function persist(next: Playlist[]) {
    savePlaylists(next)
    setPlaylists(next)
  }

  function create(name: string, source: Playlist['source'] = 'manual'): Playlist {
    const p: Playlist = { id: uid(), name: name.trim() || 'เพลย์ลิสต์', items: [], createdAt: Date.now(), updatedAt: Date.now(), source }
    persist([p, ...playlists])
    return p
  }

  function remove(id: string) {
    persist(playlists.filter((p) => p.id !== id))
  }

  function rename(id: string, name: string) {
    const n = name.trim()
    if (!n) return
    persist(playlists.map((p) => (p.id === id ? { ...p, name: n, updatedAt: Date.now() } : p)))
  }

  function addItem(pid: string, video: VideoItem) {
    persist(playlists.map((p) => (p.id === pid && !p.items.some((x) => x.id === video.id)
      ? { ...p, items: [...p.items, video].slice(0, MAX_ITEMS), updatedAt: Date.now() }
      : p)))
  }

  function removeItem(pid: string, videoId: string) {
    persist(playlists.map((p) => (p.id === pid
      ? { ...p, items: p.items.filter((x) => x.id !== videoId), updatedAt: Date.now() }
      : p)))
  }

  function importItems(pid: string, videos: VideoItem[]) {
    persist(playlists.map((p) => (p.id === pid
      ? { ...p, items: dedupe([...p.items, ...videos]).slice(0, MAX_ITEMS), updatedAt: Date.now() }
      : p)))
  }

  function replaceAll(pls: Playlist[]) {
    persist(pls)
  }

  function exportAll(): string {
    return exportJSON(playlists)
  }

  function importAll(raw: string): Playlist[] {
    const pls = importJSON(raw)
    persist(pls)
    return pls
  }

  return { playlists, create, remove, rename, addItem, removeItem, importItems, replaceAll, exportAll, importAll }
}
