// Provider-agnostic chat interface. One `chat()` call, many backends.
import { activeProvider } from '../config.js';
import { record, assertBudget } from '../usage.js';
import { chat as anthropic } from './anthropic.js';
import { chat as openai } from './openai.js';
import { chat as ollama } from './ollama.js';

const PROVIDERS = { anthropic, openai, ollama };

/**
 * chat({ system, messages, json, temperature, maxTokens, onToken })
 *  - messages: [{ role: 'user'|'assistant', content: string }]
 *  - json: true => instructs model to return JSON, parses it for you
 * Returns: { text, json?, usage }. Every call is metered and budget-checked.
 */
export async function chat(opts) {
  const p = activeProvider();
  const impl = PROVIDERS[p.name];
  if (!impl) throw new Error(`No LLM adapter for provider "${p.name}".`);

  assertBudget(); // refuse the call if the monthly cap is already hit

  const system = opts.json
    ? `${opts.system || ''}\n\nRespond with valid minified JSON only. No markdown, no prose, no code fences.`.trim()
    : opts.system;

  const model = opts.model || p.model;
  const res = await impl({
    apiKey: p.apiKey,
    model,
    baseUrl: p.baseUrl,
    system,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.6,
    maxTokens: opts.maxTokens ?? 2048,
    onToken: opts.onToken,
    signal: opts.signal,
  });

  // Providers return { text, usage }; tolerate a bare string for safety.
  const text = typeof res === 'string' ? res : (res.text || '');
  const usage = (typeof res === 'object' && res.usage) || null;
  if (usage) record({ provider: p.name, model, usage });

  if (opts.json) return { text, json: parseJSON(text), usage };
  return { text, usage };
}

// Tolerant JSON extraction — strips fences / surrounding prose if a model adds them.
export function parseJSON(text) {
  if (!text) throw new Error('Empty model response.');
  let s = text.trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(s);
  } catch {
    const first = Math.min(
      ...['{', '['].map((ch) => {
        const i = s.indexOf(ch);
        return i === -1 ? Infinity : i;
      })
    );
    const last = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (first !== Infinity && last > first) {
      return JSON.parse(s.slice(first, last + 1));
    }
    throw new Error('Model did not return parseable JSON.');
  }
}

export { activeProvider };
