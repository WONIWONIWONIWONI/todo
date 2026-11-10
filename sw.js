// 웹앱 오프라인 지원: 항상 인터넷에서 새 파일을 먼저 받고, 안 되면 저장해 둔 것을 보여줌.
// 사이트 파일을 바꿀 때 VERSION 숫자를 올리면 예전 저장본이 지워져요.
const VERSION = 'v295';
const CACHE = 'rescene-todo-' + VERSION;
const SHELL = [
  './',
  './index.html',
  './music/',
  './schedule/',
  './calendar/',
  './alliances/',
  './style.css',
  './app.js',
  './config.js',
  './sample-data.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/genie.ico',
  './icons/melon.png',
  './icons/stationhead.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './images/example-capture.svg',
];

const PRECACHE = SHELL.concat(['./shared/validation.js','./shared/runtime.js','./shared/records.js','./shared/schedule.js']).map(p => /\.(?:js|css)$/.test(p) ? p+'?v='+VERSION.slice(1) : p);
async function network(request) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try { return await fetch(request, { cache: 'no-cache', signal: controller.signal }); } finally { clearTimeout(timer); }
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rescene-todo-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 글꼴·외부 링크는 브라우저에 맡김
  e.respondWith(
    // no-cache: 브라우저에 저장된 예전 파일 대신 서버에 바뀌었는지 꼭 물어봄 (안 바뀌었으면 금방 끝남)
    network(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}));
        }
        if (res.status >= 500) throw new Error('server');
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const page = await caches.match(new URL('./index.html', self.registration.scope).href);
          if (page) return page;
        }
        return new Response(url.pathname.endsWith('.json') ? '{"error":"offline"}' : '', { status: 503, headers: { 'Content-Type': url.pathname.endsWith('.json') ? 'application/json' : 'text/plain', 'Cache-Control': 'no-store' } });
      })
  );
});
