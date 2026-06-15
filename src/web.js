// 🖥️  Web — a local control panel for AFAX. One zero-dependency HTTP server that
// serves a single-page app and a small JSON API:
//   GET  /                     the app (token injected)
//   GET  /api/state            business, provider, budget, collections, usage
//   GET  /api/config           flattened config (secrets masked)
//   POST /api/config           { path, value } → set + save
//   POST /api/chat             { text } → SSE stream of the same chat engine
//   POST /api/chat/reset       clear the conversation
//   GET  /api/data/:c          list a collection
//   POST /api/data/:c          add a record (JSON body)
//   PUT  /api/data/:c/:id       update a record
//   DEL  /api/data/:c/:id       delete a record
//   GET  /api/usage            spend totals + recent calls
// Binds to 127.0.0.1 by default and requires a per-session token on /api/* —
// it exposes API keys, the database and spends money, so it is local-only.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { load, save, activeProvider, hasLLM } from './config.js';
import { read, add, update, remove, COLLECTIONS } from './store.js';
import { snapshot } from './orchestrator.js';
import { monthTotals, allTotals, budgetState } from './usage.js';
import { PAGE } from './web.page.js';
import { c, header, ok, info, warn, log } from './logger.js';

const SECRET_RE = /(key|secret|token|pass)$/i;
const MASK = '__AFAX_SECRET_SET__';

// afax web [--port N] [--host H] [--token T]
export async function cmd(args) {
  const port = Number(args.port || 8788);
  const host = args.host || '127.0.0.1';
  const token = args.token || randomBytes(16).toString('hex');
  const messages = []; // single-user, in-memory conversation (like the CLI repl)

  header('🖥️  AFAX Web', 'Local control panel — chat, integrations, database');

  const server = createServer((req, res) => {
    handle(req, res, { token, messages }).catch((e) => {
      warn(`Handler error: ${e.message}`);
      send(res, 500, { error: e.message });
    });
  });

  server.listen(port, host, () => {
    const link = `http://${host}:${port}/?token=${token}`;
    ok(`Running on ${c.bold(`http://${host}:${port}`)}`);
    log('');
    info('Open this URL (token included):');
    log('  ' + c.cyan(link));
    log('');
    if (!hasLLM()) warn('No LLM configured — chat is disabled until you set a provider key in Integrations.');
    info(`Bound to ${host}. Use ${c.cyan('--host 0.0.0.0')} to expose it (not recommended — it holds your keys).`);
  });
  await new Promise(() => {}); // keep alive
}

async function handle(req, res, ctx) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  // App shell — token comes in via the query string, gets baked into the page.
  if (req.method === 'GET' && path === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(PAGE.replace('__TOKEN__', url.searchParams.get('token') || ''));
  }
  if (req.method === 'GET' && path === '/favicon.ico') return send(res, 204, {});

  if (!path.startsWith('/api/')) return send(res, 404, { error: 'not found' });

  // Auth gate for the whole API.
  const tok = req.headers['x-afax-token'] || url.searchParams.get('token');
  if (tok !== ctx.token) return send(res, 401, { error: 'unauthorized' });

  // ---- state ----
  if (path === '/api/state') {
    const cfg = load();
    const p = activeProvider(cfg);
    return send(res, 200, {
      business: cfg.business,
      workspace: cfg.workspace,
      provider: cfg.provider,
      model: p.model,
      live: cfg.live,
      autonomy: cfg.autonomy,
      budget: cfg.budget || { monthly: 0 },
      hasLLM: hasLLM(cfg),
      collections: COLLECTIONS,
      snapshot: snapshot(),
      usage: { month: monthTotals(), all: allTotals(), budget: budgetState(cfg) },
    });
  }

  // ---- config ----
  if (path === '/api/config' && req.method === 'GET') {
    return send(res, 200, { fields: flattenConfig(load()) });
  }
  if (path === '/api/config' && req.method === 'POST') {
    const { path: p, value } = await json(req);
    if (!p) return send(res, 400, { error: 'path required' });
    if (value === MASK) return send(res, 200, { ok: true, skipped: true }); // unchanged secret
    const cfg = load();
    setPath(cfg, p, coerce(value));
    save(cfg);
    return send(res, 200, { ok: true });
  }

  // ---- chat (SSE) ----
  if (path === '/api/chat' && req.method === 'POST') {
    const { text } = await json(req);
    if (!text) return send(res, 400, { error: 'text required' });
    if (!hasLLM()) return send(res, 400, { error: 'No LLM configured.' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const { chatTurn } = await import('./chat.js');
    const emit = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    try {
      await chatTurn(ctx.messages, text, { onEvent: emit });
    } catch (e) {
      emit({ type: 'error', message: e.message });
    }
    return res.end();
  }
  if (path === '/api/chat/reset' && req.method === 'POST') {
    ctx.messages.length = 0;
    return send(res, 200, { ok: true });
  }

  // ---- usage ----
  if (path === '/api/usage') {
    return send(res, 200, {
      month: monthTotals(),
      all: allTotals(),
      budget: budgetState(),
      recent: read('usage', []).slice(-25).reverse(),
    });
  }

  // ---- database CRUD ----
  const dm = path.match(/^\/api\/data\/([a-z_]+)(?:\/([^/]+))?$/);
  if (dm) {
    const [, name, id] = dm;
    if (!COLLECTIONS.includes(name)) return send(res, 404, { error: 'unknown collection' });
    if (req.method === 'GET') {
      const all = read(name, []).slice().reverse(); // newest first
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
// Turn the editable parts of config into [{ path, value, secret }] for a form.
function flattenConfig(cfg) {
  const out = [];
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p);
      else {
        const secret = SECRET_RE.test(k);
        out.push({ path: p, value: secret && v ? MASK : v, secret });
      }
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
