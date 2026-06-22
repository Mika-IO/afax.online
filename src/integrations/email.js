// Real email sending: Resend / SendGrid (HTTP) + raw SMTP over TLS (zero-dep).
import { connect } from 'node:tls';
import { integration } from '../config.js';
import { http } from './http.js';

export function status() {
  const e = integration('email');
  const ready =
    (e.driver === 'smtp' && e.host && e.user && e.pass) || (!!e.apiKey && !!e.from);
  return { connected: ready, driver: e.driver, from: e.from || '(no from)' };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Strip junk that pollutes a stored address (e.g. a literal "(unverified)" tag
// an LLM appended) so the bare, sendable address survives. Returns '' if empty.
export function sanitizeEmail(raw) {
  return String(raw || '')
    .replace(/\s*\((?:un)?verified\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sender rotation: spread volume across multiple verified from-addresses (better
// deliverability than hammering one). Falls back to the single `from`.
let rrIndex = 0;
export function senderList(e = integration('email')) {
  const extra = (Array.isArray(e.senders) ? e.senders : []).filter(Boolean);
  return [...new Set([e.from, ...extra].filter(Boolean))]; // default from + extras, deduped
}
function nextSender(e) {
  const list = senderList(e);
  return list.length ? list[rrIndex++ % list.length] : e.from;
}

// Batch send via Resend's /emails/batch (up to 100 per request). Returns an
// array aligned to the input: [{ index, id?, error? }]. One HTTP call per 100
// messages instead of one per email — the throughput path for big approvals.
export async function sendBatch(messages) {
  const e = integration('email');
  if (e.driver !== 'resend') throw new Error('Batch send currently needs the Resend driver.');
  if (!e.apiKey) throw new Error('Missing Resend API key.');
  if (!e.from) throw new Error('No sender. Set integrations.email.from.');
  const out = [];
  const delay = Math.max(0, Number(e.minDelayMs || 0));
  for (let i = 0; i < messages.length; i += 100) {
    if (i > 0 && delay) await new Promise((r) => setTimeout(r, delay)); // throttle between batches
    const chunk = messages.slice(i, i + 100);
    const senders = senderList(e);
    const payload = chunk.map((m, k) => ({ from: senders.length ? senders[(i + k) % senders.length] : e.from, to: [m.to], subject: m.subject || 'Hello', text: m.text }));
    try {
      const r = await http('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { authorization: `Bearer ${e.apiKey}` },
        json: payload,
      });
      const data = Array.isArray(r) ? r : (r.data || []);
      chunk.forEach((_, j) => out.push({ index: i + j, id: data[j]?.id || '' }));
    } catch (err) {
      const msg = resendHint(err.message, e);
      chunk.forEach((_, j) => out.push({ index: i + j, error: msg }));
    }
  }
  return out;
}

// send({ to, subject, text, html }) -> { id } | throws
export async function send({ to, subject, text, html }) {
  const e = integration('email');
  if (!e.from) throw new Error('No sender. Set integrations.email.from (afax connect email).');
  // Validate the recipient up-front — a malformed address is the most common
  // cause of a wasted/confused send (and of Resend 422s).
  if (!to || !EMAIL_RE.test(String(to))) throw new Error(`Invalid recipient address: "${to}".`);

  const from = nextSender(e) || e.from;
  if (e.driver === 'resend') {
    if (!e.apiKey) throw new Error('Missing Resend API key.');
    try {
      const r = await http('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${e.apiKey}` },
        json: { from, to: [to], subject, text, html: html || undefined },
      });
      return { id: r.id };
    } catch (err) {
      throw new Error(resendHint(err.message, e));
    }
  }

  if (e.driver === 'sendgrid') {
    if (!e.apiKey) throw new Error('Missing SendGrid API key.');
    await http('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${e.apiKey}` },
      json: {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject,
        content: [{ type: html ? 'text/html' : 'text/plain', value: html || text }],
      },
    });
    return { id: 'sendgrid-accepted' };
  }

  if (e.driver === 'smtp') return smtpSend(e, { to, subject, text, from });

  throw new Error(`Unknown email driver "${e.driver}".`);
}

// Resend most often replies 422 for two reasons: the `from` domain isn't verified
// yet, or (on a brand-new account in test mode) you may only send to the email you
// signed up with. Turn the raw API error into something actionable.
function resendHint(msg, e) {
  if (/422/.test(msg)) {
    return `Resend rejected the send (422). Usual causes: the sending domain of "${e.from}" ` +
      `is not verified in Resend, or your account is still in test mode (which only allows sending ` +
      `to your own verified address). Verify your domain at https://resend.com/domains. — ${msg}`;
  }
  if (/403/.test(msg)) return `Resend denied the request (403) — check the API key. — ${msg}`;
  return msg;
}

// Minimal SMTP client over implicit TLS (port 465), AUTH LOGIN.
function smtpSend(e, { to, subject, text, from = e.from }) {
  return new Promise((resolve, reject) => {
    if (!e.host || !e.user || !e.pass) return reject(new Error('SMTP needs host, user, pass.'));
    const sock = connect({ host: e.host, port: e.port || 465, servername: e.host }, () => {});
    let step = 0;
    let buf = '';
    const cmds = [
      `EHLO afax`,
      `AUTH LOGIN`,
      Buffer.from(e.user).toString('base64'),
      Buffer.from(e.pass).toString('base64'),
      `MAIL FROM:<${from}>`,
      `RCPT TO:<${to}>`,
      `DATA`,
      `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n.`,
      `QUIT`,
    ];
    const fail = (m) => { try { sock.destroy(); } catch {} reject(new Error('SMTP: ' + m)); };
    sock.setEncoding('utf8');
    sock.setTimeout(15000, () => fail('timeout'));
    sock.on('error', (err) => fail(err.message));
    sock.on('data', (chunk) => {
      buf += chunk;
      if (!buf.endsWith('\n')) return;
      const code = parseInt(buf.slice(0, 3), 10);
      buf = '';
      if (code >= 400) return fail('server replied ' + code);
      if (step < cmds.length) {
        sock.write(cmds[step++] + '\r\n');
      } else {
        sock.end();
        resolve({ id: 'smtp-sent' });
      }
    });
  });
}
