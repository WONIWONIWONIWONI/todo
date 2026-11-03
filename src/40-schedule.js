  // [src/40-schedule.js] 리센느 일정 탭 (Mnet Plus · blip · 기타 일정)
  // ---------- 스케줄 (Mnet Plus 공식 일정표 + blip) ----------
  // Mnet Plus: artist.mnetplus.world 일정 데이터를 달마다 바로 불러옴 (마지막으로 받은 것은 휴대폰에 저장)
  // blip: 30분마다 GitHub Actions가 data/blip.json 으로 받아 둠 (tools/crawl_blip.py)
  // 구독용 캘린더 파일 data/rescene.ics 도 같은 작업이 만들어 둠
  const SCH_API = 'https://artist.mnetplus.world/svc/stg/rescene-official/space/api/v1/calendar';
  const SCH_PAGE = (ym) => `https://artist.mnetplus.world/main/stg/rescene-official/schedule/${ym.replace('-', '/')}`;
  const BLIP_PAGE = 'https://blip.kr/artists/RESCENE/schedule?unitId=133';
  const SCH_SRC = { mnetplus: 'Mnet Plus', blip: 'blip', etc: '기타' };
  // 일정 종류는 7가지로만 묶어요. 처음 보는 이름은 비슷한 묶음으로, 모르면 '기타'로 가요.
  const SCH_TYPES = {
    '음방': { label: '음악방송', color: '#1b7a4a' },
    '방송': { label: '방송', color: '#2563eb' },
    '공연': { label: '공연·행사', color: '#b8336a' },
    '이벤트': { label: '팬사인회·이벤트', color: '#0f766e' },
    '발매': { label: '발매·콘텐츠', color: '#7c2d5b' },
    '기념일': { label: '기념일', color: '#c2410c' },
    '기타': { label: '기타', color: '#6b7280' },
  };
  const SCH_ORDER = Object.keys(SCH_TYPES);
  const SCH_RULES = [
    ['음방', /음방|음악\s*방송|엠카|뮤직뱅크|뮤뱅|인기가요|음악중심|쇼챔|더\s*쇼/],
    ['기념일', /기념일|생일|데뷔/],
    ['이벤트', /팬사인|사인회|팬싸|영통|이벤트|팬미팅|팝업|럭키드로우|뮤직웨이브/],
    ['공연', /공연|콘서트|행사|시상식|페스티벌|축제|쇼케이스|투어/],
    ['발매', /발매|앨범|음원|굿즈|예약\s*판매|판매|콘텐츠|컨텐츠|티저|뮤비|mv/i],
    ['방송', /방송|예능|라디오|유튜브|mnet\+?|tv|라이브|웹\s*예능|출연/i],
  ];
  // 종류가 '기타'이거나 처음 보는 이름이면 제목을 보고 한 번 더 골라요 (🎬 영상 → 발매·콘텐츠)
  const SCH_TITLE = /🎬|behind|비하인드|브이로그|vlog|특별편|에피소드|ep\.?\s*\d|episode|레코딩|recording|댄스\s*프랙티스|practice|챌린지|challenge/i;
  const schKind = (name, title) => {
    const n = String(name || '').trim();
    if (SCH_TYPES[n] && n !== '기타') return n;
    const hit = SCH_RULES.find(([, re]) => re.test(n));
    if (hit) return hit[0];
    return SCH_TITLE.test(String(title || '')) ? '발매' : '기타';
  };
  const schType = (name, title) => SCH_TYPES[schKind(name, title)];
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
  // Mnet Plus에 바로 연결이 안 되면: 사이트가 30분마다 받아 둔 사본(data/blip.json의 mnet) → 없으면 이 폰에 저장된 마지막 것
  const schBackup = (ym) => (state.blip && state.blip.mnet && state.blip.mnet[ym]) || null;
  const schOf = (ym) => {
    const box = state.sch[ym];
    if (box && box.error && schBackup(ym)) return schBackup(ym);
    return (box && box.events) || [];
  };

  // --- blip ---
  // blip 일정 중 직접 바꿀 칸 (blip 아이디 → { link, end … }). 30분마다 blip.json이 새로 써져도 유지돼요.
  const BLIP_FIX = {
    '1124956': { link: 'https://x.com/photoism_kr/status/2108467500514259300', end: '2026-11-09' }, // 포토이즘 X 리센느 리브 (포토이즘 공지 기준)
  };
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
          events.push({ ...e, title: cleanTitle(e.title), end: e.end || e.date, src: 'blip', ...(BLIP_FIX[e.id] || {}) });
        }));
        const mnet = {};
        Object.entries(d.mnet || {}).forEach(([ym, list]) => { mnet[ym] = list.filter((e) => e && e.date && e.title).map((e) => ({ ...e, id: String(e.id || ''), title: cleanTitle(e.title) })); });
        state.blip = { updated: d.updated || '', mnetUpdated: d.mnet_updated || '', events, mnet };
      })
      .catch(() => { state.blip = { events: [], error: 'fail' }; })
      .finally(schRefresh);
  }

  // --- 기타: "리센느 주간 배급 일정표" (매일 밤 00시 data/weekly.json 으로 바뀜, tools/crawl_weekly.py) ---
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
          type: WEEKLY_TYPE[e.category] || e.category || '기타', place: e.note || '', src: 'etc', link: e.link || '',
        }));
        state.weekly = { updated: d.updated || '', events };
      })
      .catch(() => { state.weekly = { events: [] }; })
      .finally(schRefresh);
  }
  // 같은 일정인지: 같은 날(또는 기간 안) + 비슷한 제목
  const DUP_ALIAS = [[/엠카운트다운|엠카/g, 'mcountdown'], [/뮤직뱅크|뮤뱅/g, 'musicbank'], [/인기가요|인가/g, 'inkigayo'], [/음악중심|음중/g, 'musiccore'], [/쇼챔피언|쇼챔/g, 'showchampion'], [/더쇼/g, 'theshow'], [/잇츠라이브/g, 'itslive'], [/쇼케이스/g, 'showcase'], [/응원봉/g, 'lightstick'], [/갤럭시\s*나이트/g, 'galaxynight'], [/숨바\s*꼭질\s*2?|sumba\s*kkokjil\s*2?/g, 'sumbakkokjil']];
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

  // --- Mnet Plus · blip 합치기 ---
  // 같은 날 + 비슷한 제목이면 한 일정으로 합쳐요. 정보가 많은 쪽을 바탕으로 하고 빈 칸은 다른 쪽에서 채워요.
  // 제목 비교 때는 해마다·회차·방송사·축제 같은 흔한 말을 빼요 (예: "SBS <무엇이든 해줄지니>" = "무엇이든 해줄지니").
  const MERGE_STOP = /(19|20)\d{2}|제\s*\d+\s*회|페스티벌|festival|페스타|콘서트|concert|축제|개막식|\bofficial\b|\bnotice\b|안내|\brelease\b|rescene|리센느|\bpulse\b|\blive\b|\bthe\b|\bby\b|\bsbs\b|\bkbs\s*2?\s*tv\b|\bkbs\b|\bmbc\b|\bjtbc\b|\bmnet\b|\btvn\b/g;
  const rawKey = (t) => cleanTitle(t).toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');
  function mergeKey(t) {
    let x = cleanTitle(t).toLowerCase().replace(/[’']/g, '');
    DUP_ALIAS.forEach(([re, to]) => { x = x.replace(re, ' ' + to + ' '); });
    return x.replace(MERGE_STOP, ' ').replace(/[^a-z0-9가-힣]+/g, '');
  }
  const grams = (k) => { const g = new Set(); for (let i = 0; i < k.length - 1; i++) g.add(k.slice(i, i + 2)); if (!g.size && k) g.add(k); return g; };
  const dice = (a, b) => { const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((x) => { if (B.has(x)) n++; }); return (2 * n) / (A.size + B.size); };
  const hm = (t) => (t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : null);
  // 두 일정이 같은 일정일 점수 (0이면 다른 일정)
  function sameScore(x, y) {
    if (x.date !== y.date) return 0;
    const a = mergeKey(x.title), b = mergeKey(y.title);
    if (!a || !b) return 0;
    const inside = (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b));
    const d = dice(a, b);
    const tx = hm(x.time), ty = hm(y.time);
    const gap = tx != null && ty != null ? Math.abs(tx - ty) : null;
    const rd = dice(rawKey(x.title), rawKey(y.title));
    const sameTime = gap === 0 && rd >= 0.7;
    if (!inside && !sameTime && (d < 0.5 || (gap != null && gap > 180))) return 0;
    return (inside ? 1 : Math.max(d, sameTime ? 0.7 : 0)) + 0.1 * rd + (gap != null ? 0.05 * (1 - Math.min(gap, 180) / 180) : 0);
  }
  const infoOf = (e) => (e.time ? 1 : 0) + (e.place ? 1 : 0) + (e.members && e.members.length ? 1 : 0) + (e.end && e.end !== e.date ? 1 : 0) + (e.link ? 1 : 0) + Math.min(cleanTitle(e.title).length, 40) / 40;
  function mergeTwo(x, y) {
    const [base, other] = infoOf(y) > infoOf(x) ? [y, x] : [x, y];
    const pick = (k) => (base[k] && (!Array.isArray(base[k]) || base[k].length) ? base[k] : other[k]);
    const title = rawKey(other.title).length > rawKey(base.title).length ? other.title : base.title;
    return { ...other, ...base, title, time: pick('time'), place: pick('place'), members: pick('members'), end: pick('end') || base.date, link: pick('link'), type: pick('type') };
  }
  // blip 안에서 똑같이 두 번 올라온 것 (같은 날 · 같은 종류 · 같은 제목 · 시간 1시간 안)
  function blipOnce(list) {
    const out = [];
    list.forEach((e) => {
      const k = mergeKey(e.title);
      const i = out.findIndex((o) => o.date === e.date && o.type === e.type && k.length >= 3 && mergeKey(o.title) === k
        && (hm(o.time) == null || hm(e.time) == null || Math.abs(hm(o.time) - hm(e.time)) <= 60));
      if (i < 0) out.push(e); else out[i] = mergeTwo(out[i], e);
    });
    return out;
  }
  // Mnet Plus 일정 하나당 blip 일정 하나까지만 짝지어요 (점수 높은 짝부터)
  function mergeSources(mnet, blip) {
    const pairs = [];
    mnet.forEach((m, i) => blip.forEach((b, j) => { const sc = sameScore(m, b); if (sc) pairs.push([sc, i, j]); }));
    pairs.sort((p, q) => q[0] - p[0]);
    const usedM = new Set(), usedB = new Set(), merged = new Map();
    pairs.forEach(([, i, j]) => {
      if (usedM.has(i) || usedB.has(j)) return;
      usedM.add(i); usedB.add(j);
      const m = mnet[i], b = blip[j];
      // 시간은 공식 일정(Mnet Plus)을 먼저 따라요
      merged.set(i, { ...mergeTwo(m, b), id: m.id, src: 'mnetplus', also: 'blip', link: b.link || '', time: m.time || b.time || '' });
    });
    return mnet.map((m, i) => merged.get(i) || m).concat(blip.filter((_, j) => !usedB.has(j)));
  }
  const blipAll = () => blipOnce((state.blip && state.blip.events) || []);

  // --- 모으기 ---
  // "… 참여 안내 2026.11.03(화) …"처럼 다른 날을 알리는 글은, 그날 같은 일정이 있으면 빼요
  function dropNotices(list, pool) {
    return list.filter((e) => {
      const m = String(e.title || '').match(/20\d{2}\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
      if (!m) return true;
      const ref = `${e.date.slice(0, 4)}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      if (ref <= e.date) return true;
      const a = dupTokens(e.title).filter((w) => w.length >= 3 && !/^\d/.test(w));
      return !pool.some((o) => o !== e && o.date === ref && dupTokens(o.title).some((w) => a.includes(w)));
    });
  }
  const schSort = (a, b) => (a.at + (a.cont ? '' : (a.time || '00:00'))).localeCompare(b.at + (b.cont ? '' : (b.time || '00:00'))) || a.src.localeCompare(b.src);
  const mnetEv = (e) => ({ ...e, src: 'mnetplus', end: e.date, link: '' });
  // 한 달에 보일 일정. 여러 날 일정은 시작일(이전 달이면 1일)과 종료일에 한 번씩
  function schAll(ym) {
    blipLoad();
    const first = ym + '-01';
    const last = ymLast(ym);
    const span = (list) => list
      .filter((e) => e.date <= last && e.end >= first)
      .flatMap((e) => {
        const head = e.date < first ? { ...e, at: first, cont: true } : { ...e, at: e.date };
        const tail = e.end && e.end !== head.at && e.end <= last ? [{ ...e, at: e.end, cont: true, endDay: true }] : [];
        return [head, ...tail];
      });
    const both0 = mergeSources(schOf(ym).map(mnetEv), blipAll());
    const etc0 = weeklyNew().concat(musicManualEvents());
    const both = dropNotices(both0, both0.concat(etc0));
    const etc = span(etc0);
    return span(both).concat(etc).map((e) => ({ ...e, at: e.at || e.date })).sort(schSort);
  }
  // 검색용: 불러온 모든 달
  function schKnown() {
    const out = [];
    const mnet = [];
    Object.keys(state.sch).forEach((ym) => schOf(ym).forEach((e) => mnet.push(mnetEv(e))));
    const both = mergeSources(mnet, blipAll());
    const etc = weeklyNew().concat(musicManualEvents());
    dropNotices(both, both.concat(etc)).forEach((e) => out.push({ ...e }));
    etc.forEach((e) => out.push({ ...e }));
    return out.map((e) => ({ ...e, at: e.date })).sort(schSort);
  }
  const schFilter = (list) => list.filter((e) => (!state.schSrc || e.src === state.schSrc || e.also === state.schSrc) && (!state.schType || schKind(e.type, e.title) === state.schType));
  const schLink = (e) => linkUrl(e.link) || (e.src === 'mnetplus' ? SCH_PAGE(e.date.slice(0, 7)) : '');
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
      const desc = [schType(e.type, e.title).label, SCH_SRC[e.src], schLink(e)].filter(Boolean).join('\n');
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
        saveIcs(list, b.dataset.exp === 'month' ? `rescene-${state.schMonth}.ics` : 'rescene-upcoming.ics', '리센느 일정');
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
    if (e.end && e.end !== e.date) return e.endDay ? '종료' : e.cont ? '진행 중' : '시작';
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
    const ty = schType(e.type, e.title);
    const multi = e.end && e.end !== e.date;
    const past = (e.end || e.date) < t;
    const meta = [
      multi ? `${mdw(e.date)} – ${mdw(e.end)}` : '',
      e.place || '',
      e.members && e.members.length && e.members.length < 4 ? e.members.join('·') : '',
    ].filter(Boolean).map(esc).join(' · ');
    const link = schLink(e);
    const mv = e.mv || showOfEvent(e);
    return `<li class="sch-row${past ? ' past' : ''}">
        <span class="sch-time">${esc(schTimeLabel(e))}</span>
        <div class="sch-body">
          ${link ? `<a class="sch-name" href="${esc(link)}" target="_blank" rel="noopener">${hl(e.title, q)}<span class="sch-ext" aria-hidden="true">↗</span></a>` : `<b class="sch-name">${hl(e.title, q)}</b>`}
          ${meta ? `<small class="sch-meta">${hl(meta.replace(/&amp;/g, '&'), q)}</small>` : ''}
          ${mv ? `<button type="button" class="sch-vote" data-goguide="music-${mv.id}">${esc(liveLine(mv))}<span aria-hidden="true">›</span></button>` : ''}
          <span class="sch-foot">
            <span class="sch-kind"><span class="sch-k"><i class="dot" style="--c:${ty.color}"></i>${esc(ty.label)}${e.mv && e.src === 'etc' ? ' · 출연 확정' : ''}</span>${[SCH_SRC[e.src] && e.src !== 'etc' ? SCH_SRC[e.src] : '', e.also ? SCH_SRC[e.also] : ''].filter(Boolean).map((x) => ` <span class="sch-from"><i class="sep">·</i>${esc(x)}</span>`).join('')}</span>
            <span class="sch-acts">
              ${e.src !== 'etc' ? `<a class="sch-act" href="https://www.google.com/search?q=${encodeURIComponent('리센느 ' + e.title)}" target="_blank" rel="noopener">검색</a>` : ''}
              <button type="button" class="sch-act" data-schics="${esc(schKey(e))}" aria-label="내 캘린더에 추가">캘린더 +</button>
            </span>
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
            ${q ? `<button type="button" class="sch-jump" data-schjump="${d}">달력에서 보기</button>` : `<button type="button" class="sch-share" data-schshare="${d}" aria-label="${longLabel(d)} 일정 링크 복사" title="이 날 링크 복사"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`}</h3>
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
        ${evs.slice(0, evs.length > 3 ? 2 : 3).map((e) => `<i class="sch-pill" style="--c:${schType(e.type, e.title).color}">${esc(e.title.replace(/[<>]/g, '').trim())}</i>`).join('')}
        ${evs.length > 3 ? `<small class="sch-more">+${evs.length - 2}</small>` : ''}
        ${evs.length ? `<span class="sch-dots" aria-hidden="true">${evs.slice(0, 3).map((e) => `<i style="--c:${schType(e.type, e.title).color}"></i>`).join('')}${evs.length > 3 ? `<small>+${evs.length - 3}</small>` : ''}</span>` : ''}
      </button>`;
    }
    return `<div class="sch-grid">${DOW.map((x, i) => `<div class="sch-dow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${x}</div>`).join('')}${cells}</div>`;
  }
  function schFiltersHtml(every) {
    every = every.filter((e) => !e.endDay); // 종료일 표시는 개수에 안 셈
    const srcN = (k) => every.filter((e) => e.src === k || e.also === k).length;
    const pool = state.schSrc ? every.filter((e) => e.src === state.schSrc) : every;
    const types = SCH_ORDER.filter((k) => pool.some((e) => schKind(e.type, e.title) === k));
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
    // 이번 달이면 지난 일정은 접어 두고 오늘부터 보여 줘요
    const monthList = (l) => {
      if (ym !== t.slice(0, 7)) return schGroups(l, t);
      const past = l.filter((e) => (e.end || e.date) < t);
      const rest = l.filter((e) => (e.end || e.date) >= t);
      return `${past.length ? `<details class="sch-past"><summary>지난 일정 ${past.length}개</summary>${schGroups(past, t)}</details>` : ''}${rest.length ? schGroups(rest, t) : '<div class="card empty"><strong>이 달에 남은 일정은 없어요</strong></div>'}`;
    };
    let side;
    if (q) {
      const words = q.toLowerCase().split(/\s+/);
      const found = schFilter(schKnown()).filter((e) => {
        const hay = [e.title, e.place, (e.members || []).join(' '), schType(e.type, e.title).label, SCH_SRC[e.src]].join(' ').toLowerCase();
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
      side = `<div class="sch-side-head"><h2>${+ym.slice(5)}월 일정 <i class="seg-n">${list.filter((e) => !e.endDay).length}</i></h2><p class="sch-hint">달력에서 날짜를 누르면 그날 일정만 보여요</p></div>
        ${list.length ? monthList(list) : loading ? '<div class="card empty"><strong>불러오는 중…</strong></div>' : '<div class="card empty"><strong>이 달에는 등록된 일정이 없어요</strong>새로 올라오면 여기에 보여요.</div>'}`;
    }
    return `<div class="card sch-cal">${schCalHtml(list, t)}</div><div class="sch-side" id="sch-side">${side}</div>`;
  }
  function schStatusHtml() {
    const ym = state.schMonth;
    const box = state.sch[ym] || {};
    const fmtT = (d) => (d && !isNaN(d) ? new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d) : '');
    const mt = fmtT(box.savedAt ? new Date(box.savedAt) : null);
    const bt = fmtT(state.blip && state.blip.updated ? new Date(state.blip.updated) : null);
    const mnet = !box.error ? `Mnet Plus는 바로 불러와요${mt ? ` (${mt})` : ''}.`
      : schBackup(ym) ? '<span class="warn">Mnet Plus에 지금 연결되지 않아서, 사이트가 30분마다 받아 둔 일정을 보여줘요.</span>'
      : `<span class="warn">Mnet Plus를 지금 불러오지 못했어요${mt ? ` (${mt}에 받은 일정)` : ''}.</span>`;
    const blip = state.blip && state.blip.error ? '<span class="warn">blip 일정을 불러오지 못했어요.</span>' : `blip은 30분마다 받아 와요${bt ? ` (${bt})` : ''}.`;
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
