# Graphify yt-no-ads

- Entry: src/App.tsx -> SearchBar -> youtube.ts -> VideoCard list -> Player (nocookie)
- Service: src/lib/youtube.ts (searchVideos/getTrending/fetchPlaylistItems cache via videoCache.ts)
- Cache: src/lib/videoCache.ts (per-video + array cache, MAX 1000/100, quota-evict 10%, localStorage)
- Proxy: api/search.ts (GET only, 400 missing q, YT_API_KEY server)
- Hook: useHistory localStorage 20
- Playlist: src/lib/playlists.ts (pure, cap 20x200, listId regex) + usePlaylists ↔ App PlaylistBar/queue → Player IFrame API auto-next
- Shuffle (smart): `src/lib/shuffle.ts` = pure (buildOrder/newRound/advance/retreat/playId/repairOrder) — ลำดับสุ่ม 1 รอบ = permutation, `done` = ประวัติที่ฟังแล้วของรอบ, `recent` = rolling window ครึ่งplaylist (ส่งต่อข้ามรอบ), `resume` = เพลงที่เพิ่งกด ⏮ ทิ้งไว้
  - state อยู่ใน localStorage `yt-shuffle-round-<pid>` = {order,pos,done,recent,resume} → ปิดจอ/เปิดแอปใหม่/สลับ playlist ต่อรอบเดิมได้ (ของเก่าล้าง session บ่อย = เพลงวนซ้ำ; migrate จาก `yt-shuffle-played-*`)
  - App glue: `ensureRound()` ใน App.tsx ถูกเรียกจาก playQueue/next/prev/toggleShuffle/resume-effect — ห้ามสร้าง round ใหม่ ยกเว้น `restartRound()` (ปุ่ม "🔀 สุ่มเล่น")
  - next/prev เดินบน `done` (ประวัติกดเล่นจริง) ไม่ใช่ index ของ queue → prev = inverse ของ next
  - smart: `ARTIST_GAP=2` กัน channel เดิมติดกัน + `recencyWindow(n)=n/2` กันเพลงที่เพิ่งฟังต้นรอบใหม่
  - เทส: `node scripts/shuffle-sim.ts` (seeded RNG, 9 กลุ่ม property) — เกณฑ์: ไม่มีซ้ำภายในรอบ, min gap ≥ window
- Proxy: api/search.ts + type=playlist (loop 4 หน้า, filter private/deleted, cache 1 ชม.)
- Deploy: Vercel + vercel.json
