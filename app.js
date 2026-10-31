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
        title: r['내용'] || r['할일'] || '(내용 없음)',
        platform: r['플랫폼'] || (guide ? guide.platform : ''),
        guide, repeat, days, start, end,
        tbd: !start && !end,
        window: r['시간대'],
        deadline: normTime(r['마감시간']),
        tags: tagsOf(r['해시태그']),
        link: linkUrl(r['링크'] || r['투표링크']),
        proof: r['인증방법'],
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
    try {
      if (!CFG.SHEET_ID) throw new Error('시트 ID 없음');
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
      return `<span class="chip ${left <= 120 ? 'soon' : ''}">⏰ ~${hhmm(it.deadline)} · ${txt}</span>`;
    }
    return `<span class="chip">⏰ ~${hhmm(it.deadline)} 마감</span>`;
  }
  function metaChips(it, date, done) {
    const chips = [];
    if (it.platform) chips.push(`<span class="chip">📍 ${esc(it.platform)}</span>`);
    if (it.window) chips.push(`<span class="chip">🕚 ${esc(it.window)}</span>`);
    const dl = deadlineHtml(it, date, done);
    if (dl) chips.push(dl);
    chips.push(`<span class="chip">📅 ${periodText(it)}${it.end && it.repeat !== '1회' && date <= it.end ? ` · ${dday(date, it.end)}` : ''}</span>`);
    return `<div class="chips-row">${chips.join('')}</div>`;
  }

  function todoCard(it, date, checks) {
    const done = checks.has(it.id);
    const actions = [
      it.link ? `<a class="btn small primary" href="${esc(it.link)}" target="_blank" rel="noopener">하러 가기 ↗</a>` : '',
      it.guide ? `<a class="btn small" href="#guides/${encodeURIComponent(it.guide.id)}">${esc(it.guide.platform)} 가이드</a>` : '',
    ].join('');
    return `
      <article class="card task ${done ? 'done' : ''}">
        <button class="check" type="button" data-check="${esc(it.id)}" data-date="${date}" aria-pressed="${done}" aria-label="${esc(it.title)} 완료 표시">
          <svg viewBox="0 0 24 24"><path d="M5 12.5l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="task-body">
          <div class="task-top">${kindPill(it)}${whoTag(it)}</div>
          <h3 class="task-title">${esc(it.title)}</h3>
          ${metaChips(it, date, done)}
          ${tagsHtml(it.tags)}
          ${it.proof ? `<p class="task-proof"><b>인증</b> ${esc(it.proof)}</p>` : ''}
          ${it.memo ? `<p class="task-memo">${esc(it.memo)}</p>` : ''}
          ${actions ? `<div class="task-actions">${actions}</div>` : ''}
        </div>
      </article>`;
  }

  function getCard(it, date) {
    return `
      <article class="card mini">
        <div class="task-top">${kindPill(it)}${whoTag(it)}${it.ally && it.ally.fandom ? `<span class="muted">${esc(it.ally.fandom)}가 해줘요</span>` : ''}</div>
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
      return (a.deadline ?? 9999) - (b.deadline ?? 9999) || (a.end || '9').localeCompare(b.end || '9') || a.title.localeCompare(b.title, 'ko');
    });
  }

  function dayDetail(date) {
    const checks = getChecks(date);
    const todos = sortTodos(todosFor(date), checks);
    const gets = getsFor(date).sort((a, b) => (a.end || '9').localeCompare(b.end || '9'));
    const done = todos.filter((x) => checks.has(x.id)).length;
    return {
      todos, gets, done,
      html: `
        ${kindSeg(todos.length, gets.length)}
        ${state.kindTab === 'give' ? `
          <p class="seg-note"><span class="kind give">줄 것</span><span class="kind self">자체</span> ${todos.length ? `${done}/${todos.length} 완료` : ''}</p>
          ${todos.length ? `<div class="task-list">${todos.map((x) => todoCard(x, date, checks)).join('')}</div>` : '<div class="card empty">이 날 우리가 할 일은 없어요</div>'}` : `
          <p class="seg-note"><span class="kind get">받을 것</span> 연합팀이 리센느에게 해주는 것</p>
          ${gets.length ? `<div class="task-list">${gets.map((x) => getCard(x, date)).join('')}</div>` : '<div class="card empty">이 날 받는 지원은 없어요</div>'}`}`,
    };
  }

  function sourceLine() {
    const t = new Date(state.loadedAt).toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    const src = state.source === 'sheet' ? `시트 반영 ${t}`
      : state.source === 'cache' ? `마지막 시트 저장본 (${t})`
      : '사이트 정리본 기준';
    return `<p class="updated">${src} · 날짜는 한국 시간 기준</p>`;
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
        <p>${total ? (det.done === total ? '오늘 할 일을 모두 끝냈어요! 수고했어요 💜' : `오늘 우리가 할 일 ${total - det.done}개 남았어요`) : '오늘은 우리가 할 일이 없어요'} · 받는 지원 ${det.gets.length}개</p>
        ${total ? `<div class="progress-wrap"><div class="progress"><i style="width:${pct}%"></i></div><span class="progress-label">${det.done}/${total}</span></div>` : ''}
      </section>
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
          <div class="tl-label"><i class="dot" style="--c:${esc(c)}"></i><b>${esc(it.ally ? it.ally.artist : '리센느')}</b><span>${esc(it.title)}</span><em>${periodText(it)}</em></div>
          <div class="tl-track">${todayLine}<i class="tl-bar ${openL ? 'open-l' : ''} ${openR ? 'open-r' : ''}" style="--c:${esc(c)};left:${pos(s)}%;width:${Math.max(((diffDays(s, e) + 1) / N) * 100, 2)}%"></i></div>
        </div>`;
    };
    const group = (kind) => {
      const list = inMonth.filter((x) => x.kind === kind).sort((a, b) => (a.start || '').localeCompare(b.start || '') || (a.end || '').localeCompare(b.end || ''));
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
        <div class="item-main"><b>${esc(it.title)}</b>${statusPill(it, t)}</div>
        <div class="item-sub">📅 ${periodText(it)}${it.platform ? ` · ${esc(it.platform)}` : ''}${it.window ? ` · ${esc(it.window)}` : ''}</div>
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
          ${block(a, state.kindTab)}
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
        ${g.where ? `<p class="where">📍 ${esc(g.where)}</p>` : ''}
        ${g.steps.length ? `<h3>방법</h3><ol class="steps">${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
        ${g.proof.length || g.image ? '<h3>인증 방법</h3>' : ''}
        ${g.proof.length ? `<div class="proof-box">${g.proof.map(esc).join('<br>')}</div>` : ''}
        ${g.image ? `<a class="shot" href="${esc(g.image)}" target="_blank" rel="noopener"><img src="${esc(g.image)}" alt="${esc(g.platform)} 인증 캡처 예시"></a>` : ''}
        ${g.caution ? `<p class="caution">⚠ ${esc(g.caution)}</p>` : ''}
        ${using.length ? `<h3>이 플랫폼을 쓰는 일정</h3><ul class="using">${using.map((x) => `<li>${kindPill(x)} ${esc(x.title)} <span class="muted">${periodText(x)}</span></li>`).join('')}</ul>` : ''}
        ${g.link ? `<div class="task-actions"><a class="btn small primary" href="${esc(g.link)}" target="_blank" rel="noopener">${esc(g.platform)} 바로가기 ↗</a></div>` : ''}
      </article>`;
    }).join('') : '<div class="card empty"><strong>등록된 가이드가 없어요</strong>시트의 "가이드" 탭에 추가해 주세요.</div>';
    return `
      <section class="page-head"><h1>투표 가이드</h1><p>플랫폼별 위치·방법·인증 방법</p></section>
      ${cats.length > 2 ? `<div class="filter">${cats.map((c) => `<button type="button" data-filter="${esc(c)}" class="${c === state.guideFilter ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
      ${body}`;
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
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* 무시 */ }
      ta.remove();
    }
    toast(`${text} 복사했어요`);
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
    if (cp) { copyText(cp.dataset.copy); return; }
    const chk = e.target.closest('[data-check]');
    if (chk) { toggleCheck(chk.dataset.date, chk.dataset.check); render({ keepScroll: true }); return; }
    const day = e.target.closest('[data-day]');
    if (day) { state.calSel = day.dataset.day; state.calMonth = day.dataset.day.slice(0, 7); render({ keepScroll: true }); return; }
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
