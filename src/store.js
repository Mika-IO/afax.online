// Persistence facade. State lives in a per-workspace SQLite DB (see db.js);
// this module keeps the historical store API so every caller is unchanged.
import { AFAX_HOME } from './paths.js';
export { AFAX_HOME };
export { read, write, add, addMany, update, find, remove, cuid } from './db.js';

// Names of all known collections (for export/import + the panel DB views).
export const COLLECTIONS = [
  'leads', 'contacts', 'crm_notes', 'deals', 'messages', 'posts',
  'campaigns', 'channels', 'content', 'flows', 'schedule',
  'revenue', 'expenses', 'invoices', 'memory', 'inbox', 'usage', 'tasks', 'conversations', 'suppressions',
];
