// Service worker：讓網站可以「加到主畫面」。
// 策略：一律先抓網路上的最新版，抓不到（離線）才用快取，避免同仁看到舊版。
const CACHE = 'pt-v0.9.0';
const SHELL = [
  './', 'index.html', 'styles.css', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png',
  'js/core.js', 'js/auth.js', 'js/home.js', 'js/admin.js', 'js/task-view.js', 'js/tasks.js', 'js/projects.js', 'js/search.js', 'js/admin-records.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 只處理本網站的 GET；後端 API 與 Google 登入一律直接連線，不經快取
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
