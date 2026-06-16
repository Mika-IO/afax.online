// OpenAI-compatible Chat Completions adapter (via retrying http()).
// Works with OpenAI, Groq, OpenRouter, Together, vLLM, LM Studio, etc.
// Newer/reasoning models (o-series, gpt-5) accept only `max_completion_tokens`,
// reject custom `temperature`, and support `reasoning_effort`. Reasoning tokens
// eat the completion budget, so we give those models far more headroom and a
// low effort so visible tokens start streaming quickly. We learn the rest from
// the API's 400s and retry with the corrected shape.
// Returns { text, usage:{ input, output } }.
import { http } from '../integrations/http.js';
import { streamPost } from './stream.js';

const needsNewParams = new Set();  // models that rejected max_tokens/temperature
const noEffort = new Set();        // models that rejected reasoning_effort
const noStreamOpts = new Set();    // servers that rejected stream_options

const isReasoning = (model) => /^(o[0-9]|gpt-5)/i.test(model);
const usageOf = (u) => (u ? { input: u.prompt_tokens || 0, output: u.completion_tokens || 0 } : null);

export async function chat({ apiKey, model, baseUrl, system, messages, temperature, maxTokens, onToken, signal }) {
  if (!apiKey) throw new Error('Missing API key for OpenAI-compatible provider. Run: afax config set providers.openai.apiKey <key>  (or export OPENAI_API_KEY)');
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  for (const m of messages) msgs.push({ role: m.role, content: m.content });

  const reasoning = isReasoning(model);
  // Reasoning models spend most of the budget thinking before any visible
  // content, so small caps come back empty. Floor at 8k for them.
  const budget = reasoning ? Math.max(maxTokens, 8000) : maxTokens;

  const payload = (modern) => {
    const base = { model, messages: msgs };
    if (modern) {
      base.max_completion_tokens = budget;
      if (reasoning && !noEffort.has(model)) base.reasoning_effort = 'low';
    } else {
      base.temperature = temperature;
      base.max_tokens = budget;
    }
    return base;
  };

  const unsupportedParams = (e) =>
    /max_tokens|max_completion_tokens|temperature/.test(e.message) && /unsupported|not supported/i.test(e.message);
  const unsupportedEffort = (e) => /reasoning_effort/.test(e.message);
  const unsupportedStreamOpts = (e) => /stream_options/.test(e.message);

  async function attempt(send) {
    const modern = needsNewParams.has(model) || reasoning;
    try {
      return await send(modern);
    } catch (e) {
      if (unsupportedParams(e)) { needsNewParams.add(model); return send(true); }
      if (unsupportedEffort(e)) { noEffort.add(model); return send(needsNewParams.has(model) || reasoning); }
      if (unsupportedStreamOpts(e)) { noStreamOpts.add(model); return send(needsNewParams.has(model) || reasoning); }
      throw e;
    }
  }

  if (onToken) {
    return attempt(async (modern) => {
      let full = '';
      let usage = null;
      await streamPost(`${baseUrl}/chat/completions`, {
        headers: { authorization: `Bearer ${apiKey}` },
        json: {
          ...payload(modern),
          stream: true,
          ...(noStreamOpts.has(model) ? {} : { stream_options: { include_usage: true } }),
        },
        signal,
        onLine: (line) => {
          if (!line.startsWith('data:')) return;
          const d = line.slice(5).trim();
          if (d === '[DONE]') return;
          try {
            const j = JSON.parse(d);
            const t = j.choices?.[0]?.delta?.content || '';
            if (t) { full += t; onToken(t, full); }
            if (j.usage) usage = usageOf(j.usage);
          } catch {}
        },
      });
      return { text: full.trim(), usage };
    });
  }

  const data = await attempt((modern) =>
    http(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      json: payload(modern),
    })
  );
  return { text: (data.choices?.[0]?.message?.content || '').trim(), usage: usageOf(data.usage) };
}
