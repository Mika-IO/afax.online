// OpenAI-compatible Chat Completions adapter (via retrying http()).
// Works with OpenAI, Groq, OpenRouter, Together, vLLM, LM Studio, etc.
// Newer OpenAI models accept only `max_completion_tokens` (and some reject
// custom `temperature`); older/compatible servers accept only `max_tokens`.
// We learn per-model from the API's 400s and retry once with the other shape.
import { http } from '../integrations/http.js';

const needsNewParams = new Set(); // model names that rejected max_tokens/temperature

export async function chat({ apiKey, model, baseUrl, system, messages, temperature, maxTokens }) {
  if (!apiKey) throw new Error('Missing API key for OpenAI-compatible provider. Run: afax config set providers.openai.apiKey <key>  (or export OPENAI_API_KEY)');
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  for (const m of messages) msgs.push({ role: m.role, content: m.content });

  const payload = (modern) => ({
    model,
    messages: msgs,
    ...(modern
      ? { max_completion_tokens: maxTokens }
      : { temperature, max_tokens: maxTokens }),
  });

  const call = (modern) =>
    http(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      json: payload(modern),
    });

  let data;
  try {
    data = await call(needsNewParams.has(model));
  } catch (e) {
    if (/max_tokens|max_completion_tokens|temperature/.test(e.message) && /unsupported|not supported/i.test(e.message)) {
      needsNewParams.add(model);
      data = await call(true);
    } else {
      throw e;
    }
  }
  return (data.choices?.[0]?.message?.content || '').trim();
}
