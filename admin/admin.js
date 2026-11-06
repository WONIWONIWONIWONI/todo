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
  const kst = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const yesterday = () => kst(new Date(Date.now() - 864e5));

  // 파일마다: 목록 카드에 보일 칸, 고르는 칸, 꼭 채울 칸
  const SHOWS = ['쇼케이팝', '더쇼', '쇼챔피언', '엠카운트다운', '뮤직뱅크', '음악중심', '인기가요'];
  // 순서 · 이름은 사이트 탭과 같아요. tab = 위 칩 이름 (같은 tab 이 둘이면 그 안에서 label 로 나눠요), where = 사이트 어디에 보이는지
  const FILES = [
    // 음총팀 X 새 글 대기 목록 (tools/crawl_x.py 가 10분마다 채움). 넣을 곳을 골라 미리 채운 줄을 고친 뒤 저장하면 들어가요
    { key: 'inbox', tab: '받은 공지', label: '받은 공지', path: 'data/inbox.json', inbox: true },
    { key: 'tasks', tab: '오늘·연합 일정', label: '할 일', where: '사이트 "오늘" · "연합 일정" 탭에 보여요. 줄 것 · 받을 것은 "연합&기타" 연합 카드에도 보여요.',
      path: 'sheet-templates/할일.csv', title: ['내용'], sub: ['투표종류', '시작일', '종료일'], need: ['아이디', '구분', '내용', '시작일', '종료일'], idPrefix: 'S',
      pick: { 구분: ['자체', '줄 것', '받을 것'], 반복: ['', '매일', '요일', '1회', '기간 중 1회'] }, end: '종료일' },
    { key: 'music', tab: '음악방송', label: '음방 출연 · 투표', where: '사이트 "음악방송" 탭에 보여요. 출연은 "리센느 일정"에도 보여요. (사전투표는 할 일로 넣어요)',
      path: 'sheet-templates/음방.csv', title: ['음방', '구분'], sub: ['방송일', '메모'], need: ['아이디', '음방', '구분', '방송일'],
      pick: { 음방: SHOWS, 구분: ['출연', '실시간투표', '1위후보'] }, del: true },
    // JSON 자료: list = 목록 이름, cols = 고칠 칸, label = 칸 이름, fresh = 새 줄 기본값(id 포함), sort = 날짜순 정렬
    { key: 'weekly', tab: '리센느 일정', label: '리센느 일정', where: '사이트 "리센느 일정" 탭에 blip · Mnet Plus 일정과 같이 보여요. (blip · Mnet Plus 는 자동이라 여기 없어요)',
      path: 'data/weekly.json', title: ['title'], sub: ['date', 'end', 'category'], need: ['date', 'title'],
      json: { list: 'events', cols: ['date', 'end', 'time', 'category', 'title', 'note', 'link'], sort: true,
        label: { date: '시작일', end: '종료일', time: '시간', category: '일정 종류', title: '제목', note: '메모', link: '링크' },
        fresh: () => { const t = kst(new Date()); return { id: 'a' + t.replace(/-/g, '') + Math.random().toString(36).slice(2, 6), date: t, end: t, category: '기타' }; } },
      pick: { category: ['음방', '방송', '공연', '이벤트', '발매', '기념일', '기타'] }, end: 'end', del: true },
    { key: 'alliances', tab: '연합&기타', label: '연합', where: '사이트 "연합&기타" 탭의 연합 카드예요. 주고받는 투표는 "오늘·연합 일정"의 할 일로 넣어요.',
      path: 'sheet-templates/연합.csv', title: ['상대아티스트'], sub: ['상대팬덤', '진행상황'], need: ['아이디', '상대아티스트'] },
    { key: 'guides', tab: '연합&기타', label: '기타', where: '사이트 "연합&기타" 탭의 기타 칸 (음총팀 가이드 링크)이에요.',
      path: 'sheet-templates/가이드.csv', title: ['이름'], sub: ['바로가기'], need: ['아이디', '이름', '바로가기'], del: true },
    // 사이트를 열면 뜨는 공지 (닫기 · 24시간 동안 보지 않기). 고쳐도 id는 그대로라 "24시간 보지 않기"를 누른 사람에게는 다시 안 떠요
    { key: 'notice', tab: '공지 팝업', label: '공지 팝업', where: '사이트를 열면 가운데에 뜨는 공지예요. 언제까지가 지나면 저절로 안 떠요.',
      path: 'data/notice.json', title: ['title'], sub: ['until'], need: ['title'], del: true,
      json: { list: 'notices', cols: ['title', 'body', 'until', 'link', 'linkText'],
        label: { title: '제목', body: '내용 (줄마다 한 문단)', until: '언제까지 (비우면 지울 때까지)', link: '링크 주소 (없어도 돼요)', linkText: '링크 이름 (비우면 "공지 원문")' },
        fresh: () => ({ id: 'n' + Date.now() }) } },
  ];
  const TASKS = FILES.find((f) => f.key === 'tasks');
  const NOTICE = FILES.find((f) => f.key === 'notice');
  const DATE_COLS = ['시작일', '종료일', '방송일', 'date', 'end'];
  const TIME_COLS = ['until']; // 한국 시각 YYYY-MM-DDTHH:MM
  const LONG_COLS = ['내용', '메모', 'note', 'body'];

  const st = { dest: {}, showEnd: false, del: new Set(), ticket: '', file: FILES[0], sha: '', head: [], rows: [], orig: [], json: null, nl: '\n', open: -1, busy: false, err: '', job: null, crawl: null };
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
  const ERR = { net: '서버에 닿지 못했어요. 인터넷을 확인해 주세요.', limit: '1분에 5번까지예요. 잠시 뒤 다시 해 주세요.', auth: '비밀번호가 달라요.', conflict: '그 사이에 이 파일이 바뀌었어요. 위에서 자료 이름을 다시 눌러 새로 불러온 뒤 고쳐 주세요.', github: 'GitHub에서 문제가 생겼어요.', server: '서버에서 문제가 생겼어요.', body: '보낼 내용이 이상해요.', notfound: '저장 서버가 예전 버전이에요. admin-worker 폴더에서 npx wrangler deploy 를 한 번 실행해 주세요.', perm: 'GitHub 토큰에 Actions 쓰기 권한이 없어요. 사용설명서의 GH_TOKEN 설명대로 권한을 바꿔 주세요.', path: '고칠 수 없는 파일이에요.' };

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
    if (f.inbox) {
      st.inbox = JSON.parse(d.text);
      st.head = []; st.rows = [];
    } else if (f.json) {
      jsonRows(JSON.parse(d.text));
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

  // JSON 자료 → 고칠 줄(rows) · 아이디(ids)
  function jsonRows(data) {
    const { list, cols } = st.file.json;
    st.json = data;
    st.head = cols;
    st.rows = (data[list] || []).map((e) => cols.map((k) => String(e[k] == null ? '' : e[k])));
    st.ids = (data[list] || []).map((e) => e.id);
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
      if (st.del.has(i)) return;
      const id = idOf(i) || '';
      const w = f.json ? (r[col('title')] || '새 줄') : (id || '새 줄');
      if (!f.json) { if (seen.has(id)) out.push(`${w}: 아이디가 겹쳐요`); seen.add(id); }
      if (!changed().includes(i)) return;
      f.need.forEach((c) => { if (!String(r[col(c)] || '').trim()) out.push(`${w}: ${label(c)} 칸이 비었어요`); });
      st.head.forEach((c, k) => {
        const v = String(r[k] || '').trim();
        if (!v) return;
        if (DATE_COLS.includes(c) && !DATE.test(v)) out.push(`${w}: ${label(c)}은 YYYY-MM-DD → "${v}"`);
        if (TIME_COLS.includes(c) && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) out.push(`${w}: ${label(c)} 날짜 · 시각을 다시 골라 주세요`);
        if (c === 'link' && !/^https?:\/\/\S+$/.test(v)) out.push(`${w}: 링크는 https:// 또는 http:// 로 시작해야 해요`);
        if (NO_LINK.test(v) && !DC_OK.test(v)) out.push(`${w}: 디시 주소는 넣지 않아요`);
      });
    });
    return out;
  }

  async function save() {
    const bad = problems();
    if (bad.length) { st.err = bad.join('\n'); draw(); return; }
    const ch = changed();
    if (!ch.length) return;
    // 받은 공지에서 연 줄이 이번 저장에 들어가면 저장 뒤 그 글을 처리됨으로 (새 줄을 빼고 저장하면 그대로 대기)
    const fi = st.fromInbox && st.file === st.fromInbox.file && ch.some((i) => st.rows[i] === st.fromInbox.row) ? st.fromInbox : null;
    const names = ch.map((i) => (st.del.has(i) ? '삭제 ' : isNew(i) ? '추가 ' : '') + (st.file.json ? st.rows[i][col('title')] : idOf(i)));
    const note = names.length > 4 ? `${names.slice(0, 4).join(', ')} 외 ${names.length - 4}줄` : names.join(', ');
    let text;
    if (st.file.json) {
      const { list, cols, sort } = st.file.json;
      const prev = st.json[list] || [];
      const items = st.rows.map((r, i) => {
        if (st.del.has(i)) return null;
        if (!ch.includes(i)) return prev[i]; // 안 고친 줄은 그대로
        const e = Object.assign({}, prev[i] || {}, { id: st.ids[i] });
        cols.forEach((k, n) => { const v = r[n].trim(); if (v || k in e || k !== 'link') e[k] = v; });
        return e;
      }).filter(Boolean);
      if (sort) items.sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')));
      text = JSON.stringify(Object.assign({}, st.json, { [list]: items }), null, 1) + '\n';
    } else {
      const lines = st.rows.map((r, i) => (st.del.has(i) ? null : ch.includes(i) ? r.map((v) => cellOut(v.trim())).join(',') : st.raw[i])).filter((x) => x != null);
      text = toCSV([st.headRaw].concat(lines), st.nl);
    }
    st.busy = true; st.err = ''; draw();
    const d = await call('PUT', '/file', { path: st.file.path, sha: st.sha, text, note });
    st.busy = false;
    if (!d.ok) { st.err = ERR[d.err] || '저장하지 못했어요.'; draw(); return; }
    st.sha = d.sha;
    if (st.file.json) jsonRows(JSON.parse(text));
    else { const all = parseCSV(text).slice(1); st.raw = all.map((r) => r.raw); st.rows = all.map((r) => st.head.map((_, i) => r[i] || '')); }
    st.orig = st.rows.map((r) => r.join('\u0001'));
    st.del = new Set();
    st.open = -1;
    st.job = { commit: d.commit, state: 'waiting', at: Date.now(), note };
    toast('저장했어요. 검사하고 올리는 중…');
    draw();
    watch();
    if (fi) { st.fromInbox = null; markInbox(fi.id, 'done'); }
  }

  // ---------- 받은 공지 (음총팀 X 새 글) ----------
  const pad = (n) => String(n).padStart(2, '0');
  // 글 속 날짜 · 시각: "11/6", "11.6", "11월 6일" 뒤에 "(금)", "23:59" / "오후 5시" 가 붙을 수 있어요
  function datesIn(text) {
    const now = new Date(Date.now() + 9 * 3600e3);
    const y = now.getUTCFullYear(); const m0 = now.getUTCMonth() + 1;
    const out = [];
    for (const m of text.matchAll(/(\d{1,2})\s*(?:[./]|월\s*)(\d{1,2})일?(?:\s*\([^)]{1,3}\))?(?:\s*(오전|오후)?\s*(\d{1,2})(?::(\d{2})|시))?/g)) {
      const mo = +m[1]; const d = +m[2];
      if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
      let h = m[4] != null ? +m[4] : null;
      if (h != null && m[3] === '오후' && h < 12) h += 12;
      if (h != null && m[3] === '오전' && h === 12) h = 0;
      out.push({ date: `${mo < m0 - 6 ? y + 1 : y}-${pad(mo)}-${pad(d)}`, time: h != null && h < 24 ? `${pad(h)}:${m[5] || '00'}` : '' });
    }
    return out;
  }
  // 받은 글 처리 상태 저장 (done · skip). 수집기가 그 사이 글을 더했을 수 있어서 늘 새로 받아서 고쳐요
  async function markInbox(id, state) {
    const g = await call('GET', '/file?path=' + encodeURIComponent('data/inbox.json'));
    if (!g.ok) { st.err = ERR[g.err] || '받은 공지를 불러오지 못했어요.'; draw(); return false; }
    const data = JSON.parse(g.text);
    const it = (data.items || []).find((x) => x.id === id);
    if (it) it.state = state;
    const d = await call('PUT', '/file', { path: 'data/inbox.json', sha: g.sha, text: JSON.stringify(data, null, 1) + '\n', note: `받은 공지 ${state === 'skip' ? '건너뜀' : '처리'}` });
    if (!d.ok) { st.err = ERR[d.err] || '받은 공지 상태를 저장하지 못했어요.'; draw(); return false; }
    if (st.file.inbox) { st.inbox = data; st.sha = d.sha; draw(); }
    return true;
  }
  // 빈 새 줄 (+ 새 줄 · 받은 공지에서 열기 같이 씀)
  function newRow() {
    const r = st.head.map(() => '');
    if (st.file.json) {
      const o = st.file.json.fresh();
      st.head.forEach((c, k) => { r[k] = String(o[c] == null ? '' : o[c]); });
      st.ids.push(o.id);
    } else {
      r[col('아이디')] = nextId();
      const pick = st.file.pick || {};
      Object.keys(pick).forEach((c) => { r[col(c)] = pick[c][0]; });
    }
    st.rows.push(r); st.open = st.rows.length - 1;
    return r;
  }
  // 받은 글을 고른 탭의 새 줄로 미리 채워 열어 줘요. 칸은 다 고칠 수 있고, 저장을 눌러야 배포돼요 (저장하면 그 글은 처리됨)
  async function openFromInbox(item, key) {
    const f = FILES.find((x) => x.key === key);
    await loadFile(f);
    if (st.file !== f || !st.head.length) return;
    const lines = item.text.split('\n').map((l) => l.trim()).filter(Boolean);
    const first = (lines[0] || '').slice(0, 60);
    const ds = datesIn(item.text); const last = ds[ds.length - 1];
    const today = kst(new Date());
    const other = (item.text.match(/https?:\/\/\S+/g) || []).find((u) => !/^https?:\/\/(x|twitter)\.com\//i.test(u) && !NO_LINK.test(u)) || '';
    const fill = {
      title: first, 내용: first, 상대아티스트: first, 이름: first,
      body: lines.slice(1).join('\n'),
      until: last ? `${last.date}T${last.time || '23:59'}` : `${kst(new Date(Date.now() + 3 * 864e5))}T23:59`,
      date: ds.length ? ds[0].date : today, 시작일: ds.length ? ds[0].date : today, 방송일: ds.length ? ds[0].date : today,
      end: last ? last.date : today, 종료일: last ? last.date : today,
      마감시간: last && last.time, 구분: f === TASKS ? '자체' : '', 음방: SHOWS.find((s) => item.text.includes(s)),
      link: item.url, 공지링크: item.url, 출처: item.url, 링크: other, 바로가기: other,
    };
    const r = newRow();
    st.head.forEach((c, k) => { if (fill[c]) r[k] = fill[c]; });
    st.fromInbox = { id: item.id, file: f, row: r };
    draw();
    $(`[data-row="${st.open}"]`, $adm).closest('li').scrollIntoView({ block: 'start' });
    toast('칸을 고친 뒤 저장하면 배포돼요');
  }
  function drawInbox(chips, job) {
    const all = (st.inbox && st.inbox.items) || [];
    const wait = all.filter((x) => x.state === 'wait');
    const when = (s) => (s ? s.replace('T', ' ').slice(5) : '');
    const dests = [NOTICE].concat(FILES.filter((f) => !f.inbox && f !== NOTICE));
    const dest = (x) => st.dest[x.id] || (x.guess === 'todo' ? 'tasks' : 'notice');
    const cr = st.crawl && CRAWL[st.crawl.state];
    const list = wait.map((x) => `<li class="card adm-in">
        <div class="adm-in-h"><span class="status ${x.guess === 'todo' ? 'tbd' : 'soon'}">${x.guess === 'todo' ? '할 일 추천' : '공지 추천'}</span><small>${esc(when(x.at))}</small>
          <a href="${esc(x.url)}" target="_blank" rel="noopener">X에서 보기 ↗</a></div>
        <p class="adm-in-text">${esc(x.text)}</p>
        <div class="adm-row-a">
          <select class="adm-in-dest" data-idest="${esc(x.id)}" aria-label="어디에 넣을지">${dests.map((f) => `<option value="${f.key}"${f.key === dest(x) ? ' selected' : ''}>${esc(fname(f))}</option>`).join('')}</select>
          <button type="button" class="btn small primary" data-iopen="${esc(x.id)}"${st.busy ? ' disabled' : ''}>열어서 고치기</button>
          <button type="button" class="btn small" data-iskip="${esc(x.id)}"${st.busy ? ' disabled' : ''}>건너뛰기</button>
        </div>
      </li>`).join('');
    $adm.innerHTML = `
      <section class="page-head"><h1>관리자 모드</h1><p>음총팀 X 새 글이 10분마다 여기 모여요. 넣을 곳을 고르고 "열어서 고치기" → 칸을 고친 뒤 저장하면 1~2분 뒤 사이트에 반영돼요.</p></section>
      <div class="adm-crawl">
        <button type="button" class="btn small" data-crawl${cr && cr[1] === 'soon' && st.crawl.state !== 'slow' ? ' disabled' : ''}>지금 새 글 받기</button>
        ${cr ? `<span class="status ${cr[1]}">${esc(cr[0])}</span>${st.crawl.url ? ` <a href="${esc(st.crawl.url)}" target="_blank" rel="noopener">자세히 보기</a>` : ''}` : ''}
      </div>
      <nav class="adm-chips" aria-label="고칠 자료">${chips}</nav>
      ${!st.inbox ? '<p class="adm-empty">불러오는 중…</p>' : wait.length ? `<ul class="adm-list">${list}</ul>`
        : `<p class="adm-empty">새로 받은 공지가 없어요.${st.inbox.updated ? `<br><small>마지막으로 새 글 받은 때 ${esc(when(st.inbox.updated))}</small>` : '<br><small>아직 한 번도 받지 않았어요. X 로그인 정보(비밀값)를 넣었는지 확인해 주세요.</small>'}</p>`}
      <div class="adm-bar">
        <div class="container adm-bar-in">
          ${job ? `<p class="adm-job"><span class="status ${job[1]}">${esc(job[0])}</span>${st.job.url ? ` <a href="${esc(st.job.url)}" target="_blank" rel="noopener">자세히 보기</a>` : ''}</p>` : ''}
          <p class="adm-msg" role="alert">${esc(st.err)}</p>
          <span class="adm-cnt">${wait.length ? `대기 ${wait.length}개` : '대기 없음'}</span>
        </div>
      </div>`;
  }

  // "지금 새 글 받기": 공지 받기(x-inbox.yml)를 바로 한 번 돌리고, 끝나면 받은 공지를 새로 불러와요 (최대 5분)
  async function crawl() {
    const at = Date.now();
    st.crawl = { at, state: 'queued' }; st.err = ''; draw();
    const d = await call('POST', '/crawl');
    if (!d.ok) { st.crawl = null; st.err = ERR[d.err] || '실행하지 못했어요.'; draw(); return; }
    const since = new Date(at - 10e3).toISOString();
    const tick = async () => {
      const c = st.crawl;
      if (!c || c.at !== at) return;
      if (Date.now() - at > 5 * 60e3) { c.state = 'slow'; draw(); return; }
      const r = await call('GET', '/status?wf=crawl&since=' + encodeURIComponent(since));
      if (r.ok && r.state !== 'waiting') { c.state = r.state; c.url = r.url || c.url; }
      if (c.state === 'success') { if (st.file.inbox) await loadFile(st.file); st.crawl = { ...c }; draw(); return; }
      draw();
      if (!['failure', 'cancelled'].includes(c.state)) setTimeout(tick, 5000);
    };
    setTimeout(tick, 4000);
  }
  const CRAWL = {
    queued: ['X에서 받는 중 (보통 1분 안)', 'soon'], waiting: ['X에서 받는 중 (보통 1분 안)', 'soon'], in_progress: ['X에서 받는 중 (보통 1분 안)', 'soon'],
    success: ['다 받았어요', 'live'], failure: ['받지 못했어요. 자세히 보기에서 이유를 확인해 주세요', 'hot'],
    cancelled: ['받기가 취소됐어요', 'hot'], slow: ['아직 끝나지 않았어요. 자세히 보기에서 확인해 주세요', 'soon'],
  };

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
    waiting: ['검사 기다리는 중', 'soon'], queued: ['검사 기다리는 중', 'soon'], in_progress: ['검사하고 올리는 중 (1~2분)', 'soon'],
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
  const fname = (f) => (FILES.filter((x) => x.tab === f.tab).length > 1 ? `${f.tab} · ${f.label}` : f.tab);
  const label = (c) => (st.file.json ? st.file.json.label[c] || c : c);
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
    } else if (TIME_COLS.includes(c)) {
      input = `<input id="${id}" data-k="${k}" type="datetime-local" value="${esc(v)}">`;
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
    // 위 칩 = 사이트 탭. 한 탭에 자료가 둘이면(연합&기타) 그 아래에서 나눠요
    const tabs = [...new Set(FILES.map((x) => x.tab))];
    const chips = tabs.map((t) => `<button type="button" class="adm-chip${t === f.tab ? ' on' : ''}" data-file="${FILES.find((x) => x.tab === t).key}" aria-pressed="${t === f.tab}">${esc(t)}</button>`).join('');
    if (f.inbox) { drawInbox(chips, job); return; }
    const same = FILES.filter((x) => x.tab === f.tab);
    const seg = same.length > 1 ? `<div class="seg adm-seg" role="group" aria-label="${esc(f.tab)}">${same.map((x) => `<button type="button" data-file="${x.key}" class="${x === f ? 'on' : ''}" aria-pressed="${x === f}">${esc(x.label)}</button>`).join('')}</div>` : '';
    // 끝난 줄(종료일이 어제 이전)은 접어 둬요. 새 줄 · 고친 줄은 늘 보여요
    const t = kst(new Date());
    const ended = (i) => f.end && !isNew(i) && !ch.includes(i) && st.open !== i && (st.rows[i][col(f.end)] || '9') < t;
    const nEnd = st.rows.filter((_, i) => ended(i)).length;
    const sub =(r) => f.sub.map((c) => r[col(c)]).filter(Boolean).map((v) => esc(v.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/, '$1 $2'))).join(' · ');
    const list = st.rows.map((r, i) => {
      if (!st.showEnd && ended(i)) return '';
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
      <section class="page-head"><h1>관리자 모드</h1><p>고친 뒤 저장하면 검사를 거쳐 1~2분 뒤 사이트에 반영돼요.</p></section>
      <nav class="adm-chips" aria-label="고칠 자료">${chips}</nav>
      ${seg}
      ${f.where ? `<p class="adm-where">${esc(f.where)}</p>` : ''}
      ${st.busy && !st.rows.length ? '<p class="adm-empty">불러오는 중…</p>' : ''}
      <ul class="adm-list">${list}</ul>
      ${nEnd ? `<button type="button" class="btn small adm-ended" data-showend>${st.showEnd ? `끝난 것 ${nEnd}개 숨기기` : `끝난 것 ${nEnd}개 보기`}</button>` : ''}
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
  $adm.addEventListener('change', (e) => {
    if (e.target.dataset.idest) { st.dest[e.target.dataset.idest] = e.target.value; return; }
    if (e.target.tagName === 'SELECT') draw();
  });
  $adm.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !st.ticket) return;
    const item = (id) => ((st.inbox && st.inbox.items) || []).find((x) => x.id === id);
    if (b.dataset.iopen) { const sel = $(`[data-idest="${b.dataset.iopen}"]`, $adm); openFromInbox(item(b.dataset.iopen), sel.value); return; }
    if (b.dataset.crawl != null) { crawl(); return; }
    if (b.dataset.iskip) { st.busy = true; draw(); markInbox(b.dataset.iskip, 'skip').then(() => { st.busy = false; draw(); }); return; }
    if (b.dataset.file) {
      const f = FILES.find((x) => x.key === b.dataset.file);
      if (changed().length && !confirm('저장하지 않은 고친 것이 사라져요. 다른 자료로 옮길까요?')) return;
      st.fromInbox = null;
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
    } else if (b.dataset.undel != null) {
      st.del.delete(+b.dataset.undel); st.err = ''; draw();
    } else if (b.dataset.undo != null) {
      const i = +b.dataset.undo; st.rows[i] = st.orig[i].split('\u0001'); draw();
    } else if (b.dataset.drop != null) {
      const i = +b.dataset.drop; st.rows.splice(i, 1); if (st.file.json) st.ids.splice(i, 1); st.open = -1; draw();
    } else if (b.hasAttribute('data-add')) {
      newRow(); draw();
      $(`[data-row="${st.open}"]`, $adm).closest('li').scrollIntoView({ block: 'center' });
    } else if (b.hasAttribute('data-showend')) {
      st.showEnd = !st.showEnd; draw();
    } else if (b.hasAttribute('data-save')) save();
  });
  $('#admOut').addEventListener('click', () => {
    if (changed().length && !confirm('저장하지 않은 고친 것이 사라져요. 나갈까요?')) return;
    st.rows = []; st.orig = []; st.head = []; logout();
  });
  window.addEventListener('beforeunload', (e) => { if (st.ticket && changed().length) { e.preventDefault(); e.returnValue = ''; } });

  if (st.ticket && API) loadFile(st.file); else draw();
})();
