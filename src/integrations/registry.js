// Central dispatch for outbound actions. Enforces the live/dry-run safety gate:
// nothing leaves the machine unless `live` is true (global config.live + --live).
import { isLive } from '../config.js';
import * as email from './email.js';
import * as meta from './meta.js';
import * as messaging from './messaging.js';
import * as leads from './leads.js';
import * as media from './media.js';
import * as payments from './payments.js';
import * as x from './x.js';
import * as zernio from './zernio.js';

export { email, meta, messaging, leads, media, payments, x, zernio };

// Aggregate connection status for `afax connections`.
export function connections() {
  const e = email.status();
  const m = meta.status();
  const msg = messaging.status();
  const l = leads.status();
  const md = media.status();
  return [
    ['Email', e.connected, `${e.driver} · ${e.from}`],
    ['Facebook', m.connected && m.facebook, 'Meta Graph'],
    ['Instagram', m.connected && m.instagram, 'Meta Graph'],
    ['WhatsApp', m.connected && m.whatsapp, 'Cloud API'],
    ['Telegram', msg.telegram, 'Bot API'],
    ['Slack', msg.slack, 'Webhook/Bot'],
    ['Discord', msg.discord, 'Webhook'],
    ['Leads', l.connected, l.driver],
    ['Media (images)', md.connected, `${md.driver} · ${md.model}`],
    ['Payments (Stripe)', payments.status().connected, payments.status().webhook ? 'API + webhook' : 'API'],
    ['X (Twitter)', x.status().connected, 'API v2'],
    ['zernio (social)', zernio.status().connected, 'multi-platform publish'],
  ];
}

/**
 * Publish a one-to-many post to a social platform.
 * @returns { ok, sent, pending?, result?, error? }
 */
export async function publish({ platform, message, imageUrl, link, live }) {
  return guarded(live, platform, () => deliverPublish({ platform, message, imageUrl, link }));
}

/**
 * Send a 1:1 direct message (outreach).
 */
export async function dm({ platform, to, subject, text, live }) {
  return guarded(live, `${platform}→${to}`, () => deliverDm({ platform, to, subject, text }));
}

// --- ungated delivery -------------------------------------------------------
// The REAL send, with no dry-run gate. Only the human-approval path (an explicit
// approve action) and the gated wrappers above may call these. Returns the
// provider result (receipt) or throws.
export async function deliverDm({ platform, to, subject, text }) {
  switch (platform) {
    case 'email': return email.send({ to, subject: subject || 'Hello', text });
    case 'whatsapp': return meta.whatsappSend({ to, text });
    case 'telegram': return messaging.telegramSend({ text, chatId: to });
    default: throw new Error(`Unknown dm platform "${platform}".`);
  }
}

export async function deliverPublish({ platform, message, imageUrl, link }) {
  switch (platform) {
    case 'facebook': return meta.facebookPost({ message, link });
    case 'instagram': return meta.instagramPublish({ imageUrl, caption: message });
    case 'telegram': return messaging.telegramSend({ text: message });
    case 'slack': return messaging.slackSend({ text: message });
    case 'discord': return messaging.discordSend({ text: message });
    case 'x': case 'twitter': return x.post({ text: message });
    default: throw new Error(`Unknown publish platform "${platform}".`);
  }
}

// The single choke-point that decides real-send vs hold-for-approval.
// HONESTY CONTRACT: never report success without a real send.
//   - not live  → { ok:false, sent:false, pending:true }  (prepared, NOT sent)
//   - real send → { ok:true,  sent:true,  result }        (receipt attached)
//   - failure   → { ok:false, sent:false, error }
async function guarded(live, label, fn) {
  const go = live && isLive();
  if (!go) return { ok: false, sent: false, pending: true, label };
  try {
    const result = await fn();
    return { ok: true, sent: true, label, result };
  } catch (error) {
    return { ok: false, sent: false, label, error: error.message };
  }
}
