  // [src/60-alliances.js] 연합&기타 탭: 연합 카드·플랫폼 바로가기
  // ---------- 연합 ----------
  function renderAlliances() {
    const t = today();
    const all = state.data.alliances;
    const { arg } = route();
    if (arg) state.allyView = 'guide';
    const view = state.allyView === 'guide' ? 'guide' : 'ally';
    const nG = state.data.guides.length;
    const head = `
      <section class="page-head"><h1>연합&amp;기타</h1></section>
      <div class="seg ally-seg" role="tablist" aria-label="연합 / 가이드">
        <button type="button" role="tab" data-allyview="ally" aria-selected="${view === 'ally'}" class="${view === 'ally' ? 'on' : ''}">연합 <i class="seg-n">${all.length}</i></button>
        <button type="button" role="tab" data-allyview="guide" aria-selected="${view === 'guide'}" class="${view === 'guide' ? 'on' : ''}">플랫폼 바로가기 <i class="seg-n">${nG}</i></button>
      </div>`;
    if (view === 'guide') return `${head}${otherGuides()}${sourceLine()}`;
    if (!all.length) return `${head}<div class="card empty"><strong>등록된 연합이 없어요</strong></div>${sourceLine()}`;
    const order = { live: 0, soon: 1, tbd: 2, end: 3 };
    const sorted = all.slice().sort((a, b) => order[allyStatus(a, t)] - order[allyStatus(b, t)] || (a.end || '9').localeCompare(b.end || '9'));
    // 주고받는 것 한 줄: 무엇을 · 어떤 투표/스밍 · 기간·횟수 (해시태그·인증은 오늘 화면에 있음)
    const ex = (it) => {
      const st = itemStatus(it, t);
      const when = it.tbd ? '기간 미정' : it.end ? (st === 'end' ? '끝남' : `~${md(it.end)}`) : '';
      const sub = [it.qty, when].filter(Boolean).join(' · ');
      return `<li class="ex ${st === 'end' ? 'is-end' : ''}">
          ${it.kind === 'get' && it.camp && !bareTitle(it)
            ? `<b class="ex-title">${esc(it.camp)}</b>`
            : `<span class="ex-camp" style="--c:${campColor(it.camp)}">${esc(it.camp || '기타')}</span><b class="ex-title">${esc(it.kind === 'get' ? bareTitle(it) || it.title : stripCamp(it))}</b>`}
          ${sub ? `<span class="ex-sub num">${esc(sub)}</span>` : ''}
        </li>`;
    };
    const col = (a, kind) => {
      const list = a.items.filter((x) => x.kind === kind);
      return `<div class="ex-col ${kind}">
          <h3>${kind === 'give' ? '줄 것' : '받을 것'}<i>${list.length}</i></h3>
          ${list.length ? `<ul>${list.map(ex).join('')}</ul>` : '<p class="ex-none">없음</p>'}
        </div>`;
    };
    const statusBadge = { live: '<span class="status live">진행중</span>', soon: '<span class="status soon">시작 전</span>', tbd: '<span class="status tbd">협의중</span>', end: '<span class="status end">끝남</span>' };
    const counts = { live: 0, soon: 0, tbd: 0, end: 0 };
    all.forEach((a) => { counts[allyStatus(a, t)]++; });
    const F = [['', '전체', all.length], ['live', '진행중', counts.live], ['soon', '시작 전', counts.soon], ['tbd', '협의중', counts.tbd], ['end', '끝남', counts.end]].filter((x) => x[0] === '' || x[2] > 0);
    const f = F.some((x) => x[0] === state.allyFilter) ? state.allyFilter : '';
    const list = sorted.filter((a) => !f || allyStatus(a, t) === f);
    const card = (a) => {
      const period = a.start || a.end ? `${a.start ? md(a.start) : ''} ~ ${a.end ? md(a.end) : ''}` : '';
      const extra = [
        // 총공 계정이 여러 개면 칸에 띄어 써요 (예: 국내 · 해외 총공팀)
        ...String(a.account || '').split(/\s+/).filter(Boolean).map((h) => (accountUrl(h) ? `<a class="xlink" href="${esc(accountUrl(h))}" target="_blank" rel="noopener"><i aria-hidden="true">X</i>${esc(h)}<span class="sr">(X에서 열기)</span></a>` : esc(h))),
        a.state ? esc(a.state) : '',
        a.link ? `<a href="${esc(a.link)}" target="_blank" rel="noopener">공지 ↗</a>` : '',
      ].filter(Boolean).join(' · ');
      return `
        <article class="card ally2 st-${allyStatus(a, t)}">
          <header class="ally2-head">
            <div><h2>리센느 × ${esc(a.artist)}</h2><p class="num">${a.fandom ? `${esc(a.fandom)}` : ''}${a.fandom && period ? ' · ' : ''}${period}</p></div>
            ${statusBadge[allyStatus(a, t)]}
          </header>
          <div class="ex-cols">${col(a, 'give')}${col(a, 'get')}</div>
          ${extra || a.memo ? `<footer class="ally2-foot">${extra}${a.memo ? `${extra ? '<br>' : ''}${esc(a.memo)}` : ''}</footer>` : ''}
        </article>`;
    };
    return `
      ${head}
      <div class="filter-chips" role="group" aria-label="상태로 걸러 보기">
        ${F.map(([id, label, n]) => `<button type="button" class="fchip ${f === id ? 'on' : ''}" data-allyf="${id}" aria-pressed="${f === id}">${label} <span class="num">${n}</span></button>`).join('')}
      </div>
      <div class="ally2-list">${list.map(card).join('')}</div>
      ${sourceLine()}`;
  }

  // 연합&기타 아래: 플랫폼 바로가기 (음방 제외)
  function otherGuides() {
    const all = state.data.guides;
    const cats = ['전체', ...new Set(all.map((g) => g.category))];
    if (!cats.includes(state.guideFilter)) state.guideFilter = '전체';
    const list = all.filter((g) => state.guideFilter === '전체' || g.category === state.guideFilter);
    const t = today();
    const body = list.map((g) => {
      const using = state.data.items.filter((x) => x.guide === g && ['live', 'soon'].includes(itemStatus(x, t)));
      // 링크 + 이 플랫폼을 쓰는 일정만. 받을 것은 상마다 한 줄로 (누가 해 주는지)
      const mine = using.filter((x) => x.kind !== 'get');
      const gets = {};
      using.filter((x) => x.kind === 'get').forEach((x) => { (gets[x.camp || ''] = gets[x.camp || ''] || []).push(x); });
      const rows = mine.map((x) => `<li>${kindPill(x)} ${campBadge(x.camp, true)} ${esc(stripCamp(x))} <span class="muted">${periodText(x)}</span></li>`)
        .concat(Object.values(gets).map((l) => `<li>${kindPill(l[0])} ${campBadge(l[0].camp, true)} ${esc([...new Set(l.map(whoName))].join(' · '))}${l.length > 1 ? ` <span class="muted">${l.length}팀</span>` : ''} <span class="muted">${periodText(l[0])}</span></li>`));
      return `
      <article class="card guide gl" id="guide-${esc(g.id)}">
        <div class="gl-head">
          <div><h2>${esc(g.platform)}</h2><p class="gl-sub">${esc(g.category)}</p></div>
          ${g.link ? `<a class="btn small primary" href="${esc(g.link)}" target="_blank" rel="noopener" aria-label="${esc(g.platform)} 바로가기">바로가기 ↗</a>` : ''}
        </div>
        ${rows.length ? `<h3>이 플랫폼을 쓰는 일정</h3><ul class="using">${rows.join('')}</ul>` : '<p class="gl-none">지금 이 플랫폼을 쓰는 일정은 없어요</p>'}
      </article>`;
    }).join('');
    return `
      <section class="og-section" id="guide-etc">
        ${toolsBar()}
        ${cats.length > 2 ? `<div class="filter">${cats.map((c) => `<button type="button" data-filter="${esc(c)}" class="${c === state.guideFilter ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
        <div class="guides">${body || '<div class="card empty"><strong>등록된 가이드가 없어요</strong></div>'}</div>
      </section>`;
  }
