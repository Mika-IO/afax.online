// 🗄️  Record store. Prefers SQLite (built-in node:sqlite, Node ≥ 22.5) for
// indexed, concurrent-safe storage; transparently FALLS BACK to the original
// JSON-file store on older Node so AFAX still runs anywhere (the image, an old
// VPS, etc.). Same API either way — callers never know which backend is live.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { dataDir, ensureDir } from './paths.js';

const require = createRequire(import.meta.url);

export function cuid() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).toUpperCase();
}

// --- backend selection ------------------------------------------------------
let MODE = null; // 'sqlite' | 'json'
let DatabaseSync = null;
let warned = false;

function selectBackend() {
  if (MODE) return MODE;
  if (process.env.AFAX_STORE === 'json') { MODE = 'json'; return MODE; }   // explicit opt-out
  const orig = process.emitWarning;
  process.emitWarning = (w, ...a) => {
    const code = a[0] && (a[0].code || a[0].type || a[0]);
    const msg = typeof w === 'string' ? w : (w && w.message) || '';
    if (code === 'ExperimentalWarning' || /SQLite is an experimental/i.test(msg)) return;
    return orig.call(process, w, ...a);
  };
  try {
    ({ DatabaseSync } = require('node:sqlite'));
    MODE = 'sqlite';
  } catch {
    MODE = 'json';
    if (!warned) { warned = true; try { process.stderr.write('AFAX: node:sqlite unavailable (Node < 22.5) — using the JSON store.\n'); } catch {} }
  } finally {
    process.emitWarning = orig;
  }
  return MODE;
}

// =====================  SQLite backend  =====================================
const handles = new Map();
function db(slug) {
  const dir = ensureDir(dataDir(slug));
  const path = join(dir, 'records.db');
  if (handles.has(path)) return handles.get(path);
  const conn = new DatabaseSync(path);
  conn.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  conn.exec('CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (collection, id));');
  conn.exec('CREATE INDEX IF NOT EXISTS idx_records_collection ON records(collection);');
  conn.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);');
  handles.set(path, conn);
  migrateJSON(conn, dir);
  return conn;
}

function migrateJSON(conn, dir) {
  if (conn.prepare('SELECT v FROM meta WHERE k = ?').get('migrated')) return;
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch {}
  const ins = conn.prepare('INSERT OR REPLACE INTO records (collection, id, data) VALUES (?, ?, ?)');
  for (const f of files) {
    const name = f.slice(0, -5);
    let arr;
    try { arr = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
    if (Array.isArray(arr) && arr.length) {
      conn.exec('BEGIN');
      for (const rec of arr) { const id = rec.id || cuid(); ins.run(name, id, JSON.stringify({ ...rec, id })); }
      conn.exec('COMMIT');
    }
    try { renameSync(join(dir, f), join(dir, f + '.bak')); } catch {}
  }
  conn.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)').run('migrated', '1');
}

const SQL = {
  read(name, fallback = []) {
    try {
      const rows = db().prepare('SELECT data FROM records WHERE collection = ? ORDER BY rowid').all(name);
      return rows.length ? rows.map((r) => JSON.parse(r.data)) : (fallback ?? []);
    } catch { return fallback ?? []; }
  },
  write(name, data) {
    const conn = db();
    const ins = conn.prepare('INSERT INTO records (collection, id, data) VALUES (?, ?, ?)');
    conn.exec('BEGIN');
    conn.prepare('DELETE FROM records WHERE collection = ?').run(name);
    for (const rec of data) { const id = rec.id || cuid(); ins.run(name, id, JSON.stringify({ ...rec, id })); }
    conn.exec('COMMIT');
    return data;
  },
  add(name, item) {
    const record = { id: item.id || cuid(), createdAt: new Date().toISOString(), ...item };
    db().prepare('INSERT OR REPLACE INTO records (collection, id, data) VALUES (?, ?, ?)').run(name, record.id, JSON.stringify(record));
    return record;
  },
  addMany(name, items) {
    if (!items.length) return [];
    const conn = db();
    const ins = conn.prepare('INSERT OR REPLACE INTO records (collection, id, data) VALUES (?, ?, ?)');
    const created = items.map((item) => ({ id: item.id || cuid(), createdAt: new Date().toISOString(), ...item }));
    conn.exec('BEGIN');
    for (const rec of created) ins.run(name, rec.id, JSON.stringify(rec));
    conn.exec('COMMIT');
    return created;
  },
  update(name, id, patch) {
    const conn = db();
    const row = conn.prepare('SELECT data FROM records WHERE collection = ? AND id = ?').get(name, id);
    if (!row) return null;
    const merged = { ...JSON.parse(row.data), ...patch, updatedAt: new Date().toISOString() };
    conn.prepare('UPDATE records SET data = ? WHERE collection = ? AND id = ?').run(JSON.stringify(merged), name, id);
    return merged;
  },
  remove(name, id) {
    return Number(db().prepare('DELETE FROM records WHERE collection = ? AND id = ?').run(name, id).changes) || 0;
  },
  exportAll(slug) {
    const conn = db(slug);
    const names = conn.prepare('SELECT DISTINCT collection FROM records').all().map((r) => r.collection);
    const out = {};
    for (const name of names) out[name] = conn.prepare('SELECT data FROM records WHERE collection = ? ORDER BY rowid').all(name).map((r) => JSON.parse(r.data));
    return out;
  },
  importAll(slug, dataObj, { merge = false } = {}) {
    const conn = db(slug);
    let total = 0;
    for (const [name, rows] of Object.entries(dataObj || {})) {
      if (!Array.isArray(rows)) continue;
      const ins = conn.prepare('INSERT OR REPLACE INTO records (collection, id, data) VALUES (?, ?, ?)');
      conn.exec('BEGIN');
      if (!merge) conn.prepare('DELETE FROM records WHERE collection = ?').run(name);
      for (const rec of rows) { const id = rec.id || cuid(); ins.run(name, id, JSON.stringify({ ...rec, id })); }
      conn.exec('COMMIT');
      total += rows.length;
    }
    return total;
  },
};

// =====================  JSON-file backend (fallback)  =======================
const file = (name, slug) => join(ensureDir(dataDir(slug)), `${name}.json`);
const readFile = (name, slug, fb = []) => { const f = file(name, slug); if (!existsSync(f)) return fb; try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return fb; } };
const writeFile = (name, data, slug) => { writeFileSync(file(name, slug), JSON.stringify(data, null, 2)); return data; };

const JSONB = {
  read: (name, fallback = []) => readFile(name, undefined, fallback),
  write: (name, data) => writeFile(name, data),
  add(name, item) {
    const list = readFile(name); const record = { id: item.id || cuid(), createdAt: new Date().toISOString(), ...item };
    list.push(record); writeFile(name, list); return record;
  },
  addMany(name, items) {
    if (!items.length) return [];
    const list = readFile(name);
    const created = items.map((item) => ({ id: item.id || cuid(), createdAt: new Date().toISOString(), ...item }));
    for (const r of created) list.push(r); writeFile(name, list); return created;
  },
  update(name, id, patch) {
    const list = readFile(name); const i = list.findIndex((x) => x.id === id);
    if (i === -1) return null;
    list[i] = { ...list[i], ...patch, updatedAt: new Date().toISOString() }; writeFile(name, list); return list[i];
  },
  remove(name, id) { const list = readFile(name); const next = list.filter((x) => x.id !== id); writeFile(name, next); return list.length - next.length; },
  exportAll(slug) {
    const dir = ensureDir(dataDir(slug)); const out = {};
    let files = []; try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch {}
    for (const f of files) { const arr = readFile(f.slice(0, -5), slug); if (Array.isArray(arr) && arr.length) out[f.slice(0, -5)] = arr; }
    return out;
  },
  importAll(slug, dataObj, { merge = false } = {}) {
    let total = 0;
    for (const [name, rows] of Object.entries(dataObj || {})) {
      if (!Array.isArray(rows)) continue;
      let out = rows;
      if (merge) { const cur = readFile(name, slug); const ids = new Set(cur.map((x) => x.id)); out = cur.concat(rows.filter((r) => !ids.has(r.id))); }
      writeFile(name, out, slug); total += rows.length;
    }
    return total;
  },
};

// =====================  public API (dispatches to the live backend)  ========
const b = () => (selectBackend() === 'sqlite' ? SQL : JSONB);
export const read = (name, fallback = []) => b().read(name, fallback);
export const write = (name, data) => b().write(name, data);
export const add = (name, item) => b().add(name, item);
export const addMany = (name, items) => b().addMany(name, items);
export const update = (name, id, patch) => b().update(name, id, patch);
export const find = (name, pred) => read(name).find(pred) || null;
export const remove = (name, id) => b().remove(name, id);
export const exportAll = (slug) => b().exportAll(slug);
export const importAll = (slug, dataObj, opts) => b().importAll(slug, dataObj, opts);
