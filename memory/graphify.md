# Graphify yt-no-ads

- Entry: src/App.tsx -> SearchBar -> youtube.ts -> VideoCard list -> Player (nocookie)
- Service: src/lib/youtube.ts (searchVideos/getTrending cache5m debounce)
- Proxy: api/search.ts (GET only, 400 missing q, YT_API_KEY server)
- Hook: useHistory localStorage 20
- Playlist: src/lib/playlists.ts (pure, cap 20x200, listId regex) + usePlaylists ↔ App PlaylistBar/queue → Player IFrame API auto-next
- Proxy: api/search.ts + type=playlist (loop 4 หน้า, filter private/deleted, cache 1 ชม.)
- Deploy: Vercel + vercel.json
