// 📭 Deliverability — the layer that keeps you out of spam folders and out of
// legal trouble: an opt-out/bounce suppression list, a per-day send cap, throttle
// between batches, and a compliant unsubscribe footer. This is the part cold-email
// tools (Instantly/Smartlead/lemlist) are really selling; AFAX needs at least the
// non-negotiables before it sends at volume.
import { read, addMany } from './store.js';
import { integration } from './config.js';

const norm = (e) => String(e || '').trim().toLowerCase();

// --- suppression list (opt-out + bounces + complaints) ----------------------
export function suppressedSet() {
  return new Set(read('suppressions', []).map((s) => norm(s.email)));
}
export function isSuppressed(email, set = suppressedSet()) {
  return set.has(norm(email));
}
// Add emails to the suppression list (deduped). reason: unsubscribe|bounce|complaint|manual
export function suppress(emails, reason = 'manual') {
  const list = Array.isArray(emails) ? emails : [emails];
  const have = suppressedSet();
  const fresh = [...new Set(list.map(norm).filter((e) => e && !have.has(e)))];
  if (fresh.length) addMany('suppressions', fresh.map((email) => ({ email, reason })));
  return fresh.length;
}

// --- daily send cap ---------------------------------------------------------
export function sentToday() {
  const today = new Date().toISOString().slice(0, 10);
  return read('messages', []).filter((m) => m.sent && String(m.sentAt || m.createdAt || '').slice(0, 10) === today).length;
}
// Effective daily cap: a warmup ramp (if started) gradually raises the limit
// from perDayStart to perDayMax over rampDays, capped by any explicit dailyCap.
// 0 / Infinity = unlimited.
export function effectiveDailyCap() {
  const e = integration('email');
  const w = e.warmup || {};
  const explicit = Number(e.dailyCap || 0);
  if (w.startedAt) {
    const days = Math.max(0, Math.floor((Date.now() - new Date(w.startedAt).getTime()) / 86400000));
    const start = Number(w.perDayStart || 20);
    const max = Number(w.perDayMax || 200);
    const ramp = Math.max(1, Number(w.rampDays || 14));
    const ramped = Math.min(max, Math.round(start + (max - start) * (days / ramp)));
    return explicit ? Math.min(explicit, ramped) : ramped;
  }
  return explicit || Infinity;
}

// Infinity when no cap is configured.
export function remainingToday() {
  const cap = effectiveDailyCap();
  if (!isFinite(cap) || cap === 0) return Infinity;
  return Math.max(0, cap - sentToday());
}

// --- throttle between batches ----------------------------------------------
export const minDelayMs = () => Math.max(0, Number(integration('email').minDelayMs || 0));
export const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

// --- compliant unsubscribe footer ------------------------------------------
// Appended to every cold email. A real link when a public server URL is set,
// otherwise a plain-text STOP fallback. Required by CAN-SPAM / LGPD / GDPR.
export function unsubFooter(email) {
  const base = integration('server').publicUrl;
  if (base) return `\n\n—\nDon't want these? Unsubscribe: ${base.replace(/\/$/, '')}/unsubscribe?e=${encodeURIComponent(norm(email))}`;
  return `\n\n—\nReply STOP to opt out and we won't email you again.`;
}
export function withFooter(body, email) {
  return /unsubscribe|opt out|descadastr|stop\b/i.test(body) ? body : body + unsubFooter(email);
}
