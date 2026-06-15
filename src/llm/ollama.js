// Ollama local-model adapter (via retrying http()). Runs fully offline.
import { http } from '../integrations/http.js';
import { streamPost } from './stream.js';

export async function chat({ model, baseUrl, system, messages, temperature, maxTokens, onToken }) {
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  for (const m of messages) msgs.push({ role: m.role, content: m.content });

  const usageOf = (d) => ({ input: d?.prompt_eval_count || 0, output: d?.eval_count || 0 });

  if (onToken) {
    let full = '';
    let usage = { input: 0, output: 0 };
    try {
      await streamPost(`${baseUrl}/api/chat`, {
        json: { model, messages: msgs, stream: true, options: { temperature, num_predict: maxTokens } },
        onLine: (line) => {
          try {
            const j = JSON.parse(line);
            const t = j.message?.content || '';
            if (t) { full += t; onToken(t, full); }
            if (j.done) usage = usageOf(j);
          } catch {}
        },
      });
    } catch (e) {
      if (/fetch failed|ECONN|ENOTFOUND/i.test(e.message)) {
        throw new Error(`Cannot reach Ollama at ${baseUrl}. Is it running? (ollama serve)`);
      }
      throw e;
    }
    return { text: full.trim(), usage };
  }

  let data;
  try {
    data = await http(`${baseUrl}/api/chat`, {
      method: 'POST',
      json: { model, messages: msgs, stream: false, options: { temperature, num_predict: maxTokens } },
      timeout: 120000,
    });
  } catch (e) {
    if (/fetch failed|ECONN|ENOTFOUND/i.test(e.message)) {
      throw new Error(`Cannot reach Ollama at ${baseUrl}. Is it running? (ollama serve)`);
    }
    throw e;
  }
  return { text: (data.message?.content || '').trim(), usage: usageOf(data) };
}
