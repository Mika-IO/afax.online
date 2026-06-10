// JSON file persistence, scoped to the ACTIVE workspace. Each collection is one
// file under ~/.afax/workspaces/<slug>/data/. Dir is resolved per call so a
// `workspace use` mid-process takes effect immediately.
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AFAX_HOME, dataDir, ensureDir } from './paths.js';

export { AFAX_HOME };

function file(name) {
  return join(ensureDir(dataDir()), `${name}.json`);
}

export function read(name, fallback = []) {
  const f = file(name);
  if (!existsSync(f)) return fallback;
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return fallback;
  }
}

export function write(name, data) {
  writeFileSync(file(name), JSON.stringify(data, null, 2));
  return data;
}

export function add(name, item) {
  const list = read(name, []);
  const record = {
    id: item.id || cuid(),
    createdAt: new Date().toISOString(),
    ...item,
  };
  list.push(record);
  write(name, list);
  return record;
}

export function update(name, id, patch) {
  const list = read(name, []);
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
  write(name, list);
  return list[idx];
}

export function find(name, pred) {
  return read(name, []).find(pred) || null;
}

// Names of all known collections (for export/import).
export const COLLECTIONS = [
  'leads', 'contacts', 'crm_notes', 'deals', 'messages', 'posts',
  'campaigns', 'channels', 'content', 'flows', 'schedule',
  'revenue', 'expenses', 'invoices', 'memory',
];

export function cuid() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).toUpperCase();
}
