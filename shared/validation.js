/* Shared by the browser, admin Worker and Node build checks. No DOM dependencies. */
(function (root) {
  'use strict';
  const isDate = s => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    const d = new Date(s + 'T00:00:00Z');
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s;
  };
  const isTime = s => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s || '');
  const isDateTime = s => typeof s === 'string' && isDate(s.slice(0, 10)) && s[10] === 'T' && isTime(s.slice(11));
  const isUrl = s => { try { const u = new URL(s); return ['http:', 'https:'].includes(u.protocol) && !!u.hostname; } catch (_) { return false; } };
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', quoted = false;
    text = String(text).replace(/^\uFEFF/, '');
    const end = () => { row.push(cell); if (row.some(x => x !== '')) rows.push(row); row = []; cell = ''; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') {
        if (cell) throw new Error('따옴표 앞에 다른 글자가 있어요');
        quoted = true;
      } else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\r' || c === '\n') { end(); if (c === '\r' && text[i + 1] === '\n') i++; }
      else cell += c;
    }
    if (quoted) throw new Error('닫히지 않은 따옴표가 있어요');
    if (cell || row.length) end();
    return rows;
  }
  const schema = {
    '할일.csv': { required: ['아이디', '구분', '내용'], dates: ['시작일', '종료일', '확인일'], times: ['마감시간'], enums: { 구분: ['자체', '줄 것', '받을 것'], 반복: ['', '매일', '요일', '1회', '기간 중 1회'] } },
    '연합.csv': { required: ['아이디', '상대아티스트'] },
    '가이드.csv': { required: ['아이디', '이름', '바로가기'] },
    '음방.csv': { required: ['아이디', '음방', '구분', '방송일'], dates: ['방송일'] },
    '음방정보.csv': { required: ['아이디', '음방', '요일', '시작', '끝', '채널'], dates: ['결방 시작', '결방 끝', '확인일'], times: ['시작', '끝'], enums: { 요일: ['일', '월', '화', '수', '목', '금', '토'] } },
    '음방안내.csv': { required: ['아이디'], dates: ['확인일'] },
    '투표종류.csv': { required: ['아이디', '투표종류', '묶음'], unique: ['아이디', '투표종류'] },
    '색묶음.csv': { required: ['묶음', '색'], unique: ['묶음'] },
    '투표앱.csv': { required: ['아이디', '이름', '안드로이드 패키지', '아이폰 앱 번호'] },
    '뮤직웨이브.csv': { required: ['이름', '링크'], unique: ['이름'] },
    '일정보정.csv': { required: ['아이디', '구분', '출처', '대상아이디', '이유'], dates: ['종료일', '확인일'], enums: { 구분: ['보정', '병합', '분리'], 출처: ['blip', 'mnetplus', 'etc'] } },
  };
  function validateFile(path, text) {
    const name = path.split('/').pop(), errors = [], add = (row, column, message) => errors.push({ row, column, message });
    if (typeof text !== 'string' || text.length > 500000) return [{ row: 0, column: '', message: '자료 크기가 너무 커요' }];
    try {
      if (name.endsWith('.csv')) {
        const rows = parseCSV(text), head = rows.shift() || [], rules = schema[name];
        if (!rules) return [{ row: 0, column: '', message: '등록되지 않은 자료예요' }];
        if (new Set(head).size !== head.length) add(0, '', '열 이름이 겹쳐요');
        for (const k of rules.required) if (!head.includes(k)) add(0, k, `${k} 열이 없어요`);
        const unique = rules.unique || (head.includes('아이디') ? ['아이디'] : []), seen = {};
        rows.forEach((cells, i) => {
          const n = i + 2, r = Object.fromEntries(head.map((k, j) => [k, (cells[j] || '').trim()]));
          if (cells.length !== head.length) add(n, '', `열 개수가 ${head.length}개여야 해요`);
          for (const k of rules.required) if (!r[k]) add(n, k, `${k} 칸이 비었어요`);
          for (const k of unique) { const s = seen[k] ||= new Set(); if (r[k] && s.has(r[k])) add(n, k, `${k} 값이 겹쳐요`); s.add(r[k]); }
          for (const k of rules.dates || []) if (r[k] && !isDate(r[k])) add(n, k, `${k}: 실제 달력 날짜를 입력해 주세요`);
          for (const k of rules.times || []) if (r[k] && !isTime(r[k])) add(n, k, `${k}: 00:00~23:59로 입력해 주세요`);
          for (const [k, values] of Object.entries(rules.enums || {})) if (!values.includes(r[k] || '')) add(n, k, `${k} 값이 올바르지 않아요`);
          for (const [start, end] of [['시작일', '종료일'], ['결방 시작', '결방 끝']]) if (r[start] && r[end] && r[end] < r[start]) add(n, end, '종료일이 시작일보다 빨라요');
          if (name === '할일.csv') {
            if (['줄 것', '받을 것'].includes(r['구분']) && !r['연합아이디']) add(n, '연합아이디', '연합을 선택해 주세요');
            if (r['반복'] === '요일' && !/[일월화수목금토]/.test(r['요일'] || '')) add(n, '요일', '반복할 요일을 선택해 주세요');
            if (r['수량'] && !/^\d+(?:\.\d+)?$/.test(r['수량'])) add(n, '수량', '수량은 0 이상의 숫자예요');
            if (r['참여 주기'] && (r['구분'] === '받을 것' || !/^(매시간 1회|틈날 때마다|[1-9]\d*(분|시간)마다)$/.test(r['참여 주기']))) add(n, '참여 주기', '참여 주기를 확인해 주세요');
          }
          if (name === '색묶음.csv' && !/^#[\da-f]{6}$/i.test(r['색'])) add(n, '색', '색은 #과 6자리로 입력해 주세요');
          if (name === '일정보정.csv' && ['병합', '분리'].includes(r['구분']) && !r['상대아이디']) add(n, '상대아이디', '비교할 일정 아이디를 입력해 주세요');
          for (const k of ['링크', '바로가기', '공지링크', '출처']) if (r[k] && /^https?:/.test(r[k]) && !isUrl(r[k])) add(n, k, '주소 형식이 올바르지 않아요');
        });
      } else {
        const d = JSON.parse(text), listKey = { 'weekly.json': 'events', 'notice.json': 'notices', 'inbox.json': 'items' }[name];
        if (listKey) {
          if (!d || !Array.isArray(d[listKey])) throw new Error(`${listKey} 목록이 없어요`);
          const seen = new Set();
          d[listKey].forEach((r, i) => {
            if (!r || !r.id || seen.has(String(r.id))) add(i + 1, 'id', '아이디가 없거나 겹쳐요');
            if (!r) return; seen.add(String(r.id));
            if (name !== 'inbox.json' && !String(r.title || '').trim()) add(i + 1, 'title', '제목이 비었어요');
            for (const k of ['date', 'end', 'checkedAt']) if (r[k] && !isDate(r[k])) add(i + 1, k, '날짜를 확인해 주세요');
            if (name === 'weekly.json' && !isDate(r.date)) add(i + 1, 'date', '시작일을 입력해 주세요');
            if (r.date && r.end && r.end < r.date) add(i + 1, 'end', '종료일이 시작일보다 빨라요');
            if (r.time && !isTime(r.time)) add(i + 1, 'time', '시간을 확인해 주세요');
            if (r.until && !isDateTime(r.until)) add(i + 1, 'until', '종료 날짜와 시간을 확인해 주세요');
            if (r.link && !isUrl(r.link)) add(i + 1, 'link', '주소를 확인해 주세요');
          });
        }
      }
    } catch (e) { add(0, '', e.message); }
    return errors;
  }
  root.RSData = Object.freeze({ isDate, isTime, isDateTime, isUrl, parseCSV, validateFile, schema });
})(globalThis);
