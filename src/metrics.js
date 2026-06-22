// 📈 Metrics — the feedback loop. Real outcomes flow back onto the records that
// produced them: email delivered/opened/clicked (via Resend webhook), replies
// (via inbound), so the orchestrator can decide from PERFORMANCE, not just counts.
import { read, find, update } from './store.js';

// Apply a Resend delivery event to the message it belongs to (matched by the
// provider receipt id we stored on send). Returns true if a message matched.
export function recordEmailEvent(type, emailId) {
  if (!emailId) return false;
  const m = find('messages', (x) => x.receipt === emailId);
  if (!m) return false;
  const now = new Date().toISOString();
  const patch = {};
  if (type === 'delivered') { patch.delivered = true; patch.deliveredAt = m.deliveredAt || now; }
  else if (type === 'opened') { patch.opens = (m.opens || 0) + 1; patch.openedAt = m.openedAt || now; }
  else if (type === 'clicked') { patch.clicks = (m.clicks || 0) + 1; patch.clickedAt = m.clickedAt || now; }
  else return false;
  update('messages', m.id, patch);
  return true;
}

// Mark the most recent sent message to this address as replied (called from the
// inbound pipeline when a contacted lead writes back).
export function recordReply(fromEmail) {
  if (!fromEmail) return false;
  const addr = String(fromEmail).toLowerCase();
  const mine = read('messages', []).filter((m) => m.sent && String(m.to).toLowerCase() === addr && !m.replied);
  if (!mine.length) return false;
  const last = mine[mine.length - 1];
  update('messages', last.id, { replied: true, repliedAt: new Date().toISOString() });
  return true;
}

const rate = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0); // one-decimal %

// Aggregate email funnel + rates over all messages (optionally a subset).
export function emailStats(messages = read('messages', [])) {
  const sent = messages.filter((m) => m.sent);
  const n = sent.length;
  const delivered = sent.filter((m) => m.delivered).length;
  const opened = sent.filter((m) => (m.opens || 0) > 0).length;
  const clicked = sent.filter((m) => (m.clicks || 0) > 0).length;
  const replied = sent.filter((m) => m.replied).length;
  return {
    sent: n, delivered, opened, clicked, replied,
    deliveryRate: rate(delivered, n),
    openRate: rate(opened, delivered || n),
    clickRate: rate(clicked, delivered || n),
    replyRate: rate(replied, delivered || n),
  };
}

// Compact performance line for the orchestrator's decision context.
export function performanceLine() {
  const s = emailStats();
  if (!s.sent) return 'email: nothing sent yet';
  return `email: sent ${s.sent}, delivered ${s.deliveryRate}%, open ${s.openRate}%, click ${s.clickRate}%, reply ${s.replyRate}%`;
}
