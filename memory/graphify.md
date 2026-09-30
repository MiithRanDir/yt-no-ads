# Graphify yt-no-ads

- Entry: src/App.tsx -> SearchBar -> youtube.ts -> VideoCard list -> Player (nocookie)
- Service: src/lib/youtube.ts (searchVideos/getTrending cache5m debounce)
- Proxy: api/search.ts (GET only, 400 missing q, YT_API_KEY server)
- Hook: useHistory localStorage 20
- Deploy: Vercel + vercel.json
