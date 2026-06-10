// Minimal .env loader (zero-dep). Reads .env from cwd then AFAX_HOME-adjacent,
// without overwriting variables already set in the real environment.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadEnv(dir = process.cwd()) {
  const path = join(dir, '.env');
  if (!existsSync(path)) return;
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return; }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    // strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
