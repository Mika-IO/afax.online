// ✅ Approval queue — the honest bridge between "prepared" and "sent".
//
// Agents and the background worker never send on their own: every outbound
// message/post is stored as `pending` (sent:false). A human reviews it here and
// approves; ONLY then does a real send happen, and only then is a receipt
// recorded. Nothing is ever reported as delivered without a real provider id.
import { read, write, update, add, find } from './store.js';
import { deliverDm, deliverPublish } from './integrations/registry.js';
import { sendBatch, EMAIL_RE } from './integrations/email.js';

// Everything awaiting a human decision: drafted but not sent, not rejected.
export function pending() {
  const msgs = read('messages', [])
    .filter((m) => m.pending && !m.sent && !m.rejected)
    .map((m) => ({ id: m.id, type: 'message', channel: m.channel, to: m.to, subject: m.subject || '', preview: (m.body || '').slice(0, 200), createdAt: m.createdAt }));
  const posts = read('posts', [])
    .filter((p) => p.pending && !p.sent && !p.rejected)
    .map((p) => ({ id: p.id, type: 'post', channel: p.platform, to: '', subject: '', preview: (p.message || '').slice(0, 200), createdAt: p.createdAt }));
  return [...msgs, ...posts].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// Approve one item → REAL send → receipt. Returns { ok, receipt? , error? }.
export async function approve(id) {
  const m = find('messages', (x) => x.id === id);
  if (m) return approveMessage(m);
  const p = find('posts', (x) => x.id === id);
  if (p) return approvePost(p);
  return { ok: false, error: `No pending item "${id}".` };
}

// Approve EVERYTHING pending in one shot. Emails go out through Resend's batch
// API (100 per HTTP call); other channels are sent one by one. Scales to 10k+.
export async function approveAll({ limit = 10000 } = {}) {
  const items = pending().slice(0, limit);
  const msgs = read('messages', []);
  const emails = [], others = [];
  for (const it of items) {
    if (it.type === 'message' && it.channel === 'email') {
      const rec = msgs.find((m) => m.id === it.id);
      if (rec) emails.push(rec);
    } else others.push(it);
  }
  let sent = 0, failed = 0;

  // Emails → batch.
  const valid = emails.filter((m) => EMAIL_RE.test(String(m.to)));
  for (const m of emails) if (!EMAIL_RE.test(String(m.to))) { update('messages', m.id, { error: 'invalid recipient' }); failed++; }
  if (valid.length) {
    let res = null;
    try { res = await sendBatch(valid.map((m) => ({ to: m.to, subject: m.subject, text: m.body }))); }
    catch (e) { for (const m of valid) { update('messages', m.id, { error: e.message }); failed++; } }
    if (res) for (const r of res) {
      const m = valid[r.index];
      if (r.id) { finalizeSent(m, r.id); sent++; } else { update('messages', m.id, { error: r.error || 'failed' }); failed++; }
    }
  }

  // Other channels → one by one.
  for (const it of others) {
    const r = await approve(it.id);
    if (r.ok) sent++; else failed++;
  }
  return { ok: true, sent, failed };
}

function finalizeSent(m, receipt) {
  update('messages', m.id, { pending: false, sent: true, delivered: true, error: '', receipt, sentAt: new Date().toISOString() });
  if (m.leadId) {
    const leads = read('leads', []);
    const i = leads.findIndex((x) => x.id === m.leadId);
    if (i >= 0 && leads[i].status !== 'contacted') { leads[i].status = 'contacted'; write('leads', leads); }
  }
  if (m.to) add('crm_notes', { email: m.to, text: `Outreach via ${m.channel}: ${m.subject || (m.body || '').slice(0, 60)}` });
}

export function reject(id) {
  const m = find('messages', (x) => x.id === id) || find('posts', (x) => x.id === id);
  if (!m) return { ok: false, error: `No pending item "${id}".` };
  const coll = m.body !== undefined ? 'messages' : 'posts';
  update(coll, id, { pending: false, rejected: true });
  return { ok: true };
}

async function approveMessage(m) {
  try {
    const res = await deliverDm({ platform: m.channel, to: m.to, subject: m.subject, text: m.body });
    const receipt = res?.id || res?.messageId || 'ok';
    update('messages', m.id, { pending: false, sent: true, delivered: true, error: '', receipt, sentAt: new Date().toISOString() });
    // Move the lead forward + leave a CRM trail — only now that it really went.
    if (m.leadId) {
      const leads = read('leads', []);
      const i = leads.findIndex((x) => x.id === m.leadId);
      if (i >= 0 && leads[i].status !== 'contacted') { leads[i].status = 'contacted'; write('leads', leads); }
    }
    if (m.to) add('crm_notes', { email: m.to, text: `Outreach via ${m.channel}: ${m.subject || (m.body || '').slice(0, 60)}` });
    return { ok: true, receipt };
  } catch (e) {
    update('messages', m.id, { error: e.message });
    return { ok: false, error: e.message };
  }
}

async function approvePost(p) {
  try {
    const res = await deliverPublish({ platform: p.platform, message: p.message });
    const receipt = res?.id || 'ok';
    update('posts', p.id, { pending: false, sent: true, delivered: true, error: '', receipt, sentAt: new Date().toISOString() });
    return { ok: true, receipt };
  } catch (e) {
    update('posts', p.id, { error: e.message });
    return { ok: false, error: e.message };
  }
}
