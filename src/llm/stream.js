// Streaming POST for LLM token-by-token responses. Native fetch + body reader,
// zero deps. Calls onLine(line) for every newline-delimited line (SSE `data:`
// frames or NDJSON). No retry here — streams are stateful; callers retry whole.
export async function streamPost(url, { headers = {}, json, onLine, timeout = 120000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(json),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
  if (!res.ok || !res.body) {
    clearTimeout(timer);
    const t = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} — ${String(t).slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) onLine(line);
      }
    }
    if (buf.trim()) onLine(buf.trim());
  } finally {
    clearTimeout(timer);
  }
}
