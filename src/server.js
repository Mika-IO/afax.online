// 🌐 Server — inbound side of the company. One zero-dependency HTTP server:
//   GET  /health              liveness
//   GET  /assets/<file>       public hosting for generated images (→ Instagram)
//   GET  /webhook/meta        Meta webhook verification (hub.challenge)
//   POST /webhook/meta        WhatsApp Cloud inbound messages
//   POST /webhook/telegram    Telegram bot updates
//   POST /webhook/stripe      payments → invoice paid + revenue (signature-verified)
//   POST /inbound/email       generic inbound email JSON {from, subject, text}
// Every inbound message lands in the `inbox` collection, logs a CRM note when
// the sender is known, emits `message.received` (flows), and — when autoreply
// is on AND global live is on — gets an AI reply through the same channel.
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { load, integration, isLive, hasLLM } from './config.js';
import { AFAX_HOME, read, add, update, find } from './store.js';
import { emit } from './events.js';
import { Agent } from './agents/base.js';
import * as registry from './integrations/registry.js';
import { c, header, ok, info, warn, log } from './logger.js';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

const replier = new Agent({
  key: 'inbound',
  name: 'Inbound',
  emoji: '📥',
  role: 'Inbound replies',
  system:
    'You are AFAX answering an inbound message to the company. Reply briefly (2-4 sentences), helpfully and in the brand tone. ' +
    'If the sender shows buying intent, move toward a concrete next step (call, demo, link). Plain text only.',
});

// afax serve [--port N]
export async function cmd(args) {
  const srv = integration('server');
  const port = Number(args.port || srv.port || 8787);
  header('🌐 Server', `inbound webhooks + asset hosting · port ${port}`);

  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      warn(`Handler error: ${e.message}`);
      send(res, 500, { error: 'internal' });
    });
  });
  server.listen(port, () => {
    ok(`Listening on http://0.0.0.0:${port}`);
    const pub = srv.publicUrl || `http://<your-host>:${port}`;
    log('');
    log('  ' + c.dim('Routes:'));
    for (const r of ['GET  /health', 'GET  /assets/<file>', 'GET|POST /webhook/meta', 'POST /webhook/telegram', 'POST /webhook/stripe', 'POST /inbound/email'])
      log('    ' + c.cyan(r));
    log('');
    info(`Public base URL: ${c.bold(pub)}  ${srv.publicUrl ? '' : c.yellow('(set it: afax config set integrations.server.publicUrl https://...)')}`);
    info(`Auto-reply: ${srv.autoreply ? c.green('on') : c.yellow('off')} (afax config set integrations.server.autoreply true) · requires global live`);
  });
  // Keep the process alive until killed (systemd/pm2/&).
  await new Promise(() => {});
}

export async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true, afax: true });

  // -- public asset hosting -------------------------------------------------
  if (req.method === 'GET' && path.startsWith('/assets/')) {
    const file = join(AFAX_HOME, 'assets', basename(path)); // basename() blocks traversal
    if (!existsSync(file)) return send(res, 404, { error: 'not found' });
    const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'public, max-age=86400' });
    return res.end(readFileSync(file));
  }

  // -- Meta verification handshake -----------------------------------------
  if (req.method === 'GET' && path === '/webhook/meta') {
    const srv = integration('server');
    if (url.searchParams.get('hub.verify_token') === (srv.verifyToken || 'afax')) {
      res.writeHead(200);
      return res.end(url.searchParams.get('hub.challenge') || '');
    }
    return send(res, 403, { error: 'bad verify token' });
  }

  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
  const raw = await body(req);
  let data = {};
  try { data = JSON.parse(raw || '{}'); } catch {}

  if (path === '/webhook/telegram') {
    const m = data.message;
    if (m?.text) {
      await inbound({
        channel: 'telegram',
        from: String(m.chat?.id || ''),
        name: [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' '),
        text: m.text,
      });
    }
    return send(res, 200, { ok: true });
  }

  if (path === '/webhook/meta') {
    for (const entry of data.entry || []) {
      for (const ch of entry.changes || []) {
        for (const m of ch.value?.messages || []) {
          if (m.type === 'text') {
            await inbound({
              channel: 'whatsapp',
              from: m.from,
              name: ch.value?.contacts?.[0]?.profile?.name || '',
              text: m.text?.body || '',
            });
          }
        }
      }
    }
    return send(res, 200, { ok: true });
  }

  if (path === '/webhook/stripe') {
    const stripe = integration('stripe');
    if (stripe.webhookSecret && !verifyStripe(raw, req.headers['stripe-signature'], stripe.webhookSecret)) {
      return send(res, 400, { error: 'bad signature' });
    }
    await stripeEvent(data);
    return send(res, 200, { received: true });
  }

  if (path === '/inbound/email') {
    if (data.from && (data.text || data.subject)) {
      await inbound({
        channel: 'email',
        from: String(data.from),
        name: data.name || '',
        text: [data.subject, data.text].filter(Boolean).join('\n'),
        subject: data.subject || '',
      });
    }
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: 'not found' });
}

// -- inbound pipeline: store → CRM → events → optional AI auto-reply --------
export async function inbound(msg) {
  const rec = add('inbox', { ...msg, repliedAt: null });
  info(`Inbound ${msg.channel} ← ${msg.name || msg.from}: ${String(msg.text).slice(0, 80)}`);

  const contact = find('contacts', (x) => x.email === msg.from || x.phone === msg.from);
  if (contact) add('crm_notes', { email: contact.email, text: `Inbound ${msg.channel}: ${String(msg.text).slice(0, 120)}` });

  await emit('message.received', { channel: msg.channel, from: msg.from, name: msg.name, email: contact?.email || msg.from, text: msg.text });

  const srv = integration('server');
  if (srv.autoreply && isLive() && hasLLM()) {
    try {
      const reply = await replier.generate(
        `Inbound ${msg.channel} message from ${msg.name || msg.from}:\n"${msg.text}"\n\nWrite the reply.`,
        { temperature: 0.6, maxTokens: 300 }
      );
      const sent = await registry.dm({ platform: msg.channel, to: msg.from, subject: msg.subject ? `Re: ${msg.subject}` : 'Re:', text: reply, live: true });
      if (sent.sent === true) {
        update('inbox', rec.id, { repliedAt: new Date().toISOString(), reply });
        replier.note(`Auto-replied to ${msg.from} on ${msg.channel}.`);
        ok(`Auto-replied on ${msg.channel} → ${msg.from}`);
      }
    } catch (e) {
      warn(`Auto-reply failed: ${e.message}`);
    }
  }
  return rec;
}

// -- Stripe -----------------------------------------------------------------
async function stripeEvent(event) {
  const type = event.type || '';
  if (!/checkout\.session\.completed|payment_link|invoice\.paid|payment_intent\.succeeded/.test(type)) return;
  const obj = event.data?.object || {};
  const amount = (obj.amount_total ?? obj.amount_paid ?? obj.amount ?? 0) / 100;
  const email = obj.customer_details?.email || obj.customer_email || '';
  const linkId = typeof obj.payment_link === 'string' ? obj.payment_link : obj.payment_link?.id;

  const inv = linkId ? find('invoices', (i) => i.linkId === linkId) : find('invoices', (i) => i.status !== 'paid' && i.amount === amount);
  if (inv) {
    update('invoices', inv.id, { status: 'paid', paidAt: new Date().toISOString() });
    add('revenue', { source: inv.to, amount: inv.amount, type: 'one-time' });
    ok(`Invoice ${inv.number} paid — $${inv.amount} booked to revenue.`);
  } else if (amount > 0) {
    add('revenue', { source: email || 'stripe', amount, type: 'one-time' });
    ok(`Stripe payment $${amount} booked to revenue.`);
  }
  await emit('payment.received', { amount, email, source: inv?.to || email || 'stripe' });
}

// Verify Stripe's `stripe-signature: t=...,v1=...` header (HMAC-SHA256 of "t.payload").
export function verifyStripe(payload, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (!parts.t || !parts.v1) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${payload}`).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(parts.v1, 'hex'));
  } catch {
    return false;
  }
}

// -- helpers ------------------------------------------------------------------
function body(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => { buf += c; if (buf.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

function send(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}
