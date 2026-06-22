// Anthropic Messages API adapter (native fetch via retrying http()).
import { http } from '../integrations/http.js';
import { streamPost } from './stream.js';

export async function chat({ apiKey, model, baseUrl, system, messages, temperature, maxTokens, onToken, signal }) {
  if (!apiKey) throw new Error('Missing Anthropic API key. Run: afax config set providers.anthropic.apiKey <key>  (or export ANTHROPIC_API_KEY)');
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    // Cache the (large, static) system prompt: business profile + style + tool
    // list are identical across calls, so within the 5-min TTL we re-read them at
    // ~0.1x input cost instead of paying full price every call. Below Anthropic's
    // min cacheable size it's simply ignored — no downside.
    ...(system ? { system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] } : {}),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  const headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };

  if (onToken) {
    let full = '';
    const usage = { input: 0, output: 0 };
    await streamPost(`${baseUrl}/v1/messages`, {
      headers,
      json: { ...body, stream: true },
      signal,
      onLine: (line) => {
        if (!line.startsWith('data:')) return;
        try {
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            const t = ev.delta.text || '';
            if (t) { full += t; onToken(t, full); }
          } else if (ev.type === 'message_start') {
            usage.input = ev.message?.usage?.input_tokens || 0;
          } else if (ev.type === 'message_delta') {
            usage.output = ev.usage?.output_tokens || usage.output;
          }
        } catch {}
      },
    });
    return { text: full.trim(), usage };
  }

  const data = await http(`${baseUrl}/v1/messages`, { method: 'POST', headers, json: body });
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return { text, usage: { input: data.usage?.input_tokens || 0, output: data.usage?.output_tokens || 0 } };
}
