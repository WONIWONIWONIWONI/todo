  // [src/30-calendar.js] 연합 일정 탭 (기간표)
  // ---------- 달력 ----------
  function monthBounds() {
    const first = state.calMonth + '-01';
    const next = iso(new Date(Date.UTC(+state.calMonth.slice(0, 4), +state.calMonth.slice(5, 7), 1)));
    return { first, last: addDays(next, -1) };
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
    const groupColor = (it) => campColor(it.camp);
    const groupIdx = (it) => GROUPS.findIndex((g) => g.id === campGroup(it.camp));
    const tickDays = [1, 8, 15, 22, 29].filter((n) => n <= N);
    // '오늘' 이름표와 겹치는 날짜 글자는 숨김 (휴대폰은 칸이 좁아서 더 넓게: near-m)
    const tIdx = t >= first && t <= last ? diffDays(first, t) : -99;
    const nearCls = (n) => { const gap = Math.abs(n - 1 - tIdx); return gap < 3.5 ? ' class="near"' : gap < 5.5 ? ' class="near-m"' : ''; };
    const ticks = tickDays.map((n) => `<span style="left:${(((n - 1) / N) * 100).toFixed(3)}%"${nearCls(n)}>${n}<i class="tl-u">일</i></span>`).join('');
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
      const per = (it.repeat === '기간1회' && it.start && it.end ? `${md(it.start)}~${md(it.end)}` : periodText(it)).replace(/\s/g, '');
      const sub = (it.camp || '').replace(/^MAMA\s*|^MMA\s*/i, '') || it.title;
      return `
        <div class="tl-row st-${st}" title="${esc(whoName(it))} · ${esc(it.camp || '')} · ${esc(it.title)} (${periodText(it)})">
          <div class="tl-label">
            <b>${esc(whoName(it))}</b>
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
    // 같은 상대 · 같은 종류 · 같은 기간은 막대 하나 (예: 스밍 + 뮤직웨이브 같이 듣기)
    const seen = new Set();
    const shown = inMonth.filter(wantTab).sort(order).filter((x) => {
      const k = [x.ally ? x.ally.id : x.kind, x.camp, x.start, x.end].join('|');
      return seen.has(k) ? false : seen.add(k);
    });
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
