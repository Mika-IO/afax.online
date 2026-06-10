// Anthropic Messages API adapter (native fetch via retrying http()).
import { http } from '../integrations/http.js';

export async function chat({ apiKey, model, baseUrl, system, messages, temperature, maxTokens }) {
  if (!apiKey) throw new Error('Missing Anthropic API key. Run: afax config set providers.anthropic.apiKey <key>  (or export ANTHROPIC_API_KEY)');
  const data = await http(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    json: {
      model,
      max_tokens: maxTokens,
      temperature,
      ...(system ? { system } : {}),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    },
  });
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}
