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

// send({ to, subject, text, html }) -> { id } | throws
export async function send({ to, subject, text, html }) {
  const e = integration('email');
  if (!e.from) throw new Error('No sender. Set integrations.email.from (afax connect email).');
  // Validate the recipient up-front — a malformed address is the most common
  // cause of a wasted/confused send (and of Resend 422s).
  if (!to || !EMAIL_RE.test(String(to))) throw new Error(`Invalid recipient address: "${to}".`);

  if (e.driver === 'resend') {
    if (!e.apiKey) throw new Error('Missing Resend API key.');
    try {
      const r = await http('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${e.apiKey}` },
        json: { from: e.from, to: [to], subject, text, html: html || undefined },
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
        from: { email: e.from },
        subject,
        content: [{ type: html ? 'text/html' : 'text/plain', value: html || text }],
      },
    });
    return { id: 'sendgrid-accepted' };
  }

  if (e.driver === 'smtp') return smtpSend(e, { to, subject, text });

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
function smtpSend(e, { to, subject, text }) {
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
      `MAIL FROM:<${e.from}>`,
      `RCPT TO:<${to}>`,
      `DATA`,
      `From: ${e.from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n.`,
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
