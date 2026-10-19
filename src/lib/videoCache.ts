// Cache สำหรับ metadata วิดีโอที่เคยเล่นแล้ว (ถาวร ไม่มี TTL) — ประหยัด YouTube API quota
// ห้าม cache media/สตรีม (ผิด ToS) — cache เฉพาะ metadata เท่านั้น
import type { VideoItem } from './youtube';

export interface VideoCacheEntry extends VideoItem {
  cachedAt: number;
}

const KEY = 'yt-video-cache:v1';
const MAX = 1000;

function load(): Record<string, VideoCacheEntry> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function save(map: Record<string, VideoCacheEntry>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // quota เต็ม — evict เก่าสุด 10% แล้วลองอีกครั้ง
    const entries = Object.values(map).sort((a, b) => a.cachedAt - b.cachedAt);
    const drop = Math.max(1, Math.floor(entries.length * 0.1));
    for (const e of entries.slice(0, drop)) delete map[e.id];
    try {
      localStorage.setItem(KEY, JSON.stringify(map));
    } catch {
      /* ยังเต็ม — ปล่อยไว้ ไม่มี cache ก็ยังทำงานผ่าน API ได้ */
    }
  }
}

export function getCached(id: string): VideoCacheEntry | null {
  return load()[id] ?? null;
}

export function hasCached(id: string): boolean {
  return getCached(id) !== null;
}

export function putCached(item: VideoItem): void {
  const map = load();
  map[item.id] = { ...item, cachedAt: Date.now() };
  const entries = Object.values(map);
  if (entries.length > MAX) {
    entries.sort((a, b) => a.cachedAt - b.cachedAt);
    for (const e of entries.slice(0, entries.length - MAX)) delete map[e.id];
  }
  save(map);
}

export function mergeCached(incoming: Record<string, VideoCacheEntry>): void {
  const map = load();
  for (const [id, entry] of Object.entries(incoming)) {
    const cur = map[id];
    // cachedAt ใหม่ชนะ
    if (!cur || entry.cachedAt > cur.cachedAt) map[id] = entry;
  }
  save(map);
}

export function exportCached(): Record<string, VideoCacheEntry> {
  return load();
}

export function clearCache(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// Array cache for search/trending/playlist results (keyed by query/playlist id)
const ARRAY_KEY = 'yt-video-cache-array:v1';
const ARRAY_MAX = 100;

function loadArray(): Record<string, { items: VideoItem[]; cachedAt: number }> {
  try {
    const raw = localStorage.getItem(ARRAY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveArray(map: Record<string, { items: VideoItem[]; cachedAt: number }>): void {
  try {
    localStorage.setItem(ARRAY_KEY, JSON.stringify(map));
  } catch {
    const entries = Object.entries(map).sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const drop = Math.max(1, Math.floor(entries.length * 0.1));
    for (const [k] of entries.slice(0, drop)) delete map[k];
    try {
      localStorage.setItem(ARRAY_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }
}

export function getCachedArray(key: string): VideoItem[] | null {
  const entry = loadArray()[key];
  return entry?.items ?? null;
}

export function putCachedArray(key: string, items: VideoItem[]): void {
  const map = loadArray();
  map[key] = { items, cachedAt: Date.now() };
  const entries = Object.entries(map);
  if (entries.length > ARRAY_MAX) {
    entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    for (const [k] of entries.slice(0, entries.length - ARRAY_MAX)) delete map[k];
  }
  saveArray(map);
}

// Self-check: รันด้วย npx tsx src/lib/videoCache.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  const item: VideoItem = { id: 'dQw4w9WgXcQ', title: 'Test', channel: 'Chan', thumb: 't.jpg' };
  putCached(item);
  const got = getCached(item.id);
  console.assert(!!got && got.title === 'Test' && got.cachedAt > 0, 'put/get ต้องทำงาน');
  console.assert(hasCached(item.id), 'hasCached ต้อง true');
  console.assert(!getCached('nope'), 'id ไม่มีต้อง null');
  putCached({ ...item, title: 'Updated' });
  console.assert(getCached(item.id)?.title === 'Updated', 'put ซ้ำต้อง overwrite');
  mergeCached({ other: { id: 'abc12345678', title: 'M', channel: 'C', thumb: 'x', cachedAt: 1 } });
  console.assert(getCached('abc12345678')?.title === 'M', 'merge ต้องเพิ่ม entry ใหม่');
  mergeCached({ other: { id: 'abc12345678', title: 'Old', channel: 'C', thumb: 'x', cachedAt: 0 } });
  console.assert(getCached('abc12345678')?.title === 'M', 'cachedAt เก่าต้องไม่ชนะ');
  clearCache();
  console.assert(!getCached(item.id), 'clear ต้องล้างหมด');
  console.log('videoCache self-check OK');
}
