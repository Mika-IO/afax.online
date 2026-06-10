// Real image generation via an OpenAI-compatible images endpoint.
// Works with OpenAI (gpt-image-1 / dall-e-3) and compatible providers.
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { integration } from '../config.js';
import { AFAX_HOME } from '../store.js';
import { http } from './http.js';

const ASSET_DIR = join(AFAX_HOME, 'assets');

export function status() {
  const m = integration('media');
  return { connected: !!m.apiKey, driver: m.driver, model: m.model };
}

// Public URL for a local asset, served by `afax serve` at /assets/<file>.
// Copies the file into the assets dir if it lives elsewhere.
// Returns '' when integrations.server.publicUrl is not configured.
export function hostedUrl(localPath) {
  const srv = integration('server');
  if (!srv?.publicUrl) return '';
  const name = localPath.split('/').pop();
  const dest = join(ASSET_DIR, name);
  if (!existsSync(dest) && existsSync(localPath)) {
    if (!existsSync(ASSET_DIR)) mkdirSync(ASSET_DIR, { recursive: true });
    copyFileSync(localPath, dest);
  }
  return srv.publicUrl.replace(/\/$/, '') + '/assets/' + encodeURIComponent(name);
}

// generateImage({ prompt, size }) -> { path } saved PNG.
export async function generateImage({ prompt, size = '1024x1024' }) {
  const m = integration('media');
  if (!m.apiKey) throw new Error('Media: missing API key (integrations.media.apiKey).');
  const data = await http(`${m.baseUrl}/images/generations`, {
    method: 'POST',
    headers: { authorization: `Bearer ${m.apiKey}` },
    json: { model: m.model, prompt, size, n: 1 },
  });
  const item = data?.data?.[0];
  if (!existsSync(ASSET_DIR)) mkdirSync(ASSET_DIR, { recursive: true });
  const file = join(ASSET_DIR, `img-${Date.now().toString(36)}.png`);

  if (item?.b64_json) {
    writeFileSync(file, Buffer.from(item.b64_json, 'base64'));
    return { path: file };
  }
  if (item?.url) {
    const res = await fetch(item.url);
    const arr = Buffer.from(await res.arrayBuffer());
    writeFileSync(file, arr);
    return { path: file, sourceUrl: item.url };
  }
  throw new Error('Media: provider returned no image.');
}
