  // [src/20-today.js] 오늘 탭
  // ---------- 오늘 ----------
  // 멜론 뮤직웨이브: sheet-templates/뮤직웨이브.csv 줄 순서대로 (왼쪽 음총팀 · 오른쪽 공식).
  // 방 번호(seq) · 방 종류(ctype)는 짧은 링크가 가는 into.melon.com 연결 페이지에서 찾은 값
  const musicLinks = toObjects((window.SAMPLE_DATA || {}).waves || '');
  const serviceCards = {
    '지니': { id: 'genie', detail: '모바일에서 열기', icon: 'genie.ico' },
    '스테이션헤드': { id: 'stationhead', detail: '애플뮤직 / 스포티파이', icon: 'stationhead.png' },
  };
  function streamingLinkAttrs(guide) {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const web = esc(guide.link);
    // CEICT3의 공식 공유 페이지가 지정한 팬트리 화면. 관리자가 주소를 바꾸면 새 공유 링크를 그대로 연다.
    if (guide.id === 'genie' && /^https?:\/\/genie\.co\.kr\/CEICT3$/.test(guide.link)) {
      const landing = '?landing_type=280&landing_target=82379125%5E10929';
      if (ios) return `href="${esc('KTolleh00167://landing/' + landing)}" data-app-fallback="${web}"`;
      if (/android/i.test(navigator.userAgent)) {
        const intent = `intent://scan/${landing}#Intent;scheme=cromegenie;package=com.ktmusic.geniemusic;S.browser_fallback_url=${encodeURIComponent(guide.link)};end`;
        return `href="${esc(intent)}"`;
      }
    }
    // 현재 창에서 공식 채널 링크를 직접 누르면 iOS가 설치된 Stationhead에 전달한다.
    if (ios && guide.id === 'stationhead') return `href="${web}"`;
    return `href="${web}" target="_blank" rel="noopener"`;
  }
  const waveLinks = () => `
        <div class="wave-links" role="group" aria-label="음악 바로가기">
          ${musicLinks.map(r => {
            const card = serviceCards[r['서비스']];
            if (card) return `<a class="wave streaming-card" ${streamingLinkAttrs({ ...card, link: r['링크'] })}><img src="${BASE}icons/${card.icon}" width="30" height="30" alt=""><b>${esc(r['이름'])}</b><small>${card.detail}</small></a>`;
            return `<a class="wave" href="${esc(r['링크'])}" target="_blank" rel="noopener" data-wave="musicwave/listen?seq=${encodeURIComponent(r['방번호'])}&amp;ctype=${encodeURIComponent(r['방종류'])}&amp;menuid=1000003041"><img src="${BASE}icons/melon.png" width="30" height="30" alt=""><b>${esc(r['이름'])}</b><small>멜론 뮤직웨이브</small></a>`;
          }).join('')}
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
  const taskEnd = (it) => it.repeat === '1회' ? it.start || it.end : it.end;
  function priorityCard(it, date, remaining, ring) {
    const end = taskEnd(it);
    const days = end ? diffDays(date, end) : null;
    const deadline = days === null ? '' : days === 0 ? '오늘 마감' : days === 1 ? '내일 마감' : md(end) + ' 마감';
    const vote = /투표|MAMA|MMA|퍼스트브랜드|초이스/i.test(it.camp + ' ' + it.title);
    const name = vote ? '투표' : '할 일';
    const title = it.camp || it.title;
    const detail = [title !== it.title && it.title, it.qty].filter(Boolean).join(' · ');
    return `<div class="priority">
      <header><span>먼저 할 ${name}</span>${deadline ? `<span class="deadline${days <= 1 ? ' soon' : ''}">${esc(deadline)}</span>` : ''}</header>
      <h1>${esc(title)}</h1>${detail ? `<p>${esc(detail)}</p>` : ''}
      ${ring}
      <footer><button type="button" class="priority-count" data-next-task>오늘 할 일 ${remaining}개 남음</button>
        <button type="button" class="priority-detail" data-task-detail="${esc(it.id)}">${name} 상세 보기 ›</button></footer>
    </div>`;
  }
  let occasionalView = false;
  function occasionalList(items) {
    if (!items.length) return '<div class="card empty">이날은 등록된 수시 활동이 없어요.</div>';
    const rows = items.map(it => {
      const title = esc(it.title.replace(/\s*·\s*(매시간|1시간마다 한번씩)$/, ''));
      const name = it.link ? `<a href="${esc(it.link)}" target="_blank" rel="noopener">${title} ↗</a>` : `<b>${title}</b>`;
      return `<div class="hourly-row"><div>${name}<small>${esc(it.cadence)}</small></div></div>`;
    }).join('');
    return `<div class="card">${rows}</div>`;
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
    const next = isToday && !allDone ? det.todos.filter((it) => !det.checks.has(it.id))
      .sort((a, b) => (taskEnd(a) || '9999').localeCompare(taskEnd(b) || '9999') || (a.deadline ?? 9999) - (b.deadline ?? 9999))[0] : null;
    const ring = total && !later ? `<span class="ring" style="--p:${pct}" role="img" aria-label="${total}개 중 ${det.done}개 완료"><b class="num">${det.done}/${total}</b></span>` : '';
    // 배치 (B안): 휴대폰은 한 줄 = 요약 → 바로가기 → 오늘 일정 → 종류 → 할 일 → 받을 것 → 다가오는 일정
    //            컴퓨터(1100px~)는 요약 카드가 가로 전체, 그 아래 왼쪽 t-main(종류 · 할 일) / 오른쪽 t-side(바로가기 · 오늘 일정 · 받을 것 · 다가오는 일정)
    const evs = isToday ? `${schNextLine()}${musicLine()}` : '';
    return `
      <section class="hero${next ? ' has-priority' : ''}${allDone ? ' is-done' : ''}${justDone ? ' just' : ''}">
        <p class="hero-date">${dayNav(d, t)}${isToday ? updatedTag() : ''}</p>
        ${next ? priorityCard(next, d, total - det.done, ring) : `<div class="hero-main">
        <h1 class="hero-title">${allDone ? `<span class="done-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span>${isToday ? '오늘 할 일을 모두 끝냈어요' : '이날 할 일을 모두 했어요'}`
          : !total ? (isToday ? '오늘은 할 일이 없어요' : later ? '이날은 아직 할 일이 없어요' : '이날은 할 일이 없었어요')
          : later ? `이날 할 일 <b class="num">${total}</b>개`
          : `이날 할 일 ${total}개 중 <b class="num">${det.done}</b>개 했어요`}</h1>
        ${ring}
        </div>`}
        ${isToday ? '' : `<p class="day-note">${later ? '미리 보기예요. 체크는 그날부터 할 수 있어요. 일정은 공지에 따라 바뀔 수 있어요.' : '지난 기록이에요. 빠뜨린 체크는 지금 해도 돼요.'}</p>`}
        ${allDone && isToday ? `
        <div class="done-stats">
          <p><span>연속 완료</span><b class="num">${streak}일</b></p>
          <p><span>내일 할 일</span><b class="num">${tomorrow ? `${tomorrow}개` : '없음'}</b></p>
        </div>` : ''}
      </section>
      <div class="t-grid${det.gets.length || evs || upcoming.length ? '' : ' solo'}">
      <div class="t-main">
      <div class="activity-switch" role="group" aria-label="활동 목록">
        <button type="button" data-activity="daily" aria-pressed="${!occasionalView}">할 일</button>
        <button type="button" data-activity="occasional" aria-pressed="${occasionalView}">틈틈이 할 일</button>
      </div>
      ${occasionalView ? `<section class="hourly-tasks" aria-label="틈틈이 할 일">${occasionalList(state.data.items.filter(it => it.kind !== 'get' && it.cadence && itemOn(it, d)))}</section>` : det.strip + det.give}
      </div>
      <div class="t-side">
      <div class="t-quick">${isToday ? waveLinks() : ''}${toolsBar('', true)}</div>
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
