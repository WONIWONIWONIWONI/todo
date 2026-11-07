  // [src/20-today.js] 오늘 탭
  // ---------- 오늘 ----------
  // 멜론 뮤직웨이브: sheet-templates/뮤직웨이브.csv 줄 순서대로 (왼쪽 음총팀 · 오른쪽 공식).
  // 방 번호(seq) · 방 종류(ctype)는 짧은 링크가 가는 into.melon.com 연결 페이지에서 찾은 값
  const WAVES = toObjects((window.SAMPLE_DATA || {}).waves || '').map((r) => ({ name: r['이름'], href: r['링크'], seq: r['방번호'], ctype: r['방종류'] }));
  const waveLinks = () => `
        <div class="wave-links" role="group" aria-label="멜론 뮤직웨이브">
          ${WAVES.map((w) => `<a class="wave" href="${esc(w.href)}" target="_blank" rel="noopener" data-wave="musicwave/listen?seq=${encodeURIComponent(w.seq)}&amp;ctype=${encodeURIComponent(w.ctype)}&amp;menuid=1000003041">${IC.wave}<b>${esc(w.name)}</b><small>뮤직웨이브</small></a>`).join('')}
        </div>`;
  // 날짜 넘겨 보기: state.viewDate (비면 오늘). 지난날은 체크 기록이 남는 60일 전까지, 앞날은 끝없이
  const relDay = (n) => (n === 0 ? '오늘' : n === 1 ? '내일' : n === -1 ? '어제' : n > 0 ? `${n}일 뒤` : `${-n}일 전`);
  const ARROW = (dir) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  function dayNav(d, t) {
    const off = diffDays(t, d);
    return `<span class="day-nav" role="group" aria-label="날짜 넘겨 보기">
          <button type="button" class="day-btn" data-dnav="-1" aria-label="전날 할 일 보기"${off <= -CHECK_DAYS ? ' disabled' : ''}>${ARROW(-1)}</button>
          <span class="day-label" aria-live="polite">${longLabel(d)}<em class="day-rel${off ? ' away' : ''}">${relDay(off)}</em></span>
          <button type="button" class="day-btn" data-dnav="1" aria-label="다음 날 할 일 보기">${ARROW(1)}</button>
          ${off ? '<button type="button" class="day-today" data-dnav="0">오늘로</button>' : ''}
        </span>`;
  }
  function renderToday() {
    const t = today();
    if (state.viewDate && (state.viewDate === t || state.viewDate < addDays(t, -CHECK_DAYS))) state.viewDate = '';
    const d = state.viewDate || t;
    const isToday = d === t;
    const later = d > t;
    const det = dayDetail(d);
    const total = det.todos.length;
    const pct = total ? Math.round((det.done / total) * 100) : 0;
    // 다 끝낸 날 기록 + 방금 마지막 하나를 체크했으면 알려 주기
    const allDone = total > 0 && det.done === total;
    if (!state.doneFilled) { backfillDone(); state.doneFilled = true; }
    // 다 끝낸 날 기록은 오늘 · 지난날만 (앞날은 체크를 못 해요). 축하 · 연속 완료는 오늘만
    const changed = !later && markDone(d, allDone);
    const justDone = isToday && changed && allDone && state.checkedNow;
    state.checkedNow = false;
    const streak = isToday && allDone ? doneStreak(d) : 0;
    const tomorrow = isToday && allDone ? todosFor(addDays(d, 1)).length : 0;
    if (justDone) setTimeout(() => toast(`오늘 할 일 끝 · 연속 ${streak}일`), 120);
    // 다가오는 일정: 7일 안에 시작하거나 끝나는 것
    const upcoming = [];
    if (isToday) state.data.items.forEach((it) => {
      if (it.tbd || it.kind === 'get') return;
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
    const label = (x) => (x.music ? esc(x.title) : `${esc(whoName(x))} ${esc(x.camp || x.title)}`);
    const finding = !isToday ? '' : ending.length
      ? `<span class="find-k">곧 끝나요</span>${ending.slice(0, 2).map((x) => `<span class="find-i"><b class="num">${diffDays(d, x.end) === 0 ? '오늘' : diffDays(d, x.end) + '일 남음'}</b> ${label(x)}</span>`).join('')}`
      : starting.length
        ? `<span class="find-k">곧 시작해요</span>${starting.slice(0, 2).map((x) => `<span class="find-i"><b class="num">${mdw(x.start)}</b> ${label(x)}</span>`).join('')}`
        : '';
    // 배치 (B안): 휴대폰은 한 줄 = 요약 → 바로가기 → 오늘 일정 → 종류 → 할 일 → 받을 것 → 다가오는 일정
    //            컴퓨터(1100px~)는 요약 카드가 가로 전체, 그 아래 왼쪽 t-main(종류 · 할 일) / 오른쪽 t-side(바로가기 · 오늘 일정 · 받을 것 · 다가오는 일정)
    const evs = isToday ? `${schNextLine()}${musicLine()}` : '';
    return `
      <section class="hero${allDone ? ' is-done' : ''}${justDone ? ' just' : ''}">
        <p class="hero-date">${dayNav(d, t)}${isToday ? updatedTag() : ''}</p>
        <div class="hero-main">
        <h1 class="hero-title">${allDone ? `<span class="done-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span>${isToday ? '오늘 할 일을 모두 끝냈어요' : '이날 할 일을 모두 했어요'}`
          : !total ? (isToday ? '오늘은 할 일이 없어요' : later ? '이날은 아직 할 일이 없어요' : '이날은 할 일이 없었어요')
          : isToday ? `오늘 할 일 <b class="num">${total - det.done}</b>개 남았어요`
          : later ? `이날 할 일 <b class="num">${total}</b>개`
          : `이날 할 일 ${total}개 중 <b class="num">${det.done}</b>개 했어요`}</h1>
        ${total && !later ? `<span class="ring" style="--p:${pct}" role="img" aria-label="${total}개 중 ${det.done}개 완료"><b class="num">${det.done}/${total}</b></span>` : ''}
        </div>
        ${isToday ? '' : `<p class="day-note">${later ? '미리 보기예요. 체크는 그날부터 할 수 있어요. 일정은 공지에 따라 바뀔 수 있어요.' : '지난 기록이에요. 빠뜨린 체크는 지금 해도 돼요.'}</p>`}
        ${allDone ? `
        <div class="done-stats">
          <p><span>연속 완료</span><b class="num">${streak}일</b></p>
          <p><span>내일 할 일</span><b class="num">${tomorrow ? `${tomorrow}개` : '없음'}</b></p>
        </div>` : ''}
        ${finding ? `<p class="hero-find">${finding}</p>` : ''}
      </section>
      <div class="t-grid${det.gets.length || evs || upcoming.length ? '' : ' solo'}">
      <div class="t-main">
      ${det.strip}
      ${det.give}
      </div>
      <div class="t-side">
      <div class="t-quick">${isToday ? waveLinks() : ''}${toolsBar('')}</div>
      ${evs ? `<section class="t-ev" aria-label="오늘 일정"><h2 class="side-title">오늘 일정</h2>${evs}</section>` : ''}
      ${det.get}
      ${upcoming.length ? `<section class="t-up">
        <h2 class="section-title">다가오는 일정</h2>
        <div class="card list">
          ${upcoming.map(({ it, date, what }) => `
            <div class="list-row">
              <span class="list-date">${mdw(date)}</span>
              <span class="list-body"><b>${esc(it.ally ? it.ally.artist : '리센느')}</b> ${esc(it.camp || it.title)}${it.camp && bareTitle(it) ? `<small>${esc(bareTitle(it))}</small>` : ''}</span>
              <span class="status ${what === '시작' ? 'soon' : 'end'}">${what}</span>
            </div>`).join('')}
        </div></section>` : ''}
      </div>
      </div>
      <p class="xfer-link"><button type="button" class="link-btn" data-xfer>체크 기록 옮기기</button></p>
      ${sourceLine()}`;
  }
