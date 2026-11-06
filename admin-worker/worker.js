// 관리자 모드 저장 서버 (Cloudflare Workers).
// 비밀번호를 확인하고, 숨겨 둔 GitHub 토큰으로 자료 파일 7개만 읽고 고쳐요.
// 비밀값은 코드에 없고 Cloudflare에 저장해요: GH_TOKEN · ADMIN_PASSWORD · SIGN_KEY (wrangler secret put)
// 저장하면 커밋 메시지가 "관리자:"로 시작하고, GitHub Actions(admin-save.yml)가 검사하고 사이트에 올려요.

const REPO = 'WONIWONIWONIWONI/todo';
const BRANCH = 'main';
const WORKFLOW = 'admin-save.yml';
const FILES = [
  'sheet-templates/할일.csv',
  'sheet-templates/연합.csv',
  'sheet-templates/음방.csv',
  'sheet-templates/음방달력.csv',
  'sheet-templates/가이드.csv',
  'data/weekly.json',
  'data/notice.json',
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

      if (url.pathname === '/status' && req.method === 'GET') {
        const commit = url.searchParams.get('commit') || '';
        const r = await gh(env, `/actions/workflows/${WORKFLOW}/runs?branch=${BRANCH}&per_page=10`);
        if (!r.ok) return json({ ok: false, err: 'github', status: r.status }, 502);
        const runs = (await r.json()).workflow_runs || [];
        const run = commit ? runs.find((x) => x.head_sha === commit) : runs[0];
        if (!run) return json({ ok: true, state: 'waiting' });
        return json({ ok: true, state: run.status === 'completed' ? run.conclusion : run.status, url: run.html_url });
      }

      return json({ ok: false, err: 'notfound' }, 404);
    } catch (e) {
      return json({ ok: false, err: 'server' }, 500);
    }
  },
};
