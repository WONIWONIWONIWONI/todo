  // [src/90-main.js] 주소·탭 이동·누르기 처리·새로고침·화면 모드·시작. (function 닫는 줄이 여기 있어요)
  // ---------- 주소 ----------
  // 탭마다 실제 페이지가 있어요 (tools/build_pages.py가 index.html로 만듦). 안에서는 다시 불러오지 않고 주소만 바꿔요.
  //   …/todo/             오늘
  //   …/todo/music/       음악방송 (#music-inkigayo 처럼 음방을 고를 수 있어요)
  //   …/todo/schedule/    리센느 일정 (#2026-11-03 처럼 날짜)
  //   …/todo/calendar/    연합 일정 (기간표 · 달력)
  //   …/todo/alliances/   연합&기타 (#mma 처럼 가이드 아이디로 바로 가요)
  // 예전 링크(#calendar, …/guides#mma)는 route()가 알아보고 새 주소로 바꿔요.
  const TABS = ['today', 'music', 'schedule', 'calendar', 'alliances'];
  const SITE_TITLE = CFG.SITE_TITLE || '리센느 오늘의 할일';
  const BASE = (() => {
    const sc = document.querySelector('script[src*="app.js"]');
    return sc ? new URL('./', sc.src).pathname : '/';
  })();
  function decodeRoute(value) {
    try { return decodeURIComponent(value); } catch (err) { return ''; }
  }
  function route() {
    const path = decodeRoute(location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : '').replace(/\/+$/, '').replace(/index\.html$/, '');
    const h = decodeRoute(location.hash.replace(/^#/, ''));
    let tab, arg;
    if (path && TABS.includes(path.split('/')[0])) { tab = path.split('/')[0]; arg = h || path.split('/')[1]; }
    else if (path.split('/')[0] === 'guides') { tab = 'guides'; arg = h || path.split('/')[1]; }
    else { [tab, arg] = h.split('/'); }
    if (tab === 'guides') tab = arg && /^music/.test(arg) ? 'music' : 'alliances';
    return { tab: TABS.includes(tab) ? tab : 'today', arg: arg || undefined };
  }
  const urlFor = (tab, arg) => BASE + (tab === 'today' ? '' : tab + '/') + (arg ? '#' + encodeURIComponent(arg) : '');
  // 처음 열 때는 페이지에 적힌 제목 그대로, 안에서 탭을 옮길 때만 바꿔요
  function setTitle(tab) {
    const label = document.querySelector(`.tabbar a[data-tab="${tab}"] span`);
    document.title = tab === 'today' || !label ? SITE_TITLE : `${label.textContent} · ${SITE_TITLE}`;
  }
  function selectTab(tab) {
    document.querySelectorAll('.tabbar a').forEach((a) => {
      const active = a.dataset.tab === tab;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }
  function go(tab, arg, replace) {
    const url = urlFor(tab, arg);
    const same = url === location.pathname + location.hash;
    if (!same) history[replace ? 'replaceState' : 'pushState'](null, '', url);
    setTitle(tab);
    // 보고 있는 탭을 다시 누르면 다시 그리지 않고 맨 위로만 (오늘 탭에서 다른 날을 보고 있으면 오늘로 돌아가요)
    if (same && !arg && !(tab === 'today' && state.viewDate)) { scrollTop0(); return; }
    if (tab === 'today') state.viewDate = ''; // 오늘 탭을 누르면 다시 오늘로
    // 누른 탭 표시를 먼저 바꿔 화면에 보이게 한 뒤 그려요 (Cloudflare 분석: 탭 누름 반응 0.3초 → 바로)
    selectTab(tab);
    let done = false;
    const draw = () => { if (!done) { done = true; render(); } };
    requestAnimationFrame(() => setTimeout(draw, 0));
    setTimeout(draw, 120); // 화면이 가려져 있으면 requestAnimationFrame 이 안 와요
  }
  // 예전 # 주소로 들어왔으면 새 주소로 바꿔 둠 (기록은 하나 그대로)
  function normalizeUrl() {
    const { tab, arg } = route();
    const want = urlFor(tab, arg);
    if (want !== location.pathname + location.hash) { history.replaceState(null, '', want); setTitle(tab); }
  }
  function render(opts) {
    if (!state.data) return;
    const { tab, arg } = route();
    state.renderedDate = today();
    selectTab(tab);
    const VIEWS = { today: renderToday, calendar: renderCalendar, schedule: renderSchedule, music: renderMusic, alliances: renderAlliances };
    $app.innerHTML = safe(`${tab} 화면`, VIEWS[tab]);
    const keep = opts && opts.keepScroll;
    if ((tab === 'music' || tab === 'alliances') && arg && !keep) {
      const el = document.getElementById('guide-' + arg);
      if (el) {
        const go = () => el.scrollIntoView({ block: 'start' });
        go();
        el.classList.add('flash');
        const until = Date.now() + 3000;
        $app.querySelectorAll('img').forEach((img) => {
          if (!img.complete) img.addEventListener('load', () => { if (Date.now() < until) go(); }, { once: true });
        });
      }
    } else if (!keep) {
      scrollTop0();
    }
  }

  // 멜론 링크: 휴대폰에서는 멜론 앱 안에서 열기 (앱이 없으면 모바일 웹으로)
  // 참고: rescene-team.github.io/mama-vote 의 방식 (melonapp://webview?url=…)
  // deep: 멜론 앱 안 경로 (없으면 그 웹 주소를 앱 안 창으로). 뮤직웨이브는 'musicwave/listen?seq=…'
  function openMelon(href, deep) {
    const ua = navigator.userAgent || '';
    const isAndroid = /android/i.test(ua);
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    if (!isAndroid && !isIOS) return false;
    const web = href.replace(/^https?:\/\/(www\.)?melon\.com/i, 'https://m2.melon.com');
    const path = deep || `webview?url=${encodeURIComponent(web)}`;
    if (isAndroid) {
      location.href = `intent://${path}${deep ? '' : '&type=SA'}#Intent;scheme=melonapp;package=com.iloen.melon;S.browser_fallback_url=${encodeURIComponent(web)};end;`;
    } else {
      let left = false;
      const onHide = () => { if (document.hidden) left = true; };
      document.addEventListener('visibilitychange', onHide);
      location.href = `melonapp://${path}`;
      setTimeout(() => {
        document.removeEventListener('visibilitychange', onHide);
        if (!left && !document.hidden) location.href = web; // 앱이 안 열렸으면 웹으로
      }, 1600);
    }
    return true;
  }
  // 갤럭시(안드로이드): X 앱은 twitter://post 의 글 · 답글 대상을 무시해서 빈 글쓰기 창만 떠요 (2026-11-06 사용자 신고).
  // 그래서 새 글은 X 앱이 직접 받는 웹 주소 twitter.com/intent/tweet?text= 를 X 앱으로 열고,
  // 댓글 인증은 X 앱이 in_reply_to 도 버려서(v201 엔하이픈 신고) 그 글 자체를 X 앱으로 열어요 — 태그는 미리 복사해 두고 답글에 붙여 넣게.
  // 앱이 없으면 원래 웹 주소로 가요
  function xAndroidUrl(href) {
    const q = new URL(href).searchParams;
    const id = /^\d+$/.test(q.get('in_reply_to') || '') ? q.get('in_reply_to') : '';
    const path = id ? `twitter.com/i/status/${id}` : `twitter.com/intent/tweet?text=${encodeURIComponent(q.get('text') || '')}`;
    const fallback = id ? `https://x.com/i/status/${id}` : href;
    return `intent://${path}#Intent;scheme=https;package=com.twitter.android;S.browser_fallback_url=${encodeURIComponent(fallback)};end;`;
  }
  // X 인증: 휴대폰에서는 X 앱의 글쓰기 화면을 해시태그가 들어간 채로 열기 (앱이 없으면 웹으로)
  function openX(href) {
    const ua = navigator.userAgent || '';
    const isAndroid = /android/i.test(ua);
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    if (!isAndroid && !isIOS) return false;
    const q = new URL(href).searchParams;
    const msg = encodeURIComponent(q.get('text') || '');
    // 댓글 인증(in_reply_to)이면 앱에서도 그 글의 답글로
    const reply = /^\d+$/.test(q.get('in_reply_to') || '') ? `&in_reply_to_status_id=${q.get('in_reply_to')}` : '';
    if (isAndroid) {
      if (reply) {
        copyText(q.get('text') || '', '태그').then(() => toast('태그를 복사했어요 · 글에서 답글을 누르고 붙여 넣어 주세요'));
        setTimeout(() => { location.href = xAndroidUrl(href); }, 900); // 안내를 읽을 틈
      } else {
        location.href = xAndroidUrl(href);
      }
    } else {
      let left = false;
      const onHide = () => { if (document.hidden) left = true; };
      document.addEventListener('visibilitychange', onHide);
      location.href = `twitter://post?message=${msg}${reply}`;
      setTimeout(() => {
        document.removeEventListener('visibilitychange', onHide);
        if (!left && !document.hidden) location.href = href; // 앱이 안 열렸으면 웹으로
      }, 1600);
    }
    return true;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-allyview]');
    if (!b) return;
    state.allyView = b.dataset.allyview;
    if (route().arg) history.replaceState(null, '', urlFor('alliances'));
    render();
  });
  // 체크 기록 옮기기 (오늘 탭 아래 · 홈 화면 추가 창 안)
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('[data-xfer]')) return;
    const open = document.querySelector('.modal.show');
    if (open) hideModal(open);
    openTransfer();
  });
  // 음방 투표 가이드로 (시간표 창은 #app 밖에 있어서 문서 전체에서 받아요)
  document.addEventListener('click', (e) => {
    const gg = e.target.closest && e.target.closest('[data-goguide]');
    if (!gg) return;
    e.preventDefault();
    const m = document.getElementById('music');
    if (m && m.classList.contains('show')) hideModal(m);
    const a = gg.dataset.goguide;
    go(/^music/.test(a) ? 'music' : 'alliances', a === 'music' ? undefined : a);
  });
  // 투표 앱 열기 (앱이 없으면 스토어)
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-app]');
    if (a && openApp(a.dataset.app)) e.preventDefault();
  }, true);
  // 공지 속 뮤빗 · 하이어 · 아이돌챔프 공유 링크도 휴대폰에서 앱으로 바로
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.dataset.app) return;
    const d = shareDeep(a.href);
    if (d && openApp(d.k, d)) e.preventDefault();
  }, true);
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a.tw[href]');
    if (a && openX(a.href)) e.preventDefault();
  }, true);

  // 아이폰 홈 화면 앱: 구글폼 · 카톡 인증 링크는 사파리로 열기.
  // 앱 안 창으로 열면 사파리 로그인이 없어서 구글 로그인을 다시 해야 해요. x-safari-https:// 는 iOS 17부터 되고,
  // 사파리가 안 열리면(옛 iOS) 1.6초 뒤 지금처럼 앱 안 창으로 열어요.
  const OUTSIDE = /^https:\/\/(forms\.gle|docs\.google\.com\/forms|pf\.kakao\.com)\//i;
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || !OUTSIDE.test(a.href) || navigator.standalone !== true) return;
    e.preventDefault();
    let left = false;
    const onHide = () => { if (document.hidden) left = true; };
    document.addEventListener('visibilitychange', onHide);
    location.href = 'x-safari-' + a.href;
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide);
      if (!left && !document.hidden) window.open(a.href, '_blank', 'noopener');
    }, 1600);
  }, true);

  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || !/^https?:\/\/(www\.|m2\.)?melon\.com\//i.test(a.href)) return;
    if (openMelon(a.href)) e.preventDefault();
  }, true);
  // 뮤직웨이브 버튼: 휴대폰은 멜론 앱의 그 방으로, 컴퓨터는 링크 그대로 새 탭
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-wave]');
    if (a && openMelon(a.href, a.dataset.wave)) e.preventDefault();
  }, true);

  $app.addEventListener('click', (e) => {
    if (e.target.closest('[data-next-task]')) {
      const selector = '[data-check][aria-pressed="false"]:not(:disabled)';
      if (!$app.querySelector(selector) && state.campFilter) {
        state.campFilter = '';
        render({ keepScroll: true });
      }
      const check = $app.querySelector(selector);
      if (check) {
        check.closest('.row').scrollIntoView({ block: 'center' });
        check.focus({ preventScroll: true });
      }
      return;
    }
    const cp = e.target.closest('[data-copy]');
    if (cp) { copyText(cp.dataset.copy, cp.dataset.copyLabel); return; }
    if (e.target.closest('[data-wm]')) { openWatermark(); return; }
    if (e.target.closest('[data-music]')) { openMusic(); return; }
    if (e.target.closest('[data-sban]')) { openSban(); return; }
    if (e.target.closest('[data-install]')) { openInstall(); return; }
    const at = e.target.closest('[data-ally]');
    if (at) { const id = at.dataset.ally; state.allyOpen.has(id) ? state.allyOpen.delete(id) : state.allyOpen.add(id); render({ keepScroll: true }); focusAfter(`[data-ally="${CSS.escape(id)}"]`); return; }
    const af = e.target.closest('[data-allyf]');
    if (af) { state.allyFilter = af.dataset.allyf; render({ keepScroll: true }); return; }
    const aa = e.target.closest('[data-ally-all]');
    if (aa) {
      const ids = [...document.querySelectorAll('[data-ally]')].map((b) => b.dataset.ally);
      ids.forEach((id) => (aa.dataset.allyAll === 'open' ? state.allyOpen.add(id) : state.allyOpen.delete(id)));
      render({ keepScroll: true });
      return;
    }
    const op = e.target.closest('[data-open]');
    if (op) {
      const id = op.dataset.open;
      state.open.has(id) ? state.open.delete(id) : state.open.add(id);
      render({ keepScroll: true });
      focusAfter(`[data-open="${CSS.escape(id)}"]`);
      return;
    }
    const dn = e.target.closest('[data-dnav]');
    if (dn) {
      const n = +dn.dataset.dnav;
      state.viewDate = n ? addDays(state.viewDate || today(), n) : '';
      render({ keepScroll: true });
      focusAfter(`[data-dnav="${n}"]`);
      return;
    }
    const chk = e.target.closest('[data-check]');
    if (chk) { toggleCheck(chk.dataset.date, chk.dataset.check); state.checkedNow = true; render({ keepScroll: true }); focusAfter(`[data-check="${CSS.escape(chk.dataset.check)}"]`); return; }
    if (route().tab === 'schedule' && schClick(e)) return;
    const day = e.target.closest('[data-day]');
    if (day) { state.calSel = day.dataset.day; state.calMonth = day.dataset.day.slice(0, 7); render({ keepScroll: true }); return; }
    const cf = e.target.closest('[data-camp]');
    if (cf) {
      state.campFilter = !cf.dataset.camp || state.campFilter === cf.dataset.camp ? '' : cf.dataset.camp;
      render({ keepScroll: true });
      return;
    }
    const gf = e.target.closest('[data-getfold]');
    if (gf) { state.getsOpen = !state.getsOpen; render({ keepScroll: true }); focusAfter('[data-getfold]'); return; }
    const kt = e.target.closest('[data-kindtab]');
    if (kt) {
      state.kindTab = kt.dataset.kindtab;
      try { localStorage.setItem('rs-kindtab', state.kindTab); } catch (err) { /* 무시 */ }
      render({ keepScroll: true });
      return;
    }
    const v = e.target.closest('[data-view]');
    if (v) {
      state.calView = v.dataset.view;
      try { localStorage.setItem('rs-calview2', state.calView); } catch (err) { /* 무시 */ }
      render({ keepScroll: true });
      return;
    }
    const mon = e.target.closest('[data-month]');
    if (mon) {
      const n = +mon.dataset.month;
      if (n === 0) { state.calMonth = today().slice(0, 7); state.calSel = today(); }
      else {
        const [y, m] = state.calMonth.split('-').map(Number);
        state.calMonth = iso(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
        state.calSel = state.calMonth === today().slice(0, 7) ? today() : state.calMonth + '-01';
      }
      render({ keepScroll: true });
      return;
    }
  });

  // 메뉴 링크는 HTML에선 상대 주소라서, 안에서 주소가 바뀌어도 맞게 절대 주소로 바꿔 둬요
  document.querySelectorAll('.tabbar a[data-tab]').forEach((a) => { a.href = urlFor(a.dataset.tab); });
  document.querySelector('.brand').href = urlFor('today');
  // 사이트 안 탭 링크는 페이지를 다시 불러오지 않고 화면만 바꿔요
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || !u.pathname.startsWith(BASE)) return;
    const rest = u.pathname.slice(BASE.length).replace(/\/$/, '');
    if (rest && !TABS.includes(rest)) return;
    e.preventDefault();
    go(rest || 'today', decodeRoute(u.hash.slice(1)) || undefined);
  });
  window.addEventListener('popstate', () => { setTitle(route().tab); render(); });
  window.addEventListener('hashchange', () => {
    normalizeUrl();
    render();
  });
  // 주소 공유: 지금 보고 있는 탭의 주소 (예: …/todo/schedule/). 휴대폰은 공유 창, 컴퓨터는 주소 복사
  document.getElementById('shareBtn').addEventListener('click', () => {
    const tab = route().tab;
    const url = new URL(urlFor(tab), location.href).href;
    const name = tab === 'today' ? '사이트 주소' : `${document.querySelector(`.tabbar a[data-tab="${tab}"] span`).textContent} 탭 주소`;
    if (navigator.share && /android|iphone|ipad|ipod/i.test(navigator.userAgent)) navigator.share({ title: document.title, url }).catch(() => {});
    else copyText(url, name);
  });
  // 새로고침: 서버에서 최신 사이트·정보를 확인하고 화면을 다시 불러옴
  document.getElementById('refreshBtn').addEventListener('click', async () => {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spin');
    btn.disabled = true;
    toast('최신 정보를 불러오는 중…');
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) await reg.update();
    } catch (e) { /* 무시 */ }
    try { sessionStorage.setItem('rs-refreshed', '1'); } catch (e) { /* 무시 */ }
    setTimeout(() => location.reload(), 350);
  });
  // 홈 화면 앱: 맨 위에서 아래로 당기면 새로고침 (브라우저에는 원래 있는 기능)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone && 'ontouchstart' in window) {
    document.documentElement.classList.add('is-app');
    const box = document.createElement('div');
    box.id = 'scroll';
    document.body.insertBefore(box, document.querySelector('.tabbar'));
    [document.querySelector('.topbar'), document.getElementById('notice'), $app].forEach((n) => n && box.appendChild(n));
    const ptr = document.createElement('div');
    ptr.className = 'ptr';
    ptr.setAttribute('aria-hidden', 'true');
    ptr.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
    document.body.appendChild(ptr);
    const LIMIT = 72;
    let y0 = null, x0 = 0, pull = 0;
    const reset = () => { y0 = null; pull = 0; ptr.style.transform = ''; ptr.classList.remove('ready', 'pulling'); };
    document.addEventListener('touchstart', (e) => {
      if (scrolledY() > 0 || e.touches.length !== 1 || e.target.closest('.modal, input, textarea')) return;
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; pull = 0;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      const dy = e.touches[0].clientY - y0;
      const dx = Math.abs(e.touches[0].clientX - x0);
      if (scrolledY() > 0 || dy <= 0 || dx > dy) { reset(); return; }
      pull = Math.min(dy * 0.5, LIMIT + 24);
      ptr.classList.add('pulling');
      ptr.classList.toggle('ready', pull >= LIMIT);
      ptr.style.transform = `translate(-50%, ${pull}px) rotate(${Math.min(pull / LIMIT, 1) * 180}deg)`;
    }, { passive: true });
    const end = () => {
      if (y0 === null) return;
      const go = pull >= LIMIT;
      reset();
      if (go) document.getElementById('refreshBtn').click();
    };
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });
  }
  // 맨 위로 버튼: 화면 두 장쯤 내려가면 오른쪽 아래에 보여요 (홈 화면 앱은 #scroll 칸이 스크롤)
  const toTop = document.createElement('button');
  toTop.type = 'button';
  toTop.className = 'to-top';
  toTop.setAttribute('aria-label', '맨 위로');
  toTop.tabIndex = -1;
  toTop.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
  document.body.appendChild(toTop);
  toTop.addEventListener('click', () => {
    scrollTop0(true);
    // 부드럽게 올라가기가 안 되는 브라우저도 있어서, 잠시 뒤에도 위가 아니면 바로 올림
    setTimeout(() => { if (scrolledY() > 4) scrollTop0(false); }, 700);
  });
  let toTopOn = false;
  const syncToTop = () => {
    const on = scrolledY() > window.innerHeight * 1.2;
    if (on === toTopOn) return;
    toTopOn = on;
    toTop.classList.toggle('show', on);
    toTop.tabIndex = on ? 0 : -1;
  };
  document.addEventListener('scroll', syncToTop, { passive: true, capture: true });
  window.addEventListener('popstate', () => setTimeout(syncToTop, 50));
  // 새로고침 뒤 한 번 알려주기
  try {
    if (sessionStorage.getItem('rs-refreshed')) {
      sessionStorage.removeItem('rs-refreshed');
      setTimeout(() => toast(updatedAt() ? `새로고침했어요 · 정보 ${updLabel()} 업데이트` : '새로고침했어요'), 300);
    }
  } catch (e) { /* 무시 */ }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - state.loadedAt > REFRESH_MS) load();
    else if (state.renderedDate !== today()) render({ keepScroll: true });
  });

  // 1분마다: 남은 시간 갱신, 자정(한국 시간)이 지나면 새 날로
  setInterval(() => {
    if (!state.data) return;
    const newDay = state.renderedDate !== today();
    if (newDay) { state.calMonth = ''; state.calSel = ''; }
    if (newDay || route().tab === 'today') render({ keepScroll: true });
  }, 60 * 1000);

  // ---------- 화면 모드: 자동(기기 설정) / 라이트 / 다크 ----------
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_LABEL = { auto: '화면 모드: 자동', light: '화면 모드: 라이트', dark: '화면 모드: 다크' };
  // data-theme에는 늘 실제로 보이는 모드(light/dark)를 붙여요. CSS는 [data-theme="dark"] 한 벌만 있으면 돼요
  function applyTheme(t) {
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#15141d' : '#f3f1fb'));
    const btn = document.getElementById('themeBtn');
    if (btn) { btn.dataset.mode = t; btn.setAttribute('aria-label', THEME_LABEL[t] + ' (눌러서 바꾸기)'); btn.title = THEME_LABEL[t]; }
  }
  let theme = 'auto';
  try { theme = localStorage.getItem('rs-theme') || 'auto'; } catch (e) { /* 무시 */ }
  applyTheme(theme);
  document.getElementById('themeBtn').addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    try { localStorage.setItem('rs-theme', theme); } catch (e) { /* 무시 */ }
    applyTheme(theme);
    toast(THEME_LABEL[theme]);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(theme));

  document.getElementById('siteTitle').textContent = SITE_TITLE;

  normalizeUrl();
  cleanOldChecks();
  load();
  noticeLoad();
  // 오프라인에서도 열리게 (https 또는 localhost에서만)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(() => {}); });
  }
})();
