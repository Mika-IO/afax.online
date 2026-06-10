// Tiny fetch wrapper with JSON, error surfacing, and retry/backoff on
// transient failures (429 + 5xx + network). Native fetch, zero deps.
export async function http(url, { method = 'GET', headers = {}, json, body, form, retries = 3, timeout = 60000 } = {}) {
  const opts = { method, headers: { ...headers } };
  if (json !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(json);
  } else if (form) {
    opts.headers['content-type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    opts.body = body;
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timer);
      const text = await res.text();
      let data = text;
      try { data = JSON.parse(text); } catch {}
      if (!res.ok) {
        // Retry on rate-limit / server errors.
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await sleep(backoff(attempt, res.headers.get('retry-after')));
          continue;
        }
        const msg = typeof data === 'object' ? JSON.stringify(data).slice(0, 400) : String(data).slice(0, 400);
        throw new Error(`${res.status} ${res.statusText} — ${msg}`);
      }
      return data;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      // Network/abort errors are retryable; thrown HTTP errors above are not.
      const retryable = e.name === 'AbortError' || /fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN/i.test(e.message);
      if (retryable && attempt < retries) {
        await sleep(backoff(attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function backoff(attempt, retryAfter) {
  if (retryAfter && !isNaN(Number(retryAfter))) return Number(retryAfter) * 1000;
  return Math.min(1000 * 2 ** attempt + Math.random() * 250, 15000);
}
