// zernio — multi-platform social publishing/scheduling API (Twitter/X, Instagram,
// Facebook, LinkedIn, TikTok, YouTube, Telegram, WhatsApp, Discord, …). One API
// to post everywhere. Docs: https://docs.zernio.com  ·  base https://zernio.com/api/v1
import { integration, isLive } from '../config.js';
import { http } from './http.js';

const BASE = 'https://zernio.com/api/v1';

function authHeaders() {
  const z = integration('zernio');
  if (!z.apiKey) throw new Error('Missing zernio API key (integrations.zernio.apiKey).');
  return { authorization: `Bearer ${z.apiKey}` };
}

export function status() {
  return { connected: !!integration('zernio').apiKey };
}

// GET /accounts → connected social accounts [{ _id, platform, name|username }]
export async function listAccounts() {
  const r = await http(`${BASE}/accounts`, { headers: authHeaders() });
  return Array.isArray(r) ? r : (r.accounts || []);
}

// publish({ content, platform?, scheduledFor? }) → posts to all connected accounts,
// or just the ones matching `platform`. Immediate unless scheduledFor is given.
export async function publish({ content, platform, scheduledFor }) {
  const accounts = await listAccounts();
  const targets = platform ? accounts.filter((a) => a.platform === platform) : accounts;
  if (!targets.length) {
    throw new Error(platform
      ? `No connected zernio account for "${platform}". Connect one (GET /connect/${platform}).`
      : 'No connected zernio accounts yet — connect at least one in zernio.');
  }
  const platforms = targets.map((a) => ({ platform: a.platform, accountId: a._id }));
  const body = { content, platforms, ...(scheduledFor ? { scheduledFor } : { publishNow: true }) };
  const r = await http(`${BASE}/posts`, { method: 'POST', headers: authHeaders(), json: body });
  return { id: r.post?._id || r._id, status: r.post?.status || r.status || 'queued', platforms: platforms.map((p) => p.platform) };
}

export async function test() {
  if (!status().connected) return { ok: false, msg: 'set api key' };
  try {
    const accs = await listAccounts();
    return { ok: true, msg: `${accs.length} social account(s) connected` };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

const unescape = (s) => String(s).replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t');

// afax zernio accounts | afax zernio post --content "..." [--platform x] [--scheduledFor ISO] [--live]
export async function cmd(args) {
  const { c, header, ok, warn, info, log } = await import('../logger.js');
  if (!status().connected) return warn('zernio not connected. Run: afax connect paste "sk_..."  (or config set integrations.zernio.apiKey).');
  const sub = args._[0];
  try {
    if (sub === 'accounts' || !sub) {
      header('🟣 zernio', 'Connected social accounts');
      const accs = await listAccounts();
      if (!accs.length) return info('No social accounts connected in zernio yet.');
      for (const a of accs) log(`  ${c.orange((a.platform || '?').padEnd(12))} ${c.dim(a.name || a.username || a._id || '')}`);
      return;
    }
    if (sub === 'post') {
      const content = unescape(args.content || args._.slice(1).join(' '));
      if (!content) return warn('Usage: afax zernio post --content "..." [--platform x] [--live]');
      const live = !!args.live && isLive();
      header('🟣 zernio', `publish · ${args.platform || 'all platforms'} · ${live ? 'LIVE' : 'dry-run'}`);
      if (!live) {
        info('Dry-run — not published. Add --live (and config set live true) to publish for real.');
        log('  ' + c.dim(content.slice(0, 240)));
        return;
      }
      const res = await publish({ content, platform: args.platform, scheduledFor: args.scheduledFor });
      return ok(`Published via zernio to ${res.platforms.join(', ')} (post ${res.id}, ${res.status}).`);
    }
    warn('Usage: afax zernio accounts | afax zernio post --content "..." [--platform x] [--live]');
  } catch (e) {
    warn(`zernio: ${e.message}`);
  }
}
