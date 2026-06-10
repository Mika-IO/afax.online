// 🔔 Event bus — agents emit events; flows whose trigger matches run
// automatically. This is what makes `--trigger "new lead"` real.
import { read } from './store.js';
import { remember } from './memory.js';
import { c, step, warn, log } from './logger.js';

// Canonical events and the trigger phrases that match them.
const ALIASES = {
  'lead.new': ['lead.new', 'new lead', 'lead added', 'leads added'],
  'contact.new': ['contact.new', 'new contact', 'contact added'],
  'deal.won': ['deal.won', 'deal won', 'won deal', 'closed won'],
  'message.received': ['message.received', 'new message', 'inbound', 'reply', 'message received'],
  'payment.received': ['payment.received', 'payment', 'invoice paid', 'paid'],
};

export function matches(event, trigger) {
  const t = String(trigger || '').toLowerCase();
  return (ALIASES[event] || [event]).some((a) => t.includes(a));
}

// Fill {{field}} placeholders in flow steps with event data.
export function fill(stepLine, data = {}) {
  return stepLine.replace(/\{\{(\w+)\}\}/g, (_, k) => (data[k] ?? ''));
}

// Re-entrancy guard so a flow that emits events cannot loop forever.
let depth = 0;

export async function emit(event, data = {}) {
  const flows = read('flows', []).filter((f) => matches(event, f.trigger));
  if (!flows.length || depth >= 2) return;
  depth++;
  try {
    const { dispatch } = await import('./cli.js');
    const { tokenize } = await import('./agents/automation.js');
    for (const flow of flows) {
      step(`Event ${c.orange(event)} → flow ${c.bold(flow.name)}`);
      for (const line of flow.steps || []) {
        try {
          await dispatch(tokenize(fill(line, data)));
        } catch (e) {
          warn(`Flow step failed: ${e.message}`);
        }
      }
      remember('automation', `Event ${event} triggered flow "${flow.name}".`);
      log('');
    }
  } finally {
    depth--;
  }
}
