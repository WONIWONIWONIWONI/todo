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
      path: 'sheet-templates/할일.csv', title: ['내용'], sub: ['투표종류', '시작일', '종료일'], need: ['아이디', '구분', '내용', '투표종류ID'], idPrefix: 'S',
      pick: { 구분: ['자체', '줄 것', '받을 것'], 반복: ['', '매일', '요일', '1회', '기간 중 1회'] }, suggest: ['투표종류'], end: '종료일' },
    // 사이트 설정 표 (setup): 받은 공지에서 넣을 곳으로 고르지 않아요. rowKey = 줄을 알아보는 칸 (없으면 아이디), order = 줄 순서 바꾸기
    { key: 'camps', tab: '오늘·연합 일정', label: '투표 종류', setup: true, rowKey: '아이디', idPrefix: 'campaign-', order: true, del: true,
      where: '오늘 탭 종류 카드 · 할 일 묶음이 이 순서로 보여요 (위일수록 먼저). 묶음은 "색 묶음"에 있는 이름이에요. 여기 없는 종류는 이름이 묶음 이름으로 시작하면 그 묶음(MAMA 팬 초이스 1차 → MAMA), 아니면 기타로 가요. 이름을 바꾸면 할 일의 투표종류 칸도 같이 바꿔 주세요.',
      path: 'sheet-templates/투표종류.csv', title: ['투표종류'], sub: ['묶음'], need: ['아이디', '투표종류', '묶음'], suggest: ['묶음'] },
    { key: 'groups', tab: '오늘·연합 일정', label: '색 묶음', setup: true, rowKey: '묶음', order: true, del: true,
      where: '투표 종류를 묶는 색이에요 (오늘 탭 종류 카드 · 할 일 줄 · 연합 일정 막대). 이 순서로 보여요. "기타"는 모르는 종류가 들어가는 곳이라 지우지 않아요.',
      path: 'sheet-templates/색묶음.csv', title: ['묶음'], sub: ['색'], need: ['묶음', '색'] },
    { key: 'waves', tab: '오늘·연합 일정', label: '음악 바로가기 (뮤직웨이브)', setup: true, rowKey: '이름', order: true, del: true,
      where: '오늘 탭 음악 버튼을 표시할 순서로 등록해요. 서비스는 멜론·지니·스테이션헤드 중 하나예요. 멜론만 방 번호와 방 종류를 입력해요.',
      path: 'sheet-templates/뮤직웨이브.csv', title: ['이름'], sub: ['서비스', '링크'], need: ['이름', '링크'] },
    { key: 'music', tab: '음악방송', label: '음방 출연 · 투표', where: '사이트 "음악방송" 탭에 보여요. 출연은 "리센느 일정"에도 보여요. (사전투표는 할 일로 넣어요)',
      path: 'sheet-templates/음방.csv', title: ['음방', '구분'], sub: ['방송일', '메모'], need: ['아이디', '음방', '구분', '방송일'],
      pick: { 음방: SHOWS, 구분: ['출연', '실시간투표', '1위후보'] }, del: true },
    // 음방 7개 투표 방법 설명 (src/50-music.js 가 읽어요). 음방마다 한 줄이라 새 줄 · 삭제 없음
    { key: 'musicinfo', tab: '음악방송', label: '음방 안내', where: '사이트 "음악방송" 탭 아래 음방별 투표 방법 카드의 글이에요. 여러 줄 칸은 한 줄이 항목 하나예요. 칸을 비우면 그 글이 안 보여요.',
      path: 'sheet-templates/음방안내.csv', title: ['음방'], sub: ['확인일', '적용기준'], need: ['아이디'], fixed: true, setup: true,
      long: ['1위 정하는 방법', '사전투표 언제', '사전투표 방법', '사전투표 투표권', '사전투표 모으기', '사전투표 투표 수', '실시간 언제', '실시간 방법', '실시간 투표권', '실시간 투표 수', '알아두면 좋아요', '방송 뒤 투표'] },
    // 음방 7개 기본 정보 (src/50-music.js 가 읽어요). 음방마다 한 줄이라 새 줄 · 삭제 없음
    { key: 'musicshows', tab: '음악방송', label: '음방 기본 정보', setup: true, fixed: true,
      where: '음악방송 탭 · 오늘 탭 음방 안내의 요일 · 시간 · 점수 · 투표 앱이에요. 점수 항목 · 공식 링크는 한 줄에 하나, "이름 | 내용" 꼴 (예: 음원 40% | 애플뮤직). 사전투표 시간은 "목 12:00 ~ 토 12:00" 꼴. 앱 칸은 "투표 앱"의 아이디 (여러 개면 쉼표). 실시간 앱을 비우면 실시간 투표 없음. 결방은 결방 시작 ~ 결방 끝 (끝을 비우면 다시 시작 미정)이고, 날짜가 지나면 저절로 원래대로 보여요.',
      path: 'sheet-templates/음방정보.csv', title: ['음방'], sub: ['요일', '시작', '채널', '확인일'], need: ['아이디', '음방', '요일', '시작', '끝', '채널', '사전투표 앱'],
      pick: { 요일: ['일', '월', '화', '수', '목', '금', '토'] }, long: ['점수 항목', '공식 링크', '사전투표 비용', '실시간 비용', '결방 설명'] },
    { key: 'apps', tab: '음악방송', label: '투표 앱', setup: true, del: true,
      where: '음방 투표 버튼이 여는 앱이에요. 아이디는 "음방 기본 정보"의 앱 칸에 써요 (영어 소문자). 앱 주소 · 앱 링크는 휴대폰에서 앱을 바로 여는 값이라 확실할 때만 바꿔 주세요. 아이폰 앱 번호는 앱스토어 주소 id 뒤 숫자예요.',
      path: 'sheet-templates/투표앱.csv', title: ['이름'], sub: ['아이디', '홈페이지'], need: ['아이디', '이름', '안드로이드 패키지', '아이폰 앱 번호'],
      pick: { '아이폰도 앱 링크로': ['', '예'] } },
    // JSON 자료: list = 목록 이름, cols = 고칠 칸, label = 칸 이름, fresh = 새 줄 기본값(id 포함), sort = 날짜순 정렬
    { key: 'weekly', tab: '리센느 일정', label: '리센느 일정', where: '사이트 "리센느 일정" 탭에 blip · Mnet Plus 일정과 같이 보여요. (blip · Mnet Plus 는 자동이라 여기 없어요)',
      path: 'data/weekly.json', title: ['title'], sub: ['date', 'end', 'category'], need: ['date', 'title'],
      json: { list: 'events', cols: ['date', 'end', 'time', 'category', 'title', 'note', 'link', 'checkedAt', 'sourceNote'], sort: true,
        label: { checkedAt: '확인일', sourceNote: '확인 근거 (관리용)', date: '시작일', end: '종료일', time: '시간', category: '일정 종류', title: '제목', note: '메모', link: '링크' },
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
  FILES.push({ key: 'schedulefixes', tab: '리센느 일정', label: '일정 보정·중복 처리', path: 'sheet-templates/일정보정.csv', title: ['이유'], sub: ['구분', '출처', '대상아이디'], need: ['아이디', '구분', '출처', '대상아이디', '이유'], del: true, setup: true, pick: { 구분: ['보정', '병합', '분리'], 출처: ['blip', 'mnetplus', 'etc'] }, where: '자동 수집 원본을 바꾸지 않고 수정해요. 병합·분리는 대상아이디와 상대아이디를 함께 넣어요. 확인하지 않은 정보에 확인일을 임의로 넣지 마세요.' });
  FILES.push({ ...FILES.find(f => f.key === 'schedulefixes'), key: 'review', tab: '일정 중복 검토', label: '일정 중복 후보', review: true });
  const TASKS = FILES.find((f) => f.key === 'tasks');
  const NOTICE = FILES.find((f) => f.key === 'notice');
  const DATE_COLS = ['checkedAt', '확인일', '시작일', '종료일', '방송일', 'date', 'end', '결방 시작', '결방 끝'];
  const COLOR_COLS = ['색'];
  const TIME_COLS = ['until']; // 한국 시각 YYYY-MM-DDTHH:MM
  const LONG_COLS = ['내용', '메모', 'note', 'body'];
  const isLong = (c) => LONG_COLS.includes(c) || (st.file.long || []).includes(c);

  const st = { dest: {}, showEnd: false, del: new Set(), fresh: new Set(), base: new Map(), ticket: '', file: FILES[0], sha: '', head: [], rows: [], orig: [], json: null, nl: '\n', open: -1, busy: false, err: '', job: null, runs: {}, push: { state: 'checking' } };
  try { st.ticket = localStorage.getItem(KEY) || ''; } catch (e) { /* 무시 */ }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  async function call(method, path, body) {
    let r; const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      r = await fetch(API + path, { method, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(st.ticket ? { Authorization: 'Bearer ' + st.ticket } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { return { ok: false, err: 'net' }; } finally { clearTimeout(timeout); }
    const d = await r.json().catch(() => ({ ok: false, err: 'server' }));
    st.protocol = d.protocol || 1;
    if (d.err === 'auth' && path !== '/login') logout('로그인이 끝났어요. 비밀번호를 다시 넣어 주세요.');
    return d;
  }
  const ERR = { net: '서버에 닿지 못했어요. 인터넷을 확인해 주세요.', limit: '1분에 5번까지예요. 잠시 뒤 다시 해 주세요.', auth: '비밀번호가 달라요.', conflict: '그 사이에 이 파일이 바뀌었어요. 위에서 자료 이름을 다시 눌러 새로 불러온 뒤 고쳐 주세요.', github: 'GitHub에서 문제가 생겼어요.', server: '서버에서 문제가 생겼어요.', body: '보낼 내용이 이상해요.', notfound: '저장 서버가 예전 버전이에요. admin-worker 폴더에서 npx wrangler deploy 를 한 번 실행해 주세요.', perm: 'GitHub 토큰에 Actions 쓰기 권한이 없어요. 사용설명서의 GH_TOKEN 설명대로 권한을 바꿔 주세요.', path: '고칠 수 없는 파일이에요.' };

  const draftKey = () => 'rs-admin-draft:' + st.file.path;
  function persistDraft() {
    if (!st.sha || !changed().length) return;
    try { localStorage.setItem(draftKey(), JSON.stringify({ sha: st.sha, rows: st.rows, ids: st.ids, head: st.head, fresh: st.rows.map((r, i) => st.fresh.has(r) ? i : -1).filter(i => i >= 0), deleted: [...st.del], fromInbox: st.fromInbox ? { id: st.fromInbox.id, row: st.rows.indexOf(st.fromInbox.row) } : null, at: Date.now() })); }
    catch (_) { toast('초안을 기기에 보관하지 못했어요. 저장 공간을 확인해 주세요.'); }
  }
  function restoreDraft() {
    const d = st.recoverDraft;
    if (!d || d.sha !== st.sha || JSON.stringify(d.head) !== JSON.stringify(st.head)) return;
    st.rows = d.rows; if (d.ids) st.ids = d.ids;
    st.fresh = new Set((d.fresh || []).map(i => st.rows[i])); st.del = new Set(d.deleted || []);
    if (d.fromInbox) st.fromInbox = { id: d.fromInbox.id, file: st.file, row: st.rows[d.fromInbox.row] };
    st.recoverDraft = null; draw(); toast('작성하던 초안을 복원했어요');
  }
  function diffPreview() {
    return '<details class="adm-review"><summary>변경 내용 확인 · ' + changed().length + '개</summary>' + changed().map(i => {
      const old = (st.base.get(st.rows[i]) || '').split('\u0001'), row = st.rows[i];
      return '<article><h3>' + esc(idOf(i) || '새 항목') + (st.del.has(i) ? ' · 삭제 예정' : '') + '</h3>' + st.head.map((h, k) => old[k] !== row[k] ? '<p><b>' + esc(label(h)) + '</b><del>' + esc(old[k] || '(비움)') + '</del><ins>' + esc(row[k] || '(비움)') + '</ins></p>' : '').join('') + '</article>';
    }).join('') + '</details>';
  }
  function groupedFields(row, i) {
    if (st.file.key !== 'musicshows') return st.head.map((c,k) => field(c,k,row[k],i)).join('');
    const groups = new Map();
    st.head.forEach((c,k) => { const group = c.startsWith('사전') ? '사전투표' : c.startsWith('실시간') || c === '문자투표' ? '실시간 투표' : c.startsWith('결방') ? '결방·변경' : ['확인일','적용기준','공식 링크'].includes(c) ? '확인 근거' : '방송 기본 정보'; if (!groups.has(group)) groups.set(group,[]); groups.get(group).push(field(c,k,row[k],i)); });
    return [...groups].map(([title,fields]) => '<fieldset class="adm-fields"><legend>' + title + '</legend>' + fields.join('') + '</fieldset>').join('');
  }

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
    // 불러오는 동안 이전 자료 줄이 새 칸으로 잘못 그려지지 않게 비우고, 화면 높이를 잡아 둬서 위로 튕기지 않게 해요
    $adm.style.minHeight = $adm.offsetHeight + 'px';
    st.file = f; st.search = ''; st.rowFilter = ''; st.recoverDraft = null; st.review = null; st.inbox = null; st.sha = ''; st.open = -1; st.busy = true; st.err = ''; st.head = []; st.rows = []; st.del = new Set(); st.fresh = new Set(); draw();
    st.reviewSelection = new Set();
    const d = await call('GET', f.review ? '/schedule-review' : '/file?path=' + encodeURIComponent(f.path));
    if (d.ok && d.protocol === 2 && !st.catalog) { const catalog = await call('GET', '/catalog'); if (catalog.ok) st.catalog = catalog.tables; }
    st.busy = false; $adm.style.minHeight = '';
    if (!d.ok) { if (!st.ticket) { draw(); return; } st.err = ERR[d.err] || '불러오지 못했어요.'; draw(); return; }
    try {
      st.sha = d.sha;
      if (f.review) st.review = d.candidates;
      if (f.inbox) {
        st.inbox = JSON.parse(d.text);
        if (!Array.isArray(st.inbox.items)) throw new Error();
        st.head = []; st.rows = [];
      } else if (f.json) {
        const data = JSON.parse(d.text);
        if (!Array.isArray(data[f.json.list])) throw new Error();
        jsonRows(data);
      } else {
        st.nl = /\r\n/.test(d.text) ? '\r\n' : '\n';
        const all = parseCSV(d.text);
        st.head = all[0] || [];
        st.headRaw = all[0] ? all[0].raw : '';
        st.raw = all.slice(1).map((r) => r.raw);
        st.rows = all.slice(1).map((r) => st.head.map((_, i) => r[i] || ''));
      }
    } catch (err) {
      st.head = []; st.rows = []; st.inbox = null; st.sha = '';
      st.err = '자료 형식을 읽지 못했어요. 파일 내용을 확인한 뒤 다시 불러와 주세요.';
      draw(); return;
    }
    st.orig = st.rows.map((r) => r.join('\u0001'));
    st.base = new Map(st.rows.map((r) => [r, r.join('\u0001')]));
    st.del = new Set();
    try { st.recoverDraft = JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (_) { st.recoverDraft = null; }
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

  const isNew = (i) => st.fresh.has(st.rows[i]);
  // 그 줄을 불러온 때 내용으로 (줄 순서는 그대로). 같은 줄 객체를 고쳐서 받은 공지에서 연 줄도 그대로 알아봐요
  const restore = (i) => { const r = st.rows[i]; const o = st.base.get(r); if (o != null) r.splice(0, r.length, ...o.split('\u0001')); };
  // 지울 줄(st.del)은 저장을 누를 때까지 목록에 '삭제 예정'으로 남아요
  const changed = () => st.rows.map((r, i) => i).filter((i) => isNew(i) || st.del.has(i) || st.rows[i].join('\u0001') !== st.orig[i]);
  const keyCol = () => st.file.rowKey || '아이디';
  const idOf = (i) => (st.file.json ? st.ids[i] : st.rows[i][st.head.indexOf(keyCol())]);
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
    const edits = new Set(changed());
    st.rows.forEach((r, i) => {
      if (st.del.has(i)) return;
      const id = idOf(i) || '';
      const w = f.json ? (r[col('title')] || '새 줄') : (id || '새 줄');
      const issue = (column, message) => out.push({ row: i, column: col(column), message });
      if (!f.json) { if (seen.has(id)) issue(keyCol(), `${w}: ${keyCol()}${id ? ` "${id}"` : ''}이(가) 겹쳐요`); seen.add(id); }
      if (!edits.has(i)) return;
      f.need.forEach((c) => { if (!String(r[col(c)] || '').trim()) issue(c, `${w}: ${label(c)} 칸이 비었어요`); });
      st.head.forEach((c, k) => {
        const v = String(r[k] || '').trim();
        if (!v) return;
        if (c === '참여 주기' && (!/^(매시간 1회|틈날 때마다|[1-9]\d*(분|시간)마다)$/.test(v) || r[col('구분')] === '받을 것')) issue(c, `${w}: 참여 주기는 줄 것·자체 활동에 매시간 1회, 틈날 때마다, 또는 30분마다·2시간마다처럼 입력해요`);
        if (DATE_COLS.includes(c) && !RSData.isDate(v)) issue(c, `${w}: ${label(c)}은 YYYY-MM-DD → "${v}"`);
        if (TIME_COLS.includes(c) && !RSData.isDateTime(v)) issue(c, `${w}: ${label(c)} 날짜 · 시각을 다시 골라 주세요`);
        if (c === 'link' && !/^https?:\/\/\S+$/.test(v)) issue(c, `${w}: 링크는 https:// 또는 http:// 로 시작해야 해요`);
        if (COLOR_COLS.includes(c) && !/^#[0-9a-f]{6}$/i.test(v)) issue(c, `${w}: ${label(c)}은 #과 6자리 (예: #1f8a4c)`);
        if (NO_LINK.test(v) && !DC_OK.test(v)) issue(c, `${w}: 디시 주소는 넣지 않아요`);
      });
    });
    return out;
  }

  async function save() {
    if (st.protocol !== 2) { st.err = '저장 서버 업데이트가 필요해요. 입력한 내용은 이 기기에 초안으로 보관해요.'; persistDraft(); draw(); return; }
    if (st.job && !['success', 'failure', 'cancelled'].includes(st.job.state)) { st.err = '앞서 요청한 반영 결과를 먼저 확인해 주세요.'; draw(); return; }
    const bad = problems();
    if (bad.length) {
      const first = bad[0];
      st.open = first.row;
      st.err = bad.map((x) => x.message).join('\n');
      draw();
      const input = document.getElementById(`f-${first.row}-${first.column}`);
      if (input) {
        input.setAttribute('aria-invalid', 'true');
        input.scrollIntoView({ block: 'center' });
        input.focus({ preventScroll: true });
      }
      return;
    }
    const ch = changed();
    if (!ch.length) return;
    // 받은 공지에서 연 줄이 이번 저장에 들어가면 저장 뒤 그 글을 처리됨으로 (새 줄을 빼고 저장하면 그대로 대기)
    const fi = st.fromInbox && st.file === st.fromInbox.file && ch.some((i) => st.rows[i] === st.fromInbox.row) ? st.fromInbox : null;
    const names = ch.map((i) => (st.del.has(i) ? '삭제 ' : isNew(i) ? '추가 ' : '') + (st.file.json ? st.rows[i][col('title')] : idOf(i)));
    // 받은 공지에서 올린 공지 팝업을 지우면 그 글을 받은 공지(대기)로 돌려놔요 → 다시 올릴 수 있게. 공지 링크(X 글 주소)로 찾아요
    const back = st.file === NOTICE ? ch.filter((i) => st.del.has(i)).map((i) => (st.rows[i][col('link')].match(/x\.com\/ResceneStream\/status\/(\d+)/) || [])[1]).filter(Boolean) : [];
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
    const fileErrors = RSData.validateFile(st.file.path, text);
    if (fileErrors.length) { st.err = fileErrors.map(x => `${x.row}줄 ${x.column}: ${x.message}`).join('\n'); draw(); return; }
    persistDraft();
    st.busy = true; st.err = ''; draw();
    const d = await call('PUT', '/file', { path: st.file.path, sha: st.sha, text, note, inboxDone: fi ? [String(fi.id)] : [], inboxWait: back });
    st.busy = false;
    if (!d.ok) { if (!st.ticket) { draw(); return; } st.err = d.errors ? d.errors.map(e => `${e.row}줄 ${e.column}: ${e.message}`).join('\n') : ERR[d.err] || '저장하지 못했어요.'; draw(); return; }
    st.sha = d.sha;
    if (st.file.json) jsonRows(JSON.parse(text));
    else { const all = parseCSV(text).slice(1); st.raw = all.map((r) => r.raw); st.rows = all.map((r) => st.head.map((_, i) => r[i] || '')); }
    st.orig = st.rows.map((r) => r.join('\u0001'));
    st.base = new Map(st.rows.map((r) => [r, r.join('\u0001')]));
    st.del = new Set(); st.fresh = new Set();
    st.open = -1;
    st.job = { commit: d.commit, branch: d.branch, fileSha: d.fileSha, path: st.file.path, state: d.dispatched === false ? 'slow' : 'waiting', at: Date.now(), note };
    try { localStorage.setItem('rs-admin-publication', JSON.stringify(st.job)); localStorage.removeItem(draftKey()); } catch (_) {}
    toast('초안을 저장했어요. 검사 후 사이트에 반영해요.');
    draw();
    watch();
    if (fi) st.fromInbox = null; // source notice is finalized by Actions only after deployment verification
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
  // ids: 글 하나 또는 여러 개. from 이 있으면 그 상태인 글만 바꿔요. 바뀐 게 없으면 저장 안 함 (바꿨으면 true)
  async function markInbox(ids, state, from) {
    const g = await call('GET', '/file?path=' + encodeURIComponent('data/inbox.json'));
    if (!g.ok) { st.err = ERR[g.err] || '받은 공지를 불러오지 못했어요.'; draw(); return false; }
    const data = JSON.parse(g.text);
    const want = [].concat(ids);
    const hit = (data.items || []).filter((x) => want.includes(x.id) && x.state !== state && (!from || x.state === from));
    if (!hit.length) return false;
    hit.forEach((x) => { x.state = state; });
    const d = await call('PUT', '/file', { path: 'data/inbox.json', sha: g.sha, text: JSON.stringify(data, null, 1) + '\n', note: `받은 공지 ${{ skip: '건너뜀', wait: '되돌림' }[state] || '처리'}` });
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
      if (!st.file.rowKey || st.file.rowKey === '아이디') r[col('아이디')] = nextId(); // 다른 칸으로 알아보는 표는 직접 적어요
      const pick = st.file.pick || {};
      Object.keys(pick).forEach((c) => { r[col(c)] = pick[c][0]; });
    }
    st.rows.push(r); st.fresh.add(r); st.open = st.rows.length - 1;
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
    const dests = [NOTICE].concat(FILES.filter((f) => !f.inbox && !f.setup && f !== NOTICE));
    const dest = (x) => st.dest[x.id] || (x.guess === 'todo' ? 'tasks' : 'notice');
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
      <section class="page-head"><h1>받은 공지</h1><p>음총팀 X 새 글이 10분마다 여기 모여요. 넣을 곳을 고르고 "열어서 고치기" → 칸을 고친 뒤 저장하면 1~2분 뒤 사이트에 반영돼요.</p></section>
      ${runTop()}
      <nav class="adm-chips" aria-label="고칠 자료">${chips}</nav>
      ${runRow(st.file.tab)}
      ${!st.inbox ? loadState() : wait.length ? `<ul class="adm-list">${list}</ul>`
        : `<p class="adm-empty">새로 받은 공지가 없어요.${st.inbox.updated ? `<br><small>마지막으로 새 글 받은 때 ${esc(when(st.inbox.updated))}</small>` : '<br><small>아직 한 번도 받지 않았어요. X 로그인 정보(비밀값)를 넣었는지 확인해 주세요.</small>'}</p>`}
      <div class="adm-bar">
        <div class="container adm-bar-in">
          ${job ? `<p class="adm-job">${st.job.branch && ['failure','cancelled','slow'].includes(st.job.state) ? '<button type="button" class="btn small" data-retry>저장한 초안 다시 반영</button>' : ''}<span class="status ${job[1]}">${esc(job[0])}</span>${st.job.url ? ` <a href="${esc(st.job.url)}" target="_blank" rel="noopener">자세히 보기</a>` : ''}</p>` : ''}
          <p class="adm-msg" role="alert">${esc(st.err)}</p>
          <span class="adm-cnt">${wait.length ? `대기 ${wait.length}개` : '대기 없음'}</span>
        </div>
      </div>`;
  }

  // ---------- 새 공지 알림 (웹 푸시) ----------
  // 이 기기를 워커에 구독시켜요. 새 글이 들어오면 admin/sw.js 가 알림을 띄워요.
  // 아이폰은 홈 화면에 추가한 앱(리센느 관리)에서만 되고, 버튼을 눌러야 허락 창이 떠요
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const STANDALONE = (() => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } })();
  const b64key = (s) => { const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  const swReady = ('serviceWorker' in navigator) ? navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => null) : Promise.resolve(null);
  async function pushCheck() {
    const reg = await swReady;
    if (!reg || !('PushManager' in window) || !('Notification' in window)) { st.push = { state: IOS && !STANDALONE ? 'install' : 'none' }; draw(); return; }
    if (Notification.permission === 'denied') { st.push = { state: 'denied' }; draw(); return; }
    const sub = await reg.pushManager.getSubscription().catch(() => null);
    st.push = { state: sub ? 'on' : 'off' };
    if (sub) call('POST', '/push/sub', { sub: sub.toJSON() }); // 워커 쪽 구독이 지워졌어도 다시 채워요
    draw();
  }
  async function pushOn() {
    st.push = { state: st.push.state, busy: true }; st.err = ''; draw();
    try {
      const reg = await swReady;
      if ((await Notification.requestPermission()) !== 'granted') { st.push = { state: Notification.permission === 'denied' ? 'denied' : 'off' }; draw(); return; }
      const k = await call('GET', '/push/key');
      if (!k.ok) throw new Error(k.err);
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64key(k.key) });
      const d = await call('POST', '/push/sub', { sub: sub.toJSON() });
      if (!d.ok) throw new Error(d.err);
      st.push = { state: 'on' }; toast('알림을 켰어요. "시험 알림"으로 확인해 보세요');
    } catch (e) {
      st.push = { state: 'off' }; st.err = ERR[e.message] || '알림을 켜지 못했어요. 잠시 뒤 다시 해 주세요.';
    }
    draw();
  }
  async function pushOff() {
    st.push = { state: 'on', busy: true }; draw();
    const sub = await (await swReady).pushManager.getSubscription().catch(() => null);
    if (sub) { await call('POST', '/push/sub', { sub: sub.toJSON(), off: true }); await sub.unsubscribe().catch(() => {}); }
    st.push = { state: 'off' }; draw();
  }
  async function pushTest() {
    st.push = { state: 'on', busy: true }; draw();
    const d = await call('POST', '/push/test');
    st.push = { state: 'on' };
    if (!d.ok) st.err = ERR[d.err] || '시험 알림을 보내지 못했어요.';
    else toast(d.sent ? `알림 ${d.sent}대에 보냈어요` : '알림을 켠 기기가 없어요');
    draw();
  }
  // 위 구석 종 버튼: 누르면 작은 창에서 켜고 끄기 · 시험 알림. 다시 그릴 때 열린 창은 그대로 둬요
  const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9"/><path d="M10 19.5a2 2 0 0 0 4 0"/></svg>';
  function drawBell() {
    const el = $('#admBell');
    if (!st.ticket) { el.innerHTML = ''; el.dataset.h = ''; return; }
    const p = st.push; const dis = p.busy ? ' disabled' : '';
    const [label, body] = {
      checking: ['확인 중', '<p>확인 중…</p>'],
      on: ['켜짐', `<p><span class="status live">알림 켜짐</span> 새 공지가 들어오면 이 기기로 알려요</p><div><button type="button" class="btn small" data-push="test"${dis}>시험 알림</button><button type="button" class="btn small" data-push="off"${dis}>끄기</button></div>`],
      off: ['꺼짐', `<p>새 공지가 들어오면 이 기기로 알려요</p><div><button type="button" class="btn small primary" data-push="on"${dis}>알림 켜기</button></div>`],
      install: ['못 씀', '<p>아이폰은 사파리 공유 → <b>홈 화면에 추가</b>로 "리센느 관리" 앱을 만든 뒤, 그 앱에서 알림을 켜 주세요</p>'],
      denied: ['막힘', '<p>알림이 막혀 있어요. 설정 → 알림에서 "리센느 관리"를 허용한 뒤 다시 열어 주세요</p>'],
      none: ['못 씀', '<p>이 브라우저는 알림을 못 받아요</p>'],
    }[p.state];
    const html = `<details><summary class="btn small adm-bell-b${p.state === 'on' ? ' on' : ''}" aria-label="새 공지 알림 ${label}" title="새 공지 알림 ${label}">${BELL}</summary><div class="card adm-bell-p">${body}</div></details>`;
    if (el.dataset.h === html) return;
    const open = $('details', el) && $('details', el).open;
    el.innerHTML = html; el.dataset.h = html;
    if (open) $('details', el).open = true;
  }
  $('#admBell').addEventListener('click', (e) => {
    const b = e.target.closest('[data-push]');
    if (b) ({ on: pushOn, off: pushOff, test: pushTest })[b.dataset.push]();
  });
  // 창 밖을 누르면 닫혀요
  document.addEventListener('click', (e) => { const d = $('#admBell details'); if (d && d.open && !e.target.closest('#admBell')) d.open = false; });

  // 자동으로 도는 작업 4개를 직접 실행 (worker.js JOBS 와 같은 이름). tab = 개별 버튼이 보이는 탭 (없으면 맨 위)
  const RUNS = {
    crawl: { name: 'X 새 글', tab: '받은 공지', done: '다 받았어요' },
    blip: { name: 'blip · Mnet Plus 일정', tab: '리센느 일정', done: '다 받았어요. 1~2분 뒤 사이트에 보여요' },
    onair: { name: '음방 편성표 · 출연진', tab: '음악방송', done: '다 받았어요. 1~2분 뒤 사이트에 보여요' },
    health: { name: '자료 점검', done: '문제 없어요', fail: '문제가 있어요. 자세히 보기에서 할 일을 확인해 주세요' },
  };
  const RUN_STATE = { queued: '받는 중 (보통 1~2분)', waiting: '받는 중 (보통 1~2분)', in_progress: '받는 중 (보통 1~2분)', cancelled: '취소됐어요', slow: '아직 안 끝났어요. 자세히 보기에서 확인해 주세요' };
  const running = (r) => r && ['queued', 'waiting', 'in_progress'].includes(r.state);
  function runText(key) {
    const r = st.runs[key];
    if (!r) return '';
    const txt = r.state === 'success' ? RUNS[key].done : r.state === 'failure' ? RUNS[key].fail || '받지 못했어요. 자세히 보기에서 이유를 확인해 주세요' : RUN_STATE[r.state] || r.state;
    const cls = r.state === 'success' ? 'live' : ['failure', 'cancelled'].includes(r.state) ? 'hot' : 'soon';
    return `<span class="status ${cls}">${esc(txt)}</span>${r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener">자세히 보기</a>` : ''}`;
  }
  // 맨 위: 4개 한꺼번에 + 탭이 없는 작업(자료 점검)
  function runTop() {
    const keys = Object.keys(RUNS);
    const busy = keys.filter((k) => running(st.runs[k])).length;
    const done = keys.filter((k) => st.runs[k] && !running(st.runs[k])).length;
    const bad = keys.filter((k) => st.runs[k] && ['failure', 'cancelled'].includes(st.runs[k].state));
    const sum = busy ? `<span class="status soon">${done}/${keys.length} 끝 · 받는 중</span>` : done === keys.length && st.runs.all
      ? (bad.length ? `<span class="status hot">${bad.map((k) => RUNS[k].name).join(' · ')} 실패</span>` : '<span class="status live">4개 다 받았어요</span>') : '';
    return `<div class="adm-crawl adm-runs">
      <button type="button" class="btn small primary" data-runall${busy ? ' disabled' : ''}>전부 새로 받기</button>${sum}
      ${keys.filter((k) => !RUNS[k].tab).map((k) => `<button type="button" class="btn small" data-run="${k}"${running(st.runs[k]) ? ' disabled' : ''}>${esc(RUNS[k].name)}</button>${runText(k)}`).join('')}
    </div>`;
  }
  // 탭마다: 그 탭 자료를 채우는 작업
  function runRow(tab) {
    return Object.keys(RUNS).filter((k) => RUNS[k].tab === tab).map((k) => `<div class="adm-crawl">
      <button type="button" class="btn small" data-run="${k}"${running(st.runs[k]) ? ' disabled' : ''}>지금 ${esc(RUNS[k].name)} 받기</button>${runText(k)}
    </div>`).join('');
  }
  // 하나 실행하고 5초마다 진행 상황 (최대 5분). X 새 글이 끝나면 받은 공지를 새로 불러와요
  async function run(key) {
    const at = Date.now();
    st.runs[key] = { at, state: 'queued' }; st.err = ''; draw();
    const d = await call('POST', '/crawl', { job: key });
    if (!d.ok) { delete st.runs[key]; st.err = ERR[d.err] || '실행하지 못했어요.'; draw(); return; }
    const since = new Date(at - 10e3).toISOString();
    const tick = async () => {
      const r = st.runs[key];
      if (!r || r.at !== at) return;
      if (Date.now() - at > 5 * 60e3) { r.state = 'slow'; draw(); return; }
      const q = await call('GET', `/status?wf=${key}&since=${encodeURIComponent(since)}`);
      if (q.ok && q.state !== 'waiting') { r.state = q.state; r.url = q.url || r.url; }
      if (r.state === 'success' && key === 'crawl' && st.file.inbox) await loadFile(st.file);
      draw();
      if (running(r)) setTimeout(tick, 5000);
    };
    setTimeout(tick, 4000);
  }
  function runAll() {
    st.runs = { all: true };
    Object.keys(RUNS).forEach(run);
  }

  // 저장 뒤 Actions 진행 상황 (최대 8분)
  async function watch() {
    const job = st.job;
    if (!job || job.state === 'success' || job.state === 'failure') return;
    if (Date.now() - job.at > 8 * 60e3) { job.state = 'slow'; draw(); return; }
    const d = await call('GET', '/status?commit=' + job.commit + '&branch=' + encodeURIComponent(job.branch || ''));
    if (d.ok && d.state === 'success' && st.file.path === job.path && !st.file.review) st.sha = job.fileSha || st.sha;
    if (d.ok) { job.state = d.state; job.url = d.url || job.url; try { localStorage.setItem('rs-admin-publication', JSON.stringify(job)); } catch (_) {} draw(); }
    if (d.ok && st.file.review && st.file.path === job.path && !st.busy && ['success','failure','cancelled'].includes(job.state)) await loadFile(st.file);
    if (st.job === job && !['success', 'failure', 'cancelled'].includes(job.state)) setTimeout(watch, 6000);
  }
  const JOB = {
    waiting: ['검사 기다리는 중', 'soon'], queued: ['검사 기다리는 중', 'soon'], in_progress: ['검사하고 올리는 중 (1~2분)', 'soon'],
    success: ['사이트에 반영됐어요', 'live'], failure: ['검사 또는 반영에 실패했어요. 초안은 남아 있어요. 자세히 보기에서 확인해 주세요', 'hot'],
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
      <h1>관리자 로그인</h1>
      <p>관리용 페이지예요. 비밀번호를 입력해 주세요.</p>
      <form class="adm-lock-f" autocomplete="off">
        <input type="password" name="pw" autocomplete="current-password" placeholder="비밀번호" aria-label="비밀번호" maxlength="64" spellcheck="false" required>
        <button type="submit" class="btn primary"${st.busy ? ' disabled' : ''}>${st.busy ? '확인 중' : '들어가기'}</button>
      </form>
      <p class="adm-msg" role="alert">${esc(st.err)}</p>
    </section>`;
    const f = $('form', $adm);
    $('input', f).focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      st.busy = true; st.err = ''; drawLock();
      const pw = f.elements.namedItem('pw').value;
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
    const hint = ({'확인일':'실제로 원문을 확인한 날만 입력해요. 미확인은 비워 둬요.','적용기준':'적용 회차·시행일 등 확인한 범위를 적어요.','수량':'제목에서 추측하지 않고 이 수량을 표시해요.','투표종류':'투표 종류 선택에 따라 자동으로 정해져요.','원문링크':'관리자가 확인할 근거예요. 공개 메모에 자동 표시하지 않아요.'})[c];
    const lab = `<label for="${id}">${esc(label(c))}${st.file.need.includes(c) ? ' <i>꼭</i>' : ''}</label>`;
    const locked = ((c === '아이디' || (st.file.key === 'groups' && c === '묶음')) && !isNew(i)) || (st.file.key === 'tasks' && c === '투표종류') || (st.file.fixed && c === '음방');
    if (COLOR_COLS.includes(c)) {
      // 색 고르기 + 글자로도 (#1f8a4c)
      return `<div class="adm-f">${lab}<span class="adm-date"><input type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(v) ? v : '#64748b')}" data-k="${k}" aria-label="${esc(label(c))} 고르기" class="adm-color"><input id="${id}" data-k="${k}" value="${esc(v)}" maxlength="7" placeholder="#1f8a4c"></span></div>`;
    }
    const pick = (st.file.pick || {})[c];
    let input;
    if (c === '참여 주기') {
      const choices = ['매시간 1회', '틈날 때마다', '30분마다', '2시간마다'];
      input = `<input id="${id}" data-k="${k}" value="${esc(v)}" list="${id}-list" placeholder="예: 3시간마다"><datalist id="${id}-list">${choices.map(x => `<option value="${x}"></option>`).join('')}</datalist><small>비우면 일반 할 일에, 주기를 넣으면 ‘틈틈이 할 일’에 표시돼요.</small>`;
    } else if (['투표종류ID','연합아이디'].includes(c) && st.catalog) {
      const options = c === '투표종류ID' ? st.catalog['투표종류.csv'].map(r => [r['아이디'], r['투표종류']]) : st.catalog['연합.csv'].map(r => [r['아이디'], r['상대아티스트']]);
      if (v && !options.some(([id]) => id === v)) options.push([v, v + ' (원본 확인 필요)']);
      input = `<select id="${id}" data-k="${k}"><option value="">${c === '연합아이디' ? '연합 없음' : '투표 종류 선택'}</option>${options.map(([value,title]) => `<option value="${esc(value)}"${value===v ? ' selected' : ''}>${esc(title)}</option>`).join('')}</select>`;
    } else if (pick) {
      const opts = pick.includes(v) ? pick : pick.concat([v]);
      input = `<select id="${id}" data-k="${k}">${opts.map((o) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o || '(비움)')}</option>`).join('')}</select>`;
    } else if (DATE_COLS.includes(c)) {
      // 모바일은 날짜 칸을 누르면 달력만 떠서 비울 수 없어요 → 꼭 채울 칸이 아니면 비우기 버튼
      input = `<input id="${id}" data-k="${k}" type="date" value="${esc(v)}">`;
      if (!st.file.need.includes(c)) input = `<span class="adm-date">${input}<button type="button" class="btn small" data-clr="${k}">비우기</button></span>`;
    } else if ((st.file.suggest || []).includes(c)) {
      // 이미 쓴 값을 고르거나 새로 적어요 (새 값은 저장하면 그대로 새 종류)
      const used = [...new Set(st.rows.map((r) => r[k].trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
      input = `<input id="${id}" data-k="${k}" value="${esc(v)}" list="${id}-l" autocomplete="off" placeholder="고르거나 새로 입력"><datalist id="${id}-l">${used.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`;
    } else if (TIME_COLS.includes(c)) {
      input = `<input id="${id}" data-k="${k}" type="datetime-local" value="${esc(v)}">`;
    } else if (isLong(c)) {
      input = `<textarea id="${id}" data-k="${k}" rows="${Math.min(8, Math.max(3, v.split('\n').length + 1))}">${esc(v)}</textarea>`;
    } else {
      input = `<input id="${id}" data-k="${k}" value="${esc(v)}"${locked ? ' readonly' : ''}${c === '아이디' && locked ? ' title="체크 기록 아이디라 바꾸지 않아요"' : ''}>`;
    }
    return `<div class="adm-f${isLong(c) ? ' wide' : ''}">${lab}${input}${hint ? '<small>' + esc(hint) + '</small>' : ''}</div>`;
  }

  function pairKey(a, b) {
    return JSON.stringify([String(a), String(b)].sort());
  }
  function reviewDecisions() {
    const decisions = new Map();
    st.rows.forEach((row, i) => {
      if (st.del.has(i) || !['병합', '분리'].includes(row[col('구분')])) return;
      const key = pairKey(row[col('대상아이디')], row[col('상대아이디')]);
      if (!decisions.has(key)) decisions.set(key, []);
      decisions.get(key).push(i);
    });
    return decisions;
  }
  function decideReview(indices, action) {
    const decisions = reviewDecisions();
    for (const i of indices) {
      const { a, b } = st.review[i];
      const key = pairKey(a.id, b.id);
      if (decisions.has(key)) continue;
      const row = newRow();
      row[col('구분')] = action;
      row[col('출처')] = 'mnetplus';
      row[col('대상아이디')] = String(a.id);
      row[col('상대아이디')] = String(b.id);
      row[col('이유')] = a.date + ' ' + a.title + ' · ' + action;
      decisions.set(key, true);
      st.reviewSelection.delete(i);
    }
    persistDraft();
    draw();
  }
  function cancelReview(key) {
    const indices = reviewDecisions().get(key) || [];
    // 새 줄은 뒤에 붙는다. 역순으로 제거해야 남은 줄 번호가 보존된다.
    for (const i of indices.reverse()) {
      if (isNew(i)) {
        st.fresh.delete(st.rows[i]);
        st.rows.splice(i, 1);
        st.del = new Set([...st.del].map(n => n > i ? n - 1 : n));
      } else st.del.add(i);
    }
    if (changed().length) persistDraft();
    else localStorage.removeItem(draftKey());
    draw();
  }
  function drawReview(chips, bar, draft) {
    const decisions = reviewDecisions();
    const count = st.reviewSelection?.size || 0;
    const pending = st.job?.path === st.file.path && !['success','failure','cancelled'].includes(st.job.state);
    const cards = (st.review || []).map(({a,b,similarity}, i) => {
      if (decisions.has(pairKey(a.id, b.id))) return '';
      return `<article class="card adm-draft"><label><input type="checkbox" data-select-pair="${i}" ${st.reviewSelection.has(i) ? 'checked' : ''}> ${esc(a.date)} · ${Math.round(similarity*100)}% 제목 유사</label>
        <p><b>Mnet Plus</b> ${esc(a.time)} ${esc(a.title)} <small>ID ${esc(a.id)}</small></p>
        <p><b>blip</b> ${esc(b.time)} ${esc(b.title)} <small>ID ${esc(b.id)}</small></p>
        <button class="btn small" data-review-pair="${i}" data-review-action="병합">같은 일정</button>
        <button class="btn small" data-review-pair="${i}" data-review-action="분리">서로 다른 일정</button></article>`;
    }).join('');
    const history = [...decisions].map(([key, indices]) => {
      const row = st.rows[indices[0]];
      return `<article class="adm-draft"><b>${esc(row[col('구분')])}</b> ${esc(row[col('이유')])}
        <small>${esc(row[col('대상아이디')])} · ${esc(row[col('상대아이디')])}</small>
        <button class="btn small" data-cancel-review="${esc(key)}">판정 취소</button></article>`;
    }).join('');
    $adm.innerHTML = `<section class="page-head"><h1>일정 중복 후보</h1><p>같은 일정은 병합하고 서로 다른 일정은 분리해요. 판정을 마치면 검사 후 반영을 눌러 주세요.</p></section>
      <nav class="adm-chips">${chips}</nav>${draft}${!st.sha ? loadState() : ''}
      ${pending ? '<p>저장한 판정을 확인하는 중이에요.</p>' : st.sha ? `<section ${st.busy || st.recoverDraft ? 'inert' : ''}>
        ${cards ? `<div class="adm-draft">선택 <span data-selected-count>${count}</span>쌍
          <button class="btn small" data-review-action="병합" ${count ? '' : 'disabled'}>선택 병합</button>
          <button class="btn small" data-review-action="분리" ${count ? '' : 'disabled'}>선택 분리</button></div>${cards}` : '<p>검토할 중복 후보가 없어요.</p>'}
        ${history ? `<details><summary>처리한 판정 · ${decisions.size}쌍</summary>${history}</details>` : ''}</section>` : ''}
      ${bar}`;
  }

  function drawEdit() {
    const f = st.file;
    const ch = changed();
    const job = st.job && JOB[st.job.state];
    // 위 칩 = 사이트 탭. 한 탭에 자료가 둘이면(연합&기타) 그 아래에서 나눠요
    const tabs = [...new Set(FILES.map((x) => x.tab))];
    const chips = tabs.map((t) => `<button type="button" class="adm-chip${t === f.tab ? ' on' : ''}" data-file="${FILES.find((x) => x.tab === t).key}" aria-pressed="${t === f.tab}">${esc(t)}</button>`).join('');
    if (f.inbox) { drawInbox(chips, job); return; }
    const bar = `      <div class="adm-bar">
        <div class="container adm-bar-in">
          ${job ? `<p class="adm-job">${st.job.branch && ['failure','cancelled','slow'].includes(st.job.state) ? '<button type="button" class="btn small" data-retry>저장한 초안 다시 반영</button>' : ''}<span class="status ${job[1]}">${esc(job[0])}</span>${st.job.url ? ` <a href="${esc(st.job.url)}" target="_blank" rel="noopener">자세히 보기</a>` : ''}</p>` : ''}
          <p class="adm-msg" role="alert">${esc(st.err)}</p>
          <span class="adm-cnt">${ch.length ? `저장 전 · ${ch.length}개 변경` : '바뀐 것 없음'}</span>
          <button type="button" class="btn primary" data-save${!ch.length || st.busy ? ' disabled' : ''}>${st.busy ? '보내는 중' : '검사 후 반영'}</button>
        </div>
      </div>`;
    const draft = st.recoverDraft ? `<div class="adm-draft" role="status">${st.recoverDraft.sha === st.sha ? '작성하던 초안이 이 기기에 있어요.' : '저장된 초안 이후 원본 자료가 바뀌었어요. 덮어쓰지 않고 보관 중이에요.'}<button type="button" class="btn small" data-restore-draft${st.recoverDraft.sha === st.sha ? '' : ' disabled'}>초안 복원</button><button type="button" class="btn small" data-export-draft>초안 내려받기</button>${f.review ? '<button type="button" class="btn small" data-discard-review-draft>초안 버리기</button>' : ''}</div>` : '';
    if (f.review) { drawReview(chips, bar, draft); return; }
    const same = FILES.filter((x) => x.tab === f.tab);
    const seg = same.length > 1 ? `<div class="seg adm-seg" role="group" aria-label="${esc(f.tab)}">${same.map((x) => `<button type="button" data-file="${x.key}" class="${x === f ? 'on' : ''}" aria-pressed="${x === f}">${esc(x.label)}</button>`).join('')}</div>` : '';
    // 끝난 줄(종료일이 어제 이전)은 접어 둬요. 새 줄 · 고친 줄은 늘 보여요
    const t = kst(new Date());
    const ended = (i) => f.end && !isNew(i) && !ch.includes(i) && st.open !== i && (st.rows[i][col(f.end)] || '9') < t;
    const nEnd = st.rows.filter((_, i) => ended(i)).length;
    const sub =(r) => f.sub.map((c) => r[col(c)]).filter(Boolean).map((v) => esc(v.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/, '$1 $2'))).join(' · ');
    const list = st.rows.map((r, i) => {
      const start = col('시작일') >= 0 ? r[col('시작일')] : col('date') >= 0 ? r[col('date')] : '';
      const end = f.end ? r[col(f.end)] : '';
      const status = end && end < t ? 'ended' : start && start > t ? 'upcoming' : f.end && !start && !end ? 'unknown' : 'active';
      const title = f.title.map((c) => r[col(c)]).filter(Boolean).join(' · ') || '(제목 없음)';
      const tag = st.del.has(i) ? '<span class="status hot">삭제 예정</span>' : isNew(i) ? '<span class="status soon">새 줄</span>' : ch.includes(i) ? '<span class="status tbd">고침</span>' : '';
      const open = st.open === i;
      return `<li data-row-status="${status}" data-row-modified="${ch.includes(i)}" data-search-text="${esc([title, sub(r), idOf(i)].join(' '))}" class="card adm-row${open ? ' open' : ''}${st.del.has(i) ? ' gone' : ''}">
        <button type="button" class="adm-row-h" data-open="${i}" aria-expanded="${open}">
          <span class="adm-id">${esc(f.json || f.rowKey ? '' : idOf(i))}</span>
          <span class="adm-t"><b>${esc(title)}</b><small>${sub(r)}</small></span>${tag}
        </button>
        ${open ? `<div class="adm-form" data-row="${i}">${groupedFields(r, i)}
          <div class="adm-row-a">
            ${f.del && !isNew(i) ? (st.del.has(i) ? `<button type="button" class="btn small" data-undel="${i}">되살리기</button>` : `<button type="button" class="btn small adm-del" data-delrow="${i}">삭제</button>`) : ''}
            ${f.end && !isNew(i) && !st.del.has(i) ? `<button type="button" class="btn small" data-down="${i}">내리기 (종료일을 어제로)</button>` : ''}
            ${f.order && !st.del.has(i) ? `<button type="button" class="btn small" data-move="${i}" data-dir="-1"${i === 0 ? ' disabled' : ''} aria-label="위로 올리기">↑ 위로</button><button type="button" class="btn small" data-move="${i}" data-dir="1"${i === st.rows.length - 1 ? ' disabled' : ''} aria-label="아래로 내리기">↓ 아래로</button>` : ''}
            ${isNew(i) ? `<button type="button" class="btn small" data-drop="${i}">새 줄 빼기</button>` : ''}
            ${!isNew(i) && !st.del.has(i) && st.base.get(r) !== r.join('\u0001') ? `<button type="button" class="btn small" data-undo="${i}">고친 것 되돌리기</button>` : ''}
            <button type="button" class="btn small" data-open="${i}">접기</button>
          </div></div>` : ''}
      </li>`;
    }).join('');
    $adm.innerHTML = `
      <section class="page-head"><h1>${esc(f.label)} 편집</h1><p>항목을 누르면 입력 칸이 열려요. 수정한 뒤 아래에서 저장해 주세요.</p></section>
      ${runTop()}
      <nav class="adm-chips" aria-label="고칠 자료">${chips}</nav>
      ${runRow(f.tab)}
      ${seg}
      ${draft}
      ${ch.length ? diffPreview() : ''}
      ${f.where ? `<p class="adm-where">${esc(f.where)}</p>` : ''}
      ${!st.sha ? loadState() : ''}
      ${st.rows.length ? `<label class="adm-search">표시할 자료<select data-status-filter>${[['','진행·예정·미정'],['all','전체'],['active','진행 중'],['upcoming','예정'],['unknown','기간 미정'],['ended','종료'],['modified','수정한 항목']].map(([value,title]) => `<option value="${value}"${(st.rowFilter||'') === value ? ' selected' : ''}>${title}</option>`).join('')}</select></label><label class="adm-search">항목 찾기<input type="search" data-search value="${esc(st.search)}" placeholder="이름 또는 내용 검색"></label>` : ''}
      <p class="adm-empty" data-no-match hidden>일치하는 항목이 없어요.</p>
      <ul class="adm-list"${st.busy ? ' inert' : ''}>${list}</ul>
      ${nEnd ? `<button type="button" class="btn small adm-ended" data-showend>${st.showEnd ? `끝난 것 ${nEnd}개 숨기기` : `끝난 것 ${nEnd}개 보기`}</button>` : ''}
      ${st.head.length && !f.fixed ? `<button type="button" class="btn adm-add" data-add${st.busy ? ' disabled' : ''}>+ 항목 추가</button>` : ''}
      ${bar}`;
  }

  function loadState() {
    return st.busy ? '<p class="adm-empty">자료를 불러오는 중…</p>' : '<button type="button" class="btn" data-reload>자료 다시 불러오기</button>';
  }
  function filterRows() {
    const search = $('[data-search]', $adm);
    if (!search) return;
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    for (const row of $adm.querySelectorAll('[data-search-text]')) {
      const want = st.rowFilter || (query || st.showEnd || !st.file.end ? 'all' : 'current');
      const statusMatch = want === 'all' || (want === 'current' ? row.dataset.rowStatus !== 'ended' : want === 'modified' ? row.dataset.rowModified === 'true' : row.dataset.rowStatus === want);
      row.hidden = !row.classList.contains('open') && (!statusMatch || (!!query && !row.dataset.searchText.toLowerCase().includes(query)));
      if (!row.hidden) visible++;
    }
    $('[data-no-match]', $adm).hidden = !query || !!visible;
  }

  function draw() {
    // 배포 상태가 갱신되어도 편집 중인 입력 칸과 커서를 유지한다.
    const active = document.activeElement;
    const typing = $adm.contains(active) && active.matches('input[data-k], textarea[data-k], [data-search]');
    const cursor = typing && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
    $('#admOut').hidden = !st.ticket;
    $('#admOut').disabled = st.busy;
    if (!API) { $adm.innerHTML = '<section class="card adm-lock"><h1>준비 중</h1><p>config.js에 저장 서버 주소(ADMIN_API)가 아직 없어요.</p></section>'; return; }
    if (!st.ticket) drawLock(); else drawEdit();
    filterRows();
    if (typing && !st.busy) {
      const input = active.matches('[data-search]') ? $('[data-search]', $adm) : document.getElementById(active.id);
      if (input) {
        input.focus({ preventScroll: true });
        if (cursor) input.setSelectionRange(...cursor);
      }
    }
    drawBell();
  }

  // ---------- 누르기 · 입력 ----------
  $adm.addEventListener('input', (e) => {
    if (e.target.matches('[data-search]')) { st.search = e.target.value; filterRows(); return; }
    const k = e.target.dataset.k;
    const row = e.target.closest('[data-row]');
    if (k == null || !row) return;
    st.rows[+row.dataset.row][+k] = e.target.value;
    if (st.head[+k] === '투표종류ID' && st.catalog) { const campaign = st.catalog['투표종류.csv'].find(x => x['아이디'] === e.target.value); if (campaign && col('투표종류') >= 0) st.rows[+row.dataset.row][col('투표종류')] = campaign['투표종류']; }
    e.target.removeAttribute('aria-invalid');
    const twin = [...row.querySelectorAll(`[data-k="${k}"]`)].find((x) => x !== e.target);
    if (twin) twin.value = e.target.value;
    clearTimeout(st.draftTimer); st.draftTimer = setTimeout(persistDraft, 350);
    // 다시 그리지 않고 저장 버튼 · 숫자만 고침 (입력 중 커서가 튀지 않게)
    const n = changed().length;
    $('.adm-cnt', $adm).textContent = n ? `저장 전 · ${n}개 변경` : '바뀐 것 없음';
    $('[data-save]', $adm).disabled = !n || st.busy;
  });
  $adm.addEventListener('change', (e) => {
    if (e.target.hasAttribute('data-select-pair')) {
      const i = +e.target.dataset.selectPair;
      if (e.target.checked) st.reviewSelection.add(i); else st.reviewSelection.delete(i);
      $('[data-selected-count]', $adm).textContent = st.reviewSelection.size;
      $adm.querySelectorAll('[data-review-action]:not([data-review-pair])').forEach(button => { button.disabled = !st.reviewSelection.size; });
      return;
    }
    if (e.target.matches('[data-status-filter]')) { st.rowFilter = e.target.value; filterRows(); return; }
    if (e.target.dataset.idest) { st.dest[e.target.dataset.idest] = e.target.value; return; }
    if (e.target.tagName === 'SELECT') draw();
  });
  function switchFile(f) {
    if (st.busy) return;
    if (changed().length && !confirm('저장하지 않은 고친 것이 사라져요. 다른 자료로 옮길까요?')) return;
    st.fromInbox = null;
    loadFile(f);
  }
  $adm.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !st.ticket || st.busy) return;
    if (b.hasAttribute('data-reload')) { switchFile(st.file); return; }
    const item = (id) => ((st.inbox && st.inbox.items) || []).find((x) => x.id === id);
    if (b.dataset.reviewAction) {
      decideReview(b.hasAttribute('data-review-pair') ? [+b.dataset.reviewPair] : st.reviewSelection, b.dataset.reviewAction);
      return;
    }
    if (b.hasAttribute('data-cancel-review')) { cancelReview(b.dataset.cancelReview); return; }
    if (b.hasAttribute('data-discard-review-draft')) {
      if (confirm('기기에 보관한 일정 보정 초안을 버릴까요?')) { localStorage.removeItem(draftKey()); st.recoverDraft = null; draw(); }
      return;
    }
    if (b.hasAttribute('data-restore-draft')) { restoreDraft(); return; }
    if (b.hasAttribute('data-export-draft')) { const blob = new Blob([JSON.stringify(st.recoverDraft, null, 2)], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rescene-admin-draft.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); return; }
    if (b.hasAttribute('data-retry')) { call('POST','/retry',{branch:st.job.branch}).then(d => { if (!d.ok) { st.err = ERR[d.err] || '재시도하지 못했어요'; draw(); return; } st.job.state='waiting'; st.job.at=Date.now(); draw(); watch(); }); return; }
    if (b.dataset.iopen) { const sel = $(`[data-idest="${b.dataset.iopen}"]`, $adm); openFromInbox(item(b.dataset.iopen), sel.value); return; }
    if (b.dataset.run) { run(b.dataset.run); return; }
    if (b.dataset.runall != null) { runAll(); return; }
    if (b.dataset.iskip) { st.busy = true; draw(); markInbox(b.dataset.iskip, 'skip').then(() => { st.busy = false; draw(); }); return; }
    if (b.dataset.file) {
      const f = FILES.find((x) => x.key === b.dataset.file);
      switchFile(f);
    } else if (b.dataset.open != null) {
      st.open = st.open === +b.dataset.open ? -1 : +b.dataset.open; st.err = ''; draw();
      if (st.open >= 0) $(`[data-row="${st.open}"]`, $adm).closest('li').scrollIntoView({ block: 'start' });
    } else if (b.dataset.clr != null) {
      st.rows[+b.closest('[data-row]').dataset.row][+b.dataset.clr] = ''; draw();
    } else if (b.dataset.down != null) {
      st.rows[+b.dataset.down][col(st.file.end)] = yesterday(); draw();
    } else if (b.dataset.delrow != null) {
      const i = +b.dataset.delrow;
      const name = st.file.json ? st.rows[i][col('title')] : `${idOf(i)} ${st.file.title.map((c) => st.rows[i][col(c)]).filter(Boolean).join(' · ')}`;
      if (!confirm(`"${name}" 줄을 지울까요?\n저장을 눌러야 실제로 지워져요.`)) return;
      restore(i); st.del.add(i); st.open = -1; draw();
    } else if (b.dataset.undel != null) {
      st.del.delete(+b.dataset.undel); st.err = ''; draw();
    } else if (b.dataset.undo != null) {
      restore(+b.dataset.undo); draw();
    } else if (b.dataset.move != null) {
      // 줄만 바꿔요. orig · raw 는 원래 자리 그대로라 옮긴 줄은 '고침'으로 보이고 저장하면 새 순서로 써요
      const i = +b.dataset.move; const j = i + +b.dataset.dir;
      if (j < 0 || j >= st.rows.length) return;
      [st.rows[i], st.rows[j]] = [st.rows[j], st.rows[i]];
      const di = st.del.has(i); const dj = st.del.has(j);
      st.del.delete(i); st.del.delete(j); if (di) st.del.add(j); if (dj) st.del.add(i);
      st.open = j; draw();
      $(`[data-row="${j}"]`, $adm).closest('li').scrollIntoView({ block: 'nearest' });
    } else if (b.dataset.drop != null) {
      const i = +b.dataset.drop; st.fresh.delete(st.rows[i]); st.rows.splice(i, 1); if (st.file.json) st.ids.splice(i, 1);
      st.del = new Set([...st.del].map((x) => (x > i ? x - 1 : x))); // 뒤 줄 번호가 하나씩 당겨져요
      st.open = -1; draw();
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

  // 알림을 눌러 이미 열린 앱으로 오면 받은 공지를 새로 불러와요
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data === 'inbox' && st.ticket) switchFile(FILES[0]); });

  try { st.job = JSON.parse(localStorage.getItem('rs-admin-publication') || 'null'); } catch (_) {}
  if (st.ticket && API) { loadFile(st.file).then(() => { if (st.job && !['success','failure','cancelled'].includes(st.job.state)) watch(); }); } else draw();
  $adm.addEventListener('click', () => { clearTimeout(st.draftTimer); st.draftTimer = setTimeout(persistDraft, 400); });
  pushCheck();
})();
