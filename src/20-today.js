  // [src/20-today.js] 오늘 탭
  // ---------- 오늘 ----------
  // 멜론 뮤직웨이브: 왼쪽 음총팀 · 오른쪽 공식. seq · ctype 는 짧은 링크가 가는 into.melon.com 연결 페이지에서 찾은 값
  const WAVES = [
    { name: '음총팀', href: 'https://kko.to/M8xTJNH0pX', seq: '67634585', ctype: 'user' },
    { name: '공식', href: 'https://kko.to/gRdgJvFZpv', seq: '3709231', ctype: 'artistrep' },
  ];
  const waveLinks = () => `
        <div class="wave-links" role="group" aria-label="멜론 뮤직웨이브">
          ${WAVES.map((w) => `<a class="wave" href="${w.href}" target="_blank" rel="noopener" data-wave="musicwave/listen?seq=${w.seq}&amp;ctype=${w.ctype}&amp;menuid=1000003041">${IC.wave}<b>${w.name}</b><small>뮤직웨이브</small></a>`).join('')}
        </div>`;
  function renderToday() {
    const d = today();
    const det = dayDetail(d);
    const total = det.todos.length;
    const pct = total ? Math.round((det.done / total) * 100) : 0;
    // 다 끝낸 날 기록 + 방금 마지막 하나를 체크했으면 알려 주기
    const allDone = total > 0 && det.done === total;
    if (!state.doneFilled) { backfillDone(); state.doneFilled = true; }
    const justDone = markDone(d, allDone) && allDone && state.checkedNow;
    state.checkedNow = false;
    const streak = allDone ? doneStreak(d) : 0;
    const tomorrow = allDone ? todosFor(addDays(d, 1)).length : 0;
    if (justDone) setTimeout(() => toast(`오늘 할 일 끝 · 연속 ${streak}일`), 120);
    // 다가오는 일정: 7일 안에 시작하거나 끝나는 것
    const upcoming = [];
    state.data.items.forEach((it) => {
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
    const finding = ending.length
      ? `<span class="find-k">곧 끝나요</span>${ending.slice(0, 2).map((x) => `<span class="find-i"><b class="num">${diffDays(d, x.end) === 0 ? '오늘' : diffDays(d, x.end) + '일 남음'}</b> ${label(x)}</span>`).join('')}`
      : starting.length
        ? `<span class="find-k">곧 시작해요</span>${starting.slice(0, 2).map((x) => `<span class="find-i"><b class="num">${mdw(x.start)}</b> ${label(x)}</span>`).join('')}`
        : '';
    return `
      <section class="hero${allDone ? ' is-done' : ''}${justDone ? ' just' : ''}">
        <p class="hero-date"><span>${longLabel(d)}</span>${updatedTag()}</p>
        <h1 class="hero-title">${allDone ? `<span class="done-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span>오늘 할 일을 모두 끝냈어요` : total ? `오늘 할 일 <b class="num">${total - det.done}</b>개 남았어요` : '오늘은 할 일이 없어요'}</h1>
        ${total ? `<div class="progress-wrap"><div class="progress"><i style="width:${pct}%"></i></div><span class="progress-label num">${det.done}/${total}</span></div>` : ''}
        ${allDone ? `
        <div class="done-stats">
          <p><span>연속 완료</span><b class="num">${streak}일</b></p>
          <p><span>내일 할 일</span><b class="num">${tomorrow ? `${tomorrow}개` : '없음'}</b></p>
        </div>` : ''}
        ${finding ? `<p class="hero-find">${finding}</p>` : ''}
        ${schNextLine()}
        ${musicLine()}
        ${waveLinks()}
      </section>
      ${toolsBar('')}
      ${det.html}
      ${upcoming.length ? `
        <h2 class="section-title">다가오는 일정</h2>
        <div class="card list">
          ${upcoming.map(({ it, date, what }) => `
            <div class="list-row">
              <span class="list-date">${mdw(date)}</span>
              <span class="list-body"><b>${esc(it.ally ? it.ally.artist : '리센느')}</b> ${esc(it.camp || it.title)}${it.camp && bareTitle(it) ? `<small>${esc(bareTitle(it))}</small>` : ''}</span>
              <span class="status ${what === '시작' ? 'soon' : 'end'}">${what}</span>
            </div>`).join('')}
        </div>` : ''}
      <p class="xfer-link"><button type="button" class="link-btn" data-xfer>체크 기록 옮기기</button></p>
      ${sourceLine()}`;
  }
