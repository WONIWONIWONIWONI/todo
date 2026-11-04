// 사이트 전체 점검: 모든 탭 × 휴대폰/컴퓨터 폭 × 라이트/다크를 띄워서
//   스크립트 오류 · 화면 그리기 실패 · 가로로 넘치는 화면 · 디시 링크 · 빈 화면 을 찾아요.
// 쓰는 법 (사이트 폴더에서):
//   python -m http.server 8765          ← 다른 창에서 켜 두기
//   node tools/check_site.mjs            ← 기본 http://localhost:8765/
//   node tools/check_site.mjs https://woniwoniwoniwoni.github.io/todo/
// 문제가 없으면 "문제 없음", 있으면 목록을 보여 주고 끝 코드 1로 끝나요.
// 필요한 것: Node 22 이상, Edge 또는 Chrome.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] || 'http://localhost:8765/').replace(/#.*$/, '');
const TABS = ['today', 'music', 'schedule', 'calendar', 'alliances'];
const SIZES = [{ name: '휴대폰', w: 390, h: 844, mobile: true }, { name: '컴퓨터', w: 1280, h: 900, mobile: false }];
// auto-dark: 화면 모드 '자동'에서 기기가 다크일 때
const THEMES = ['light', 'dark', 'auto-dark'];
// 눌러 볼 것 (있으면): 받을 것 보기, 플랫폼 바로가기, 음방 탭 하나
const CLICKS = { today: ['[data-kindtab="get"]'], calendar: ['[data-kindtab="get"]'], alliances: ['[data-allyview="guide"]'], music: ['[data-mgtab="musicbank"]'] };

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const exe = BROWSERS.find((p) => existsSync(p));
if (!exe) { console.error('Edge나 Chrome을 찾지 못했어요.'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'rs-check-'));
const port = 9400 + Math.floor(Math.random() * 400);
// GitHub Actions(우분투)에서는 Chrome 보호 상자(sandbox)가 막혀 있어서 --no-sandbox 로 켜요
const proc = spawn(exe, ['--headless=new', '--disable-gpu', ...(process.env.CI ? ['--no-sandbox'] : []), `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank']);

let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try { const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const pg = t.find((x) => x.type === 'page'); if (pg) ws = new WebSocket(pg.webSocketDebuggerUrl); } catch (e) { /* 아직 안 켜짐 */ }
  if (!ws) await sleep(200);
}
if (!ws) { console.error('브라우저를 켜지 못했어요.'); proc.kill(); process.exit(2); }
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const waiting = new Map();
const pageErrors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result || {}); waiting.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') pageErrors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++seq; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

await send('Runtime.enable');
await send('Page.enable');

const problems = [];
let runs = 0;
for (const size of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.mobile });
  for (const theme of THEMES) {
    const auto = theme === 'auto-dark';
    const want = auto ? 'dark' : theme;
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: auto ? 'dark' : 'light' }] });
    const boot = await send('Page.addScriptToEvaluateOnNewDocument', { source: auto ? `try { localStorage.removeItem('rs-theme'); } catch (e) {}` : `try { localStorage.setItem('rs-theme', '${theme}'); } catch (e) {}` });
    for (const tab of TABS) {
      runs++;
      const where = `${tab} · ${size.name} · ${{ light: '라이트', dark: '다크', 'auto-dark': '자동(기기 다크)' }[theme]}`;
      pageErrors.length = 0;
      // 탭마다 실제 페이지 주소로 바로 들어가 봐요 (…/music/ 등)
      await send('Page.navigate', { url: `${BASE}${tab === 'today' ? '' : tab + '/'}?check=${Date.now()}` });
      await sleep(2500);
      for (const sel of CLICKS[tab] || []) {
        await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b) b.click(); })()`);
        await sleep(400);
      }
      const r = await evaluate(`(() => {
        const main = document.getElementById('app');
        const over = document.documentElement.scrollWidth - innerWidth;
        const wide = [...document.querySelectorAll('#app *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && b.right > innerWidth + 2 && getComputedStyle(e).position !== 'fixed' && !e.closest('[class*="scroll"], .filter-chips, .mg-tabs, .tl, .mc, .sch-cal'); }).slice(0, 3).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]);
        return {
          errors: (window.__rsErrors || []).map((x) => x.where + ': ' + String(x.msg).split('\\n')[0]),
          theme: document.documentElement.dataset.theme,
          tab: (document.querySelector('.tabbar a.active') || {}).dataset?.tab,
          over, wide,
          empty: !main || main.innerText.trim().length < 40,
          broken: document.querySelectorAll('#app [role="alert"]').length,
          dc: [...document.querySelectorAll('a[href]')].filter((a) => /dcinside|dcimg/i.test(a.href) && !/gall.dcinside.com.bgsmsylytb.?$/i.test(a.href)).length,
        };
      })()`);
      if (!r) { problems.push(`${where}: 페이지를 읽지 못했어요`); continue; }
      r.errors.forEach((x) => problems.push(`${where}: 오류 → ${x}`));
      pageErrors.filter((x) => !/favicon|Failed to load resource/i.test(x)).forEach((x) => problems.push(`${where}: 콘솔 오류 → ${String(x).split('\n')[0]}`));
      if (r.tab !== tab) problems.push(`${where}: ${tab} 탭이 아니라 ${r.tab} 탭이 열렸어요`);
      if (r.theme !== want) problems.push(`${where}: 화면 모드가 ${want} 가 아니라 ${r.theme} 예요`);
      if (r.over > 1) problems.push(`${where}: 화면이 가로로 ${r.over}px 넘쳐요 ${r.wide.join(', ')}`);
      if (r.empty) problems.push(`${where}: 내용이 거의 비었어요`);
      if (r.broken) problems.push(`${where}: 그리지 못한 부분 ${r.broken}곳`);
      if (r.dc) problems.push(`${where}: 디시 링크 ${r.dc}개`);
    }
    // 관리자 모드 잠금 화면 (…/admin/, 로그인 안 한 상태)
    {
      runs++;
      const where = `관리자 잠금 · ${size.name} · ${{ light: '라이트', dark: '다크', 'auto-dark': '자동(기기 다크)' }[theme]}`;
      pageErrors.length = 0;
      await send('Page.navigate', { url: `${BASE}admin/?check=${Date.now()}` });
      await sleep(1200);
      const r = await evaluate(`(() => { try { localStorage.removeItem('rs-admin-ticket'); } catch (e) {} return {
        theme: document.documentElement.dataset.theme,
        over: document.documentElement.scrollWidth - innerWidth,
        lock: !!document.querySelector('.adm-lock input[type="password"]') || !!document.querySelector('.adm-lock'),
      }; })()`);
      if (!r) problems.push(`${where}: 페이지를 읽지 못했어요`);
      else {
        pageErrors.filter((x) => !/favicon|Failed to load resource/i.test(x)).forEach((x) => problems.push(`${where}: 콘솔 오류 → ${String(x).split('\n')[0]}`));
        if (r.theme !== want) problems.push(`${where}: 화면 모드가 ${want} 가 아니라 ${r.theme} 예요`);
        if (r.over > 1) problems.push(`${where}: 화면이 가로로 ${r.over}px 넘쳐요`);
        if (!r.lock) problems.push(`${where}: 잠금 화면이 안 보여요`);
      }
    }
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: boot.identifier });
  }
}
proc.kill();
try { rmSync(dir, { recursive: true, force: true }); } catch (e) { /* 남아도 괜찮아요 */ }
if (problems.length) {
  console.log(`✗ 문제 ${problems.length}개 (${runs}개 화면 확인)`);
  [...new Set(problems)].forEach((p) => console.log('  - ' + p));
  process.exit(1);
}
console.log(`✓ 문제 없음 (${runs}개 화면 확인: (탭 ${TABS.length} + 관리자 잠금 1) × 폭 ${SIZES.length} × 모드 ${THEMES.length} — 라이트 · 다크 · 자동)`);
