// Filesystem paths + active-workspace resolution. No imports from config/store
// to avoid cycles. This is the single source of truth for where data lives.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';

export const AFAX_HOME = process.env.AFAX_HOME || join(homedir(), '.afax');
export const GLOBAL_CONFIG = join(AFAX_HOME, 'config.json');
const WORKSPACES = join(AFAX_HOME, 'workspaces');

export function slugify(name) {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default';
}

// Active workspace: env override, else global config field, else 'default'.
export function activeSlug() {
  if (process.env.AFAX_WORKSPACE) return slugify(process.env.AFAX_WORKSPACE);
  try {
    const g = JSON.parse(readFileSync(GLOBAL_CONFIG, 'utf8'));
    if (g.activeWorkspace) return slugify(g.activeWorkspace);
  } catch {}
  return 'default';
}

export function workspaceDir(slug = activeSlug()) {
  return join(WORKSPACES, slug);
}
export function wsConfigPath(slug = activeSlug()) {
  return join(workspaceDir(slug), 'config.json');
}
export function dataDir(slug = activeSlug()) {
  return join(workspaceDir(slug), 'data');
}
export function workspacesRoot() {
  return WORKSPACES;
}

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
