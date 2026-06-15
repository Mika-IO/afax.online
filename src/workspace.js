// 🏢 Multi-company workspaces. Each workspace = isolated business profile,
// integrations, data and memory under ~/.afax/workspaces/<slug>/.
import { existsSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GLOBAL_CONFIG, workspacesRoot, workspaceDir, dataDir, activeSlug, slugify, ensureDir } from './paths.js';
import { load, save, reset } from './config.js';
import { c, header, table, ok, info, warn, log } from './logger.js';

export function listSlugs() {
  const root = workspacesRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((d) => {
    try { return statSync(join(root, d)).isDirectory(); } catch { return false; }
  });
}

export function createWorkspace(name) {
  const slug = slugify(name);
  ensureDir(dataDir(slug));
  // Seed a config with the business name if not present.
  const cfgPath = join(workspaceDir(slug), 'config.json');
  if (!existsSync(cfgPath)) {
    writeFileSync(cfgPath, JSON.stringify({ business: { name }, integrations: {} }, null, 2));
  }
  return slug;
}

export function useWorkspace(name) {
  const slug = slugify(name);
  if (!listSlugs().includes(slug)) createWorkspace(name);
  // Update only the global activeWorkspace pointer.
  let g = {};
  try { g = JSON.parse(readFileSync(GLOBAL_CONFIG, 'utf8')); } catch {}
  g.activeWorkspace = slug;
  ensureDir(GLOBAL_CONFIG.slice(0, GLOBAL_CONFIG.lastIndexOf('/')));
  writeFileSync(GLOBAL_CONFIG, JSON.stringify(g, null, 2));
  reset();
  return slug;
}

// Machine-readable list for the web UI: [{slug, name, active, leads, deals}].
export function summary() {
  const active = activeSlug();
  const slugs = listSlugs().length ? listSlugs() : ['default'];
  return slugs.map((slug) => {
    const p = readWsProfile(slug);
    const c = quickCounts(slug);
    return { slug, name: p?.business?.name || slug, active: slug === active, leads: c.leads, deals: c.deals };
  });
}

// afax workspace [list|create <name>|use <name>|rm <name>|current]
export function cmd(args) {
  const action = args._[0] || 'list';

  if (action === 'create') {
    const name = args._.slice(1).join(' ') || args.name;
    if (!name) return warn('Usage: afax workspace create "Acme Inc"');
    const slug = createWorkspace(name);
    ok(`Workspace ${c.bold(slug)} created. Switch: ${c.cyan('afax workspace use ' + slug)}`);
    return;
  }
  if (action === 'use') {
    const name = args._.slice(1).join(' ') || args.name;
    if (!name) return warn('Usage: afax workspace use acme-inc');
    const slug = useWorkspace(name);
    ok(`Active workspace → ${c.bold(slug)}`);
    info(`Set up its profile: ${c.cyan('afax context ingest <url>')} or ${c.cyan('afax init')}`);
    return;
  }
  if (action === 'rm') {
    const slug = slugify(args._.slice(1).join(' ') || args.name);
    if (slug === 'default') return warn('Cannot remove the default workspace.');
    if (!listSlugs().includes(slug)) return warn(`No workspace "${slug}".`);
    rmSync(workspaceDir(slug), { recursive: true, force: true });
    if (activeSlug() === slug) useWorkspace('default');
    ok(`Removed workspace ${slug}.`);
    return;
  }
  if (action === 'current') {
    return log(activeSlug());
  }

  // list
  header('🏢 Workspaces', 'One company per workspace · isolated data');
  const active = activeSlug();
  const slugs = listSlugs().length ? listSlugs() : ['default'];
  table(
    ['', 'Workspace', 'Company', 'Leads', 'Deals'],
    slugs.map((slug) => {
      const profile = readWsProfile(slug);
      const counts = quickCounts(slug);
      return [
        slug === active ? c.green('●') : ' ',
        slug,
        profile?.business?.name || '—',
        counts.leads,
        counts.deals,
      ];
    })
  );
  log('');
  info(`Active: ${c.bold(active)}. Create: ${c.cyan('afax workspace create "New Co"')}`);
}

function readWsProfile(slug) {
  const p = join(workspaceDir(slug), 'config.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function quickCounts(slug) {
  const d = dataDir(slug);
  const count = (name) => {
    const f = join(d, name + '.json');
    if (!existsSync(f)) return 0;
    try { return JSON.parse(readFileSync(f, 'utf8')).length; } catch { return 0; }
  };
  return { leads: count('leads'), deals: count('deals') };
}
