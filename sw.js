// 웹앱 오프라인 지원: 항상 인터넷에서 새 파일을 먼저 받고, 안 되면 저장해 둔 것을 보여줌.
// 사이트 파일을 바꿀 때 VERSION 숫자를 올리면 예전 저장본이 지워져요.
const VERSION = 'v222';
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
  './icons/icon-192.png',
  './icons/icon-512.png',
  './images/example-capture.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html')))
  );
});
