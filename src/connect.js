// `afax connect <platform>` — guided credential setup per integration,
// and `afax connections` — show what's wired up.
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { load, save } from './config.js';
import { connections as connStatus } from './integrations/registry.js';
import { c, header, table, ok, info, warn, log, dim, spin } from './logger.js';

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

export async function connect(args) {
  // Back-compat: allow connect('telegram') as well as connect(parsedArgs).
  const argv = typeof args === 'string' ? { _: [args] } : (args || { _: [] });
  const sub = argv._[0];

  if (sub === 'paste') return pasteConnect(argv);
  if (sub === 'test') return testConnect(argv);

  const platform = sub;
  if (!platform || !FIELDS[platform]) {
    warn(`Usage: afax connect <${Object.keys(FIELDS).join('|')}>`);
    info('Faster: ' + c.cyan('afax connect paste "<key>"') + ' auto-detects the service · ' + c.cyan('afax connect test') + ' verifies them.');
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

// afax connect paste "<secret>" — detect the service from the value, save, test.
async function pasteConnect(argv) {
  const secret = argv._.slice(1).join(' ').replace(/^["']|["']$/g, '').trim();
  if (!secret) return warn('Usage: afax connect paste "<api key / token / webhook url>"');
  const { paste } = await import('./integrations/catalog.js');
  const r = await spin('Detecting & testing', () => paste(secret));
  if (!r.ok) {
    warn(r.error);
    return info('Or connect it explicitly: ' + c.cyan('afax connect <service>'));
  }
  if (r.test.ok) ok(`${c.bold(r.label)} connected & verified ✓  ${c.dim('(' + r.test.msg + ')')}`);
  else {
    ok(`${c.bold(r.label)} saved.`);
    warn(`But the live test failed: ${r.test.msg} — double-check the value.`);
  }
  info('Outbound stays OFF until ' + c.cyan('afax config set live true'));
}

// afax connect test [service] — verify connected integrations with a live call.
async function testConnect(argv) {
  const { CATALOG, byKey, runTest, isConnected } = await import('./integrations/catalog.js');
  const only = argv._[1];
  const targets = only ? [byKey(only)].filter(Boolean) : CATALOG.filter((e) => isConnected(e));
  if (!targets.length) return info(only ? `Unknown or unset: ${only}` : 'No integrations connected yet. Try: ' + c.cyan('afax connect paste "<key>"'));
  header('AFAX · Connection test', 'Live verification');
  const rows = [];
  for (const e of targets) {
    const r = await runTest(e.key);
    rows.push([e.label, r.ok ? c.green('● ok') : c.red('✖ ' + (r.msg || 'failed')), r.ok ? c.dim(r.msg) : '']);
  }
  table(['Service', 'Status', 'Detail'], rows);
  log('');
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
