(function () {
  'use strict';

  const CFG = window.SITE_CONFIG || {};
  const TZ = 'Asia/Seoul';
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const PALETTE = ['#7c5cff', '#ff7aa8', '#3bb8a6', '#f4a13b', '#4a90e2', '#c46bd8', '#e0604f', '#6cbf4a'];
  const REFRESH_MS = 5 * 60 * 1000;
  const CACHE_KEY = 'rs-cache-v2';
  const KIND = {
    give: { label: '줄 것', long: '우리가 줄 것' },
    get: { label: '받을 것', long: '우리가 받을 것' },
    self: { label: '자체', long: '리센느 자체' },
  };

  const $app = document.getElementById('app');
  const $notice = document.getElementById('notice');
  const state = { data: null, loadedAt: 0, source: '', renderedDate: '', calMonth: '', calSel: '', calView: 'grid', guideFilter: '전체' };
  state.kindTab = 'give';
  try {
    state.calView = localStorage.getItem('rs-calview') || 'grid';
    state.kindTab = localStorage.getItem('rs-kindtab') === 'get' ? 'get' : 'give';
  } catch (e) { /* 무시 */ }

  // 줄 것 / 받을 것 전환 탭
  function kindSeg(giveCount, getCount) {
    const n = (v) => (v == null ? '' : ` <i class="seg-n">${v}</i>`);
    return `
      <div class="seg kind-seg" role="tablist">
        <button type="button" role="tab" data-kindtab="give" aria-selected="${state.kindTab === 'give'}" class="give ${state.kindTab === 'give' ? 'on' : ''}">우리가 할 일${n(giveCount)}</button>
        <button type="button" role="tab" data-kindtab="get" aria-selected="${state.kindTab === 'get'}" class="get ${state.kindTab === 'get' ? 'on' : ''}">받을 것${n(getCount)}</button>
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
        title: r['내용'] || r['할일'] || '(내용 없음)',
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
    if (st === 'soon') return `<span class="status soon">${diffDays(d, it.start)}일 후</span>`;
    if (st === 'tbd') return '<span class="status tbd">협의중</span>';
    return '<span class="status end">종료</span>';
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
    : '<span class="tag"><i class="dot" style="--c:var(--accent)"></i>리센느</span>';
  const tagsHtml = (tags) => tags.length
    ? `<div class="hashtags">${tags.map((t) => `<button type="button" class="hashtag" data-copy="${esc(t)}" aria-label="${esc(t)} 복사">${esc(t)}</button>`).join('')}</div>`
    : '';

  function deadlineHtml(it, date, done) {
    if (it.deadline == null) return '';
    const now = kstNow();
    if (date === now.date && !done) {
      const left = it.deadline - now.min;
      if (left < 0) return `<span class="chip over">${hhmm(it.deadline)} 마감됨</span>`;
      const txt = left >= 60 ? `${Math.floor(left / 60)}시간 ${left % 60}분 남음` : `${left}분 남음`;
      return `<span class="chip ${left <= 120 ? 'soon' : ''}">${hhmm(it.deadline)} 마감 · ${txt}</span>`;
    }
    return `<span class="chip">${hhmm(it.deadline)} 마감</span>`;
  }
  function metaChips(it, date, done) {
    const parts = [];
    if (it.platform) parts.push(`<span>${esc(it.platform)}</span>`);
    if (it.window) parts.push(`<span>${esc(it.window)}</span>`);
    parts.push(`<span class="num">${periodText(it)}${it.end && it.repeat !== '1회' && date <= it.end ? ` · ${dday(date, it.end)}` : ''}</span>`);
    const dl = deadlineHtml(it, date, done);
    return `<div class="chips-row">${dl}<p class="meta">${parts.join('<i class="sep">·</i>')}</p></div>`;
  }

  function todoCard(it, date, checks) {
    const done = checks.has(it.id);
    const actions = [
      it.link ? `<a class="btn small primary" href="${esc(it.link)}" target="_blank" rel="noopener">하러 가기 ↗</a>` : '',
      it.guide ? `<a class="btn small" href="#guides/${encodeURIComponent(it.guide.id)}">${esc(it.guide.platform)} 가이드</a>` : '',
    ].join('');
    return `
      <article class="card task ${done ? 'done' : ''} ${it.camp ? 'has-camp' : ''}" style="--cc:${campColor(it.camp || '')}">
        <button class="check" type="button" data-check="${esc(it.id)}" data-date="${date}" aria-pressed="${done}" aria-label="${esc(it.title)} 완료 표시">
          <svg viewBox="0 0 24 24"><path d="M5 12.5l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="task-body">
          <div class="task-top">${campBadge(it.camp)}${kindPill(it)}${whoTag(it)}</div>
          <h3 class="task-title">${esc(it.title)}</h3>
          ${metaChips(it, date, done)}
          ${tagsHtml(it.tags)}
          ${it.memo ? `<p class="task-memo">${esc(it.memo)}</p>` : ''}
          ${actions ? `<div class="task-actions">${actions}</div>` : ''}
          ${proofBlock(it)}
        </div>
      </article>`;
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
      tweet || alt.length ? '<button type="button" class="btn small" data-wm>인증샷 워터마크</button>' : '',
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
  const shadowbanCard = () => `
    <details class="card sban">
      <summary>X 인증 전에 서치밴 확인하기</summary>
      <div class="sban-body">
        <p>서치밴(검색 제한)에 걸리면 해시태그가 검색에 안 떠서 집계에서 빠질 수 있어요.</p>
        <ul>
          <li><b>서치밴 정상</b> → X 인증으로 진행 (권장)</li>
          <li><b>서치밴 확인됨</b> → 구글폼 또는 음원총공팀 카톡으로 인증</li>
        </ul>
        <p class="muted">서치밴이 아닌데 X 게시가 어렵다면, 구글폼·카톡으로 인증한 뒤 #2026MAMAVOTE #RESCENE 태그 게시물을 리트윗(RT)해 주세요.</p>
        <a class="btn small" href="${SHADOWBAN_URL}" target="_blank" rel="noopener">내 계정 서치밴 확인하기 ↗</a>
      </div>
    </details>`;

  function getCard(it, date) {
    return `
      <article class="card mini ${it.camp ? 'has-camp' : ''}" style="--cc:${campColor(it.camp || '')}">
        <div class="task-top">${campBadge(it.camp)}${kindPill(it)}${whoTag(it)}${it.ally && it.ally.fandom ? `<span class="muted">${esc(it.ally.fandom)}가 해줘요</span>` : ''}</div>
        <h3 class="task-title">${esc(it.title)}</h3>
        ${metaChips(it, date, false)}
        ${tagsHtml(it.tags)}
        ${it.memo ? `<p class="task-memo">${esc(it.memo)}</p>` : ''}
      </article>`;
  }

  function sortTodos(list, checks) {
    return list.sort((a, b) => {
      const da = checks.has(a.id), db = checks.has(b.id);
      if (da !== db) return da ? 1 : -1;
      // 같은 투표끼리 붙여서 보이게
      return campOrder(a.camp) - campOrder(b.camp) || (a.camp || '').localeCompare(b.camp || '', 'ko') || (a.deadline ?? 9999) - (b.deadline ?? 9999) || (a.end || '9').localeCompare(b.end || '9') || a.title.localeCompare(b.title, 'ko');
    });
  }

  // 그날 투표 종류별 요약 칩 (누르면 그 투표만 모아 보기)
  function campStrip(allTodos, allGets) {
    const map = new Map();
    allTodos.forEach((x) => { if (x.camp) { const m = map.get(x.camp) || { g: 0, r: 0 }; m.g++; map.set(x.camp, m); } });
    allGets.forEach((x) => { if (x.camp) { const m = map.get(x.camp) || { g: 0, r: 0 }; m.r++; map.set(x.camp, m); } });
    if (!map.size) return '';
    const camps = [...map.entries()].sort((a, b) => campOrder(a[0]) - campOrder(b[0]) || a[0].localeCompare(b[0], 'ko'));
    return `
      <div class="camp-strip" aria-label="투표 종류별 모아보기">
        ${camps.map(([c, m]) => `
          <button type="button" class="camp-chip ${state.campFilter === c ? 'on' : ''}" data-camp="${esc(c)}" style="--cc:${campColor(c)}" aria-pressed="${state.campFilter === c}">
            <span class="cc-name"><i class="camp-dot"></i>${esc(c)}</span>
            <span class="cc-n">${m.g ? `<i class="kind give">줄 ${m.g}</i>` : ''}${m.r ? `<i class="kind get">받 ${m.r}</i>` : ''}</span>
          </button>`).join('')}
      </div>
      ${state.campFilter && map.has(state.campFilter) ? `<p class="camp-filter-note">${campBadge(state.campFilter)} 만 보는 중 · <button type="button" class="linkish" data-camp="">전체 보기</button></p>` : ''}`;
  }

  function dayDetail(date) {
    const checks = getChecks(date);
    const allTodos = sortTodos(todosFor(date), checks);
    const allGets = getsFor(date).sort((a, b) => campOrder(a.camp) - campOrder(b.camp) || (a.camp || '').localeCompare(b.camp || '', 'ko') ||(a.end || '9').localeCompare(b.end || '9'));
    const strip = campStrip(allTodos, allGets);
    const f = state.campFilter && [...allTodos, ...allGets].some((x) => x.camp === state.campFilter) ? state.campFilter : '';
    const todos = f ? allTodos.filter((x) => x.camp === f) : allTodos;
    const gets = f ? allGets.filter((x) => x.camp === f) : allGets;
    const done = todos.filter((x) => checks.has(x.id)).length;
    return {
      todos: allTodos, gets: allGets, done: allTodos.filter((x) => checks.has(x.id)).length,
      html: `
        ${strip}
        ${kindSeg(todos.length, gets.length)}
        <!-- 휴대폰: 탭으로 한쪽만 / 넓은 화면: 두 칸 나란히 -->
        <div class="day-cols show-${state.kindTab}">
          <section class="day-col give" aria-label="우리가 할 일">
            <h2 class="col-title">우리가 할 일 <span class="num">${todos.length ? `${done}/${todos.length} 완료` : '0'}</span></h2>
            ${todos.length ? `<div class="task-list">${todos.map((x) => todoCard(x, date, checks)).join('')}</div>` : '<div class="card empty">이 날 우리가 할 일은 없어요</div>'}
          </section>
          <section class="day-col get" aria-label="받을 것">
            <h2 class="col-title">받을 것 <span class="num">${gets.length}</span><small>연합팀이 리센느에게 해주는 것</small></h2>
            ${gets.length ? `<div class="task-list">${gets.map((x) => getCard(x, date)).join('')}</div>` : '<div class="card empty">이 날 받는 지원은 없어요</div>'}
          </section>
        </div>`,
    };
  }

  function sourceLine() {
    const t = new Date(state.loadedAt).toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    const src = state.source === 'sheet' ? `시트 반영 ${t}`
      : state.source === 'cache' ? `마지막 시트 저장본 (${t})`
      : '사이트 정리본 기준';
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
      if (it.end && it.repeat !== '1회' && it.end >= d && diffDays(d, it.end) <= 3) upcoming.push({ it, date: it.end, what: '마감' });
    });
    upcoming.sort((a, b) => a.date.localeCompare(b.date) || (a.what === '마감' ? -1 : 1));
    return `
      <section class="page-head">
        <h1>${longLabel(d)}</h1>
        <p>${total ? (det.done === total ? '오늘 할 일을 모두 끝냈어요. 수고했어요!' : `오늘 우리가 할 일 ${total - det.done}개 남았어요`) : '오늘은 우리가 할 일이 없어요'} · 받는 지원 ${det.gets.length}개</p>
        ${total ? `<div class="progress-wrap"><div class="progress"><i style="width:${pct}%"></i></div><span class="progress-label">${det.done}/${total}</span></div>` : ''}
      </section>
      ${shadowbanCard()}
      ${det.html}
      ${upcoming.length ? `
        <h2 class="section-title">다가오는 일정</h2>
        <div class="card list">
          ${upcoming.map(({ it, date, what }) => `
            <div class="list-row">
              <span class="list-date">${mdw(date)}</span>
              <span class="list-body">${kindPill(it)} <b>${esc(it.ally ? it.ally.artist : '리센느')}</b> ${esc(it.title)}</span>
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
      cells += `<button type="button" class="${classes}" data-day="${d}" aria-label="${longLabel(d)} 우리가 할 일 ${g}개, 받을 것 ${r}개">
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
      <p class="legend-line"><i class="cnt give">n</i> 우리가 할 일 <i class="cnt get">n</i> 받을 것 <i class="cal-start inline"></i> 새로 시작</p>
      <h2 class="day-head">${longLabel(state.calSel)}</h2>
      ${det.html}`;
  }

  function timeline() {
    const t = today();
    const { first, last } = monthBounds();
    const N = diffDays(first, last) + 1;
    const pos = (d) => (diffDays(first, d) / N) * 100;
    const inMonth = state.data.items.filter((it) => {
      if (it.tbd) return false;
      const s = it.start || '0000-01-01';
      const e = it.repeat === '1회' ? (it.start || it.end) : (it.end || '9999-12-31');
      return s <= last && e >= first;
    });
    const tbd = state.data.items.filter((it) => it.tbd);
    const ticks = [1, 8, 15, 22, 29].filter((n) => n <= N)
      .map((n) => `<span style="left:${((n - 1) / N) * 100}%">${+state.calMonth.slice(5)}.${n}</span>`).join('');
    const todayLine = t >= first && t <= last ? `<i class="tl-today" style="left:${((diffDays(first, t) + 0.5) / N) * 100}%"></i>` : '';
    const row = (it) => {
      const s = it.start && it.start > first ? it.start : first;
      const eRaw = it.repeat === '1회' ? (it.start || it.end) : it.end;
      const e = eRaw && eRaw < last ? eRaw : last;
      const openL = !it.start || it.start < first;
      const openR = !eRaw || eRaw > last;
      const c = it.ally ? it.ally.color : 'var(--accent)';
      return `
        <div class="tl-row ${itemStatus(it, t) === 'end' ? 'is-end' : ''}">
          <div class="tl-label"><i class="dot" style="--c:${esc(c)}"></i><b>${esc(it.ally ? it.ally.artist : '리센느')}</b>${campBadge(it.camp, true)}<span>${esc(it.title)}</span><em>${periodText(it)}</em></div>
          <div class="tl-track">${todayLine}<i class="tl-bar ${openL ? 'open-l' : ''} ${openR ? 'open-r' : ''}" style="--c:${esc(c)};left:${pos(s)}%;width:${Math.max(((diffDays(s, e) + 1) / N) * 100, 2)}%"></i></div>
        </div>`;
    };
    const group = (kind) => {
      const list = inMonth.filter((x) => x.kind === kind).sort((a, b) => campOrder(a.camp) - campOrder(b.camp) || (a.camp || '').localeCompare(b.camp || '', 'ko') || (a.start || '').localeCompare(b.start || '') || (a.end || '').localeCompare(b.end || ''));
      if (!list.length) return '';
      return `<div class="tl-group"><h3><span class="kind ${kind}">${KIND[kind].label}</span> ${KIND[kind].long} ${list.length}</h3>${list.map(row).join('')}</div>`;
    };
    const isGive = (x) => x.kind !== 'get';
    const wantTab = (x) => (state.kindTab === 'give' ? isGive(x) : !isGive(x));
    const shown = inMonth.filter(wantTab);
    const tbdShown = tbd.filter(wantTab);
    return `
      ${kindSeg(inMonth.filter(isGive).length, inMonth.filter((x) => !isGive(x)).length)}
      <div class="card tl">
        <div class="tl-ticks">${ticks}</div>
        ${state.kindTab === 'give' ? group('give') + group('self') : group('get')}
        ${shown.length ? '' : '<div class="empty">이 달에는 일정이 없어요</div>'}
      </div>
      ${tbdShown.length ? `
        <h2 class="section-title"><span class="status tbd">협의중</span> 기간 미정</h2>
        <div class="card list">${tbdShown.map((it) => `<div class="list-row"><span class="list-body">${kindPill(it)} <b>${esc(it.ally ? it.ally.artist : '리센느')}</b> ${esc(it.title)}${it.memo ? ` <span class="muted">· ${esc(it.memo)}</span>` : ''}</span></div>`).join('')}</div>` : ''}`;
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
      <div class="seg" role="tablist">
        <button type="button" data-view="grid" class="${state.calView === 'grid' ? 'on' : ''}">날짜별</button>
        <button type="button" data-view="timeline" class="${state.calView === 'timeline' ? 'on' : ''}">기간표</button>
      </div>
      ${state.calView === 'timeline' ? timeline() : calendarGrid()}
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
        <div class="item-sub num">${periodText(it)}${it.platform ? ` · ${esc(it.platform)}` : ''}${it.window ? ` · ${esc(it.window)}` : ''}</div>
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
    const statusBadge = { live: '<span class="status live">진행중</span>', soon: '<span class="status soon">예정</span>', tbd: '<span class="status tbd">협의중</span>', end: '<span class="status end">종료</span>' };
    const counts = { live: 0, soon: 0, tbd: 0, end: 0 };
    all.forEach((a) => { counts[allyStatus(a, t)]++; });
    return `
      <section class="page-head"><h1>연합 ${all.length}</h1><p>진행중 ${counts.live} · 예정 ${counts.soon} · 협의중 ${counts.tbd} · 종료 ${counts.end}</p></section>
      ${kindSeg(state.data.items.filter((x) => x.kind === 'give').length, state.data.items.filter((x) => x.kind === 'get').length)}
      ${sorted.map((a) => `
        <article class="card ally" style="--c:${esc(a.color)}">
          <div class="ally-head">
            <div>
              <h2 class="ally-name">리센느 × ${esc(a.artist)}</h2>
              <div class="ally-artist">${a.fandom ? `팬덤 ${esc(a.fandom)}` : ''}${a.account ? ` · ${a.accountUrl ? `<a href="${esc(a.accountUrl)}" target="_blank" rel="noopener">${esc(a.account)}</a>` : esc(a.account)}` : ''}</div>
            </div>
            ${statusBadge[allyStatus(a, t)]}
          </div>
          ${a.start || a.end ? `<div class="ally-period">전체 기간 ${a.start ? md(a.start) : ''} ~ ${a.end ? md(a.end) : ''}</div>` : ''}
          <div class="ally-blocks show-${state.kindTab}">${block(a, 'give')}${block(a, 'get')}</div>
          ${a.state ? `<p class="ally-state"><b>진행 상황</b>${esc(a.state)}</p>` : ''}
          ${a.memo ? `<p class="task-memo">${esc(a.memo)}</p>` : ''}
          ${a.link ? `<div class="ally-foot"><a class="btn small" href="${esc(a.link)}" target="_blank" rel="noopener">공지 보기 ↗</a></div>` : ''}
        </article>`).join('')}
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
        ${g.proof.length || g.image ? '<h3>인증 방법</h3>' : ''}
        ${g.proof.length ? `<div class="proof-box">${g.proof.map(esc).join('<br>')}</div>` : ''}
        ${g.image ? `<a class="shot" href="${esc(g.image)}" target="_blank" rel="noopener"><img src="${esc(g.image)}" alt="${esc(g.platform)} 인증 캡처 예시"></a>` : ''}
        ${g.caution ? `<p class="caution">${esc(g.caution)}</p>` : ''}
        ${using.length ? `<h3>이 플랫폼을 쓰는 일정</h3><ul class="using">${using.map((x) => `<li>${kindPill(x)} ${campBadge(x.camp, true)} ${esc(x.title)} <span class="muted">${periodText(x)}</span></li>`).join('')}</ul>` : ''}
        ${g.link ? `<div class="task-actions"><a class="btn small primary" href="${esc(g.link)}" target="_blank" rel="noopener">${esc(g.platform)} 바로가기 ↗</a></div>` : ''}
      </article>`;
    }).join('') : '<div class="card empty"><strong>등록된 가이드가 없어요</strong>시트의 "가이드" 탭에 추가해 주세요.</div>';
    return `
      <section class="page-head"><h1>투표 가이드</h1><p>플랫폼별 위치·방법·인증 방법</p></section>
      ${shadowbanCard()}
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
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-wm-close]')) m.classList.remove('show'); });
      document.addEventListener('paste', (e) => {
        if (!m.classList.contains('show')) return;
        const imgs = [...(e.clipboardData ? e.clipboardData.items : [])].filter((x) => x.type.startsWith('image/')).map((x) => x.getAsFile());
        if (imgs.length) { wmFiles = imgs.slice(0, 3); makeWatermark(); }
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') m.classList.remove('show'); });
    }
    m.classList.add('show');
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

  $app.addEventListener('click', (e) => {
    const cp = e.target.closest('[data-copy]');
    if (cp) { copyText(cp.dataset.copy, cp.dataset.copyLabel); return; }
    if (e.target.closest('[data-wm]')) { openWatermark(); return; }
    const chk = e.target.closest('[data-check]');
    if (chk) { toggleCheck(chk.dataset.date, chk.dataset.check); render({ keepScroll: true }); return; }
    const day = e.target.closest('[data-day]');
    if (day) { state.calSel = day.dataset.day; state.calMonth = day.dataset.day.slice(0, 7); render({ keepScroll: true }); return; }
    const cf = e.target.closest('[data-camp]');
    if (cf) {
      state.campFilter = state.campFilter === cf.dataset.camp ? '' : cf.dataset.camp;
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
      try { localStorage.setItem('rs-calview', state.calView); } catch (err) { /* 무시 */ }
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
  document.getElementById('refreshBtn').addEventListener('click', load);
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

  if (CFG.SITE_TITLE) { document.getElementById('siteTitle').textContent = CFG.SITE_TITLE; document.title = CFG.SITE_TITLE; }

  cleanOldChecks();
  load();
})();
