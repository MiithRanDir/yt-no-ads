// ponytail: service worker งานเดียว — ทำให้ติดตั้งเป็นแอปได้ + เปิดแบบออฟไลน์เห็นโครง
// cache แค่ไฟล์เว็บตัวเอง ไม่แตะ /api และ YouTube
// VERSION: injected by build (vite define) — new deploy = new cache = force update
const CACHE = `yt-no-ads-${__APP_VERSION__}`
const SHELL = ['/', '/favicon/site.webmanifest'] // ponytail: ไม่ cache index.html (hash เปลี่ยนตลอด)

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {}),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch(() => {}),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const u = new URL(req.url)
  if (req.method !== 'GET' || u.origin !== self.location.origin) return
  if (u.pathname.startsWith('/api/')) return
  // ponytail: index.html ใช้ network-first (hash เปลี่ยนตลอด) ไม่ให้ cache เก่าค้าง
  if (u.pathname === '/' || u.pathname === '/index.html') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req)),
    )
    return
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return res
          })
          .catch(() => caches.match('/index.html')),
    ),
  )
})
