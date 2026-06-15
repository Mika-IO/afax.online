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
