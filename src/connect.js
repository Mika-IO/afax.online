// `afax connect <platform>` — guided credential setup per integration,
// and `afax connections` — show what's wired up.
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { load, save } from './config.js';
import { connections as connStatus } from './integrations/registry.js';
import { c, header, table, ok, info, warn, log, dim } from './logger.js';

const FIELDS = {
  email: [
    ['driver', 'Driver (resend|sendgrid|smtp)'],
    ['from', 'From address (you@domain.com)'],
    ['apiKey', 'API key (resend/sendgrid)'],
    ['host', 'SMTP host (smtp only)'],
    ['user', 'SMTP user (smtp only)'],
    ['pass', 'SMTP pass (smtp only)'],
  ],
  meta: [
    ['accessToken', 'Meta long-lived access token'],
    ['pageId', 'Facebook Page ID'],
    ['igUserId', 'Instagram Business account ID'],
    ['whatsappPhoneId', 'WhatsApp Cloud phone-number ID'],
    ['adAccountId', 'Ad account ID (paid ads, digits only)'],
  ],
  telegram: [['botToken', 'Bot token'], ['chatId', 'Default chat ID']],
  slack: [['webhookUrl', 'Incoming webhook URL']],
  discord: [['webhookUrl', 'Webhook URL']],
  leads: [['driver', 'Driver (hunter|apollo)'], ['apiKey', 'API key']],
  media: [['apiKey', 'Images API key'], ['baseUrl', 'Base URL'], ['model', 'Model']],
  stripe: [['secretKey', 'Stripe secret key (sk_...)'], ['webhookSecret', 'Webhook signing secret (whsec_..., optional)']],
  server: [['port', 'Port (default 8787)'], ['publicUrl', 'Public base URL (https://your-host)'], ['autoreply', 'AI auto-reply to inbound (true|false)'], ['verifyToken', 'Meta webhook verify token']],
  deploy: [['host', 'VPS host'], ['user', 'SSH user'], ['path', 'Remote path'], ['key', 'SSH key path (optional)']],
};

export async function connect(platform) {
  if (!platform || !FIELDS[platform]) {
    warn(`Usage: afax connect <${Object.keys(FIELDS).join('|')}>`);
    return;
  }
  header(`AFAX · Connect ${platform}`, 'Leave blank to keep current / skip');
  const rl = createInterface({ input: stdin, output: stdout });
  const cfg = load();
  const block = cfg.integrations[platform];
  try {
    for (const [key, label] of FIELDS[platform]) {
      const cur = block[key];
      const shown = key.toLowerCase().includes('key') || key.includes('pass') || key.includes('Token')
        ? (cur ? '•••stored' : '')
        : cur || '';
      const a = (await rl.question(`  ${c.cyan('?')} ${label}${shown ? c.dim(` (${shown})`) : ''}: `)).trim();
      if (a) block[key] = coerce(a);
    }
    save(cfg);
    log('');
    ok(`${platform} connected.`);
    info(`Verify: ${c.cyan('afax connections')}  ·  Outbound stays OFF until ${c.cyan('afax config set live true')}.`);
  } finally {
    rl.close();
  }
}

export function connections() {
  header('AFAX · Connections', 'Outbound is ' + (load().live ? c.green('LIVE') : c.yellow('OFF (dry-run)')));
  table(
    ['Platform', 'Status', 'Via'],
    connStatus().map(([name, ready, via]) => [name, ready ? c.green('● connected') : c.dim('○ not set'), via])
  );
  log('');
  dim('  Connect one:  afax connect email | meta | telegram | slack | discord | leads | media | stripe | server | deploy');
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !isNaN(Number(v))) return Number(v);
  return v;
}
