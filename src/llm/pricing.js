// Approximate LLM pricing, USD per 1M tokens [input, output]. Public list prices
// as of early 2026 — estimates, used only to give the user a live cost signal.
// Matched by model-name prefix; unknown models fall back to a rough default.
const PRICES = [
  // Anthropic
  ['claude-opus', [15, 75]],
  ['claude-sonnet', [3, 15]],
  ['claude-haiku', [0.8, 4]],
  ['claude-fable', [3, 15]],
  // OpenAI
  ['gpt-5-mini', [0.25, 2]],
  ['gpt-5-nano', [0.05, 0.4]],
  ['gpt-5', [1.25, 10]],
  ['gpt-4o-mini', [0.15, 0.6]],
  ['gpt-4o', [2.5, 10]],
  ['gpt-4.1-mini', [0.4, 1.6]],
  ['gpt-4.1', [2, 8]],
  ['o4-mini', [1.1, 4.4]],
  ['o3-mini', [1.1, 4.4]],
  ['o3', [2, 8]],
  ['o1', [15, 60]],
  // Local / offline
  ['llama', [0, 0]],
  ['qwen', [0, 0]],
  ['mistral', [0, 0]],
  ['gemma', [0, 0]],
  ['phi', [0, 0]],
];

const FALLBACK = [1, 3]; // unknown hosted model — rough guess

// Returns { in, out, estimated } in USD per 1M tokens.
export function priceOf(model = '') {
  const m = String(model).toLowerCase();
  for (const [prefix, [inp, out]] of PRICES) {
    if (m.includes(prefix)) return { in: inp, out, estimated: false };
  }
  return { in: FALLBACK[0], out: FALLBACK[1], estimated: true };
}

// Cost in USD for one call given { input, output } token counts.
export function costOf(model, usage = {}) {
  const p = priceOf(model);
  return ((usage.input || 0) * p.in + (usage.output || 0) * p.out) / 1e6;
}
