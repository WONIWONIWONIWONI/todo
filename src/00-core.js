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
    [/음방|음악\s*방송/, '음방 투표'],
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
  const CAMP_ORDER = ['MMA 글로벌 TOP10', 'MMA TOP10', 'MAMA 팬 초이스 2차', 'MMA 올해의 신인', 'MMA 올해의 베스트송', "MAMA KCONERs' Choice", '퍼스트브랜드 대상', 'AAA 인기상', '엠카 사전투표', 'MV 스밍', '음원 스밍', '음방 투표', '음방 실시간 투표', '음방 사전투표', '컴백', '컴백 지원'];
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
    // 음방 주간 달력 (sheet-templates/음방달력.csv) — 그림 일정표를 옮긴 것, 할 일은 안 만들어요
    //   구분: 방송 / 생방송투표 / 사전투표 / 시청자위원회 / 안내
    const calDt = (v) => { const m = String(v || '').match(/(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?/); return m ? { date: m[1], time: m[2] ? m[2].padStart(5, '0') : '' } : null; };
    const musicCal = (raw.musicCal ? toObjects(raw.musicCal) : []).map((r, i) => {
      const g = r['구분'] || '';
      const start = calDt(r['시작']);
      return {
        id: r['아이디'] || `C${i + 1}`,
        show: String(r['음방'] || '').trim(),
        kind: /안내/.test(g) ? 'note' : /생방|실시간/.test(g) ? 'live' : /시청자/.test(g) ? 'jury' : /사전/.test(g) ? 'pre' : 'air',
        start, end: calDt(r['종료']) || start,
        app: r['앱'] || '', memo: r['메모'] || '',
      };
    }).filter((r) => r.start);
    return { alliances, items, guides, music, musicCal };
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
      const limit = addDays(today(), -60);
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
      const raw = { alliances, tasks, guides, music: (window.SAMPLE_DATA || {}).music || '', musicCal: (window.SAMPLE_DATA || {}).musicCal || '' };
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
