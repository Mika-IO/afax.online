// OpenAI-compatible Chat Completions adapter (via retrying http()).
// Works with OpenAI, Groq, OpenRouter, Together, vLLM, LM Studio, etc.
import { http } from '../integrations/http.js';

export async function chat({ apiKey, model, baseUrl, system, messages, temperature, maxTokens }) {
  if (!apiKey) throw new Error('Missing API key for OpenAI-compatible provider. Run: afax config set providers.openai.apiKey <key>  (or export OPENAI_API_KEY)');
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  for (const m of messages) msgs.push({ role: m.role, content: m.content });

  const data = await http(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    json: { model, messages: msgs, temperature, max_tokens: maxTokens },
  });
  return (data.choices?.[0]?.message?.content || '').trim();
}
