(function () {
  'use strict';

  const CFG = window.SITE_CONFIG || {};
  const TZ = 'Asia/Seoul';
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const PALETTE = ['#7c5cff', '#ff7aa8', '#3bb8a6', '#f4a13b', '#4a90e2', '#c46bd8', '#e0604f', '#6cbf4a'];
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
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
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
  const lines = (v) => String(v || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  function imgUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    const drive = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/);
    if (drive) return `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w1000`;
    if (/^https?:\/\//i.test(u)) return u;
    if (!u.includes(':') && /^[\w\-./가-힣 ]+$/.test(u)) return u;
    return '';
  }
  const linkUrl = (u) => { const s = String(u || '').trim(); return /^https?:\/\//i.test(s) ? s : ''; };
  function accountUrl(h) {
    h = String(h || '').trim();
    if (/^https?:\/\//i.test(h)) return h;
    const m = h.replace(/^@/, '');
    return /^\w{1,30}$/.test(m) ? 'https://x.com/' + m : '';
  }
  // ---------- 투표 종류(캠페인) ----------
  // 시트에 "2026 MMA GLOBAL TOP 10", "글로벌탑텐"처럼 달리 적어도 같은 이름으로 묶음
  const CAMP_RULES = [
    [/글로벌\s*탑\s*텐|글로벌\s*top\s*10|global\s*top\s*10|mma\s*top\s*10/i, 'MMA 글로벌 TOP10'],
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
  const CAMP_COLORS = {
    'MMA 글로벌 TOP10': '#b8336a',
    'MAMA 팬 초이스 2차': '#0b6e99',
    'MMA 올해의 신인': '#a15c07',
    'MMA 올해의 베스트송': '#2f7d4f',
    "MAMA KCONERs' Choice": '#2f5fb3',
    'AAA 인기상': '#b3261e',
    '엠카 사전투표': '#12756b',
    'MV 스밍': '#8a4b2a',
    '음원 스밍': '#5b6b2f',
    '음방 투표': '#6b5b3e',
    '음방 실시간 투표': '#c2410c',
    '음방 사전투표': '#0f766e',
    '컴백': '#374151',
    '컴백 지원': '#6b7280',
  };
  // 화면에 보이는 순서: 위 목록 순서대로, 모르는 종류는 뒤로, 종류 없는 항목은 맨 뒤
  const CAMP_ORDER = Object.keys(CAMP_COLORS);
  const campOrder = (c) => (!c ? 999 : CAMP_ORDER.includes(c) ? CAMP_ORDER.indexOf(c) : 500);
  const CAMP_FALLBACK =['#0e7490', '#8a5a00', '#3f7d3a', '#9b3d3d', '#4b6584', '#7a5c2e'];
  function campColor(c) {
    if (CAMP_COLORS[c]) return CAMP_COLORS[c];
    let h = 0;
    for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return CAMP_FALLBACK[h % CAMP_FALLBACK.length];
  }
  const campBadge = (c, small) => (c
    ? `<span class="camp ${small ? 'sm' : ''}" style="--cc:${campColor(c)}"><i class="camp-dot"></i>${esc(c)}</span>`
    : '');

  const tagsOf = (v) => String(v || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map((s) => (s[0] === '#' ? s : '#' + s));

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
      color: /^#?[0-9a-f]{3,8}$/i.test(r['색상']) ? (r['색상'][0] === '#' ? r['색상'] : '#' + r['색상']) : PALETTE[i % PALETTE.length],
      link: linkUrl(r['공지링크']),
      memo: r['메모'],
      items: [],
    }));
    const allyMap = Object.fromEntries(alliances.map((a) => [a.id, a]));

    const guides = toObjects(raw.guides).map((r, i) => ({
      id: r['아이디'] || `g${i + 1}`,
      platform: r['플랫폼'] || '(플랫폼)',
      category: r['분류'] || '기타',
      where: r['투표위치'],
      steps: lines(r['방법']),
      proof: lines(r['인증방법']),
      image: imgUrl(r['캡처예시']),
      link: linkUrl(r['바로가기']),
      caution: r['주의사항'],
    }));
    const guideMap = Object.fromEntries(guides.map((g) => [g.id, g]));

    const items = toObjects(raw.tasks).map((r, i) => {
      const kindRaw = r['구분'] || '';
      const kind = /받/.test(kindRaw) ? 'get' : /줄|주는|해주|give/i.test(kindRaw) ? 'give' : 'self';
      const daysText = r['요일'] || '';
      const days = DOW.map((d, n) => (daysText.includes(d) ? n : -1)).filter((n) => n >= 0);
      let repeat = (r['반복'] || '').replace(/\s/g, '');
      if (/1회|한번|하루/.test(repeat)) repeat = '1회';
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
        proofLinks: String(r['인증링크'] || '').split(/\s+/).map(linkUrl).filter(Boolean).map((u) => ({
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
    // 음방 출연·사전투표 (sheet-templates/음방.csv)
    //   구분: 출연 / 1위후보 → 방송일 / 사전투표 → 시작·종료 ("2026-11-04 23:59")
    const music = (raw.music ? toObjects(raw.music) : []).map((r, i) => {
      const dt = (v) => { const m = String(v || '').match(/(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?/); return m ? { date: m[1], time: m[2] ? m[2].padStart(5, '0') : '' } : null; };
      return {
        id: r['아이디'] || `M${i + 1}`,
        show: String(r['음방'] || '').trim(),
        kind: /사전/.test(r['구분'] || '') ? 'pre' : /1위|후보/.test(r['구분'] || '') ? 'top' : 'live',
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
    if (it.start && it.end) return `${md(it.start)} ~ ${md(it.end)}`;
    if (it.end) return `~ ${md(it.end)}`;
    return `${md(it.start)} ~`;
  }
  function statusPill(it, d) {
    const st = itemStatus(it, d);
    if (st === 'live') return `<span class="status live">진행중${it.end && it.repeat !== '1회' ? ` · ${dday(d, it.end)}` : ''}</span>`;
    if (st === 'soon') return `<span class="status soon">${diffDays(d, it.start)}일 후 시작</span>`;
    if (st === 'tbd') return '<span class="status tbd">협의중</span>';
    return '<span class="status end">끝남</span>';
  }
  const todosFor = (d) => state.data.items.filter((x) => x.kind !== 'get' && itemOn(x, d)).concat(musicTodos(d));
  const getsFor = (d) => state.data.items.filter((x) => x.kind === 'get' && itemOn(x, d));

  // ---------- 체크 상태 (각자 브라우저에 저장) ----------
  const ckey = (date) => 'rs-check:' + date;
  function getChecks(date) {
    try { return new Set(JSON.parse(localStorage.getItem(ckey(date)) || '[]')); } catch (e) { return new Set(); }
  }
  function toggleCheck(date, id) {
    const s = getChecks(date);
    s.has(id) ? s.delete(id) : s.add(id);
    try { localStorage.setItem(ckey(date), JSON.stringify([...s])); } catch (e) { /* 저장 불가 환경 */ }
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

  // ---------- 화면 조각 ----------
  const kindPill = (it) => `<span class="kind ${it.kind}">${KIND[it.kind].label}</span>`;
  const whoTag = (it) => it.ally
    ? `<span class="tag" style="--c:${esc(it.ally.color)}"><i class="dot"></i>${esc(it.ally.artist)}</span>`
    : '<span class="tag"><i class="dot" style="--c:var(--accent)"></i>리센느 자체</span>';
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
  const whoName = (it) => (it.ally ? it.ally.artist : '리센느');
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
        ${it.memo ? `<p class="task-memo">${esc(it.memo)}</p>` : ''}
        ${tagsHtml(it.tags)}
        ${actions ? `<div class="task-actions">${actions}</div>` : ''}
        ${withProof ? proofBlock(it) : ''}
      </div>`;
  }
  function todoRow(it, date, checks) {
    const done = checks.has(it.id);
    const open = state.open.has(it.id);
    const rid = 'm-' + it.id.replace(/[^\w-]/g, '');
    return `
      <li class="row ${done ? 'done' : ''} ${open ? 'open' : ''}" style="--cc:${campColor(it.camp || '')}">
        <div class="row-main">
          <button class="check" type="button" data-check="${esc(it.id)}" data-date="${date}" aria-pressed="${done}" aria-label="${esc(it.title)} 완료 표시">
            <svg viewBox="0 0 24 24"><path d="M5 12.5l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="row-head" type="button" data-open="${esc(it.id)}" aria-expanded="${open}" aria-controls="${rid}">
            <span class="row-text">
              <span class="row-title">${esc(it.title)}</span>
              <span class="row-sub">${it.music ? `<i class="dot" style="--c:#c2410c"></i>${esc(it.platform)}<i class="sep">·</i>${esc(it.window)}` : `<i class="dot" style="--c:${it.ally ? esc(it.ally.color) : 'var(--accent)'}"></i>${esc(whoName(it))}${it.camp ? `<i class="sep">·</i>${esc(it.camp)}` : ''}`}</span>
            </span>
            ${rowEnd(it, date)}
            ${chevron}
          </button>
        </div>
        ${open ? `<div id="${rid}">${rowMore(it, date, done, true)}</div>` : ''}
      </li>`;
  }

  // 인증 칸: 인증 방법 + X·구글폼·카톡 버튼 (X는 해시태그만 자동 입력)
  const isMusicWave = (it) => /뮤직\s*웨이브/.test(it.platform || '') || (it.guide && it.guide.id === 'musicwave');
  function proofBlock(it) {
    // 뮤직웨이브는 X 인증이 필요 없음
    const tweet = it.tags.length && (it.proof || it.proofLinks.length) && !isMusicWave(it)
      ? `https://x.com/intent/post?text=${encodeURIComponent(it.tags.join('\n'))}`
      : '';
    if (!it.proof && !it.proofLinks.length && !tweet) return '';
    const alt = it.proofLinks;
    const btns = [
      tweet ? `<a class="btn small proof tw" href="${esc(tweet)}" target="_blank" rel="noopener">X 인증 ↗</a>` : '',
      it.tags.length && tweet ? `<button type="button" class="btn small" data-copy="${esc(it.tags.join('\n'))}" data-copy-label="태그">태그 복사</button>` : '',
    ].join('');
    return `
      <div class="proof-block">
        <p><b>인증</b> ${esc(it.proof || '완료 화면을 날짜가 보이게 캡처')}</p>
        ${btns ? `<div class="proof-actions">${btns}</div>` : ''}
        ${alt.length ? `
          <p class="proof-alt">${tweet ? '서치밴이거나 X 작성이 어려우면 (둘 중 하나):' : '인증하기:'}</p>
          <div class="proof-actions">${alt.map((p) => `<a class="btn small proof" href="${esc(p.url)}" target="_blank" rel="noopener">${p.label} ↗</a>`).join('')}</div>` : ''}
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
  };
  const toolsBar = (title) => `
    ${title ? `<h2 class="section-title">${title}</h2>` : ''}
    <div class="tool-tiles" role="group" aria-label="인증 도구">
      <button type="button" class="ttile" data-sban>${IC.search}<b>서치밴 확인</b><small>내 글이 보이나</small></button>
      <button type="button" class="ttile" data-wm>${IC.mark}<b>인증샷 워터마크</b><small>사진 도용 막기</small></button>
      <button type="button" class="ttile" data-install>${IC.home}<b>앱처럼 쓰기</b><small>홈 화면에 추가</small></button>
    </div>`;

  // ---------- 처음 온 사람을 위한 사용법 (닫으면 다시 안 보임, 맨 아래에서 다시 열기) ----------
  const introSeen = () => { try { return localStorage.getItem('rs-intro') === '1'; } catch (e) { return true; } };
  const introCard = () => (introSeen() ? '' : `
    <section class="intro" aria-labelledby="intro-h">
      <div class="intro-head"><h2 id="intro-h">처음이라면 이렇게 써요</h2><button type="button" class="intro-x" data-intro-close aria-label="사용법 닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <ol class="intro-steps">
        <li><span class="intro-ic"><i class="demo-check"></i></span><span><b>끝낸 일은 동그라미 체크</b><small>날마다 새로 비워져요. 기록은 내 휴대폰에만 남아요.</small></span></li>
        <li><span class="intro-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></span><span><b>줄을 누르면 방법이 펼쳐져요</b><small>기간 · 투표 위치 · 인증 방법까지 한 번에.</small></span></li>
        <li><span class="intro-ic"><i class="demo-go">하러 가기</i></span><span><b>버튼 하나로 바로 이동</b><small>투표·스밍 페이지가 앱이나 웹으로 열려요.</small></span></li>
      </ol>
      <button type="button" class="btn small primary intro-ok" data-intro-close>알겠어요</button>
    </section>`);

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
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
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
          </div>
        </div>`;
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-modal-close]')) hideModal(m); });
    }
    showModal(m);
  }

  function getRow(it, date) {
    const open = state.open.has(it.id);
    const rid = 'm-' + it.id.replace(/[^\w-]/g, '');
    const initial = it.ally ? [...it.ally.artist][0] : '리';
    return `
      <li class="row get ${open ? 'open' : ''}" style="--cc:${campColor(it.camp || '')}">
        <div class="row-main">
          <span class="avatar" style="--c:${it.ally ? esc(it.ally.color) : 'var(--accent)'}" aria-hidden="true">${esc(initial)}</span>
          <button class="row-head" type="button" data-open="${esc(it.id)}" aria-expanded="${open}" aria-controls="${rid}">
            <span class="row-text">
              <span class="row-title">${esc(it.title)}</span>
              <span class="row-sub">${it.ally && it.ally.fandom ? `${esc(it.ally.fandom)}가 해줘요` : esc(whoName(it))}${it.camp ? `<i class="sep">·</i>${esc(it.camp)}` : ''}</span>
            </span>
            ${rowEnd(it, date)}
            ${chevron}
          </button>
        </div>
        ${open ? `<div id="${rid}">${rowMore(it, date, false, false)}</div>` : ''}
      </li>`;
  }

  function sortTodos(list, checks) {
    return list.sort((a, b) => {
      const da = checks.has(a.id), db = checks.has(b.id);
      if (da !== db) return da ? 1 : -1;
      // 같은 투표끼리 붙여서 보이게
      return campOrder(a.camp) - campOrder(b.camp) || (a.camp || '').localeCompare(b.camp || '', 'ko') || (a.deadline ?? 9999) - (b.deadline ?? 9999) || (a.end || '9').localeCompare(b.end || '9') || a.title.localeCompare(b.title, 'ko');
    });
  }

  // 맨 위 인덱스: 투표 종류를 MAMA / MMA / 기타 세 묶음으로 (누르면 그 묶음만 보기)
  const GROUPS = [
    { id: '음방', color: '#c2410c' },
    { id: 'MAMA', color: '#0b6e99' },
    { id: 'MMA', color: '#b8336a' },
    { id: '기타', color: '#6b7280' },
  ];
  const campGroup = (c) => (/^음방/.test(c || '') ? '음방' : /^MAMA/i.test(c || '') ? 'MAMA' : /^MMA/i.test(c || '') ? 'MMA' : '기타');
  // MAMA / MMA / 기타 필터 (한 줄 칩)
  function campStrip(allTodos, allGets) {
    const all = [...allTodos, ...allGets];
    const shown = GROUPS.filter((g) => all.some((x) => campGroup(x.camp) === g.id));
    if (!shown.length) return '';
    const f = state.campFilter && shown.some((g) => g.id === state.campFilter) ? state.campFilter : '';
    return `
      <div class="filter-chips" role="group" aria-label="MAMA, MMA, 기타로 모아보기">
        <button type="button" class="fchip ${f ? '' : 'on'}" data-camp="" aria-pressed="${!f}">전체</button>
        ${shown.map((g) => `<button type="button" class="fchip ${f === g.id ? 'on' : ''}" data-camp="${g.id}" style="--cc:${g.color}" aria-pressed="${f === g.id}"><i class="dot" style="--c:${g.color}"></i>${g.id}</button>`).join('')}
      </div>`;
  }

  // 묶음(MAMA/MMA/기타)마다 흰 카드 하나에 줄을 모음
  function groupedList(list, rowFn, countFn) {
    return GROUPS.map((g) => {
      const rows = list.filter((x) => campGroup(x.camp) === g.id);
      if (!rows.length) return '';
      return `
        <section class="group">
          <h3 class="group-head"><span class="gname" style="--cc:${g.color}">${g.id}</span><span class="gcount num">${countFn(rows)}</span></h3>
          <ul class="rows">${rows.map(rowFn).join('')}</ul>
        </section>`;
    }).join('');
  }

  function dayDetail(date) {
    const checks = getChecks(date);
    const allTodos = sortTodos(todosFor(date), checks);
    const allGets = getsFor(date).sort((a, b) => campOrder(a.camp) - campOrder(b.camp) || (a.camp || '').localeCompare(b.camp || '', 'ko') ||(a.end || '9').localeCompare(b.end || '9'));
    const strip = campStrip(allTodos, allGets);
    const f = state.campFilter && [...allTodos, ...allGets].some((x) => campGroup(x.camp) === state.campFilter) ? state.campFilter : '';
    const todos = f ? allTodos.filter((x) => campGroup(x.camp) === f) : allTodos;
    const gets = f ? allGets.filter((x) => campGroup(x.camp) === f) : allGets;
    const done = todos.filter((x) => checks.has(x.id)).length;
    return {
      todos: allTodos, gets: allGets, done: allTodos.filter((x) => checks.has(x.id)).length,
      html: `
        ${strip}
        ${kindSeg(todos.length, gets.length)}
        <!-- 휴대폰: 탭으로 한쪽만 / 넓은 화면: 두 칸 나란히 -->
        <p class="kind-cap">${state.kindTab === 'give'
          ? '<b>할 일</b> 리센느와 연합팀을 위해 내가 하는 투표·스밍이에요.'
          : '<b>받을 것</b> 연합팀이 리센느를 위해 해 주는 것이에요. 확인만 하면 돼요.'}</p>
        <div class="day-cols show-${state.kindTab}" id="kind-panel" role="tabpanel" aria-labelledby="tab-${state.kindTab}">
          <section class="day-col give" aria-label="할 일">
            <h2 class="col-title">할 일 <span class="num">${todos.length ? `${done}/${todos.length} 완료` : '0'}</span></h2>
            ${todos.length ? groupedList(todos, (x) => todoRow(x, date, checks), (rows) => `${rows.filter((x) => checks.has(x.id)).length}/${rows.length}`) : '<div class="card empty">이 날 할 일은 없어요</div>'}
          </section>
          <section class="day-col get" aria-label="받을 것">
            <h2 class="col-title">받을 것 <span class="num">${gets.length}</span><small>연합팀이 리센느에게 해주는 것</small></h2>
            ${gets.length ? groupedList(gets, (x) => getRow(x, date), (rows) => `${rows.length}`) : '<div class="card empty">이 날 받는 지원은 없어요</div>'}
          </section>
        </div>`,
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
    return `<p class="updated">${src} · 날짜는 한국 시간 기준${introSeen() && route().tab === 'today' ? ' · <button type="button" class="linkish" data-intro-open>사용법 다시 보기</button>' : ''}</p>
      <p class="disclaimer">이 사이트는 리센느(RESCENE)를 응원하는 팬이 자발적으로 만든 비영리 정리 도구예요.<br>리센느 음원총공팀 및 소속사와 공식적인 관련이 없어요. 공식 지침은 음원총공팀 공지를 확인해 주세요.</p>`;
  }

  // ---------- 오늘 ----------
  function renderToday() {
    const d = today();
    const det = dayDetail(d);
    const total = det.todos.length;
    const pct = total ? Math.round((det.done / total) * 100) : 0;
    // 다가오는 일정: 7일 안에 시작하거나 끝나는 것
    const upcoming = [];
    state.data.items.forEach((it) => {
      if (it.tbd) return;
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
    const finding = ending.length
      ? `<span class="find-k">곧 끝나요</span>${ending.slice(0, 2).map((x) => `<span class="find-i"><b class="num">${diffDays(d, x.end) === 0 ? '오늘' : diffDays(d, x.end) + '일 남음'}</b> ${label(x)}</span>`).join('')}`
      : starting.length
        ? `<span class="find-k">곧 시작해요</span>${starting.slice(0, 2).map((x) => `<span class="find-i"><b class="num">${mdw(x.start)}</b> ${label(x)}</span>`).join('')}`
        : '';
    return `
      <section class="hero">
        <p class="hero-date"><span>${longLabel(d)}</span>${updatedTag()}</p>
        <h1 class="hero-title">${total ? (det.done === total ? '오늘 할 일을 모두 끝냈어요' : `오늘 할 일 <b class="num">${total - det.done}</b>개 남았어요`) : '오늘은 할 일이 없어요'}</h1>
        ${total ? `<div class="progress-wrap"><div class="progress"><i style="width:${pct}%"></i></div><span class="progress-label num">${det.done}/${total}</span></div>` : ''}
        ${finding ? `<p class="hero-find">${finding}</p>` : ''}
        ${schNextLine()}
        ${musicLine()}
      </section>
      ${introCard()}
      ${toolsBar()}
      ${det.html}
      ${upcoming.length ? `
        <h2 class="section-title">다가오는 일정</h2>
        <div class="card list">
          ${upcoming.map(({ it, date, what }) => `
            <div class="list-row">
              <span class="list-date">${mdw(date)}</span>
              <span class="list-body"><b>${esc(it.ally ? it.ally.artist : '리센느')}</b> ${esc(it.camp || it.title)}<small>${esc(it.title)}</small></span>
              <span class="status ${what === '시작' ? 'soon' : 'end'}">${what}</span>
            </div>`).join('')}
        </div>` : ''}
      ${sourceLine()}`;
  }

  // ---------- 달력 ----------
  function monthBounds() {
    const first = state.calMonth + '-01';
    const next = iso(new Date(Date.UTC(+state.calMonth.slice(0, 4), +state.calMonth.slice(5, 7), 1)));
    return { first, last: addDays(next, -1) };
  }

  function calendarGrid() {
    const t = today();
    const { first, last } = monthBounds();
    const gridStart = addDays(first, -dowOf(first));
    const weeks = Math.ceil((diffDays(gridStart, last) + 1) / 7);
    let cells = '';
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(gridStart, i);
      const g = todosFor(d).length;
      const r = getsFor(d).length;
      const starts = state.data.items.filter((x) => !x.tbd && x.start === d).length;
      const classes = ['cal-day', d.slice(0, 7) !== state.calMonth && 'out', d === t && 'today', d === state.calSel && 'selected', d < t && 'past'].filter(Boolean).join(' ');
      cells += `<button type="button" class="${classes}" data-day="${d}" aria-label="${longLabel(d)} 할 일 ${g}개, 받을 것 ${r}개">
        <span class="cal-num">${+d.slice(8)}</span>
        <span class="cal-cnt">
          ${g ? `<i class="cnt give">${g}</i>` : ''}
          ${r ? `<i class="cnt get">${r}</i>` : ''}
        </span>
        ${starts ? '<i class="cal-start" title="시작하는 일정"></i>' : ''}
      </button>`;
    }
    const det = dayDetail(state.calSel);
    return `
      <div class="card cal">
        <div class="cal-grid">${DOW.map((x) => `<div class="cal-dow">${x}</div>`).join('')}${cells}</div>
      </div>
      <p class="legend-line"><i class="cnt give">n</i> 할 일 <i class="cnt get">n</i> 받을 것 <i class="cal-start inline"></i> 새로 시작</p>
      <h2 class="day-head">${longLabel(state.calSel)}</h2>
      ${det.html}`;
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
    const groupColor = (it) => GROUPS.find((g) => g.id === campGroup(it.camp)).color;
    const groupIdx = (it) => GROUPS.findIndex((g) => g.id === campGroup(it.camp));
    const tickDays = [1, 8, 15, 22, 29].filter((n) => n <= N);
    // '오늘' 이름표와 겹치는 날짜 글자는 숨김
    const tIdx = t >= first && t <= last ? diffDays(first, t) : -99;
    const ticks = tickDays.map((n) => `<span style="left:${(((n - 1) / N) * 100).toFixed(3)}%"${Math.abs(n - 1 - tIdx) < 3.5 ? ' class="near"' : ''}>${n}일</span>`).join('');
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
      const per = periodText(it).replace(/\s/g, '');
      const sub = (it.camp || '').replace(/^MAMA\s*|^MMA\s*/i, '') || it.title;
      return `
        <div class="tl-row st-${st}" title="${esc(whoName(it))} · ${esc(it.camp || '')} · ${esc(it.title)} (${periodText(it)})">
          <div class="tl-label">
            <b><i class="dot" style="--c:${it.ally ? esc(it.ally.color) : 'var(--accent)'}"></i>${esc(whoName(it))}</b>
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

  const viewSeg = () => `
      <div class="seg view-seg" role="tablist" aria-label="보기">
        <button type="button" role="tab" aria-selected="${state.calView === 'timeline'}" tabindex="${state.calView === 'timeline' ? 0 : -1}" data-view="timeline" class="${state.calView === 'timeline' ? 'on' : ''}">기간표</button>
        <button type="button" role="tab" aria-selected="${state.calView === 'grid'}" tabindex="${state.calView === 'grid' ? 0 : -1}" data-view="grid" class="${state.calView === 'grid' ? 'on' : ''}">날짜별</button>
      </div>`;
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


  // ---------- 스케줄 (Mnet Plus 공식 일정표 + blip) ----------
  // Mnet Plus: artist.mnetplus.world 일정 데이터를 달마다 바로 불러옴 (마지막으로 받은 것은 휴대폰에 저장)
  // blip: 3시간마다 GitHub Actions가 data/blip.json 으로 받아 둠 (tools/crawl_blip.py)
  // 구독용 캘린더 파일 data/rescene.ics 도 같은 작업이 만들어 둠
  const SCH_API = 'https://artist.mnetplus.world/svc/stg/rescene-official/space/api/v1/calendar';
  const SCH_PAGE = (ym) => `https://artist.mnetplus.world/main/stg/rescene-official/schedule/${ym.replace('-', '/')}`;
  const BLIP_PAGE = 'https://blip.kr/artists/RESCENE/schedule?unitId=133';
  const SCH_SRC = { mnetplus: 'Mnet Plus', blip: 'blip', etc: '기타' };
  // 일정 종류. 새 종류가 생기면 회색으로 자동 표시돼요.
  const SCH_TYPES = {
    '공연': { label: '공연', color: '#b8336a' },
    '팬사인회': { label: '팬사인회', color: '#0b6e99' },
    '방송': { label: '방송', color: '#1b7a4a' },
    '음방': { label: '음악방송', color: '#1b7a4a' },
    '예능': { label: '예능', color: '#1b7a4a' },
    '라디오': { label: '라디오', color: '#a15c00' },
    '행사': { label: '행사', color: '#0f766e' },
    '기념일': { label: '기념일', color: '#c2410c' },
    '발매': { label: '발매·콘텐츠', color: '#7c2d5b' },
    '굿즈': { label: '굿즈', color: '#a15c00' },
    '이벤트': { label: '이벤트', color: '#0f766e' },
    '공지': { label: '공지', color: '#6b7280' },
  };
  const schType = (name) => SCH_TYPES[name] || { label: name || '기타', color: '#6b7280' };
  state.sch = {};          // 'YYYY-MM' → { events, at, savedAt, error, loading }
  state.blip = null;       // { updated, events }
  state.schMonth = '';
  state.schSel = '';
  state.schType = '';
  state.schSrc = '';
  state.schQ = '';
  state.schPick = false;   // 연·월 고르기 열림
  state.schPickYear = 0;
  state.schArg = '';
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
  const schOf = (ym) => (state.sch[ym] && state.sch[ym].events) || [];

  // --- blip ---
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
          events.push({ ...e, title: cleanTitle(e.title), end: e.end || e.date, src: 'blip' });
        }));
        state.blip = { updated: d.updated || '', mnetUpdated: d.mnet_updated || '', events };
      })
      .catch(() => { state.blip = { events: [], error: 'fail' }; })
      .finally(schRefresh);
  }

  // --- 기타: 디시 "리센느 주간 배급 일정표" (매일 밤 00시 data/weekly.json 으로 바뀜, tools/crawl_weekly.py) ---
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
          type: WEEKLY_TYPE[e.category] || e.category || '기타', place: e.note || '', src: 'etc', link: '',
        }));
        state.weekly = { updated: d.updated || '', events };
      })
      .catch(() => { state.weekly = { events: [] }; })
      .finally(schRefresh);
  }
  // 같은 일정인지: 같은 날(또는 기간 안) + 비슷한 제목
  const DUP_ALIAS = [[/엠카운트다운|엠카/g, 'mcountdown'], [/뮤직뱅크|뮤뱅/g, 'musicbank'], [/인기가요|인가/g, 'inkigayo'], [/음악중심|음중/g, 'musiccore'], [/쇼챔피언|쇼챔/g, 'showchampion'], [/더쇼/g, 'theshow'], [/잇츠라이브/g, 'itslive'], [/쇼케이스/g, 'showcase'], [/응원봉/g, 'lightstick'], [/갤럭시\s*나이트/g, 'galaxynight']];
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

  // --- 모으기 ---
  const schSort = (a, b) => (a.at + (a.cont ? '' : (a.time || '00:00'))).localeCompare(b.at + (b.cont ? '' : (b.time || '00:00'))) || a.src.localeCompare(b.src);
  const mnetEv = (e) => ({ ...e, src: 'mnetplus', end: e.date, link: '' });
  // 한 달에 보일 일정. 여러 날 일정은 시작일(이전 달이면 1일)에 한 번만
  function schAll(ym) {
    blipLoad();
    const first = ym + '-01';
    const last = ymLast(ym);
    const span = (list) => list
      .filter((e) => e.date <= last && e.end >= first)
      .map((e) => (e.date < first ? { ...e, at: first, cont: true } : { ...e }));
    const blip = span((state.blip && state.blip.events) || []);
    const etc = span(weeklyNew().concat(musicManualEvents()));
    return schOf(ym).map(mnetEv).concat(blip, etc).map((e) => ({ ...e, at: e.at || e.date })).sort(schSort);
  }
  // 검색용: 불러온 모든 달
  function schKnown() {
    const out = [];
    Object.keys(state.sch).forEach((ym) => schOf(ym).forEach((e) => out.push(mnetEv(e))));
    ((state.blip && state.blip.events) || []).forEach((e) => out.push({ ...e }));
    weeklyNew().concat(musicManualEvents()).forEach((e) => out.push({ ...e }));
    return out.map((e) => ({ ...e, at: e.date })).sort(schSort);
  }
  const schFilter = (list) => list.filter((e) => (!state.schSrc || e.src === state.schSrc) && (!state.schType || e.type === state.schType));
  const schLink = (e) => e.link || (e.src === 'mnetplus' ? SCH_PAGE(e.date.slice(0, 7)) : '');
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
      const desc = [schType(e.type).label, SCH_SRC[e.src], schLink(e)].filter(Boolean).join('\n');
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
        saveIcs(list, b.dataset.exp === 'month' ? `rescene-${state.schMonth}.ics` : 'rescene-upcoming.ics', '리센느 스케줄');
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
    if (e.end && e.end !== e.date) return e.cont ? '진행 중' : '기간';
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
    const ty = schType(e.type);
    const multi = e.end && e.end !== e.date;
    const past = (e.end || e.date) < t;
    const meta = [
      multi ? `${mdw(e.date)} – ${mdw(e.end)}` : '',
      e.place || '',
      e.members && e.members.length && e.members.length < 4 ? e.members.join('·') : '',
    ].filter(Boolean).map(esc).join(' · ');
    const link = schLink(e);
    const mv = e.mv || showOfEvent(e);
    return `<li class="sch-row${past ? ' past' : ''}" style="--c:${ty.color}">
        <span class="sch-time">${esc(schTimeLabel(e))}</span>
        <div class="sch-body">
          <b>${hl(e.title, q)}</b>
          ${meta ? `<small class="sch-meta">${hl(meta.replace(/&amp;/g, '&'), q)}</small>` : ''}
          ${mv ? `<button type="button" class="sch-vote" data-goguide="music-${mv.id}">${esc(liveLine(mv))}<span aria-hidden="true">›</span></button>` : ''}
          <span class="sch-tags"><i class="sch-type">${esc(ty.label)}</i><i class="sch-srcb ${e.src}">${e.mv && e.src === 'etc' ? '출연 확정' : SCH_SRC[e.src] || ''}</i></span>
          <span class="sch-acts">
            ${link ? `<a class="sch-act" href="${esc(link)}" target="_blank" rel="noopener">${e.src === 'blip' ? '자세히' : '원본'} ↗</a>` : ''}
            ${e.src !== 'etc' ? `<a class="sch-act" href="https://www.google.com/search?q=${encodeURIComponent('리센느 ' + e.title)}" target="_blank" rel="noopener">검색 ↗</a>` : ''}
            <button type="button" class="sch-act" data-schics="${esc(schKey(e))}">캘린더에 추가</button>
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
            ${q ? `<button type="button" class="sch-jump" data-schjump="${d}">달력에서 보기</button>` : `<button type="button" class="sch-share" data-schshare="${d}" aria-label="${longLabel(d)} 링크 복사">링크 복사</button>`}</h3>
          <ul>${by[d].map((e) => schRow(e, t, q)).join('')}</ul>
        </section>`;
    }).join('');
  }
  function schCalHtml(list, t) {
    const ym = state.schMonth;
    const first = ym + '-01';
    const last = ymLast(ym);
    const gridStart = addDays(first, -dowOf(first));
    const weeks = Math.ceil((diffDays(gridStart, last) + 1) / 7);
    let cells = '';
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(gridStart, i);
      const inM = d.slice(0, 7) === ym;
      const evs = inM ? list.filter((e) => e.at === d) : [];
      const dw = dowOf(d);
      const cls = ['sch-cell', !inM && 'out', d === t && 'today', d === state.schSel && 'selected', d < t && 'past', dw === 0 && 'sun', dw === 6 && 'sat'].filter(Boolean).join(' ');
      cells += `<button type="button" class="${cls}" data-schday="${d}"${inM ? '' : ' tabindex="-1" aria-hidden="true"'} aria-label="${longLabel(d)} 일정 ${evs.length}개" aria-pressed="${d === state.schSel}">
        <span class="sch-num">${+d.slice(8)}</span>
        ${evs.slice(0, evs.length > 3 ? 2 : 3).map((e) => `<i class="sch-pill" style="--c:${schType(e.type).color}">${esc(e.title.replace(/[<>]/g, '').trim())}</i>`).join('')}
        ${evs.length > 3 ? `<small class="sch-more">+${evs.length - 2}</small>` : ''}
        ${evs.length ? `<span class="sch-dots" aria-hidden="true">${evs.slice(0, 3).map((e) => `<i style="--c:${schType(e.type).color}"></i>`).join('')}${evs.length > 3 ? `<small>+${evs.length - 3}</small>` : ''}</span>` : ''}
      </button>`;
    }
    return `<div class="sch-grid">${DOW.map((x, i) => `<div class="sch-dow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${x}</div>`).join('')}${cells}</div>`;
  }
  function schFiltersHtml(every) {
    const srcN = (k) => every.filter((e) => e.src === k).length;
    const pool = state.schSrc ? every.filter((e) => e.src === state.schSrc) : every;
    const types = [...new Set(pool.map((e) => e.type))];
    if (state.schType && !types.includes(state.schType)) state.schType = '';
    return `<div class="sch-srcseg" role="group" aria-label="일정 출처">
        ${[['', '전체', every.length], ['mnetplus', 'Mnet Plus', srcN('mnetplus')], ['blip', 'blip', srcN('blip')], ['etc', '기타', srcN('etc')]].filter((x) => x[0] !== 'etc' || x[2] > 0).map(([k, label, n]) =>
          `<button type="button" data-schsrc="${k}" aria-pressed="${state.schSrc === k}" class="${state.schSrc === k ? 'on' : ''}">${label}<i>${n}</i></button>`).join('')}
      </div>
      ${types.length > 1 ? `<div class="filter-chips sch-chips" role="group" aria-label="일정 종류">
        <button type="button" class="fchip${!state.schType ? ' on' : ''}" data-schtype="" aria-pressed="${!state.schType}">모든 종류</button>
        ${types.map((ty) => `<button type="button" class="fchip${state.schType === ty ? ' on' : ''}" data-schtype="${esc(ty)}" aria-pressed="${state.schType === ty}"><i class="dot" style="background:${schType(ty).color}"></i>${esc(schType(ty).label)}</button>`).join('')}
      </div>` : ''}`;
  }
  function schMainHtml() {
    const t = today();
    const ym = state.schMonth;
    const q = state.schQ.trim();
    const box = state.sch[ym] || {};
    const list = schFilter(schAll(ym));
    let side;
    if (q) {
      const words = q.toLowerCase().split(/\s+/);
      const found = schFilter(schKnown()).filter((e) => {
        const hay = [e.title, e.place, (e.members || []).join(' '), schType(e.type).label, SCH_SRC[e.src]].join(' ').toLowerCase();
        return words.every((w) => hay.includes(w));
      });
      side = `<div class="sch-side-head"><h2>"${esc(q)}" 검색 결과 <i class="seg-n">${found.length}</i></h2><button type="button" class="btn small" data-schclear>검색 지우기</button></div>
        ${found.length ? schGroups(found, t, q) : '<div class="card empty"><strong>찾는 일정이 없어요</strong>다른 낱말로 찾아보세요. 불러온 달(지난달 ~ 몇 달 뒤) 안에서 찾아요.</div>'}`;
    } else if (state.schSel && state.schSel.slice(0, 7) === ym) {
      const day = list.filter((e) => e.at === state.schSel);
      side = `<div class="sch-side-head"><h2>${longLabel(state.schSel)}</h2><button type="button" class="btn small" data-schday="${state.schSel}">${+ym.slice(5)}월 전체 보기</button></div>
        ${day.length ? schGroups(day, t) : '<div class="card empty"><strong>이 날은 일정이 없어요</strong></div>'}`;
    } else {
      const loading = box.events === null || ((box.loading || (state.blip && state.blip.loading)) && !list.length);
      side = `<div class="sch-side-head"><h2>${+ym.slice(5)}월 일정 <i class="seg-n">${list.length}</i></h2><p class="sch-hint">달력에서 날짜를 누르면 그날 일정만 보여요</p></div>
        ${list.length ? schGroups(list, t) : loading ? '<div class="card empty"><strong>불러오는 중…</strong></div>' : '<div class="card empty"><strong>이 달에는 등록된 일정이 없어요</strong>새로 올라오면 여기에 보여요.</div>'}`;
    }
    return `<div class="card sch-cal">${schCalHtml(list, t)}</div><div class="sch-side" id="sch-side">${side}</div>`;
  }
  function schStatusHtml() {
    const ym = state.schMonth;
    const box = state.sch[ym] || {};
    const fmtT = (d) => (d && !isNaN(d) ? new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d) : '');
    const mt = fmtT(box.savedAt ? new Date(box.savedAt) : null);
    const bt = fmtT(state.blip && state.blip.updated ? new Date(state.blip.updated) : null);
    const mnet = box.error ? `<span class="warn">Mnet Plus를 지금 불러오지 못했어요${mt ? ` (${mt}에 받은 일정)` : ''}.</span>` : `Mnet Plus는 바로 불러와요${mt ? ` (${mt})` : ''}.`;
    const blip = state.blip && state.blip.error ? '<span class="warn">blip 일정을 불러오지 못했어요.</span>' : `blip은 3시간마다 받아 와요${bt ? ` (${bt})` : ''}.`;
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
    if (tab === 'today') { render({ keepScroll: true }); return; }
    if (tab !== 'schedule') return;
    const main = document.getElementById('sch-main');
    if (!main) return;
    main.innerHTML = schMainHtml();
    const f = document.getElementById('sch-filters');
    if (f) f.innerHTML = schFiltersHtml(schAll(state.schMonth));
    const st = document.getElementById('sch-status');
    if (st) st.innerHTML = schStatusHtml();
  }
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
  const EMBEDDED = (() => {
    try { if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) return true; } catch (e) { /* */ }
    return /KAKAOTALK|Instagram|FBAN|FBAV|Line\/|NAVER|DaumApps|Twitter|everytimeApp|Whale\/.*inapp/i.test(navigator.userAgent || '');
  })();
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
      pre: { appKey: 'mubeat', app: '뮤빗(Mubeat)', where: '뮤빗 → 투표 → SHOW K-POP 탭', when: '방송 전주 목 12:00 ~ 토 12:00',
        steps: ['뮤빗 앱 아래 가운데 투표 버튼', 'SHOW K-POP 탭 → 사전투표 부문', '리센느 투표 버튼'],
        ticket: '하트비트: 광고 · 미션 · 퀴즈로 무료로 모아요', limit: '가진 하트비트만큼 (앱 화면에서 확인)', weight: '15%' },
      live: { appKey: 'mubeat', app: '뮤빗(Mubeat)', where: '뮤빗 → 투표 → SHOW K-POP → 생방송 투표', when: '생방송 중에만 (18:00 ~ 19:10) · 결방이면 없음',
        steps: ['뮤빗 → 투표 → SHOW K-POP 탭', '생방송 투표', '리센느 투표'],
        limit: '1인 최대 50표', qty: '50표', weight: '15% · 1위 후보 2팀만' },
      tip: '정식 데뷔 가수 음원만 집계하고 드라마 · 웹툰 OST와 오디션 프로그램 음원은 빠져요. 통산 3주 1위면 명예의 전당에 올라 차트에서 빠져요. 투표 화면 오른쪽 위 인증서 아이콘으로 투표 인증서를 저장 · 공유할 수 있어요.',
      after: '쇼스테이지: 방송이 끝나면 바로 그날 출연진 전체를 대상으로 100% 투표 (뮤빗) → 1위는 시상과 SHOW STAGE 명예의 전당',
      links: [['쇼케이팝 공식', 'https://showkpop.com'], ['뮤빗 공식', 'https://mubeat.tv']] },
    { id: 'theshow', span: '금~월', day: 2, name: '더쇼', sub: 'THE SHOW', time: '18:00', end: '19:00', ch: 'SBS LIFE',
      re: /더\s*쇼(?!케)|the\s*show\b/i,
      chart: '사전 집계(음원 40 · 음반 20 · 팬 인게이지먼트 20 · 사전투표 20 %) + 생방송 투표 20%를 더해서 더쇼 초이스',
      parts: [
        ['음원 40%', '애플뮤직 글로벌 스트리밍 · 방송 전전주 금 ~ 전주 목 (미국 PT 기준)'],
        ['음반 20%', '한터차트 · 방송 전전주 토 ~ 전주 금'],
        ['팬 인게이지먼트 20%', '써클차트 · K-POP RADAR: 공식 유튜브 · 틱톡 조회수 · 좋아요 · 댓글 수 · 방송 전전주 토 ~ 전주 금'],
        ['사전투표 20%', '빅크 · 방송 전주 금 17:00 ~ 방송 주 월 10:00'],
        ['생방송 투표 20%', '빅크 · 방송 당일 18:05 ~ 19:00 (사전 집계 점수에 더해요)'],
      ],
      partsSrc: '더쇼 공식 X 공지',
      pre: { appKey: 'bigc', app: '빅크(BIGC)', where: '빅크 → 빅크 초이스 → 1위 후보 사전투표', when: '방송 전주 금 17:00 ~ 월 10:00 (예: 402회 10/30 17:00 ~ 11/2 10:00)',
        steps: ['빅크 앱 로그인', '빅크 초이스(BIGC CHOICE) → 1위 후보 사전투표', '리센느 투표'],
        ticket: '하트젤리: 출석 체크 · 광고(하루 최대 10회) · 미션으로 무료', limit: '가진 하트젤리만큼 (앱 화면에서 확인)', weight: '사전 집계의 20%' },
      live: { appKey: 'bigc', app: '빅크(BIGC)', where: '빅크 → 실시간 투표 배너', when: '방송 당일 화 18:05 ~ 19:00', window: '18:05 ~ 19:00',
        steps: ['빅크 앱 홈 실시간 투표 배너', '리센느 투표'],
        ticket: '하트젤리', limit: '앱 화면에서 확인', weight: '20% (사전 집계 점수에 더해요)' },
      tip: '음원 점수는 애플뮤직 글로벌 스트리밍, 팬 점수는 리센느 공식 유튜브 · 틱톡의 조회수 · 좋아요 · 댓글이에요. 사전투표 때 팬픽캠(직캠 주인공 멤버) 투표도 같이 열리고, 생방송 · 다시보기는 빅크 온(BIGC ON)에서 볼 수 있어요.',
      after: '방송 뒤 애프터 투표: 엔딩요정 · 핫스테이지 · 팬픽캠 주인공 (빅크)',
      links: [['SBS 더쇼 공식', 'https://programs.sbs.co.kr/fune/theshow/about/58354']] },
    { id: 'showchamp', span: '금~월', day: 3, name: '쇼챔피언', sub: 'SHOW CHAMPION', time: '18:00', end: '19:00', ch: 'MBC M',
      re: /쇼\s*챔피언|쇼챔|show\s*champion/i,
      chart: '음원 35 · 방송 20 · 글로벌 팬투표 20 · 음반 15 · SNS 10 (%)',
      pre: { appKey: 'idolchamp', app: '아이돌챔프(IDOLCHAMP)', where: '아이돌챔프 → Vote → SHOW CHAMPION 챔피언송', when: '방송 전주 금 20:00 ~ 월 14:59',
        steps: ['아이돌챔프 앱 로그인 → 아래 Vote', 'SHOW CHAMPION 챔피언송 사전투표 배너', '리센느 곡 → 투표하기 → 챔심을 투표권으로 최대 교환 → 최대 투표'],
        ticket: '챔심: 출석 · 룰렛 · 퀴즈 · 광고 · 영상 시청 · 미션 (무료 챔심은 하루 최대 300개). 루비챔심은 90일, 타임챔심은 매달 1일에 사라져요',
        limit: '횟수 제한 없음 · 가진 챔심만큼', qty: '무제한', weight: '20% (실시간 투표가 없어서 팬 투표는 이게 전부)' },
      live: null,
      tip: '마감(월 14:59) 직전까지 표 차이가 벌어져요. 남은 챔심은 마감 전에 꼭 다 써 주세요.',
      },
    { id: 'mcountdown', span: '토~화', day: 4, name: '엠카운트다운', sub: 'M COUNTDOWN', time: '18:00', end: '19:30', ch: 'Mnet',
      re: /엠\s*카운트다운|엠카|m\s*countdown/i,
      chart: '음원 50 · 음반 15 · 글로벌 팬투표 15 · 방송 10 · 실시간 투표 10 (%)',
      pre: { appKey: 'mnetplus', app: 'Mnet Plus', where: 'Mnet Plus → 투표 → 엠카운트다운 사전투표', when: '방송 전주 토 00:00 ~ 월·화 23:59 (회차마다 공지)',
        steps: ['Mnet Plus 앱(또는 웹) 로그인', '투표 → 엠카운트다운 사전투표', '리센느 곡 투표'],
        ticket: '하트: 광고(하루 최대 100회) · 출석 · 룰렛', limit: '하루 5회 · 여러 팀 · 같은 팀 다시 투표 가능', qty: '하루 5회', weight: '15%' },
      live: { appKey: 'mnetplus', app: 'Mnet Plus', where: 'Mnet Plus 홈 → MCOUNTDOWN → 실시간 투표', when: '1위 후보 발표 뒤 ~ 실시간 투표 끝날 때까지',
        steps: ['Mnet Plus 홈 "엠카운트다운 실시간 투표" 배너 (또는 MCOUNTDOWN 메뉴)', '실시간 투표', '리센느 투표'],
        limit: '앱 화면에서 확인', weight: '10%' },
      links: [['Mnet Plus 공식', 'https://www.mnetplus.world']] },
    { id: 'musicbank', span: '월~수', day: 5, name: '뮤직뱅크', sub: 'MUSIC BANK', time: '17:15', end: '18:40', ch: 'KBS2',
      re: /뮤직\s*뱅크|뮤뱅|music\s*bank/i,
      chart: '음원 60 · 방송 20 · 팬 투표 10 · 음반 5 · SNS 5 (%)',
      pre: { appKey: 'coogoong', app: '쿠궁(옛 팬캐스트)', where: '쿠궁 → 투표 → 뮤직뱅크 사전투표', when: '방송 주 월 11:00 ~ 수 11:00 (회차마다 공지)',
        steps: ['쿠궁 앱 로그인 (팬캐스트 계정 그대로 써요)', '투표 → 뮤직뱅크 사전투표', '리센느 → 하트로 투표'],
        ticket: '하트: 출석 · 광고 · 미션으로 무료', limit: '가진 하트만큼 (앱 화면에서 확인)', weight: '10% (그 주 금요일 K-차트에 반영)' },
      live: null,
      tip: '팬캐스트가 2026년 7월에 이름을 쿠궁(coogoong)으로 바꿨어요. 같은 앱이에요.',
      links: [['KBS 뮤직뱅크 공식', 'https://program.kbs.co.kr/2tv/enter/musicbank/pc/'], ['쿠궁 공식', 'https://coogoong.com']] },
    { id: 'musiccore', span: '화~목', day: 6, name: '쇼! 음악중심', sub: 'MUSIC CORE', time: '15:15', end: '16:20', ch: 'MBC',
      re: /음악\s*중심|음중|music\s*core/i,
      chart: '사전 점수(음원 · 음반 · 영상 · 방송 · 글로벌 사전투표 10% = 뮤빗 5 + 뮤니버스 5)로 1위 후보 3팀 → 생방송 투표(앱 6 : 문자 4)',
      pre: { appKey: 'mubeat', appKeys: ['mubeat', 'muniverse'], app: '뮤빗 · 뮤니버스', short: '뮤빗·뮤니버스', where: '뮤빗 또는 뮤니버스 → 투표 → 쇼! 음악중심 글로벌 사전투표', when: '방송 주 화 18:00 ~ 목 11:00 (예: 968회 10/27 18:00 ~ 10/29 11:00)',
        steps: ['뮤빗 → 투표 → 쇼! 음악중심 글로벌 사전투표 → 리센느', '뮤니버스 → Vote → 쇼! 음악중심 글로벌 사전투표 → 리센느'],
        ticket: '뮤빗 하트비트 · 뮤니버스 투표권: 광고 · 미션 · 출석으로 무료', limit: '가진 투표권만큼 (앱 화면에서 확인)', weight: '10% (뮤빗 5% + 뮤니버스 5%, 따로 계산돼서 두 앱 다 해야 해요)' },
      live: { appKey: 'mubeat', appKeys: ['mubeat', 'muniverse'], app: '뮤빗 · 뮤니버스 · 문자', short: '앱 2개 · 문자', where: '뮤빗 · 뮤니버스 → 쇼! 음악중심 생방송 앱 투표 / 문자 #0505', when: '1위 후보 발표 뒤 ~ 약 16:10 (앱) · 약 15:35 ~ 16:20 (문자) · 회차마다 공지',
        steps: ['뮤빗 → 투표 → 쇼! 음악중심 → 생방송 앱 투표 → 리센느', '뮤니버스 → Vote → 쇼! 음악중심 생방송 앱 투표 → 리센느', '문자: #0505로 "리센느" 또는 후보 번호를 한 번만'],
        ticket: '뮤빗 생방송 투표권: 하트비트 150개로 5장. 방송 전에 미리 바꿔 두세요',
        limit: '뮤빗 계정당 5표 (팬들은 계정을 여러 개 만들어 투표해요) · 뮤니버스는 앱 화면에서 확인 · 문자는 번호당 1건 100원, 두 번 보내면 무효', qty: '앱 2개 + 문자', weight: '앱 6 : 문자 4' },
      tip: '리센느 공식 투표 안내에도 뮤빗과 뮤니버스가 함께 나와요. 뮤니버스에서는 매주 레전드 무대를 뽑는 STAGE M PICK 투표도 열려요.',
      sms: { to: '#0505', body: '리센느' },
      links: [['MBC 음악중심 공식', 'https://www.imbc.com/broad/tv/ent/musiccore/'], ['MBC 문자투표 안내', 'https://www.imbc.com/broad/tv/ent/musiccore/sms_vote/'], ['뮤니버스 투표', 'https://www.muniverse.io/votes']] },
    { id: 'inkigayo', span: '월~금', day: 0, name: '인기가요', sub: 'INKIGAYO', time: '15:20', end: '16:30', ch: 'SBS',
      re: /인기가요|inkigayo/i,
      chart: '음원 50 · SNS 20 · 음반 10 · On-Air 10 · 사전투표 5 · 실시간 투표 5 (%)',
      pre: { appKey: 'linc', app: 'LiNC(링크)', where: 'LiNC → 투표 → 인기가요 사전투표', when: '방송 주 월 12:00 ~ 금 23:59 (회차마다 공지)',
        steps: ['LiNC 앱 홈 "투표하기(Vote Now)"', '인기가요 사전투표', '리센느 → 10P로 투표'],
        ticket: '팬포인트: 광고 하루 20회 × 6P (하루 최대 120P, 180일 유지)', limit: '하루 최대 10회 (1회 10P)', qty: '하루 10회', weight: '5%' },
      live: { appKey: 'higher', app: '하이어(HIGHER)', where: '하이어 → 홈 실시간 투표 배너', when: '생방송 중 ~ 방송 끝날 때까지',
        steps: ['하이어 앱 홈 실시간 투표 배너 (또는 아래 투표 아이콘)', '리센느 투표'],
        ticket: '루비(광고 시청으로 무료) · 다이아(유료)', limit: '계정당 최대 5표', qty: '5표', weight: '5%' },
      links: [['SBS 인기가요 공식', 'https://programs.sbs.co.kr/enter/gayo/main'], ['LiNC 공식', 'https://www.linc.fan']] },
  ];
  const showById = (id) => MUSIC_SHOWS.find((m) => m.id === id || m.name === id);
  // 공식 일정(Mnet Plus · blip) 제목으로 어떤 음방인지 (같은 요일일 때만, 페스티벌·시상식은 빼고)
  function showOfEvent(e) {
    if (!e || !e.title || /페스티벌|festival|어워즈|awards?|콘서트|concert|in\s+japan/i.test(e.title)) return null;
    return MUSIC_SHOWS.find((m) => m.re.test(e.title) && dowOf(e.date) === m.day) || null;
  }
  // 리센느 음방 출연 (확정): 음방.csv의 출연·1위후보 + 공식 일정에 올라온 음방
  function musicAppearances() {
    const out = new Map();
    (state.data.music || []).filter((r) => r.kind !== 'pre' && r.date).forEach((r) => {
      const m = showById(r.show);
      if (m) out.set(m.id + r.date, { show: m, date: r.date, top: r.kind === 'top', memo: r.memo, src: r.src, manual: true });
    });
    const official = [];
    Object.keys(state.sch || {}).forEach((ym) => schOf(ym).forEach((e) => official.push(e)));
    ((state.blip && state.blip.events) || []).forEach((e) => official.push(e));
    weeklyNew().forEach((e) => official.push(e)); // 주간 일정표에 올라온 음방도
    official.forEach((e) => {
      const m = showOfEvent(e);
      if (!m) return;
      const k = m.id + e.date;
      if (out.has(k)) out.get(k).official = true;
      else out.set(k, { show: m, date: e.date, official: true });
    });
    return [...out.values()].sort((x, y) => x.date.localeCompare(y.date));
  }
  // 리센느가 들어간 사전투표 (음방.csv)
  const musicPrevotes = () => (state.data.music || []).filter((r) => r.kind === 'pre' && r.end && showById(r.show)).map((r) => ({ ...r, show: showById(r.show) }));
  // 오늘 할 일로: 출연하는 날 실시간 투표 + 사전투표 기간
  function musicTodos(d) {
    const out = [];
    const base = { ally: null, kind: 'self', days: [], tbd: false, tags: [], proof: '', proofLinks: [], deadline: '' };
    musicAppearances().filter((a) => a.date === d && a.show.live).forEach((a) => {
      const m = a.show;
      out.push({ ...base, id: `mv-${m.id}-${d}`, camp: '음방 실시간 투표', title: `${m.name} ${a.top ? '1위 후보 ' : ''}실시간 투표`, qty: m.live.qty || '',
        platform: m.live.app, window: m.live.window || `${m.time} ~ ${m.end}`, repeat: '1회', start: d, end: d, link: appHref(m.live.appKey), appKey: m.live.appKey, sms: m.sms || null,
        memo: [`${m.live.where}`, `${m.live.when} · ${m.live.limit}`, a.memo].filter(Boolean).join('\n'), music: m });
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
  // 스케줄에 넣을 확정 출연 중 공식 일정에 없는 것 (음방.csv로 넣은 것)
  const musicManualEvents = () => musicAppearances().filter((a) => a.manual && !a.official).map((a) => ({
    id: `mv-${a.show.id}-${a.date}`, date: a.date, end: a.date, time: a.show.time, title: `${a.show.name} 출연`, type: '음방', place: a.show.ch, src: 'etc', link: a.src || '', mv: a.show,
  }));
  // 투표 한 줄 요약 (스케줄 일정 줄 · 가이드)
  const liveLine = (m) => (m.live ? `실시간 투표 ${m.live.window || m.time + '~'} · ${m.live.app}${m.live.qty ? ' ' + m.live.qty : ''}` : '실시간 투표 없음 · 사전투표가 점수에 반영');
  // 스케줄 위: 리센느 음방 투표 (달력을 덮지 않게 따로 한 줄씩)
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
      if (a.date < t || a.date > until) return;
      rows.push({ at: a.date, k: a.date === t ? '오늘' : mdw(a.date), hot: a.date === t, t: `${a.show.name} ${a.top ? '1위 후보 투표' : a.show.live ? '실시간 투표' : '출연'}`, d: a.show.live ? a.show.live.window || `${a.show.time} ~ ${a.show.end}` : '실시간 투표 없음', g: a.show.id });
    });
    rows.sort((x, y) => x.at.localeCompare(y.at));
    const li = (r) => `<li><button type="button" data-goguide="music-${r.g}"><span class="mv-k${r.hot ? ' hot' : ''}">${esc(r.k)}</span><b>${esc(r.t)}</b><span class="mv-d num">${esc(r.d)}</span></button></li>`;
    return `<section class="mv-strip" aria-label="리센느 음방 투표">
        <div class="mv-head"><h2>리센느 음방 투표</h2><button type="button" class="linkish" data-goguide="music">음방별 투표 방법</button></div>
        ${rows.length ? `<ul>${rows.slice(0, 4).map(li).join('')}</ul>${rows.length > 4 ? `<details class="mv-more"><summary>${rows.length - 4}개 더 보기</summary><ul>${rows.slice(4).map(li).join('')}</ul></details>` : ''}`
          : '<p class="mv-none">출연·사전투표가 정해지면 여기와 오늘 할 일에 보여요. 달력에는 확정된 출연만 들어가요.</p>'}
      </section>`;
  }
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const nowHM = () => new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const hmMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  // 오늘 화면 한 줄: 오늘 음방 (끝났거나 없으면 다음 음방)
  function musicLine() {
    const dow = dowOf(today());
    const now = hmMin(nowHM());
    const todays = MUSIC_SHOWS.find((m) => m.day === dow);
    let show = todays, k = '오늘 음방', tag = '', at = today();
    if (todays) {
      const st = hmMin(todays.time);
      if (now >= st && now < st + 90) tag = '방송 중';
      else if (now >= st + 90) show = null;
    }
    for (let i = 1; i <= 7 && !show; i++) {
      const m = MUSIC_SHOWS.find((x) => x.day === (dow + i) % 7);
      if (m) { show = m; at = addDays(today(), i); k = i === 1 ? '내일 음방' : `${WD[m.day]}요일 음방`; }
    }
    if (!show) return '';
    const mine = musicAppearances().some((a) => a.show === show && a.date === at);
    if (mine && !tag) tag = '리센느 출연';
    return `<button type="button" class="sch-next mus-line" data-music aria-label="요일별 음악방송 시간표 보기"><span class="sch-next-k">${k}</span><span class="sch-next-t">${esc(show.name)}${tag ? ` <i class="mus-live">${tag}</i>` : ''}</span><span class="sch-next-d">${show.time} ${esc(show.ch)}</span><svg class="mus-go" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
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
            return `<div class="mus-row${d === dow ? ' on' : ''}"><span class="mus-d">${WD[d]}${d === dow ? '<small>오늘</small>' : ''}</span><span class="mus-n">${x ? esc(x.name) : '<i>음방 없음</i>'}${x ? `<small>${esc(x.live ? '실시간 ' + x.live.app : '실시간 투표 없음')}</small>` : ''}</span><span class="mus-t num">${x ? x.time : ''}</span><span class="mus-c">${x ? esc(x.ch) : ''}</span></div>`;
          }).join('')}
        </div>
        <p class="muted">매주 같은 시간 기준이에요. 결방·특집은 스케줄 탭에서 확인해 주세요.</p>
        <button type="button" class="btn small primary mus-guide" data-goguide="music">음방별 투표 방법 보기</button>
      </div>`;
    showModal(m);
  }

  // 오늘 화면에 붙는 한 줄: 다음 일정
  function schNextLine() {
    const t = today();
    const ym = t.slice(0, 7);
    if (!state.sch[ym]) schLoad(ym);
    const next = schAll(ym).concat(state.sch[ymAdd(ym, 1)] ? schAll(ymAdd(ym, 1)) : []).find((e) => !e.cont && e.date >= t);
    if (!next) return '';
    const n = diffDays(t, next.date);
    return `<a class="sch-next" href="#schedule/${next.date}"><span class="sch-next-k">${n === 0 ? '오늘' : `D-${n}`}</span><span class="sch-next-t">${esc(next.title)}</span><span class="sch-next-d">${mdw(next.date)}${next.time ? ' ' + esc(next.time) : ''}</span></a>`;
  }
  function renderSchedule() {
    const t = today();
    // 주소로 날짜가 오면 (…/schedule#2026-11-03) 그 날을 열어 줌
    const arg = route().arg || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(arg) && arg !== state.schArg) { state.schMonth = arg.slice(0, 7); state.schSel = arg; state.schQ = ''; }
    state.schArg = arg;
    if (!state.schMonth) state.schMonth = t.slice(0, 7);
    const ym = state.schMonth;
    // 이 달 + 앞뒤 달을 미리 불러 둠 (검색용)
    [-1, 0, 1, 2].forEach((n) => schLoad(ymAdd(ym, n)));
    if (!state.schPickYear) state.schPickYear = +ym.slice(0, 4);
    return `
      <div class="cal-head sch-head">
        <button type="button" class="sch-title" data-schpick aria-expanded="${state.schPick}"><h1>${+ym.slice(5)}월 스케줄</h1><span class="sch-year">${ym.slice(0, 4)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg></button>
        <div class="cal-nav">
          <button class="btn small" type="button" data-schmonth="-1" aria-label="이전 달">‹</button>
          <button class="btn small" type="button" data-schmonth="0">오늘</button>
          <button class="btn small" type="button" data-schmonth="1" aria-label="다음 달">›</button>
        </div>
      </div>
      ${state.schPick ? schPickHtml() : ''}
      ${musicVoteStrip()}
      <div class="sch-tools">
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
      const q = document.getElementById('sch-q');
      if (q) { e.preventDefault(); q.focus(); }
    }
    if (e.key === 'Escape' && e.target.id === 'sch-q' && state.schQ) { e.target.value = ''; state.schQ = ''; schRefresh(); }
  });
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
      const side = document.getElementById('sch-side');
      if (side && state.schSel && window.matchMedia('(max-width: 899px)').matches) side.scrollIntoView({ block: 'start' });
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
    if ((el = g('[data-schsrc]'))) { state.schSrc = el.dataset.schsrc; schRefresh(); return true; }
    if ((el = g('[data-schtype]'))) { state.schType = el.dataset.schtype; schRefresh(); return true; }
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
      const text = `리센느 ${longLabel(d)} 스케줄`;
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

  // ---------- 연합 ----------
  function renderAlliances() {
    const t = today();
    const all = state.data.alliances;
    if (!all.length) return '<section class="page-head"><h1>연합</h1></section><div class="card empty"><strong>등록된 연합이 없어요</strong></div>';
    const order = { live: 0, soon: 1, tbd: 2, end: 3 };
    const sorted = all.slice().sort((a, b) => order[allyStatus(a, t)] - order[allyStatus(b, t)] || (a.end || '9').localeCompare(b.end || '9'));
    // 주고받는 것 한 줄: 무엇을 · 어떤 투표/스밍 · 기간·횟수 (해시태그·인증은 오늘 화면에 있음)
    const ex = (it) => {
      const st = itemStatus(it, t);
      const when = it.tbd ? '기간 미정' : it.end ? (st === 'end' ? '끝남' : `~${md(it.end)}`) : '';
      const sub = [it.qty, when].filter(Boolean).join(' · ');
      return `<li class="ex ${st === 'end' ? 'is-end' : ''}">
          <span class="ex-camp" style="--c:${campColor(it.camp)}">${esc(it.camp || '기타')}</span>
          <b class="ex-title">${esc(it.title)}</b>
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
        a.account ? (a.accountUrl ? `<a class="xlink" href="${esc(a.accountUrl)}" target="_blank" rel="noopener"><i aria-hidden="true">X</i>${esc(a.account)}<span class="sr">(X에서 열기)</span></a>` : esc(a.account)) : '',
        a.state ? esc(a.state) : '',
        a.link ? `<a href="${esc(a.link)}" target="_blank" rel="noopener">공지 ↗</a>` : '',
      ].filter(Boolean).join(' · ');
      return `
        <article class="card ally2 st-${allyStatus(a, t)}" style="--c:${esc(a.color)}">
          <header class="ally2-head">
            <div><h2>리센느 × ${esc(a.artist)}</h2><p class="num">${a.fandom ? `${esc(a.fandom)}` : ''}${a.fandom && period ? ' · ' : ''}${period}</p></div>
            ${statusBadge[allyStatus(a, t)]}
          </header>
          <div class="ex-cols">${col(a, 'give')}${col(a, 'get')}</div>
          ${extra || a.memo ? `<footer class="ally2-foot">${extra}${a.memo ? `${extra ? '<br>' : ''}${esc(a.memo)}` : ''}</footer>` : ''}
        </article>`;
    };
    return `
      <section class="page-head"><h1>연합 ${all.length}</h1><p>진행중 ${counts.live} · 시작 전 ${counts.soon} · 협의중 ${counts.tbd} · 끝남 ${counts.end}</p></section>
      <div class="filter-chips" role="group" aria-label="상태로 걸러 보기">
        ${F.map(([id, label, n]) => `<button type="button" class="fchip ${f === id ? 'on' : ''}" data-allyf="${id}" aria-pressed="${f === id}">${label} <span class="num">${n}</span></button>`).join('')}
      </div>
      <div class="ally2-list">${list.map(card).join('')}</div>
      ${sourceLine()}`;
  }

  // ---------- 투표 가이드 ----------
  function renderGuides() {
    const all = state.data.guides;
    const cats = ['전체', '음방', ...new Set(all.map((g) => g.category))];
    if (!cats.includes(state.guideFilter)) state.guideFilter = '전체';
    const list = all.filter((g) => state.guideFilter === '전체' || g.category === state.guideFilter);
    const showMusic = state.guideFilter === '전체' || state.guideFilter === '음방';
    const t = today();
    const body = list.length ? list.map((g) => {
      const using = state.data.items.filter((x) => x.guide === g && ['live', 'soon'].includes(itemStatus(x, t)));
      return `
      <article class="card guide" id="guide-${esc(g.id)}">
        <div class="ally-head"><h2>${esc(g.platform)}</h2><span class="tag">${esc(g.category)}</span></div>
        ${g.where ? `<p class="where">${esc(g.where)}</p>` : ''}
        ${g.steps.length ? `<h3>방법</h3><ol class="steps">${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
        ${g.proof.length || g.image || g.category === '투표' ? '<h3>인증 방법</h3>' : ''}
        ${g.proof.length ? `<div class="proof-box">${g.proof.map(esc).join('<br>')}</div>` : ''}
        ${g.image ? `<a class="shot" href="${esc(g.image)}" target="_blank" rel="noopener"><img src="${esc(g.image)}" alt="${esc(g.platform)} 인증 캡처 예시"></a>` : ''}
        ${g.category === '투표' ? `<div class="shot-check"><p>캡처에 꼭 보여야 할 것</p><ul><li>오늘 날짜 (휴대폰 상단 시계 또는 투표 이력의 날짜)</li><li>투표 완료 문구 또는 투표 이력</li><li>투표한 아티스트 이름</li></ul><p class="muted">닉네임·프로필 사진은 가려도 돼요. 위쪽 도구의 '인증샷 워터마크'로 도용을 막을 수 있어요.</p></div>` : ''}
        ${g.caution ? `<p class="caution">${esc(g.caution)}</p>` : ''}
        ${using.length ? `<h3>이 플랫폼을 쓰는 일정</h3><ul class="using">${using.map((x) => `<li>${kindPill(x)} ${campBadge(x.camp, true)} ${esc(x.title)} <span class="muted">${periodText(x)}</span></li>`).join('')}</ul>` : ''}
        ${g.link ? `<div class="task-actions"><a class="btn small primary" href="${esc(g.link)}" target="_blank" rel="noopener">${esc(g.platform)} 바로가기 ↗</a></div>` : ''}
      </article>`;
    }).join('') : (showMusic ? '' : '<div class="card empty"><strong>등록된 가이드가 없어요</strong>시트의 "가이드" 탭에 추가해 주세요.</div>');
    return `
      <section class="page-head"><h1>투표 가이드</h1><p>플랫폼별 위치·방법·인증 방법</p></section>
      ${toolsBar()}
      ${cats.length > 2 ? `<div class="filter">${cats.map((c) => `<button type="button" data-filter="${esc(c)}" class="${c === state.guideFilter ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
      ${showMusic ? musicGuides(t) : ''}
      ${showMusic && list.length ? '<h2 class="section-title">투표 · 스밍 가이드</h2>' : ''}
      <div class="guides">${body}</div>
      ${sourceLine()}`;
  }
  function musicGuides(t) {
    const apps = musicAppearances();
    const pres = musicPrevotes();
    const appBtn = (keys, extra) => {
      const list = keys.filter((k) => APPS[k]);
      if (!list.length) return '';
      const many = list.length > 1;
      return `<div class="mg-app">
          <div class="mg-btns${many ? ' many' : ''}">${list.map((k) => `<a class="btn primary" href="${esc(appHref(k))}"${appTarget(k)} rel="noopener" data-app="${k}">${esc(APPS[k].name)}${many ? ' 투표' : ' 앱에서 투표'}</a>`).join('')}${extra || ''}</div>
          ${PHONE ? '<span class="mg-get">앱이 있으면 바로 열리고, 없으면 설치 화면으로 가요</span>' : ''}
        </div>`;
    };
    const box = (title, v, cls, m) => `<section class="mg-box ${cls || ''}">
        <div class="mg-box-h"><h3>${title}</h3><span>${esc(v ? v.app : '')}</span></div>
        ${v ? `<p class="mg-period"><span>언제</span>${esc(v.when)}</p>
        <ol class="mg-steps">${(v.steps || [v.where]).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
        <dl>
          ${v.ticket ? `<dt>투표권</dt><dd>${esc(v.ticket)}</dd>` : ''}
          <dt>투표 수</dt><dd>${esc(v.limit)}</dd>
          <dt>반영</dt><dd>${esc(v.weight)}</dd></dl>
        ${appBtn(v.appKeys || [v.appKey], cls === 'live' && m.sms ? `<a class="btn sms mg-sms" href="sms:${encodeURIComponent(m.sms.to)}?&body=${encodeURIComponent(m.sms.body)}">문자 ${esc(m.sms.to)}</a>` : '')}`
        : '<p class="mg-none">실시간 투표가 없어요.<br>사전투표가 팬 투표 점수의 전부예요.</p>'}
      </section>`;
    const card = (m) => {
      const mine = apps.filter((a) => a.show === m && a.date >= t).map((a) => `<li><b>${mdw(a.date)} ${m.time}</b> 출연${a.top ? ' · 1위 후보' : ''}${m.live ? ' · 실시간 투표' : ''}</li>`)
        .concat(pres.filter((r) => r.show === m && r.end.date >= t).map((r) => `<li><b>사전투표</b> ${r.start ? mdw(r.start.date) + ' ' : ''}~ ${mdw(r.end.date)}${r.end.time ? ' ' + r.end.time : ''}</li>`));
      return `
      <article class="card guide mg" id="guide-music-${m.id}">
        <header class="mg-head">
          <span class="mg-day" aria-label="${WD[m.day]}요일">${WD[m.day]}</span>
          <div class="mg-title"><h2>${esc(m.name)}</h2><small>${esc(m.sub)}</small></div>
          <div class="mg-air"><b class="num">${m.time}</b><span>${esc(m.ch)}</span></div>
        </header>
        <p class="mg-chart"><span>1위 집계</span>${esc(m.chart)}</p>
        ${m.parts ? `<details class="mg-parts"><summary>점수 항목 · 집계 기간</summary><dl>${m.parts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${m.partsSrc ? `<small>출처: ${esc(m.partsSrc)}</small>` : ''}</details>` : ''}
        <div class="mg-grid">${box('사전투표', m.pre, '', m)}${box('실시간 투표', m.live, 'live', m)}</div>
        ${m.tip ? `<p class="mg-tip">${esc(m.tip)}</p>` : ''}
        ${m.after ? `<p class="task-memo">${esc(m.after)}</p>` : ''}
        <div class="mg-mine"><h3>리센느 일정</h3>
        ${mine.length ? `<ul class="using">${mine.join('')}</ul>` : '<p class="muted">출연이나 사전투표 후보가 확정되면 여기와 오늘 할 일에 보여요.</p>'}</div>
        ${m.links ? `<div class="mg-links"><span>공식 안내</span>${m.links.map(([n, u]) => `<a class="btn small" href="${esc(u)}" target="_blank" rel="noopener">${esc(n)} ↗</a>`).join('')}</div>` : ''}
      </article>`;
    };
    const order = [1, 2, 3, 4, 5, 6, 0].map((d) => MUSIC_SHOWS.find((m) => m.day === d)).filter(Boolean);
    return `
      <section class="mg-section" id="guide-music">
        <h2 class="section-title">음악방송 투표</h2>
        <p class="mg-lead">음방마다 앱 · 기간 · 투표 수가 달라요. 기간은 회차마다 바뀔 수 있으니 투표 전에 소속사 · 방송사 공지를 꼭 확인해 주세요.</p>
        <div class="card mg-table" role="table" aria-label="음방별 투표 한눈에">
          <div class="mg-tr mg-th" role="row"><span role="columnheader">방송</span><span role="columnheader">사전투표</span><span role="columnheader">실시간</span></div>
          ${order.map((m) => `<button type="button" class="mg-tr" role="row" data-goguide="music-${m.id}"><span role="cell"><b>${esc(m.name)}</b><small><em>${WD[m.day]}</em> ${m.time} · ${esc(m.ch)}</small></span><span role="cell">${esc(m.pre.short || m.pre.app.replace(/\(.*\)/, ''))}<small>${esc([m.span, m.pre.qty].filter(Boolean).join(' · '))}</small></span><span role="cell">${m.live ? `${esc(m.live.short || m.live.app.replace(/\(.*\)/, ''))}<small>${esc(m.live.qty || '방송 중')}</small>` : '<i>없음</i>'}</span></button>`).join('')}
        </div>
        <div class="mg-cards">${order.map(card).join('')}</div>
      </section>`;
  }

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

  // ---------- 화면 전환 ----------
  // ---------- 주소 ----------
  // 화면마다 주소 경로가 달라야 방문 통계(Cloudflare)에서 화면별로 나뉘어요.
  //   …/todo/            오늘
  //   …/todo/calendar    기간표
  //   …/todo/alliances   연합
  //   …/todo/guides#mma  투표 가이드 (# 뒤는 가이드 아이디)
  // 예전 링크(#calendar, #guides/mma)도 그대로 열리고, 새 주소로 바뀌어요.
  const TABS = ['today', 'calendar', 'schedule', 'alliances', 'guides'];
  const BASE = (() => {
    const sc = document.querySelector('script[src*="app.js"]');
    return sc ? new URL('./', sc.src).pathname : '/';
  })();
  function route() {
    const path = decodeURIComponent(location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : '').replace(/\/+$/, '').replace(/index\.html$/, '');
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    let tab, arg;
    if (path && TABS.includes(path.split('/')[0])) { tab = path.split('/')[0]; arg = h || path.split('/')[1]; }
    else { [tab, arg] = h.split('/'); }
    return { tab: TABS.includes(tab) ? tab : 'today', arg: arg || undefined };
  }
  const urlFor = (tab, arg) => BASE + (tab === 'today' ? '' : tab) + (arg ? '#' + encodeURIComponent(arg) : '');
  function go(tab, arg, replace) {
    const url = urlFor(tab, arg);
    if (url !== location.pathname + location.hash) history[replace ? 'replaceState' : 'pushState'](null, '', url);
    if (tab === 'guides' && arg) state.guideFilter = '전체';
    render();
  }
  // 예전 # 주소로 들어왔으면 새 주소로 바꿔 둠 (기록은 하나 그대로)
  function normalizeUrl() {
    const { tab, arg } = route();
    const want = urlFor(tab, arg);
    if (want !== location.pathname + location.hash) history.replaceState(null, '', want);
  }
  function render(opts) {
    if (!state.data) return;
    const { tab, arg } = route();
    state.renderedDate = today();
    document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    $app.innerHTML = { today: renderToday, calendar: renderCalendar, schedule: renderSchedule, alliances: renderAlliances, guides: renderGuides }[tab]();
    const keep = opts && opts.keepScroll;
    if (tab === 'guides' && arg && !keep) {
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
  function openMelon(href) {
    const ua = navigator.userAgent || '';
    const isAndroid = /android/i.test(ua);
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    if (!isAndroid && !isIOS) return false;
    const web = href.replace(/^https?:\/\/(www\.)?melon\.com/i, 'https://m2.melon.com');
    const enc = encodeURIComponent(web);
    if (isAndroid) {
      location.href = `intent://webview?url=${enc}&type=SA#Intent;scheme=melonapp;package=com.iloen.melon;S.browser_fallback_url=${encodeURIComponent(web)};end;`;
    } else {
      let left = false;
      const onHide = () => { if (document.hidden) left = true; };
      document.addEventListener('visibilitychange', onHide);
      location.href = `melonapp://webview?url=${enc}`;
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
    const text = new URL(href).searchParams.get('text') || '';
    const msg = encodeURIComponent(text);
    if (isAndroid) {
      location.href = `intent://post?message=${msg}#Intent;scheme=twitter;package=com.twitter.android;S.browser_fallback_url=${encodeURIComponent(href)};end;`;
    } else {
      let left = false;
      const onHide = () => { if (document.hidden) left = true; };
      document.addEventListener('visibilitychange', onHide);
      location.href = `twitter://post?message=${msg}`;
      setTimeout(() => {
        document.removeEventListener('visibilitychange', onHide);
        if (!left && !document.hidden) location.href = href; // 앱이 안 열렸으면 웹으로
      }, 1600);
    }
    return true;
  }
  // 음방 투표 가이드로 (시간표 창은 #app 밖에 있어서 문서 전체에서 받아요)
  document.addEventListener('click', (e) => {
    const gg = e.target.closest && e.target.closest('[data-goguide]');
    if (!gg) return;
    e.preventDefault();
    const m = document.getElementById('music');
    if (m && m.classList.contains('show')) hideModal(m);
    state.guideFilter = '음방';
    go('guides', gg.dataset.goguide);
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

  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || !/^https?:\/\/(www\.|m2\.)?melon\.com\//i.test(a.href)) return;
    if (openMelon(a.href)) e.preventDefault();
  }, true);

  $app.addEventListener('click', (e) => {
    const cp = e.target.closest('[data-copy]');
    if (cp) { copyText(cp.dataset.copy, cp.dataset.copyLabel); return; }
    if (e.target.closest('[data-intro-close]')) { try { localStorage.setItem('rs-intro', '1'); } catch (er) { /* 무시 */ } render({ keepScroll: true }); return; }
    if (e.target.closest('[data-intro-open]')) { try { localStorage.removeItem('rs-intro'); } catch (er) { /* 무시 */ } render(); scrollTop0(true); return; }
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
    const chk = e.target.closest('[data-check]');
    if (chk) { toggleCheck(chk.dataset.date, chk.dataset.check); render({ keepScroll: true }); focusAfter(`[data-check="${CSS.escape(chk.dataset.check)}"]`); return; }
    if (route().tab === 'schedule' && schClick(e)) return;
    const day = e.target.closest('[data-day]');
    if (day) { state.calSel = day.dataset.day; state.calMonth = day.dataset.day.slice(0, 7); render({ keepScroll: true }); return; }
    const cf = e.target.closest('[data-camp]');
    if (cf) {
      state.campFilter = !cf.dataset.camp || state.campFilter === cf.dataset.camp ? '' : cf.dataset.camp;
      render({ keepScroll: true });
      return;
    }
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

  // 사이트 안 # 링크는 새 주소로 이동 (페이지를 다시 불러오지 않음)
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const [tab, arg] = decodeURIComponent(a.getAttribute('href').slice(1)).split('/');
    if (!TABS.includes(tab)) return;
    e.preventDefault();
    go(tab, arg);
  });
  window.addEventListener('popstate', () => render());
  window.addEventListener('hashchange', () => {
    normalizeUrl();
    if (route().tab === 'guides' && route().arg) state.guideFilter = '전체';
    render();
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
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#101013' : '#f2f4f6'));
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

  if (CFG.SITE_TITLE) { document.getElementById('siteTitle').textContent = CFG.SITE_TITLE; if (!document.title.startsWith(CFG.SITE_TITLE)) document.title = CFG.SITE_TITLE; }

  normalizeUrl();
  cleanOldChecks();
  load();
  // 오프라인에서도 열리게 (https 또는 localhost에서만)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(() => {}); });
  }
})();
