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

// send({ to, subject, text, html }) -> { id } | throws
export async function send({ to, subject, text, html }) {
  const e = integration('email');
  if (!e.from) throw new Error('No sender. Set integrations.email.from (afax connect email).');

  if (e.driver === 'resend') {
    if (!e.apiKey) throw new Error('Missing Resend API key.');
    const r = await http('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${e.apiKey}` },
      json: { from: e.from, to: [to], subject, text, html: html || undefined },
    });
    return { id: r.id };
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
