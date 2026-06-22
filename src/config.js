// Config split across two layers:
//   GLOBAL  (~/.afax/config.json)         — provider, LLM keys, autonomy, live, activeWorkspace
//   WORKSPACE (~/.afax/workspaces/<slug>/config.json) — business profile + integrations
// load() merges them into one object so callers see a flat cfg.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { GLOBAL_CONFIG, wsConfigPath, activeSlug, ensureDir, workspaceDir } from './paths.js';

const GLOBAL_DEFAULTS = {
  provider: 'anthropic',
  providers: {
    anthropic: { apiKey: '', model: 'claude-sonnet-4-6', baseUrl: 'https://api.anthropic.com' },
    openai: { apiKey: '', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' },
    openrouter: { apiKey: '', model: 'openai/gpt-4o-mini', baseUrl: 'https://openrouter.ai/api/v1' },
    ollama: { apiKey: '', model: 'llama3.1', baseUrl: 'http://localhost:11434' },
  },
  autonomy: 'suggest',
  live: false,
  budget: { monthly: 0 }, // USD/month LLM cap for the active workspace; 0 = unlimited
  activeWorkspace: 'default',
};

const WS_DEFAULTS = {
  business: { name: '', icp: '', offer: '', tone: 'direct, confident, helpful', website: '', language: '' },
  integrations: {
    email: { driver: 'resend', from: '', apiKey: '', host: '', port: 465, user: '', pass: '', dailyCap: 0, minDelayMs: 0, senders: [], warmup: { startedAt: '', perDayStart: 20, perDayMax: 200, rampDays: 14 } },
    meta: { accessToken: '', graphVersion: 'v21.0', pageId: '', igUserId: '', whatsappPhoneId: '', adAccountId: '' },
    telegram: { botToken: '', chatId: '' },
    slack: { webhookUrl: '', botToken: '' },
    discord: { webhookUrl: '' },
    leads: { driver: 'hunter', apiKey: '' },
    media: { driver: 'openai', apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-1' },
    deploy: { host: '', user: '', path: '', key: '' },
    stripe: { secretKey: '', webhookSecret: '' },
    x: { bearerToken: '' },
    zernio: { apiKey: '' },
    mcp: { url: '', token: '' },
    server: { port: 8787, publicUrl: '', autoreply: false, verifyToken: 'afax' },
  },
};

// Full default shape (for callers that want DEFAULTS).
export const DEFAULTS = { ...GLOBAL_DEFAULTS, ...WS_DEFAULTS };

let cache = null;

export function reset() { cache = null; }

export function load() {
  if (cache) return cache;
  const global = deepMerge(structuredClone(GLOBAL_DEFAULTS), readJSON(GLOBAL_CONFIG));
  const slug = activeSlug();
  const ws = deepMerge(structuredClone(WS_DEFAULTS), readJSON(wsConfigPath(slug)));
  cache = { ...global, ...ws, workspace: slug };

  // Env overrides — never touch disk.
  const p = cache.providers;
  if (process.env.ANTHROPIC_API_KEY) p.anthropic.apiKey = process.env.ANTHROPIC_API_KEY;
  if (process.env.OPENAI_API_KEY) p.openai.apiKey = process.env.OPENAI_API_KEY;
  if (process.env.OPENAI_BASE_URL) p.openai.baseUrl = process.env.OPENAI_BASE_URL;
  if (process.env.OPENROUTER_API_KEY) { p.openrouter.apiKey = process.env.OPENROUTER_API_KEY; if (!process.env.AFAX_PROVIDER && !cache.providers[cache.provider]?.apiKey) cache.provider = 'openrouter'; }
  if (process.env.OPENROUTER_MODEL) p.openrouter.model = process.env.OPENROUTER_MODEL;
  if (process.env.AFAX_PROVIDER) cache.provider = process.env.AFAX_PROVIDER;
  if (process.env.AFAX_MODEL && p[cache.provider]) p[cache.provider].model = process.env.AFAX_MODEL;

  const ig = cache.integrations;
  if (process.env.RESEND_API_KEY) { ig.email.driver = 'resend'; ig.email.apiKey = process.env.RESEND_API_KEY; }
  if (process.env.SENDGRID_API_KEY) { ig.email.driver = 'sendgrid'; ig.email.apiKey = process.env.SENDGRID_API_KEY; }
  if (process.env.AFAX_EMAIL_FROM) ig.email.from = process.env.AFAX_EMAIL_FROM;
  if (process.env.META_ACCESS_TOKEN) ig.meta.accessToken = process.env.META_ACCESS_TOKEN;
  if (process.env.TELEGRAM_BOT_TOKEN) ig.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (process.env.SLACK_WEBHOOK_URL) ig.slack.webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (process.env.DISCORD_WEBHOOK_URL) ig.discord.webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (process.env.HUNTER_API_KEY) { ig.leads.driver = 'hunter'; ig.leads.apiKey = process.env.HUNTER_API_KEY; }
  if (process.env.APOLLO_API_KEY) { ig.leads.driver = 'apollo'; ig.leads.apiKey = process.env.APOLLO_API_KEY; }
  if (process.env.STRIPE_SECRET_KEY) ig.stripe.secretKey = process.env.STRIPE_SECRET_KEY;
  if (process.env.STRIPE_WEBHOOK_SECRET) ig.stripe.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (process.env.AFAX_PUBLIC_URL) ig.server.publicUrl = process.env.AFAX_PUBLIC_URL;
  if (!ig.media.apiKey && process.env.OPENAI_API_KEY && ig.media.driver === 'openai') ig.media.apiKey = process.env.OPENAI_API_KEY;
  if (process.env.AFAX_LIVE === '1' || process.env.AFAX_LIVE === 'true') cache.live = true;

  return cache;
}

export function save(cfg) {
  ensureDir(workspaceDir(cfg.workspace || activeSlug()));
  // Split back into the two files.
  const global = {
    provider: cfg.provider,
    providers: cfg.providers,
    autonomy: cfg.autonomy,
    live: cfg.live,
    budget: cfg.budget,
    activeWorkspace: cfg.activeWorkspace || cfg.workspace || 'default',
  };
  const ws = { business: cfg.business, integrations: cfg.integrations };
  writeJSON(GLOBAL_CONFIG, global);
  writeJSON(wsConfigPath(cfg.workspace || activeSlug()), ws);
  cache = cfg;
  return cfg;
}

export function configPath() { return GLOBAL_CONFIG; }
export function isConfigured() { return existsSync(GLOBAL_CONFIG); }

export function activeProvider(cfg = load()) {
  const name = cfg.provider;
  const block = cfg.providers[name];
  if (!block) throw new Error(`Unknown provider "${name}". Run: afax config set provider <anthropic|openai|ollama>`);
  return { name, ...block };
}

// Cheaper model for high-volume agent WORK (drafting, prospect, orchestrator,
// segmentation, the background worker). The full `model` stays for interactive
// chat. Override per provider with providers.<name>.workModel.
const WORK_MODELS = { openai: 'gpt-5-mini', anthropic: 'claude-haiku-4-5-20251001', openrouter: 'openai/gpt-4o-mini', ollama: null };
export function workModel(cfg = load()) {
  const p = activeProvider(cfg);
  return p.workModel || WORK_MODELS[p.name] || p.model;
}

export function hasLLM(cfg = load()) {
  const p = activeProvider(cfg);
  return p.name === 'ollama' || !!p.apiKey;
}

export function integration(name, cfg = load()) {
  return cfg.integrations?.[name] || {};
}

export function isLive(cfg = load()) {
  return !!cfg.live;
}

// ---- helpers ----
function readJSON(path) {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; }
}
function writeJSON(path, obj) {
  ensureDir(path.slice(0, path.lastIndexOf('/')) || '.');
  writeFileSync(path, JSON.stringify(obj, null, 2));
}
function deepMerge(base, over) {
  for (const k of Object.keys(over || {})) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && typeof base[k] === 'object') {
      base[k] = deepMerge(base[k] || {}, over[k]);
    } else {
      base[k] = over[k];
    }
  }
  return base;
}
