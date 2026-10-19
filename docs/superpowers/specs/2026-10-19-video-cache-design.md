# Design: Video Metadata Cache

**Date:** 2026-10-19
**Goal:** ประหยัด YouTube API quota — เก็บ metadata ของวิดีโอที่เคยเล่นแล้ว เมื่อเล่นซ้ำใน playlist ใช้ cache แทนการเรียก API ใหม่

## Scope

- Cache **metadata เท่านั้น** (title, channel, thumb, duration, live flag) — ไม่แตะ media (ToS)
- Layer เดียว: resolve video id ใดๆ → เช็ค cache ก่อนเรียก API
- Playback ยังใช้ IFrame player เดิม (`loadVideoById`) — ไม่แตะ Player.tsx

## New File

### `src/lib/videoCache.ts`

```ts
interface VideoCacheEntry {
  id: string;        // video id
  title: string;
  channel: string;
  thumb: string;
  live?: boolean;
  cachedAt: number;  // Date.now()
}
```

- localStorage key: `'yt-video-cache:v1'`
- MAX 1000 รายการ (~200KB จาก 5MB budget)
- เต็ม → evict ตัวที่ `cachedAt` เก่าสุด
- API: `getCached(id)`, `putCached(item)`, `hasCached(id)`, `clearCache()`
- Pattern ตาม `session.ts` / `playlists.ts` (try/catch JSON parse, versioned key)

## Modified Files

### `src/lib/youtube.ts`
- ก่อนเรียก API (search/trending/playlist) → เช็ค cache ต่อ video id
- ได้ผลจาก API → `putCached` ทุก item
- ไม่แตะ quota logic เดิม (cache hit = ไม่เรียก API = ไม่กิน quota อยู่แล้ว)

### `src/lib/sync.ts`
- แนบ video cache ใน sync payload เดิม
- Pull มา merge: `cachedAt` ใหม่ชนะ

### `src/components/VideoCard.tsx`
- `hasCached(id)` → แสดง ⚡ icon เล็กๆ มุมการ์ด (บอกว่าเล่นซ้ำไม่กิน quota)

## Not Touched

- `Player.tsx`, `quota.ts`, `playlists.ts`, `session.ts`

## Flow

```
เล่นวิดีโอ → resolve metadata
  → เจอใน cache? ใช่: ใช้เลย (⚡ 0 quota)
  → ไม่: เรียก API → putCached → ครั้งหน้าฟรี
```

## Risks

| Risk | Mitigation |
|------|-----------|
| localStorage เต็ม | MAX 1000 + evict เก่าสุด |
| Sync conflict | `cachedAt` ใหม่ชนะ (last-write-wins) |
| ToS | metadata เท่านั้น ไม่แตะ media |

## Test Plan

- Happy: เล่นวิดีโอครั้งแรก → putCached → ครั้งที่สอง cache hit (⚡)
- Edge: cache เต็ม 1000 → evict เก่าสุดถูกต้อง
- Edge: localStorage พัง/JSON ไม่ valid → fallback ว่าง ไม่ crash
- Regression: sync เดิมยังทำงาน, quota เดิมยังนับถูก
