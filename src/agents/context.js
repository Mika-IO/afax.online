// 🧭 Context — ingest the company's real web presence into a rich, persistent
// profile every agent then uses. Mirrors how Polsia "learns your company".
import { load, save, hasLLM } from '../config.js';
import { chat } from '../llm/index.js';
import { remember, recall } from '../memory.js';
import { fetchText } from '../integrations/web.js';
import { c, header, ok, info, warn, spin, log, dim, table } from '../logger.js';

// afax context ingest <url>
// afax context show
// afax context set <field> <value>
export async function cmd(args) {
  const sub = args._[0];
  if (sub === 'show' || !sub) return show();
  if (sub === 'set') {
    const field = args._[1];
    const value = args._.slice(2).join(' ');
    const cfg = load();
    if (!(field in cfg.business)) return warn(`Fields: ${Object.keys(cfg.business).join(', ')}`);
    cfg.business[field] = value;
    save(cfg);
    return ok(`business.${field} = ${value}`);
  }
  if (sub === 'ingest') return ingest(args._[1] || args.url || load().business.website, args);
  warn('Usage: afax context ingest <url> | context show | context set <field> <value>');
}

async function ingest(url, args) {
  if (!url) return warn('Usage: afax context ingest https://yourcompany.com');
  header('🧭 Context', `Ingesting ${url}`);

  const page = await spin('Fetching site', () => fetchText(url));
  // Pull a couple of common subpages for richer context.
  const extras = [];
  for (const path of ['about', 'pricing', 'product']) {
    try {
      const p = await fetchText(url.replace(/\/$/, '') + '/' + path, 3000);
      if (p.text.length > 200) extras.push(`[${path}] ${p.text}`);
    } catch {}
  }

  if (!hasLLM()) {
    info('No LLM — storing raw text only. Run ' + c.cyan('afax init') + ' to extract a profile.');
    remember('context', `Site ${url}: ${page.text.slice(0, 500)}`);
    return;
  }

  const corpus = `TITLE: ${page.title}\nHOME: ${page.text}\n${extras.join('\n')}`.slice(0, 12000);
  const profile = await spin('Extracting company profile', () =>
    chat({
      system: 'Extract a precise company profile from website text. Be concrete and faithful — no marketing fluff.',
      messages: [
        {
          role: 'user',
          content:
            `From this website content, return JSON: {"name","offer","icp","tone","website","keyFacts":["..."],"valueProps":["..."]}\n` +
            `- offer: what they sell, one line\n- icp: ideal customer\n- tone: brand voice in 3-4 words\n\n${corpus}`,
        },
      ],
      json: true,
      temperature: 0.3,
      maxTokens: 800,
    }).then((r) => r.json)
  );

  const cfg = load();
  cfg.business.name ||= profile.name || '';
  cfg.business.offer = profile.offer || cfg.business.offer;
  cfg.business.icp = profile.icp || cfg.business.icp;
  cfg.business.tone = profile.tone || cfg.business.tone;
  cfg.business.website = url;
  save(cfg);

  for (const f of [...(profile.keyFacts || []), ...(profile.valueProps || [])]) {
    remember('context', f);
  }
  remember('context', `Company: ${profile.name} — ${profile.offer}`);

  log('');
  log(`  ${c.bold('Name:  ')} ${profile.name || '—'}`);
  log(`  ${c.bold('Offer: ')} ${profile.offer || '—'}`);
  log(`  ${c.bold('ICP:   ')} ${profile.icp || '—'}`);
  log(`  ${c.bold('Tone:  ')} ${profile.tone || '—'}`);
  if (profile.valueProps?.length) {
    log('');
    log(`  ${c.dim('Value props:')}`);
    profile.valueProps.forEach((v) => log(`    ${c.orange('•')} ${v}`));
  }
  log('');
  ok(`Profile saved + ${(profile.keyFacts?.length || 0) + (profile.valueProps?.length || 0)} facts → memory. Every agent now uses this.`);
}

function show() {
  const { business } = load();
  header('🧭 Context', 'Company profile');
  table(
    ['Field', 'Value'],
    Object.entries(business).map(([k, v]) => [k, v || '—'])
  );
  const facts = recall('context', 20);
  if (facts.length) {
    log('');
    log(`  ${c.dim('Learned facts:')}`);
    facts.forEach((f) => log(`    ${c.orange('•')} ${f.text}`));
  }
}
