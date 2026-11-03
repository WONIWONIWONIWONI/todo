  // [src/70-tools.js] 도구: 알림(토스트)·복사·인증샷 워터마크
  // ---------- 복사 알림 ----------
  let toastTimer = 0;
  function toast(msg) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }
  async function copyText(text, label) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* 무시 */ }
      ta.remove();
    }
    toast(label ? `${label}를 복사했어요` : `${text} 복사했어요`);
  }

  // ---------- 체크 기록 옮기기 ----------
  // 체크 기록은 그 브라우저에만 저장돼요. 폰을 바꾸거나, 아이폰에서 사파리 ↔ 홈 화면 앱처럼
  // 저장 공간이 다른 곳으로 옮길 때 코드 한 줄로 옮겨요. 서버로 보내지 않아요.
  const XFER_HEAD = 'RS1.';
  const b64enc = (s) => { const b = new TextEncoder().encode(s); let t = ''; b.forEach((x) => { t += String.fromCharCode(x); }); return btoa(t); };
  const b64dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
  const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length < 80) : []);
  function recordDays() {
    try { return Object.keys(localStorage).filter((k) => k.startsWith('rs-check:') && readSet(k).size).map((k) => k.slice(9)); } catch (e) { return []; }
  }
  function exportRecords() {
    const out = { v: 1, checks: {}, once: [...readSet(ONCE_KEY)], done: [...readSet(DONE_KEY)] };
    recordDays().forEach((d) => { out.checks[d] = [...readSet(ckey(d))]; });
    return XFER_HEAD + b64enc(JSON.stringify(out));
  }
  // 합치기: 이 기기에 있던 기록은 지우지 않고 더하기만 해요
  function importRecords(code) {
    const raw = String(code || '').replace(/\s+/g, '');
    if (!raw.startsWith(XFER_HEAD)) throw new Error('head');
    const d = JSON.parse(b64dec(raw.slice(XFER_HEAD.length)));
    if (!d || d.v !== 1 || typeof d.checks !== 'object') throw new Error('shape');
    const add = (k, list) => {
      const s = readSet(k);
      list.forEach((x) => s.add(x));
      localStorage.setItem(k, JSON.stringify(k === DONE_KEY ? [...s].sort().slice(-400) : [...s]));
    };
    let days = 0;
    Object.entries(d.checks).forEach(([day, ids]) => { if (isDay(day) && strList(ids).length) { add(ckey(day), strList(ids)); days++; } });
    add(ONCE_KEY, strList(d.once));
    add(DONE_KEY, strList(d.done).filter(isDay));
    return days;
  }
  function openTransfer() {
    let m = document.getElementById('xfer');
    if (!m) {
      m = document.createElement('div');
      m.id = 'xfer'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', '체크 기록 옮기기');
      m.innerHTML = `
        <div class="modal-box">
          <div class="modal-head"><h2>체크 기록 옮기기</h2><button type="button" class="icon-btn" data-modal-close aria-label="닫기">닫기</button></div>
          <p class="muted">체크 기록은 이 브라우저에만 있어요. 폰을 바꾸거나 사파리에서 홈 화면 앱으로 옮길 때 써요.</p>
          <div class="xfer-step">
            <h3>1. 지금 기기에서 코드 복사</h3>
            <button type="button" class="btn" id="xferCopy">기록 코드 복사</button>
            <p class="xfer-info" id="xferInfo"></p>
          </div>
          <div class="xfer-step">
            <h3>2. 새 기기에서 붙여 넣기</h3>
            <label class="field"><span class="sr">기록 코드</span>
              <textarea id="xferCode" rows="3" placeholder="RS1.로 시작하는 코드" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
            </label>
            <button type="button" class="btn primary" id="xferApply">가져오기</button>
            <p class="xfer-info" id="xferMsg" role="status"></p>
          </div>
        </div>`;
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-modal-close]')) hideModal(m); });
      m.querySelector('#xferCopy').addEventListener('click', () => copyText(exportRecords(), '기록 코드'));
      m.querySelector('#xferApply').addEventListener('click', () => {
        const msg = m.querySelector('#xferMsg');
        try {
          const n = importRecords(m.querySelector('#xferCode').value);
          msg.textContent = `${n}일 치 기록을 가져왔어요.`;
          msg.classList.remove('err');
          m.querySelector('#xferCode').value = '';
          render({ keepScroll: true });
        } catch (err) {
          msg.textContent = '코드를 읽지 못했어요. 처음부터 끝까지 그대로 붙여 넣어 주세요.';
          msg.classList.add('err');
        }
      });
    }
    const n = recordDays().length;
    m.querySelector('#xferInfo').textContent = n ? `이 기기에 체크한 날 ${n}일` : '이 기기에는 아직 체크 기록이 없어요';
    m.querySelector('#xferMsg').textContent = '';
    showModal(m);
  }

  // ---------- 인증샷 워터마크 (도용 방지) ----------
  // 사진은 기기 안에서만 처리하고 어디에도 보내지 않음
  let wmFiles = [];
  function openWatermark() {
    let m = document.getElementById('wm');
    if (!m) {
      m = document.createElement('div');
      m.id = 'wm'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', '인증샷 워터마크');
      m.innerHTML = `
        <div class="modal-box">
          <div class="modal-head"><h2>인증샷 워터마크</h2><button type="button" class="icon-btn" data-wm-close aria-label="닫기">닫기</button></div>
          <p class="muted">인증 사진에 내 닉네임을 비스듬히 반복해서 새겨 무단 도용을 막아요. 사진은 내 기기 안에서만 처리돼요 (서버 전송 없음).</p>
          <label class="field">내 닉네임 또는 X 아이디
            <input type="text" id="wmName" maxlength="30" placeholder="@my_id" autocomplete="off">
          </label>
          <label class="drop">
            <input type="file" id="wmFile" accept="image/*" multiple hidden>
            <span>사진 선택 (1~3장)</span>
            <small>여러 장이면 위아래로 이어 붙여요 · PC에선 Ctrl+V로 붙여넣기도 돼요</small>
          </label>
          <div id="wmOut" class="wm-out"></div>
        </div>`;
      document.body.appendChild(m);
      const name = m.querySelector('#wmName');
      try { name.value = localStorage.getItem('rs-wm-name') || ''; } catch (e) { /* 무시 */ }
      name.addEventListener('input', () => {
        try { localStorage.setItem('rs-wm-name', name.value); } catch (e) { /* 무시 */ }
        if (wmFiles.length) makeWatermark();
      });
      m.querySelector('#wmFile').addEventListener('change', (e) => { wmFiles = [...e.target.files].slice(0, 3); makeWatermark(); });
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-wm-close]')) hideModal(m); });
      document.addEventListener('paste', (e) => {
        if (!m.classList.contains('show')) return;
        const imgs = [...(e.clipboardData ? e.clipboardData.items : [])].filter((x) => x.type.startsWith('image/')).map((x) => x.getAsFile());
        if (imgs.length) { wmFiles = imgs.slice(0, 3); makeWatermark(); }
      });
    }
    showModal(m);
  }
  const loadImg = (file) => new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
  // 만든 사진 보여 주고 저장 버튼
  function imageResult(out, blob, fname, alt) {
    const url = URL.createObjectURL(blob);
    const file = () => new File([blob], fname, { type: blob.type });
    const canShare = navigator.canShare && navigator.canShare({ files: [file()] });
    // 아이폰: 공유 창의 '이미지 저장'으로 사진 앱에 넣음 / 안드로이드: 갤러리 'Download' 앨범
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const toPhotos = ios && canShare;
    out.innerHTML = `
      <img src="${url}" alt="${alt}">
      <div class="proof-actions">
        ${toPhotos
          ? `<button type="button" class="btn small primary" data-imgshare>사진 앱에 저장</button><a class="btn small" href="${url}" download="${fname}">파일로 저장</a>`
          : `<a class="btn small primary" href="${url}" download="${fname}">사진 저장</a>${canShare ? '<button type="button" class="btn small" data-imgshare>공유하기</button>' : ''}`}
      </div>
      <p class="muted">${toPhotos
        ? '"사진 앱에 저장"을 누르고, 뜨는 창에서 <b>이미지 저장</b>을 누르면 사진 앱(갤러리)에 들어가요. 사진을 길게 눌러 "사진 앱에 추가"를 눌러도 돼요.'
        : '저장한 사진은 갤러리의 "Download(다운로드)" 앨범에 있어요. 저장이 안 되면 사진을 길게 눌러 저장하세요.'}</p>`;
    const sh = out.querySelector('[data-imgshare]');
    if (sh) sh.addEventListener('click', () => navigator.share({ files: [file()] }).catch(() => {}));
  }

  async function makeWatermark() {
    const out = document.getElementById('wmOut');
    const name = (document.getElementById('wmName').value || '').trim();
    if (!wmFiles.length) return;
    if (!name) { out.innerHTML = '<p class="caution">닉네임을 먼저 적어 주세요.</p>'; return; }
    out.innerHTML = '<p class="muted">만드는 중…</p>';
    try {
      const imgs = await Promise.all(wmFiles.map(loadImg));
      const W = Math.min(1080, Math.max(...imgs.map((i) => i.naturalWidth)));
      const hs = imgs.map((i) => Math.round(i.naturalHeight * (W / i.naturalWidth)));
      const H = hs.reduce((a, b) => a + b, 0);
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      let y = 0;
      imgs.forEach((img, n) => { g.drawImage(img, 0, y, W, hs[n]); y += hs[n]; });
      // 30° 대각선, 줄마다 엇갈리게(지그재그) 반복
      const fs = Math.max(18, Math.round(W * 0.042));
      const text = name;
      g.save();
      g.translate(W / 2, H / 2);
      g.rotate(-Math.PI / 6);
      g.font = `800 ${fs}px "Pretendard Variable", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const stepX = g.measureText(text).width + fs * 2.2;
      const stepY = fs * 3.4;
      const R = Math.hypot(W, H);
      let row = 0;
      for (let yy = -R; yy < R; yy += stepY, row++) {
        for (let xx = -R + (row % 2 ? stepX / 2 : 0); xx < R; xx += stepX) {
          // 테두리 없이: 흰 글자 + 아주 옅은 그림자 (밝은 사진에서도 보이게)
          g.shadowColor = 'rgba(0,0,0,.18)';
          g.shadowBlur = fs / 4;
          g.fillStyle = 'rgba(255,255,255,.5)';
          g.fillText(text, xx, yy);
        }
      }
      g.restore();
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
      imageResult(out, blob, `인증_${today()}.jpg`, '워터마크를 넣은 인증샷');
    } catch (e) {
      out.innerHTML = '<p class="caution">사진을 읽지 못했어요. 다른 사진으로 해 주세요.</p>';
    }
  }
