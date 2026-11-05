// 공유 미리보기 그림(1200×630)을 탭마다 만들어요: icons/og.png(오늘) · og-music.png · og-schedule.png · og-calendar.png · og-alliances.png
// 앱 아이콘 PNG(icon-512 · 192 · 180 · 32)도 icons/icon.svg 에서 같이 만들어요. 색을 바꿀 땐 icon.svg 와 아래 ACC 만 고치면 돼요.
// 쓰는 법 (사이트 폴더에서):  node tools/build_og.mjs
// 글이나 모양을 바꾸고 싶으면 아래 TABS를 고치고 다시 실행해요. 탭 페이지의 og:image 연결은 tools/build_pages.py가 해요.
// 필요한 것: Node 22 이상, Edge 또는 Chrome. 글꼴은 Pretendard(인터넷), 안 되면 맑은 고딕.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const exe = BROWSERS.find((p) => existsSync(p));
if (!exe) { console.error('Edge나 Chrome을 찾지 못했어요.'); process.exit(2); }

// 그림 속 색 (사이트 막대와 같은 방식: 옅은 바탕 + 진한 색)
const ACC = '#6a55d6'; // 사이트 포인트 색 (style.css --accent, B안 라벤더)
const C = { blue: '#2a6fb0', pink: '#b8336a', green: '#2f8a5b', purple: '#7a55c2', orange: '#c2671f', grey: '#6b7280' };
const pill = (c, w, txt = '') => `<i class="pill" style="--c:${c};width:${w}px">${txt}</i>`;

// 탭마다 다른 오른쪽 그림
const ART = {
  today: () => `<div class="list">${[
    [1, C.blue, 230], [1, C.pink, 190], [0, C.green, 250], [0, C.purple, 170],
  ].map(([on, c, w]) => `<div class="row"><b class="chk${on ? ' on' : ''}"></b><span><i style="width:${w}px"></i><i class="sub" style="width:${w * 0.55}px;--c:${c}"></i></span></div>`).join('')}</div>`,
  music: () => {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const bars = { 1: [C.purple], 2: [C.green, C.blue], 3: [C.pink], 4: [C.orange], 5: [C.blue, C.pink], 6: [C.green] };
    return `<div class="week">${days.map((d, i) => `<div class="col"><em class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</em>${(bars[i] || []).map((c) => `<i class="blk" style="--c:${c}"></i>`).join('')}</div>`).join('')}</div>`;
  },
  schedule: () => {
    const cells = [];
    const ev = { 3: [C.green], 6: [C.blue, C.pink], 9: [C.green], 12: [C.purple], 13: [C.pink], 17: [C.orange], 20: [C.blue] };
    for (let i = 0; i < 21; i++) {
      cells.push(`<div class="cell${i === 6 ? ' sel' : ''}"><em class="${i % 7 === 0 ? 'sun' : i % 7 === 6 ? 'sat' : ''}">${i + 1}</em>${(ev[i] || []).map((c) => pill(c, 38)).join('')}</div>`);
    }
    return `<div class="month">${cells.join('')}</div>`;
  },
  calendar: () => `<div class="gantt">${[
    [0, 70, C.blue], [12, 50, C.pink], [30, 60, C.green], [5, 35, C.purple], [45, 50, C.orange], [20, 75, C.grey],
  ].map(([l, w, c]) => `<div class="lane"><i class="bar" style="--c:${c};left:${l}%;width:${w}%"></i></div>`).join('')}<div class="now"></div></div>`,
  alliances: () => `<div class="tiles">${[C.blue, C.pink, C.green, C.purple, C.orange, C.grey, C.green, C.blue, C.pink]
    .map((c) => `<div class="tile"><b style="--c:${c}"></b><i></i></div>`).join('')}</div>`,
};

const TABS = [
  { slug: 'today', file: 'og.png', title: '리센느<br>오늘의 할일', brand: false, sub: '연합 투표·스밍 할 일 · 음방 · 일정' },
  { slug: 'music', file: 'og-music.png', title: '음악방송', sub: '음방 사전투표 · 실시간 투표 방법' },
  { slug: 'schedule', file: 'og-schedule.png', title: '리센느 일정', sub: 'Mnet Plus · blip 일정을 달력으로' },
  { slug: 'calendar', file: 'og-calendar.png', title: '연합 일정', sub: '연합 투표 기간표 · 달력' },
  { slug: 'alliances', file: 'og-alliances.png', title: '연합&amp;기타', sub: '연합 팀 · 투표·스밍 플랫폼 바로가기' },
];

const icon = readFileSync(join(ROOT, 'icons', 'icon.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

const page = (t) => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:#f3f1fb;font-family:'Pretendard Variable','Malgun Gothic',sans-serif;color:#191c22;padding:48px}
.card{position:relative;height:100%;background:#fff;border-radius:36px;padding:64px 72px;display:flex;gap:40px}
.left{flex:1;display:flex;flex-direction:column;min-width:0}
.brand{display:flex;align-items:center;gap:16px;font-size:26px;font-weight:700;color:#4b5160}
.brand svg{width:${t.brand === false ? 96 : 52}px;height:${t.brand === false ? 96 : 52}px;border-radius:${t.brand === false ? 24 : 13}px;flex:none}
h1{font-size:${t.brand === false ? 70 : 88}px;line-height:1.12;font-weight:800;letter-spacing:-.03em;margin-top:${t.brand === false ? 24 : 34}px}
.sub{margin-top:22px;font-size:30px;font-weight:600;color:#4b5160;letter-spacing:-.01em}
.foot{margin-top:auto;font-size:22px;color:#80858f}
.art{width:420px;flex:none;align-self:center}
em{font-style:normal}.sun{color:#d22030}.sat{color:#1f63c6}
.pill{display:block;height:14px;border-radius:4px;background:color-mix(in srgb,var(--c) 30%,#fff)}
/* 오늘 */
.list{display:flex;flex-direction:column;gap:14px}
.row{display:flex;align-items:center;gap:18px;padding:20px 22px;border-radius:18px;background:#f5f6f8}
.chk{width:34px;height:34px;border-radius:50%;border:3px solid #c7cad1;flex:none}
.chk.on{background:${ACC};border-color:${ACC};position:relative}
.chk.on::after{content:'';position:absolute;left:9px;top:4px;width:9px;height:16px;border:solid #fff;border-width:0 4px 4px 0;transform:rotate(45deg)}
.row span{display:flex;flex-direction:column;gap:9px}
.row i{display:block;height:14px;border-radius:7px;background:#3a3f4a}
.row i.sub{height:10px;margin:0;background:color-mix(in srgb,var(--c) 35%,#fff)}
.row:has(.on) i:first-child{background:#b9bdc6}
/* 음방 */
.week{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;background:#f5f6f8;border-radius:20px;padding:20px 16px}
.col{display:flex;flex-direction:column;gap:8px;align-items:stretch;min-height:250px}
.col em{text-align:center;font-size:22px;font-weight:700;margin-bottom:6px}
.blk{display:block;height:86px;border-radius:8px;background:color-mix(in srgb,var(--c) 18%,#fff);border-top:5px solid var(--c)}
/* 리센느 일정 */
.month{display:grid;grid-template-columns:repeat(7,1fr);border:2px solid #e6e8ec;border-radius:18px;overflow:hidden}
.cell{height:96px;padding:8px 5px;border-right:2px solid #eef0f3;border-bottom:2px solid #eef0f3;display:flex;flex-direction:column;gap:5px;align-items:center}
.cell:nth-child(7n){border-right:0}.cell:nth-last-child(-n+7){border-bottom:0}
.cell em{font-size:19px;font-weight:700}
.cell.sel{background:#f3f4f6}.cell.sel em{color:#fff;background:${ACC};border-radius:50%;width:30px;height:30px;line-height:30px;text-align:center}
.cell .pill{width:100%!important}
/* 연합 일정 */
.gantt{position:relative;display:flex;flex-direction:column;gap:16px;padding:24px;background:#f5f6f8;border-radius:20px}
.lane{position:relative;height:34px}
.bar{position:absolute;top:0;bottom:0;border-radius:9px;background:color-mix(in srgb,var(--c) 20%,#fff);border-left:6px solid var(--c)}
.now{position:absolute;top:12px;bottom:12px;left:55%;width:3px;background:${ACC};border-radius:2px}
/* 연합&기타 */
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.tile{height:110px;border-radius:20px;background:#f5f6f8;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px}
.tile b{width:44px;height:44px;border-radius:13px;background:color-mix(in srgb,var(--c) 22%,#fff);border:3px solid var(--c)}
.tile i{width:60px;height:10px;border-radius:5px;background:#c7cad1}
</style></head><body><div class="card">
<div class="left">
  <div class="brand">${icon}${t.brand === false ? '' : '<span>리센느 오늘의 할일</span>'}</div>
  <h1>${t.title}</h1>
  <p class="sub">${t.sub}</p>
  <p class="foot">팬 제작 비공식 도구</p>
</div>
<div class="art">${ART[t.slug]()}</div>
</div></body></html>`;

const tmp = mkdtempSync(join(tmpdir(), 'rs-og-'));
try {
  for (const t of TABS) {
    const html = join(tmp, t.slug + '.html');
    writeFileSync(html, page(t));
    const out = join(ROOT, 'icons', t.file);
    const r = spawnSync(exe, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--user-data-dir=${join(tmp, 'prof')}`, '--window-size=1200,630', '--virtual-time-budget=8000',
      `--screenshot=${out}`, pathToFileURL(html).href], { encoding: 'utf8' });
    if (r.status !== 0 || !existsSync(out)) { console.error(`✗ ${t.file} 못 만듦\n${r.stderr}`); process.exit(1); }
    const b = readFileSync(out);
    console.log(`${t.file} 만듦 (${b.readUInt32BE(16)}×${b.readUInt32BE(20)})`);
  }
  // 앱 아이콘: icon.svg 를 크기마다 꽉 차게 찍어요
  for (const n of [512, 192, 180, 32]) {
    const html = join(tmp, `icon-${n}.html`);
    writeFileSync(html, `<!doctype html><style>*{margin:0}html,body{width:${n}px;height:${n}px;overflow:hidden}svg{display:block;width:${n}px;height:${n}px}</style>${icon}`);
    const out = join(ROOT, 'icons', `icon-${n}.png`);
    const r = spawnSync(exe, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--user-data-dir=${join(tmp, 'prof')}`, `--window-size=${n},${n}`, `--screenshot=${out}`, pathToFileURL(html).href], { encoding: 'utf8' });
    if (r.status !== 0 || !existsSync(out)) { console.error(`✗ icon-${n}.png 못 만듦
${r.stderr}`); process.exit(1); }
    const b = readFileSync(out);
    if (b.readUInt32BE(16) !== n || b.readUInt32BE(20) !== n) { console.error(`✗ icon-${n}.png 크기가 ${b.readUInt32BE(16)}×${b.readUInt32BE(20)} 예요`); process.exit(1); }
    console.log(`icon-${n}.png 만듦`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
