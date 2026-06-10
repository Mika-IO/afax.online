// Persistent agent memory — facts the orchestrator and agents accumulate over time.
// Mirrors Hermes' "persistent memory" idea: context survives across runs.
import { read, write, cuid } from './store.js';

const COLLECTION = 'memory';

export function remember(scope, text, meta = {}) {
  const list = read(COLLECTION, []);
  list.push({ id: cuid(), scope, text, meta, at: new Date().toISOString() });
  // Cap to last 500 facts to keep prompts lean.
  write(COLLECTION, list.slice(-500));
}

export function recall(scope, limit = 12) {
  const list = read(COLLECTION, []);
  const filtered = scope ? list.filter((m) => m.scope === scope) : list;
  return filtered.slice(-limit);
}

// Compact memory block for injection into agent prompts.
export function memoryBlock(scope, limit = 8) {
  const facts = recall(scope, limit);
  if (!facts.length) return '';
  return (
    'Known context (persistent memory):\n' +
    facts.map((f) => `- ${f.text}`).join('\n')
  );
}

export function forgetAll() {
  write(COLLECTION, []);
}
