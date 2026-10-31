(function () {
  'use strict';

  const CFG = window.SITE_CONFIG || {};
  const TZ = 'Asia/Seoul';
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const PALETTE = ['#7c5cff', '#ff7aa8', '#3bb8a6', '#f4a13b', '#4a90e2', '#c46bd8', '#e0604f', '#6cbf4a'];
  const REFRESH_MS = 5 * 60 * 1000;

  const $app = document.getElementById('app');
  const $notice = document.getElementById('notice');
  const state = { data: null, loadedAt: 0, renderedDate: '', calMonth: '', calSel: '', guideFilter: '전체' };

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
  const longLabel = (s) => { const d = toD(s); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DOW[d.getUTCDay()]})`; };
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  // 시트에 어떤 모양으로 적어도 날짜로 읽기: 2026-11-01, 2026. 11. 1, 2026/11/01, 11/1/2026, 11.1
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
  // 23:59 / 오후 11:59 / 11:59 PM / 22시 → 분 단위
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
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    const drive = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/);
    if (drive) return `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w1000`;
    if (/^https?:\/\//i.test(u)) return u;
    if (!u.includes(':') && /^[\w\-./가-힣 ]+$/.test(u)) return u; // images/파일.png 같은 사이트 안 파일
    return '';
  }
  const imgUrl = safeUrl;
  const linkUrl = (u) => { const s = String(u || '').trim(); return /^https?:\/\//i.test(s) ? s : ''; };

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
      fandom: r['상대팬덤'] || '(이름 없음)',
      artist: r['상대아티스트'],
      start: normDate(r['시작일']),
      end: normDate(r['종료일']),
      give: lines(r['우리가해주는것']),
      get: lines(r['받는것']),
      state: r['진행상황'],
      color: /^#?[0-9a-f]{3,8}$/i.test(r['색상']) ? (r['색상'][0] === '#' ? r['색상'] : '#' + r['색상']) : PALETTE[i % PALETTE.length],
      link: linkUrl(r['공지링크']),
      memo: r['메모'],
    }));
    const allyMap = Object.fromEntries(alliances.map((a) => [a.id, a]));

    const tasks = toObjects(raw.tasks).map((r, i) => {
      const daysText = r['요일'] || '';
      const days = DOW.map((d, n) => (daysText.includes(d) ? n : -1)).filter((n) => n >= 0);
      let repeat = (r['반복'] || '').replace(/\s/g, '');
      if (!repeat) repeat = days.length ? '요일' : '매일';
      if (/1회|한번|하루/.test(repeat)) repeat = '1회';
      else if (/요일/.test(repeat) || (repeat !== '매일' && days.length)) repeat = '요일';
      else repeat = '매일';
      const dl = normTime(r['마감시간']);
      return {
        id: r['아이디'] || `row${i + 2}`,
        title: r['할일'] || '(제목 없음)',
        ally: allyMap[r['연합아이디']] || null,
        guideId: r['가이드아이디'],
        repeat, days,
        start: normDate(r['시작일']),
        end: normDate(r['종료일']),
        deadline: dl,
        link: linkUrl(r['투표링크']),
        proof: r['인증방법'],
        memo: r['메모'],
      };
    });

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
    tasks.forEach((t) => { t.guide = guideMap[t.guideId] || null; });

    return { alliances, tasks, guides };
  }

  function taskOn(t, date) {
    const s = t.start || (t.ally && t.ally.start) || '';
    const e = t.end || (t.ally && t.ally.end) || '';
    if (t.repeat === '1회') return date === s;
    if (s && date < s) return false;
    if (e && date > e) return false;
    if (t.repeat === '요일') return t.days.includes(dowOf(date));
    return true;
  }
  const tasksFor = (date) => state.data.tasks.filter((t) => taskOn(t, date));
  const allyOn = (a, date) => (!a.start || date >= a.start) && (!a.end || date <= a.end);
  function allyStatus(a, date) {
    if (a.start && date < a.start) return 'soon';
    if (a.end && date > a.end) return 'end';
    return 'live';
  }

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
    if (!head.includes(mustHave)) throw new Error(`"${tab}" 탭을 찾지 못했어요. 탭 이름 또는 첫 줄 머리글(${mustHave})을 확인해 주세요`);
    return text;
  }
  function showNotice(msg) {
    if (msg) { $notice.innerHTML = msg; $notice.hidden = false; } else { $notice.hidden = true; }
  }

  async function load() {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spin');
    try {
      if (!CFG.SHEET_ID) {
        state.data = buildModel(window.SAMPLE_DATA);
        showNotice('지금은 <b>예시 데이터</b>예요. <code>config.js</code>에 구글 시트 ID를 넣으면 실제 내용이 보여요.');
      } else {
        const T = CFG.TABS || {};
        const [alliances, tasks, guides] = await Promise.all([
          fetchTab(T.alliances || '연합', '상대팬덤'), fetchTab(T.tasks || '할일', '반복'), fetchTab(T.guides || '가이드', '플랫폼'),
        ]);
        const raw = { alliances, tasks, guides };
        state.data = buildModel(raw);
        try { localStorage.setItem('rs-cache', JSON.stringify({ raw, at: Date.now() })); } catch (e) { /* 무시 */ }
        showNotice('');
      }
      state.loadedAt = Date.now();
    } catch (err) {
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem('rs-cache') || 'null'); } catch (e) { /* 무시 */ }
      if (cached) {
        state.data = buildModel(cached.raw);
        state.loadedAt = cached.at;
        showNotice(`시트를 불러오지 못해 마지막으로 저장된 내용을 보여줘요. (${esc(err.message)})`);
      } else if (!state.data) {
        state.data = { alliances: [], tasks: [], guides: [] };
        showNotice(`시트를 불러오지 못했어요: ${esc(err.message)}<br>시트 공유가 "링크가 있는 모든 사용자 · 뷰어"인지, 탭 이름이 맞는지 확인해 주세요.`);
      }
    } finally {
      btn.classList.remove('spin');
    }
    render();
  }

  // ---------- 화면 조각 ----------
  const allyTag = (a) => a
    ? `<span class="tag" style="--c:${esc(a.color)}"><i class="dot"></i>${esc(a.fandom)} 연합</span>`
    : '<span class="tag"><i class="dot" style="--c:var(--ink-3)"></i>자체 총공</span>';

  function deadlineHtml(t, date, done) {
    if (t.deadline == null) return '';
    const now = kstNow();
    if (date === now.date && !done) {
      const left = t.deadline - now.min;
      if (left < 0) return `<span class="deadline over">${hhmm(t.deadline)} 마감됨</span>`;
      const txt = left >= 60 ? `${Math.floor(left / 60)}시간 ${left % 60}분 남음` : `${left}분 남음`;
      return `<span class="deadline ${left <= 120 ? 'soon' : ''}">~${hhmm(t.deadline)} · ${txt}</span>`;
    }
    return `<span class="deadline">~${hhmm(t.deadline)} 마감</span>`;
  }

  function taskList(date) {
    const checks = getChecks(date);
    const list = tasksFor(date).sort((a, b) => {
      const da = checks.has(a.id), db = checks.has(b.id);
      if (da !== db) return da ? 1 : -1;
      return (a.deadline ?? 9999) - (b.deadline ?? 9999) || a.title.localeCompare(b.title, 'ko');
    });
    if (!list.length) return { html: '<div class="card empty"><strong>할 일이 없어요</strong>이 날은 쉬는 날!</div>', total: 0, done: 0 };
    const html = list.map((t) => {
      const done = checks.has(t.id);
      const actions = [
        t.link ? `<a class="btn small primary" href="${esc(t.link)}" target="_blank" rel="noopener">투표·스밍 하러 가기 ↗</a>` : '',
        t.guide ? `<a class="btn small" href="#guides/${encodeURIComponent(t.guide.id)}">${esc(t.guide.platform)} 가이드</a>` : '',
      ].join('');
      return `
        <article class="card task ${done ? 'done' : ''}">
          <button class="check" type="button" data-check="${esc(t.id)}" data-date="${date}" aria-pressed="${done}" aria-label="${esc(t.title)} 완료 표시">
            <svg viewBox="0 0 24 24"><path d="M5 12.5l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="task-body">
            <div class="task-top">${allyTag(t.ally)}${deadlineHtml(t, date, done)}</div>
            <h3 class="task-title">${esc(t.title)}</h3>
            ${t.proof ? `<p class="task-proof"><b>인증</b> ${esc(t.proof)}</p>` : ''}
            ${t.memo ? `<p class="task-memo">${esc(t.memo)}</p>` : ''}
            ${actions ? `<div class="task-actions">${actions}</div>` : ''}
          </div>
        </article>`;
    }).join('');
    const done = list.filter((t) => checks.has(t.id)).length;
    return { html: `<div class="task-list">${html}</div>`, total: list.length, done };
  }

  const updatedLine = () => state.loadedAt
    ? `<p class="updated">시트 반영 ${new Date(state.loadedAt).toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })} · 날짜는 한국 시간 기준</p>`
    : '';

  // ---------- 오늘 ----------
  function renderToday() {
    const d = today();
    const r = taskList(d);
    const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
    const actives = state.data.alliances.filter((a) => allyOn(a, d));
    return `
      <section class="page-head">
        <h1>${longLabel(d)}</h1>
        <p>${r.total ? (r.done === r.total ? '오늘 할 일을 모두 끝냈어요! 수고했어요 💜' : `오늘 할 일 ${r.total - r.done}개 남았어요`) : '오늘은 등록된 할 일이 없어요'}</p>
        ${r.total ? `<div class="progress-wrap"><div class="progress"><i style="width:${pct}%"></i></div><span class="progress-label">${r.done}/${r.total}</span></div>` : ''}
        ${actives.length ? `<div class="chips">${actives.map((a) => `<a href="#alliances" class="tag" style="--c:${esc(a.color)};text-decoration:none"><i class="dot"></i>${esc(a.fandom)}${a.end ? ` · D-${diffDays(d, a.end)}` : ''}</a>`).join('')}</div>` : ''}
      </section>
      ${r.html}
      ${updatedLine()}`;
  }

  // ---------- 달력 ----------
  function renderCalendar() {
    const t = today();
    if (!state.calMonth) state.calMonth = t.slice(0, 7);
    if (!state.calSel) state.calSel = t;
    const first = state.calMonth + '-01';
    const gridStart = addDays(first, -dowOf(first));
    const nextMonth = iso(new Date(Date.UTC(+state.calMonth.slice(0, 4), +state.calMonth.slice(5, 7), 1)));
    const lastDay = addDays(nextMonth, -1);
    const weeks = Math.ceil((diffDays(gridStart, lastDay) + 1) / 7);
    const gridEnd = addDays(gridStart, weeks * 7 - 1);

    // 이번 달 화면에 걸친 연합을 줄(레인)에 배치 — 겹치지 않으면 같은 줄 사용
    const inView = state.data.alliances
      .filter((a) => (a.start || gridStart) <= gridEnd && (a.end || gridEnd) >= gridStart)
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const lanes = [];
    inView.forEach((a) => {
      const s = a.start || gridStart;
      let lane = lanes.find((l) => (l[l.length - 1].end || gridEnd) < s);
      if (!lane) { lane = []; lanes.push(lane); }
      lane.push(a);
    });
    const shownLanes = lanes.slice(0, 4);

    let cells = '';
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(gridStart, i);
      const dw = i % 7;
      const bars = shownLanes.map((lane) => {
        const a = lane.find((x) => allyOn(x, d));
        if (!a) return '<i class="cal-bar blank"></i>';
        const cls = [(d === a.start || dw === 0) && 'start', (d === a.end || dw === 6) && 'end'].filter(Boolean).join(' ');
        return `<i class="cal-bar ${cls}" style="--c:${esc(a.color)}" title="${esc(a.fandom)}"></i>`;
      }).join('');
      const n = tasksFor(d).length;
      const classes = ['cal-day', d.slice(0, 7) !== state.calMonth && 'out', d === t && 'today', d === state.calSel && 'selected'].filter(Boolean).join(' ');
      cells += `<button type="button" class="${classes}" data-day="${d}" aria-label="${longLabel(d)} 할 일 ${n}개">
        <span class="cal-num">${+d.slice(8)}</span>
        <span class="cal-bars">${bars}</span>
        ${n ? `<span class="cal-count">${n}건</span>` : ''}
      </button>`;
    }
    const [y, m] = state.calMonth.split('-');
    const sel = taskList(state.calSel);
    return `
      <div class="cal-head">
        <h1>${y}년 ${+m}월</h1>
        <div class="cal-nav">
          <button class="btn small" type="button" data-month="-1" aria-label="이전 달">‹</button>
          <button class="btn small" type="button" data-month="0">오늘</button>
          <button class="btn small" type="button" data-month="1" aria-label="다음 달">›</button>
        </div>
      </div>
      <div class="card cal">
        <div class="cal-grid">${DOW.map((x) => `<div class="cal-dow">${x}</div>`).join('')}${cells}</div>
      </div>
      ${inView.length ? `<div class="legend">${inView.map((a) => `<span class="tag" style="--c:${esc(a.color)}"><i class="dot"></i>${esc(a.fandom)} ${a.start ? md(a.start) : ''}~${a.end ? md(a.end) : ''}</span>`).join('')}</div>` : ''}
      <h2 class="section-title">${longLabel(state.calSel)} 할 일 ${sel.total ? `· ${sel.done}/${sel.total} 완료` : ''}</h2>
      ${sel.html}`;
  }

  // ---------- 연합 ----------
  function renderAlliances() {
    const t = today();
    const all = state.data.alliances;
    if (!all.length) return '<section class="page-head"><h1>연합</h1></section><div class="card empty"><strong>등록된 연합이 없어요</strong>시트의 "연합" 탭에 추가해 주세요.</div>';
    const groups = { live: [], soon: [], end: [] };
    all.forEach((a) => groups[allyStatus(a, t)].push(a));
    groups.live.sort((a, b) => (a.end || '9').localeCompare(b.end || '9'));
    groups.soon.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    groups.end.sort((a, b) => (b.end || '').localeCompare(a.end || ''));
    const card = (a) => {
      const st = allyStatus(a, t);
      const badge = st === 'live' ? `<span class="status live">진행중${a.end ? ` · D-${diffDays(t, a.end)}` : ''}</span>`
        : st === 'soon' ? `<span class="status soon">${diffDays(t, a.start)}일 후 시작</span>`
        : '<span class="status end">종료</span>';
      let pct = 0;
      if (a.start && a.end) pct = Math.max(0, Math.min(100, ((diffDays(a.start, t) + 1) / (diffDays(a.start, a.end) + 1)) * 100));
      if (st === 'end') pct = 100;
      if (st === 'soon') pct = 0;
      const count = state.data.tasks.filter((x) => x.ally === a).length;
      const ul = (arr) => arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<ul><li>—</li></ul>';
      return `
        <article class="card ally" style="--c:${esc(a.color)}">
          <div class="ally-head">
            <div><h2 class="ally-name">${esc(a.fandom)}</h2>${a.artist ? `<div class="ally-artist">${esc(a.artist)}</div>` : ''}</div>
            ${badge}
          </div>
          <div class="ally-period"><span>${a.start ? longLabel(a.start) : '시작일 미정'}</span><span>${a.end ? longLabel(a.end) : '종료일 미정'}</span></div>
          ${a.start && a.end ? `<div class="progress"><i style="width:${pct}%"></i></div>` : ''}
          <div class="swap">
            <div><h3>우리가 해주는 것</h3>${ul(a.give)}</div>
            <div><h3>우리가 받는 것</h3>${ul(a.get)}</div>
          </div>
          ${a.state ? `<p class="ally-state"><b>진행 상황</b>${esc(a.state)}</p>` : ''}
          ${a.memo ? `<p class="task-memo">${esc(a.memo)}</p>` : ''}
          <div class="ally-foot">
            ${count ? `<span class="tag">관련 할 일 ${count}개</span>` : ''}
            ${a.link ? `<a class="btn small" href="${esc(a.link)}" target="_blank" rel="noopener">공지 보기 ↗</a>` : ''}
          </div>
        </article>`;
    };
    const sec = (title, arr) => arr.length ? `<h2 class="section-title">${title} ${arr.length}</h2>${arr.map(card).join('')}` : '';
    return `
      <section class="page-head"><h1>연합</h1><p>진행중 ${groups.live.length} · 예정 ${groups.soon.length} · 종료 ${groups.end.length}</p></section>
      ${sec('진행중', groups.live)}${sec('예정', groups.soon)}${sec('종료', groups.end)}`;
  }

  // ---------- 투표 가이드 ----------
  function renderGuides() {
    const all = state.data.guides;
    const cats = ['전체', ...new Set(all.map((g) => g.category))];
    if (!cats.includes(state.guideFilter)) state.guideFilter = '전체';
    const list = all.filter((g) => state.guideFilter === '전체' || g.category === state.guideFilter);
    const body = list.length ? list.map((g) => `
      <article class="card guide" id="guide-${esc(g.id)}">
        <div class="ally-head"><h2>${esc(g.platform)}</h2><span class="tag">${esc(g.category)}</span></div>
        ${g.where ? `<p class="where">📍 ${esc(g.where)}</p>` : ''}
        ${g.steps.length ? `<h3>방법</h3><ol class="steps">${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
        ${g.proof.length || g.image ? `<h3>인증 방법</h3>` : ''}
        ${g.proof.length ? `<div class="proof-box">${g.proof.map(esc).join('<br>')}</div>` : ''}
        ${g.image ? `<a class="shot" href="${esc(g.image)}" target="_blank" rel="noopener"><img src="${esc(g.image)}" alt="${esc(g.platform)} 인증 캡처 예시"></a>` : ''}
        ${g.caution ? `<p class="caution">⚠ ${esc(g.caution)}</p>` : ''}
        ${g.link ? `<div class="task-actions"><a class="btn small primary" href="${esc(g.link)}" target="_blank" rel="noopener">${esc(g.platform)} 바로가기 ↗</a></div>` : ''}
      </article>`).join('') : '<div class="card empty"><strong>등록된 가이드가 없어요</strong>시트의 "가이드" 탭에 추가해 주세요.</div>';
    return `
      <section class="page-head"><h1>투표 가이드</h1><p>플랫폼별 위치·방법·인증 방법</p></section>
      ${cats.length > 2 ? `<div class="filter">${cats.map((c) => `<button type="button" data-filter="${esc(c)}" class="${c === state.guideFilter ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
      ${body}`;
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
    const html = { today: renderToday, calendar: renderCalendar, alliances: renderAlliances, guides: renderGuides }[tab]();
    $app.innerHTML = html;
    if (tab === 'guides' && arg && !(opts && opts.keepScroll)) {
      const el = document.getElementById('guide-' + arg);
      if (el) {
        const go = () => el.scrollIntoView({ block: 'start' });
        go();
        el.classList.add('flash');
        // 위쪽 캡처 이미지가 늦게 뜨면 위치가 밀리므로 다시 맞춤
        const until = Date.now() + 3000;
        $app.querySelectorAll('img').forEach((img) => {
          if (!img.complete) img.addEventListener('load', () => { if (Date.now() < until) go(); }, { once: true });
        });
      }
    } else if (!(opts && opts.keepScroll)) {
      window.scrollTo(0, 0);
    }
  }

  $app.addEventListener('click', (e) => {
    const chk = e.target.closest('[data-check]');
    if (chk) { toggleCheck(chk.dataset.date, chk.dataset.check); render({ keepScroll: true }); return; }
    const day = e.target.closest('[data-day]');
    if (day) { state.calSel = day.dataset.day; state.calMonth = day.dataset.day.slice(0, 7); render({ keepScroll: true }); return; }
    const mon = e.target.closest('[data-month]');
    if (mon) {
      const n = +mon.dataset.month;
      if (n === 0) { state.calMonth = today().slice(0, 7); state.calSel = today(); }
      else {
        const [y, m] = state.calMonth.split('-').map(Number);
        state.calMonth = iso(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
        state.calSel = state.calMonth + '-01';
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

  // 사이트 이름 / X 주소 적용
  if (CFG.SITE_TITLE) { document.getElementById('siteTitle').textContent = CFG.SITE_TITLE; document.title = CFG.SITE_TITLE; }
  if (linkUrl(CFG.TEAM_X)) document.getElementById('teamX').href = CFG.TEAM_X;

  cleanOldChecks();
  load();
})();
