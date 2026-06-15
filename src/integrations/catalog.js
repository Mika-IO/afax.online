// Integration catalog — the single source of truth for "how do I connect X":
// the minimal fields that actually matter, where to get the key, a regex to
// auto-detect a pasted credential, and a cheap live test. Powers smart-paste
// (paste one secret → routed to the right place → tested) and a lean UI that
// shows only the fields a given service needs (no SMTP host/port for Resend).
import { load, save } from '../config.js';

// path: dotted config path of the primary secret. fields: minimal editable set.
export const CATALOG = [
  {
    key: 'openai', label: 'OpenAI', kind: 'provider', secret: 'providers.openai.apiKey',
    get: 'https://platform.openai.com/api-keys',
    fields: [{ path: 'providers.openai.apiKey', label: 'API key', secret: true, placeholder: 'sk-…' }],
    detect: /^sk-(?!ant-)(proj-|svcacct-)?[A-Za-z0-9_-]{20,}$/,
    test: async (cfg) => testGet('https://api.openai.com/v1/models', { authorization: `Bearer ${cfg.providers.openai.apiKey}` }),
  },
  {
    key: 'anthropic', label: 'Anthropic', kind: 'provider', secret: 'providers.anthropic.apiKey',
    get: 'https://console.anthropic.com/settings/keys',
    fields: [{ path: 'providers.anthropic.apiKey', label: 'API key', secret: true, placeholder: 'sk-ant-…' }],
    detect: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    test: async (cfg) => testGet('https://api.anthropic.com/v1/models', { 'x-api-key': cfg.providers.anthropic.apiKey, 'anthropic-version': '2023-06-01' }),
  },
  {
    key: 'email', label: 'Email (Resend)', kind: 'integration', secret: 'integrations.email.apiKey',
    get: 'https://resend.com/api-keys',
    fields: [
      { path: 'integrations.email.apiKey', label: 'Resend API key', secret: true, placeholder: 're_…' },
      { path: 'integrations.email.from', label: 'From address', placeholder: 'you@yourdomain.com' },
    ],
    onSet: (cfg) => { cfg.integrations.email.driver = 'resend'; },
    detect: /^re_[A-Za-z0-9_]{16,}$/,
    test: async (cfg) => testGet('https://api.resend.com/domains', { authorization: `Bearer ${cfg.integrations.email.apiKey}` }),
  },
  {
    key: 'telegram', label: 'Telegram', kind: 'integration', secret: 'integrations.telegram.botToken',
    get: 'https://t.me/BotFather',
    fields: [
      { path: 'integrations.telegram.botToken', label: 'Bot token', secret: true, placeholder: '123456:ABC-…' },
      { path: 'integrations.telegram.chatId', label: 'Default chat ID', placeholder: '-100… or your user id' },
    ],
    detect: /^\d{6,}:[A-Za-z0-9_-]{30,}$/,
    test: async (cfg) => testGet(`https://api.telegram.org/bot${cfg.integrations.telegram.botToken}/getMe`),
  },
  {
    key: 'slack', label: 'Slack', kind: 'integration', secret: 'integrations.slack.webhookUrl',
    get: 'https://api.slack.com/messaging/webhooks',
    fields: [{ path: 'integrations.slack.webhookUrl', label: 'Incoming webhook URL', secret: true, placeholder: 'https://hooks.slack.com/services/…' }],
    detect: /^https:\/\/hooks\.slack\.com\/services\//,
    test: async () => ({ ok: true, msg: 'format ok (not sent)' }),
  },
  {
    key: 'discord', label: 'Discord', kind: 'integration', secret: 'integrations.discord.webhookUrl',
    get: 'https://support.discord.com/hc/en-us/articles/228383668',
    fields: [{ path: 'integrations.discord.webhookUrl', label: 'Webhook URL', secret: true, placeholder: 'https://discord.com/api/webhooks/…' }],
    detect: /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//,
    test: async () => ({ ok: true, msg: 'format ok (not sent)' }),
  },
  {
    key: 'stripe', label: 'Stripe', kind: 'integration', secret: 'integrations.stripe.secretKey',
    get: 'https://dashboard.stripe.com/apikeys',
    fields: [{ path: 'integrations.stripe.secretKey', label: 'Secret key', secret: true, placeholder: 'sk_live_… / sk_test_…' }],
    detect: /^(sk|rk)_(live|test)_[A-Za-z0-9]{16,}$/,
    test: async (cfg) => testGet('https://api.stripe.com/v1/balance', { authorization: `Bearer ${cfg.integrations.stripe.secretKey}` }),
  },
  {
    key: 'leads', label: 'Leads (Hunter.io)', kind: 'integration', secret: 'integrations.leads.apiKey',
    get: 'https://hunter.io/api-keys',
    fields: [{ path: 'integrations.leads.apiKey', label: 'Hunter API key', secret: true, placeholder: '40-char key' }],
    onSet: (cfg) => { cfg.integrations.leads.driver = 'hunter'; },
    detect: /^[a-f0-9]{40}$/,
    test: async (cfg) => testGet(`https://api.hunter.io/v2/account?api_key=${cfg.integrations.leads.apiKey}`),
  },
  {
    key: 'meta', label: 'Meta (FB/IG/WhatsApp)', kind: 'integration', secret: 'integrations.meta.accessToken',
    get: 'https://developers.facebook.com/tools/explorer/',
    fields: [
      { path: 'integrations.meta.accessToken', label: 'Access token', secret: true, placeholder: 'EAAB…' },
      { path: 'integrations.meta.pageId', label: 'Facebook Page ID', placeholder: 'digits' },
      { path: 'integrations.meta.igUserId', label: 'Instagram account ID', placeholder: 'digits' },
    ],
    detect: /^EAA[A-Za-z0-9]{20,}$/,
    test: async (cfg) => testGet(`https://graph.facebook.com/v21.0/me?access_token=${cfg.integrations.meta.accessToken}`),
  },
];

export function byKey(key) {
  return CATALOG.find((c) => c.key === key);
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  if (keys.some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) return;
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}

// Is this integration's primary secret set?
export function isConnected(entry, cfg = load()) {
  return !!getPath(cfg, entry.secret);
}

// Auto-detect which integration a pasted credential belongs to.
export function detect(secret) {
  const s = String(secret || '').trim();
  return CATALOG.find((c) => c.detect && c.detect.test(s)) || null;
}

// Set a value at a config path (+ any onSet side-effects) and persist.
export function setField(path, value) {
  const cfg = load();
  setPath(cfg, path, value);
  const owner = CATALOG.find((c) => c.fields.some((f) => f.path === path));
  if (owner?.onSet) owner.onSet(cfg);
  save(cfg);
}

// Smart paste: route a secret to the right integration, save, and test it.
export async function paste(secret) {
  const entry = detect(secret);
  if (!entry) return { ok: false, error: 'Could not recognize that credential. Connect it explicitly instead.' };
  setField(entry.secret, String(secret).trim());
  const result = await runTest(entry.key);
  return { ok: true, key: entry.key, label: entry.label, test: result };
}

export async function runTest(key) {
  const entry = byKey(key);
  if (!entry?.test) return { ok: false, msg: 'no test available' };
  if (!isConnected(entry)) return { ok: false, msg: 'not set' };
  try {
    return await entry.test(load());
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

async function testGet(url, headers = {}) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
    if (res.ok) return { ok: true, msg: `ok (${res.status})` };
    return { ok: false, msg: `${res.status} ${res.statusText}` };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}
