// 🗄️  SQLite-backed record store (node:sqlite, built-in — still zero-dependency).
// One DB file per workspace at <data>/records.db. Same shape as the old JSON
// store (collections of JSON records), but inserts/updates/deletes are indexed
// and O(1)/O(log n) instead of rewriting a whole file, and concurrent access
// (worker + chat) is safe via WAL + a busy timeout. Existing *.json collections
// are migrated automatically on first open (and kept as *.json.bak backups).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { existsSync, readFileSync, renameSync, readdirSync } from 'node:fs';
import { dataDir, ensureDir } from './paths.js';

const require = createRequire(import.meta.url);

// node:sqlite is "experimental" and prints a warning on load. Silence just that
// one warning (nothing else) while we require it — synchronously, so the store
// API stays synchronous.
let DatabaseSync;
function sqlite() {
  if (DatabaseSync) return DatabaseSync;
  const orig = process.emitWarning;
  process.emitWarning = (w, ...a) => {
    const code = a[0] && (a[0].code || a[0].type || a[0]);
    const msg = typeof w === 'string' ? w : (w && w.message) || '';
    if (code === 'ExperimentalWarning' || /SQLite is an experimental/i.test(msg)) return;
    return orig.call(process, w, ...a);
  };
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch (e) {
    throw new Error('AFAX needs Node ≥ 22.5 (built-in node:sqlite). Current Node is too old: ' + e.message);
  } finally {
    process.emitWarning = orig;
  }
  return DatabaseSync;
}

export function cuid() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).toUpperCase();
}

// One handle per workspace DB path (workspaces can switch mid-process).
const handles = new Map();
function db(slug) {
  const dir = ensureDir(dataDir(slug));
  const path = join(dir, 'records.db');
  if (handles.has(path)) return handles.get(path);
  const DB = sqlite();
  const conn = new DB(path);
  conn.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  conn.exec('CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (collection, id));');
  conn.exec('CREATE INDEX IF NOT EXISTS idx_records_collection ON records(collection);');
  conn.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);');
  handles.set(path, conn);
  migrateJSON(conn, dir);
  return conn;
}

// One-time import of any legacy <collection>.json files in this workspace.
function migrateJSON(conn, dir) {
  const done = conn.prepare('SELECT v FROM meta WHERE k = ?').get('migrated');
  if (done) return;
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch {}
  const ins = conn.prepare('INSERT OR REPLACE INTO records (collection, id, data) VALUES (?, ?, ?)');
  for (const f of files) {
    const name = f.slice(0, -5);
    let arr;
    try { arr = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
    if (Array.isArray(arr) && arr.length) {
      conn.exec('BEGIN');
      for (const rec of arr) {
        const id = rec.id || cuid();
        ins.run(name, id, JSON.stringify({ ...rec, id }));
      }
      conn.exec('COMMIT');
    }
    try { renameSync(join(dir, f), join(dir, f + '.bak')); } catch {}
  }
  conn.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)').run('migrated', '1');
}

// ---- public API (same signatures as the old JSON store) --------------------

export function read(name, fallback = []) {
  try {
    const rows = db().prepare('SELECT data FROM records WHERE collection = ? ORDER BY rowid').all(name);
    return rows.length ? rows.map((r) => JSON.parse(r.data)) : (fallback ?? []);
  } catch {
    return fallback ?? [];
  }
}

// Replace a whole collection (callers that do read → mutate → write).
export function write(name, data) {
  const conn = db();
  const ins = conn.prepare('INSERT INTO records (collection, id, data) VALUES (?, ?, ?)');
  conn.exec('BEGIN');
  conn.prepare('DELETE FROM records WHERE collection = ?').run(name);
  for (const rec of data) {
    const id = rec.id || cuid();
    ins.run(name, id, JSON.stringify({ ...rec, id }));
  }
  conn.exec('COMMIT');
  return data;
}

export function add(name, item) {
  const record = { id: item.id || cuid(), createdAt: new Date().toISOString(), ...item };
  db().prepare('INSERT OR REPLACE INTO records (collection, id, data) VALUES (?, ?, ?)').run(name, record.id, JSON.stringify(record));
  return record;
}

export function addMany(name, items) {
  if (!items.length) return [];
  const conn = db();
  const ins = conn.prepare('INSERT OR REPLACE INTO records (collection, id, data) VALUES (?, ?, ?)');
  const created = items.map((item) => ({ id: item.id || cuid(), createdAt: new Date().toISOString(), ...item }));
  conn.exec('BEGIN');
  for (const rec of created) ins.run(name, rec.id, JSON.stringify(rec));
  conn.exec('COMMIT');
  return created;
}

export function update(name, id, patch) {
  const conn = db();
  const row = conn.prepare('SELECT data FROM records WHERE collection = ? AND id = ?').get(name, id);
  if (!row) return null;
  const merged = { ...JSON.parse(row.data), ...patch, updatedAt: new Date().toISOString() };
  conn.prepare('UPDATE records SET data = ? WHERE collection = ? AND id = ?').run(JSON.stringify(merged), name, id);
  return merged;
}

export function find(name, pred) {
  return read(name).find(pred) || null;
}

export function remove(name, id) {
  const info = db().prepare('DELETE FROM records WHERE collection = ? AND id = ?').run(name, id);
  return Number(info.changes) || 0;
}

// ---- whole-workspace export / import (any slug, not just the active one) ----
export function exportAll(slug) {
  const conn = db(slug);
  const names = conn.prepare('SELECT DISTINCT collection FROM records').all().map((r) => r.collection);
  const out = {};
  for (const name of names) {
    out[name] = conn.prepare('SELECT data FROM records WHERE collection = ? ORDER BY rowid').all(name).map((r) => JSON.parse(r.data));
  }
  return out;
}

export function importAll(slug, dataObj, { merge = false } = {}) {
  const conn = db(slug);
  let total = 0;
  for (const [name, rows] of Object.entries(dataObj || {})) {
    if (!Array.isArray(rows)) continue;
    const ins = conn.prepare('INSERT OR REPLACE INTO records (collection, id, data) VALUES (?, ?, ?)');
    conn.exec('BEGIN');
    if (!merge) conn.prepare('DELETE FROM records WHERE collection = ?').run(name);
    for (const rec of rows) {
      const id = rec.id || cuid();
      ins.run(name, id, JSON.stringify({ ...rec, id }));
    }
    conn.exec('COMMIT');
    total += rows.length;
  }
  return total;
}
