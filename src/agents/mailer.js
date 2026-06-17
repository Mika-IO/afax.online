// ✉️  Direct email — an explicit, single-recipient send command.
//
// Why this exists: without a precise "send to THIS address" tool, the chat agent
// used to repurpose `outreach` (which sends to LEADS) and would sometimes invent
// or pick the wrong recipient. `email send --to <addr>` removes the ambiguity:
// exactly one validated address, the live/dry-run gate, and a CRM trail.
import { isLive, load, save } from '../config.js';
import { add } from '../store.js';
import * as email from '../integrations/email.js';
import { dm } from '../integrations/registry.js';
import { c, header, ok, info, warn, log } from '../logger.js';

// RFC-pragmatic email check — good enough to reject the garbage that caused the
// "sent to the wrong address" bug, without rejecting real addresses.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// The chat agent passes the body with literal backslash escapes ("line1\\nline2")
// because it's a string inside a command inside JSON. Turn those back into real
// newlines/tabs so the email isn't full of visible "\n".
function unescape(s) {
  return String(s).replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\n');
}

export async function cmd(args) {
  const sub = args._[0];
  if (sub === 'status') return statusCmd();
  // `email from <addr>`  /  `email set from <addr>` — change the sender address.
  if (sub === 'from' || (sub === 'set' && args._[1] === 'from')) {
    const addr = String((sub === 'from' ? args._[1] : args._[2]) || args.from || '').trim();
    if (!addr) return warn('Usage: afax email from you@yourdomain.com');
    if (!EMAIL_RE.test(addr)) return warn(`"${addr}" is not a valid email address.`);
    const cfg = load();
    cfg.integrations.email.from = addr;
    save(cfg);
    return ok(`Email sender set to ${c.bold(addr)} (workspace ${cfg.workspace}).`);
  }
  if (sub && sub !== 'send') return warn('Usage: afax email send --to <addr> --subject "..." --body "..." [--live]  |  afax email from <addr>  |  afax email status');

  const to = String(args.to || args._[1] || '').trim();
  const subject = unescape(String(args.subject || 'Hello').trim());
  const text = unescape(String(args.body || args.text || args.message || '').trim());

  if (!to) return warn('Missing recipient. Usage: afax email send --to you@example.com --subject "Hi" --body "..."');
  if (!EMAIL_RE.test(to)) {
    return warn(`"${to}" is not a valid email address — refusing to send (this is the guard that prevents misdirected mail).`);
  }
  if (!text) return warn('Missing body. Add --body "your message".');

  const st = email.status();
  if (!st.connected) {
    return warn('Email is not connected. Set it up: afax connect email  (or paste a Resend key with afax connect paste "re_...").');
  }

  header('✉️  Email', `${st.driver} · ${st.from} → ${to}`);
  const res = await dm({ platform: 'email', to, subject, text, live: !!args.live });

  if (res.dryRun) {
    info(`Dry-run — not sent. Recipient: ${c.bold(to)} · subject: "${subject}"`);
    log('  ' + c.dim(text.slice(0, 200)));
    info(`To actually send: add ${c.cyan('--live')} ${isLive() ? '' : 'and ' + c.cyan('afax config set live true')}`.trim());
    return;
  }
  if (!res.ok) {
    warn(`Send failed: ${res.error}`);
    return;
  }
  add('crm_notes', { email: to, text: `Email sent: "${subject}"` });
  ok(`Sent to ${c.bold(to)} (id ${res.result?.id || 'ok'}).`);
}

function statusCmd() {
  const st = email.status();
  header('✉️  Email', 'Delivery configuration');
  log(`  driver: ${c.bold(st.driver || '—')}`);
  log(`  from:   ${c.bold(st.from)}`);
  log(`  status: ${st.connected ? c.green('connected') : c.yellow('not set')}`);
  if (!st.connected) info('Connect: afax connect email');
}
