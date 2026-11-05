  // [src/10-ui.js] 화면 조각: 할 일 줄·받을 것 줄·창(모달)·웹앱 설치·묶음 목록·정보 업데이트 시각
  // ---------- 화면 조각 ----------
  const kindPill = (it) => `<span class="kind ${it.kind}">${KIND[it.kind].label}</span>`;
  const tagsHtml = (tags) => tags.length
    ? `<div class="hashtags">${tags.map((t) => `<button type="button" class="hashtag" data-copy="${esc(t)}" aria-label="${esc(t)} 복사">${esc(t)}</button>`).join('')}</div>`
    : '';

  function metaChips(it, date, done) {
    const parts = [];
    if (it.platform) parts.push(`<span>${esc(it.platform)}</span>`);
    if (it.window) parts.push(`<span>${esc(it.window)}</span>`);
    parts.push(`<span class="num">${periodText(it)}${it.end && it.repeat !== '1회' && date <= it.end ? ` · ${dday(date, it.end)}` : ''}</span>`);
    return `<div class="chips-row"><p class="meta">${parts.join('<i class="sep">·</i>')}</p></div>`;
  }

  const chevron = '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 6.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // 받침 있으면 '이', 없으면 '가'
  const josaIGA = (w) => { const c = String(w || '').trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? '이' : '가'; };
  const whoName = (it) => (it.ally ? it.ally.artist : '리센느');
  // 할 일 줄 아래 글씨: 상 이름 (제목에 누구인지 없으면 앞에 붙여요)
  const rowSub = (it, oneCamp) => [String(it.title || '').includes(whoName(it)) ? '' : whoName(it), oneCamp ? '' : it.camp].filter(Boolean).map(esc).join('<i class="sep">·</i>');
  // 상 이름 라벨이 바로 옆에 있을 때 제목 앞의 상 이름은 빼요
  const stripCamp = (it) => { const c = it.camp, t = String(it.title || ''); return c && t.startsWith(c) && t.length > c.length ? t.slice(c.length).replace(/^\s*[·:]?\s*/, '') : t; };
  // 제목에서 누가 · 무슨 상인지(이미 따로 보이는 것)와 '투표'를 뺀 나머지. 받을 것의 '리센느 투표'처럼 뻔한 말은 빈 값
  function bareTitle(it) {
    let t = String(it.title || '').trim();
    const ps = [it.camp, it.ally && it.ally.artist, '리센느'];
    for (let k = 0; k < 2; k++) ps.forEach((p) => { if (p && t.startsWith(p)) t = t.slice(p.length).replace(/^\s*[·:]?\s*/, ''); });
    t = t.replace(/^투표\s*/, '').replace(/\s*투표$/, '').trim();
    const m = t.match(/^\((.+)\)$/);
    if (m) t = /협의|미정|예정/.test(m[1]) ? m[1] : `${m[1]} 부문`;
    return t;
  }
  // 받을 것 줄 제목: 누가 해 주는지 ("앤더블 팬 앤클로")
  const giverName = (it) => (it.ally && it.ally.fandom ? `${it.ally.artist} 팬 ${it.ally.fandom}` : whoName(it));
  // 메모에서 이미 지난 'M.D(요일) HH:MM 오픈'은 빼요
  function memoText(it, date) {
    const d0 = date || today();
    return String(it.memo || '').split(/\s+·\s+/).filter((x) => {
      const m = x.trim().match(/^(\d{1,2})\.(\d{1,2})\s*\([^)]*\)\s*\d{1,2}:\d{2}\s*오픈$/);
      if (!m) return true;
      return `${d0.slice(0, 4)}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` >= d0;
    }).join(' · ');
  }
  // 목록 오른쪽: 오늘 할 양(하루 3표 등). 3일 안에 끝나면 'n일 남음', 시작·마지막 날은 따로 표시
  function rowEnd(it, date) {
    let flag = '';
    if (it.repeat === '1회') flag = it.start === date ? '<i class="flag hot">오늘</i>' : '';
    else if (it.start === date) flag = '<i class="flag new">오늘 시작</i>';
    else if (it.end) {
      const n = diffDays(date, it.end);
      if (n === 0) flag = '<i class="flag hot">오늘 끝</i>';
      else if (n > 0 && n <= 3) flag = `<i class="flag hot">${n}일 남음</i>`;
    }
    if (!it.qty && !flag) return '';
    return `<span class="row-end">${it.qty ? `<b>${esc(it.qty)}</b>` : ''}${flag}</span>`;
  }
  // 상세(펼쳤을 때): 기간·메모·해시태그·버튼·인증
  function rowMore(it, date, done, withProof) {
    const actions = [
      it.link ? `<a class="btn primary" href="${esc(it.link)}"${it.appKey ? appTarget(it.appKey) : ' target="_blank"'} rel="noopener"${it.appKey ? ` data-app="${it.appKey}"` : ''}>${it.appKey ? `${esc(APPS[it.appKey].name)} 앱에서 투표` : '하러 가기 ↗'}</a>` : '',
      it.sms ? `<a class="btn sms" href="sms:${encodeURIComponent(it.sms.to)}?&body=${encodeURIComponent(it.sms.body)}">문자 투표 ${esc(it.sms.to)}</a>` : '',
    ].join('');
    return `
      <div class="row-more">
        ${metaChips(it, date, done)}
        ${memoText(it, date) ? `<p class="task-memo">${esc(memoText(it, date))}</p>` : ''}
        ${tagsHtml(it.tags)}
        ${actions ? `<div class="task-actions">${actions}</div>` : ''}
        ${withProof ? proofBlock(it) : ''}
      </div>`;
  }
  // oneCamp: 이 묶음이 상 하나뿐이라 묶음 제목에 상 이름이 이미 있을 때 → 줄에서는 상 이름을 안 써요
  function todoRow(it, date, checks, oneCamp) {
    const done = checks.has(it.id);
    const open = state.open.has(it.id);
    const later = date > today(); // 앞날 미리 보기: 체크는 그날부터
    const rid = 'm-' + it.id.replace(/[^\w-]/g, '');
    return `
      <li class="row ${done ? 'done' : ''} ${open ? 'open' : ''}" style="--cc:${campColor(it.camp || '')}">
        <div class="row-main">
          <button class="check" type="button" data-check="${esc(it.id)}" data-date="${date}" aria-pressed="${done}" aria-label="${esc(it.title)} ${later ? '· 그날부터 체크할 수 있어요' : '완료 표시'}"${later ? ' disabled' : ''}>
            <svg viewBox="0 0 24 24"><path d="M5 12.5l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="row-head" type="button" data-open="${esc(it.id)}" aria-expanded="${open}" aria-controls="${rid}">
            <span class="row-text">
              <span class="row-title">${esc(it.title)}</span>
              <span class="row-sub">${it.music ? `${esc(it.platform)}<i class="sep">·</i>${esc(it.window)}` : rowSub(it, oneCamp)}</span>
            </span>
            ${rowEnd(it, date)}
            ${chevron}
          </button>
        </div>
        ${open ? `<div id="${rid}">${rowMore(it, date, done, true)}</div>` : ''}
      </li>`;
  }

  // 인증 칸: 인증 방법 + X·구글폼·카톡 버튼 (X는 해시태그만 자동 입력)
  function proofBlock(it) {
    // 인증방법 칸이 비어 있으면 인증 칸을 안 보여요 (예: 뮤직웨이브만 하면 되는 연합)
    // 인증링크 칸에 X 글 주소가 있으면 그 글에 댓글로 인증 (답글 창이 해시태그와 함께 열려요)
    const reply = it.proofLinks.map((p) => (p.url.match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/) || [])[1]).find(Boolean);
    const tweet = it.tags.length && (it.proof || it.proofLinks.length)
      ? `https://x.com/intent/post?${reply ? `in_reply_to=${reply}&` : ''}text=${encodeURIComponent(it.tags.join('\n'))}`
      : '';
    if (!it.proof && !it.proofLinks.length && !tweet) return '';
    const alt = it.proofLinks.filter((p) => !(reply && tweet && p.url.includes(reply)));
    // 갤럭시는 X 앱이 답글 대상을 버려서 태그 복사 후 글을 열어요 (src/90-main.js openX) — 버튼 이름으로 미리 알리고, 태그 복사 버튼은 겹쳐서 빼요
    const galaxyReply = reply && /android/i.test(navigator.userAgent);
    const btns = [
      tweet ? `<a class="btn small proof tw" href="${esc(tweet)}" target="_blank" rel="noopener">${galaxyReply ? '태그 복사 · X 댓글 달러 가기' : reply ? 'X 댓글로 인증' : 'X 인증'} ↗</a>` : '',
      it.tags.length && tweet && !galaxyReply ? `<button type="button" class="btn small" data-copy="${esc(it.tags.join('\n'))}" data-copy-label="태그">태그 복사</button>` : '',
    ].join('');
    return `
      <div class="proof-block">
        <p><b>인증</b> ${esc(it.proof || '완료 화면을 날짜가 보이게 캡처')}</p>
        ${btns ? `<div class="proof-actions">${btns}</div>` : ''}
        ${alt.length ? `
          <p class="proof-alt">${tweet ? '서치밴이거나 X 작성이 어려우면 (둘 중 하나):' : '인증하기:'}</p>
          <div class="proof-actions">${alt.map((p) => p.off ? `<button type="button" class="btn small proof" disabled>${p.label} (추후 공지)</button>` : `<a class="btn small proof" href="${esc(p.url)}" target="_blank" rel="noopener">${p.label} ↗</a>`).join('')}</div>` : ''}
      </div>`;
  }

  // X 서치밴 안내 (참고: 서치밴이면 해시태그가 검색에 안 떠서 집계에서 빠질 수 있음)
  const SHADOWBAN_URL = 'https://x-shadowban-checker.fia-s.com/en/';
  const SHADOWBAN_RADAR = 'https://shadowbanradar.com/';
  const SHADOWBAN_BODY = `
    <p>서치밴(검색 제한)에 걸리면 해시태그가 검색에 안 떠서 집계에서 빠질 수 있어요. 트윗 올리기 전에 확인해 보세요. 결과는 참고용이에요.</p>
    <h3 class="sban-h">1. 검사 사이트에서 확인</h3>
    <div class="proof-actions">
      <a class="btn" href="${SHADOWBAN_URL}" target="_blank" rel="noopener">Shadowban Checker F ↗</a>
      <a class="btn" href="${SHADOWBAN_RADAR}" target="_blank" rel="noopener">Shadowban Radar ↗</a>
    </div>
    <h3 class="sban-h">2. 내 게시물이 검색에 뜨는지 직접 확인</h3>
    <form class="handle-row" id="handleForm" novalidate>
      <label class="handle-field"><span aria-hidden="true">@</span><input id="xHandle" type="text" maxlength="15" placeholder="X 계정 아이디" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="X 계정 아이디" aria-describedby="handleHelp"></label>
      <button type="submit" class="btn primary">게시물 검색 ↗</button>
    </form>
    <p class="handle-help" id="handleHelp">영문·숫자·밑줄(_)만, 15자까지. 최신 탭에 내 트윗이 안 보이면 서치밴일 수 있어요.</p>
    <h3 class="sban-h">결과에 따라</h3>
    <ul>
      <li><b>서치밴 정상</b> → X 인증으로 진행 (권장)</li>
      <li><b>서치밴 확인됨</b> → 구글폼 또는 음원총공팀 카톡으로 인증</li>
    </ul>
    <p class="muted">서치밴이 아닌데 X 게시가 어렵다면, 구글폼·카톡으로 인증한 뒤 #2026MAMAVOTE #RESCENE 태그 게시물을 리트윗(RT)해 주세요.</p>`;

  // 맨 위 '도구' 줄: 인증할 때 쓰는 것들
  const IC = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
    mark: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M7 15l3.2-3.6 2.6 2.6L15 11.5l2 3.5"/><path d="M8 8.5h.01"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M12 8.5v6M9 11.5h6"/></svg>',
    wave: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9c2-2.4 4-2.4 6 0s4 2.4 6 0 4-2.4 6 0M3 15c2-2.4 4-2.4 6 0s4 2.4 6 0 4-2.4 6 0"/></svg>',
  };
  // 홈 화면 웹앱으로 열면 '앱처럼 쓰기'는 빼고 나머지 두 칸이 넓게 채워요
  const toolsBar = (title) => {
    const app = isStandalone();
    return `
    ${title ? `<h2 class="section-title">${title}</h2>` : ''}
    <div class="tool-tiles${app ? ' two' : ''}" role="group" aria-label="인증 도구">
      <button type="button" class="ttile" data-sban>${IC.search}<b>서치밴 확인</b><small>내 글이 보이나</small></button>
      <button type="button" class="ttile" data-wm>${IC.mark}<b>인증샷 워터마크</b><small>사진 도용 막기</small></button>
      ${app ? '' : `<button type="button" class="ttile" data-install>${IC.home}<b>앱처럼 쓰기</b><small>홈 화면에 추가</small></button>`}
    </div>`;
  };

  function openSban() {
    let m = document.getElementById('sban');
    if (!m) {
      m = document.createElement('div');
      m.id = 'sban'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'X 서치밴 확인'); m.tabIndex = -1;
      m.innerHTML = `
        <div class="modal-box">
          <div class="modal-head"><h2>X 서치밴 확인</h2><button type="button" class="icon-btn" data-modal-close aria-label="닫기">닫기</button></div>
          <div class="sban-body">${SHADOWBAN_BODY}</div>
        </div>`;
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-modal-close]')) hideModal(m); });
      // 내 게시물 검색: x.com 최신 탭에서 from:아이디
      const inp = m.querySelector('#xHandle');
      const help = m.querySelector('#handleHelp');
      try { inp.value = localStorage.getItem('rs-x-handle') || ''; } catch (e) { /* 무시 */ }
      m.querySelector('#handleForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const h = inp.value.trim().replace(/^@/, '');
        if (!/^\w{1,15}$/.test(h)) { help.classList.add('err'); inp.focus(); return; }
        help.classList.remove('err');
        try { localStorage.setItem('rs-x-handle', h); } catch (err) { /* 무시 */ }
        window.open(`https://x.com/search?q=${encodeURIComponent('from:' + h)}&f=live`, '_blank', 'noopener');
      });
    }
    showModal(m);
  }

  // ---------- 창(모달) 공통: 초점 이동·가두기·되돌리기 ----------
  let modalReturn = null;
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function showModal(m) {
    modalReturn = document.activeElement;
    m.classList.toggle('show', true);
    const first = m.querySelector('.modal-box ' + FOCUSABLE);
    if (first) first.focus();
  }
  function hideModal(m) {
    if (!m.classList.contains('show')) return;
    m.classList.toggle('show', false);
    if (modalReturn && document.contains(modalReturn)) modalReturn.focus();
    modalReturn = null;
  }
  document.addEventListener('keydown', (e) => {
    const m = document.querySelector('.modal.show');
    if (!m) return;
    if (e.key === 'Escape') { hideModal(m); return; }
    if (e.key !== 'Tab') return;
    const f = [...m.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // 다시 그린 뒤 같은 버튼에 초점
  function focusAfter(sel) {
    if (!document.activeElement || document.activeElement === document.body) {
      const el = document.querySelector(sel);
      if (el) el.focus({ preventScroll: true });
    }
  }
  // 탭: 화살표 키로 옆 탭으로
  document.addEventListener('keydown', (e) => {
    const tab = e.target.closest && e.target.closest('[role="tab"]');
    if (!tab || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    const tabs = [...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
    const next = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    e.preventDefault();
    next.click();
    const sel = next.dataset.kindtab ? `[data-kindtab="${next.dataset.kindtab}"]` : `[data-view="${next.dataset.view}"]`;
    const again = document.querySelector(sel);
    if (again) again.focus();
  });

  // ---------- 웹앱 설치 (홈 화면에 추가) ----------
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  function openInstall() {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.finally(() => { installPrompt = null; });
      return;
    }
    let m = document.getElementById('install');
    if (!m) {
      const ua = navigator.userAgent;
      const ios = /iphone|ipad|ipod/i.test(ua);
      // 갤럭시: 카톡 · X 같은 앱 안 창에서는 홈 화면 추가가 안 돼서 크롬으로 열게, 삼성 인터넷은 메뉴가 아래쪽
      const android = /android/i.test(ua);
      const inApp = android && /KAKAOTALK|Twitter|FBAN|FBAV|FB_IAB|Instagram|NAVER|Line\/|; wv\)/i.test(ua);
      const samsung = android && /SamsungBrowser/i.test(ua);
      const chrome = `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;end`;
      m = document.createElement('div');
      m.id = 'install'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', '홈 화면에 추가');
      m.innerHTML = `
        <div class="modal-box">
          <div class="modal-head"><h2>홈 화면에 추가</h2><button type="button" class="icon-btn" data-modal-close aria-label="닫기">닫기</button></div>
          <div class="install-body">
            <img src="icons/icon-192.png" alt="" width="64" height="64">
            ${isStandalone() ? '<p>이미 앱으로 쓰고 있어요.</p>' : ios ? `
              <ol class="steps">
                <li>사파리 아래쪽 <b>공유</b> 버튼(네모에 화살표)을 눌러요</li>
                <li><b>홈 화면에 추가</b>를 골라요</li>
                <li>오른쪽 위 <b>추가</b>를 누르면 끝</li>
              </ol>` : inApp ? `
              <p>카톡 · X 같은 앱 안에서는 홈 화면에 추가할 수 없어요. 크롬에서 열어 주세요.</p>
              <a class="btn primary" href="${chrome}">크롬으로 열기</a>` : samsung ? `
              <ol class="steps">
                <li>삼성 인터넷 아래쪽 <b>≡ 메뉴</b>를 눌러요</li>
                <li><b>현재 페이지 추가</b> → <b>홈 화면</b>을 골라요</li>
                <li><b>추가</b>를 누르면 끝</li>
              </ol>` : `
              <ol class="steps">
                <li>크롬 오른쪽 위 <b>⋮ 메뉴</b>를 눌러요</li>
                <li><b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 골라요</li>
                <li><b>설치</b>를 누르면 끝</li>
              </ol>`}
            <p class="muted">홈 화면 아이콘으로 열면 주소창 없이 앱처럼 보이고, 인터넷이 잠깐 끊겨도 마지막 내용을 볼 수 있어요.</p>
            ${ios ? '<p class="muted">사파리에서 체크한 기록은 앱으로 저절로 넘어가지 않아요.</p><button type="button" class="btn small" data-xfer>체크 기록 옮기기</button>' : ''}
          </div>
        </div>`;
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-modal-close]')) hideModal(m); });
    }
    showModal(m);
  }

  function getRow(it, date, oneCamp) {
    const open = state.open.has(it.id);
    const rid = 'm-' + it.id.replace(/[^\w-]/g, '');
    const initial = it.ally ? [...it.ally.artist][0] : '리';
    return `
      <li class="row get ${open ? 'open' : ''}" style="--cc:${campColor(it.camp || '')}">
        <div class="row-main">
          <span class="avatar" aria-hidden="true">${esc(initial)}</span>
          <button class="row-head" type="button" data-open="${esc(it.id)}" aria-expanded="${open}" aria-controls="${rid}">
            <span class="row-text">
              <span class="row-title">${esc(giverName(it))}</span>
              <span class="row-sub">${[oneCamp ? '' : it.camp, bareTitle(it)].filter(Boolean).map(esc).join('<i class="sep">·</i>') || (oneCamp ? '' : esc(it.title))}</span>
            </span>
            ${rowEnd(it, date)}
            ${chevron}
          </button>
        </div>
        ${open ? `<div id="${rid}">${rowMore(it, date, false, false)}</div>` : ''}
      </li>`;
  }

  function sortTodos(list, checks) {
    // 완료 체크해도 자리는 그대로 (아래로 내리지 않음 — 사용자 요청)
    return list.sort((a, b) => {
      // 같은 투표끼리 붙여서 보이게
      return campOrder(a.camp) - campOrder(b.camp) || (a.camp || '').localeCompare(b.camp || '', 'ko') || (a.deadline ?? 9999) - (b.deadline ?? 9999) || (a.end || '9').localeCompare(b.end || '9') ||
        // 같은 상 안에서는 리센느(자체) 먼저, 나머지는 가나다순
        (a.kind === 'self' ? 0 : 1) - (b.kind === 'self' ? 0 : 1) || a.title.localeCompare(b.title, 'ko');
    });
  }

  // 음방 / MAMA / MMA / 기타 필터: 종류별 카드 (누르면 그 종류만, 할 일 완료 수 + 막대)
  function campStrip(allTodos, allGets, checks) {
    const all = [...allTodos, ...allGets];
    const shown = GROUPS.filter((g) => all.some((x) => campGroup(x.camp) === g.id));
    if (!shown.length) return '';
    const f = state.campFilter && shown.some((g) => g.id === state.campFilter) ? state.campFilter : '';
    const card = (id, name, color, todos, gets) => {
      const done = todos.filter((x) => checks.has(x.id)).length;
      const pct = todos.length ? Math.round((done / todos.length) * 100) : 0;
      return `<button type="button" class="ccard ${f === id ? 'on' : ''}" data-camp="${id}" style="--cc:${color}" aria-pressed="${f === id}">
          <b><i class="dot" style="--c:${color}"></i>${esc(name)}</b>
          <small class="num">${todos.length ? `${done}/${todos.length} 완료` : `받을 것 ${gets.length}`}</small>
          <span class="cbar" aria-hidden="true"><i style="width:${pct}%"></i></span>
        </button>`;
    };
    return `
      <div class="cat-grid" role="group" aria-label="종류별로 모아보기">
        ${card('', '전체', 'var(--accent)', allTodos, allGets)}
        ${shown.map((g) => card(g.id, g.id, g.color, allTodos.filter((x) => campGroup(x.camp) === g.id), allGets.filter((x) => campGroup(x.camp) === g.id))).join('')}
      </div>`;
  }

  // 묶음(MAMA/MMA/기타)마다 카드 하나에 줄을 모음. 묶음 안의 상이 하나뿐이면 제목을 그 상 이름으로 (줄마다 반복하지 않게)
  function groupedList(list, rowFn, countFn) {
    return GROUPS.map((g) => {
      const rows = list.filter((x) => campGroup(x.camp) === g.id);
      if (!rows.length) return '';
      const camps = new Set(rows.map((x) => x.camp || ''));
      const one = camps.size === 1 && rows[0].camp ? rows[0].camp : '';
      return `
        <section class="group">
          <h3 class="group-head"><span class="gname" style="--cc:${g.color}">${esc(one || g.id)}</span><span class="gcount num">${countFn(rows)}</span></h3>
          <ul class="rows">${rows.map((x) => rowFn(x, !!one)).join('')}</ul>
        </section>`;
    }).join('');
  }

  function dayDetail(date) {
    const checks = getChecks(date);
    const allTodos = sortTodos(todosFor(date), checks);
    const allGets = getsFor(date).sort((a, b) => campOrder(a.camp) - campOrder(b.camp) || (a.camp || '').localeCompare(b.camp || '', 'ko') || (a.end || '9').localeCompare(b.end || '9') || giverName(a).localeCompare(giverName(b), 'ko'));
    const strip = campStrip(allTodos, allGets, checks);
    const f = state.campFilter && [...allTodos, ...allGets].some((x) => campGroup(x.camp) === state.campFilter) ? state.campFilter : '';
    const todos = f ? allTodos.filter((x) => campGroup(x.camp) === f) : allTodos;
    const gets = f ? allGets.filter((x) => campGroup(x.camp) === f) : allGets;
    const done = todos.filter((x) => checks.has(x.id)).length;
    // 오늘 탭이 칸을 나눠 놓을 수 있게 조각으로 돌려줘요: 종류 카드 · 할 일 · 받을 것(접힘)
    return {
      todos: allTodos, gets: allGets, done: allTodos.filter((x) => checks.has(x.id)).length,
      strip,
      give: `
          <section class="day-col give" aria-label="할 일">
            <h2 class="col-title">할 일 <span class="num">${todos.length ? `${done}/${todos.length} 완료` : '0'}</span></h2>
            ${todos.length ? groupedList(todos, (x, one) => todoRow(x, date, checks, one), (rows) => `${rows.filter((x) => checks.has(x.id)).length}/${rows.length}`) : '<div class="card empty">이 날 할 일은 없어요</div>'}
          </section>`,
      get: !gets.length ? '' : `
          <section class="day-col get${state.getsOpen ? ' open' : ''}" aria-label="받을 것">
            <button type="button" class="get-fold" data-getfold aria-expanded="${!!state.getsOpen}" aria-controls="get-list">
              <span class="gf-title">받을 것 <i class="seg-n">${gets.length}</i></span>
              <span class="gf-sum">${GROUPS.map((g) => [g, gets.filter((x) => campGroup(x.camp) === g.id).length]).filter(([, n]) => n).map(([g, n]) => `<span><i class="dot" style="--c:${g.color}"></i>${esc(g.id)} <b class="num">${n}</b></span>`).join('')}</span>
              ${chevron}
            </button>
            <div id="get-list"${state.getsOpen ? '' : ' hidden'}>${groupedList(gets, (x, one) => getRow(x, date, one), (rows) => `${rows.length}`)}</div>
          </section>`,
    };
  }

  // 정보 기준 시각: 연합 자료·blip·Mnet Plus·기타 일정 중 가장 최근에 내용이 바뀐 때
  // (각 자료는 내용이 바뀐 때만 시각을 새로 적어요: build_data.py, crawl_blip.py, crawl_weekly.py)
  const kstStamp = (v) => {
    if (!v) return '';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T00:00';
    const t = new Date(s.length === 16 ? s + ':00+09:00' : s);
    if (isNaN(t)) return '';
    return t.toLocaleString('sv-SE', { timeZone: TZ, hour12: false }).slice(0, 16).replace(' ', 'T');
  };
  function updatedAt() {
    if (state.source === 'sheet') return kstStamp(new Date(state.loadedAt).toISOString());
    if (typeof blipLoad === 'function' && !state.blip) blipLoad();
    const list = [window.DATA_UPDATED, state.blip && state.blip.updated, state.blip && state.blip.mnetUpdated, state.weekly && state.weekly.updated];
    return list.map(kstStamp).filter(Boolean).sort().pop() || '';
  }
  const updatedDate = () => updatedAt().slice(0, 10);
  const updLabel = () => {
    const at = updatedAt();
    if (!at) return '';
    const hm = at.slice(11, 16);
    const d = at.slice(0, 10);
    return d === today() ? `오늘 ${hm !== '00:00' ? hm : ''}`.trim() : md(d);
  };
  const updatedTag = () => (updatedAt() ? `<span class="upd">정보 ${updLabel()} 업데이트</span>` : '');
  function sourceLine() {
    const t = new Date(state.loadedAt).toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    const src = state.source === 'sheet' ? `시트 반영 ${t}`
      : state.source === 'cache' ? `마지막 시트 저장본 (${t})`
      : (updatedAt() ? `정보 업데이트 ${longLabel(updatedDate())}${updatedAt().slice(11, 16) !== '00:00' ? ' ' + updatedAt().slice(11, 16) : ''}` : '사이트 정리본 기준');
    return `<p class="updated">${src} · 날짜는 한국 시간 기준</p>
      <p class="disclaimer">이 사이트는 리센느(RESCENE)를 응원하는 팬이 자발적으로 만든 비영리 정리 도구예요.<br>리센느 음원총공팀 및 소속사와 공식적인 관련이 없어요. 공식 지침은 음원총공팀 공지를 확인해 주세요.</p>`;
  }
