// One-click OAuth for the services that actually offer an authorization flow
// (Slack, Meta, Discord). The user clicks "Connect", approves on the provider's
// screen, and the callback exchanges the code for a token that's stored in the
// right place — no copy-paste.
//
// This needs an OAuth APP per provider (client id + secret) that AFAX owns. The
// hosted Cloud registers these once so it's truly one-click for end users; a
// self-host operator sets their own via env:
//   AFAX_OAUTH_<PROVIDER>_CLIENT_ID / AFAX_OAUTH_<PROVIDER>_CLIENT_SECRET
// Key-only services (Resend, OpenAI, Hunter, Telegram…) have NO OAuth — they
// stay on smart-paste / generate-a-key.
import { load, save } from '../config.js';

const PROVIDERS = {
  slack: {
    label: 'Slack',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scope: 'incoming-webhook,chat:write',
    exchange: 'post',
    store: (cfg, d) => {
      if (d.incoming_webhook?.url) cfg.integrations.slack.webhookUrl = d.incoming_webhook.url;
      if (d.access_token) cfg.integrations.slack.botToken = d.access_token;
    },
  },
  discord: {
    label: 'Discord',
    authUrl: 'https://discord.com/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    scope: 'webhook.incoming',
    exchange: 'post',
    store: (cfg, d) => { if (d.webhook?.url) cfg.integrations.discord.webhookUrl = d.webhook.url; },
  },
  meta: {
    label: 'Meta',
    authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    scope: 'pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,business_management',
    exchange: 'get',
    store: (cfg, d) => { if (d.access_token) cfg.integrations.meta.accessToken = d.access_token; },
  },
};

function creds(provider) {
  const up = provider.toUpperCase();
  const cfg = load();
  return {
    id: process.env[`AFAX_OAUTH_${up}_CLIENT_ID`] || cfg.oauth?.[provider]?.clientId || '',
    secret: process.env[`AFAX_OAUTH_${up}_CLIENT_SECRET`] || cfg.oauth?.[provider]?.clientSecret || '',
  };
}

export function supported(provider) { return !!PROVIDERS[provider]; }
export function isReady(provider) {
  const c = creds(provider);
  return !!(PROVIDERS[provider] && c.id && c.secret);
}

export function providersStatus() {
  const out = {};
  for (const k of Object.keys(PROVIDERS)) out[k] = { supported: true, ready: isReady(k), label: PROVIDERS[k].label };
  return out;
}

export function authorizeUrl(provider, redirectUri, state) {
  const p = PROVIDERS[provider];
  const c = creds(provider);
  const u = new URL(p.authUrl);
  u.searchParams.set('client_id', c.id);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', p.scope);
  u.searchParams.set('state', state);
  return u.toString();
}

// Exchange the auth code for a token and store it in the right config slot.
export async function exchange(provider, code, redirectUri) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`Unknown OAuth provider: ${provider}`);
  if (!code) throw new Error('Missing authorization code');
  const c = creds(provider);
  let data;
  if (p.exchange === 'get') {
    const u = new URL(p.tokenUrl);
    u.searchParams.set('client_id', c.id);
    u.searchParams.set('client_secret', c.secret);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('code', code);
    const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
    data = await res.json();
  } else {
    const body = new URLSearchParams({ client_id: c.id, client_secret: c.secret, code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
    const res = await fetch(p.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15000) });
    data = await res.json();
  }
  if (data.error || data.ok === false) {
    throw new Error('OAuth exchange failed: ' + (data.error_description || data.error || JSON.stringify(data).slice(0, 200)));
  }
  const cfg = load();
  p.store(cfg, data);
  save(cfg);
  return { label: p.label };
}
