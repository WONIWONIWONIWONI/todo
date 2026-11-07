// 관리자 모드 저장 서버 (Cloudflare Workers).
// 비밀번호를 확인하고, 숨겨 둔 GitHub 토큰으로 자료 파일 14개만 읽고 고치고, 공지 받기(x-inbox.yml)를 실행해요.
// 비밀값은 코드에 없고 Cloudflare에 저장해요: GH_TOKEN · ADMIN_PASSWORD · SIGN_KEY (wrangler secret put)
// 저장하면 커밋 메시지가 "관리자:"로 시작하고, GitHub Actions(admin-save.yml)가 검사하고 사이트에 올려요.

import { DurableObject } from 'cloudflare:workers';

const REPO = 'WONIWONIWONIWONI/todo';
const BRANCH = 'main';
const WORKFLOW = 'admin-save.yml';
// 자동으로 도는 작업 4개. 관리자 모드에서 하나씩 · 한꺼번에 직접 실행할 수도 있어요 (POST /crawl {job})
const JOBS = { crawl: 'x-inbox.yml', blip: 'blip.yml', onair: 'onair.yml', health: 'health.yml' };
// GitHub 예약 실행은 무료 저장소에서 몇 시간씩 밀려서, 워커가 10분마다(wrangler.toml crons) 실행 버튼을 대신 눌러요.
// 시각은 UTC. 워크플로의 schedule 은 예비로 남겨 둠 (겹치면 concurrency 로 차례 기다림)
export function due(d) {
  const m = d.getUTCMinutes(), h = d.getUTCHours();
  return [
    JOBS.crawl,                                         // 음총팀 X 공지: 10분마다
    ...(m % 30 === 0 ? [JOBS.blip] : []),               // blip 일정: 30분마다
    ...(m === 20 && h % 3 === 0 ? [JOBS.onair] : []),   // 음방 편성표 · 출연진: 3시간마다
    ...(m === 10 && h === 5 ? [JOBS.health] : []),      // 자료 점검: 하루 한 번 (한국 14:10)
  ];
}
const FILES = [
  'sheet-templates/할일.csv',
  'sheet-templates/연합.csv',
  'sheet-templates/음방.csv',
  'sheet-templates/음방달력.csv',
  'sheet-templates/음방안내.csv',
  'sheet-templates/음방정보.csv',
  'sheet-templates/투표앱.csv',
  'sheet-templates/투표종류.csv',
  'sheet-templates/색묶음.csv',
  'sheet-templates/뮤직웨이브.csv',
  'sheet-templates/가이드.csv',
  'data/weekly.json',
  'data/notice.json',
  'data/inbox.json',
];
const ORIGINS = ['https://woniwoniwoniwoni.github.io'];
const LOCAL = /^http:\/\/localhost:\d+$/; // 이 PC에서 미리보기할 때
const DAYS = 30;

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hmac(key, text) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
}
// 길이가 같은 문자열을 끝까지 비교 (맞는 글자 수로 시간이 달라지지 않게)
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function makeTicket(env) {
  const exp = Date.now() + DAYS * 864e5;
  return `${exp}.${await hmac(env.SIGN_KEY, 'ticket:' + exp)}`;
}
async function ticketOk(env, req) {
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const [exp, sig] = t.split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  return same(sig, await hmac(env.SIGN_KEY, 'ticket:' + exp));
}

const b64encode = (text) => { let s = ''; for (const b of enc.encode(text)) s += String.fromCharCode(b); return btoa(s); };
const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

// ---------- 새 공지 알림 (웹 푸시) ----------
// 관리자 홈 화면 앱(admin/)이 "알림 켜기"로 구독하면 여기 저장해요. 10분마다 받은 공지에 새 글이 들어왔으면 알려요.
// 내용 없는 푸시만 보내요 (암호화가 필요 없음). 알림 글은 admin/sw.js 가 공개 data/inbox.json 을 읽어 만들어요.
// 알림 열쇠(VAPID)는 처음 쓸 때 여기서 만들어 저장해요 → 따로 넣을 비밀값 없음
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const SITE = 'https://woniwoniwoniwoni.github.io/todo/';

export class PushStore extends DurableObject {
  async keys() {
    let k = await this.ctx.storage.get('vapid');
    if (!k) {
      const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      k = { jwk: await crypto.subtle.exportKey('jwk', pair.privateKey), pub: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)) };
      await this.ctx.storage.put('vapid', k);
    }
    return k;
  }
  async add(sub) { await this.ctx.storage.put('sub:' + sub.endpoint, sub); }
  async remove(endpoint) { await this.ctx.storage.delete('sub:' + endpoint); }
  async subs() { return [...(await this.ctx.storage.list({ prefix: 'sub:' })).values()]; }
}
const store = (env) => env.PUSH.get(env.PUSH.idFromName('main'));

// 구독한 기기마다 내용 없는 푸시 하나씩. 없어진 구독(404 · 410)은 지워요. 보낸 수를 돌려줘요
async function pushAll(env) {
  const db = store(env);
  const { jwk, pub } = await db.keys();
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  let sent = 0;
  for (const sub of await db.subs()) {
    const aud = new URL(sub.endpoint).origin;
    const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const body = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SITE })));
    const sig = b64url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body)));
    const r = await fetch(sub.endpoint, { method: 'POST', headers: { TTL: '21600', Urgency: 'high', Authorization: `vapid t=${head}.${body}.${sig}, k=${pub}` } });
    if (r.status === 404 || r.status === 410) await db.remove(sub.endpoint);
    else if (r.ok) sent++;
    else console.log('알림 못 보냄', aud, r.status);
  }
  return sent;
}

// 받은 공지(inbox.json)의 updated(새 글이 들어온 한국 시각, 분 단위)가 지난 10분 칸 [t-10분, t) 에 있으면 새 글 → 알림
// 칸이 겹치지 않아서 같은 새 글로 두 번 알리지 않아요 (따로 기억할 것 없음)
export function fresh(updated, t) {
  const at = Date.parse((updated || '') + ':00+09:00');
  return at >= t - 10 * 60e3 && at < t;
}

function gh(env, path, init = {}) {
  return fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'rescene-admin',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}
const contentsPath = (p) => `/contents/${p.split('/').map(encodeURIComponent).join('/')}`;

export default {
  async scheduled(event, env) {
    for (const wf of due(new Date(event.scheduledTime))) { // scheduledTime = 예약된 정각 (늦게 깨어나도 같음)
      const r = await gh(env, `/actions/workflows/${wf}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: BRANCH }) });
      if (!r.ok) console.log('실행 못 함', wf, r.status); // Cloudflare 대시보드 → 워커 → Logs 에서 보여요
    }
    // 10분 전에 누른 공지 받기가 새 글을 넣었으면 알림
    const r = await gh(env, `${contentsPath('data/inbox.json')}?ref=${BRANCH}`);
    if (!r.ok) { console.log('받은 공지 못 읽음', r.status); return; }
    const inbox = JSON.parse(b64decode((await r.json()).content));
    if (fresh(inbox.updated, event.scheduledTime)) console.log('새 공지 알림', await pushAll(env), '대');
  },

  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) || LOCAL.test(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      Vary: 'Origin',
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);

    try {
      if (url.pathname === '/login' && req.method === 'POST') {
        const ip = req.headers.get('CF-Connecting-IP') || 'local';
        if (env.LOGIN) {
          const { success } = await env.LOGIN.limit({ key: ip });
          if (!success) return json({ ok: false, err: 'limit' }, 429);
        }
        const { pw } = await req.json().catch(() => ({}));
        // 두 값을 같은 길이(HMAC)로 바꿔서 비교
        const ok = typeof pw === 'string' && pw.length > 0
          && same(await hmac(env.SIGN_KEY, 'pw:' + pw), await hmac(env.SIGN_KEY, 'pw:' + env.ADMIN_PASSWORD));
        return ok ? json({ ok: true, ticket: await makeTicket(env), days: DAYS }) : json({ ok: false, err: 'auth' }, 401);
      }

      if (!(await ticketOk(env, req))) return json({ ok: false, err: 'auth' }, 401);

      if (url.pathname === '/file' && req.method === 'GET') {
        const path = url.searchParams.get('path') || '';
        if (!FILES.includes(path)) return json({ ok: false, err: 'path' }, 400);
        const r = await gh(env, `${contentsPath(path)}?ref=${BRANCH}`);
        if (!r.ok) return json({ ok: false, err: 'github', status: r.status }, 502);
        const d = await r.json();
        return json({ ok: true, path, sha: d.sha, text: b64decode(d.content) });
      }

      if (url.pathname === '/file' && req.method === 'PUT') {
        const { path, sha, text, note } = await req.json().catch(() => ({}));
        if (!FILES.includes(path)) return json({ ok: false, err: 'path' }, 400);
        if (typeof text !== 'string' || !text.trim() || text.length > 500000 || typeof sha !== 'string') return json({ ok: false, err: 'body' }, 400);
        if (path.endsWith('.json')) { try { JSON.parse(text); } catch (e) { return json({ ok: false, err: 'body' }, 400); } }
        const name = path.split('/').pop();
        const msg = `관리자: ${name} ${String(note || '수정').replace(/\s+/g, ' ').slice(0, 80)}`;
        const r = await gh(env, contentsPath(path), {
          method: 'PUT',
          body: JSON.stringify({ message: msg, content: b64encode(text), sha, branch: BRANCH }),
        });
        // 그 사이에 다른 곳(예약 작업 · Claude)이 같은 파일을 고쳤으면 GitHub가 409로 막아요
        if (r.status === 409 || r.status === 422) return json({ ok: false, err: 'conflict' }, 409);
        if (!r.ok) return json({ ok: false, err: 'github', status: r.status }, 502);
        const d = await r.json();
        return json({ ok: true, sha: d.content.sha, commit: d.commit.sha });
      }

      // 자동 작업 하나를 지금 실행 (GitHub 토큰에 Actions 쓰기 권한 필요). job 이 없으면 공지 받기
      if (url.pathname === '/crawl' && req.method === 'POST') {
        const { job = 'crawl' } = await req.json().catch(() => ({}));
        if (!Object.hasOwn(JOBS, job)) return json({ ok: false, err: 'body' }, 400);
        const r = await gh(env, `/actions/workflows/${JOBS[job]}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: BRANCH }) });
        if (r.status === 403 || r.status === 404) return json({ ok: false, err: 'perm' }, 403);
        if (!r.ok) return json({ ok: false, err: 'github', status: r.status }, 502);
        return json({ ok: true });
      }

      // 진행 상황: ?commit=… (저장 뒤 admin-save) 또는 ?wf=작업&since=시각 (직접 실행한 자동 작업)
      if (url.pathname === '/status' && req.method === 'GET') {
        const commit = url.searchParams.get('commit') || '';
        const wf = Object.hasOwn(JOBS, url.searchParams.get('wf') || '') ? JOBS[url.searchParams.get('wf')] : '';
        const since = Date.parse(url.searchParams.get('since') || '') || 0;
        const r = await gh(env, `/actions/workflows/${wf || WORKFLOW}/runs?branch=${BRANCH}&per_page=10${wf ? '&event=workflow_dispatch' : ''}`);
        if (!r.ok) return json({ ok: false, err: 'github', status: r.status }, 502);
        const runs = (await r.json()).workflow_runs || [];
        const run = commit ? runs.find((x) => x.head_sha === commit) : runs.find((x) => Date.parse(x.created_at) >= since);
        if (!run) return json({ ok: true, state: 'waiting' });
        return json({ ok: true, state: run.status === 'completed' ? run.conclusion : run.status, url: run.html_url });
      }

      // 알림: 공개 열쇠 받기 · 이 기기 구독 · 구독 끊기 · 시험 알림
      if (url.pathname === '/push/key' && req.method === 'GET') return json({ ok: true, key: (await store(env).keys()).pub });
      if (url.pathname === '/push/sub' && req.method === 'POST') {
        const { sub, off } = await req.json().catch(() => ({}));
        const endpoint = sub && sub.endpoint;
        if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 1000) return json({ ok: false, err: 'body' }, 400);
        if (off) await store(env).remove(endpoint);
        else await store(env).add({ endpoint, keys: sub.keys || {} });
        return json({ ok: true });
      }
      if (url.pathname === '/push/test' && req.method === 'POST') return json({ ok: true, sent: await pushAll(env) });

      return json({ ok: false, err: 'notfound' }, 404);
    } catch (e) {
      return json({ ok: false, err: 'server' }, 500);
    }
  },
};
