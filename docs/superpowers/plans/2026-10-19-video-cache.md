# Plan: Video Metadata Cache (yt-no-ads)

Design: `docs/superpowers/specs/2026-10-19-video-cache-design.md` (approved)

## Goal
Cache video metadata (title/channel/thumb/live) ของวิดีโอที่เคยเล่นแล้ว → เล่นซ้ำไม่กิน YouTube API quota. Media ไม่ cache (ToS) — IFrame player เดิมทำงานปกติ.

## Tasks (bite-sized, แต่ละ task verify ได้)

### Task 1 — `src/lib/videoCache.ts` (ไฟล์ใหม่)
- `VideoCacheEntry = { id, title, channel, thumb, live?, cachedAt }`
- Key `'yt-video-cache:v1'`, MAX 1000, evict `cachedAt` เก่าสุด
- API: `getCached(id)`, `putCached(item)`, `hasCached(id)`, `clearCache()`
- Pattern ตาม `session.ts`: try/catch localStorage, validate id `/^[A-Za-z0-9_-]{11}$/`
- Self-check: `demo()` assert-based รันได้

### Task 2 — `src/lib/youtube.ts`
- ก่อนเรียก API ทุกจุดที่ resolve video id (search/trending/playlist): เช็ค `getCached(id)` ก่อน
- หลังได้ผลจาก API: `putCached()` ทุกวิดีโอ
- ห้ามแตะ quota logic (`COST_*`) และ cache เดิม `yt-cache:<key>`

### Task 3 — `src/lib/sync.ts`
- `syncPush`: แนบ cache ใน payload เดิม (`{ content: ..., videoCache: ... }`)
- `syncPull`: merge cache จาก server — `cachedAt` ใหม่ชนะ

### Task 4 — `src/components/VideoCard.tsx`
- ⚡ icon มุมการ์ดเมื่อ `hasCached(v.id)` (reuse livebadge style)

### Task 5 — Verify
- `tsc --noEmit && vite build` ผ่าน
- Self-check `videoCache.ts` รันผ่าน
- Commit

### Task 6 — Update `memory/graphify.md`

## Impact / Risk
- ไม่กระทบ business flow เดิม: quota logic, player, playlists ไม่แตะ
- Severity: LOW — ทุก path เดิมทำงานเหมือนเดิม, cache เป็น read-through เท่านั้น
- Rollback: revert commit เดียว
