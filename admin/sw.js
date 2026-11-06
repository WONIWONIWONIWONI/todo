// 관리자 홈 화면 앱 전용 서비스 워커: 새 공지 알림만 해요 (파일 저장 · 오프라인은 안 함, 사이트 sw.js 와 따로)
// 워커(admin-worker)가 내용 없는 푸시를 보내면, 받은 공지 목록(공개 저장소 data/inbox.json)을 읽어 첫 대기 글로 알림을 만들어요.
// 아이폰은 푸시마다 꼭 알림을 띄워야 해서(안 띄우면 구독이 끊겨요), 목록을 못 읽어도 기본 문구로 띄워요.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let title = '음총팀 새 공지가 있어요';
    let body = '관리자 모드에서 확인해 주세요';
    try {
      // 받은 공지는 사이트에 안 올라가서 공개 저장소에서 바로 읽어요 (GitHub API, 로그인 없이 시간당 60번)
      const r = await fetch('https://api.github.com/repos/WONIWONIWONIWONI/todo/contents/data/inbox.json?ref=main', { cache: 'no-store', headers: { Accept: 'application/vnd.github.raw+json' } });
      const wait = ((await r.json()).items || []).filter((x) => x.state === 'wait');
      if (wait.length) {
        title = wait.length > 1 ? `음총팀 새 공지 ${wait.length}개` : '음총팀 새 공지';
        body = String(wait[0].text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' · ').slice(0, 120) || body;
      }
    } catch (err) { /* 기본 문구로 */ }
    await self.registration.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'inbox', renotify: true, data: { url: './' } });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const url = new URL('./', self.registration.scope).href;
    const open = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).find((c) => c.url.startsWith(url));
    if (open) { await open.focus(); open.postMessage('inbox'); } else await self.clients.openWindow(url);
  })());
});
