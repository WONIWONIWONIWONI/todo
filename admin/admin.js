// 관리자 모드: 자료 파일을 폼으로 고치고 저장 서버(admin-worker)로 보내요.
// 저장하면 GitHub Actions(관리자 저장)가 publish.py와 같은 검사를 거쳐 사이트에 올려요.
(function () {
  'use strict';
  const API = location.hostname === 'localhost' ? 'http://localhost:8787' : ((window.SITE_CONFIG || {}).ADMIN_API || '');
  const KEY = 'rs-admin-ticket';
  const $ = (s, el) => (el || document).querySelector(s);
  const $adm = $('#adm');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // src/00-core.js 와 같은 규칙: 디시 주소는 링크로 넣지 않아요 (이승윤 연합 인증 갤러리 하나만 예외)
  const DC_OK = /^https?:\/\/gall\.dcinside\.com\/bgsmsylytb\/?$/i;
  const NO_LINK = /dcinside|dcimg/i;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const DATETIME = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/;
  const kst = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const yesterday = () => kst(new Date(Date.now() - 864e5));

  // 파일마다: 목록 카드에 보일 칸, 고르는 칸, 꼭 채울 칸
  const SHOWS = ['쇼케이팝', '더쇼', '쇼챔피언', '엠카운트다운', '뮤직뱅크', '음악중심', '인기가요'];
  const FILES = [
    { key: 'tasks', label: '할 일', path: 'sheet-templates/할일.csv', title: ['내용'], sub: ['투표종류', '시작일', '종료일'], need: ['아이디', '구분', '내용', '시작일', '종료일'], idPrefix: 'S',
      pick: { 구분: ['자체', '줄 것', '받을 것'], 반복: ['', '매일', '요일', '1회', '기간 중 1회'] }, end: '종료일' },
    { key: 'alliances', label: '연합', path: 'sheet-templates/연합.csv', title: ['상대아티스트'], sub: ['상대팬덤', '진행상황'], need: ['아이디', '상대아티스트'] },
    { key: 'music', label: '음방', path: 'sheet-templates/음방.csv', title: ['음방', '구분'], sub: ['방송일', '메모'], need: ['아이디', '음방', '방송일'],
      pick: { 음방: SHOWS }, del: true },
    { key: 'musicCal', label: '음방 달력', path: 'sheet-templates/음방달력.csv', title: ['음방', '구분'], sub: ['시작', '종료', '메모'], need: ['아이디', '구분'],
      pick: { 음방: [''].concat(SHOWS), 구분: ['방송', '생방송투표', '사전투표', '시청자위원회', '안내'] }, del: true },
    { key: 'guides', label: '가이드', path: 'sheet-templates/가이드.csv', title: ['플랫폼'], sub: ['분류'], need: ['아이디', '플랫폼'], del: true },
    { key: 'weekly', label: '기타 일정', path: 'data/weekly.json', json: true, title: ['title'], sub: ['date', 'end', 'category'], need: ['date', 'title'],
      pick: { category: ['음방', '방송', '공연', '이벤트', '발매', '기념일', '기타'] }, end: 'end', del: true },
  ];
  // 기타 일정(JSON) 칸 이름을 보기 쉽게
  const WEEKLY_COLS = ['date', 'end', 'time', 'category', 'title', 'note', 'link'];
  const WEEKLY_LABEL = { date: '시작일', end: '종료일', time: '시간', category: '일정 종류', title: '제목', note: '메모', link: '링크' };
  const DATE_COLS = ['시작일', '종료일', '방송일', 'date', 'end'];
  const LONG_COLS = ['내용', '메모', 'note'];

  const st = { inUse: {}, del: new Set(), ticket: '', file: FILES[0], sha: '', head: [], rows: [], orig: [], json: null, nl: '\n', open: -1, busy: false, err: '', job: null };
  try { st.ticket = localStorage.getItem(KEY) || ''; } catch (e) { /* 무시 */ }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  async function call(method, path, body) {
    let r;
    try {
      r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(st.ticket ? { Authorization: 'Bearer ' + st.ticket } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { return { ok: false, err: 'net' }; }
    const d = await r.json().catch(() => ({ ok: false, err: 'server' }));
    if (d.err === 'auth' && path !== '/login') logout('로그인이 끝났어요. 비밀번호를 다시 넣어 주세요.');
    return d;
  }
  const ERR = { net: '서버에 닿지 못했어요. 인터넷을 확인해 주세요.', limit: '1분에 5번까지예요. 잠시 뒤 다시 해 주세요.', auth: '비밀번호가 달라요.', conflict: '그 사이에 이 파일이 바뀌었어요. 위에서 자료 이름을 다시 눌러 새로 불러온 뒤 고쳐 주세요.', github: 'GitHub에서 문제가 생겼어요.', server: '서버에서 문제가 생겼어요.', body: '보낼 내용이 이상해요.', path: '고칠 수 없는 파일이에요.' };

  // ---------- CSV ----------
  // 줄마다 원래 글자(raw)도 같이 돌려줘요. 안 고친 줄은 저장할 때 원래 글자 그대로 써서 따옴표 등이 바뀌지 않게
  function parseCSV(text) {
    const rows = []; let row = []; let cell = ''; let q = false; let start = 0;
    text = text.replace(/^\uFEFF/, '');
    const end = (i) => { row.push(cell); row.raw = text.slice(start, i); rows.push(row); row = []; cell = ''; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        end(i);
        if (c === '\r' && text[i + 1] === '\n') i++;
        start = i + 1;
      } else cell += c;
    }
    if (cell !== '' || row.length) end(text.length);
    return rows.filter((r) => r.some((c) => c !== ''));
  }
  const cellOut = (v) => (/[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const toCSV = (lines, nl) => lines.join(nl) + nl;

  // ---------- 불러오기 · 저장 ----------
  async function loadFile(f) {
    st.file = f; st.open = -1; st.busy = true; st.err = ''; draw();
    const d = await call('GET', '/file?path=' + encodeURIComponent(f.path));
    st.busy = false;
    if (!d.ok) { st.err = ERR[d.err] || '불러오지 못했어요.'; draw(); return; }
    st.sha = d.sha;
    if (f.json) {
      st.json = JSON.parse(d.text);
      st.head = WEEKLY_COLS;
      st.rows = (st.json.events || []).map((e) => WEEKLY_COLS.map((k) => String(e[k] == null ? '' : e[k])));
      st.ids = (st.json.events || []).map((e) => e.id);
    } else {
      st.nl = /\r\n/.test(d.text) ? '\r\n' : '\n';
      const all = parseCSV(d.text);
      st.head = all[0] || [];
      st.headRaw = all[0] ? all[0].raw : '';
      st.raw = all.slice(1).map((r) => r.raw);
      st.rows = all.slice(1).map((r) => st.head.map((_, i) => r[i] || ''));
    }
    st.orig = st.rows.map((r) => r.join('\u0001'));
    st.del = new Set();
    draw();
  }

  const isNew = (i) => i >= st.orig.length;
  // 지울 줄(st.del)은 저장을 누를 때까지 목록에 '삭제 예정'으로 남아요
  const changed = () => st.rows.map((r, i) => i).filter((i) => isNew(i) || st.del.has(i) || st.rows[i].join('\u0001') !== st.orig[i]);
  const idOf = (i) => (st.file.json ? st.ids[i] : st.rows[i][st.head.indexOf('아이디')]);
  const col = (name) => st.head.indexOf(name);

  // 새 줄 아이디: 할 일은 자체 투표 S + 다음 번호(연합 줄은 아이디 칸을 직접 고쳐요).
  // 다른 자료는 마지막 줄 아이디의 끝 숫자 + 1 (P37 → P38). 겹치면 계속 올림
  function nextId() {
    const ids = st.rows.map((r) => r[col('아이디')]);
    let pre = st.file.idPrefix;
    if (pre == null) { const m = (ids[ids.length - 1] || 'N0').match(/^(.*?)\d*$/); pre = m[1]; }
    const nums = ids.map((x) => (x.startsWith(pre) && /^\d+$/.test(x.slice(pre.length)) ? +x.slice(pre.length) : 0));
    let n = Math.max(0, ...nums) + 1;
    while (ids.includes(pre + n)) n++;
    return pre + n;
  }

  function problems() {
    const f = st.file; const out = [];
    const seen = new Set();
    st.rows.forEach((r, i) => {
      if (st.del.has(i)) {
        const used = f.key === 'guides' && st.inUse[idOf(i)];
        if (used && used.length) out.push(`가이드 ${idOf(i)}: 할 일 ${used.join(', ')} 에서 쓰고 있어서 지울 수 없어요`);
        return;
      }
      const id = idOf(i) || '';
      const w = f.json ? (r[col('title')] || '새 일정') : (id || '새 줄');
      if (!f.json) { if (seen.has(id)) out.push(`${w}: 아이디가 겹쳐요`); seen.add(id); }
      if (!changed().includes(i)) return;
      f.need.forEach((c) => { if (!String(r[col(c)] || '').trim()) out.push(`${w}: ${label(c)} 칸이 비었어요`); });
      st.head.forEach((c, k) => {
        const v = String(r[k] || '').trim();
        if (!v) return;
        if (DATE_COLS.includes(c) && !DATE.test(v)) out.push(`${w}: ${label(c)}은 YYYY-MM-DD → "${v}"`);
        if (f.key === 'musicCal' && (c === '시작' || c === '종료') && !DATETIME.test(v)) out.push(`${w}: ${c}은 YYYY-MM-DD 또는 YYYY-MM-DD HH:MM → "${v}"`);
        if (NO_LINK.test(v) && !DC_OK.test(v)) out.push(`${w}: 디시 주소는 넣지 않아요`);
      });
    });
    return out;
  }

  // 할 일이 쓰는 가이드를 지우면 검사에서 막히니 미리 알려줘요
  async function guideInUse(id) {
    const d = await call('GET', '/file?path=' + encodeURIComponent(FILES[0].path));
    if (!d.ok) return;
    const all = parseCSV(d.text); const k = all[0].indexOf('가이드아이디');
    const used = all.slice(1).filter((r) => r[k] === id).map((r) => r[0]);
    st.inUse[id] = used;
    if (used.length) { st.err = `가이드 ${id} 는 할 일 ${used.join(', ')} 에서 쓰고 있어요. 지우면 검사에서 막혀요. 할 일의 가이드아이디를 먼저 비워 주세요.`; draw(); }
  }

  async function save() {
    const bad = problems();
    if (bad.length) { st.err = bad.join('\n'); draw(); return; }
    const ch = changed();
    if (!ch.length) return;
    const names = ch.map((i) => (st.del.has(i) ? '삭제 ' : isNew(i) ? '추가 ' : '') + (st.file.json ? st.rows[i][col('title')] : idOf(i)));
    const note = names.length > 4 ? `${names.slice(0, 4).join(', ')} 외 ${names.length - 4}줄` : names.join(', ');
    let text;
    if (st.file.json) {
      const prev = st.json.events || [];
      const events = st.rows.map((r, i) => {
        if (st.del.has(i)) return null;
        if (!ch.includes(i)) return prev[i]; // 안 고친 일정은 그대로
        const e = Object.assign({}, prev[i] || {}, { id: st.ids[i] });
        WEEKLY_COLS.forEach((k, n) => { const v = r[n].trim(); if (v || k in e || k !== 'link') e[k] = v; });
        return e;
      }).filter(Boolean).sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')));
      text = JSON.stringify(Object.assign({}, st.json, { events }), null, 1) + '\n';
    } else {
      const lines = st.rows.map((r, i) => (st.del.has(i) ? null : ch.includes(i) ? r.map((v) => cellOut(v.trim())).join(',') : st.raw[i])).filter((x) => x != null);
      text = toCSV([st.headRaw].concat(lines), st.nl);
    }
    st.busy = true; st.err = ''; draw();
    const d = await call('PUT', '/file', { path: st.file.path, sha: st.sha, text, note });
    st.busy = false;
    if (!d.ok) { st.err = ERR[d.err] || '저장하지 못했어요.'; draw(); return; }
    st.sha = d.sha;
    if (st.file.json) { st.json = JSON.parse(text); st.rows = st.json.events.map((e) => WEEKLY_COLS.map((k) => String(e[k] == null ? '' : e[k]))); st.ids = st.json.events.map((e) => e.id); }
    else { const all = parseCSV(text).slice(1); st.raw = all.map((r) => r.raw); st.rows = all.map((r) => st.head.map((_, i) => r[i] || '')); }
    st.orig = st.rows.map((r) => r.join('\u0001'));
    st.del = new Set();
    st.open = -1;
    st.job = { commit: d.commit, state: 'waiting', at: Date.now(), note };
    toast('저장했어요. 검사하고 올리는 중…');
    draw();
    watch();
  }

  // 저장 뒤 Actions 진행 상황 (최대 8분)
  async function watch() {
    const job = st.job;
    if (!job || job.state === 'success' || job.state === 'failure') return;
    if (Date.now() - job.at > 8 * 60e3) { job.state = 'slow'; draw(); return; }
    const d = await call('GET', '/status?commit=' + job.commit);
    if (d.ok) { job.state = d.state; job.url = d.url || job.url; draw(); }
    if (st.job === job && !['success', 'failure', 'cancelled'].includes(job.state)) setTimeout(watch, 6000);
  }
  const JOB = {
    waiting: ['검사 기다리는 중', 'soon'], queued: ['검사 기다리는 중', 'soon'], in_progress: ['검사하고 올리는 중 (2~4분)', 'soon'],
    success: ['사이트에 반영됐어요', 'live'], failure: ['검사에서 막혀서 되돌렸어요. 자세히 보기에서 이유를 확인해 주세요', 'hot'],
    cancelled: ['올리기가 취소됐어요', 'hot'], slow: ['아직 끝나지 않았어요. 자세히 보기에서 확인해 주세요', 'soon'],
  };

  function logout(msg) {
    st.ticket = '';
    try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
    st.err = msg || '';
    draw();
  }

  // ---------- 화면 ----------
  const label = (c) => (st.file.json ? WEEKLY_LABEL[c] || c : c);
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  function drawLock() {
    $adm.innerHTML = `<section class="card adm-lock">
      <div class="adm-lock-ic">${LOCK}</div>
      <h1>비밀 페이지</h1>
      <p>관리용 페이지예요. 비밀번호를 입력해 주세요.</p>
      <form class="adm-lock-f" autocomplete="off">
        <input type="password" name="pw" placeholder="비밀번호" aria-label="비밀번호" maxlength="64" spellcheck="false" required>
        <button type="submit" class="btn primary"${st.busy ? ' disabled' : ''}>${st.busy ? '확인 중' : '들어가기'}</button>
      </form>
      <p class="adm-msg" role="alert">${esc(st.err)}</p>
    </section>`;
    const f = $('form', $adm);
    $('input', f).focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      st.busy = true; st.err = ''; drawLock();
      const pw = f.pw.value;
      const d = await call('POST', '/login', { pw });
      st.busy = false;
      if (!d.ok) { st.err = ERR[d.err] || '확인하지 못했어요.'; drawLock(); return; }
      st.ticket = d.ticket;
      try { localStorage.setItem(KEY, d.ticket); } catch (e2) { /* 무시 */ }
      loadFile(st.file);
    });
  }

  function field(c, k, v, i) {
    const id = `f-${i}-${k}`;
    const lab = `<label for="${id}">${esc(label(c))}${st.file.need.includes(c) ? ' <i>꼭</i>' : ''}</label>`;
    const locked = (c === '아이디' && !isNew(i));
    const pick = (st.file.pick || {})[c];
    let input;
    if (pick) {
      const opts = pick.includes(v) ? pick : pick.concat([v]);
      input = `<select id="${id}" data-k="${k}">${opts.map((o) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o || '(비움)')}</option>`).join('')}</select>`;
    } else if (DATE_COLS.includes(c)) {
      input = `<input id="${id}" data-k="${k}" type="date" value="${esc(v)}">`;
    } else if (LONG_COLS.includes(c)) {
      input = `<textarea id="${id}" data-k="${k}" rows="3">${esc(v)}</textarea>`;
    } else {
      input = `<input id="${id}" data-k="${k}" value="${esc(v)}"${locked ? ' readonly' : ''}${c === '아이디' && locked ? ' title="체크 기록 아이디라 바꾸지 않아요"' : ''}>`;
    }
    return `<div class="adm-f${LONG_COLS.includes(c) ? ' wide' : ''}">${lab}${input}</div>`;
  }

  function drawEdit() {
    const f = st.file;
    const ch = changed();
    const job = st.job && JOB[st.job.state];
    const chips = FILES.map((x) => `<button type="button" class="adm-chip${x === f ? ' on' : ''}" data-file="${x.key}" aria-pressed="${x === f}">${esc(x.label)}</button>`).join('');
    const sub = (r) => f.sub.map((c) => r[col(c)]).filter(Boolean).map(esc).join(' · ');
    const list = st.rows.map((r, i) => {
      const title = f.title.map((c) => r[col(c)]).filter(Boolean).join(' · ') || '(제목 없음)';
      const tag = st.del.has(i) ? '<span class="status hot">삭제 예정</span>' : isNew(i) ? '<span class="status soon">새 줄</span>' : ch.includes(i) ? '<span class="status tbd">고침</span>' : '';
      const open = st.open === i;
      return `<li class="card adm-row${open ? ' open' : ''}${st.del.has(i) ? ' gone' : ''}">
        <button type="button" class="adm-row-h" data-open="${i}" aria-expanded="${open}">
          <span class="adm-id">${esc(f.json ? '' : idOf(i))}</span>
          <span class="adm-t"><b>${esc(title)}</b><small>${sub(r)}</small></span>${tag}
        </button>
        ${open ? `<div class="adm-form" data-row="${i}">${st.head.map((c, k) => field(c, k, r[k], i)).join('')}
          <div class="adm-row-a">
            ${f.del && !isNew(i) ? (st.del.has(i) ? `<button type="button" class="btn small" data-undel="${i}">되살리기</button>` : `<button type="button" class="btn small adm-del" data-delrow="${i}">삭제</button>`) : ''}
            ${f.end && !isNew(i) && !st.del.has(i) ? `<button type="button" class="btn small" data-down="${i}">내리기 (종료일을 어제로)</button>` : ''}
            ${isNew(i) ? `<button type="button" class="btn small" data-drop="${i}">새 줄 빼기</button>` : ''}
            ${ch.includes(i) && !isNew(i) && !st.del.has(i) ? `<button type="button" class="btn small" data-undo="${i}">고친 것 되돌리기</button>` : ''}
            <button type="button" class="btn small" data-open="${i}">접기</button>
          </div></div>` : ''}
      </li>`;
    }).join('');
    $adm.innerHTML = `
      <section class="page-head"><h1>관리자 모드</h1><p>고친 뒤 저장하면 검사를 거쳐 2~4분 뒤 사이트에 반영돼요.</p></section>
      <nav class="adm-chips" aria-label="고칠 자료">${chips}</nav>
      ${st.busy && !st.rows.length ? '<p class="adm-empty">불러오는 중…</p>' : ''}
      <ul class="adm-list">${list}</ul>
      ${st.head.length ? `<button type="button" class="btn adm-add" data-add>+ 새 줄</button>` : ''}
      <div class="adm-bar">
        <div class="container adm-bar-in">
          ${job ? `<p class="adm-job"><span class="status ${job[1]}">${esc(job[0])}</span>${st.job.url ? ` <a href="${esc(st.job.url)}" target="_blank" rel="noopener">자세히 보기</a>` : ''}</p>` : ''}
          <p class="adm-msg" role="alert">${esc(st.err)}</p>
          <span class="adm-cnt">${ch.length ? `고친 줄 ${ch.length}개` : '바뀐 것 없음'}</span>
          <button type="button" class="btn primary" data-save${!ch.length || st.busy ? ' disabled' : ''}>${st.busy ? '보내는 중' : '저장'}</button>
        </div>
      </div>`;
  }

  function draw() {
    $('#admOut').hidden = !st.ticket;
    if (!API) { $adm.innerHTML = '<section class="card adm-lock"><h1>준비 중</h1><p>config.js에 저장 서버 주소(ADMIN_API)가 아직 없어요.</p></section>'; return; }
    if (!st.ticket) drawLock(); else drawEdit();
  }

  // ---------- 누르기 · 입력 ----------
  $adm.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    const row = e.target.closest('[data-row]');
    if (k == null || !row) return;
    st.rows[+row.dataset.row][+k] = e.target.value;
    // 다시 그리지 않고 저장 버튼 · 숫자만 고침 (입력 중 커서가 튀지 않게)
    const n = changed().length;
    $('.adm-cnt', $adm).textContent = n ? `고친 줄 ${n}개` : '바뀐 것 없음';
    $('[data-save]', $adm).disabled = !n || st.busy;
  });
  $adm.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') draw(); });
  $adm.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !st.ticket) return;
    if (b.dataset.file) {
      const f = FILES.find((x) => x.key === b.dataset.file);
      if (changed().length && !confirm('저장하지 않은 고친 것이 사라져요. 다른 자료로 옮길까요?')) return;
      loadFile(f);
    } else if (b.dataset.open != null) {
      st.open = st.open === +b.dataset.open ? -1 : +b.dataset.open; st.err = ''; draw();
      if (st.open >= 0) $(`[data-row="${st.open}"]`, $adm).closest('li').scrollIntoView({ block: 'start' });
    } else if (b.dataset.down != null) {
      st.rows[+b.dataset.down][col(st.file.end)] = yesterday(); draw();
    } else if (b.dataset.delrow != null) {
      const i = +b.dataset.delrow;
      const name = st.file.json ? st.rows[i][col('title')] : `${idOf(i)} ${st.file.title.map((c) => st.rows[i][col(c)]).filter(Boolean).join(' · ')}`;
      if (!confirm(`"${name}" 줄을 지울까요?\n저장을 눌러야 실제로 지워져요.`)) return;
      st.rows[i] = st.orig[i].split('\u0001'); st.del.add(i); st.open = -1; draw();
      if (st.file.key === 'guides') guideInUse(st.rows[i][col('아이디')]);
    } else if (b.dataset.undel != null) {
      st.del.delete(+b.dataset.undel); st.err = ''; draw();
    } else if (b.dataset.undo != null) {
      const i = +b.dataset.undo; st.rows[i] = st.orig[i].split('\u0001'); draw();
    } else if (b.dataset.drop != null) {
      const i = +b.dataset.drop; st.rows.splice(i, 1); if (st.file.json) st.ids.splice(i, 1); st.open = -1; draw();
    } else if (b.hasAttribute('data-add')) {
      const r = st.head.map(() => '');
      if (st.file.json) {
        r[col('date')] = kst(new Date()); r[col('end')] = r[col('date')]; r[col('category')] = '기타';
        st.ids.push('a' + r[col('date')].replace(/-/g, '') + Math.random().toString(36).slice(2, 6));
      } else {
        r[col('아이디')] = nextId();
        const pick = st.file.pick || {};
        Object.keys(pick).forEach((c) => { r[col(c)] = pick[c][0]; });
      }
      st.rows.push(r); st.open = st.rows.length - 1; draw();
      $(`[data-row="${st.open}"]`, $adm).closest('li').scrollIntoView({ block: 'center' });
    } else if (b.hasAttribute('data-save')) save();
  });
  $('#admOut').addEventListener('click', () => {
    if (changed().length && !confirm('저장하지 않은 고친 것이 사라져요. 나갈까요?')) return;
    st.rows = []; st.orig = []; st.head = []; logout();
  });
  window.addEventListener('beforeunload', (e) => { if (st.ticket && changed().length) { e.preventDefault(); e.returnValue = ''; } });

  if (st.ticket && API) loadFile(st.file); else draw();
})();
