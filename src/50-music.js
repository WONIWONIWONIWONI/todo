  // [src/50-music.js] 음악방송 탭: 투표 앱·음방 정보·음방 주간 스케줄·투표 방법
  // ---------- 음악방송: 시간표 + 투표 방법 (2026-11-02 조사) ----------
  // 바뀌면 여기만 고치면 돼요. day: 0=일 1=월 … 6=토, end는 대략 끝나는 시각
  // 출처: 쇼케이팝 공식 사이트(showkpop.com), 빅크 '더쇼' 회차 기사(스타데일리뉴스·스포츠경향), 아티스트 공식 X 투표 안내
  //       (MONSTA X·i-dle·NMIXX·ILLIT·NCT WISH·Kep1er·CORTIS·Hearts2Hearts), 쿠궁 공식 X(팬캐스트→쿠궁 이름 변경),
  //       MBC 음악중심 문자투표 안내, weknews 음방 투표 정리(2026.7), 나무위키 음악중심·뮤직뱅크 차트
  // 앱 열기 (휴대폰): 각 앱이 등록해 둔 링크(open)를 써서 앱이 있으면 바로 켜져요.
  //   안드로이드: intent로 그 앱을 직접 열고, 없으면 구글 플레이
  //   아이폰: 링크를 그대로 눌러 유니버설 링크로 열기. 앱이 없으면 앱스토어(빅크·LiNC·Mnet Plus·아이돌챔프·쿠궁) 또는 앱 홈페이지(뮤빗·뮤니버스·하이어)
  //   open 주소는 각 도메인의 apple-app-site-association · assetlinks.json으로 확인 (2026-11-02)
  // 앱 정보는 sheet-templates/투표앱.csv (관리자 모드 "음악방송 · 투표 앱"). 칸 이름 → 키
  //   scheme: 앱을 바로 여는 주소 · iosScheme: 아이폰에서만 쓰는 주소 · open: 안드로이드 앱 링크(https) · ul: 아이폰 사파리에서도 그 링크로 앱이 열림
  //   아이돌챔프는 앱 주소가 없어서 앱 링크만: 홈 화면 웹앱에서는 새 창(사파리)으로 넘겨서 열어요
  const APP_COLS = { 이름: 'name', 안드로이드패키지: 'and', 아이폰앱번호: 'ios', 앱주소: 'scheme', 아이폰앱주소: 'iosScheme', 앱링크: 'open', 아이폰도앱링크로: 'ul', 홈페이지: 'web' };
  const APPS = Object.fromEntries(toObjects((window.SAMPLE_DATA || {}).apps || '').map((r) => {
    const a = {};
    Object.entries(APP_COLS).forEach(([c, k]) => { if (r[c]) a[k] = k === 'ul' ? r[c] === '예' : r[c]; });
    return [r['아이디'], a];
  }));
  const PHONE = (() => {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    return '';
  })();
  const STANDALONE = (() => { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } })();
  const playUrl = (a) => `https://play.google.com/store/apps/details?id=${a.and}`;
  const iosUrl = (a) => `https://apps.apple.com/kr/app/id${a.ios}`;
  // 버튼 주소(누르면 openApp이 대신 처리). 컴퓨터는 웹(없으면 구글 플레이)
  const appHref = (k) => {
    const a = APPS[k];
    if (!a) return '';
    if (PHONE === 'ios') return a.ul ? a.open : iosUrl(a);
    if (PHONE === 'android') return a.open || playUrl(a);
    return a.web || playUrl(a);
  };
  // 새 창으로 열면 아이폰이 앱을 안 켜는 경우가 있어서 휴대폰은 같은 창
  // 아이돌챔프(앱 주소 없음)는 홈 화면 웹앱에서 새 창 → 사파리에서 앱 링크로 열리게
  const appTarget = (k) => (PHONE && !(PHONE === 'ios' && STANDALONE && APPS[k] && APPS[k].ul) ? '' : ' target="_blank"');
  // 휴대폰에서 투표 앱 열기. 홈 화면 웹앱 · 카톡 · X 안에서도 되도록 scheme으로 직접 열어요.
  // 안드로이드: 앱이 없으면 플레이 스토어. 아이폰: 앱이 안 열리면 앱스토어.
  // link: 공유 링크에서 뽑은 주소 { sc: 앱 주소, https: 앱 링크 }
  function openApp(k, link) {
    const a = APPS[k];
    if (!a || !PHONE) return false;
    if (PHONE === 'android') {
      const fb = `S.browser_fallback_url=${encodeURIComponent(playUrl(a))}`;
      const asc = link ? link.sc : a.scheme;
      const web = link ? link.https : a.open;
      if (asc) {
        const [sc, rest] = asc.split('://');
        location.href = `intent://${rest}#Intent;scheme=${sc};package=${a.and};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;${fb};end`;
      } else if (web) {
        location.href = `intent://${web.replace(/^https:\/\//, '')}#Intent;scheme=https;package=${a.and};${fb};end`;
      } else {
        location.href = playUrl(a); // 설치돼 있으면 스토어에 '열기' 버튼
      }
      return true;
    }
    const store = `itms-apps://apps.apple.com/app/id${a.ios}`;
    const sc = link ? link.sc : a.scheme || a.iosScheme;
    if (!sc) {
      if (link || a.ul) return false; // 링크 그대로: 앱이 열리거나, 없으면 그 페이지가 앱스토어로
      location.href = store; // 앱스토어 (설치돼 있으면 '열기' 버튼)
      return true;
    }
    let left = false;
    let blurred = false;
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
    const onHide = () => { if (document.hidden) left = true; };
    const onLeave = () => { left = true; };
    const onBlur = () => { blurred = true; };
    // '앱에서 열까요?' 창이나 '주소가 잘못됨' 창이 떴다가 닫힌 경우: 앱이 안 열렸으면 앱스토어
    const onFocus = () => { if (!blurred) return; done(); if (!left) location.href = store; };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    const timer = setTimeout(() => {
      if (blurred && !left) { setTimeout(done, 15000); return; } // 창이 떠 있음: 닫힐 때 onFocus가 처리
      done();
      if (!left && !document.hidden) location.href = store;
    }, 2500);
    location.href = sc;
    return true;
  }
  // 공지에 붙는 앱 공유 링크 → 앱 주소 (각 링크 페이지가 앱을 여는 방법 그대로)
  function shareDeep(href) {
    let u;
    try { u = new URL(href); } catch (e) { return null; }
    if (u.hostname === 'mubeat.applink.info' && u.pathname.length > 1) return { k: 'mubeat', sc: `mubeat://applink.info${u.pathname}` };
    if (u.hostname === 'higher.fan' && /^\/app\/./.test(u.pathname)) return { k: 'higher', sc: `higherfan://${u.pathname.slice(5)}` };
    if (u.hostname === 'promo-web.idolchamp.com') {
      const d = u.searchParams.get('deeplink');
      if (d && /^https:\/\/app\.idolchamp\.com\//.test(d)) return { k: 'idolchamp', https: d };
    }
    return null;
  }
  // 음방 기본 정보(요일 · 시간 · 채널 · 점수 항목 · 투표 앱 · 시간표 · 결방 · 공식 링크)는 sheet-templates/음방정보.csv,
  // 설명 글은 음방안내.csv (관리자 모드 "음악방송"). 여기는 공식 일정 제목에서 그 음방을 알아보는 규칙만 있어요
  const MG_RE = {
    showkpop: /쇼케이팝|show\s*k-?pop|monshow/i,
    theshow: /더\s*쇼(?!케)|the\s*show\b/i,
    showchamp: /쇼\s*챔피언|쇼챔|show\s*champion/i,
    mcountdown: /엠\s*카운트다운|엠카|m\s*countdown/i,
    musicbank: /뮤직\s*뱅크|뮤뱅|music\s*bank/i,
    musiccore: /음악\s*중심|음중|music\s*core/i,
    inkigayo: /인기가요|inkigayo/i,
  };
  // 칸 속 여러 줄: 한 줄 = 항목 하나, "앞 | 뒤"로 두 칸
  const mgLines = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const mgPair = (x) => { const i = x.indexOf('|'); return i < 0 ? [x.trim(), ''] : [x.slice(0, i).trim(), x.slice(i + 1).trim()]; };
  const mgWk = (v) => { const m = /^(.+?)\s*~\s*(.+)$/.exec(v || ''); return m ? { from: m[1], to: m[2] } : null; };
  // 사전투표(p = '사전투표') · 실시간(p = '실시간') 칸 → 투표 정보. 앱이 비면 그 투표는 없음
  function mgVote(r, p) {
    const keys = String(r[p + '앱'] || '').split(/[,\s]+/).filter(Boolean);
    if (!keys.length) return null;
    const v = { appKey: keys[0] };
    if (keys.length > 1) v.appKeys = keys;
    [['앱이름', 'app'], ['짧은이름', 'short'], ['비용', 'cost'], ['위치', 'where'], ['양', 'qty']].forEach(([c, k]) => { if (r[p + c]) v[k] = r[p + c]; });
    const t = r[p + '시간'];
    if (t && p === '실시간') v.window = t;
    else if (mgWk(t)) v.wk = Object.assign(mgWk(t), r[p + '시간메모'] ? { note: r[p + '시간메모'] } : {});
    return v;
  }
  const MUSIC_SHOWS = toObjects((window.SAMPLE_DATA || {}).musicshows || '').map((r) => {
    const m = { id: r['아이디'], span: r['사전투표요일'], day: '일월화수목금토'.indexOf(r['요일']), name: r['음방'], sub: r['영문'], time: r['시작'], end: r['끝'], ch: r['채널'],
      re: MG_RE[r['아이디']] || /$^/, parts: mgLines(r['점수항목']).map(mgPair), pre: mgVote(r, '사전투표'), live: mgVote(r, '실시간') };
    if (!m.parts.length) delete m.parts;
    const links = mgLines(r['공식링크']).map(mgPair);
    if (links.length) m.links = links;
    if (r['문자투표']) { const [to, body] = mgPair(r['문자투표']); m.sms = { to, body }; }
    if (r['시청자위원회']) { const [w, where] = mgPair(r['시청자위원회']); m.jury = { wk: mgWk(w), where }; }
    // 결방: 결방 시작 ~ 결방 끝 (끝을 비우면 다시 시작 날짜 미정). 날짜가 지나면 저절로 원래대로 보여요
    if (r['결방시작']) {
      m.off = { from: r['결방시작'] };
      [['결방끝', 'until'], ['결방제목', 'title'], ['결방설명', 'note'], ['결방짧게', 'short'], ['결방출처', 'src']].forEach(([c, k]) => { if (r[c]) m.off[k] = r[c]; });
    }
    return m;
  });
  // 음방 설명 글은 sheet-templates/음방안내.csv (관리자 모드 "음악방송 · 음방 안내"에서 고쳐요). 칸 이름 → [어디, 키, 줄마다 한 항목]
  const MG_TEXT = {
    '1위정하는방법': [null, 'chart'], '점수기준출처': [null, 'partsSrc'], '알아두면좋아요': [null, 'tip', 1], '방송뒤투표': [null, 'after'],
    '사전투표언제': ['pre', 'when'], '사전투표방법': ['pre', 'steps', 1], '사전투표투표권': ['pre', 'ticket'], '사전투표모으기': ['pre', 'earn', 1], '사전투표투표수': ['pre', 'limit'], '사전투표참고': ['pre', 'weight'],
    '실시간언제': ['live', 'when'], '실시간방법': ['live', 'steps', 1], '실시간투표권': ['live', 'ticket'], '실시간투표수': ['live', 'limit'], '실시간참고': ['live', 'weight'],
  };
  toObjects((window.SAMPLE_DATA || {}).musicinfo || '').forEach((r) => {
    const m = MUSIC_SHOWS.find((x) => x.id === r['아이디']);
    if (!m) return;
    Object.entries(MG_TEXT).forEach(([c, [at, k, many]]) => {
      const o = at ? m[at] : m;
      const v = r[c] || '';
      if (o && v) o[k] = many ? v.split('\n').map((x) => x.trim()).filter(Boolean) : v;
    });
  });
  // --- 편성표: 방송사 공식 편성표에서 3시간마다 받아 둔 날짜별 방송 시간 (data/onair.json, tools/crawl_onair.py) ---
  state.onair = null;
  function onairLoad(force = false) {
    loadResource('onair', 'data/onair.json', { air: {} }, d => {
      if (!d || !d.air || typeof d.air !== 'object') throw new Error('편성 자료 형식 오류');
      return { updated: d.updated || '', air: d.air };
    }, () => route().tab === 'music' ? render({ keepScroll: true }) : schRefresh(), force);
  }
  state.lineup = null;
  function lineupLoad(force = false) {
    loadResource('lineup', 'data/lineup.json', { shows: {} }, d => {
      if (!d || !d.shows || typeof d.shows !== 'object') throw new Error('출연진 자료 형식 오류');
      return { updated: d.updated || '', shows: d.shows };
    }, () => route().tab === 'music' ? render({ keepScroll: true }) : schRefresh(), force);
  }
  // 그날 방송: 편성표에 있으면 그 시간, 아직 없으면 평소 시간. moved = 평소보다 5분 넘게 당기거나 늦춤, off = 편성표에 그날 방송이 없음
  function airOf(m, date) {
    onairLoad();
    const a = ((state.onair.air || {})[m.id] || {})[date];
    if (!a || !a.start) return { time: m.time, end: m.end, off: !!(a && a.off), unverified: !a || !!a.off };
    return { time: a.start, end: a.end || m.end, moved: Math.abs(hmMin(a.start) - hmMin(m.time)) >= 5 };
  }
  // 오늘부터 가장 가까운 그 음방 방송일
  const nextAir = (m, t) => addDays(t, (m.day - dowOf(t) + 7) % 7);
  // 그 날 결방이면 결방 정보: 직접 적은 결방(MUSIC_SHOWS의 off) → 편성표에 그날 방송이 없을 때
  function offOn(m, date) {
    if (!m) return null;
    if (m.off && date >= m.off.from && (!m.off.until || date <= m.off.until)) return m.off;
    return airOf(m, date).off ? { title: `${mdw(date)} 방송 편성을 확인해 주세요`, note: `${m.ch} 편성표에서 방송을 찾지 못했어요. 결방 확정 여부와 투표 진행은 공식 공지를 확인해 주세요.`, short: `${md(date)} 결방`, auto: true } : null;
  }
  const offShort = (o) => o.short || (o.until ? `${+o.until.slice(5, 7)}월 ${+o.until.slice(8, 10)}일까지 결방` : '결방 · 다시 시작 미정');
  // 편성표가 평소와 다를 때 한 줄 (같으면 '')
  function airNote(m, date) {
    const a = airOf(m, date);
    return a.off ? `${m.ch} 편성표에 이날 방송이 없어요 (결방)` : a.moved ? `${m.ch} 편성표: ${a.time} 방송 · 평소 ${m.time}` : '';
  }
  // 음방.csv 는 짧은 이름(음악중심)을 써요
  const showById = (id) => MUSIC_SHOWS.find((m) => m.id === id || m.name === id || m.name.replace(/^쇼!\s*/, '') === id);
  // 공식 일정(Mnet Plus · blip) 제목으로 어떤 음방인지 (같은 요일일 때만, 페스티벌·시상식은 빼고)
  function showOfEvent(e) {
    if (!e || !e.title || /페스티벌|festival|어워즈|awards?|콘서트|concert|in\s+japan/i.test(e.title)) return null;
    return MUSIC_SHOWS.find((m) => m.re.test(e.title) && dowOf(e.date) === m.day) || null;
  }
  // 사전 녹화(사녹)가 있으면 그 주 방송 출연 확정 (사용자 규칙 2026-11-04): 녹화일부터 가장 가까운 그 음방 방송일
  function preRecOf(e) {
    if (!e || !e.title || !/사전\s*녹화|사녹/.test(e.title)) return null;
    const m = MUSIC_SHOWS.find((x) => x.re.test(e.title));
    return m ? { show: m, date: nextAir(m, e.date) } : null;
  }
  // 리센느 음방 출연 (확정): 음방.csv의 출연·1위후보 + 방송사 출연진 공지 + 공식 일정에 올라온 음방 · 사녹
  function musicAppearances() {
    const out = new Map();
    (state.data.music || []).filter((r) => r.kind !== 'pre' && r.date).forEach((r) => {
      const m = showById(r.show);
      if (!m) return;
      const k = m.id + r.date;
      const cur = out.get(k) || { show: m, date: r.date, manual: true };
      out.set(k, { ...cur, top: cur.top || r.kind === 'top', vote: cur.vote || r.kind === 'vote', memo: r.memo || cur.memo, src: r.src || cur.src });
    });
    lineupLoad();
    Object.entries(state.lineup.shows || {}).forEach(([id, days]) => {
      const m = showById(id);
      if (!m) return;
      Object.entries(days || {}).forEach(([date, v]) => {
        if (!v || !v.rescene) return;
        const k = m.id + date;
        const cur = out.get(k) || { show: m, date };
        out.set(k, { ...cur, auto: true, src: cur.src || v.link || '' });
      });
    });
    const ym = today().slice(0, 7);
    [ym, ymAdd(ym, 1)].forEach((x) => schLoad(x)); // 음악방송 탭을 바로 열어도 공식 일정(사녹)을 받아요 (10분 안엔 다시 안 받음)
    const official = [];
    Object.keys(state.sch || {}).forEach((x) => schOf(x).forEach((e) => official.push(e)));
    ((state.blip && state.blip.events) || []).forEach((e) => official.push(e));
    weeklyNew().forEach((e) => official.push(e)); // 주간 일정표에 올라온 음방도
    official.forEach((e) => {
      const m = showOfEvent(e);
      if (m) {
        const k = m.id + e.date;
        if (out.has(k)) out.get(k).official = true;
        else out.set(k, { show: m, date: e.date, official: true });
        return;
      }
      const pre = preRecOf(e); // 사녹 일정은 녹화한 날에 따로 보이니, 방송일 출연은 자동 출연으로
      if (pre && !out.has(pre.show.id + pre.date)) out.set(pre.show.id + pre.date, { ...pre, auto: true });
    });
    return [...out.values()].sort((x, y) => x.date.localeCompare(y.date));
  }
  // 리센느가 들어간 사전투표 (음방.csv)
  const musicPrevotes = () => (state.data.music || []).filter((r) => r.kind === 'pre' && r.end && showById(r.show)).map((r) => ({ ...r, show: showById(r.show) }));
  // 오늘 할 일로: 음총팀이 하라고 한 실시간 투표(그날) + 사전투표(기간 동안)
  function musicTodos(d) {
    const out = [];
    const base = { ally: null, kind: 'self', days: [], tbd: false, tags: [], proof: '', proofLinks: [], deadline: '' };
    musicAppearances().filter((a) => a.date === d && a.vote && a.show.live).forEach((a) => {
      const m = a.show;
      const air = airOf(m, d);
      // 방송 시간이 바뀐 날은 정해 둔 투표 시간 대신 실제 방송 시간
      const win = air.moved ? `${air.time} ~ ${air.end} (방송 시간 변경)` : m.live.window || `${air.time} ~ ${air.end}`;
      out.push({ ...base, id: `mv-${m.id}-${d}`, camp: '음방 실시간 투표', title: `${m.name} ${a.top ? '1위 후보 ' : ''}실시간 투표`, qty: m.live.qty || '',
        platform: m.live.app, window: win, repeat: '1회', start: d, end: d, link: appHref(m.live.appKey), appKey: m.live.appKey, sms: m.sms || null,
        memo: [airNote(m, d) && `${airNote(m, d)}. 투표 시간도 달라질 수 있어요.`, `${m.live.where}`, `${m.live.when} · ${m.live.limit}`, a.memo].filter(Boolean).join('\n'), music: m });
    });
    musicPrevotes().forEach((r) => {
      const st = r.start ? r.start.date : '';
      if ((st && d < st) || d > r.end.date) return;
      const m = r.show;
      out.push({ ...base, id: `mp-${r.id}`, camp: '음방 사전투표', title: `${m.name} 사전투표`, qty: m.pre.qty || '',
        platform: m.pre.app, window: `~ ${mdw(r.end.date)}${r.end.time ? ' ' + r.end.time : ''}`, repeat: '매일', start: st, end: r.end.date, link: appHref(m.pre.appKey), appKey: m.pre.appKey,
        memo: [m.pre.where, m.pre.limit, r.memo].filter(Boolean).join('\n'), music: m });
    });
    return out;
  }
  // 스케줄에 넣을 확정 출연 중 공식 일정에 없는 것 (음방.csv · 방송사 출연진 공지 · 사녹)
  const musicExtraEvents = () => musicAppearances().filter((a) => (a.manual || a.auto) && !a.official).map((a) => ({
    id: `mv-${a.show.id}-${a.date}`, date: a.date, end: a.date, time: airOf(a.show, a.date).time, title: `${a.show.name} 출연`, type: '음방', place: a.show.ch, src: 'etc', link: a.src || '', mv: a.show,
  }));
  // 투표 한 줄 요약 (스케줄 일정 줄 · 가이드)
  const liveLine = (m) => (m.live ? `실시간 투표 ${m.live.window || m.time + '~'} · ${m.live.app}${m.live.qty ? ' ' + m.live.qty : ''}` : '실시간 투표 없음 · 사전투표가 점수에 반영');
  // 투표 가이드 음방 맨 위: 출연 예정 음방 (잡힌 출연은 날짜 제한 없이 모두, 누르면 그 음방 탭으로)
  function musicVoteStrip() {
    const t = today();
    const until = addDays(t, 6);
    const rows = [];
    musicPrevotes().forEach((r) => {
      if (r.end.date < t || (r.start && r.start.date > until)) return;
      const live = !r.start || r.start.date <= t;
      rows.push({ at: live ? t : r.start.date, k: live ? '진행 중' : `${mdw(r.start.date)}부터`, hot: live, t: `${r.show.name} 사전투표`, d: `~ ${mdw(r.end.date)}${r.end.time ? ' ' + r.end.time : ''}`, g: r.show.id });
    });
    musicAppearances().forEach((a) => {
      if (a.date < t) return;
      const air = airOf(a.show, a.date);
      const d = air.off ? '편성표에 없음 (결방)' : air.moved ? `${air.time} ${a.show.ch} · 시간 변경` : a.vote && a.show.live ? a.show.live.window || `${air.time} ~ ${air.end}` : `${air.time} ${a.show.ch}`;
      rows.push({ at: a.date, k: a.date === t ? '오늘' : mdw(a.date), hot: a.date === t, t: `${a.show.name} ${a.vote ? (a.top ? '1위 후보 투표' : '실시간 투표') : a.top ? '1위 후보' : '출연'}`, d, g: a.show.id });
    });
    rows.sort((x, y) => x.at.localeCompare(y.at));
    const li = (r) => `<li><button type="button" data-mgtab="${r.g}"><span class="mv-k${r.hot ? ' hot' : ''}">${esc(r.k)}</span><b>${esc(r.t)}</b><span class="mv-d num">${esc(r.d)}</span></button></li>`;
    if (!rows.length) return ''; // 출연 예정 음방이 없으면 칸을 숨겨요
    return `<section class="mv-strip" aria-label="리센느 음방 투표">
        <div class="mv-head"><h2>출연 예정 음방</h2></div>
        ${rows.length ? `<ul>${rows.slice(0, 4).map(li).join('')}</ul>${rows.length > 4 ? `<details class="mv-more"><summary>${rows.length - 4}개 더 보기</summary><ul>${rows.slice(4).map(li).join('')}</ul></details>` : ''}`
          : '<p class="mv-none">출연·사전투표가 정해지면 여기와 오늘 할 일, 리센느 일정 달력에 보여요.</p>'}
      </section>`;
  }
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const nowHM = () => new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const hmMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  // 오늘 화면 한 줄: 오늘 음방 (끝났거나 없으면 다음 음방)
  function musicLine() {
    const dow = dowOf(today());
    const now = hmMin(nowHM());
    const todays = MUSIC_SHOWS.find((m) => m.day === dow && !offOn(m, today()));
    let show = todays, k = '오늘 음방', tag = '', at = today();
    if (todays) {
      const a = airOf(todays, at);
      const st = hmMin(a.time);
      const en = hmMin(a.end) > st ? hmMin(a.end) : st + 90;
      if (now >= st && now < en) tag = '방송 중';
      else if (now >= en) show = null;
    }
    for (let i = 1; i <= 7 && !show; i++) {
      const m = MUSIC_SHOWS.find((x) => x.day === (dow + i) % 7 && !offOn(x, addDays(today(), i)));
      if (m) { show = m; at = addDays(today(), i); k = i === 1 ? '내일 음방' : `${WD[m.day]}요일 음방`; }
    }
    if (!show) return '';
    const mine = musicAppearances().some((a) => a.show === show && a.date === at);
    if (mine && !tag) tag = '리센느 출연';
    const air = airOf(show, at);
    return `<button type="button" class="sch-next mus-line" data-music aria-label="요일별 음악방송 시간표 보기"><span class="sch-next-k">${k}</span><span class="sch-next-t">${esc(show.name)}${tag ? ` <i class="mus-live">${tag}</i>` : ''}</span><span class="sch-next-d">${air.time} ${esc(show.ch)}${air.moved ? ` · 시간 변경 (평소 ${show.time})` : ''}</span><svg class="mus-go" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  }
  function openMusic() {
    let m = document.getElementById('music');
    if (!m) {
      m = document.createElement('div');
      m.id = 'music'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', '요일별 음악방송 시간표'); m.tabIndex = -1;
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-modal-close]')) hideModal(m); });
    }
    const dow = dowOf(today());
    m.innerHTML = `
      <div class="modal-box">
        <div class="modal-head"><h2>요일별 음악방송 시간표</h2><button type="button" class="icon-btn" data-modal-close aria-label="닫기">닫기</button></div>
        <div class="mus-table">
          ${[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const x = MUSIC_SHOWS.find((y) => y.day === d);
            const day = x && nextAir(x, today());
            const o = x && offOn(x, day);
            const a = x && airOf(x, day);
            const sub = o ? `<small class="mus-off">${esc(offShort(o))}</small>` : a && a.moved ? `<small class="mus-moved">${md(day)} 시간 변경 · 평소 ${x.time}</small>` : x ? `<small>${esc(x.live ? '실시간 ' + x.live.app : '실시간 투표 없음')}</small>` : '';
            return `<div class="mus-row${d === dow ? ' on' : ''}${o ? ' off' : ''}"><span class="mus-d">${WD[d]}${d === dow ? '<small>오늘</small>' : ''}</span><span class="mus-n">${x ? esc(x.name) : '<i>음방 없음</i>'}${sub}</span><span class="mus-t num">${x ? (o ? x.time : a.time) : ''}</span><span class="mus-c">${x ? esc(x.ch) : ''}</span></div>`;
          }).join('')}
        </div>
        <p class="muted">방송사 공식 편성표 기준이에요 (3시간마다 확인). 편성표가 아직 안 나온 주는 평소 시간이에요.</p>
        <button type="button" class="btn small primary mus-guide" data-goguide="music">음방별 투표 방법 보기</button>
      </div>`;
    showModal(m);
  }


  // ---------- 투표 가이드 ----------
  // ---------- 음방 주간 스케줄 (일반 안내) ----------
  // 음방 7개가 매주 똑같이 하는 방송 · 투표 시간 (MUSIC_SHOWS 의 day · time · live · pre.wk · jury). 리센느 출연과는 상관없어요.
  // 칸은 월~일 (음총팀 '음악방송 스케줄러' 그림과 같은 모양). 칸을 누르면 그 음방 투표 방법으로 가요.
  const MC_COLOR = { showkpop: '#8a6fc9', theshow: '#7f9a3e', showchamp: '#3a9696', mcountdown: '#cf8443', musicbank: '#3f8fc2', musiccore: '#6a5bd0', inkigayo: '#c9658c' };
  const WK_DAYS = ['월', '화', '수', '목', '금', '토', '일'];
  const wkCol = (dow) => (dow + 6) % 7; // 일요일(0)은 맨 끝 칸
  const noParen = (x) => String(x || '').replace(/\s*\(.*?\)/g, '');
  function musicCalendar(t) {
    const at = (x) => { const [d, hm] = x.split(' '); return { c: wkCol(WD.indexOf(d)), hm }; };
    const nb = (x) => x.replace(' ', ' '); // '토 00:00'은 붙여서, 줄바꿈은 '~' 앞뒤에서만
    // 기간 칸: 일요일을 넘어가면 (예: 금~월) 오른쪽 끝 조각 + 왼쪽 첫 조각. 글은 큰 조각에, 작은 조각엔 시작 · 끝 시각만
    const span = (m, w, cls, row, title, short, sub) => {
      const a = at(w.from), b = at(w.to);
      const parts = b.c >= a.c ? [[a.c, b.c, '']] : [[a.c, 6, ' cut-r'], [0, b.c, ' cut-l']];
      const main = parts.length === 1 || parts[0][1] - parts[0][0] >= parts[1][1] - parts[1][0] ? parts[0] : parts[1];
      const aria = `${m.name} ${title} ${w.from} ~ ${w.to}${sub ? ' · ' + sub : ''}${w.note ? ' · ' + w.note : ''}`;
      return parts.map((p) => {
        const body = p === main
          ? `<b>${title}</b>${sub ? `<span>${esc(sub)}</span>` : ''}<span class="num">${nb(w.from)} ~ ${nb(w.to)}</span>${w.note ? `<small>${esc(w.note)}</small>` : ''}`
          : `<b>${short}</b><span class="num">${p[2] === ' cut-l' ? '~' + b.hm : a.hm + '~'}</span>`;
        return `<button type="button" class="wk-span ${cls}${p[2]}${p === main ? '' : ' mini'}" data-mgtab="${m.id}" style="grid-column:${p[0] + 2} / ${p[1] + 3};grid-row:${row}"${p === main ? ` aria-label="${esc(aria)}"` : ' aria-hidden="true" tabindex="-1"'}>${body}</button>`;
      }).join('');
    };
    const row = (m) => {
      const lanes = m.jury ? 2 : 1;
      const lv = m.live;
      const liveApp = lv ? noParen(lv.app) + (lv.window ? ' ' + lv.window : '') : '';
      return `<div class="wk-row" style="--c:${MC_COLOR[m.id]};grid-template-rows:repeat(${lanes}, auto)">
        <div class="wk-lab" style="grid-row:1 / span ${lanes}"><b><span class="wk-s">${esc(MG_SHORT[m.id])}</span><span class="wk-l">${esc(m.name)}</span></b><small class="num">${WD[m.day]} ${m.time}</small></div>
        <button type="button" class="wk-air" data-mgtab="${m.id}" style="grid-column:${wkCol(m.day) + 2};grid-row:1 / span ${lanes}" aria-label="${esc(`${m.name} 방송 ${WD[m.day]}요일 ${m.time}${lv ? ' · 실시간 투표 ' + liveApp : ' · 실시간 투표 없음'}`)}"><b>방송</b>${lv ? `<i>실시간</i><small>${esc(liveApp)}</small>` : ''}</button>
        ${m.jury ? span(m, m.jury.wk, 'jury', 1, '시청자위원회', '위원회', m.jury.where) : ''}
        ${span(m, m.pre.wk, 'pre', lanes, '사전투표', '사전', noParen(m.pre.short || m.pre.app))}
      </div>`;
    };
    const tc = wkCol(dowOf(t));
    const order = [1, 2, 3, 4, 5, 6, 0].map((d) => MUSIC_SHOWS.find((m) => m.day === d)).filter((m) => m && m.pre && m.pre.wk);
    return `
      <section class="card wk" aria-label="음방 주간 스케줄 · 리센느 출연과 무관한 일반 안내">
        <div class="wk-head"><h2>음방 주간 스케줄</h2><span class="wk-badge">리센느 출연과 무관 · 일반 안내</span></div>
        <p class="wk-lead">음방 7개가 매주 같은 요일 · 시간에 하는 방송과 투표예요. 리센느가 나오는지와는 상관없어요.</p>
        <ul class="wk-key"><li><i class="k-air"></i>방송 · 실시간 투표</li><li><i class="k-pre"></i>사전투표</li><li><i class="k-jury"></i>시청자위원회</li></ul>
        <div class="wk-grid">
          <div class="wk-row wk-hd" aria-hidden="true"><span></span>${WK_DAYS.map((d, i) => `<span class="${i === tc ? 'on' : ''}${i === 5 ? ' sat' : i === 6 ? ' sun' : ''}">${d}</span>`).join('')}</div>
          ${order.map(row).join('')}
        </div>
        <p class="wk-foot">평소 시간 기준이에요. 회차마다 바뀔 수 있으니 실제 투표는 음총팀 공지를 따라 주세요. 칸을 누르면 그 음방 투표 방법으로 가요.</p>
      </section>`;
  }
  function renderMusic() {
    return `
      <section class="page-head"><h1>음악방송</h1><p>리센느 음방 일정 · 음방 7개 투표 방법</p></section>
      ${musicGuides(today())}
      ${sourceLine()}`;
  }
  const MG_SHORT = { showkpop: '쇼케', theshow: '더쇼', showchamp: '쇼챔', mcountdown: '엠카', musicbank: '뮤뱅', musiccore: '음중', inkigayo: '인가' };
  // 음방 탭 고르기: 다시 그리지 않고 카드만 바꿔요
  function pickMusic(id, scroll) {
    const pick = document.querySelector('.mg-pick');
    if (!pick) return;
    state.mgShow = id;
    pick.id = 'guide-music-' + id;
    pick.querySelectorAll('[data-mgtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mgtab === id)));
    pick.querySelectorAll('[data-mg]').forEach((c) => { c.hidden = c.dataset.mg !== id; });
    if (scroll) pick.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-mgtab]');
    if (b) pickMusic(b.dataset.mgtab, !b.classList.contains('mg-tab'));
  });
  function musicGuides(t) {
    const pctOf = (x) => { const r = /(\d+(?:\.\d+)?)\s*%/.exec(x || ''); return r ? +r[1] : 0; };
    // 점수 항목: 이름 · 비율 · 팬 투표인지 · 생방송(1위 후보 단계)인지
    const partsOf = (m) => (m.parts || []).map(([k, v]) => ({ k, v, p: pctOf(k), name: k.replace(/\s*\d+(?:\.\d+)?\s*%/, ''), vote: /투표/.test(k), live: /생방송|실시간/.test(k) }));
    const nTop = (m) => (/후보\s*(\d)\s*팀/.exec(m.chart || '') || [])[1];
    const appBtn = (keys, extra) => {
      const list = keys.filter((k) => APPS[k]);
      if (!list.length) return '';
      const many = list.length > 1;
      return `<div class="mg-app"><div class="mg-btns${many ? ' many' : ''}">${list.map((k) => `<a class="btn primary" href="${esc(appHref(k))}"${appTarget(k)} rel="noopener" data-app="${k}">${esc(APPS[k].name)}${many ? ' 투표' : ' 앱에서 투표'}</a>`).join('')}${extra || ''}</div></div>`;
    };
    // 투표 칸: 언제 → 어떻게 → 투표권 · 투표 수 → 버튼. 점수 비율은 아래 '1위 점수'에서 한 번만
    const box = (no, title, v, cls, m) => {
      if (!v) return `<section class="mg-box none"><div class="mg-box-h"><h3>${title}<em>${no}</em></h3></div><p class="mg-none">이 음방은 실시간 투표가 없어요. 사전투표가 팬 투표의 전부예요.</p></section>`;
      const p = pctOf(v.weight);
      const btns = appBtn(v.appKeys || [v.appKey], cls === 'live' && m.sms ? `<a class="btn sms mg-sms" href="sms:${encodeURIComponent(m.sms.to)}?&body=${encodeURIComponent(m.sms.body)}">문자 ${esc(m.sms.to)}</a>` : '');
      const note = (v.weight || '').replace(/^[^(·]*?\d+(?:\.\d+)?\s*%\s*/, '').replace(/^[·(\s]+|[)\s]+$/g, '').trim();
      return `<section class="mg-box ${cls || ''}">
        <div class="mg-box-h"><h3>${title}<em>${no}</em></h3>${p ? `<span class="mg-pct">점수 ${p}%</span>` : ''}</div>
        <p class="mg-period"><span>언제</span>${esc(v.when)}</p>
        <ol class="mg-steps">${(v.steps || [v.where]).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
        <dl>
          ${btns ? '' : `<dt>앱</dt><dd>${esc(v.app)}</dd>`}
          ${v.ticket ? `<dt>투표권</dt><dd>${esc(v.ticket)}</dd>` : ''}
          ${v.earn ? `<dt>모으기</dt><dd><ul class="mg-earn">${v.earn.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></dd>` : ''}
          <dt>투표 수</dt><dd>${esc(v.limit)}</dd>
          ${note && !/실시간 투표가 없어서/.test(note) ? `<dt>참고</dt><dd>${esc(note)}</dd>` : ''}</dl>
        ${btns}
      </section>`;
    };
    // 1위 점수: 막대 하나로 비율을 보여주고, 팬이 직접 올릴 수 있는 투표 몫을 강조
    const score = (m) => {
      const ps = partsOf(m);
      if (!ps.length) return `<p class="mg-chart">${esc(m.chart)}</p>`;
      const total = ps.reduce((x, y) => x + y.p, 0);
      const fan = ps.filter((x) => x.vote).reduce((x, y) => x + y.p, 0);
      let g = 0;
      ps.forEach((x) => { x.c = x.vote ? (x.live ? 'vl' : 'vp') : `g${g++ % 4}`; });
      const n = nTop(m);
      const how = m.live
        ? `사전 점수${n ? `로 1위 후보 ${n}팀을 뽑고` : '에'}, 방송 중 실시간 투표를 더해 1위가 정해져요`
        : '실시간 투표 없이 사전 점수만으로 1위가 정해져요';
      return `<section class="mg-score">
        <div class="mg-score-h"><h3>1위는 이렇게 정해져요</h3><span class="mg-fan">팬 투표${total === 100 ? '' : ' 배점'} <b>${total === 100 ? fan + '%' : fan + ' / ' + total}</b></span></div>
        <p class="mg-how">${how}</p>
        <div class="mg-bar" role="img" aria-label="${esc(ps.map((x) => `${x.name} ${x.p}%`).join(', '))}">${ps.map((x) => `<i class="${x.c}" style="flex-grow:${x.p}"></i>`).join('')}</div>
        <ul class="mg-legend">${ps.map((x) => `<li class="${x.vote ? 'vote' : ''}"><i class="${x.c}"></i>${esc(x.name)} <b>${x.p}</b></li>`).join('')}</ul>
        <details class="mg-parts"><summary>항목별 기준 · 집계 기간</summary><dl>${ps.map((x) => `<dt>${esc(x.k)}</dt><dd>${esc(x.v)}</dd>`).join('')}</dl>${m.partsSrc ? `<small>${esc(m.partsSrc)}</small>` : ''}</details>
      </section>`;
    };
    const notes = (m) => {
      const list = m.tip || [];
      if (!list.length && !m.after) return '';
      return `<details class="mg-notes mg-fold"><summary><h3>알아두면 좋아요</h3><span class="mg-cnt">${list.length + (m.after ? 1 : 0)}개</span></summary><ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}${m.after ? `<li class="after"><b>방송 뒤 투표</b>${esc(m.after.replace(/^[^:]+:\s*/, (h) => h))}</li>` : ''}</ul></details>`;
    };
    const card = (m, sel) => {
      const day = nextAir(m, t);
      const o = offOn(m, day);
      const air = airOf(m, day);
      return `
      <article class="card guide mg" data-mg="${m.id}" role="tabpanel"${m === sel ? '' : ' hidden'}>
        <header class="mg-head">
          <span class="mg-day" aria-label="${WD[m.day]}요일">${WD[m.day]}</span>
          <div class="mg-title"><h2>${esc(m.name)}</h2><small>${esc(m.sub)}</small></div>
          <div class="mg-air"><b class="num">${o ? m.time : air.time}</b><span>${esc(m.ch)}</span></div>
        </header>
        ${o ? `<div class="mg-off" role="note"><b>${esc(o.title)}</b><p>${esc(o.note)}${o.auto ? '' : ' 투표 진행 여부는 해당 회차 공지를 확인해 주세요.'}</p>${o.src ? `<a href="${esc(o.src)}" target="_blank" rel="noopener">관련 기사 ↗</a>` : ''}</div>` : ''}
        ${!o && air.moved ? `<div class="mg-off" role="note"><b>${mdw(day)} 방송은 ${air.time}에 시작해요</b><p>평소 ${m.time}에서 바뀌었어요 (${esc(m.ch)} 공식 편성표). 실시간 투표 시간도 달라질 수 있어요.</p></div>` : ''}
        <div class="mg-grid">${box('방송 전', '사전투표', m.pre, '', m)}${box('방송 중', '실시간 투표', m.live, 'live', m)}</div>
        ${score(m)}
        ${notes(m)}
        ${m.links ? `<div class="mg-links">${m.links.map(([nm, u]) => `<a class="btn small" href="${esc(u)}" target="_blank" rel="noopener">${esc(nm)} ↗</a>`).join('')}</div>` : ''}
      </article>`;
    };
    const order = [1, 2, 3, 4, 5, 6, 0].map((d) => MUSIC_SHOWS.find((m) => m.day === d)).filter(Boolean);
    const { arg } = route();
    const want = arg && arg.startsWith('music-') ? arg.slice(6) : state.mgShow;
    // 처음 보여 줄 음방: 주소로 고른 것 → 직접 고른 것 → 오늘 요일 음방
    const wd = new Date(t.replace(/-/g, '/')).getDay();
    const sel = order.find((m) => m.id === want) || order.find((m) => m.day === wd) || order[0];
    const offNext = (m) => offOn(m, nextAir(m, t));
    const tabs = order.map((m) => `<button type="button" role="tab" class="mg-tab${offNext(m) ? ' off' : ''}${m.day === wd ? ' today' : ''}" data-mgtab="${m.id}" aria-selected="${m === sel}" aria-label="${WD[m.day]}요일 ${esc(m.name)}${m.day === wd ? ' (오늘)' : ''}${offNext(m) ? ' · 결방' : ''}"><small>${WD[m.day]}</small><b>${esc(MG_SHORT[m.id] || m.name)}</b>${offNext(m) ? '<em class="mg-tab-off">결방</em>' : ''}</button>`).join('');
    return `
      <section class="mg-section" id="guide-music">
        ${musicVoteStrip()}
        ${musicCalendar(t)}
        <a class="mg-pred" href="https://x.com/KshowAnalysis1" target="_blank" rel="noopener"><span class="mg-pred-x" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.19L2 3h6.33l4.37 5.77L17.75 3zm-1.08 16.17h1.7L7.4 4.73H5.58l11.09 14.44z"/></svg></span>차트 결과 예측<span class="mg-pred-go" aria-hidden="true">↗</span><span class="sr">(X @KshowAnalysis1에서 열기)</span></a>
        <details class="card mg-intro mg-fold">
          <summary><h3>음방 투표가 처음이라면</h3></summary>
          <ol>
            <li><b>앱 준비</b><span>음방마다 투표 앱이 달라요. 버튼을 누르면 앱이 열리고, 없으면 설치 화면으로 가요.</span></li>
            <li><b>사전투표</b><span>방송 며칠 전부터 열려요. 기간 동안 앱에서 모은 투표권으로 리센느에 투표해요.</span></li>
            <li><b>실시간 투표</b><span>생방송 중에만 열려요. 대부분 1위 후보에 오른 팀에게만 투표할 수 있어요.</span></li>
          </ol>
          <p>리센느 출연 · 투표가 확정되면 오늘 할 일에 자동으로 떠요. 기간은 회차마다 바뀔 수 있어요. 어느 음방에 투표할지는 리센느 음원총공팀 공지를 먼저 따라 주세요.</p>
        </details>
        <details class="card mg-table mg-fold">
          <summary><h3>음방 7개 한눈에 비교</h3></summary>
          <div role="table" aria-label="음방별 투표 한눈에">
          <div class="mg-tr mg-th" role="row"><span role="columnheader">방송</span><span role="columnheader">사전투표</span><span role="columnheader">실시간</span></div>
          ${order.map((m) => `<button type="button" class="mg-tr" role="row" data-mgtab="${m.id}"><span role="cell"><b>${esc(m.name)}</b>${offNext(m) ? '<i class="mg-offtag">결방</i>' : airOf(m, nextAir(m, t)).moved ? '<i class="mg-offtag">시간 변경</i>' : ''}<small><em>${WD[m.day]}</em> ${offNext(m) ? m.time : airOf(m, nextAir(m, t)).time} · ${esc(m.ch)}</small></span><span role="cell">${esc(m.pre.short || m.pre.app.replace(/\(.*\)/, ''))}<small>${esc(m.pre.cost ? m.span : [m.span, m.pre.qty].filter(Boolean).join(' · '))}</small>${m.pre.cost ? `<span class="mg-cost">${esc(m.pre.cost)}</span>` : ''}</span><span role="cell">${m.live ? `${esc(m.live.short || m.live.app.replace(/\(.*\)/, ''))}${m.live.cost ? `<span class="mg-cost">${esc(m.live.cost)}</span>` : `<small>${esc(m.live.qty || '방송 중')}</small>`}` : '<i>없음</i>'}</span></button>`).join('')}
          </div>
        </details>
        <div class="mg-pick" id="guide-music-${sel.id}">
          <div class="mg-tabs" role="tablist" aria-label="음방 고르기">${tabs}</div>
          <div class="mg-cards">${order.map((m) => card(m, sel)).join('')}</div>
        </div>
      </section>`;
  }
