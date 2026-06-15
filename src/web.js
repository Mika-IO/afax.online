// 🖥️  Web — the AFAX control panel + the deployable Cloud server.
//
//   GET  /healthz              unauthenticated liveness (for Railway/uptime)
//   GET  /                     login screen, or the app once authenticated
//   POST /api/login            { token } → sets an HttpOnly auth cookie
//   POST /api/logout           clears it
//   GET  /api/state            business, provider, budget, collections, usage
//   GET  /api/config           flattened config (secrets masked)
//   POST /api/config           { path, value } → set + save
//   POST /api/chat             { text } → SSE stream of the chat engine
//   POST /api/chat/reset       clear the conversation
//   GET  /api/data/:c          list (pagination + search)
//   POST/PUT/DELETE /api/data  add / update / delete a record
//   GET  /api/usage            spend totals + recent calls
//
// Auth: a single shared token. Locally it's auto-generated and printed; for a
// public deploy you MUST set AFAX_WEB_TOKEN (the server refuses to bind a public
// host without one). The token is sent as an HttpOnly+SameSite cookie (set via
// the login form) or an `x-afax-token` header (for CLI/automation) — never in
// the URL. Comparison is constant-time. This is a SINGLE-TENANT admin panel:
// whoever holds the token can run any AFAX command and read the workspace.
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { load, save, activeProvider, hasLLM } from './config.js';
import { read, add, update, remove, COLLECTIONS } from './store.js';
import { snapshot } from './orchestrator.js';
import { monthTotals, allTotals, budgetState } from './usage.js';
import { PAGE } from './web.page.js';
import { c, header, ok, info, warn, err, log } from './logger.js';

const SECRET_RE = /(key|secret|token|pass)$/i;
const MASK = '__AFAX_SECRET_SET__';
const COOKIE = 'afax_auth';

// afax web [--port N] [--host H] [--token T]
export async function cmd(args) {
  const port = Number(process.env.PORT || args.port || 8788);
  const host = args.host || process.env.AFAX_WEB_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
  const isPublic = host !== '127.0.0.1' && host !== 'localhost' && host !== '::1';

  const envToken = process.env.AFAX_WEB_TOKEN || args.token;
  if (isPublic && !envToken) {
    err('Refusing to expose the panel on a public host without an auth token.');
    info('Set a strong secret first:  ' + c.cyan('export AFAX_WEB_TOKEN=$(openssl rand -hex 24)'));
    info('Or bind locally:  ' + c.cyan('afax web --host 127.0.0.1'));
    process.exitCode = 1;
    return;
  }
  if (isPublic && String(envToken).length < 16) {
    warn('AFAX_WEB_TOKEN is short — use at least 24 random chars for a public deploy.');
  }
  const token = envToken || randomBytes(24).toString('hex');
  const ctx = { token, messages: [] };

  header('🖥️  AFAX Web', isPublic ? 'Cloud control panel' : 'Local control panel');

  const server = createServer((req, res) => {
    handle(req, res, ctx).catch((e) => {
      warn(`Handler error: ${e.message}`);
      send(res, 500, { error: 'internal error' });
    });
  });
  server.listen(port, host, () => {
    ok(`Running on ${c.bold(`http://${host}:${port}`)}`);
    log('');
    if (isPublic) {
      info('Open the panel and log in with your ' + c.bold('AFAX_WEB_TOKEN') + '.');
      info('Put this behind HTTPS (Railway/Caddy/Cloudflare do TLS for you).');
    } else if (!envToken) {
      info('One-time login link (token included, local only):');
      log('  ' + c.cyan(`http://${host}:${port}/?token=${token}`));
    }
    if (!hasLLM()) warn('No LLM configured — chat is disabled until you set a provider key in Integrations.');
  });
  await new Promise(() => {}); // keep alive
}

// ---- auth -------------------------------------------------------------------
function constantEq(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}
function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
const cookieToken = (req) => getCookie(req, COOKIE);
function oauthRedirect(req, provider) {
  const proto = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http');
  return `${proto}://${req.headers.host}/api/oauth/${provider}/callback`;
}
function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('location', location);
  res.end();
}
function authed(req, ctx) {
  const presented = req.headers['x-afax-token'] || cookieToken(req);
  return presented != null && constantEq(presented, ctx.token);
}
function secureFlag(req) {
  return req.headers['x-forwarded-proto'] === 'https' || req.socket?.encrypted ? '; Secure' : '';
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

async function handle(req, res, ctx) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  // Unauthenticated liveness for platform health checks.
  if (req.method === 'GET' && path === '/healthz') return send(res, 200, { ok: true });
  if (req.method === 'GET' && path === '/favicon.ico') return send(res, 204, {});

  // Login / logout.
  if (path === '/api/login' && req.method === 'POST') {
    const { token } = await json(req);
    if (!constantEq(token, ctx.token)) {
      await sleep(400 + Math.random() * 200); // throttle brute force
      return send(res, 401, { error: 'invalid token' });
    }
    res.setHeader('set-cookie', `${COOKIE}=${encodeURIComponent(ctx.token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secureFlag(req)}`);
    return send(res, 200, { ok: true });
  }
  if (path === '/api/logout' && req.method === 'POST') {
    res.setHeader('set-cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureFlag(req)}`);
    return send(res, 200, { ok: true });
  }

  // App shell: convenience — a one-time ?token= (local only) sets the cookie and
  // redirects to a clean URL so the token never lingers in history.
  if (req.method === 'GET' && path === '/') {
    const qToken = url.searchParams.get('token');
    if (qToken && constantEq(qToken, ctx.token)) {
      res.statusCode = 302;
      res.setHeader('set-cookie', `${COOKIE}=${encodeURIComponent(ctx.token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secureFlag(req)}`);
      res.setHeader('location', '/');
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(authed(req, ctx) ? PAGE : LOGIN);
  }

  // OAuth callback is a cross-site redirect from the provider — it can't carry
  // the Strict auth cookie, so it's gated by the state cookie (CSRF) instead.
  const cb = path.match(/^\/api\/oauth\/([a-z]+)\/callback$/);
  if (cb && req.method === 'GET') {
    const provider = cb[1];
    const state = getCookie(req, 'afax_oauth');
    res.setHeader('set-cookie', `afax_oauth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureFlag(req)}`);
    if (url.searchParams.get('error')) return redirect(res, '/?oauth=denied');
    if (!state || state !== url.searchParams.get('state')) return redirect(res, '/?oauth=badstate');
    try {
      const oauth = await import('./integrations/oauth.js');
      await oauth.exchange(provider, url.searchParams.get('code'), oauthRedirect(req, provider));
      return redirect(res, '/?oauth=ok');
    } catch (e) {
      warn(`OAuth ${provider}: ${e.message}`);
      return redirect(res, '/?oauth=fail');
    }
  }

  if (!path.startsWith('/api/')) return send(res, 404, { error: 'not found' });

  // Everything below requires auth.
  if (!authed(req, ctx)) return send(res, 401, { error: 'unauthorized' });

  // Begin an OAuth flow (authed): set the state cookie, redirect to the provider.
  const st = path.match(/^\/api\/oauth\/([a-z]+)\/start$/);
  if (st && req.method === 'GET') {
    const provider = st[1];
    const oauth = await import('./integrations/oauth.js');
    if (!oauth.isReady(provider)) {
      return send(res, 400, { error: `OAuth not configured for ${provider}. Set AFAX_OAUTH_${provider.toUpperCase()}_CLIENT_ID/SECRET.` });
    }
    const state = randomBytes(16).toString('hex');
    res.setHeader('set-cookie', `afax_oauth=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${secureFlag(req)}`);
    return redirect(res, oauth.authorizeUrl(provider, oauthRedirect(req, provider), state));
  }

  if (path === '/api/state') {
    const cfg = load();
    const p = activeProvider(cfg);
    return send(res, 200, {
      business: cfg.business, workspace: cfg.workspace, provider: cfg.provider, model: p.model,
      live: cfg.live, autonomy: cfg.autonomy, budget: cfg.budget || { monthly: 0 }, hasLLM: hasLLM(cfg),
      collections: COLLECTIONS, snapshot: snapshot(),
      usage: { month: monthTotals(), all: allTotals(), budget: budgetState(cfg) },
    });
  }

  // ---- workspaces (companies) ----
  if (path === '/api/workspaces' && req.method === 'GET') {
    const { summary } = await import('./workspace.js');
    return send(res, 200, { workspaces: summary() });
  }
  if (path === '/api/workspaces' && req.method === 'POST') {
    const { name } = await json(req);
    if (!name || !String(name).trim()) return send(res, 400, { error: 'name required' });
    const { createWorkspace, useWorkspace, summary } = await import('./workspace.js');
    createWorkspace(String(name).trim());
    useWorkspace(String(name).trim());
    ctx.messages.length = 0; // fresh conversation for the new company
    return send(res, 200, { ok: true, workspaces: summary() });
  }
  if (path === '/api/workspaces/use' && req.method === 'POST') {
    const { slug } = await json(req);
    const { useWorkspace, summary } = await import('./workspace.js');
    useWorkspace(String(slug || ''));
    ctx.messages.length = 0;
    return send(res, 200, { ok: true, workspaces: summary() });
  }

  if (path === '/api/config' && req.method === 'GET') {
    return send(res, 200, { fields: flattenConfig(load()) });
  }
  if (path === '/api/config' && req.method === 'POST') {
    const { path: p, value } = await json(req);
    if (!p) return send(res, 400, { error: 'path required' });
    if (value === MASK) return send(res, 200, { ok: true, skipped: true });
    const cfg = load();
    setPath(cfg, p, coerce(value));
    save(cfg);
    return send(res, 200, { ok: true });
  }

  if (path === '/api/integrations' && req.method === 'GET') {
    const { CATALOG, isConnected, getPath } = await import('./integrations/catalog.js');
    const { providersStatus } = await import('./integrations/oauth.js');
    const cfg = load();
    const oauth = providersStatus();
    return send(res, 200, {
      integrations: CATALOG.map((e) => ({
        key: e.key, label: e.label, kind: e.kind, get: e.get, connected: isConnected(e, cfg),
        oauth: oauth[e.key] || null,
        fields: e.fields.map((f) => ({ path: f.path, label: f.label, placeholder: f.placeholder || '', secret: !!f.secret, set: !!getPath(cfg, f.path) })),
      })),
    });
  }
  if (path === '/api/integrations/paste' && req.method === 'POST') {
    const { secret } = await json(req);
    const { paste } = await import('./integrations/catalog.js');
    return send(res, 200, await paste(String(secret || '')));
  }
  if (path === '/api/integrations/test' && req.method === 'POST') {
    const { key } = await json(req);
    const { runTest } = await import('./integrations/catalog.js');
    return send(res, 200, await runTest(key));
  }

  if (path === '/api/chat' && req.method === 'POST') {
    const { text } = await json(req);
    if (!text) return send(res, 400, { error: 'text required' });
    if (!hasLLM()) return send(res, 400, { error: 'No LLM configured.' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const { chatTurn } = await import('./chat.js');
    const emit = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    try { await chatTurn(ctx.messages, text, { onEvent: emit }); }
    catch (e) { emit({ type: 'error', message: e.message }); }
    return res.end();
  }
  if (path === '/api/chat/reset' && req.method === 'POST') {
    ctx.messages.length = 0;
    return send(res, 200, { ok: true });
  }

  if (path === '/api/usage') {
    return send(res, 200, { month: monthTotals(), all: allTotals(), budget: budgetState(), recent: read('usage', []).slice(-25).reverse() });
  }

  const dm = path.match(/^\/api\/data\/([a-z_]+)(?:\/([^/]+))?$/);
  if (dm) {
    const [, name, id] = dm;
    if (!COLLECTIONS.includes(name)) return send(res, 404, { error: 'unknown collection' });
    if (req.method === 'GET') {
      const all = read(name, []).slice().reverse();
      const q = (url.searchParams.get('q') || '').toLowerCase().trim();
      const filtered = q ? all.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : all;
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 25, 1), 200);
      const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
      return send(res, 200, { records: filtered.slice(offset, offset + limit), total: filtered.length, limit, offset });
    }
    if (req.method === 'POST') return send(res, 200, { record: add(name, await json(req)) });
    if (req.method === 'PUT' && id) return send(res, 200, { record: update(name, id, await json(req)) });
    if (req.method === 'DELETE' && id) return send(res, 200, { removed: remove(name, id) });
  }

  send(res, 404, { error: 'not found' });
}

// ---- config flatten / set ---------------------------------------------------
function flattenConfig(cfg) {
  const out = [];
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p);
      else { const secret = SECRET_RE.test(k); out.push({ path: p, value: secret && v ? MASK : v, secret }); }
    }
  };
  walk({ provider: cfg.provider, autonomy: cfg.autonomy, live: cfg.live }, '');
  walk({ budget: cfg.budget || { monthly: 0 } }, '');
  walk({ business: cfg.business }, '');
  walk({ providers: cfg.providers }, '');
  walk({ integrations: cfg.integrations }, '');
  return out;
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  if (keys.includes('__proto__') || keys.includes('constructor') || keys.includes('prototype')) return; // prototype-pollution guard
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}
function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
  return v;
}

// ---- http helpers -----------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function json(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (chunk) => { buf += chunk; if (buf.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(buf || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}
function send(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// ---- login page -------------------------------------------------------------
const LOGIN = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>AFAX — sign in</title>
<style>
  body{margin:0;height:100vh;display:grid;place-items:center;background:#0a0b0e;color:#edeff3;
    font:15px/1.5 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif}
  form{background:#15171d;border:1px solid #23272f;border-radius:16px;padding:28px;width:320px;text-align:center;box-shadow:0 10px 34px -8px rgba(0,0,0,.55)}
  .b{color:#ff8a3d;font-weight:800;letter-spacing:2px;font-size:22px;margin-bottom:6px}
  p{color:#8c93a0;font-size:13px;margin:0 0 18px}
  input{width:100%;padding:11px 13px;background:#0a0b0e;border:1px solid #2d323b;color:#edeff3;border-radius:10px;font:inherit;margin-bottom:12px}
  input:focus{outline:none;border-color:#ff8a3d;box-shadow:0 0 0 3px rgba(255,138,61,.16)}
  button{width:100%;padding:11px;border:0;border-radius:10px;background:linear-gradient(180deg,#ff8a3d,#ff6a2b);color:#23120a;font:inherit;font-weight:700;cursor:pointer}
  .e{color:#f0564a;font-size:12px;min-height:16px;margin-top:10px}
</style></head><body>
<form id="f">
  <div class="b">&#9648;&#9648;&#9648; AFAX</div>
  <p>Enter your access token</p>
  <input id="t" type="password" placeholder="AFAX_WEB_TOKEN" autocomplete="current-password" autofocus>
  <button type="submit">Sign in</button>
  <div class="e" id="e"></div>
</form>
<script>
document.getElementById("f").addEventListener("submit",function(ev){ev.preventDefault();
  fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:document.getElementById("t").value})})
  .then(function(r){ if(r.ok){location.href="/";} else {document.getElementById("e").textContent="Invalid token.";}})
  .catch(function(){document.getElementById("e").textContent="Network error.";});
});
</script></body></html>`;
