// X (Twitter) — post tweets via API v2. Real HTTP, zero deps.
//
// Auth note: posting (POST /2/tweets) needs a USER-context token with the
// `tweet.write` scope — an OAuth2 user access token or OAuth1 user token. An
// app-only bearer token can READ but X rejects writes with 403. Put a
// user-context token in integrations.x.bearerToken to actually post.
import { integration } from '../config.js';
import { http } from './http.js';

export function status() {
  const x = integration('x');
  return { connected: !!x.bearerToken };
}

// post({ text }) -> { id, text } | throws
export async function post({ text }) {
  const x = integration('x');
  if (!x.bearerToken) throw new Error('Missing X token. Set integrations.x.bearerToken (a user-context token with tweet.write).');
  if (!text || !text.trim()) throw new Error('X: empty tweet text.');
  const body = text.length > 280 ? text.slice(0, 277) + '…' : text;
  try {
    const r = await http('https://api.x.com/2/tweets', {
      method: 'POST',
      headers: { authorization: `Bearer ${x.bearerToken}` },
      json: { text: body },
    });
    return { id: r.data?.id, text: r.data?.text || body };
  } catch (e) {
    if (/403/.test(e.message)) {
      throw new Error('X rejected the post (403). A read-only/app-only bearer token cannot tweet — use a user-context token with the tweet.write scope. — ' + e.message);
    }
    throw e;
  }
}
