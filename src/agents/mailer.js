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
  if (sub === 'warmup') return warmupCmd(args);
  if (sub === 'senders') return sendersCmd(args);
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

  const to = email.sanitizeEmail(args.to || args._[1] || '');
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

  if (res.pending) {
    info(`Preparado — ${c.bold('não enviado')}. Destinatário: ${c.bold(to)} · assunto: "${subject}"`);
    log('  ' + c.dim(text.slice(0, 200)));
    info(`Pra enviar de verdade: ${c.cyan('--live')} ${isLive() ? '' : 'e ' + c.cyan('afax config set live true')}`.trim());
    return;
  }
  if (!res.sent) {
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
  const e = load().integrations.email;
  log(`  senders: ${c.bold(String(email.senderList(e).length))} (rotation)`);
  if (e.warmup?.startedAt) {
    import('../deliverability.js').then(({ effectiveDailyCap, sentToday }) => {
      log(`  warmup: ${c.green('on')} · cap hoje ${c.bold(String(effectiveDailyCap()))} · enviados hoje ${sentToday()}`);
    });
  } else log(`  warmup: ${c.dim('off')}  (afax email warmup start)`);
  if (!st.connected) info('Connect: afax connect email');
}

// Warmup ramp — gradually raise the daily send cap to protect a new domain.
async function warmupCmd(args) {
  const cfg = load();
  const w = cfg.integrations.email.warmup || {};
  const action = args._[1];
  if (action === 'start') {
    w.startedAt = new Date().toISOString();
    if (args.start) w.perDayStart = Number(args.start);
    if (args.max) w.perDayMax = Number(args.max);
    if (args.days) w.rampDays = Number(args.days);
    cfg.integrations.email.warmup = w;
    save(cfg);
    const { effectiveDailyCap } = await import('../deliverability.js');
    return ok(`Warmup iniciado: ${w.perDayStart}/dia → ${w.perDayMax}/dia em ${w.rampDays} dias. Cap hoje: ${c.bold(String(effectiveDailyCap()))}.`);
  }
  if (action === 'stop') { w.startedAt = ''; cfg.integrations.email.warmup = w; save(cfg); return ok('Warmup desligado.'); }
  const { effectiveDailyCap, sentToday } = await import('../deliverability.js');
  header('✉️  Email', 'Warmup');
  if (!w.startedAt) return info('Off. Ligar: afax email warmup start [--start 20 --max 200 --days 14]');
  log(`  desde ${w.startedAt.slice(0, 10)} · ${w.perDayStart}→${w.perDayMax}/dia em ${w.rampDays}d`);
  log(`  cap hoje: ${c.bold(String(effectiveDailyCap()))}  ·  enviados hoje: ${sentToday()}`);
}

// Manage the from-address rotation pool.
function sendersCmd(args) {
  const cfg = load();
  const e = cfg.integrations.email;
  e.senders = e.senders || [];
  const action = args._[1];
  if (action === 'add') {
    const addr = String(args._[2] || args.addr || '').trim();
    if (!EMAIL_RE.test(addr)) return warn(`"${addr}" não é um email válido.`);
    if (!e.senders.includes(addr)) e.senders.push(addr);
    save(cfg);
    return ok(`Sender adicionado. Pool: ${e.senders.join(', ')}`);
  }
  if (action === 'rm') {
    const addr = String(args._[2] || '').trim();
    e.senders = e.senders.filter((s) => s !== addr);
    save(cfg);
    return ok(`Removido. Pool: ${e.senders.join(', ') || '(só o from padrão)'}`);
  }
  header('✉️  Email', 'Sender rotation pool');
  const pool = e.senders.length ? e.senders : [e.from].filter(Boolean);
  if (!pool.length) return info('Nenhum sender. Defina: afax email from <addr> · ou afax email senders add <addr>');
  pool.forEach((s) => log('  • ' + s));
  info('Adicionar: afax email senders add you@otherdomain.com');
}
