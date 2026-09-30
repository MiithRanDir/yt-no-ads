import { useState } from 'react'
import type { VideoItem } from '../lib/youtube'

const KEY = 'yt-no-ads:history'
const MAX = 20

function load(): VideoItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as VideoItem[]
  } catch {
    return []
  }
}

export function useHistory() {
  const [history, setHistory] = useState<VideoItem[]>(load)

  function push(v: VideoItem) {
    setHistory((prev) => {
      const next = [v, ...prev.filter((x) => x.id !== v.id)].slice(0, MAX)
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }

  function clear() {
    localStorage.removeItem(KEY)
    setHistory([])
  }

  return { history, push, clear }
}
