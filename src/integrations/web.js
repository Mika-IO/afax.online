// Fetch a public web page and reduce it to readable text — for company
// context ingestion. Native fetch, zero deps. URLs are agent-/user-controlled,
// so every fetch passes the SSRF guard (no loopback/private/metadata targets).
import { http } from './http.js';
import { assertSafeUrl } from './ssrf.js';

export async function fetchText(url, maxChars = 8000) {
  url = await assertSafeUrl(url);
  let html;
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'AFAX/0.1 (+https://afax.online)' },
      redirect: 'error', // don't follow redirects into private space
      signal: AbortSignal.timeout(15000),
    });
    html = await res.text();
  } catch (e) {
    throw new Error(`Could not fetch ${url}: ${e.message}`);
  }
  const text = stripHtml(html);
  return { url, title: titleOf(html), text: text.slice(0, maxChars) };
}

// Richer fetch for agent inspection: returns HTTP status + redirect location so
// the agent can tell 200 vs 404 vs a redirect (e.g. /wp-admin → login). Still
// SSRF-guarded; does not follow redirects (manual) into private space.
export async function fetchPage(url, maxChars = 4000) {
  url = await assertSafeUrl(url);
  let res, body = '';
  try {
    res = await fetch(url, {
      headers: { 'user-agent': 'AFAX/0.1 (+https://afax.online)' },
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    body = await res.text().catch(() => '');
  } catch (e) {
    throw new Error(`Could not fetch ${url}: ${e.message}`);
  }
  return {
    url, status: res.status, ok: res.ok,
    location: res.headers.get('location') || '',
    contentType: res.headers.get('content-type') || '',
    title: titleOf(body),
    text: stripHtml(body).slice(0, maxChars),
  };
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleOf(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : '';
}

export { http };
