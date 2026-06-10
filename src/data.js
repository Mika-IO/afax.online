// Export / import a workspace: business profile + integrations + all data +
// memory. Secrets are redacted by default. Portable JSON for backup or moving
// a company between machines.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceDir, dataDir, activeSlug, slugify, ensureDir } from './paths.js';
import { COLLECTIONS } from './store.js';
import { createWorkspace } from './workspace.js';
import { c, header, ok, info, warn, log } from './logger.js';

const SECRET_RE = /(apikey|token|pass|secret|webhook|key)$/i;

function readWsConfig(slug) {
  const p = join(workspaceDir(slug), 'config.json');
  if (!existsSync(p)) return { business: {}, integrations: {} };
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return { business: {}, integrations: {} }; }
}

function redactObj(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') out[k] = redactObj(v);
    else if (SECRET_RE.test(k) && v) out[k] = '***REDACTED***';
    else out[k] = v;
  }
  return out;
}

export function buildExport(slug = activeSlug(), { withSecrets = false } = {}) {
  const wsConfig = readWsConfig(slug);
  const profile = withSecrets ? wsConfig : { ...wsConfig, integrations: redactObj(wsConfig.integrations) };
  const data = {};
  for (const name of COLLECTIONS) {
    const f = join(dataDir(slug), name + '.json');
    if (existsSync(f)) {
      try { data[name] = JSON.parse(readFileSync(f, 'utf8')); } catch {}
    }
  }
  return {
    afax: 'workspace-export',
    version: 1,
    workspace: slug,
    exportedAt: new Date().toISOString(),
    profile,
    data,
  };
}

// afax export [--out file.json] [--with-secrets] [--workspace slug]
export function exportCmd(args) {
  const slug = args.workspace ? slugify(args.workspace) : activeSlug();
  const payload = buildExport(slug, { withSecrets: !!args['with-secrets'] });
  const out = args.out || `afax-${slug}-${Date.now()}.json`;
  writeFileSync(out, JSON.stringify(payload, null, 2));
  const rows = Object.values(payload.data).reduce((s, a) => s + a.length, 0);
  header('📦 Export', `Workspace ${slug}`);
  ok(`Exported → ${c.bold(out)}  (${rows} records${args['with-secrets'] ? c.yellow(', INCLUDING secrets') : ', secrets redacted'})`);
  if (!args['with-secrets']) info('Re-add API keys after import (afax connect ...).');
}

// afax import <file> [--workspace slug] [--merge]
export function importCmd(args) {
  const file = args._[0];
  if (!file || !existsSync(file)) return warn('Usage: afax import <file.json> [--workspace name] [--merge]');
  let payload;
  try { payload = JSON.parse(readFileSync(file, 'utf8')); } catch { return warn('Invalid JSON file.'); }
  if (payload.afax !== 'workspace-export') return warn('Not an AFAX export file.');

  const slug = createWorkspace(args.workspace || payload.workspace || 'imported');
  // Profile
  const cfgPath = join(workspaceDir(slug), 'config.json');
  let existing = { business: {}, integrations: {} };
  if (args.merge && existsSync(cfgPath)) { try { existing = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch {} }
  const merged = {
    business: { ...existing.business, ...(payload.profile?.business || {}) },
    integrations: deepMergeSafe(existing.integrations || {}, payload.profile?.integrations || {}),
  };
  ensureDir(workspaceDir(slug));
  writeFileSync(cfgPath, JSON.stringify(merged, null, 2));

  // Data collections
  ensureDir(dataDir(slug));
  let total = 0;
  for (const [name, rows] of Object.entries(payload.data || {})) {
    const f = join(dataDir(slug), name + '.json');
    let out = rows;
    if (args.merge && existsSync(f)) {
      try {
        const cur = JSON.parse(readFileSync(f, 'utf8'));
        const ids = new Set(cur.map((x) => x.id));
        out = cur.concat(rows.filter((r) => !ids.has(r.id)));
      } catch {}
    }
    writeFileSync(f, JSON.stringify(out, null, 2));
    total += rows.length;
  }
  header('📥 Import', `→ workspace ${slug}`);
  ok(`Imported ${total} records into ${c.bold(slug)}.`);
  info(`Switch to it: ${c.cyan('afax workspace use ' + slug)}`);
  if (JSON.stringify(merged.integrations).includes('REDACTED')) warn('Secrets were redacted in this export — reconnect with afax connect.');
}

// Don't overwrite real values with REDACTED placeholders.
function deepMergeSafe(base, over) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over || {})) {
    if (v === '***REDACTED***') continue;
    if (v && typeof v === 'object') out[k] = deepMergeSafe(out[k] || {}, v);
    else out[k] = v;
  }
  return out;
}
