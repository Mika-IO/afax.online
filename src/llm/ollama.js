// Ollama local-model adapter (via retrying http()). Runs fully offline.
import { http } from '../integrations/http.js';

export async function chat({ model, baseUrl, system, messages, temperature, maxTokens }) {
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  for (const m of messages) msgs.push({ role: m.role, content: m.content });

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
  return (data.message?.content || '').trim();
}
