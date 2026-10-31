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
    return { alliances, items, guides };
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
  const todosFor = (d) => state.data.items.filter((x) => x.kind !== 'get' && itemOn(x, d));
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
      const raw = { alliances, tasks, guides };
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
      it.link ? `<a class="btn primary" href="${esc(it.link)}" target="_blank" rel="noopener">하러 가기 ↗</a>` : '',
      it.guide ? `<a class="btn" href="#guides/${encodeURIComponent(it.guide.id)}">${esc(it.guide.platform)} 가이드</a>` : '',
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
              <span class="row-sub"><i class="dot" style="--c:${it.ally ? esc(it.ally.color) : 'var(--accent)'}"></i>${esc(whoName(it))}${it.camp ? `<i class="sep">·</i>${esc(it.camp)}` : ''}</span>
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
  const toolsBar = () => `
    <div class="tool-chips" role="group" aria-label="도구">
      <button type="button" class="tchip" data-sban>X 서치밴 확인</button>
      <button type="button" class="tchip" data-wm>인증샷 워터마크</button>
      <button type="button" class="tchip" data-install>홈 화면에 추가</button>
    </div>`;

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
    { id: 'MAMA', color: '#0b6e99' },
    { id: 'MMA', color: '#b8336a' },
    { id: '기타', color: '#6b7280' },
  ];
  const campGroup = (c) => (/^MAMA/i.test(c || '') ? 'MAMA' : /^MMA/i.test(c || '') ? 'MMA' : '기타');
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

  // 정보 기준일 (데이터를 마지막으로 고친 날)
  const updatedDate = () => (state.source === 'sheet' ? today() : normDate(window.DATA_UPDATED || ''));
  const updatedTag = () => (updatedDate() ? `<span class="upd">정보 ${md(updatedDate())} 업데이트</span>` : '');
  function sourceLine() {
    const t = new Date(state.loadedAt).toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    const src = state.source === 'sheet' ? `시트 반영 ${t}`
      : state.source === 'cache' ? `마지막 시트 저장본 (${t})`
      : (updatedDate() ? `정보 업데이트 ${longLabel(updatedDate())}` : '사이트 정리본 기준');
    return `<p class="updated">${src} · 날짜는 한국 시간 기준</p>
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
    const label = (x) => `${esc(whoName(x))} ${esc(x.camp || x.title)}`;
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
      </section>
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
    const ticks = tickDays.map((n) => `<span style="left:${(((n - 1) / N) * 100).toFixed(3)}%">${n}일</span>`).join('');
    const guides = tickDays.slice(1).map((n) => `<i class="tl-guide" style="left:${at((n - 1) / N)}"></i>`).join('');
    const todayLine = t >= first && t <= last ? `<i class="tl-today" style="left:${at((diffDays(first, t) + 0.5) / N)}" aria-hidden="true"></i>` : '';
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
      <div class="cal-controls">${viewSeg()}${kindSeg(inMonth.filter(isGive).length, inMonth.filter((x) => !isGive(x)).length)}</div>
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
      ${state.calView === 'timeline' ? timeline() : viewSeg() + calendarGrid()}
      ${sourceLine()}`;
  }

  // ---------- 연합 ----------
  function renderAlliances() {
    const t = today();
    const all = state.data.alliances;
    if (!all.length) return '<section class="page-head"><h1>연합</h1></section><div class="card empty"><strong>등록된 연합이 없어요</strong>시트의 "연합" 탭에 추가해 주세요.</div>';
    const order = { live: 0, soon: 1, tbd: 2, end: 3 };
    const sorted = all.slice().sort((a, b) => order[allyStatus(a, t)] - order[allyStatus(b, t)] || (a.end || '9').localeCompare(b.end || '9'));
    const itemRow = (it) => `
      <li class="item-row ${itemStatus(it, t) === 'end' ? 'is-end' : ''}">
        <div class="item-main"><div>${campBadge(it.camp, true)}<b>${esc(it.title)}</b></div>${statusPill(it, t)}</div>
        <div class="item-sub num">${periodText(it)}${it.qty ? ` · ${esc(it.qty)}` : ''}${it.platform ? ` · ${esc(it.platform)}` : ''}${it.window ? ` · ${esc(it.window)}` : ''}</div>
        ${it.memo ? `<div class="item-sub muted">${esc(it.memo)}</div>` : ''}
        ${tagsHtml(it.tags)}
      </li>`;
    const block = (a, kind) => {
      const list = a.items.filter((x) => x.kind === kind);
      return `
        <div class="ally-block ${kind}">
          <h3><span class="kind ${kind}">${KIND[kind].label}</span> ${kind === 'give' ? `우리가 ${esc(a.artist)}에게` : `${esc(a.fandom || a.artist)}가 리센느에게`}</h3>
          ${list.length ? `<ul>${list.map(itemRow).join('')}</ul>` : '<p class="muted">없음</p>'}
        </div>`;
    };
    const statusBadge = { live: '<span class="status live">진행중</span>', soon: '<span class="status soon">시작 전</span>', tbd: '<span class="status tbd">협의중</span>', end: '<span class="status end">끝남</span>' };
    const counts = { live: 0, soon: 0, tbd: 0, end: 0 };
    all.forEach((a) => { counts[allyStatus(a, t)]++; });
    const F = [['', '전체', all.length], ['live', '진행중', counts.live], ['soon', '시작 전', counts.soon], ['tbd', '협의중', counts.tbd], ['end', '끝남', counts.end]].filter((x) => x[0] === '' || x[2] > 0);
    const f = F.some((x) => x[0] === state.allyFilter) ? state.allyFilter : '';
    const list = sorted.filter((a) => !f || allyStatus(a, t) === f);
    // 접힌 상태 한 줄 요약: 다음에 끝나는 것
    const nextEnd = (a) => a.items.filter((x) => x.end && x.end >= t && x.repeat !== '1회').sort((x, y) => x.end.localeCompare(y.end))[0];
    const card = (a) => {
      const open = state.allyOpen.has(a.id);
      const give = a.items.filter((x) => x.kind === 'give').length;
      const get = a.items.filter((x) => x.kind === 'get').length;
      const ne = nextEnd(a);
      const rid = 'ally-' + a.id.replace(/[^\w-]/g, '');
      return `
        <article class="card ally ${open ? 'open' : ''}" style="--c:${esc(a.color)}">
          <button type="button" class="ally-toggle" data-ally="${esc(a.id)}" aria-expanded="${open}" aria-controls="${rid}">
            <span class="ally-tt">
              <span class="ally-name">리센느 × ${esc(a.artist)}</span>
              <span class="ally-sum num">줄 것 ${give} · 받을 것 ${get}${ne ? ` · ${ne.end === t ? '오늘 끝' : `${diffDays(t, ne.end)}일 남음`}` : a.start || a.end ? ` · ${a.start ? md(a.start) : ''}~${a.end ? md(a.end) : ''}` : ''}</span>
            </span>
            ${statusBadge[allyStatus(a, t)]}
            ${chevron}
          </button>
          ${open ? `
          <div class="ally-more" id="${rid}">
            <div class="ally-artist">${a.fandom ? `팬덤 ${esc(a.fandom)}` : ''}${a.account ? ` · ${a.accountUrl ? `<a href="${esc(a.accountUrl)}" target="_blank" rel="noopener">${esc(a.account)}</a>` : esc(a.account)}` : ''}${a.start || a.end ? ` · 전체 기간 ${a.start ? md(a.start) : ''} ~ ${a.end ? md(a.end) : ''}` : ''}</div>
            <div class="ally-blocks show-${state.kindTab}" id="ally-panel-${esc(a.id)}">${block(a, 'give')}${block(a, 'get')}</div>
            ${a.state ? `<p class="ally-state"><b>진행 상황</b>${esc(a.state)}</p>` : ''}
            ${a.memo ? `<p class="task-memo">${esc(a.memo)}</p>` : ''}
            ${a.link ? `<div class="ally-foot"><a class="btn small" href="${esc(a.link)}" target="_blank" rel="noopener">공지 보기 ↗</a></div>` : ''}
          </div>` : ''}
        </article>`;
    };
    const allOpen = list.length && list.every((a) => state.allyOpen.has(a.id));
    return `
      <section class="page-head"><h1>연합 ${all.length}</h1><p>진행중 ${counts.live} · 시작 전 ${counts.soon} · 협의중 ${counts.tbd} · 끝남 ${counts.end}</p></section>
      <div class="filter-chips" role="group" aria-label="상태로 걸러 보기">
        ${F.map(([id, label, n]) => `<button type="button" class="fchip ${f === id ? 'on' : ''}" data-allyf="${id}" aria-pressed="${f === id}">${label} <span class="num">${n}</span></button>`).join('')}
      </div>
      <div class="ally-tools">
        ${kindSeg(state.data.items.filter((x) => x.kind === 'give').length, state.data.items.filter((x) => x.kind === 'get').length, '줄 것')}
        <button type="button" class="linkish" data-ally-all="${allOpen ? 'close' : 'open'}">${allOpen ? '모두 접기' : '모두 펼치기'}</button>
      </div>
      <div class="ally-list" id="kind-panel" role="tabpanel" aria-labelledby="tab-${state.kindTab}">${list.map(card).join('')}</div>
      ${sourceLine()}`;
  }

  // ---------- 투표 가이드 ----------
  function renderGuides() {
    const all = state.data.guides;
    const cats = ['전체', ...new Set(all.map((g) => g.category))];
    if (!cats.includes(state.guideFilter)) state.guideFilter = '전체';
    const list = all.filter((g) => state.guideFilter === '전체' || g.category === state.guideFilter);
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
    }).join('') : '<div class="card empty"><strong>등록된 가이드가 없어요</strong>시트의 "가이드" 탭에 추가해 주세요.</div>';
    return `
      ${toolsBar()}
      <section class="page-head"><h1>투표 가이드</h1><p>플랫폼별 위치·방법·인증 방법</p></section>
      ${cats.length > 2 ? `<div class="filter">${cats.map((c) => `<button type="button" data-filter="${esc(c)}" class="${c === state.guideFilter ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
      <div class="guides">${body}</div>
      ${sourceLine()}`;
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
      const text = `${name} · ${today().replace(/-/g, '.')}`;
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
          g.lineWidth = Math.max(2, fs / 9);
          g.strokeStyle = 'rgba(0,0,0,.28)';
          g.strokeText(text, xx, yy);
          g.fillStyle = 'rgba(255,255,255,.42)';
          g.fillText(text, xx, yy);
        }
      }
      g.restore();
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
      const url = URL.createObjectURL(blob);
      const fname = `인증_${today()}.jpg`;
      const canShare = navigator.canShare && navigator.canShare({ files: [new File([blob], fname, { type: 'image/jpeg' })] });
      out.innerHTML = `
        <img src="${url}" alt="워터마크를 넣은 인증샷">
        <div class="proof-actions">
          <a class="btn small primary" href="${url}" download="${fname}">사진 저장</a>
          ${canShare ? '<button type="button" class="btn small" id="wmShare">공유하기</button>' : ''}
        </div>
        <p class="muted">휴대폰에서 "사진 저장"이 안 되면 사진을 길게 눌러 저장하세요.</p>`;
      const sh = document.getElementById('wmShare');
      if (sh) sh.addEventListener('click', () => navigator.share({ files: [new File([blob], fname, { type: 'image/jpeg' })] }).catch(() => {}));
    } catch (e) {
      out.innerHTML = '<p class="caution">사진을 읽지 못했어요. 다른 사진으로 해 주세요.</p>';
    }
  }

  // ---------- 화면 전환 ----------
  function route() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    const [tab, arg] = h.split('/');
    return { tab: ['today', 'calendar', 'alliances', 'guides'].includes(tab) ? tab : 'today', arg };
  }
  function render(opts) {
    if (!state.data) return;
    const { tab, arg } = route();
    state.renderedDate = today();
    document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    $app.innerHTML = { today: renderToday, calendar: renderCalendar, alliances: renderAlliances, guides: renderGuides }[tab]();
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
      window.scrollTo(0, 0);
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
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || !/^https?:\/\/(www\.|m2\.)?melon\.com\//i.test(a.href)) return;
    if (openMelon(a.href)) e.preventDefault();
  }, true);

  $app.addEventListener('click', (e) => {
    const cp = e.target.closest('[data-copy]');
    if (cp) { copyText(cp.dataset.copy, cp.dataset.copyLabel); return; }
    if (e.target.closest('[data-wm]')) { openWatermark(); return; }
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

  window.addEventListener('hashchange', () => {
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
  // 새로고침 뒤 한 번 알려주기
  try {
    if (sessionStorage.getItem('rs-refreshed')) {
      sessionStorage.removeItem('rs-refreshed');
      setTimeout(() => toast(updatedDate() ? `새로고침했어요 · 정보 ${md(updatedDate())} 업데이트` : '새로고침했어요'), 300);
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

  if (CFG.SITE_TITLE) { document.getElementById('siteTitle').textContent = CFG.SITE_TITLE; document.title = CFG.SITE_TITLE; }

  cleanOldChecks();
  load();
  // 오프라인에서도 열리게 (https 또는 localhost에서만)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
})();
