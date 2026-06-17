// MCP client — talk to any Model Context Protocol server over Streamable HTTP
// (JSON-RPC 2.0). Zero deps. Used by `afax mcp tools|call` and the chat agent.
// Config: integrations.mcp.url + integrations.mcp.token.
import { integration } from '../config.js';

let session = null;   // Mcp-Session-Id once the server issues one
let inited = false;   // initialized handshake done

const cfg = () => integration('mcp');

export function status() {
  const m = cfg();
  return { connected: !!(m.url && m.token), url: m.url || '' };
}

async function rpc(method, params, notification = false) {
  const m = cfg();
  if (!m.url) throw new Error('MCP: missing url (set integrations.mcp.url).');
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  if (m.token) headers.authorization = `Bearer ${m.token}`;
  if (session) headers['mcp-session-id'] = session;
  const payload = { jsonrpc: '2.0', method, ...(params ? { params } : {}) };
  if (!notification) payload.id = Math.floor(Math.random() * 1e9);

  let res;
  try {
    res = await fetch(m.url, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new Error(`MCP request failed: ${e.message}`);
  }
  const sid = res.headers.get('mcp-session-id');
  if (sid) session = sid;
  if (notification) return null;

  const body = await res.text();
  if (!res.ok) throw new Error(`MCP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);

  // Response is either JSON or an SSE stream with a `data: {json}` frame.
  let data;
  if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
    const frames = body.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
    data = frames.length ? JSON.parse(frames[frames.length - 1]) : {};
  } else {
    data = body ? JSON.parse(body) : {};
  }
  if (data.error) throw new Error(`MCP error: ${data.error.message || JSON.stringify(data.error)}`);
  return data.result;
}

async function ensureInit() {
  if (inited) return;
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'afax', version: '0.5.0' } });
  inited = true;
  try { await rpc('notifications/initialized', {}, true); } catch {}
}

export async function listTools() {
  await ensureInit();
  const r = await rpc('tools/list', {});
  return r?.tools || [];
}

export async function callTool(name, args) {
  await ensureInit();
  return rpc('tools/call', { name, arguments: args || {} });
}

// Cheap live check for the integration catalog.
export async function test() {
  if (!status().connected) return { ok: false, msg: 'set url + token' };
  try {
    const tools = await listTools();
    return { ok: true, msg: `${tools.length} tool(s) available` };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

// afax mcp tools | afax mcp call <tool> --args '<json>'
export async function cmd(args) {
  const { c, header, ok, warn, info, log } = await import('../logger.js');
  const sub = args._[0];
  if (!status().connected) return warn('MCP not configured. Set integrations.mcp.url and integrations.mcp.token (afax connect).');
  try {
    if (sub === 'tools' || !sub) {
      header('🔌 MCP', status().url);
      const tools = await listTools();
      if (!tools.length) return info('Server exposed no tools.');
      for (const t of tools) log(`  ${c.orange(t.name)}  ${c.dim(t.description ? t.description.slice(0, 80) : '')}`);
      return;
    }
    if (sub === 'call') {
      const name = args._[1];
      if (!name) return warn('Usage: afax mcp call <tool> --args \'{"k":"v"}\'');
      let toolArgs = {};
      if (args.args) { try { toolArgs = JSON.parse(args.args); } catch { return warn('--args must be valid JSON.'); } }
      const result = await callTool(name, toolArgs);
      header('🔌 MCP', `call ${name}`);
      log(JSON.stringify(result, null, 2));
      return ok(`Called ${name}.`);
    }
    warn('Usage: afax mcp tools | afax mcp call <tool> --args \'<json>\'');
  } catch (e) {
    warn(`MCP: ${e.message}`);
  }
}
