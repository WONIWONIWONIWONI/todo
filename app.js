// 자동으로 만든 파일이에요. 고칠 때는 src/ 폴더를 고치세요 (tools/build_js.py). build:dcc96411b43e
  // [src/00-core.js] 바탕: 날짜·글자·투표 종류·CSV·체크 기록·불러오기·오류 알림. (function 여는 줄이 여기 있어요)
(function () {
  'use strict';

  const CFG = window.SITE_CONFIG || {};
  const TZ = 'Asia/Seoul';
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    const REFRESH_MS = 5 * 60 * 1000;
  const CACHE_KEY = 'rs-cache-v2';
  const KIND = {
    give: { label: '줄 것', long: '연합에 줄 것' },
    get: { label: '받을 것', long: '연합이 해주는 것' },
    self: { label: '자체', long: '리센느 자체' },
  };

  const $app = document.getElementById('app');
  const scrollBox = () => document.getElementById('scroll');
  const scrolledY = () => { const b = scrollBox(); return b ? b.scrollTop : window.scrollY; };
  const scrollTop0 = (smooth) => (scrollBox() || window).scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  const $notice = document.getElementById('notice');
  const state = { data: null, loadedAt: 0, source: '', renderedDate: '', calMonth: '', calSel: '', calView: 'timeline', guideFilter: '전체' };
  state.kindTab = 'give';
  state.open = new Set();
  state.allyOpen = new Set();
  state.allyFilter = '';
  try {
    state.calView = localStorage.getItem('rs-calview2') === 'grid' ? 'grid' : 'timeline';
    state.kindTab = localStorage.getItem('rs-kindtab') === 'get' ? 'get' : 'give';
  } catch (e) { /* 무시 */ }

  // 줄 것 / 받을 것 전환 탭
  function kindSeg(giveCount, getCount, giveLabel = '할 일', panelId = 'kind-panel') {
    const n = (v) => (v == null ? '' : ` <i class="seg-n">${v}</i>`);
    return `
      <div class="seg kind-seg" role="tablist" aria-label="할 일 / 받을 것">
        <button type="button" role="tab" id="tab-give" aria-controls="${panelId}" tabindex="${state.kindTab === 'give' ? 0 : -1}" data-kindtab="give" aria-selected="${state.kindTab === 'give'}" class="give ${state.kindTab === 'give' ? 'on' : ''}">${giveLabel}${n(giveCount)}</button>
        <button type="button" role="tab" id="tab-get" aria-controls="${panelId}" tabindex="${state.kindTab === 'get' ? 0 : -1}" data-kindtab="get" aria-selected="${state.kindTab === 'get'}" class="get ${state.kindTab === 'get' ? 'on' : ''}">받을 것${n(getCount)}</button>
      </div>`;
  }

  // ---------- 날짜 (모두 한국 시간 기준) ----------
  function kstNow() {
    const p = {};
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour) * 60 + (+p.minute) };
  }
  const today = () => kstNow().date;
  const toD = (s) => new Date(s + 'T00:00:00Z');
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const dowOf = (s) => toD(s).getUTCDay();
  const diffDays = (a, b) => Math.round((toD(b) - toD(a)) / 86400000);
  const md = (s) => { const d = toD(s); return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`; };
  const mdw = (s) => `${md(s)}(${DOW[dowOf(s)]})`;
  const longLabel = (s) => { const d = toD(s); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DOW[d.getUTCDay()]})`; };
  const dday = (from, to) => { const n = diffDays(from, to); return n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`; };

  function normDate(v) {
    v = String(v || '').trim();
    if (!v) return '';
    let m = v.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    m = v.match(/^(\d{1,2})\s*[.\/월-]\s*(\d{1,2})/);
    if (m) return `${today().slice(0, 4)}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    return '';
  }
  function normTime(v) {
    v = String(v || '').trim();
    const m = v.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
    if (!m) return null;
    let h = +m[1];
    const mm = +(m[2] || 0);
    if (/오후|pm/i.test(v) && h < 12) h += 12;
    if (/오전|am/i.test(v) && h === 12) h = 0;
    return Math.min(h * 60 + mm, 24 * 60);
  }

  // ---------- 글자 처리 ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 디시(dcinside) 주소는 어디에도 링크로 걸지 않아요
  // 예외: 이승윤 연합(삐뚜루) 인증 갤러리 하나만 허용 (사용자 지시 2026-11-02)
  const DC_OK = /^https?:\/\/gall\.dcinside\.com\/bgsmsylytb\/?$/i;
  const NO_LINK = /dcinside|dcimg|dcinside\.co/i;
  const linkUrl = (u) => { const s = String(u || '').trim(); return /^https?:\/\//i.test(s) && (DC_OK.test(s) || !NO_LINK.test(s)) ? s : ''; };
  function accountUrl(h) {
    h = String(h || '').trim();
    if (/^https?:\/\//i.test(h)) return h;
    const m = h.replace(/^@/, '');
    return /^\w{1,30}$/.test(m) ? 'https://x.com/' + m : '';
  }
  // ---------- 투표 종류(캠페인) ----------
  // 시트에 "2026 MMA GLOBAL TOP 10", "글로벌탑텐"처럼 달리 적어도 같은 이름으로 묶음
  const CAMP_RULES = [
    [/글로벌\s*탑\s*텐|글로벌\s*top\s*10|global\s*top\s*10/i, 'MMA 글로벌 TOP10'],
    // 글로벌이 안 붙은 일반 TOP10 (10.15~10.29)은 따로
    [/mma\s*(탑\s*텐|top\s*10)/i, 'MMA TOP10'],
    [/팬\s*초이스|fan\s*choice/i, (v) => (/2\s*차/.test(v) ? 'MAMA 팬 초이스 2차' : /1\s*차/.test(v) ? 'MAMA 팬 초이스 1차' : 'MAMA 팬 초이스')],
    [/kconer/i, "MAMA KCONERs' Choice"],
    [/올해의\s*신인|rookie/i, 'MMA 올해의 신인'],
    [/베스트\s*송|best\s*song/i, 'MMA 올해의 베스트송'],
    [/aaa/i, 'AAA 인기상'],
    [/엠카|m\s*countdown/i, '엠카 사전투표'],
    [/\bmv\b|뮤비/i, 'MV 스밍'],
    [/음방|음악\s*방송/, (v) => (/사전/.test(v) ? '음방 사전투표' : '음방 투표')],
    [/스밍|스트리밍|뮤직\s*웨이브|streaming/i, '음원 스밍'],
  ];
  // strict: 규칙에 맞는 게 없으면 빈 값 (내용 칸에서 추측할 때)
  function normCamp(v, strict) {
    v = String(v || '').replace(/20\d\d/g, '').replace(/\s+/g, ' ').trim();
    if (!v) return '';
    for (const [re, name] of CAMP_RULES) if (re.test(v)) return typeof name === 'function' ? name(v) : name;
    return strict ? '' : v;
  }
  // 화면 순서: 이 목록 순서대로, 모르는 종류는 뒤로, 종류 없는 항목은 맨 뒤
  const CAMP_ORDER = ['MMA 글로벌 TOP10', 'MMA TOP10', 'MAMA 팬 초이스 2차', 'MMA 올해의 신인', 'MMA 올해의 베스트송', "MAMA KCONERs' Choice", '퍼스트브랜드 대상', 'AAA 인기상', '엠카 사전투표', 'MV 스밍', '음원 스밍', '음방 투표', '음방 실시간 투표', '음방 사전투표', 'WITH 총공', '컴백', '컴백 지원'];
  const campOrder = (c) => (!c ? 999 : CAMP_ORDER.includes(c) ? CAMP_ORDER.indexOf(c) : 500);
  // 색 규칙: 색은 '상 묶음'(음방 · MAMA · MMA · 퍼스트브랜드 · 기타)에만 써요. 같은 묶음의 부문은 같은 색.
  // 연합팀은 색 없이 이름으로, 라즈베리(--accent)는 누르는 것 · 선택 표시에만.
  const GROUPS = [
    { id: '음방', color: '#b4532a' },
    { id: 'MAMA', color: '#1f6f9a' },
    { id: 'MMA', color: '#1f8a4c' },
    { id: '퍼스트브랜드', color: '#6d4bc4' },
    { id: '기타', color: '#64748b' },
  ];
  const campGroup = (c) => (/^음방/.test(c || '') ? '음방' : /^MAMA/i.test(c || '') ? 'MAMA' : /^MMA/i.test(c || '') ? 'MMA' : /^퍼스트\s*브랜드/.test(c || '') ? '퍼스트브랜드' : '기타');
  const groupOf = (c) => GROUPS.find((g) => g.id === campGroup(c));
  const campColor = (c) => groupOf(c).color;
  const campBadge = (c, small) => (c
    ? `<span class="camp ${small ? 'sm' : ''}" style="--cc:${campColor(c)}"><i class="camp-dot"></i>${esc(c)}</span>`
    : '');

  // 해시태그 순서: 연합 태그 먼저, 그 외(#RESCENE · #리센느 · #…VOTE 같은 공통 태그)는 뒤로. 나머지 순서는 적힌 그대로
  const COMMON_TAG = /^#(rescene|리센느|\w*vote)$/i;
  const tagsOf = (v) => {
    const t = String(v || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map((s) => (s[0] === '#' ? s : '#' + s));
    return t.filter((s) => !COMMON_TAG.test(s)).concat(t.filter((s) => COMMON_TAG.test(s)));
  };

  // ---------- CSV 읽기 ----------
  function parseCSV(text) {
    const rows = []; let row = []; let cell = ''; let q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function toObjects(text) {
    const rows = parseCSV(text);
    if (!rows.length) return [];
    const head = rows[0].map((h) => h.replace(/\s/g, ''));
    return rows.slice(1)
      .filter((r) => r.some((c) => c.trim() !== ''))
      .map((r) => { const o = {}; head.forEach((h, i) => { o[h] = (r[i] || '').trim(); }); return o; });
  }

  // "… · 매일 3표", "… 2회" → 제목과 하루 양(qty)으로 나눔
  function splitQty(t) {
    const m = String(t).match(/\s*(?:·\s*)?(매일\s*\d+\s*표|\d+\s*회)\s*$/);
    if (!m) return { title: t, qty: '' };
    return { title: t.slice(0, m.index).replace(/\s*·\s*$/, '').trim() || t, qty: m[1].replace(/^매일\s*/, '하루 ').replace(/\s+/g, ' ') };
  }

  function buildModel(raw) {
    const alliances = toObjects(raw.alliances).map((r, i) => ({
      id: r['아이디'] || `A${i + 1}`,
      artist: r['상대아티스트'] || r['상대팬덤'] || '(이름 없음)',
      fandom: r['상대팬덤'],
      account: r['상대총공계정'],
      accountUrl: accountUrl(r['상대총공계정']),
      state: r['진행상황'],
      link: linkUrl(r['공지링크']),
      memo: r['메모'],
      items: [],
    }));
    const allyMap = Object.fromEntries(alliances.map((a) => [a.id, a]));

    const guides = toObjects(raw.guides).map((r, i) => ({
      id: r['아이디'] || `g${i + 1}`,
      platform: r['플랫폼'] || '(플랫폼)',
      category: r['분류'] || '기타',
      link: linkUrl(r['바로가기']),
    }));
    const guideMap = Object.fromEntries(guides.map((g) => [g.id, g]));

    const items = toObjects(raw.tasks).map((r, i) => {
      const kindRaw = r['구분'] || '';
      const kind = /받/.test(kindRaw) ? 'get' : /줄|주는|해주|give/i.test(kindRaw) ? 'give' : 'self';
      const daysText = r['요일'] || '';
      const days = DOW.map((d, n) => (daysText.includes(d) ? n : -1)).filter((n) => n >= 0);
      let repeat = (r['반복'] || '').replace(/\s/g, '');
      if (/기간|아무|중1|한번만/.test(repeat)) repeat = '기간1회';
      else if (/1회|한번|하루/.test(repeat)) repeat = '1회';
      else if (/요일/.test(repeat) || days.length) repeat = '요일';
      else repeat = '매일';
      const start = normDate(r['시작일']);
      const end = normDate(r['종료일']);
      const ally = allyMap[r['연합아이디']] || null;
      const guide = guideMap[r['가이드아이디']] || null;
      const it = {
        id: r['아이디'] || `row${i + 2}`,
        ally, kind,
        camp: normCamp(r['투표종류']) || normCamp(r['내용'], true),
        ...splitQty(r['내용'] || r['할일'] || '(내용 없음)'),
        platform: r['플랫폼'] || (guide ? guide.platform : ''),
        guide, repeat, days, start, end,
        tbd: !start && !end,
        window: r['시간대'],
        deadline: normTime(r['마감시간']),
        tags: tagsOf(r['해시태그']),
        link: linkUrl(r['링크'] || r['투표링크']),
        proof: r['인증방법'],
        // "구글폼:추후" 처럼 적으면 링크가 공지될 때까지 누를 수 없는 버튼으로 보여요
        proofLinks: String(r['인증링크'] || '').split(/\s+/).map((t) => (/^(구글폼|카톡):추후$/.test(t) ? t : linkUrl(t))).filter(Boolean).map((u) => (/:추후$/.test(u) ? { url: '', off: true, label: u.split(':')[0] + ' 인증' } : {
          url: u,
          label: /docs\.google\.com\/forms|forms\.gle/.test(u) ? '구글폼 인증' : /kakao/.test(u) ? '카톡 인증' : /x\.com|twitter\.com/.test(u) ? 'X 인증' : '인증하러 가기',
        })),
        memo: r['메모'],
      };
      if (ally) ally.items.push(it);
      return it;
    });

    alliances.forEach((a) => {
      const starts = a.items.map((x) => x.start).filter(Boolean).sort();
      const ends = a.items.map((x) => x.end || x.start).filter(Boolean).sort();
      a.start = starts[0] || '';
      a.end = ends[ends.length - 1] || '';
    });
    // 같은 상에서 여러 연합 '줄 것'이 같은 구글폼을 쓰면 버튼에 "한 번에" 표시
    const formShare = {};
    items.forEach((it) => {
      if (it.kind !== 'give' || !it.ally) return;
      it.proofLinks.forEach((p) => {
        if (p.off || !/docs\.google\.com\/forms|forms\.gle/.test(p.url)) return;
        (formShare[`${it.camp}|${p.url}`] ||= []).push({ it, p });
      });
    });
    Object.values(formShare).forEach((list) => {
      const names = [...new Set(list.map((x) => x.it.ally.artist))];
      if (names.length > 1) list.forEach((x) => { x.p.label = `구글폼 인증 · ${names.join('+')} 한 번에`; });
    });
    // 음방 출연·사전투표 (sheet-templates/음방.csv)
    //   구분: 출연 / 1위후보 / 실시간투표 → 방송일 / 사전투표 → 시작·종료 ("2026-11-04 23:59")
    //   할 일이 되는 건 음총팀이 하라고 한 사전투표 · 실시간투표만 (출연 · 1위후보는 알림용)
    const music = (raw.music ? toObjects(raw.music) : []).map((r, i) => {
      const dt = (v) => { const m = String(v || '').match(/(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?/); return m ? { date: m[1], time: m[2] ? m[2].padStart(5, '0') : '' } : null; };
      return {
        id: r['아이디'] || `M${i + 1}`,
        show: String(r['음방'] || '').trim(),
        kind: /사전/.test(r['구분'] || '') ? 'pre' : /실시간/.test(r['구분'] || '') ? 'vote' : /1위|후보/.test(r['구분'] || '') ? 'top' : 'live',
        date: normDate(r['방송일']),
        start: dt(r['시작']), end: dt(r['종료']),
        memo: r['메모'] || '', src: linkUrl(r['출처']),
      };
    });
    return { alliances, items, guides, music };
  }

  // ---------- 기간 계산 ----------
  function itemOn(it, d) {
    if (it.tbd) return false;
    if (it.repeat === '1회') return d === (it.start || it.end);
    if (it.start && d < it.start) return false;
    if (it.end && d > it.end) return false;
    if (it.repeat === '요일') return it.days.includes(dowOf(d));
    return true;
  }
  function itemStatus(it, d) {
    if (it.tbd) return 'tbd';
    const end = it.repeat === '1회' ? (it.start || it.end) : it.end;
    if (it.start && d < it.start) return 'soon';
    if (end && d > end) return 'end';
    return 'live';
  }
  function allyStatus(a, d) {
    const st = a.items.map((x) => itemStatus(x, d));
    if (st.includes('live')) return 'live';
    if (st.includes('soon')) return 'soon';
    if (st.includes('tbd')) return 'tbd';
    return 'end';
  }
  function periodText(it) {
    if (it.tbd) return '기간 추후 협의';
    if (it.repeat === '1회') return mdw(it.start || it.end);
    if (it.repeat === '기간1회' && it.start && it.end) return `${md(it.start)} ~ ${md(it.end)} 중 한 번`;
    if (it.start && it.end) return `${md(it.start)} ~ ${md(it.end)}`;
    if (it.end) return `~ ${md(it.end)}`;
    return `${md(it.start)} ~`;
  }
  const todosFor = (d) => state.data.items.filter((x) => x.kind !== 'get' && itemOn(x, d)).concat(musicTodos(d));
  const getsFor = (d) => state.data.items.filter((x) => x.kind === 'get' && itemOn(x, d));

  // ---------- 체크 상태 (각자 브라우저에 저장) ----------
  const ckey = (date) => 'rs-check:' + date;
  const CHECK_DAYS = 60; // 체크 기록은 60일만 남겨요 (오늘 탭도 지난날은 60일 전까지만 넘겨 봐요)
  // '기간 중 1회' 할 일은 날짜와 상관없이 한 번 체크하면 기간 내내 체크된 채로 있어요
  const ONCE_KEY = 'rs-check-once';
  const readSet = (k) => { try { return new Set(JSON.parse(localStorage.getItem(k) || '[]')); } catch (e) { return new Set(); } };
  const isOnce = (id) => !!(state.data && state.data.items.some((x) => x.id === id && x.repeat === '기간1회'));
  function getChecks(date) {
    const s = readSet(ckey(date));
    readSet(ONCE_KEY).forEach((id) => s.add(id));
    return s;
  }
  function toggleCheck(date, id) {
    const k = isOnce(id) ? ONCE_KEY : ckey(date);
    const s = readSet(k);
    s.has(id) ? s.delete(id) : s.add(id);
    try { localStorage.setItem(k, JSON.stringify([...s])); } catch (e) { /* 저장 불가 환경 */ }
  }
  // 오늘 할 일을 다 끝낸 날 (연속 완료에 써요). 나중에 자료가 바뀌어도 그날 기록은 그대로 남아요
  const DONE_KEY = 'rs-done-days';
  function markDone(date, done) {
    const s = readSet(DONE_KEY);
    if (done === s.has(date)) return false;
    if (done) s.add(date); else s.delete(date);
    try { localStorage.setItem(DONE_KEY, JSON.stringify([...s].sort().slice(-400))); } catch (e) { /* 저장 불가 환경 */ }
    return true;
  }
  // 처음 한 번: 이 기능 전에 체크해 둔 기록으로 다 끝낸 날을 채워요
  function backfillDone() {
    try {
      if (localStorage.getItem(DONE_KEY) !== null) return;
      const days = Object.keys(localStorage).filter((k) => k.startsWith('rs-check:')).map((k) => k.slice(9)).filter((d) => d < today());
      const done = days.filter((d) => { const list = todosFor(d); const c = getChecks(d); return list.length && list.every((x) => c.has(x.id)); });
      localStorage.setItem(DONE_KEY, JSON.stringify(done.sort()));
    } catch (e) { /* 무시 */ }
  }
  // 연속 완료 일수: 오늘(아직 안 끝냈으면 어제)부터 거꾸로 세요. 할 일이 없던 날은 건너뛰어요 (최대 7일)
  function doneStreak(date) {
    const s = readSet(DONE_KEY);
    let n = 0, gap = 0;
    let d = s.has(date) ? date : addDays(date, -1);
    for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
      if (s.has(d)) { n++; gap = 0; }
      else if (gap < 7 && !todosFor(d).length) gap++;
      else break;
    }
    return n;
  }
  function cleanOldChecks() {
    try {
      const limit = addDays(today(), -CHECK_DAYS);
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('rs-check:') && k.slice(9) < limit) localStorage.removeItem(k);
      });
    } catch (e) { /* 무시 */ }
  }

  // ---------- 데이터 불러오기 ----------
  function sheetUrl(tab) {
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(CFG.SHEET_ID)}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;
  }
  async function fetchTab(tab, mustHave) {
    const res = await fetch(sheetUrl(tab), { cache: 'no-store' });
    if (!res.ok) throw new Error(`${tab} 탭 (${res.status})`);
    const text = await res.text();
    if (/^\s*</.test(text)) throw new Error(`${tab} 탭 (공유 설정 확인)`);
    // 탭 이름이 틀리면 구글이 첫 번째 탭을 대신 보내므로 머리글로 확인
    const head = text.split(/\r?\n/)[0].replace(/\s/g, '');
    if (!head.includes(mustHave)) throw new Error(`"${tab}" 탭이 새 양식이 아니에요 (머리글 "${mustHave}" 없음)`);
    return text;
  }
  // ---------- 오류 알림 ----------
  // 오류는 숨기지 않고 (1) 화면 위 알림 (2) 콘솔 (3) window.__rsErrors 에 남겨요. tools/check_site.mjs가 이걸 읽어요.
  window.__rsErrors = window.__rsErrors || [];
  function reportError(where, err) {
    const msg = (err && (err.stack || err.message)) || String(err);
    window.__rsErrors.push({ where, msg, at: new Date().toISOString() });
    console.error(`[리센느 할일] ${where}:`, err);
    const n = document.getElementById('notice');
    if (n && n.hidden) { n.innerHTML = '화면 일부를 그리다 문제가 생겼어요. 새로고침해도 그대로면 알려 주세요.'; n.hidden = false; }
  }
  window.addEventListener('error', (e) => reportError('스크립트', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => reportError('불러오기', e.reason));
  // 화면 조각 하나가 깨져도 나머지는 보이게
  function safe(where, fn, fallback) {
    try { return fn(); } catch (err) { reportError(where, err); return fallback === undefined ? `<div class="card empty" role="alert">이 부분을 보여 주지 못했어요 (${esc(where)})</div>` : fallback; }
  }
  function showNotice(msg) {
    if (msg) { $notice.innerHTML = msg; $notice.hidden = false; } else { $notice.hidden = true; }
  }

  async function load() {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spin');
    // 시트를 안 쓰면 사이트 정리본을 바로 보여줌 (기다림 없음)
    if (!CFG.SHEET_ID) {
      state.data = buildModel(window.SAMPLE_DATA);
      state.source = 'bundled';
      state.loadedAt = Date.now();
      state.sourceNote = '';
      btn.classList.remove('spin');
      showNotice('');
      render({ keepScroll: true });
      return;
    }
    try {
      const T = CFG.TABS || {};
      const [alliances, tasks, guides] = await Promise.all([
        fetchTab(T.alliances || '연합', '상대총공계정'), fetchTab(T.tasks || '할일', '구분'), fetchTab(T.guides || '가이드', '플랫폼'),
      ]);
      // 음방 출연·사전투표는 사이트 정리본(음방.csv)에서
      const raw = { alliances, tasks, guides, music: (window.SAMPLE_DATA || {}).music || '' };
      state.data = buildModel(raw);
      state.source = 'sheet';
      state.loadedAt = Date.now();
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ raw, at: state.loadedAt })); } catch (e) { /* 무시 */ }
      state.sourceNote = '';
    } catch (err) {
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { /* 무시 */ }
      if (cached) {
        state.data = buildModel(cached.raw);
        state.source = 'cache';
        state.loadedAt = cached.at;
      } else {
        state.data = buildModel(window.SAMPLE_DATA);
        state.source = 'bundled';
        state.loadedAt = Date.now();
      }
      state.sourceNote = err.message;
    } finally {
      btn.classList.remove('spin');
    }
    showNotice('');
    render({ keepScroll: true });
  }
  // [src/10-ui.js] 화면 조각: 할 일 줄·받을 것 줄·창(모달)·웹앱 설치·묶음 목록·정보 업데이트 시각
  // ---------- 화면 조각 ----------
  const kindPill = (it) => `<span class="kind ${it.kind}">${KIND[it.kind].label}</span>`;
  const tagsHtml = (tags) => tags.length
    ? `<div class="hashtags">${tags.map((t) => `<button type="button" class="hashtag" data-copy="${esc(t)}" aria-label="${esc(t)} 복사">${esc(t)}</button>`).join('')}</div>`
    : '';

  function metaChips(it, date, done) {
    const parts = [];
    if (it.platform) parts.push(`<span>${esc(it.platform)}</span>`);
    if (it.window) parts.push(`<span>${esc(it.window)}</span>`);
    parts.push(`<span class="num">${periodText(it)}${it.end && it.repeat !== '1회' && date <= it.end ? ` · ${dday(date, it.end)}` : ''}</span>`);
    return `<div class="chips-row"><p class="meta">${parts.join('<i class="sep">·</i>')}</p></div>`;
  }

  const chevron = '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 6.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // 받침 있으면 '이', 없으면 '가'
  const josaIGA = (w) => { const c = String(w || '').trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? '이' : '가'; };
  const whoName = (it) => (it.ally ? it.ally.artist : '리센느');
  // 할 일 줄 아래 글씨: 상 이름 (제목에 누구인지 없으면 앞에 붙여요)
  const rowSub = (it, oneCamp) => [String(it.title || '').includes(whoName(it)) ? '' : whoName(it), oneCamp ? '' : it.camp].filter(Boolean).map(esc).join('<i class="sep">·</i>');
  // 상 이름 라벨이 바로 옆에 있을 때 제목 앞의 상 이름은 빼요
  const stripCamp = (it) => { const c = it.camp, t = String(it.title || ''); return c && t.startsWith(c) && t.length > c.length ? t.slice(c.length).replace(/^\s*[·:]?\s*/, '') : t; };
  // 제목에서 누가 · 무슨 상인지(이미 따로 보이는 것)와 '투표'를 뺀 나머지. 받을 것의 '리센느 투표'처럼 뻔한 말은 빈 값
  function bareTitle(it) {
    let t = String(it.title || '').trim();
    const ps = [it.camp, it.ally && it.ally.artist, '리센느'];
    for (let k = 0; k < 2; k++) ps.forEach((p) => { if (p && t.startsWith(p)) t = t.slice(p.length).replace(/^\s*[·:]?\s*/, ''); });
    t = t.replace(/^투표\s*/, '').replace(/\s*투표$/, '').trim();
    const m = t.match(/^\((.+)\)$/);
    if (m) t = /협의|미정|예정/.test(m[1]) ? m[1] : `${m[1]} 부문`;
    return t;
  }
  // 받을 것 줄 제목: 누가 해 주는지 ("앤더블 팬 앤클로")
  const giverName = (it) => (it.ally && it.ally.fandom ? `${it.ally.artist} 팬 ${it.ally.fandom}` : whoName(it));
  // 메모에서 이미 지난 'M.D(요일) HH:MM 오픈'은 빼요
  function memoText(it, date) {
    const d0 = date || today();
    return String(it.memo || '').split(/\s+·\s+/).filter((x) => {
      const m = x.trim().match(/^(\d{1,2})\.(\d{1,2})\s*\([^)]*\)\s*\d{1,2}:\d{2}\s*오픈$/);
      if (!m) return true;
      return `${d0.slice(0, 4)}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` >= d0;
    }).join(' · ');
  }
  // 목록 오른쪽: 오늘 할 양(하루 3표 등). 3일 안에 끝나면 'n일 남음', 시작·마지막 날은 따로 표시
  function rowEnd(it, date) {
    let flag = '';
    if (it.repeat === '1회') flag = it.start === date ? '<i class="flag hot">오늘</i>' : '';
    else if (it.start === date) flag = '<i class="flag new">오늘 시작</i>';
    else if (it.end) {
      const n = diffDays(date, it.end);
      if (n === 0) flag = '<i class="flag hot">오늘 끝</i>';
      else if (n > 0 && n <= 3) flag = `<i class="flag hot">${n}일 남음</i>`;
    }
    if (!it.qty && !flag) return '';
    return `<span class="row-end">${it.qty ? `<b>${esc(it.qty)}</b>` : ''}${flag}</span>`;
  }
  // 상세(펼쳤을 때): 기간·메모·해시태그·버튼·인증
  function rowMore(it, date, done, withProof) {
    const actions = [
      it.link ? `<a class="btn primary" href="${esc(it.link)}"${it.appKey ? appTarget(it.appKey) : ' target="_blank"'} rel="noopener"${it.appKey ? ` data-app="${it.appKey}"` : ''}>${it.appKey ? `${esc(APPS[it.appKey].name)} 앱에서 투표` : '하러 가기 ↗'}</a>` : '',
      it.sms ? `<a class="btn sms" href="sms:${encodeURIComponent(it.sms.to)}?&body=${encodeURIComponent(it.sms.body)}">문자 투표 ${esc(it.sms.to)}</a>` : '',
    ].join('');
    return `
      <div class="row-more">
        ${metaChips(it, date, done)}
        ${memoText(it, date) ? `<p class="task-memo">${esc(memoText(it, date))}</p>` : ''}
        ${tagsHtml(it.tags)}
        ${actions ? `<div class="task-actions">${actions}</div>` : ''}
        ${withProof ? proofBlock(it) : ''}
      </div>`;
  }
  // oneCamp: 이 묶음이 상 하나뿐이라 묶음 제목에 상 이름이 이미 있을 때 → 줄에서는 상 이름을 안 써요
  function todoRow(it, date, checks, oneCamp) {
    const done = checks.has(it.id);
    const open = state.open.has(it.id);
    const later = date > today(); // 앞날 미리 보기: 체크는 그날부터
    const rid = 'm-' + it.id.replace(/[^\w-]/g, '');
    return `
      <li class="row ${done ? 'done' : ''} ${open ? 'open' : ''}" style="--cc:${campColor(it.camp || '')}">
        <div class="row-main">
          <button class="check" type="button" data-check="${esc(it.id)}" data-date="${date}" aria-pressed="${done}" aria-label="${esc(it.title)} ${later ? '· 그날부터 체크할 수 있어요' : '완료 표시'}"${later ? ' disabled' : ''}>
            <svg viewBox="0 0 24 24"><path d="M5 12.5l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="row-head" type="button" data-open="${esc(it.id)}" aria-expanded="${open}" aria-controls="${rid}">
            <span class="row-text">
              <span class="row-title">${esc(it.title)}</span>
              <span class="row-sub">${it.music ? `${esc(it.platform)}<i class="sep">·</i>${esc(it.window)}` : rowSub(it, oneCamp)}</span>
            </span>
            ${rowEnd(it, date)}
            ${chevron}
          </button>
        </div>
        ${open ? `<div id="${rid}">${rowMore(it, date, done, true)}</div>` : ''}
      </li>`;
  }

  // 인증 칸: 인증 방법 + X·구글폼·카톡 버튼 (X는 해시태그만 자동 입력)
  function proofBlock(it) {
    // 인증방법 칸이 비어 있으면 인증 칸을 안 보여요 (예: 뮤직웨이브만 하면 되는 연합)
    // 인증링크 칸에 X 글 주소가 있으면 그 글에 댓글로 인증 (답글 창이 해시태그와 함께 열려요)
    const reply = it.proofLinks.map((p) => (p.url.match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/) || [])[1]).find(Boolean);
    const tweet = it.tags.length && (it.proof || it.proofLinks.length)
      ? `https://x.com/intent/post?${reply ? `in_reply_to=${reply}&` : ''}text=${encodeURIComponent(it.tags.join('\n'))}`
      : '';
    if (!it.proof && !it.proofLinks.length && !tweet) return '';
    const alt = it.proofLinks.filter((p) => !(reply && tweet && p.url.includes(reply)));
    const btns = [
      tweet ? `<a class="btn small proof tw" href="${esc(tweet)}" target="_blank" rel="noopener">${reply ? 'X 댓글로 인증' : 'X 인증'} ↗</a>` : '',
      it.tags.length && tweet ? `<button type="button" class="btn small" data-copy="${esc(it.tags.join('\n'))}" data-copy-label="태그">태그 복사</button>` : '',
    ].join('');
    return `
      <div class="proof-block">
        <p><b>인증</b> ${esc(it.proof || '완료 화면을 날짜가 보이게 캡처')}</p>
        ${btns ? `<div class="proof-actions">${btns}</div>` : ''}
        ${alt.length ? `
          <p class="proof-alt">${tweet ? '서치밴이거나 X 작성이 어려우면 (둘 중 하나):' : '인증하기:'}</p>
          <div class="proof-actions">${alt.map((p) => p.off ? `<button type="button" class="btn small proof" disabled>${p.label} (추후 공지)</button>` : `<a class="btn small proof" href="${esc(p.url)}" target="_blank" rel="noopener">${p.label} ↗</a>`).join('')}</div>` : ''}
      </div>`;
  }

  // X 서치밴 안내 (참고: 서치밴이면 해시태그가 검색에 안 떠서 집계에서 빠질 수 있음)
  const SHADOWBAN_URL = 'https://x-shadowban-checker.fia-s.com/en/';
  const SHADOWBAN_RADAR = 'https://shadowbanradar.com/';
  const SHADOWBAN_BODY = `
    <p>서치밴(검색 제한)에 걸리면 해시태그가 검색에 안 떠서 집계에서 빠질 수 있어요. 트윗 올리기 전에 확인해 보세요. 결과는 참고용이에요.</p>
    <h3 class="sban-h">1. 검사 사이트에서 확인</h3>
    <div class="proof-actions">
      <a class="btn" href="${SHADOWBAN_URL}" target="_blank" rel="noopener">Shadowban Checker F ↗</a>
      <a class="btn" href="${SHADOWBAN_RADAR}" target="_blank" rel="noopener">Shadowban Radar ↗</a>
    </div>
    <h3 class="sban-h">2. 내 게시물이 검색에 뜨는지 직접 확인</h3>
    <form class="handle-row" id="handleForm" novalidate>
      <label class="handle-field"><span aria-hidden="true">@</span><input id="xHandle" type="text" maxlength="15" placeholder="X 계정 아이디" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="X 계정 아이디" aria-describedby="handleHelp"></label>
      <button type="submit" class="btn primary">게시물 검색 ↗</button>
    </form>
    <p class="handle-help" id="handleHelp">영문·숫자·밑줄(_)만, 15자까지. 최신 탭에 내 트윗이 안 보이면 서치밴일 수 있어요.</p>
    <h3 class="sban-h">결과에 따라</h3>
    <ul>
      <li><b>서치밴 정상</b> → X 인증으로 진행 (권장)</li>
      <li><b>서치밴 확인됨</b> → 구글폼 또는 음원총공팀 카톡으로 인증</li>
    </ul>
    <p class="muted">서치밴이 아닌데 X 게시가 어렵다면, 구글폼·카톡으로 인증한 뒤 #2026MAMAVOTE #RESCENE 태그 게시물을 리트윗(RT)해 주세요.</p>`;

  // 맨 위 '도구' 줄: 인증할 때 쓰는 것들
  const IC = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
    mark: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M7 15l3.2-3.6 2.6 2.6L15 11.5l2 3.5"/><path d="M8 8.5h.01"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M12 8.5v6M9 11.5h6"/></svg>',
    wave: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9c2-2.4 4-2.4 6 0s4 2.4 6 0 4-2.4 6 0M3 15c2-2.4 4-2.4 6 0s4 2.4 6 0 4-2.4 6 0"/></svg>',
  };
  // 홈 화면 웹앱으로 열면 '앱처럼 쓰기'는 빼고 나머지 두 칸이 넓게 채워요
  const toolsBar = (title) => {
    const app = isStandalone();
    return `
    ${title ? `<h2 class="section-title">${title}</h2>` : ''}
    <div class="tool-tiles${app ? ' two' : ''}" role="group" aria-label="인증 도구">
      <button type="button" class="ttile" data-sban>${IC.search}<b>서치밴 확인</b><small>내 글이 보이나</small></button>
      <button type="button" class="ttile" data-wm>${IC.mark}<b>인증샷 워터마크</b><small>사진 도용 막기</small></button>
      ${app ? '' : `<button type="button" class="ttile" data-install>${IC.home}<b>앱처럼 쓰기</b><small>홈 화면에 추가</small></button>`}
    </div>`;
  };

  function openSban() {
    let m = document.getElementById('sban');
    if (!m) {
      m = document.createElement('div');
      m.id = 'sban'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'X 서치밴 확인'); m.tabIndex = -1;
      m.innerHTML = `
        <div class="modal-box">
          <div class="modal-head"><h2>X 서치밴 확인</h2><button type="button" class="icon-btn" data-modal-close aria-label="닫기">닫기</button></div>
          <div class="sban-body">${SHADOWBAN_BODY}</div>
        </div>`;
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-modal-close]')) hideModal(m); });
      // 내 게시물 검색: x.com 최신 탭에서 from:아이디
      const inp = m.querySelector('#xHandle');
      const help = m.querySelector('#handleHelp');
      try { inp.value = localStorage.getItem('rs-x-handle') || ''; } catch (e) { /* 무시 */ }
      m.querySelector('#handleForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const h = inp.value.trim().replace(/^@/, '');
        if (!/^\w{1,15}$/.test(h)) { help.classList.add('err'); inp.focus(); return; }
        help.classList.remove('err');
        try { localStorage.setItem('rs-x-handle', h); } catch (err) { /* 무시 */ }
        window.open(`https://x.com/search?q=${encodeURIComponent('from:' + h)}&f=live`, '_blank', 'noopener');
      });
    }
    showModal(m);
  }

  // ---------- 창(모달) 공통: 초점 이동·가두기·되돌리기 ----------
  let modalReturn = null;
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function showModal(m) {
    modalReturn = document.activeElement;
    m.classList.toggle('show', true);
    const first = m.querySelector('.modal-box ' + FOCUSABLE);
    if (first) first.focus();
  }
  function hideModal(m) {
    if (!m.classList.contains('show')) return;
    m.classList.toggle('show', false);
    if (modalReturn && document.contains(modalReturn)) modalReturn.focus();
    modalReturn = null;
  }
  document.addEventListener('keydown', (e) => {
    const m = document.querySelector('.modal.show');
    if (!m) return;
    if (e.key === 'Escape') { hideModal(m); return; }
    if (e.key !== 'Tab') return;
    const f = [...m.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // 다시 그린 뒤 같은 버튼에 초점
  function focusAfter(sel) {
    if (!document.activeElement || document.activeElement === document.body) {
      const el = document.querySelector(sel);
      if (el) el.focus({ preventScroll: true });
    }
  }
  // 탭: 화살표 키로 옆 탭으로
  document.addEventListener('keydown', (e) => {
    const tab = e.target.closest && e.target.closest('[role="tab"]');
    if (!tab || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    const tabs = [...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
    const next = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    e.preventDefault();
    next.click();
    const sel = next.dataset.kindtab ? `[data-kindtab="${next.dataset.kindtab}"]` : `[data-view="${next.dataset.view}"]`;
    const again = document.querySelector(sel);
    if (again) again.focus();
  });

  // ---------- 웹앱 설치 (홈 화면에 추가) ----------
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  function openInstall() {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.finally(() => { installPrompt = null; });
      return;
    }
    let m = document.getElementById('install');
    if (!m) {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      m = document.createElement('div');
      m.id = 'install'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', '홈 화면에 추가');
      m.innerHTML = `
        <div class="modal-box">
          <div class="modal-head"><h2>홈 화면에 추가</h2><button type="button" class="icon-btn" data-modal-close aria-label="닫기">닫기</button></div>
          <div class="install-body">
            <img src="icons/icon-192.png" alt="" width="64" height="64">
            ${isStandalone() ? '<p>이미 앱으로 쓰고 있어요.</p>' : ios ? `
              <ol class="steps">
                <li>사파리 아래쪽 <b>공유</b> 버튼(네모에 화살표)을 눌러요</li>
                <li><b>홈 화면에 추가</b>를 골라요</li>
                <li>오른쪽 위 <b>추가</b>를 누르면 끝</li>
              </ol>` : `
              <ol class="steps">
                <li>크롬 오른쪽 위 <b>⋮ 메뉴</b>를 눌러요</li>
                <li><b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 골라요</li>
                <li><b>설치</b>를 누르면 끝</li>
              </ol>`}
            <p class="muted">홈 화면 아이콘으로 열면 주소창 없이 앱처럼 보이고, 인터넷이 잠깐 끊겨도 마지막 내용을 볼 수 있어요.</p>
            ${ios ? '<p class="muted">사파리에서 체크한 기록은 앱으로 저절로 넘어가지 않아요.</p><button type="button" class="btn small" data-xfer>체크 기록 옮기기</button>' : ''}
          </div>
        </div>`;
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-modal-close]')) hideModal(m); });
    }
    showModal(m);
  }

  function getRow(it, date, oneCamp) {
    const open = state.open.has(it.id);
    const rid = 'm-' + it.id.replace(/[^\w-]/g, '');
    const initial = it.ally ? [...it.ally.artist][0] : '리';
    return `
      <li class="row get ${open ? 'open' : ''}" style="--cc:${campColor(it.camp || '')}">
        <div class="row-main">
          <span class="avatar" aria-hidden="true">${esc(initial)}</span>
          <button class="row-head" type="button" data-open="${esc(it.id)}" aria-expanded="${open}" aria-controls="${rid}">
            <span class="row-text">
              <span class="row-title">${esc(giverName(it))}</span>
              <span class="row-sub">${[oneCamp ? '' : it.camp, bareTitle(it)].filter(Boolean).map(esc).join('<i class="sep">·</i>') || (oneCamp ? '' : esc(it.title))}</span>
            </span>
            ${rowEnd(it, date)}
            ${chevron}
          </button>
        </div>
        ${open ? `<div id="${rid}">${rowMore(it, date, false, false)}</div>` : ''}
      </li>`;
  }

  function sortTodos(list, checks) {
    // 완료 체크해도 자리는 그대로 (아래로 내리지 않음 — 사용자 요청)
    return list.sort((a, b) => {
      // 같은 투표끼리 붙여서 보이게
      return campOrder(a.camp) - campOrder(b.camp) || (a.camp || '').localeCompare(b.camp || '', 'ko') || (a.deadline ?? 9999) - (b.deadline ?? 9999) || (a.end || '9').localeCompare(b.end || '9') ||
        // 같은 상 안에서는 리센느(자체) 먼저, 나머지는 가나다순
        (a.kind === 'self' ? 0 : 1) - (b.kind === 'self' ? 0 : 1) || a.title.localeCompare(b.title, 'ko');
    });
  }

  // 음방 / MAMA / MMA / 기타 필터: 종류별 카드 (누르면 그 종류만, 할 일 완료 수 + 막대)
  function campStrip(allTodos, allGets, checks) {
    const all = [...allTodos, ...allGets];
    const shown = GROUPS.filter((g) => all.some((x) => campGroup(x.camp) === g.id));
    if (!shown.length) return '';
    const f = state.campFilter && shown.some((g) => g.id === state.campFilter) ? state.campFilter : '';
    const card = (id, name, color, todos, gets) => {
      const done = todos.filter((x) => checks.has(x.id)).length;
      const pct = todos.length ? Math.round((done / todos.length) * 100) : 0;
      return `<button type="button" class="ccard ${f === id ? 'on' : ''}" data-camp="${id}" style="--cc:${color}" aria-pressed="${f === id}">
          <b><i class="dot" style="--c:${color}"></i>${esc(name)}</b>
          <small class="num">${todos.length ? `${done}/${todos.length} 완료` : `받을 것 ${gets.length}`}</small>
          <span class="cbar" aria-hidden="true"><i style="width:${pct}%"></i></span>
        </button>`;
    };
    return `
      <div class="cat-grid" role="group" aria-label="종류별로 모아보기">
        ${card('', '전체', 'var(--accent)', allTodos, allGets)}
        ${shown.map((g) => card(g.id, g.id, g.color, allTodos.filter((x) => campGroup(x.camp) === g.id), allGets.filter((x) => campGroup(x.camp) === g.id))).join('')}
      </div>`;
  }

  // 묶음(MAMA/MMA/기타)마다 카드 하나에 줄을 모음. 묶음 안의 상이 하나뿐이면 제목을 그 상 이름으로 (줄마다 반복하지 않게)
  function groupedList(list, rowFn, countFn) {
    return GROUPS.map((g) => {
      const rows = list.filter((x) => campGroup(x.camp) === g.id);
      if (!rows.length) return '';
      const camps = new Set(rows.map((x) => x.camp || ''));
      const one = camps.size === 1 && rows[0].camp ? rows[0].camp : '';
      return `
        <section class="group">
          <h3 class="group-head"><span class="gname" style="--cc:${g.color}">${esc(one || g.id)}</span><span class="gcount num">${countFn(rows)}</span></h3>
          <ul class="rows">${rows.map((x) => rowFn(x, !!one)).join('')}</ul>
        </section>`;
    }).join('');
  }

  function dayDetail(date) {
    const checks = getChecks(date);
    const allTodos = sortTodos(todosFor(date), checks);
    const allGets = getsFor(date).sort((a, b) => campOrder(a.camp) - campOrder(b.camp) || (a.camp || '').localeCompare(b.camp || '', 'ko') || (a.end || '9').localeCompare(b.end || '9') || giverName(a).localeCompare(giverName(b), 'ko'));
    const strip = campStrip(allTodos, allGets, checks);
    const f = state.campFilter && [...allTodos, ...allGets].some((x) => campGroup(x.camp) === state.campFilter) ? state.campFilter : '';
    const todos = f ? allTodos.filter((x) => campGroup(x.camp) === f) : allTodos;
    const gets = f ? allGets.filter((x) => campGroup(x.camp) === f) : allGets;
    const done = todos.filter((x) => checks.has(x.id)).length;
    // 오늘 탭이 칸을 나눠 놓을 수 있게 조각으로 돌려줘요: 종류 카드 · 할 일 · 받을 것(접힘)
    return {
      todos: allTodos, gets: allGets, done: allTodos.filter((x) => checks.has(x.id)).length,
      strip,
      give: `
          <section class="day-col give" aria-label="할 일">
            <h2 class="col-title">할 일 <span class="num">${todos.length ? `${done}/${todos.length} 완료` : '0'}</span></h2>
            ${todos.length ? groupedList(todos, (x, one) => todoRow(x, date, checks, one), (rows) => `${rows.filter((x) => checks.has(x.id)).length}/${rows.length}`) : '<div class="card empty">이 날 할 일은 없어요</div>'}
          </section>`,
      get: !gets.length ? '' : `
          <section class="day-col get${state.getsOpen ? ' open' : ''}" aria-label="받을 것">
            <button type="button" class="get-fold" data-getfold aria-expanded="${!!state.getsOpen}" aria-controls="get-list">
              <span class="gf-title">받을 것 <i class="seg-n">${gets.length}</i></span>
              <span class="gf-sum">${GROUPS.map((g) => [g, gets.filter((x) => campGroup(x.camp) === g.id).length]).filter(([, n]) => n).map(([g, n]) => `<span><i class="dot" style="--c:${g.color}"></i>${esc(g.id)} <b class="num">${n}</b></span>`).join('')}</span>
              ${chevron}
            </button>
            <div id="get-list"${state.getsOpen ? '' : ' hidden'}>${groupedList(gets, (x, one) => getRow(x, date, one), (rows) => `${rows.length}`)}</div>
          </section>`,
    };
  }

  // 정보 기준 시각: 연합 자료·blip·Mnet Plus·기타 일정 중 가장 최근에 내용이 바뀐 때
  // (각 자료는 내용이 바뀐 때만 시각을 새로 적어요: build_data.py, crawl_blip.py, crawl_weekly.py)
  const kstStamp = (v) => {
    if (!v) return '';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T00:00';
    const t = new Date(s.length === 16 ? s + ':00+09:00' : s);
    if (isNaN(t)) return '';
    return t.toLocaleString('sv-SE', { timeZone: TZ, hour12: false }).slice(0, 16).replace(' ', 'T');
  };
  function updatedAt() {
    if (state.source === 'sheet') return kstStamp(new Date(state.loadedAt).toISOString());
    if (typeof blipLoad === 'function' && !state.blip) blipLoad();
    const list = [window.DATA_UPDATED, state.blip && state.blip.updated, state.blip && state.blip.mnetUpdated, state.weekly && state.weekly.updated];
    return list.map(kstStamp).filter(Boolean).sort().pop() || '';
  }
  const updatedDate = () => updatedAt().slice(0, 10);
  const updLabel = () => {
    const at = updatedAt();
    if (!at) return '';
    const hm = at.slice(11, 16);
    const d = at.slice(0, 10);
    return d === today() ? `오늘 ${hm !== '00:00' ? hm : ''}`.trim() : md(d);
  };
  const updatedTag = () => (updatedAt() ? `<span class="upd">정보 ${updLabel()} 업데이트</span>` : '');
  function sourceLine() {
    const t = new Date(state.loadedAt).toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    const src = state.source === 'sheet' ? `시트 반영 ${t}`
      : state.source === 'cache' ? `마지막 시트 저장본 (${t})`
      : (updatedAt() ? `정보 업데이트 ${longLabel(updatedDate())}${updatedAt().slice(11, 16) !== '00:00' ? ' ' + updatedAt().slice(11, 16) : ''}` : '사이트 정리본 기준');
    return `<p class="updated">${src} · 날짜는 한국 시간 기준</p>
      <p class="disclaimer">이 사이트는 리센느(RESCENE)를 응원하는 팬이 자발적으로 만든 비영리 정리 도구예요.<br>리센느 음원총공팀 및 소속사와 공식적인 관련이 없어요. 공식 지침은 음원총공팀 공지를 확인해 주세요.</p>`;
  }
  // [src/20-today.js] 오늘 탭
  // ---------- 오늘 ----------
  // 멜론 뮤직웨이브: 왼쪽 음총팀 · 오른쪽 공식. seq · ctype 는 짧은 링크가 가는 into.melon.com 연결 페이지에서 찾은 값
  const WAVES = [
    { name: '음총팀', href: 'https://kko.to/M8xTJNH0pX', seq: '67634585', ctype: 'user' },
    { name: '공식', href: 'https://kko.to/gRdgJvFZpv', seq: '3709231', ctype: 'artistrep' },
  ];
  const waveLinks = () => `
        <div class="wave-links" role="group" aria-label="멜론 뮤직웨이브">
          ${WAVES.map((w) => `<a class="wave" href="${w.href}" target="_blank" rel="noopener" data-wave="musicwave/listen?seq=${w.seq}&amp;ctype=${w.ctype}&amp;menuid=1000003041">${IC.wave}<b>${w.name}</b><small>뮤직웨이브</small></a>`).join('')}
        </div>`;
  // 날짜 넘겨 보기: state.viewDate (비면 오늘). 지난날은 체크 기록이 남는 60일 전까지, 앞날은 끝없이
  const relDay = (n) => (n === 0 ? '오늘' : n === 1 ? '내일' : n === -1 ? '어제' : n > 0 ? `${n}일 뒤` : `${-n}일 전`);
  const ARROW = (dir) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  function dayNav(d, t) {
    const off = diffDays(t, d);
    return `<span class="day-nav" role="group" aria-label="날짜 넘겨 보기">
          <button type="button" class="day-btn" data-dnav="-1" aria-label="전날 할 일 보기"${off <= -CHECK_DAYS ? ' disabled' : ''}>${ARROW(-1)}</button>
          <span class="day-label" aria-live="polite">${longLabel(d)}<em class="day-rel${off ? ' away' : ''}">${relDay(off)}</em></span>
          <button type="button" class="day-btn" data-dnav="1" aria-label="다음 날 할 일 보기">${ARROW(1)}</button>
          ${off ? '<button type="button" class="day-today" data-dnav="0">오늘로</button>' : ''}
        </span>`;
  }
  function renderToday() {
    const t = today();
    if (state.viewDate && (state.viewDate === t || state.viewDate < addDays(t, -CHECK_DAYS))) state.viewDate = '';
    const d = state.viewDate || t;
    const isToday = d === t;
    const later = d > t;
    const det = dayDetail(d);
    const total = det.todos.length;
    const pct = total ? Math.round((det.done / total) * 100) : 0;
    // 다 끝낸 날 기록 + 방금 마지막 하나를 체크했으면 알려 주기
    const allDone = total > 0 && det.done === total;
    if (!state.doneFilled) { backfillDone(); state.doneFilled = true; }
    // 다 끝낸 날 기록은 오늘 · 지난날만 (앞날은 체크를 못 해요). 축하 · 연속 완료는 오늘만
    const changed = !later && markDone(d, allDone);
    const justDone = isToday && changed && allDone && state.checkedNow;
    state.checkedNow = false;
    const streak = isToday && allDone ? doneStreak(d) : 0;
    const tomorrow = isToday && allDone ? todosFor(addDays(d, 1)).length : 0;
    if (justDone) setTimeout(() => toast(`오늘 할 일 끝 · 연속 ${streak}일`), 120);
    // 다가오는 일정: 7일 안에 시작하거나 끝나는 것
    const upcoming = [];
    if (isToday) state.data.items.forEach((it) => {
      if (it.tbd || it.kind === 'get') return;
      if (it.start && it.start > d && diffDays(d, it.start) <= 7) upcoming.push({ it, date: it.start, what: '시작' });
      if (it.end && it.repeat !== '1회' && it.end >= d && diffDays(d, it.end) <= 3) upcoming.push({ it, date: it.end, what: '끝' });
    });
    upcoming.sort((a, b) => a.date.localeCompare(b.date) || (a.what === '끝' ? -1 : 1));
    // 오늘 가장 먼저 닫히는 것 한 줄
    const ending = det.todos
      .filter((x) => x.end && x.repeat !== '1회' && diffDays(d, x.end) <= 3)
      .sort((x, y) => x.end.localeCompare(y.end));
    const starting = state.data.items
      .filter((x) => x.kind !== 'get' && x.start && x.start > d && diffDays(d, x.start) <= 3)
      .sort((x, y) => x.start.localeCompare(y.start));
    const label = (x) => (x.music ? esc(x.title) : `${esc(whoName(x))} ${esc(x.camp || x.title)}`);
    const finding = !isToday ? '' : ending.length
      ? `<span class="find-k">곧 끝나요</span>${ending.slice(0, 2).map((x) => `<span class="find-i"><b class="num">${diffDays(d, x.end) === 0 ? '오늘' : diffDays(d, x.end) + '일 남음'}</b> ${label(x)}</span>`).join('')}`
      : starting.length
        ? `<span class="find-k">곧 시작해요</span>${starting.slice(0, 2).map((x) => `<span class="find-i"><b class="num">${mdw(x.start)}</b> ${label(x)}</span>`).join('')}`
        : '';
    // 배치 (B안): 휴대폰은 한 줄 = 요약 → 바로가기 → 오늘 일정 → 종류 → 할 일 → 받을 것 → 다가오는 일정
    //            컴퓨터(1100px~)는 요약 카드가 가로 전체, 그 아래 왼쪽 t-main(종류 · 할 일) / 오른쪽 t-side(바로가기 · 오늘 일정 · 받을 것 · 다가오는 일정)
    const evs = isToday ? `${schNextLine()}${musicLine()}` : '';
    return `
      <section class="hero${allDone ? ' is-done' : ''}${justDone ? ' just' : ''}">
        <p class="hero-date">${dayNav(d, t)}${isToday ? updatedTag() : ''}</p>
        <div class="hero-main">
        <h1 class="hero-title">${allDone ? `<span class="done-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span>${isToday ? '오늘 할 일을 모두 끝냈어요' : '이날 할 일을 모두 했어요'}`
          : !total ? (isToday ? '오늘은 할 일이 없어요' : later ? '이날은 아직 할 일이 없어요' : '이날은 할 일이 없었어요')
          : isToday ? `오늘 할 일 <b class="num">${total - det.done}</b>개 남았어요`
          : later ? `이날 할 일 <b class="num">${total}</b>개`
          : `이날 할 일 ${total}개 중 <b class="num">${det.done}</b>개 했어요`}</h1>
        ${total && !later ? `<span class="ring" style="--p:${pct}" role="img" aria-label="${total}개 중 ${det.done}개 완료"><b class="num">${det.done}/${total}</b></span>` : ''}
        </div>
        ${isToday ? '' : `<p class="day-note">${later ? '미리 보기예요. 체크는 그날부터 할 수 있어요. 일정은 공지에 따라 바뀔 수 있어요.' : '지난 기록이에요. 빠뜨린 체크는 지금 해도 돼요.'}</p>`}
        ${allDone ? `
        <div class="done-stats">
          <p><span>연속 완료</span><b class="num">${streak}일</b></p>
          <p><span>내일 할 일</span><b class="num">${tomorrow ? `${tomorrow}개` : '없음'}</b></p>
        </div>` : ''}
        ${finding ? `<p class="hero-find">${finding}</p>` : ''}
      </section>
      <div class="t-grid${det.gets.length || evs || upcoming.length ? '' : ' solo'}">
      <div class="t-main">
      ${det.strip}
      ${det.give}
      </div>
      <div class="t-side">
      <div class="t-quick">${isToday ? waveLinks() : ''}${toolsBar('')}</div>
      ${evs ? `<section class="t-ev" aria-label="오늘 일정"><h2 class="side-title">오늘 일정</h2>${evs}</section>` : ''}
      ${det.get}
      ${upcoming.length ? `<section class="t-up">
        <h2 class="section-title">다가오는 일정</h2>
        <div class="card list">
          ${upcoming.map(({ it, date, what }) => `
            <div class="list-row">
              <span class="list-date">${mdw(date)}</span>
              <span class="list-body"><b>${esc(it.ally ? it.ally.artist : '리센느')}</b> ${esc(it.camp || it.title)}${it.camp && bareTitle(it) ? `<small>${esc(bareTitle(it))}</small>` : ''}</span>
              <span class="status ${what === '시작' ? 'soon' : 'end'}">${what}</span>
            </div>`).join('')}
        </div></section>` : ''}
      </div>
      </div>
      <p class="xfer-link"><button type="button" class="link-btn" data-xfer>체크 기록 옮기기</button></p>
      ${sourceLine()}`;
  }
  // [src/30-calendar.js] 연합 일정 탭 (기간표)
  // ---------- 달력 ----------
  function monthBounds() {
    const first = state.calMonth + '-01';
    const next = iso(new Date(Date.UTC(+state.calMonth.slice(0, 4), +state.calMonth.slice(5, 7), 1)));
    return { first, last: addDays(next, -1) };
  }


  // 기간표: 한 줄에 하나 (왼쪽 이름 · 오른쪽 막대). 막대 색 = MAMA / MMA / 기타
  function timeline() {
    const t = today();
    const { first, last } = monthBounds();
    const N = diffDays(first, last) + 1;
    const frac = (d) => diffDays(first, d) / N;
    const at = (f) => `calc(var(--lab) + (100% - var(--lab) - var(--per)) * ${f.toFixed(4)})`;
    const inMonth = state.data.items.filter((it) => {
      if (it.tbd) return false;
      const s = it.start || '0000-01-01';
      const e = it.repeat === '1회' ? (it.start || it.end) : (it.end || '9999-12-31');
      return s <= last && e >= first;
    });
    const tbd = state.data.items.filter((it) => it.tbd);
    const groupColor = (it) => campColor(it.camp);
    const groupIdx = (it) => GROUPS.findIndex((g) => g.id === campGroup(it.camp));
    const tickDays = [1, 8, 15, 22, 29].filter((n) => n <= N);
    // '오늘' 이름표와 겹치는 날짜 글자는 숨김 (휴대폰은 칸이 좁아서 더 넓게: near-m)
    const tIdx = t >= first && t <= last ? diffDays(first, t) : -99;
    const nearCls = (n) => { const gap = Math.abs(n - 1 - tIdx); return gap < 3.5 ? ' class="near"' : gap < 5.5 ? ' class="near-m"' : ''; };
    const ticks = tickDays.map((n) => `<span style="left:${(((n - 1) / N) * 100).toFixed(3)}%"${nearCls(n)}>${n}<i class="tl-u">일</i></span>`).join('');
    const guides = tickDays.slice(1).map((n) => `<i class="tl-guide" style="left:${at((n - 1) / N)}"></i>`).join('');
    const todayLine = t >= first && t <= last ? `<i class="tl-today" style="left:${at((diffDays(first, t) + 0.5) / N)}" aria-hidden="true"><em>오늘</em></i>` : '';
    const row = (it) => {
      const s = it.start && it.start > first ? it.start : first;
      const eRaw = it.repeat === '1회' ? (it.start || it.end) : it.end;
      const e = eRaw && eRaw < last ? eRaw : last;
      const openL = !it.start || it.start < first;
      const openR = !eRaw || eRaw > last;
      const left = frac(s) * 100;
      const width = Math.max(((diffDays(s, e) + 1) / N) * 100, 2.5);
      const st = itemStatus(it, t);
      const per = (it.repeat === '기간1회' && it.start && it.end ? `${md(it.start)}~${md(it.end)}` : periodText(it)).replace(/\s/g, '');
      const sub = (it.camp || '').replace(/^MAMA\s*|^MMA\s*/i, '') || it.title;
      return `
        <div class="tl-row st-${st}" title="${esc(whoName(it))} · ${esc(it.camp || '')} · ${esc(it.title)} (${periodText(it)})">
          <div class="tl-label">
            <b>${esc(whoName(it))}</b>
            <span>${esc(sub)}<em class="tl-title"> · ${esc(it.title)}</em></span>
          </div>
          <div class="tl-lane">
            <i class="tl-bar ${openL ? 'open-l' : ''} ${openR ? 'open-r' : ''}" style="--g:${groupColor(it)};left:${left.toFixed(3)}%;width:${width.toFixed(3)}%"></i>
          </div>
          <span class="tl-per num">${per}</span>
        </div>`;
    };
    const isGive = (x) => x.kind !== 'get';
    const wantTab = (x) => (state.kindTab === 'give' ? isGive(x) : !isGive(x));
    const order = (a, b) => groupIdx(a) - groupIdx(b) || campOrder(a.camp) - campOrder(b.camp) || (a.start || '').localeCompare(b.start || '') || (a.end || '').localeCompare(b.end || '');
    const shown = inMonth.filter(wantTab).sort(order);
    const main = shown.filter((x) => x.kind !== 'self');
    const selfRows = shown.filter((x) => x.kind === 'self');
    const body = (list) => `<div class="tl-body">${guides}${todayLine}${list.map(row).join('')}</div>`;
    const tbdShown = tbd.filter(wantTab);
    const usedGroups = GROUPS.filter((g) => shown.some((x) => campGroup(x.camp) === g.id));
    return `
      <div class="cal-controls">${kindSeg(inMonth.filter(isGive).length, inMonth.filter((x) => !isGive(x)).length)}</div>
      <div class="card tl" id="kind-panel" role="tabpanel" aria-labelledby="tab-${state.kindTab}">
        <div class="tl-head">
          <p class="tl-count">${state.kindTab === 'give' ? '연합에 줄 것' : '받을 것'} <b class="num">${main.length}</b></p>
          <p class="tl-legend">${usedGroups.map((g) => `<span><i style="--g:${g.color}"></i>${g.id}</span>`).join('')}<span><i class="lg-soon" style="--g:var(--muted)"></i>시작 전</span><span><i class="lg-end" style="--g:var(--faint)"></i>끝남</span></p>
        </div>
        <div class="tl-scale"><span></span><div class="tl-ticks">${ticks}</div><span class="tl-per-h">기간</span></div>
        ${main.length ? body(main) : shown.length ? '' : '<div class="empty">이 달에는 일정이 없어요</div>'}
        ${selfRows.length ? `<h3 class="tl-sub">리센느 자체 <span class="num">${selfRows.length}</span></h3>${body(selfRows)}` : ''}
      </div>
      ${tbdShown.length ? `
        <h2 class="section-title"><span class="status tbd">협의중</span> 기간 미정</h2>
        <div class="card list">${tbdShown.map((it) => `<div class="list-row"><span class="list-body"><b>${esc(whoName(it))}</b> ${esc(it.title)}${it.memo ? `<small>${esc(it.memo)}</small>` : ''}</span></div>`).join('')}</div>` : ''}`;
  }

  function renderCalendar() {
    const t = today();
    if (!state.calMonth) state.calMonth = t.slice(0, 7);
    if (!state.calSel) state.calSel = t;
    const [y, m] = state.calMonth.split('-');
    return `
      <div class="cal-head">
        <h1>${y}년 ${+m}월</h1>
        <div class="cal-nav">
          <button class="btn small" type="button" data-month="-1" aria-label="이전 달">‹</button>
          <button class="btn small" type="button" data-month="0">오늘</button>
          <button class="btn small" type="button" data-month="1" aria-label="다음 달">›</button>
        </div>
      </div>
      ${timeline()}
      ${sourceLine()}`;
  }
  // [src/40-schedule.js] 리센느 일정 탭 (Mnet Plus · blip · 기타 일정)
  // ---------- 스케줄 (Mnet Plus 공식 일정표 + blip) ----------
  // Mnet Plus: artist.mnetplus.world 일정 데이터를 달마다 바로 불러옴 (마지막으로 받은 것은 휴대폰에 저장)
  // blip: 30분마다 GitHub Actions가 data/blip.json 으로 받아 둠 (tools/crawl_blip.py)
  // 구독용 캘린더 파일 data/rescene.ics 도 같은 작업이 만들어 둠
  const SCH_API = 'https://artist.mnetplus.world/svc/stg/rescene-official/space/api/v1/calendar';
  const SCH_PAGE = (ym) => `https://artist.mnetplus.world/main/stg/rescene-official/schedule/${ym.replace('-', '/')}`;
  const BLIP_PAGE = 'https://blip.kr/artists/RESCENE/schedule?unitId=133';
  const SCH_SRC = { mnetplus: 'Mnet Plus', blip: 'blip', etc: '기타' };
  // 일정 종류는 7가지로만 묶어요. 처음 보는 이름은 비슷한 묶음으로, 모르면 '기타'로 가요.
  const SCH_TYPES = {
    '음방': { label: '음악방송', color: '#1b7a4a' },
    '방송': { label: '방송', color: '#2563eb' },
    '공연': { label: '공연·행사', color: '#b8336a' },
    '이벤트': { label: '팬사인회·이벤트', color: '#0f766e' },
    '발매': { label: '발매·콘텐츠', color: '#7c2d5b' },
    '기념일': { label: '기념일', color: '#c2410c' },
    '기타': { label: '기타', color: '#6b7280' },
  };
  const SCH_ORDER = Object.keys(SCH_TYPES);
  const SCH_RULES = [
    ['음방', /음방|음악\s*방송|엠카|뮤직뱅크|뮤뱅|인기가요|음악중심|쇼챔|더\s*쇼/],
    ['기념일', /기념일|생일|데뷔/],
    ['이벤트', /팬사인|사인회|팬싸|영통|이벤트|팬미팅|팝업|럭키드로우|뮤직웨이브/],
    ['공연', /공연|콘서트|행사|시상식|페스티벌|축제|쇼케이스|투어/],
    ['발매', /발매|앨범|음원|굿즈|예약\s*판매|판매|콘텐츠|컨텐츠|티저|뮤비|mv/i],
    ['방송', /방송|예능|라디오|유튜브|mnet\+?|tv|라이브|웹\s*예능|출연/i],
  ];
  // 종류가 '기타'이거나 처음 보는 이름이면 제목을 보고 한 번 더 골라요 (🎬 영상 → 발매·콘텐츠)
  const SCH_TITLE = /🎬|behind|비하인드|브이로그|vlog|특별편|에피소드|ep\.?\s*\d|episode|레코딩|recording|댄스\s*프랙티스|practice|챌린지|challenge/i;
  const schKind = (name, title) => {
    const n = String(name || '').trim();
    if (SCH_TYPES[n] && n !== '기타') return n;
    const hit = SCH_RULES.find(([, re]) => re.test(n));
    if (hit) return hit[0];
    return SCH_TITLE.test(String(title || '')) ? '발매' : '기타';
  };
  const schType = (name, title) => SCH_TYPES[schKind(name, title)];
  state.sch = {};          // 'YYYY-MM' → { events, at, savedAt, error, loading }
  state.blip = null;       // { updated, events }
  state.schMonth = '';
  state.schSel = '';
  state.schType = '';
  state.schSrc = '';
  state.schQ = '';
  state.schPick = false;   // 연·월 고르기 열림
  state.schFind = false;   // 검색창 펼침 (돋보기 버튼)
  state.schPickYear = 0;
  state.schArg = '';
  state.schInit = false;   // 처음 열 때 오늘 고르기 (휴대폰)
  const cleanTitle = (t) => String(t || '')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/https?:\/\/\S+/g, '')          // 링크
    .replace(/(^|\s)#[^\s#]+/g, ' ')            // 해시태그
    .replace(/\[\s*\]|\(\s*\)|<\s*>/g, '')      // 빈 괄호
    .replace(/\s+/g, ' ').trim();
  const ymAdd = (ym, n) => iso(new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1))).slice(0, 7);
  const ymLast = (ym) => addDays(ymAdd(ym, 1) + '-01', -1);

  // --- Mnet Plus ---
  function schParams(ym) {
    const [y, m] = ym.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const pad = (n) => String(n).padStart(2, '0');
    const startUtc = new Date(Date.UTC(y, m - 1, 1, -9)).toISOString().replace('.000', '');
    const endUtc = new Date(Date.UTC(y, m - 1, lastDay, 23 - 9, 59, 59)).toISOString().replace('.000', '');
    return new URLSearchParams({ startAt: startUtc, startAtForAllDay: `${y}-${pad(m)}-01`, endAt: endUtc, endAtForAllDay: `${y}-${pad(m)}-${pad(lastDay)}` });
  }
  function schEvent(ev) {
    let date, time = '';
    if (ev.allDay) date = String(ev.startAtAllDay || '').slice(0, 10);
    else {
      const p = {};
      new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(ev.startAt)).forEach((x) => { p[x.type] = x.value; });
      date = `${p.year}-${p.month}-${p.day}`;
      time = `${p.hour}:${p.minute}`;
    }
    return { id: String(ev.id || ''), date, time, title: cleanTitle(ev.title), type: (ev.label && ev.label.name) || '' };
  }
  function schLoad(ym, force) {
    const cur = state.sch[ym];
    if (cur && (cur.loading || (!force && cur.at && Date.now() - cur.at < 10 * 60 * 1000))) return;
    if (!cur) {
      try {
        const saved = JSON.parse(localStorage.getItem('rs-sch-' + ym) || 'null');
        if (saved && Array.isArray(saved.events)) state.sch[ym] = { events: saved.events, at: 0, savedAt: saved.at };
      } catch (e) { /* 무시 */ }
    }
    const box = state.sch[ym] || (state.sch[ym] = { events: null });
    box.loading = true;
    fetch(`${SCH_API}?${schParams(ym)}`, { headers: { Accept: 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => {
        if (!d || !Array.isArray(d.events)) throw new Error('bad data');
        const events = d.events.map(schEvent).filter((e) => e.date && e.title);
        Object.assign(box, { events, at: Date.now(), savedAt: Date.now(), error: '' });
        try { localStorage.setItem('rs-sch-' + ym, JSON.stringify({ events, at: Date.now() })); } catch (e) { /* 무시 */ }
      })
      .catch(() => { box.error = 'fail'; box.at = Date.now(); })
      .finally(() => { box.loading = false; schRefresh(); });
  }
  // Mnet Plus에 바로 연결이 안 되면: 사이트가 30분마다 받아 둔 사본(data/blip.json의 mnet) → 없으면 이 폰에 저장된 마지막 것
  const schBackup = (ym) => (state.blip && state.blip.mnet && state.blip.mnet[ym]) || null;
  const schOf = (ym) => {
    const box = state.sch[ym];
    if (box && box.error && schBackup(ym)) return schBackup(ym);
    return (box && box.events) || [];
  };

  // --- blip ---
  // blip 일정 중 직접 바꿀 칸 (blip 아이디 → { link, end … }). 30분마다 blip.json이 새로 써져도 유지돼요.
  const BLIP_FIX = {
    '1124956': { link: 'https://x.com/photoism_kr/status/2108467500514259300', end: '2026-11-09' }, // 포토이즘 X 리센느 리브 (포토이즘 공지 기준)
  };
  function blipLoad() {
    if (state.blip) return;
    state.blip = { events: [], loading: true };
    fetch(BASE + 'data/blip.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => {
        const seen = new Set();
        const events = [];
        Object.values(d.months || {}).forEach((list) => list.forEach((e) => {
          if (!e || !e.date || !e.title || seen.has(e.id)) return;
          seen.add(e.id);
          events.push({ ...e, title: cleanTitle(e.title), end: e.end || e.date, src: 'blip', ...(BLIP_FIX[e.id] || {}) });
        }));
        const mnet = {};
        Object.entries(d.mnet || {}).forEach(([ym, list]) => { mnet[ym] = list.filter((e) => e && e.date && e.title).map((e) => ({ ...e, id: String(e.id || ''), title: cleanTitle(e.title) })); });
        state.blip = { updated: d.updated || '', mnetUpdated: d.mnet_updated || '', events, mnet };
      })
      .catch(() => { state.blip = { events: [], error: 'fail' }; })
      .finally(schRefresh);
  }

  // --- 기타: "리센느 주간 배급 일정표" (매일 밤 00시 data/weekly.json 으로 바뀜, tools/crawl_weekly.py) ---
  // 그림 속 분류 이름 → 사이트 종류
  const WEEKLY_TYPE = { '앨범일정': '발매', '예약판매': '굿즈', '유튜브': '방송', '음방': '음방', '방송': '방송', '굿즈': '굿즈', '행사': '행사', '공연': '공연', '팬사인회': '팬사인회', '라디오': '라디오', '신규앨범': '발매', 'Mnet+': '방송', '시상식': '행사', 'TV예능': '예능', '예능': '예능', '음악방송': '음방' };
  state.weekly = null;
  function weeklyLoad() {
    if (state.weekly) return;
    state.weekly = { events: [], loading: true };
    fetch(BASE + 'data/weekly.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => {
        const events = (d.events || []).filter((e) => e && e.date && e.title).map((e) => ({
          id: e.id, date: e.date, end: e.end || e.date, time: e.time || '', title: cleanTitle(e.title) || e.title,
          type: WEEKLY_TYPE[e.category] || e.category || '기타', place: e.note || '', src: 'etc', link: e.link || '',
        }));
        state.weekly = { updated: d.updated || '', events };
      })
      .catch(() => { state.weekly = { events: [] }; })
      .finally(schRefresh);
  }
  // 같은 일정인지: 같은 날(또는 기간 안) + 비슷한 제목
  const DUP_ALIAS = [[/엠카운트다운|엠카/g, 'mcountdown'], [/뮤직뱅크|뮤뱅/g, 'musicbank'], [/인기가요|인가/g, 'inkigayo'], [/음악중심|음중/g, 'musiccore'], [/쇼챔피언|쇼챔/g, 'showchampion'], [/더쇼/g, 'theshow'], [/잇츠라이브/g, 'itslive'], [/쇼케이스/g, 'showcase'], [/응원봉/g, 'lightstick'], [/갤럭시\s*나이트/g, 'galaxynight'], [/숨바\s*꼭질\s*2?|sumba\s*kkokjil\s*2?/g, 'sumbakkokjil']];
  const DUP_STOP = new Set(['release', 'rescene', '리센느', 'notice', '안내', 'the', 'and', 'with', 'live', 'pulse', 'by', 'in', 'of']);
  function dupTokens(t) {
    let x = String(t || '').toLowerCase().replace(/[’']/g, '');
    DUP_ALIAS.forEach(([re, to]) => { x = x.replace(re, ' ' + to + ' '); });
    x = x.replace(/m\s*\/\s*v/g, 'mv').replace(/light\s*stick/g, 'lightstick').replace(/galaxy\s*night/g, 'galaxynight').replace(/it\s*s\s*live/g, 'itslive');
    return x.split(/[^a-z0-9가-힣]+/).filter((w) => w.length >= 2 && !DUP_STOP.has(w));
  }
  const plain = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');
  function isDup(e, others) {
    const a = dupTokens(e.title);
    const flat = a.join('');
    return others.some((o) => {
      const sameDay = o.date === e.date;
      const inRange = o.date <= e.date && (o.end || o.date) >= e.date;
      if (!sameDay && !inRange) return false;
      if (!a.length && plain(e.title) && plain(e.title) === plain(o.title)) return true;
      const b = dupTokens(o.title);
      if (a.some((w) => w.length >= 3 && b.includes(w))) return true;
      const bf = b.join('');
      return flat.length >= 3 && bf.length >= 3 && (bf.includes(flat) || flat.includes(bf));
    });
  }
  // 기타 일정 중 Mnet Plus·blip에 없는 것만
  function weeklyNew() {
    weeklyLoad();
    const ws = (state.weekly && state.weekly.events) || [];
    if (!ws.length) return [];
    const months = [...new Set(ws.map((e) => e.date.slice(0, 7)))];
    const others = [];
    months.forEach((ym) => schOf(ym).forEach((e) => others.push({ ...e, end: e.date })));
    ((state.blip && state.blip.events) || []).forEach((e) => others.push(e));
    return ws.filter((e) => !isDup(e, others));
  }

  // --- Mnet Plus · blip 합치기 ---
  // 같은 날 + 비슷한 제목이면 한 일정으로 합쳐요. 정보가 많은 쪽을 바탕으로 하고 빈 칸은 다른 쪽에서 채워요.
  // 제목 비교 때는 해마다·회차·방송사·축제 같은 흔한 말을 빼요 (예: "SBS <무엇이든 해줄지니>" = "무엇이든 해줄지니").
  const MERGE_STOP = /(19|20)\d{2}|제\s*\d+\s*회|페스티벌|festival|페스타|콘서트|concert|축제|개막식|\bofficial\b|\bnotice\b|안내|\brelease\b|rescene|리센느|\bpulse\b|\blive\b|\bthe\b|\bby\b|\bsbs\b|\bkbs\s*2?\s*tv\b|\bkbs\b|\bmbc\b|\bjtbc\b|\bmnet\b|\btvn\b/g;
  const rawKey = (t) => cleanTitle(t).toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');
  function mergeKey(t) {
    let x = cleanTitle(t).toLowerCase().replace(/[’']/g, '');
    DUP_ALIAS.forEach(([re, to]) => { x = x.replace(re, ' ' + to + ' '); });
    return x.replace(MERGE_STOP, ' ').replace(/[^a-z0-9가-힣]+/g, '');
  }
  const grams = (k) => { const g = new Set(); for (let i = 0; i < k.length - 1; i++) g.add(k.slice(i, i + 2)); if (!g.size && k) g.add(k); return g; };
  const dice = (a, b) => { const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((x) => { if (B.has(x)) n++; }); return (2 * n) / (A.size + B.size); };
  const hm = (t) => (t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : null);
  // 두 일정이 같은 일정일 점수 (0이면 다른 일정)
  function sameScore(x, y) {
    if (x.date !== y.date) return 0;
    const a = mergeKey(x.title), b = mergeKey(y.title);
    if (!a || !b) return 0;
    const inside = (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b));
    const d = dice(a, b);
    const tx = hm(x.time), ty = hm(y.time);
    const gap = tx != null && ty != null ? Math.abs(tx - ty) : null;
    const rd = dice(rawKey(x.title), rawKey(y.title));
    const sameTime = gap === 0 && rd >= 0.7;
    if (!inside && !sameTime && (d < 0.5 || (gap != null && gap > 180))) return 0;
    return (inside ? 1 : Math.max(d, sameTime ? 0.7 : 0)) + 0.1 * rd + (gap != null ? 0.05 * (1 - Math.min(gap, 180) / 180) : 0);
  }
  const infoOf = (e) => (e.time ? 1 : 0) + (e.place ? 1 : 0) + (e.members && e.members.length ? 1 : 0) + (e.end && e.end !== e.date ? 1 : 0) + (e.link ? 1 : 0) + Math.min(cleanTitle(e.title).length, 40) / 40;
  function mergeTwo(x, y) {
    const [base, other] = infoOf(y) > infoOf(x) ? [y, x] : [x, y];
    const pick = (k) => (base[k] && (!Array.isArray(base[k]) || base[k].length) ? base[k] : other[k]);
    const title = rawKey(other.title).length > rawKey(base.title).length ? other.title : base.title;
    return { ...other, ...base, title, time: pick('time'), place: pick('place'), members: pick('members'), end: pick('end') || base.date, link: pick('link'), type: pick('type') };
  }
  // blip 안에서 똑같이 두 번 올라온 것 (같은 날 · 같은 종류 · 같은 제목 · 시간 1시간 안)
  function blipOnce(list) {
    const out = [];
    list.forEach((e) => {
      const k = mergeKey(e.title);
      const i = out.findIndex((o) => o.date === e.date && o.type === e.type && k.length >= 3 && mergeKey(o.title) === k
        && (hm(o.time) == null || hm(e.time) == null || Math.abs(hm(o.time) - hm(e.time)) <= 60));
      if (i < 0) out.push(e); else out[i] = mergeTwo(out[i], e);
    });
    return out;
  }
  // Mnet Plus 일정 하나당 blip 일정 하나까지만 짝지어요 (점수 높은 짝부터)
  function mergeSources(mnet, blip) {
    const pairs = [];
    mnet.forEach((m, i) => blip.forEach((b, j) => { const sc = sameScore(m, b); if (sc) pairs.push([sc, i, j]); }));
    pairs.sort((p, q) => q[0] - p[0]);
    const usedM = new Set(), usedB = new Set(), merged = new Map();
    pairs.forEach(([, i, j]) => {
      if (usedM.has(i) || usedB.has(j)) return;
      usedM.add(i); usedB.add(j);
      const m = mnet[i], b = blip[j];
      // 시간은 공식 일정(Mnet Plus)을 먼저 따라요
      merged.set(i, { ...mergeTwo(m, b), id: m.id, src: 'mnetplus', also: 'blip', link: b.link || '', time: m.time || b.time || '' });
    });
    return mnet.map((m, i) => merged.get(i) || m).concat(blip.filter((_, j) => !usedB.has(j)));
  }
  const blipAll = () => blipOnce((state.blip && state.blip.events) || []);

  // --- 모으기 ---
  // "… 참여 안내 2026.11.03(화) …"처럼 다른 날을 알리는 글은, 그날 같은 일정이 있으면 빼요
  function dropNotices(list, pool) {
    return list.filter((e) => {
      const m = String(e.title || '').match(/20\d{2}\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
      if (!m) return true;
      const ref = `${e.date.slice(0, 4)}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      if (ref <= e.date) return true;
      const a = dupTokens(e.title).filter((w) => w.length >= 3 && !/^\d/.test(w));
      return !pool.some((o) => o !== e && o.date === ref && dupTokens(o.title).some((w) => a.includes(w)));
    });
  }
  const schSort = (a, b) => (a.at + (a.cont ? '' : (a.time || '00:00'))).localeCompare(b.at + (b.cont ? '' : (b.time || '00:00'))) || a.src.localeCompare(b.src);
  const mnetEv = (e) => ({ ...e, src: 'mnetplus', end: e.date, link: '' });
  // 한 달에 보일 일정. 여러 날 일정은 시작일(이전 달이면 1일)과 종료일에 한 번씩
  function schAll(ym) {
    blipLoad();
    const first = ym + '-01';
    const last = ymLast(ym);
    const span = (list) => list
      .filter((e) => e.date <= last && e.end >= first)
      .flatMap((e) => {
        const head = e.date < first ? { ...e, at: first, cont: true } : { ...e, at: e.date };
        const tail = e.end && e.end !== head.at && e.end <= last ? [{ ...e, at: e.end, cont: true, endDay: true }] : [];
        return [head, ...tail];
      });
    const both0 = mergeSources(schOf(ym).map(mnetEv), blipAll());
    const etc0 = weeklyNew().concat(musicExtraEvents());
    const both = dropNotices(both0, both0.concat(etc0));
    const etc = span(etc0);
    return span(both).concat(etc).map((e) => ({ ...e, at: e.at || e.date })).sort(schSort);
  }
  // 검색용: 불러온 모든 달
  function schKnown() {
    const out = [];
    const mnet = [];
    Object.keys(state.sch).forEach((ym) => schOf(ym).forEach((e) => mnet.push(mnetEv(e))));
    const both = mergeSources(mnet, blipAll());
    const etc = weeklyNew().concat(musicExtraEvents());
    dropNotices(both, both.concat(etc)).forEach((e) => out.push({ ...e }));
    etc.forEach((e) => out.push({ ...e }));
    return out.map((e) => ({ ...e, at: e.date })).sort(schSort);
  }
  const schFilter = (list) => list.filter((e) => (!state.schSrc || e.src === state.schSrc || e.also === state.schSrc) && (!state.schType || schKind(e.type, e.title) === state.schType));
  const schLink = (e) => linkUrl(e.link) || (e.src === 'mnetplus' ? SCH_PAGE(e.date.slice(0, 7)) : '');
  const schKey = (e) => `${e.src}:${e.id}`;

  // --- 캘린더 파일 (.ics) ---
  function icsText(list, name) {
    const pad = (n) => String(n).padStart(2, '0');
    const utc = (date, time) => {
      const [y, mo, d] = date.split('-').map(Number);
      const [h, mi] = time.split(':').map(Number);
      const t = new Date(Date.UTC(y, mo - 1, d, h - 9, mi));
      return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00Z`;
    };
    const esc2 = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
    const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//rescene-todo//KO', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc2(name)}`, 'X-WR-TIMEZONE:Asia/Seoul'];
    list.forEach((e) => {
      lines.push('BEGIN:VEVENT', `UID:${e.src}-${e.id}@rescene-todo`, `DTSTAMP:${now}`);
      if (e.time) {
        lines.push(`DTSTART:${utc(e.date, e.time)}`);
        const [h, mi] = e.time.split(':').map(Number);
        const endT = h >= 23 ? e.time : `${pad(h + 1)}:${pad(mi)}`;
        lines.push(`DTEND:${utc(e.date, endT)}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(e.end || e.date, 1).replace(/-/g, '')}`);
      }
      lines.push(`SUMMARY:${esc2('[리센느] ' + e.title)}`);
      const desc = [schType(e.type, e.title).label, SCH_SRC[e.src], schLink(e)].filter(Boolean).join('\n');
      lines.push(`DESCRIPTION:${esc2(desc)}`);
      if (e.place) lines.push(`LOCATION:${esc2(e.place)}`);
      if (schLink(e)) lines.push(`URL:${schLink(e)}`);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
  async function saveIcs(list, fileName, title) {
    const file = new File([icsText(list, title)], fileName, { type: 'text/calendar' });
    const mobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('캘린더 파일을 저장했어요');
  }
  const ICS_URL = () => new URL(BASE + 'data/rescene.ics', location.href).href;
  function openSubscribe() {
    let m = document.getElementById('sch-sub');
    const https = ICS_URL();
    const webcal = https.replace(/^https?:/, 'webcal:');
    if (!m) {
      m = document.createElement('div');
      m.id = 'sch-sub'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', '캘린더 구독');
      document.body.appendChild(m);
      m.addEventListener('click', (e) => {
        if (e.target === m || e.target.closest('[data-modal-close]')) { hideModal(m); return; }
        const cp = e.target.closest('[data-copy]');
        if (cp) copyText(cp.dataset.copy, cp.dataset.copyLabel);
      });
    }
    m.innerHTML = `
      <div class="modal-box">
        <div class="modal-head"><h2>내 캘린더로 구독</h2><button type="button" class="icon-btn" data-modal-close aria-label="닫기">닫기</button></div>
        <p class="muted">한 번 구독하면 Mnet Plus·blip에 새 일정이 올라올 때 휴대폰 캘린더에도 자동으로 생겨요. (캘린더 앱이 몇 시간마다 새로 받아요)</p>
        <div class="sub-btns">
          <a class="btn primary" href="${esc(webcal)}">아이폰·맥 캘린더로 구독</a>
          <a class="btn" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}" target="_blank" rel="noopener">구글 캘린더로 구독 ↗</a>
          <button type="button" class="btn" data-copy="${esc(https)}" data-copy-label="구독 주소">구독 주소 복사</button>
        </div>
        <p class="muted small">삼성 캘린더 등은 구글 캘린더에 구독하면 같이 보여요. 구독 주소: <code>${esc(https)}</code></p>
      </div>`;
    showModal(m);
  }
  function openExport() {
    const ym = state.schMonth;
    const monthList = schFilter(schAll(ym)).filter((e) => !e.cont);
    const upcoming = schFilter(schKnown()).filter((e) => (e.end || e.date) >= today());
    let m = document.getElementById('sch-exp');
    if (!m) {
      m = document.createElement('div');
      m.id = 'sch-exp'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', '캘린더에 저장');
      document.body.appendChild(m);
      m.addEventListener('click', (e) => {
        if (e.target === m || e.target.closest('[data-modal-close]')) { hideModal(m); return; }
        const b = e.target.closest('[data-exp]');
        if (!b) return;
        const list = b.dataset.exp === 'month' ? schFilter(schAll(state.schMonth)).filter((x) => !x.cont) : schFilter(schKnown()).filter((x) => (x.end || x.date) >= today());
        saveIcs(list, b.dataset.exp === 'month' ? `rescene-${state.schMonth}.ics` : 'rescene-upcoming.ics', '리센느 일정');
        hideModal(m);
      });
    }
    m.innerHTML = `
      <div class="modal-box">
        <div class="modal-head"><h2>캘린더에 저장</h2><button type="button" class="icon-btn" data-modal-close aria-label="닫기">닫기</button></div>
        <p class="muted">고른 일정을 캘린더 파일로 저장해요. 휴대폰에서는 공유 창이 열리면 캘린더 앱을 고르세요.${state.schSrc || state.schType ? ' 지금 고른 출처·종류만 들어가요.' : ''}</p>
        <div class="sub-btns">
          <button type="button" class="btn primary" data-exp="month" ${monthList.length ? '' : 'disabled'}>${+ym.slice(5)}월 일정 저장 (${monthList.length}개)</button>
          <button type="button" class="btn" data-exp="upcoming" ${upcoming.length ? '' : 'disabled'}>앞으로 일정 모두 저장 (${upcoming.length}개)</button>
        </div>
        <p class="muted small">새 일정까지 계속 받고 싶으면 <b>구독</b>을 쓰세요.</p>
      </div>`;
    showModal(m);
  }

  // --- 화면 조각 ---
  function schTimeLabel(e) {
    if (e.end && e.end !== e.date) return e.endDay ? '종료' : e.cont ? '진행 중' : '시작';
    if (!e.time) return '하루 종일';
    const [h, m] = e.time.split(':').map(Number);
    return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : '시'}`;
  }
  const hl = (text, q) => {
    const s = esc(text);
    if (!q) return s;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? s : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  };
  function schRow(e, t, q) {
    const ty = schType(e.type, e.title);
    const multi = e.end && e.end !== e.date;
    const past = (e.end || e.date) < t;
    const meta = [
      multi ? `${mdw(e.date)} – ${mdw(e.end)}` : '',
      e.place || '',
      e.members && e.members.length && e.members.length < 4 ? e.members.join('·') : '',
    ].filter(Boolean).map(esc).join(' · ');
    const link = schLink(e);
    const mv = e.mv || showOfEvent(e);
    return `<li class="sch-row${past ? ' past' : ''}">
        <span class="sch-time">${esc(schTimeLabel(e))}</span>
        <div class="sch-body">
          ${link ? `<a class="sch-name" href="${esc(link)}" target="_blank" rel="noopener">${hl(e.title, q)}<span class="sch-ext" aria-hidden="true">↗</span></a>` : `<b class="sch-name">${hl(e.title, q)}</b>`}
          ${meta ? `<small class="sch-meta">${hl(meta.replace(/&amp;/g, '&'), q)}</small>` : ''}
          ${mv && airNote(mv, e.date) ? `<small class="sch-meta sch-air">${esc(airNote(mv, e.date))}</small>` : ''}
          ${mv ? `<button type="button" class="sch-vote" data-goguide="music-${mv.id}">${esc(liveLine(mv))}<span aria-hidden="true">›</span></button>` : ''}
          <span class="sch-foot">
            <span class="sch-kind"><span class="sch-k"><i class="dot" style="--c:${ty.color}"></i>${esc(ty.label)}${e.mv && e.src === 'etc' ? ' · 출연 확정' : ''}</span>${[SCH_SRC[e.src] && e.src !== 'etc' ? SCH_SRC[e.src] : '', e.also ? SCH_SRC[e.also] : ''].filter(Boolean).map((x) => ` <span class="sch-from"><i class="sep">·</i>${esc(x)}</span>`).join('')}</span>
            <span class="sch-acts">
              ${e.src !== 'etc' ? `<a class="sch-act" href="https://www.google.com/search?q=${encodeURIComponent('리센느 ' + e.title)}" target="_blank" rel="noopener">검색</a>` : ''}
              <button type="button" class="sch-act" data-schics="${esc(schKey(e))}" aria-label="내 캘린더에 추가">캘린더 +</button>
            </span>
          </span>
        </div>
      </li>`;
  }
  function schGroups(list, t, q) {
    const by = {};
    list.forEach((e) => { (by[e.at] = by[e.at] || []).push(e); });
    return Object.keys(by).sort().map((d) => {
      const n = diffDays(t, d);
      const tag = n === 0 ? '<i class="flag hot">오늘</i>' : n > 0 && n <= 7 ? `<i class="flag">D-${n}</i>` : '';
      return `<section class="sch-date${d < t ? ' past' : ''}" id="sch-${d}">
          <h3><span>${q ? `${d.slice(0, 4)}년 ` : ''}${longLabel(d)}</span>${tag}
            ${q ? `<button type="button" class="sch-jump" data-schjump="${d}">달력에서 보기</button>` : `<button type="button" class="sch-share" data-schshare="${d}" aria-label="${longLabel(d)} 일정 링크 복사" title="이 날 링크 복사"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`}</h3>
          <ul>${by[d].map((e) => schRow(e, t, q)).join('')}</ul>
        </section>`;
    }).join('');
  }
  // 옆 칸이 없는 폭(휴대폰 · 태블릿): 고른 날 일정은 달력 바로 아래에
  const schNarrow = () => !window.matchMedia('(min-width: 1100px)').matches;
  // 달력 막대에 넣을 짧은 이름: 괄호 · 그룹 이름 · 방송사 같은 앞말을 빼요
  const schShort = (title) => title.replace(/[<>]/g, '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/^\s*(RESCENE|리센느|MBC|KBS2?|SBS|Mnet|JTBC|tvN|MBC\s*M|SBS\s*FiL|ARIRANG)\b\s*/gi, '').replace(/(^|\s)(19|20)\d{2}(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim() || title;
  // 그날 보일 일정: 하루 일정 + 여러 날 일정의 시작일 · 종료일만 (가운데 날과 지난달에서 이어진 1일은 빼요)
  const schOnDay = (list, d) => list.filter((e) => e.at === d && (!e.cont || e.endDay));
  // 달력: 칸마다 날짜 + 짧은 이름 막대 (휴대폰 2~3개, 넘치면 +N)
  function schCalHtml(list, t) {
    const ym = state.schMonth;
    const first = ym + '-01';
    const last = ymLast(ym);
    const gridStart = addDays(first, -dowOf(first));
    const weeks = Math.ceil((diffDays(gridStart, last) + 1) / 7);
    let html = '';
    for (let w = 0; w < weeks; w++) {
      let days = '';
      for (let i = 0; i < 7; i++) {
        const d = addDays(gridStart, w * 7 + i);
        const inM = d.slice(0, 7) === ym;
        const evs = inM ? schOnDay(list, d) : [];
        const cls = ['sc-day', !inM && 'out', d === t && 'today', d === state.schSel && 'sel', d < t && 'past', i === 0 && 'sun', i === 6 && 'sat'].filter(Boolean).join(' ');
        const shown = evs.length > 3 ? 2 : 3;
        days += `<button type="button" class="${cls}" data-schday="${d}"${inM ? '' : ' tabindex="-1" aria-hidden="true"'} aria-label="${longLabel(d)} 일정 ${evs.length}개" aria-pressed="${d === state.schSel}">
          <span class="sc-num">${+d.slice(8)}</span>
          ${evs.slice(0, shown).map((e) => `<i class="sc-pill${e.endDay ? ' end' : ''}" style="--c:${schType(e.type, e.title).color}">${e.endDay ? '~' : ''}${esc(schShort(e.title))}</i>`).join('')}
          ${evs.length > shown ? `<small class="sc-more">+${evs.length - shown}</small>` : ''}
        </button>`;
      }
      html += `<div class="sc-week">${days}</div>`;
    }
    return `<div class="sc-cal"><div class="sc-dow">${DOW.map((x, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${x}</span>`).join('')}</div>${html}</div>`;
  }
  // 고른 날: 큰 날짜 + 요일 · D-day, 전날 · 다음 날 · 닫기 (갤럭시 캘린더의 아래 칸)
  function schDayHtml(list, t) {
    const sel = state.schSel;
    const day = schOnDay(list, sel);
    const n = diffDays(t, sel);
    const tag = n === 0 ? '오늘' : n > 0 ? `D-${n}` : '';
    const btn = (attr, label, path) => `<button type="button" class="sc-btn" ${attr} aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg></button>`;
    return `<div class="sc-dayhead">
        <b class="sc-dnum">${+sel.slice(8)}</b>
        <p><strong>${DOW[dowOf(sel)]}요일</strong><small>${+sel.slice(5, 7)}월${tag ? ` · <i class="${n === 0 ? 'hot' : ''}">${tag}</i>` : ''}${day.length ? ` · 일정 ${day.length}개` : ''}</small></p>
        <span class="sc-nav">${btn('data-schstep="-1"', '전날', 'M15 6l-6 6 6 6')}${btn('data-schstep="1"', '다음 날', 'M9 6l6 6-6 6')}${btn(`data-schday="${sel}"`, `${+sel.slice(5, 7)}월 전체 일정 보기`, 'M7 7l10 10M17 7L7 17')}</span>
      </div>
      ${day.length ? `<div class="sc-daylist"><ul>${day.map((e) => schRow(e, t)).join('')}</ul></div>` : '<div class="sc-daylist sc-none">이 날은 일정이 없어요</div>'}`;
  }
  // 거르기: 한 줄 칩. 앞은 일정 종류, 구분선 뒤는 출처 (둘 다 고르면 둘 다 맞는 것만)
  function schFiltersHtml(every) {
    every = every.filter((e) => !e.endDay); // 종료일 표시는 개수에 안 셈
    const pool = state.schSrc ? every.filter((e) => e.src === state.schSrc || e.also === state.schSrc) : every;
    const types = SCH_ORDER.filter((k) => pool.some((e) => schKind(e.type, e.title) === k));
    if (state.schType && !types.includes(state.schType)) state.schType = '';
    const srcs = [['mnetplus', 'Mnet Plus'], ['blip', 'blip'], ['etc', '기타 출처']].filter(([k]) => every.some((e) => e.src === k || e.also === k));
    const all = !state.schType && !state.schSrc;
    return `<div class="filter-chips sch-chips" role="group" aria-label="일정 거르기">
        <button type="button" class="fchip${all ? ' on' : ''}" data-schall aria-pressed="${all}">전체</button>
        ${types.map((ty) => `<button type="button" class="fchip${state.schType === ty ? ' on' : ''}" data-schtype="${esc(ty)}" aria-pressed="${state.schType === ty}"><i class="dot" style="background:${schType(ty).color}"></i>${esc(schType(ty).label)}</button>`).join('')}
        ${srcs.length > 1 ? `<i class="fchip-sep" aria-hidden="true"></i>${srcs.map(([k, label]) => `<button type="button" class="fchip src${state.schSrc === k ? ' on' : ''}" data-schsrc="${k}" aria-pressed="${state.schSrc === k}">${label}</button>`).join('')}` : ''}
      </div>`;
  }
  function schMainHtml() {
    const t = today();
    const ym = state.schMonth;
    const q = state.schQ.trim();
    const box = state.sch[ym] || {};
    const list = schFilter(schAll(ym));
    // 이번 달이면 지난 일정은 접어 두고 오늘부터 보여 줘요
    const monthList = (l) => {
      if (ym !== t.slice(0, 7)) return schGroups(l, t);
      const past = l.filter((e) => (e.end || e.date) < t);
      const rest = l.filter((e) => (e.end || e.date) >= t);
      return `${past.length ? `<details class="sch-past"><summary>지난 일정 ${past.length}개</summary>${schGroups(past, t)}</details>` : ''}${rest.length ? schGroups(rest, t) : '<div class="card empty"><strong>이 달에 남은 일정은 없어요</strong></div>'}`;
    };
    let side;
    if (q) {
      const words = q.toLowerCase().split(/\s+/);
      const found = schFilter(schKnown()).filter((e) => {
        const hay = [e.title, e.place, (e.members || []).join(' '), schType(e.type, e.title).label, SCH_SRC[e.src]].join(' ').toLowerCase();
        return words.every((w) => hay.includes(w));
      });
      side = `<div class="sch-side-head"><h2>"${esc(q)}" 검색 결과 <i class="seg-n">${found.length}</i></h2><button type="button" class="btn small" data-schclear>검색 지우기</button></div>
        ${found.length ? schGroups(found, t, q) : '<div class="card empty"><strong>찾는 일정이 없어요</strong>다른 낱말로 찾아보세요. 불러온 달(지난달 ~ 몇 달 뒤) 안에서 찾아요.</div>'}`;
    } else if (state.schSel && state.schSel.slice(0, 7) === ym) {
      side = schDayHtml(list, t);
    } else {
      const loading = box.events === null || ((box.loading || (state.blip && state.blip.loading)) && !list.length);
      side = `<div class="sch-side-head"><h2>${+ym.slice(5)}월 일정 <i class="seg-n">${list.filter((e) => !e.endDay).length}</i></h2>${schNarrow() ? '' : '<p class="sch-hint">달력에서 날짜를 누르면 그날 일정만 보여요</p>'}</div>
        ${list.length ? monthList(list) : loading ? '<div class="card empty"><strong>불러오는 중…</strong></div>' : '<div class="card empty"><strong>이 달에는 등록된 일정이 없어요</strong>새로 올라오면 여기에 보여요.</div>'}`;
    }
    return `<div class="card sch-cal">${schCalHtml(list, t)}</div><div class="sch-side" id="sch-side">${side}</div>`;
  }
  function schStatusHtml() {
    const ym = state.schMonth;
    const box = state.sch[ym] || {};
    const fmtT = (d) => (d && !isNaN(d) ? new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d) : '');
    const mt = fmtT(box.savedAt ? new Date(box.savedAt) : null);
    const bt = fmtT(state.blip && state.blip.updated ? new Date(state.blip.updated) : null);
    const mnet = !box.error ? `Mnet Plus는 바로 불러와요${mt ? ` (${mt})` : ''}.`
      : schBackup(ym) ? '<span class="warn">Mnet Plus에 지금 연결되지 않아서, 사이트가 30분마다 받아 둔 일정을 보여줘요.</span>'
      : `<span class="warn">Mnet Plus를 지금 불러오지 못했어요${mt ? ` (${mt}에 받은 일정)` : ''}.</span>`;
    const blip = state.blip && state.blip.error ? '<span class="warn">blip 일정을 불러오지 못했어요.</span>' : `blip은 30분마다 받아 와요${bt ? ` (${bt})` : ''}.`;
    return `${mnet} ${blip} 시간은 한국 시간이에요.<br>원본: <a href="${SCH_PAGE(ym)}" target="_blank" rel="noopener">Mnet Plus ↗</a> · <a href="${BLIP_PAGE}&year=${+ym.slice(0, 4)}&month=${+ym.slice(5)}" target="_blank" rel="noopener">blip ↗</a>`;
  }
  function schPickHtml() {
    const y = state.schPickYear;
    const cur = state.schMonth;
    return `<div class="sch-pick" role="dialog" aria-label="연도, 월 고르기">
        <div class="sch-pick-y"><button type="button" class="btn small" data-schpy="-1" aria-label="이전 해">‹</button><b>${y}년</b><button type="button" class="btn small" data-schpy="1" aria-label="다음 해">›</button></div>
        <div class="sch-pick-m">${Array.from({ length: 12 }, (_, i) => {
          const ym = `${y}-${String(i + 1).padStart(2, '0')}`;
          return `<button type="button" class="${ym === cur ? 'on' : ''}${ym === today().slice(0, 7) ? ' now' : ''}" data-schym="${ym}">${i + 1}월</button>`;
        }).join('')}</div>
      </div>`;
  }
  // 불러오기가 끝나면 화면 일부만 다시 그림 (검색창 입력이 끊기지 않게)
  function schRefresh() {
    const tab = route().tab;
    // 음악방송 탭 '출연 예정 음방'도 공식 일정(사녹 · 출연)을 써요
    if (tab === 'today' || tab === 'music') { render({ keepScroll: true }); return; }
    if (tab !== 'schedule') return;
    const main = document.getElementById('sch-main');
    if (!main) return;
    // 거르기 먼저 (없는 종류를 골라 두었으면 여기서 풀려요), 그다음 달력
    const f = document.getElementById('sch-filters');
    if (f) f.innerHTML = schFiltersHtml(schAll(state.schMonth));
    main.innerHTML = schMainHtml();
    const st = document.getElementById('sch-status');
    if (st) st.innerHTML = schStatusHtml();
  }
  // 오늘 화면에 붙는 한 줄: 다음 일정
  function schNextLine() {
    const t = today();
    const ym = t.slice(0, 7);
    if (!state.sch[ym]) schLoad(ym);
    const next = schAll(ym).concat(state.sch[ymAdd(ym, 1)] ? schAll(ymAdd(ym, 1)) : []).find((e) => !e.cont && e.date >= t);
    if (!next) return '';
    const n = diffDays(t, next.date);
    return `<a class="sch-next" href="${urlFor('schedule', next.date)}"><span class="sch-next-k">${n === 0 ? '오늘' : `D-${n}`}</span><span class="sch-next-t">${esc(next.title)}</span><span class="sch-next-d">${mdw(next.date)}${next.time ? ' ' + esc(next.time) : ''}</span></a>`;
  }
  function renderSchedule() {
    const t = today();
    // 주소로 날짜가 오면 (…/schedule#2026-11-03) 그 날을 열어 줌
    const arg = route().arg || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(arg) && arg !== state.schArg) { state.schMonth = arg.slice(0, 7); state.schSel = arg; state.schQ = ''; }
    state.schArg = arg;
    if (!state.schMonth) state.schMonth = t.slice(0, 7);
    // 휴대폰은 처음 열 때 오늘을 골라 둬요 (아이폰 · 갤럭시 캘린더처럼 달력 아래에 오늘 일정)
    if (!state.schInit) { state.schInit = true; if (!state.schSel && schNarrow() && state.schMonth === t.slice(0, 7)) state.schSel = t; }
    const ym = state.schMonth;
    // 이 달 + 앞뒤 달을 미리 불러 둠 (검색용)
    [-1, 0, 1, 2].forEach((n) => schLoad(ymAdd(ym, n)));
    if (!state.schPickYear) state.schPickYear = +ym.slice(0, 4);
    if (state.schQ) state.schFind = true;
    return `
      <div class="cal-head sch-head">
        <button type="button" class="sch-title" data-schpick aria-expanded="${state.schPick}"><h1>${+ym.slice(5)}월<span class="vh"> 일정</span></h1><span class="sch-year">${ym.slice(0, 4)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg></button>
        <div class="cal-nav">
          <button class="btn small sch-find${state.schFind ? ' on' : ''}" type="button" data-schfind aria-expanded="${state.schFind}" aria-label="일정 검색"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg></button>
          <button class="btn small" type="button" data-schmonth="-1" aria-label="이전 달">‹</button>
          <button class="btn small" type="button" data-schmonth="0">오늘</button>
          <button class="btn small" type="button" data-schmonth="1" aria-label="다음 달">›</button>
        </div>
      </div>
      ${state.schPick ? schPickHtml() : ''}
      <div class="sch-tools"${state.schFind ? '' : ' hidden'}>
        <label class="sch-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>
          <input type="search" id="sch-q" placeholder="일정 검색 (팬사인회, 멤버 이름…)" value="${esc(state.schQ)}" autocomplete="off" enterkeyhint="search" aria-label="일정 검색">
        </label>
      </div>
      <div class="sch-filters" id="sch-filters">${schFiltersHtml(schAll(ym))}</div>
      <div class="sch-wrap" id="sch-main">${schMainHtml()}</div>
      <section class="card sch-sync">
        <div><h2>내 캘린더에 넣기</h2><p>구독하면 새 일정이 휴대폰 캘린더에 저절로 들어와요.</p></div>
        <div class="sch-sync-btns"><button type="button" class="btn small primary" data-schsub>구독하기</button><button type="button" class="btn small" data-schexp>파일로 저장</button></div>
      </section>
      <p class="sch-src" id="sch-status">${schStatusHtml()}</p>`;
  }
  // 검색 입력: 화면 일부만 다시 그림
  let schQTimer = 0;
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'sch-q') return;
    state.schQ = e.target.value;
    clearTimeout(schQTimer);
    schQTimer = setTimeout(schRefresh, 120);
  });
  document.addEventListener('keydown', (e) => {
    // '/' 키로 검색창 바로 가기 (컴퓨터)
    if (e.key === '/' && route().tab === 'schedule' && !/input|textarea/i.test((document.activeElement || {}).tagName || '')) {
      e.preventDefault();
      schOpenFind();
    }
    if (e.key === 'Escape' && e.target.id === 'sch-q' && state.schQ) { e.target.value = ''; state.schQ = ''; schRefresh(); }
  });
  // 화면 폭이 넓은 쪽 ↔ 좁은 쪽으로 바뀌면 다시 그림
  window.matchMedia('(min-width: 1100px)').addEventListener('change', () => { if (route().tab === 'schedule') schRefresh(); });
  // 휴대폰: 고른 날 일정이 화면 아래에 숨어 있으면 올려 보여 줘요.
  // 단, 달력 맨 위(요일 줄 · 첫 주)가 맨 위 줄 밑으로 숨지 않을 만큼까지만.
  function schShowDay() {
    const head = document.querySelector('.sc-dayhead');
    const cal = document.querySelector('.sch-cal');
    if (!head || !cal || !schNarrow()) return;
    const bar = document.querySelector('.tabbar');
    const top = document.querySelector('.topbar');
    const bottom = window.innerHeight - (bar ? bar.offsetHeight : 0);
    const want = head.getBoundingClientRect().top - (bottom - 160); // 머리 + 첫 일정이 보이게
    const room = cal.getBoundingClientRect().top - (top ? top.getBoundingClientRect().bottom : 0) - 8;
    const by = Math.min(want, room);
    if (by <= 0) return;
    const box = scrollBox() || window;
    const y0 = scrolledY();
    box.scrollBy({ top: by, behavior: 'smooth' });
    // 부드러운 스크롤이 안 되는 곳(일부 브라우저)은 바로 이동
    setTimeout(() => { if (Math.abs(scrolledY() - y0) < 2) box.scrollBy({ top: by }); }, 600);
  }
  function schSetDay(d) {
    state.schSel = d;
    const url = urlFor('schedule', d || undefined);
    if (url !== location.pathname + location.hash) history.replaceState(null, '', url);
    state.schArg = d || '';
  }
  // 클릭 처리 (스케줄 화면 전용). 처리했으면 true
  function schClick(e) {
    const g = (sel) => e.target.closest(sel);
    let el;
    if ((el = g('[data-schday]'))) {
      schSetDay(state.schSel === el.dataset.schday ? '' : el.dataset.schday);
      schRefresh();
      schShowDay();
      return true;
    }
    // 고른 날 칸에서 전날 · 다음 날로 (달이 바뀌면 달력도 넘겨요)
    if ((el = g('[data-schstep]'))) {
      const d = addDays(state.schSel, +el.dataset.schstep);
      const moved = d.slice(0, 7) !== state.schMonth;
      state.schMonth = d.slice(0, 7);
      schSetDay(d);
      if (moved) render({ keepScroll: true }); else schRefresh();
      const again = document.querySelector(`[data-schstep="${el.dataset.schstep}"]`);
      if (again) again.focus({ preventScroll: true });
      return true;
    }
    if ((el = g('[data-schmonth]'))) {
      const n = +el.dataset.schmonth;
      state.schMonth = n === 0 ? today().slice(0, 7) : ymAdd(state.schMonth, n);
      schSetDay(n === 0 ? today() : '');
      state.schPick = false;
      render({ keepScroll: true });
      return true;
    }
    if (g('[data-schpick]')) { state.schPick = !state.schPick; state.schPickYear = +state.schMonth.slice(0, 4); render({ keepScroll: true }); return true; }
    if ((el = g('[data-schpy]'))) { state.schPickYear += +el.dataset.schpy; render({ keepScroll: true }); return true; }
    if ((el = g('[data-schym]'))) { state.schMonth = el.dataset.schym; state.schPick = false; schSetDay(''); render({ keepScroll: true }); return true; }
    if (g('[data-schfind]')) { if (state.schFind) schCloseFind(); else schOpenFind(); return true; }
    if (g('[data-schall]')) { state.schSrc = ''; state.schType = ''; schRefresh(); return true; }
    // 칩: 한 번 더 누르면 풀림
    if ((el = g('[data-schsrc]'))) { state.schSrc = state.schSrc === el.dataset.schsrc ? '' : el.dataset.schsrc; schRefresh(); return true; }
    if ((el = g('[data-schtype]'))) { state.schType = state.schType === el.dataset.schtype ? '' : el.dataset.schtype; schRefresh(); return true; }
    if (g('[data-schclear]')) { state.schQ = ''; const q = document.getElementById('sch-q'); if (q) q.value = ''; schRefresh(); return true; }
    if ((el = g('[data-schjump]'))) {
      const d = el.dataset.schjump;
      state.schQ = ''; state.schMonth = d.slice(0, 7); schSetDay(d);
      render({ keepScroll: true });
      const side = document.getElementById('sch-side');
      if (side) side.scrollIntoView({ block: 'nearest' });
      return true;
    }
    if ((el = g('[data-schshare]'))) {
      const d = el.dataset.schshare;
      const url = new URL(urlFor('schedule', d), location.href).href;
      const text = `리센느 ${longLabel(d)} 일정`;
      if (navigator.share && /android|iphone|ipad|ipod/i.test(navigator.userAgent)) navigator.share({ title: text, url }).catch(() => {});
      else copyText(url, '링크');
      return true;
    }
    if ((el = g('[data-schics]'))) {
      const ev = schKnown().find((x) => schKey(x) === el.dataset.schics);
      if (ev) saveIcs([ev], `rescene-${ev.date}.ics`, ev.title);
      return true;
    }
    if (g('[data-schsub]')) { openSubscribe(); return true; }
    if (g('[data-schexp]')) { openExport(); return true; }
    return false;
  }
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
  const APPS = {
    // scheme: 앱을 바로 여는 주소 형식 (각 앱 공식 웹페이지 코드에서 확인, 2026-11-02)
    // iosScheme: 아이폰에서만 쓰는 주소. open: 안드로이드 앱 링크(https). ul: 아이폰 사파리에서도 그 링크로 앱이 열림
    // 아이돌챔프는 앱 주소가 없어서 앱 링크만: 홈 화면 웹앱에서는 새 창(사파리)으로 넘겨서 열어요
    mubeat: { name: '뮤빗', and: 'com.vlending.apps.mubeat', ios: '1320789688', iosScheme: 'mubeat://', open: 'https://mubeat.tv/?app-link-url=home', web: 'https://mubeat.tv' },
    bigc: { name: '빅크', and: 'im.bigc.lively', ios: '1575835045', scheme: 'bigc://', web: 'https://www.bigc.im' },
    idolchamp: { name: '아이돌챔프', and: 'com.nwz.ichampclient', ios: '1185735018', open: 'https://app.idolchamp.com/open/navi/vote', ul: true, web: 'https://www.idolchamp.co.kr' },
    mnetplus: { name: 'Mnet Plus', and: 'world.mnetplus', ios: '6443405421', scheme: 'mnetplus://', web: 'https://www.mnetplus.world' },
    coogoong: { name: '쿠궁', and: 'com.contentsmadang.fancast', ios: '1641638840', scheme: 'fancast://main?tabname=vote', web: 'https://coogoong.com' },
    linc: { name: 'LiNC', and: 'io.stayge.youmeonapp', ios: '6467824343', scheme: 'lincapp://', web: 'https://www.linc.fan' },
    higher: { name: '하이어', and: 'com.dalcomsoft.mysu.a', ios: '1672001935', scheme: 'higherfan://' },
    muniverse: { name: '뮤니버스', and: 'com.tnk.muniverse', ios: '6749677921', scheme: 'muniverse://', web: 'https://www.muniverse.io/votes' },
  };
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
  const MUSIC_SHOWS = [
    { id: 'showkpop', span: '목~토', day: 1, name: '쇼케이팝', sub: 'SHOW K-POP', time: '18:00', end: '19:10', ch: 'Arirang TV',
      re: /쇼케이팝|show\s*k-?pop|monshow/i,
      chart: '글로벌 음원 45 · 앨범 10 · SNS 10 · 방송 5 · 사전투표 15 (%)로 1위 후보 2팀 → 두 팀만 생방송 투표 15%를 더해 최종 1위',
      parts: [
        ['글로벌 음원 45%', '써클차트 글로벌 K-POP 데이터 · 방송 전전주 일 ~ 토 (예: 10/19 방송 → 10/4 ~ 10/10)'],
        ['글로벌 앨범 10%', '써클차트 · 방송 전전주 일 ~ 토'],
        ['SNS 10%', '써클차트 소셜차트(동영상 조회수) · 방송 전전주 일 ~ 토'],
        ['방송 점수 5%', '10/30 공지로 10% → 5%'],
        ['사전투표 15%', '뮤빗 · 방송 전주 목 12:00 ~ 전주 토 12:00'],
        ['생방송 투표 15%', '뮤빗 · 생방송 중에만, 1위 후보 2팀만 · 1인 최대 50표'],
      ],
      partsSrc: '쇼케이팝 공식 공지 (2026-10-30 비율 변경 반영)',
      pre: { cost: '하트비트로 투표', appKey: 'mubeat', app: '뮤빗(Mubeat)', where: '뮤빗 → 투표 → SHOW K-POP 탭', when: '방송 전주 목 12:00 ~ 토 12:00', wk: { from: '목 12:00', to: '토 12:00' },
        steps: ['뮤빗 앱 아래 가운데 투표 버튼', 'SHOW K-POP 탭 → 사전투표 부문', '리센느 투표 버튼'],
        ticket: '하트비트: 광고 · 미션 · 퀴즈로 무료로 모아요', limit: '가진 하트비트만큼 (앱 화면에서 확인)', weight: '15%' },
      live: { cost: '1인 최대 50표', appKey: 'mubeat', app: '뮤빗(Mubeat)', where: '뮤빗 → 투표 → SHOW K-POP → 생방송 투표', when: '생방송 중에만 (18:00 ~ 19:10) · 결방이면 없음',
        steps: ['뮤빗 → 투표 → SHOW K-POP 탭', '생방송 투표', '리센느 투표'],
        limit: '1인 최대 50표', qty: '50표', weight: '15% · 1위 후보 2팀만' },
      tip: '정식 데뷔 가수 음원만 집계하고 드라마 · 웹툰 OST와 오디션 프로그램 음원은 빠져요. 통산 3주 1위면 명예의 전당에 올라 차트에서 빠져요. 투표 화면 오른쪽 위 인증서 아이콘으로 투표 인증서를 저장 · 공유할 수 있어요.',
      after: '쇼스테이지: 방송이 끝나면 바로 그날 출연진 전체를 대상으로 100% 투표 (뮤빗) → 1위는 시상과 SHOW STAGE 명예의 전당',
      links: [['쇼케이팝 공식', 'https://showkpop.com']] },
    { id: 'theshow', span: '금~월', day: 2, name: '더쇼', sub: 'THE SHOW', time: '18:00', end: '19:00', ch: 'SBS LIFE',
      re: /더\s*쇼(?!케)|the\s*show\b/i,
      chart: '사전 집계(음원 40 · 음반 20 · 팬 인게이지먼트 20 · 사전투표 20 %)로 1위 후보 3팀 → 생방송 투표 20%를 더해서 더쇼 초이스 · 그날 출연한 가수만',
      parts: [
        ['음원 40%', '애플뮤직 글로벌 스트리밍 · 방송 전전주 금 ~ 전주 목 (미국 PT 기준)'],
        ['음반 20%', '한터차트 · 방송 전전주 토 ~ 전주 금'],
        ['팬 인게이지먼트 20%', '써클차트 · K-POP RADAR: 공식 유튜브 · 틱톡 조회수 · 좋아요 · 댓글 수 · 방송 전전주 토 ~ 전주 금'],
        ['사전투표 20%', '빅크 · 방송 전주 금 17:00 ~ 방송 주 월 10:00'],
        ['생방송 투표 20%', '빅크 · 방송 당일 18:05 ~ 19:00 (사전 집계 점수에 더해요)'],
      ],
      partsSrc: '더쇼 공식 X 공지',
      pre: { cost: 'Free Gem 400 또는 Royal Gem 20 = 1표 · 무제한', appKey: 'bigc', app: '빅크(BIGC)', where: '빅크 → 빅크 초이스 → 1위 후보 사전투표', when: '방송 전주 금 17:00 ~ 월 10:00 (예: 402회 10/30 17:00 ~ 11/2 10:00)', wk: { from: '금 17:00', to: '월 10:00' },
        steps: ['빅크 앱 로그인', '빅크 초이스(BIGC CHOICE) → 생방송 1위 후보 부문', '리센느 투표 (그 주 출연 라인업 중 3팀이 1위 후보가 돼요)'],
        ticket: 'Free Gem 400개 또는 Royal Gem 20개 = 1표 (Free Gem은 출석 · 광고 · 미션으로 무료)', limit: '무제한 (가진 만큼)', weight: '사전 집계의 20%' },
      live: { cost: 'Free Gem 4,000 또는 Royal Gem 200 = 1표 · 무제한', appKey: 'bigc', app: '빅크(BIGC)', where: '빅크 → 실시간 투표 배너', when: '방송 당일 화 18:05 ~ 19:00', window: '18:05 ~ 19:00',
        steps: ['빅크 앱 홈 실시간 투표 배너', '리센느 투표'],
        ticket: 'Free Gem 4,000개 또는 Royal Gem 200개 = 1표 (사전투표의 10배)', limit: '무제한 (가진 만큼)', weight: '20% (사전 집계 점수에 더해요)' },
      tip: '방송 당일 출연한 가수만 집계하고, 결방이나 하이라이트 방송이면 집계하지 않아요. 3주 1위 곡은 트리플 크라운으로 다음 주부터 차트에서 빠져요. 음원 점수는 애플뮤직 글로벌 스트리밍, 팬 점수는 리센느 공식 유튜브 · 틱톡의 조회수 · 좋아요 · 댓글이에요. 사전투표 때 팬픽캠(직캠 주인공 멤버) 투표도 같이 열리고, 생방송 · 다시보기는 빅크 온(BIGC ON)에서 볼 수 있어요.',
      after: '방송 뒤 애프터 투표: 엔딩요정 · 핫스테이지 · 팬픽캠 주인공 (빅크)',
      links: [['SBS 더쇼 공식', 'https://programs.sbs.co.kr/fune/theshow/about/58354']] },
    { id: 'showchamp', span: '금~월', day: 3, name: '쇼챔피언', sub: 'SHOW CHAMPION', time: '17:00', end: '18:20', ch: 'MBC M',
      re: /쇼\s*챔피언|쇼챔|show\s*champion/i,
      chart: '음원 35 · 방송 20 · 사전투표 20 · 음반 15 · SNS 10 (%) · 실시간 투표 없음',
      parts: [
        ['음원 35%', '멜론 · 지니 · FLO · 벅스 주간 순위 합산 · 방송 전주 월 ~ 일'],
        ['방송 20%', '쇼챔피언 출연팀 기준 · 방송 당일 (MBC PLUS 방송 · 주간 아이돌 출연도 반영된다고 알려져 있어요)'],
        ['사전투표 20%', '아이돌챔프 글로벌 팬 투표 · 방송 전주 금 20:00 ~ 방송 주 월 14:59'],
        ['음반 15%', '한터 앨범 차트 · 방송 전주 월 ~ 일'],
        ['SNS 10%', '써클차트 · 유튜브 뮤직비디오 반영 · 방송 전주 월 ~ 일'],
      ],
      partsSrc: '쇼챔피언 공식 차트 산정 방식 안내',
      pre: { cost: '챔심 · 투표마다 필요 수량 달라요', appKey: 'idolchamp', app: '아이돌챔프(IDOLCHAMP)', where: '아이돌챔프 → Vote → SHOW CHAMPION 챔피언송', when: '방송 전주 금 20:00 ~ 월 14:59', wk: { from: '금 20:00', to: '월 14:59' },
        steps: ['아이돌챔프 앱 로그인 → 아래 Vote', 'SHOW CHAMPION 챔피언송 사전투표 배너', '리센느 곡 → 투표하기 → 챔심을 투표권으로 최대 교환 → 최대 투표'],
        ticket: '챔심 (투표마다 필요한 수가 다를 수 있어요). 루비챔심은 사라지지 않고, 타임챔심은 매달 1일에 사라져요',
        earn: ['출석: 1회 30타임챔심 + 출석 뒤 광고를 보면 10루비챔심', '룰렛(광고): 루비챔심 랜덤 · 하루 최대 10회', '퀴즈: 1회 30타임챔심 (최근 퀴즈 10개까지) · 5일 연속 100점이면 50루비챔심', '출석과 룰렛만 꾸준히 해도 안 사라지는 루비챔심이 쌓여요'],
        limit: '하루 최대 300 챔심까지 투표 (300/300) · 매일 다시 채워져요', qty: '하루 300', weight: '20% (실시간 투표가 없어서 팬 투표는 이게 전부)' },
      live: null,
      tip: '마감(월 14:59) 직전까지 표 차이가 벌어져요. 남은 챔심은 마감 전에 꼭 다 써 주세요. 후보는 정식 발매곡 · 팀당 1곡이고, 선공개곡 · 리메이크 · OST · 방송 프로그램 곡 등은 빠져요. 통산 3주 1위(트리플 챔피언) 곡도 빠지고, 방송 뒤 홈페이지에 TOP5 점수가 공개돼요.',
      },
    { id: 'mcountdown', span: '토~화', day: 4, name: '엠카운트다운', sub: 'M COUNTDOWN', time: '18:00', end: '19:30', ch: 'Mnet',
      // 결방: from ~ until (until 비우면 다시 시작 날짜 미정). 날짜가 지나면 저절로 원래대로 보여요
      re: /엠\s*카운트다운|엠카|m\s*countdown/i,
      chart: '음원 50 · 음반 15 · 글로벌 소셜 미디어 15 · 글로벌 팬 투표 10 · 엠넷 방송 10 (%)로 1위 후보 2팀 → 생방송 투표 10%를 더해 1위',
      parts: [
        ['음원 50%', '써클차트: Apple Music · Spotify · 멜론 · 벅스 · VIBE · 지니 · FLO · YouTube · 텐센트 뮤직 등'],
        ['음반 15%', '써클 앨범 차트 주간 판매량'],
        ['글로벌 소셜 미디어 15%', '유튜브 공식 MV · 숏폼 영상 · TikTok'],
        ['글로벌 팬 투표 10%', 'Mnet Plus 사전투표'],
        ['엠넷 방송 10%', 'Mnet 채널 방송 점수 (프로그램 속 MV 노출 · 출연 등)'],
        ['생방송 투표 10%', 'Mnet Plus · 1위 후보 2팀만'],
      ],
      partsSrc: 'Mnet 엠카운트다운 공식 차트 산정 비중 · 자료 제공: 써클차트, TikTok',
      pre: { cost: '무료 · 하루 5표', appKey: 'mnetplus', app: 'Mnet Plus', where: 'Mnet Plus → 투표 → 엠카운트다운 사전투표', when: '방송 전주 토 00:00 ~ 화 23:59 (월 11:00에 중간 집계 공개)', wk: { from: '토 00:00', to: '화 23:59' },
        steps: ['Mnet Plus 앱(또는 웹) 로그인', '투표 → 엠카운트다운 사전투표', '리센느 곡 투표'],
        ticket: '무료 (따로 모을 재화가 없어요)', limit: '하루 최대 5표 · 여러 팀 · 같은 팀 다시 투표 가능', qty: '하루 5표', weight: '10%' },
      live: { cost: '무료 · 최대 5표', appKey: 'mnetplus', app: 'Mnet Plus', where: 'Mnet Plus 홈 → MCOUNTDOWN → 실시간 투표', when: '1위 후보 발표 뒤 ~ 실시간 투표 끝날 때까지',
        steps: ['Mnet Plus 홈 "엠카운트다운 실시간 투표" 배너 (또는 MCOUNTDOWN 메뉴)', '실시간 투표', '리센느 투표'],
        ticket: '무료', limit: '최대 5표', qty: '5표', weight: '10% · 1위 후보 2팀만' },
      tip: '방송일 기준 최근 4주 안에 발매된 곡만 차트에 들어가요. 그해 트리플 크라운(3주 1위)을 한 곡은 집계에서 빠져요. 결방이면 순위를 집계하지 않지만 특집 방송을 하면 정상 집계해요. 출연하지 않아도 1위를 할 수 있어요.' },
    { id: 'musicbank', span: '일~수', day: 5, name: '뮤직뱅크', sub: 'MUSIC BANK', time: '17:05', end: '18:35', ch: 'KBS2',
      re: /뮤직\s*뱅크|뮤뱅|music\s*bank/i,
      chart: '디지털 음원 60 · 방송 횟수 20 · 글로벌 팬 투표 10 · 음반 5 · 소셜 미디어 5 (%) · 20만 점 만점',
      parts: [
        ['디지털 음원 60%', '멜론 · 지니 · FLO · VIBE · 벅스 1~100위 곡별 점유율 (12만 점)'],
        ['방송 횟수 20%', 'KBS TV(뉴스 제외) · KBS 유튜브 디지털 콘텐츠 출연 · KBS 2FM 7개 프로그램 라디오 (4만 점)'],
        ['글로벌 팬 투표 10%', '쿠궁(옛 팬캐스트) 사전투표 · 일 15:00 ~ 수 11:00, 그 주 금요일 방송에 바로 반영 (2만 점)'],
        ['음반 5%', '써클차트 앨범차트 (1만 점). 다른 음방은 1위를 만점으로 두고 판매량 비율로 점수를 주지만, 뮤뱅은 1만 점을 판매량 비율로 나눠 가져요 · 예) 50만 · 30만 · 10만 장이면 다른 음방(1,000점 만점) 1,000 · 600 · 200점, 뮤뱅 5,555 · 3,333 · 1,111점'],
        ['소셜 미디어 5%', '써클차트 소셜차트 2.0: 유튜브 뮤직비디오 조회수 · 틱톡 좋아요 지수 (1만 점)'],
      ],
      pre: { cost: '블루하트 · 골드하트 50 = 1표 · 무제한', appKey: 'coogoong', app: '쿠궁(옛 팬캐스트)', where: '쿠궁 → 투표 → 뮤직뱅크 사전투표', when: '매주 일 15:00 ~ 수 11:00 (회차별 마감 시각은 앱 공지 확인)', wk: { from: '일 15:00', to: '수 11:00' },
        steps: ['쿠궁 앱 로그인 (팬캐스트 계정 그대로 써요)', '투표 → 뮤직뱅크 사전투표', '리센느 → 하트로 투표'],
        ticket: '블루하트 또는 골드하트 50개 = 1표 (출석 · 광고 · 미션으로 모아요)', limit: '무제한 (가진 하트만큼)', weight: '10% (그 주 금요일 K-차트에 반영)' },
      live: null,
      tip: '컴백 첫 주에는 그 주 출연 가수 곡이 모두 사전투표 후보로 올라오지만, 음원 · 음반 점수가 없어 1위 후보는 될 수 없어요 (그래서 음총팀이 첫 주 투표를 쉬자고 공지할 수 있어요). 쿠궁은 팬캐스트가 2026년 7월에 바꾼 새 이름이에요 (같은 앱, 같은 계정). 방송 횟수에는 KBS TV와 함께 KBS 유튜브 콘텐츠 · KBS 2FM 라디오 출연도 들어가요.',
      links: [['KBS 뮤직뱅크 공식', 'https://program.kbs.co.kr/2tv/enter/musicbank/pc/']] },
    { id: 'musiccore', span: '화~목', day: 6, name: '쇼! 음악중심', sub: 'MUSIC CORE', time: '15:20', end: '16:40', ch: 'MBC',
      re: /음악\s*중심|음중|music\s*core/i,
      chart: '사전 점수(음원 50 · 음반 10 · 동영상 10 · 방송 횟수 5 · 시청자위원회 5 · 글로벌 투표 10 %)로 1위 후보 3팀 → 생방송 앱 투표 6 · 문자 투표 4 (%)를 더해 1위',
      parts: [
        ['음원 50%', '써클 디지털 차트 (다운로드 영향이 커요)'],
        ['음반 10%', '음반 점수'],
        ['동영상 10%', '뮤직비디오 등 영상 점수 (15세 등급에 안 맞는 MV는 빠져요)'],
        ['방송 횟수 5%', '방송 횟수 점수'],
        ['시청자위원회 5%', '시청자위원회 투표'],
        ['글로벌 투표 10%', '사전투표: 뮤빗 5 + 뮤니버스 5'],
        ['생방송 앱 투표 6%', '1위 후보 3팀만 · 뮤빗 · 뮤니버스'],
        ['생방송 문자 투표 4%', '1위 후보 3팀만 · #0505'],
      ],
      partsSrc: '2026년 5월 30일 방송부터',
      pre: { cost: '뮤빗 하트비트 3 · 뮤니버스 애드루미 5 = 1표 · 무제한', appKey: 'mubeat', appKeys: ['mubeat', 'muniverse'], app: '뮤빗 · 뮤니버스', short: '뮤빗·뮤니버스', where: '뮤빗 또는 뮤니버스 → 투표 → 쇼! 음악중심 글로벌 사전투표', when: '방송 주 화 18:00 ~ 목 11:00 (예: 968회 10/27 18:00 ~ 10/29 11:00)', wk: { from: '화 18:00', to: '목 11:00' },
        steps: ['뮤빗 → 투표 → 쇼! 음악중심 글로벌 사전투표 → 리센느', '뮤니버스 → Vote → 쇼! 음악중심 글로벌 사전투표 → 리센느'],
        ticket: '뮤빗 하트비트 3개 = 1표 · 뮤니버스 애드루미 5개 = 1표 (광고 · 미션 · 출석으로 무료)', limit: '무제한 (가진 만큼)', weight: '10% (뮤빗 5% + 뮤니버스 5%, 따로 계산돼서 두 앱 다 해야 해요)' },
      live: { cost: '뮤빗 투표권 1 (하트비트 30) · 뮤니버스 애드루미 50 또는 골드루미 60 = 1표 · 각 최대 5표', appKey: 'mubeat', appKeys: ['mubeat', 'muniverse'], app: '뮤빗 · 뮤니버스 · 문자', short: '앱 2개 · 문자', where: '뮤빗 · 뮤니버스 → 쇼! 음악중심 생방송 앱 투표 / 문자 #0505', when: '1위 후보 발표 뒤 ~ 약 16:10 (앱) · 약 15:35 ~ 16:20 (문자) · 회차마다 공지',
        steps: ['뮤빗 → 투표 → 쇼! 음악중심 → 생방송 앱 투표 → 리센느', '뮤니버스 → Vote → 쇼! 음악중심 생방송 앱 투표 → 리센느', '문자: #0505로 "리센느" 또는 후보 번호를 한 번만'],
        ticket: '뮤빗: 투표권 1장 = 1표 (하트비트 30개 = 투표권 1장, 방송 전에 미리 바꿔 두세요) · 뮤니버스: 애드루미 50개 또는 골드루미 60개 = 1표',
        limit: '뮤빗 · 뮤니버스 각각 최대 5표 · 문자는 번호당 1건 100원, 두 번 보내면 무효', qty: '앱 2개 + 문자', weight: '앱 6 : 문자 4' },
      tip: '방송일 기준 최근 9주 안에 발매된 정식 데뷔 가수의 곡 1곡만 들어가요. OST · 오디션 프로그램 곡 · MBC 심의 부적격 곡은 빠지고, 결방이나 녹화 방송이면 집계하지 않아요. 통산 3주 1위(트리플크라운)면 레전드 M-Chart로 명예 졸업해요. 리센느 공식 투표 안내에도 뮤빗과 뮤니버스가 함께 나와요. 뮤니버스에서는 매주 레전드 무대를 뽑는 STAGE M PICK 투표도 열려요.',
      sms: { to: '#0505', body: '리센느' },
      jury: { wk: { from: '수 09:00', to: '목 11:00' }, where: '음악중심 홈페이지' }, // 음총팀 음악방송 스케줄러 (2026-11)
      links: [['MBC 음악중심 공식', 'https://www.imbc.com/broad/tv/ent/musiccore/']] },
    { id: 'inkigayo', span: '월~금', day: 0, name: '인기가요', sub: 'INKIGAYO', time: '15:10', end: '16:40', ch: 'SBS',
      re: /인기가요|inkigayo/i,
      chart: '온라인 음원 50 · SNS 20 · 음반 10 · On-Air 10 · 시청자 사전투표 5 · 실시간 앱 투표 5 (%) · 부문별 1위 곡 만점 기준 차등 점유율',
      parts: [
        ['온라인 음원 50%', '멜론 · 지니 · FLO · Spotify · 150위까지 반영'],
        ['SNS 20%', '뮤직비디오 유튜브 조회수'],
        ['음반 10%', '써클 앨범 차트'],
        ['On-Air 10%', 'SBS TV · 라디오 방송 횟수'],
        ['시청자 사전투표 5%', 'LiNC 앱 · 방송 9일 전 월 12:00 ~ 금 23:59'],
        ['실시간 앱 투표 5%', '하이어 · 생방송 중'],
      ],
      partsSrc: '2024년 10월 6일 방송부터 · 집계 기간: 방송 전주 월 ~ 방송 주 월',
      pre: { cost: '팬포인트 30 또는 GEM 8 = 1표 · 하루 10표', appKey: 'linc', app: 'LiNC(링크)', where: 'LiNC → 투표 → 인기가요 사전투표', when: '방송 9일 전 월 12:00 ~ 금 23:59 · 그다음 주 일요일 방송에 반영 (예: 10/12 ~ 10/16 → 10/25 방송)', wk: { from: '월 12:00', to: '금 23:59', note: '다음 주 일요일 방송 반영' },
        steps: ['LiNC 앱 홈 "투표하기(Vote Now)"', '인기가요 사전투표', '리센느 → 팬포인트(또는 GEM)로 투표'],
        ticket: '팬포인트 30개 또는 GEM 8개 = 1표 (팬포인트는 광고를 보면 무료로 쌓여요)', limit: '하루 최대 10표', qty: '하루 10표', weight: '5%' },
      live: { cost: '루비 50 = 1표 · 최대 5표', appKey: 'higher', app: '하이어(HIGHER)', where: '하이어 → 홈 실시간 투표 배너', when: '생방송 중 ~ 방송 끝날 때까지',
        steps: ['하이어 앱 홈 실시간 투표 배너 (또는 아래 투표 아이콘)', '리센느 투표'],
        ticket: '루비 50개 = 1표 (루비는 광고를 보면 무료)', limit: '계정당 최대 5표', qty: '5표', weight: '5%' },
      tip: '음원 · SNS 비중이 가장 큰 음방이라 리센느 MV 유튜브 조회수가 특히 중요해요. 하이어에서 영상을 보면 써클 앨범 차트에도 반영돼요. 통산 3번 1위면 트리플 크라운으로 명예 졸업하고, 결방 · 녹화 방송이면 집계하지 않아요. OST는 집계하지 않아요.',
      after: '핫스테이지: 실시간 투표가 끝난 직후 ~ 수요일, 그날 출연 무대 중 최고의 무대 투표 (슈퍼스타 X) → 다음 주 방송에서 1~3위 발표',
      links: [['SBS 인기가요 공식', 'https://programs.sbs.co.kr/enter/gayo/main']] },
  ];
  // --- 편성표: 방송사 공식 편성표에서 3시간마다 받아 둔 날짜별 방송 시간 (data/onair.json, tools/crawl_onair.py) ---
  state.onair = null;
  function onairLoad() {
    if (state.onair) return;
    state.onair = { air: {}, loading: true };
    fetch(BASE + 'data/onair.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => { state.onair = { updated: d.updated || '', air: d.air || {} }; })
      .catch(() => { state.onair = { air: {}, error: 'fail' }; })
      .finally(() => (route().tab === 'music' ? render({ keepScroll: true }) : schRefresh()));
  }
  // --- 출연진: 방송사 공식 출연진 공지에서 3시간마다 받아 둔 리센느 출연 여부 (data/lineup.json, tools/crawl_lineup.py) ---
  state.lineup = null;
  function lineupLoad() {
    if (state.lineup) return;
    state.lineup = { shows: {}, loading: true };
    fetch(BASE + 'data/lineup.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => { state.lineup = { updated: d.updated || '', shows: d.shows || {} }; })
      .catch(() => { state.lineup = { shows: {}, error: 'fail' }; })
      .finally(() => (route().tab === 'music' ? render({ keepScroll: true }) : schRefresh()));
  }
  // 그날 방송: 편성표에 있으면 그 시간, 아직 없으면 평소 시간. moved = 평소보다 5분 넘게 당기거나 늦춤, off = 편성표에 그날 방송이 없음
  function airOf(m, date) {
    onairLoad();
    const a = ((state.onair.air || {})[m.id] || {})[date];
    if (!a || !a.start) return { time: m.time, end: m.end, off: !!(a && a.off) };
    return { time: a.start, end: a.end || m.end, moved: Math.abs(hmMin(a.start) - hmMin(m.time)) >= 5 };
  }
  // 오늘부터 가장 가까운 그 음방 방송일
  const nextAir = (m, t) => addDays(t, (m.day - dowOf(t) + 7) % 7);
  // 그 날 결방이면 결방 정보: 직접 적은 결방(MUSIC_SHOWS의 off) → 편성표에 그날 방송이 없을 때
  function offOn(m, date) {
    if (!m) return null;
    if (m.off && date >= m.off.from && (!m.off.until || date <= m.off.until)) return m.off;
    return airOf(m, date).off ? { title: `${mdw(date)} 방송은 결방이에요`, note: `${m.ch} 공식 편성표에 이날 방송이 없어요.`, short: `${md(date)} 결방`, auto: true } : null;
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
        <div class="mg-score-h"><h3>1위는 이렇게 정해져요</h3><span class="mg-fan">팬 투표 <b>${fan}${total !== 100 ? ` / ${total}` : ''}%</b></span></div>
        <p class="mg-how">${how}</p>
        <div class="mg-bar" role="img" aria-label="${esc(ps.map((x) => `${x.name} ${x.p}%`).join(', '))}">${ps.map((x) => `<i class="${x.c}" style="flex-grow:${x.p}"></i>`).join('')}</div>
        <ul class="mg-legend">${ps.map((x) => `<li class="${x.vote ? 'vote' : ''}"><i class="${x.c}"></i>${esc(x.name)} <b>${x.p}</b></li>`).join('')}</ul>
        <details class="mg-parts"><summary>항목별 기준 · 집계 기간</summary><dl>${ps.map((x) => `<dt>${esc(x.k)}</dt><dd>${esc(x.v)}</dd>`).join('')}</dl>${m.partsSrc ? `<small>${esc(m.partsSrc)}</small>` : ''}</details>
      </section>`;
    };
    const notes = (m) => {
      const list = (m.tip || '').split(/(?<=[.])\s+/).map((x) => x.trim()).filter(Boolean);
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
        ${o ? `<div class="mg-off" role="note"><b>${esc(o.title)}</b><p>${esc(o.note)}${o.auto ? '' : ' 그동안은 투표도 열리지 않아요.'}</p>${o.src ? `<a href="${esc(o.src)}" target="_blank" rel="noopener">관련 기사 ↗</a>` : ''}</div>` : ''}
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
  // [src/60-alliances.js] 연합&기타 탭: 연합 카드·플랫폼 바로가기
  // ---------- 연합 ----------
  function renderAlliances() {
    const t = today();
    const all = state.data.alliances;
    const { arg } = route();
    if (arg) state.allyView = 'guide';
    const view = state.allyView === 'guide' ? 'guide' : 'ally';
    const nG = state.data.guides.length;
    const head = `
      <section class="page-head"><h1>연합&amp;기타</h1></section>
      <div class="seg ally-seg" role="tablist" aria-label="연합 / 가이드">
        <button type="button" role="tab" data-allyview="ally" aria-selected="${view === 'ally'}" class="${view === 'ally' ? 'on' : ''}">연합 <i class="seg-n">${all.length}</i></button>
        <button type="button" role="tab" data-allyview="guide" aria-selected="${view === 'guide'}" class="${view === 'guide' ? 'on' : ''}">플랫폼 바로가기 <i class="seg-n">${nG}</i></button>
      </div>`;
    if (view === 'guide') return `${head}${otherGuides()}${sourceLine()}`;
    if (!all.length) return `${head}<div class="card empty"><strong>등록된 연합이 없어요</strong></div>${sourceLine()}`;
    const order = { live: 0, soon: 1, tbd: 2, end: 3 };
    const sorted = all.slice().sort((a, b) => order[allyStatus(a, t)] - order[allyStatus(b, t)] || (a.end || '9').localeCompare(b.end || '9'));
    // 주고받는 것 한 줄: 무엇을 · 어떤 투표/스밍 · 기간·횟수 (해시태그·인증은 오늘 화면에 있음)
    const ex = (it) => {
      const st = itemStatus(it, t);
      // 기간은 할 일 탭처럼 시작 ~ 끝 (하루짜리는 그날)
      const range = it.repeat === '1회' ? mdw(it.start || it.end) : it.start || it.end ? `${it.start ? md(it.start) : ''} ~ ${it.end ? md(it.end) : ''}`.trim() : '';
      const when = it.tbd ? '기간 미정' : st === 'end' ? '끝남' : range;
      const sub = [it.qty, when].filter(Boolean).join(' · ');
      return `<li class="ex ${st === 'end' ? 'is-end' : ''}">
          ${it.kind === 'get' && it.camp && !bareTitle(it)
            ? `<b class="ex-title">${esc(it.camp)}</b>`
            : `<span class="ex-camp" style="--c:${campColor(it.camp)}">${esc(it.camp || '기타')}</span><b class="ex-title">${esc(it.kind === 'get' ? bareTitle(it) || it.title : stripCamp(it))}</b>`}
          ${sub ? `<span class="ex-sub num">${esc(sub)}</span>` : ''}
        </li>`;
    };
    const col = (a, kind) => {
      const list = a.items.filter((x) => x.kind === kind);
      return `<div class="ex-col ${kind}">
          <h3>${kind === 'give' ? '줄 것' : '받을 것'}<i>${list.length}</i></h3>
          ${list.length ? `<ul>${list.map(ex).join('')}</ul>` : '<p class="ex-none">없음</p>'}
        </div>`;
    };
    const statusBadge = { live: '<span class="status live">진행중</span>', soon: '<span class="status soon">시작 전</span>', tbd: '<span class="status tbd">협의중</span>', end: '<span class="status end">끝남</span>' };
    const counts = { live: 0, soon: 0, tbd: 0, end: 0 };
    all.forEach((a) => { counts[allyStatus(a, t)]++; });
    const F = [['', '전체', all.length], ['live', '진행중', counts.live], ['soon', '시작 전', counts.soon], ['tbd', '협의중', counts.tbd], ['end', '끝남', counts.end]].filter((x) => x[0] === '' || x[2] > 0);
    const f = F.some((x) => x[0] === state.allyFilter) ? state.allyFilter : '';
    const list = sorted.filter((a) => !f || allyStatus(a, t) === f);
    const card = (a) => {
      const period = a.start || a.end ? `${a.start ? md(a.start) : ''} ~ ${a.end ? md(a.end) : ''}` : '';
      const extra = [
        // 총공 계정이 여러 개면 칸에 띄어 써요 (예: 국내 · 해외 총공팀)
        ...String(a.account || '').split(/\s+/).filter(Boolean).map((h) => (accountUrl(h) ? `<a class="xlink" href="${esc(accountUrl(h))}" target="_blank" rel="noopener"><i aria-hidden="true">X</i>${esc(h)}<span class="sr">(X에서 열기)</span></a>` : esc(h))),
        a.state ? esc(a.state) : '',
        a.link ? `<a href="${esc(a.link)}" target="_blank" rel="noopener">공지 ↗</a>` : '',
      ].filter(Boolean).join(' · ');
      return `
        <article class="card ally2 st-${allyStatus(a, t)}">
          <header class="ally2-head">
            <div><h2>리센느 × ${esc(a.artist)}</h2><p class="num">${a.fandom ? `${esc(a.fandom)}` : ''}${a.fandom && period ? ' · ' : ''}${period}</p></div>
            ${statusBadge[allyStatus(a, t)]}
          </header>
          <div class="ex-cols">${col(a, 'give')}${col(a, 'get')}</div>
          ${extra || a.memo ? `<footer class="ally2-foot">${extra}${a.memo ? `${extra ? '<br>' : ''}${esc(a.memo)}` : ''}</footer>` : ''}
        </article>`;
    };
    return `
      ${head}
      <div class="filter-chips" role="group" aria-label="상태로 걸러 보기">
        ${F.map(([id, label, n]) => `<button type="button" class="fchip ${f === id ? 'on' : ''}" data-allyf="${id}" aria-pressed="${f === id}">${label} <span class="num">${n}</span></button>`).join('')}
      </div>
      <div class="ally2-list">${list.map(card).join('')}</div>
      ${sourceLine()}`;
  }

  // 연합&기타 아래: 플랫폼 바로가기 (음방 제외)
  function otherGuides() {
    const all = state.data.guides;
    const cats = ['전체', ...new Set(all.map((g) => g.category))];
    if (!cats.includes(state.guideFilter)) state.guideFilter = '전체';
    const list = all.filter((g) => state.guideFilter === '전체' || g.category === state.guideFilter);
    const t = today();
    const body = list.map((g) => {
      const using = state.data.items.filter((x) => x.guide === g && ['live', 'soon'].includes(itemStatus(x, t)));
      // 링크 + 이 플랫폼을 쓰는 일정만. 받을 것은 상마다 한 줄로 (누가 해 주는지)
      const mine = using.filter((x) => x.kind !== 'get');
      const gets = {};
      using.filter((x) => x.kind === 'get').forEach((x) => { (gets[x.camp || ''] = gets[x.camp || ''] || []).push(x); });
      const rows = mine.map((x) => `<li>${kindPill(x)} ${campBadge(x.camp, true)} ${esc(stripCamp(x))} <span class="muted">${periodText(x)}</span></li>`)
        .concat(Object.values(gets).map((l) => `<li>${kindPill(l[0])} ${campBadge(l[0].camp, true)} ${esc([...new Set(l.map(whoName))].join(' · '))}${l.length > 1 ? ` <span class="muted">${l.length}팀</span>` : ''} <span class="muted">${periodText(l[0])}</span></li>`));
      return `
      <article class="card guide gl" id="guide-${esc(g.id)}">
        <div class="gl-head">
          <div><h2>${esc(g.platform)}</h2><p class="gl-sub">${esc(g.category)}</p></div>
          ${g.link ? `<a class="btn small primary" href="${esc(g.link)}" target="_blank" rel="noopener" aria-label="${esc(g.platform)} 바로가기">바로가기 ↗</a>` : ''}
        </div>
        ${rows.length ? `<h3>이 플랫폼을 쓰는 일정</h3><ul class="using">${rows.join('')}</ul>` : g.category === '음총팀 가이드' ? '' : '<p class="gl-none">지금 이 플랫폼을 쓰는 일정은 없어요</p>'}
      </article>`;
    }).join('');
    return `
      <section class="og-section" id="guide-etc">
        ${toolsBar()}
        ${cats.length > 2 ? `<div class="filter">${cats.map((c) => `<button type="button" data-filter="${esc(c)}" class="${c === state.guideFilter ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
        <div class="guides">${body || '<div class="card empty"><strong>등록된 가이드가 없어요</strong></div>'}</div>
      </section>`;
  }
  // [src/70-tools.js] 도구: 알림(토스트)·복사·인증샷 워터마크
  // ---------- 복사 알림 ----------
  let toastTimer = 0;
  function toast(msg) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }
  async function copyText(text, label) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* 무시 */ }
      ta.remove();
    }
    toast(label ? `${label}를 복사했어요` : `${text} 복사했어요`);
  }

  // ---------- 체크 기록 옮기기 ----------
  // 체크 기록은 그 브라우저에만 저장돼요. 폰을 바꾸거나, 아이폰에서 사파리 ↔ 홈 화면 앱처럼
  // 저장 공간이 다른 곳으로 옮길 때 코드 한 줄로 옮겨요. 서버로 보내지 않아요.
  const XFER_HEAD = 'RS1.';
  const b64enc = (s) => { const b = new TextEncoder().encode(s); let t = ''; b.forEach((x) => { t += String.fromCharCode(x); }); return btoa(t); };
  const b64dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
  const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length < 80) : []);
  function recordDays() {
    try { return Object.keys(localStorage).filter((k) => k.startsWith('rs-check:') && readSet(k).size).map((k) => k.slice(9)); } catch (e) { return []; }
  }
  function exportRecords() {
    const out = { v: 1, checks: {}, once: [...readSet(ONCE_KEY)], done: [...readSet(DONE_KEY)] };
    recordDays().forEach((d) => { out.checks[d] = [...readSet(ckey(d))]; });
    return XFER_HEAD + b64enc(JSON.stringify(out));
  }
  // 합치기: 이 기기에 있던 기록은 지우지 않고 더하기만 해요
  function importRecords(code) {
    const raw = String(code || '').replace(/\s+/g, '');
    if (!raw.startsWith(XFER_HEAD)) throw new Error('head');
    const d = JSON.parse(b64dec(raw.slice(XFER_HEAD.length)));
    if (!d || d.v !== 1 || typeof d.checks !== 'object') throw new Error('shape');
    const add = (k, list) => {
      const s = readSet(k);
      list.forEach((x) => s.add(x));
      localStorage.setItem(k, JSON.stringify(k === DONE_KEY ? [...s].sort().slice(-400) : [...s]));
    };
    let days = 0;
    Object.entries(d.checks).forEach(([day, ids]) => { if (isDay(day) && strList(ids).length) { add(ckey(day), strList(ids)); days++; } });
    add(ONCE_KEY, strList(d.once));
    add(DONE_KEY, strList(d.done).filter(isDay));
    return days;
  }
  function openTransfer() {
    let m = document.getElementById('xfer');
    if (!m) {
      m = document.createElement('div');
      m.id = 'xfer'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', '체크 기록 옮기기');
      m.innerHTML = `
        <div class="modal-box">
          <div class="modal-head"><h2>체크 기록 옮기기</h2><button type="button" class="icon-btn" data-modal-close aria-label="닫기">닫기</button></div>
          <p class="muted">체크 기록은 이 브라우저에만 있어요. 폰을 바꾸거나 사파리에서 홈 화면 앱으로 옮길 때 써요.</p>
          <div class="xfer-step">
            <h3>1. 지금 기기에서 코드 복사</h3>
            <button type="button" class="btn" id="xferCopy">기록 코드 복사</button>
            <p class="xfer-info" id="xferInfo"></p>
          </div>
          <div class="xfer-step">
            <h3>2. 새 기기에서 붙여 넣기</h3>
            <label class="field"><span class="sr">기록 코드</span>
              <textarea id="xferCode" rows="3" placeholder="RS1.로 시작하는 코드" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
            </label>
            <button type="button" class="btn primary" id="xferApply">가져오기</button>
            <p class="xfer-info" id="xferMsg" role="status"></p>
          </div>
        </div>`;
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-modal-close]')) hideModal(m); });
      m.querySelector('#xferCopy').addEventListener('click', () => copyText(exportRecords(), '기록 코드'));
      m.querySelector('#xferApply').addEventListener('click', () => {
        const msg = m.querySelector('#xferMsg');
        try {
          const n = importRecords(m.querySelector('#xferCode').value);
          msg.textContent = `${n}일 치 기록을 가져왔어요.`;
          msg.classList.remove('err');
          m.querySelector('#xferCode').value = '';
          render({ keepScroll: true });
        } catch (err) {
          msg.textContent = '코드를 읽지 못했어요. 처음부터 끝까지 그대로 붙여 넣어 주세요.';
          msg.classList.add('err');
        }
      });
    }
    const n = recordDays().length;
    m.querySelector('#xferInfo').textContent = n ? `이 기기에 체크한 날 ${n}일` : '이 기기에는 아직 체크 기록이 없어요';
    m.querySelector('#xferMsg').textContent = '';
    showModal(m);
  }

  // ---------- 인증샷 워터마크 (도용 방지) ----------
  // 사진은 기기 안에서만 처리하고 어디에도 보내지 않음
  let wmFiles = [];
  function openWatermark() {
    let m = document.getElementById('wm');
    if (!m) {
      m = document.createElement('div');
      m.id = 'wm'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', '인증샷 워터마크');
      m.innerHTML = `
        <div class="modal-box">
          <div class="modal-head"><h2>인증샷 워터마크</h2><button type="button" class="icon-btn" data-wm-close aria-label="닫기">닫기</button></div>
          <p class="muted">인증 사진에 내 닉네임을 비스듬히 반복해서 새겨 무단 도용을 막아요. 사진은 내 기기 안에서만 처리돼요 (서버 전송 없음).</p>
          <label class="field">내 닉네임 또는 X 아이디
            <input type="text" id="wmName" maxlength="30" placeholder="@my_id" autocomplete="off">
          </label>
          <label class="drop">
            <input type="file" id="wmFile" accept="image/*" multiple hidden>
            <span>사진 선택 (1~3장)</span>
            <small>여러 장이면 위아래로 이어 붙여요 · PC에선 Ctrl+V로 붙여넣기도 돼요</small>
          </label>
          <div id="wmOut" class="wm-out"></div>
        </div>`;
      document.body.appendChild(m);
      const name = m.querySelector('#wmName');
      try { name.value = localStorage.getItem('rs-wm-name') || ''; } catch (e) { /* 무시 */ }
      name.addEventListener('input', () => {
        try { localStorage.setItem('rs-wm-name', name.value); } catch (e) { /* 무시 */ }
        if (wmFiles.length) makeWatermark();
      });
      m.querySelector('#wmFile').addEventListener('change', (e) => { wmFiles = [...e.target.files].slice(0, 3); makeWatermark(); });
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-wm-close]')) hideModal(m); });
      document.addEventListener('paste', (e) => {
        if (!m.classList.contains('show')) return;
        const imgs = [...(e.clipboardData ? e.clipboardData.items : [])].filter((x) => x.type.startsWith('image/')).map((x) => x.getAsFile());
        if (imgs.length) { wmFiles = imgs.slice(0, 3); makeWatermark(); }
      });
    }
    showModal(m);
  }
  const loadImg = (file) => new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
  // 만든 사진 보여 주고 저장 버튼
  function imageResult(out, blob, fname, alt) {
    const url = URL.createObjectURL(blob);
    const file = () => new File([blob], fname, { type: blob.type });
    const canShare = navigator.canShare && navigator.canShare({ files: [file()] });
    // 아이폰: 공유 창의 '이미지 저장'으로 사진 앱에 넣음 / 안드로이드: 갤러리 'Download' 앨범
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const toPhotos = ios && canShare;
    out.innerHTML = `
      <img src="${url}" alt="${alt}">
      <div class="proof-actions">
        ${toPhotos
          ? `<button type="button" class="btn small primary" data-imgshare>사진 앱에 저장</button><a class="btn small" href="${url}" download="${fname}">파일로 저장</a>`
          : `<a class="btn small primary" href="${url}" download="${fname}">사진 저장</a>${canShare ? '<button type="button" class="btn small" data-imgshare>공유하기</button>' : ''}`}
      </div>
      <p class="muted">${toPhotos
        ? '"사진 앱에 저장"을 누르고, 뜨는 창에서 <b>이미지 저장</b>을 누르면 사진 앱(갤러리)에 들어가요. 사진을 길게 눌러 "사진 앱에 추가"를 눌러도 돼요.'
        : '저장한 사진은 갤러리의 "Download(다운로드)" 앨범에 있어요. 저장이 안 되면 사진을 길게 눌러 저장하세요.'}</p>`;
    const sh = out.querySelector('[data-imgshare]');
    if (sh) sh.addEventListener('click', () => navigator.share({ files: [file()] }).catch(() => {}));
  }

  async function makeWatermark() {
    const out = document.getElementById('wmOut');
    const name = (document.getElementById('wmName').value || '').trim();
    if (!wmFiles.length) return;
    if (!name) { out.innerHTML = '<p class="caution">닉네임을 먼저 적어 주세요.</p>'; return; }
    out.innerHTML = '<p class="muted">만드는 중…</p>';
    try {
      const imgs = await Promise.all(wmFiles.map(loadImg));
      const W = Math.min(1080, Math.max(...imgs.map((i) => i.naturalWidth)));
      const hs = imgs.map((i) => Math.round(i.naturalHeight * (W / i.naturalWidth)));
      const H = hs.reduce((a, b) => a + b, 0);
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      let y = 0;
      imgs.forEach((img, n) => { g.drawImage(img, 0, y, W, hs[n]); y += hs[n]; });
      // 30° 대각선, 줄마다 엇갈리게(지그재그) 반복
      const fs = Math.max(18, Math.round(W * 0.042));
      const text = name;
      g.save();
      g.translate(W / 2, H / 2);
      g.rotate(-Math.PI / 6);
      g.font = `800 ${fs}px "Pretendard Variable", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const stepX = g.measureText(text).width + fs * 2.2;
      const stepY = fs * 3.4;
      const R = Math.hypot(W, H);
      let row = 0;
      for (let yy = -R; yy < R; yy += stepY, row++) {
        for (let xx = -R + (row % 2 ? stepX / 2 : 0); xx < R; xx += stepX) {
          // 테두리 없이: 흰 글자 + 아주 옅은 그림자 (밝은 사진에서도 보이게)
          g.shadowColor = 'rgba(0,0,0,.18)';
          g.shadowBlur = fs / 4;
          g.fillStyle = 'rgba(255,255,255,.5)';
          g.fillText(text, xx, yy);
        }
      }
      g.restore();
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
      imageResult(out, blob, `인증_${today()}.jpg`, '워터마크를 넣은 인증샷');
    } catch (e) {
      out.innerHTML = '<p class="caution">사진을 읽지 못했어요. 다른 사진으로 해 주세요.</p>';
    }
  }
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
  function route() {
    const path = decodeURIComponent(location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : '').replace(/\/+$/, '').replace(/index\.html$/, '');
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
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
  function go(tab, arg, replace) {
    const url = urlFor(tab, arg);
    if (url !== location.pathname + location.hash) history[replace ? 'replaceState' : 'pushState'](null, '', url);
    setTitle(tab);
    if (tab === 'alliances' && arg) state.guideFilter = '전체';
    if (tab === 'today') state.viewDate = ''; // 오늘 탭을 누르면 다시 오늘로
    render();
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
    document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
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
      location.href = `intent://post?message=${msg}${reply}#Intent;scheme=twitter;package=com.twitter.android;S.browser_fallback_url=${encodeURIComponent(href)};end;`;
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
    const f = e.target.closest('[data-filter]');
    if (f) { state.guideFilter = f.dataset.filter; render({ keepScroll: true }); }
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
    go(rest || 'today', decodeURIComponent(u.hash.slice(1)) || undefined);
  });
  window.addEventListener('popstate', () => { setTitle(route().tab); render(); });
  window.addEventListener('hashchange', () => {
    normalizeUrl();
    if (route().tab === 'alliances' && route().arg) state.guideFilter = '전체';
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
  // 오프라인에서도 열리게 (https 또는 localhost에서만)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(() => {}); });
  }
})();
