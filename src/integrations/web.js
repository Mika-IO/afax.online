// Fetch a public web page and reduce it to readable text — for company
// context ingestion. Native fetch, zero deps.
import { http } from './http.js';

export async function fetchText(url, maxChars = 8000) {
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  let html;
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'AFAX/0.1 (+https://afax.online)' } });
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
