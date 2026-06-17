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
import { existsSync, statSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, join, extname } from 'node:path';
import { load, save, activeProvider, hasLLM } from './config.js';
import { read, add, update, remove, COLLECTIONS, AFAX_HOME } from './store.js';
import { snapshot } from './orchestrator.js';
import { monthTotals, allTotals, budgetState } from './usage.js';
import { c, header, ok, info, warn, err, log } from './logger.js';

// The control-panel SPA — kept as a plain .html so its client script can use
// template literals freely (read once at startup).
const PAGE = readFileSync(new URL('./web.page.html', import.meta.url), 'utf8');

const SECRET_RE = /(key|secret|token|pass)$/i;
const MASK = '__AFAX_SECRET_SET__';
const COOKIE = 'afax_auth';
const ASSET_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
};

// afax web [--port N] [--host H] [--token T]
export async function cmd(args) {
  const port = Number(process.env.PORT || args.port || 8788);
  const host = args.host || process.env.AFAX_WEB_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
  const isPublic = host !== '127.0.0.1' && host !== 'localhost' && host !== '::1';

  const envToken = process.env.AFAX_WEB_TOKEN || args.token;
  // Optional username + password auth (env or flags). When set, the login screen
  // accepts these credentials too — handy for a human signing in without copying
  // a long token. The token path stays available for CLI/automation.
  const user = process.env.AFAX_WEB_USER || args.user || '';
  const pass = process.env.AFAX_WEB_PASS || args.pass || '';
  const hasCreds = !!(user && pass);
  if (isPublic && !envToken && !hasCreds) {
    err('Refusing to expose the panel on a public host without authentication.');
    info('Set a strong secret first:  ' + c.cyan('export AFAX_WEB_TOKEN=$(openssl rand -hex 24)'));
    info('…or set credentials:  ' + c.cyan('export AFAX_WEB_USER=you AFAX_WEB_PASS=<strong-password>'));
    info('Or bind locally:  ' + c.cyan('afax web --host 127.0.0.1'));
    process.exitCode = 1;
    return;
  }
  if (isPublic && envToken && String(envToken).length < 16) {
    warn('AFAX_WEB_TOKEN is short — use at least 24 random chars for a public deploy.');
  }
  if (isPublic && hasCreds && String(pass).length < 10) {
    warn('AFAX_WEB_PASS is short — use a long, random password for a public deploy.');
  }
  // The session cookie always carries this token; credentials are just another
  // way to obtain it at login.
  const token = envToken || randomBytes(24).toString('hex');
  const cloud = !!args.cloud || !!args.serve; // `--serve` makes the panel also handle inbound webhooks
  const ctx = { token, user, pass, hasCreds, messages: [], cloud, conversationId: null, autoApprove: false };

  header(cloud ? '☁️  AFAX Cloud' : '🖥️  AFAX Web', cloud ? 'Always-on company — panel · inbound · autonomy' : (isPublic ? 'Cloud control panel' : 'Local control panel'));

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
      info('Open the panel and log in with your ' + c.bold(hasCreds ? 'username + password' : 'AFAX_WEB_TOKEN') + '.');
      info('Put this behind HTTPS (Railway/Caddy/Cloudflare do TLS for you).');
    } else if (!envToken && !hasCreds) {
      info('One-time login link (token included, local only):');
      log('  ' + c.cyan(`http://${host}:${port}/?token=${token}`));
    } else if (hasCreds) {
      info('Log in with your configured ' + c.bold('username + password') + '.');
    }
    if (cloud) {
      info('Cloud mode: inbound webhooks (' + c.cyan('/webhook/*') + ', ' + c.cyan('/inbound/email') + ') + asset hosting are served on this same port.');
    } else {
      info('Panel only. For inbound webhooks on the same process, run ' + c.cyan('afax cloud') + ' (or ' + c.cyan('afax web --serve') + ').');
    }
    if (!hasLLM()) warn('No LLM configured — chat is disabled until you set a provider key in Integrations.');
    if (cloud) startHeartbeat();
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

// In cloud mode, the company keeps producing on its own: periodically fire any
// due scheduled work (the autonomous heartbeat) so the business runs even while
// the user's laptop is off. Interval in minutes via AFAX_CLOUD_INTERVAL.
function startHeartbeat() {
  const minutes = Math.max(1, Number(process.env.AFAX_CLOUD_INTERVAL) || 10);
  info(`Autonomy heartbeat: running due scheduled work every ${minutes} min.`);
  const tick = async () => {
    try {
      const { dispatch } = await import('./cli.js');
      await dispatch(['schedule', 'run']);
    } catch (e) {
      warn(`Heartbeat: ${e.message}`);
    }
  };
  setInterval(tick, minutes * 60000);
}

async function handle(req, res, ctx) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  // Cloud mode also serves the inbound side (webhooks, asset hosting) on the
  // same port — Telegram/WhatsApp/Stripe/email + generated-image hosting.
  if (ctx.cloud && /^\/(webhook|inbound|assets)\b/.test(path)) {
    const { handle: inbound } = await import('./server.js');
    return inbound(req, res);
  }

  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);

  // Unauthenticated liveness for platform health checks.
  if (req.method === 'GET' && path === '/healthz') return send(res, 200, { ok: true });
  if (req.method === 'GET' && path === '/favicon.ico') return send(res, 204, {});

  // Login / logout. Accept either the shared token, or username + password when
  // credentials are configured. Both grant the same session cookie.
  if (path === '/api/login' && req.method === 'POST') {
    const { token, username, password } = await json(req);
    const tokenOk = token != null && constantEq(token, ctx.token);
    const credsOk = ctx.hasCreds && username != null && password != null &&
      constantEq(username, ctx.user) && constantEq(password, ctx.pass);
    if (!tokenOk && !credsOk) {
      await sleep(400 + Math.random() * 200); // throttle brute force
      return send(res, 401, { error: 'invalid credentials' });
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
    return res.end(authed(req, ctx) ? PAGE : loginPage(ctx.hasCreds));
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
    ctx.messages.length = 0; ctx.conversationId = null; // fresh conversation for the new company
    return send(res, 200, { ok: true, workspaces: summary() });
  }
  if (path === '/api/workspaces/use' && req.method === 'POST') {
    const { slug } = await json(req);
    const { useWorkspace, summary } = await import('./workspace.js');
    useWorkspace(String(slug || ''));
    ctx.messages.length = 0; ctx.conversationId = null;
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
    const { CATALOG, isConnected, getPath, GROUPS, GROUP_ORDER } = await import('./integrations/catalog.js');
    const { providersStatus } = await import('./integrations/oauth.js');
    const cfg = load();
    const oauth = providersStatus();
    return send(res, 200, {
      groupOrder: GROUP_ORDER,
      integrations: CATALOG.map((e) => ({
        key: e.key, label: e.label, kind: e.kind, get: e.get, group: GROUPS[e.key] || 'Other', connected: isConnected(e, cfg),
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
  // Live-test every connected integration at once — the "are my integrations
  // actually working?" health check.
  if (path === '/api/integrations/testall' && req.method === 'POST') {
    const { CATALOG, isConnected, runTest } = await import('./integrations/catalog.js');
    const cfg = load();
    const connected = CATALOG.filter((e) => isConnected(e, cfg));
    const results = await Promise.all(connected.map(async (e) => ({ key: e.key, label: e.label, ...(await runTest(e.key)) })));
    return send(res, 200, { results });
  }

  if (path === '/api/chat' && req.method === 'POST') {
    const { text } = await json(req);
    if (!text) return send(res, 400, { error: 'text required' });
    if (!hasLLM()) return send(res, 400, { error: 'No LLM configured.' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const { chatTurn } = await import('./chat.js');
    const { saveConversation, newId } = await import('./conversations.js');
    if (!ctx.conversationId) ctx.conversationId = newId();
    // Stop generation when the client disconnects (the Stop button aborts the fetch).
    const ac = new AbortController();
    let finished = false;
    req.on('close', () => { if (!finished) ac.abort(); });
    const emit = (ev) => { try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch {} };
    // File writes / live sends are allowed only when Auto-approve is on for this session.
    const approve = async () => ctx.autoApprove === true;
    try { await chatTurn(ctx.messages, text, { onEvent: emit, signal: ac.signal, approve }); }
    catch (e) { if (!ac.signal.aborted && e.name !== 'AbortError') emit({ type: 'error', message: e.message }); }
    finished = true;
    try { saveConversation(ctx.conversationId, ctx.messages); } catch {}
    return res.end();
  }
  if (path === '/api/chat/reset' && req.method === 'POST') {
    ctx.messages.length = 0;
    ctx.conversationId = null; // next message starts a fresh, separately-stored conversation
    return send(res, 200, { ok: true });
  }
  if (path === '/api/chat/autoapprove' && req.method === 'POST') {
    const { on } = await json(req);
    ctx.autoApprove = !!on;
    return send(res, 200, { ok: true, autoApprove: ctx.autoApprove });
  }

  // ---- conversation history ----
  if (path === '/api/conversations' && req.method === 'GET') {
    const { listConversations } = await import('./conversations.js');
    return send(res, 200, { conversations: listConversations(), current: ctx.conversationId, autoApprove: ctx.autoApprove });
  }
  const cv = path.match(/^\/api\/conversations\/([A-Za-z0-9]+)$/);
  if (cv) {
    const { getConversation, deleteConversation } = await import('./conversations.js');
    if (req.method === 'GET') {
      const conv = getConversation(cv[1]);
      if (!conv) return send(res, 404, { error: 'not found' });
      ctx.messages.length = 0;
      for (const m of conv.messages) ctx.messages.push(m);
      ctx.conversationId = conv.id;
      return send(res, 200, { id: conv.id, title: conv.title, messages: conv.messages });
    }
    if (req.method === 'DELETE') {
      const removed = deleteConversation(cv[1]);
      if (ctx.conversationId === cv[1]) { ctx.messages.length = 0; ctx.conversationId = null; }
      return send(res, 200, { removed });
    }
  }

  if (path === '/api/usage') {
    // 14-day buckets of call counts, oldest→newest, for the chart.
    const today = new Date();
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({ day: d.toISOString().slice(0, 10), count: 0 });
    }
    const idx = Object.fromEntries(days.map((b, i) => [b.day, i]));
    for (const r of read('usage', [])) {
      const k = (r.createdAt || '').slice(0, 10);
      if (k in idx) days[idx[k]].count++;
    }
    return send(res, 200, { month: monthTotals(), all: allTotals(), budget: budgetState(), recent: read('usage', []).slice(-25).reverse(), daily: days });
  }

  // ---- generated content: list with previewable files ----
  if (path === '/api/content' && req.method === 'GET') {
    const base = resolve(AFAX_HOME);
    const items = read('content', []).slice().reverse().slice(0, 80).map((r) => {
      let files = [];
      if (r.path) {
        try {
          const st = statSync(r.path);
          if (st.isDirectory()) files = readdirSync(r.path).map((f) => join(r.path, f));
          else files = [r.path];
        } catch {}
      }
      files = files
        .filter((f) => { try { return statSync(f).isFile(); } catch { return false; } })
        .map((f) => relative(base, f));
      return { id: r.id, format: r.format, topic: r.topic, createdAt: r.createdAt, body: r.body || '', files };
    });
    return send(res, 200, { items });
  }

  // ---- serve a file from AFAX_HOME (assets/library) for previews ----
  if (path === '/api/asset' && req.method === 'GET') {
    const base = resolve(AFAX_HOME);
    const abs = resolve(base, url.searchParams.get('path') || '');
    if (abs !== base && !abs.startsWith(base + '/')) return send(res, 403, { error: 'forbidden' }); // path containment
    if (!existsSync(abs) || !statSync(abs).isFile()) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': ASSET_MIME[extname(abs).toLowerCase()] || 'application/octet-stream', 'cache-control': 'private, max-age=120' });
    return res.end(readFileSync(abs));
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
// Renders a token field, or username + password fields when credentials are
// configured (AFAX_WEB_USER / AFAX_WEB_PASS).
function loginPage(hasCreds) {
  const fields = hasCreds
    ? `<label for="u">Username</label>
       <input id="u" type="text" placeholder="username" autocomplete="username" autofocus>
       <label for="p" style="margin-top:14px">Password</label>
       <input id="p" type="password" placeholder="password" autocomplete="current-password">`
    : `<label for="t">Access token</label>
       <input id="t" type="password" placeholder="AFAX_WEB_TOKEN" autocomplete="current-password" autofocus>`;
  const submitScript = hasCreds
    ? `body:JSON.stringify({username:document.getElementById("u").value,password:document.getElementById("p").value})`
    : `body:JSON.stringify({token:document.getElementById("t").value})`;
  const errMsg = hasCreds ? 'Invalid username or password.' : 'Invalid token. Check AFAX_WEB_TOKEN.';
  return LOGIN_TEMPLATE.replace('%%FIELDS%%', fields).replace('%%BODY%%', submitScript).replace('%%ERR%%', errMsg);
}

const LOGIN_TEMPLATE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>AFAX — sign in</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>
  :root{--bg:#0b0a09;--bg-2:#131110;--bg-3:#1a1715;--line:rgba(255,255,255,.07);--line-2:rgba(255,255,255,.13);--ink:#f4f1ed;--ink-3:#79726a;--accent:#ff6a1a;--accent-2:#ff8c45;--accent-soft:rgba(255,106,26,.13);--accent-line:rgba(255,106,26,.34);--red:#ff7a8a;--mono:'JetBrains Mono',ui-monospace,monospace}
  *{box-sizing:border-box}
  body{margin:0;height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font-family:'Inter',system-ui,sans-serif;overflow:hidden}
  .glow{position:fixed;inset:0;pointer-events:none}
  .glow::before{content:"";position:absolute;top:-25%;right:-10%;width:55vw;height:55vw;background:radial-gradient(circle,rgba(255,106,26,.18),transparent 60%);filter:blur(20px)}
  .glow::after{content:"";position:absolute;bottom:-25%;left:12%;width:42vw;height:42vw;background:radial-gradient(circle,rgba(255,106,26,.06),transparent 62%)}
  .wrap{position:relative;z-index:1;width:360px;max-width:92vw}
  .brand{display:flex;align-items:center;justify-content:center;gap:11px;margin-bottom:22px}
  .mark{display:flex;flex-direction:column;gap:3px}
  .mark span{display:block;height:3px;border-radius:2px;background:var(--accent)}
  .mark span:nth-child(1){width:24px}.mark span:nth-child(2){width:24px;opacity:.8}.mark span:nth-child(3){width:15px;opacity:.55}
  .brand b{font-size:22px;font-weight:800;letter-spacing:.06em}
  form{background:linear-gradient(180deg,var(--bg-2),var(--bg));border:1px solid var(--line-2);border-radius:18px;padding:26px;box-shadow:0 30px 80px -30px #000,0 0 60px -34px rgba(255,106,26,.6)}
  h1{font-size:17px;font-weight:700;margin:0 0 5px;text-align:center}
  p{color:var(--ink-3);font-size:13px;margin:0 0 20px;text-align:center}
  label{display:block;font:600 11px/1 var(--mono);color:var(--ink-3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
  input{width:100%;padding:12px 14px;background:var(--bg-3);border:1px solid var(--line-2);color:var(--ink);border-radius:11px;font:inherit;font-size:14px;transition:.15s}
  input:focus{outline:none;border-color:var(--accent-line);box-shadow:0 0 0 3px var(--accent-soft)}
  button{width:100%;margin-top:16px;padding:13px;border:0;border-radius:11px;background:linear-gradient(180deg,var(--accent),#c24300);color:#1a0d00;font:inherit;font-weight:700;font-size:14px;cursor:pointer;transition:.15s;box-shadow:0 8px 22px -10px rgba(255,106,26,.7)}
  button:hover{filter:brightness(1.06)}
  .e{color:var(--red);font-size:12.5px;min-height:18px;margin-top:12px;text-align:center}
  .foot{text-align:center;color:var(--ink-3);font-size:12px;margin-top:18px}
</style></head><body>
<div class="glow"></div>
<div class="wrap">
  <div class="brand"><div class="mark"><span></span><span></span><span></span></div><b>AFAX</b></div>
  <form id="f">
    <h1>Welcome back</h1>
    <p>Your company on autopilot — sign in to continue.</p>
    %%FIELDS%%
    <button type="submit">Sign in</button>
    <div class="e" id="e"></div>
  </form>
  <div class="foot">Secure · local-first · open source</div>
</div>
<script>
document.getElementById("f").addEventListener("submit",function(ev){ev.preventDefault();
  var btn=document.querySelector("button"); btn.textContent="Signing in…"; btn.disabled=true;
  fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},%%BODY%%})
  .then(function(r){ if(r.ok){location.href="/";} else {document.getElementById("e").textContent="%%ERR%%"; btn.textContent="Sign in"; btn.disabled=false;}})
  .catch(function(){document.getElementById("e").textContent="Network error."; btn.textContent="Sign in"; btn.disabled=false;});
});
</script></body></html>`;
