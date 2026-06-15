// 💸 Usage & budget — a persistent ledger of every LLM call (tokens + cost) plus
// budget enforcement. Recorded centrally for ALL calls (chat, context, content…)
// so spend is always visible and capped. Stored per workspace in ~/.afax.
import { read, add } from './store.js';
import { load } from './config.js';
import { costOf } from './llm/pricing.js';

// Record one call. usage = { input, output }. Returns the ledger row (with cost).
export function record({ provider, model, usage }) {
  if (!usage || (!usage.input && !usage.output)) return null;
  const cost = costOf(model, usage);
  return add('usage', { provider, model, input: usage.input || 0, output: usage.output || 0, cost });
}

function sum(rows) {
  return rows.reduce(
    (a, r) => ({ calls: a.calls + 1, input: a.input + (r.input || 0), output: a.output + (r.output || 0), cost: a.cost + (r.cost || 0) }),
    { calls: 0, input: 0, output: 0, cost: 0 }
  );
}

export function monthTotals(date = new Date()) {
  const ym = date.toISOString().slice(0, 7);
  return sum(read('usage', []).filter((r) => (r.createdAt || '').startsWith(ym)));
}

export function allTotals() {
  return sum(read('usage', []));
}

// Monthly budget state for the active workspace. monthly<=0 means unlimited.
export function budgetState(cfg = load()) {
  const monthly = Number(cfg.budget?.monthly) || 0;
  const spent = monthTotals().cost;
  return {
    monthly,
    spent,
    over: monthly > 0 && spent >= monthly,
    remaining: monthly > 0 ? Math.max(0, monthly - spent) : Infinity,
  };
}

// Throw if the monthly cap is already reached (called before each LLM request).
export function assertBudget(cfg = load()) {
  const b = budgetState(cfg);
  if (b.over) {
    throw new Error(
      `Monthly LLM budget reached: $${b.spent.toFixed(2)} / $${b.monthly.toFixed(2)}. ` +
        `Raise it with: afax config set budget.monthly <usd>  (0 = unlimited)`
    );
  }
}

// Compact human strings.
export const fmtUSD = (n) => '$' + (n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2));
export const fmtTok = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));
