// 🎯 Prospect — lead discovery, enrichment, qualification.
import { Agent } from './base.js';
import { read, write, add } from '../store.js';
import { sanitizeEmail } from '../integrations/email.js';
import { c, header, table, ok, info, warn, spin, dim, log } from '../logger.js';

export const prospect = new Agent({
  key: 'prospect',
  name: 'Prospect',
  emoji: '🎯',
  role: 'Lead generation & qualification',
  system:
    'You are AFAX Prospect, an autonomous SDR. You build qualified lead lists that fit the ICP. ' +
    'You reason about firmographics, buying signals, and fit. You output realistic, well-structured prospect profiles. ' +
    'You never fabricate real personal contact details — emails follow a plausible business pattern (first.last@company.com) and are flagged as unverified.',
});

// afax prospect source <domain> [--limit 10]   (REAL contacts via Hunter.io)
// afax prospect import <file.csv>               (REAL contacts from a CSV)
// afax prospect verify <email>                  (Hunter deliverability check)
export async function cmd(args) {
  if (args._[0] === 'source') return sourceReal(args);
  if (args._[0] === 'verify') return verifyEmail(args);
  if (args._[0] === 'import') return importLeads(args);

  // Synthetic lead generation was removed on purpose: AFAX never invents
  // contacts. Every lead must come from a real source.
  warn('AFAX não inventa leads. Use uma fonte real:');
  info(`  ${c.cyan('afax prospect source acme.com')}   — contatos reais via Hunter.io`);
  info(`  ${c.cyan('afax prospect import leads.csv')}   — importa um CSV (LinkedIn/Apollo/scraper)`);
  info(`  ${c.cyan('afax prospect verify name@acme.com')} — checa entregabilidade`);
}

// Real, verifiable contacts pulled from Hunter.io for a company domain.
async function sourceReal(args) {
  const domain = args._[1] || args.domain;
  const limit = Math.min(parseInt(args.limit || '10', 10) || 10, 50);
  if (!domain) return warn('Usage: afax prospect source acme.com --limit 10');
  const { leads: leadsApi } = await import('../integrations/registry.js');
  if (!leadsApi.status().connected)
    return warn('Lead sourcing not connected. Set a Hunter key: afax connect leads  (or HUNTER_API_KEY).');

  header(`${prospect.emoji} Prospect`, `Real contacts @ ${domain}`);
  const found = await spin('Querying Hunter.io', () => leadsApi.domainSearch({ domain, limit }));
  const saved = found.map((l) => {
    const rec = add('leads', { ...l, email: sanitizeEmail(l.email), target: domain, status: 'new' });
    upsertContact(rec);
    return rec;
  });
  prospect.note(`Sourced ${saved.length} REAL contacts @ ${domain}.`);
  const { emit } = await import('../events.js');
  if (saved.length) await emit('lead.new', { count: saved.length, target: domain, email: saved[0]?.email || '', name: saved[0]?.name || '' });
  table(
    ['Score', 'Name', 'Title', 'Email', 'Verified'],
    saved.map((l) => [scoreBadge(l.score), l.name, truncate(l.title, 20), l.email, l.verified ? c.green('✓') : c.dim('?')])
  );
  log('');
  ok(`${saved.length} real leads → CRM. Reach out: ${c.cyan('afax outreach --channel email')}`);
}

// Verify a single email's deliverability via Hunter.
async function verifyEmail(args) {
  const email = args._[1] || args.email;
  if (!email) return warn('Usage: afax prospect verify someone@company.com');
  const { leads: leadsApi } = await import('../integrations/registry.js');
  if (!leadsApi.status().connected) return warn('Lead sourcing not connected. afax connect leads');
  const r = await spin(`Verifying ${email}`, () => leadsApi.verify({ email }));
  ok(`${email} → ${c.bold(r.status || 'unknown')} (score ${r.score ?? '—'})`);
}

// Import leads from a CSV export (LinkedIn, Apollo, generic).
// afax prospect import leads.csv
async function importLeads(args) {
  const file = args._[1] || args.file;
  if (!file) return warn('Usage: afax prospect import leads.csv');
  const { readFileSync, existsSync } = await import('node:fs');
  if (!existsSync(file)) return warn(`No such file: ${file}`);
  const { csvToLeads } = await import('../csv.js');
  const rows = csvToLeads(readFileSync(file, 'utf8'));
  if (!rows.length) return warn('No leads recognized. Need a header row with name/email/company columns.');

  header(`${prospect.emoji} Prospect`, `Importing ${rows.length} leads from ${file}`);
  const existing = new Set(read('leads', []).map((l) => l.email).filter(Boolean));
  const saved = [];
  for (const l of rows) {
    const email = sanitizeEmail(l.email);
    if (email && existing.has(email)) continue;
    const rec = add('leads', { ...l, email, target: 'import', status: 'new', verified: false });
    upsertContact(rec);
    saved.push(rec);
  }
  prospect.note(`Imported ${saved.length} leads from ${file}.`);
  const { emit } = await import('../events.js');
  if (saved.length) await emit('lead.new', { count: saved.length, target: 'import', email: saved[0]?.email || '', name: saved[0]?.name || '' });
  ok(`${saved.length} imported (${rows.length - saved.length} duplicates skipped) → CRM. Next: ${c.cyan('afax outreach --channel email')}`);
}

function upsertContact(lead) {
  const email = sanitizeEmail(lead.email);
  const contacts = read('contacts', []);
  if (contacts.find((x) => x.email === email)) return;
  contacts.push({
    id: lead.id,
    name: lead.name,
    email,
    company: lead.company,
    title: lead.title,
    stage: 'lead',
    score: lead.score,
    source: 'prospect',
    createdAt: new Date().toISOString(),
  });
  write('contacts', contacts);
}

function scoreBadge(s) {
  s = s || 0;
  if (s >= 80) return c.green(String(s));
  if (s >= 60) return c.yellow(String(s));
  return c.dim(String(s));
}

const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
