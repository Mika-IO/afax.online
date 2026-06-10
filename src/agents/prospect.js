// 🎯 Prospect — lead discovery, enrichment, qualification.
import { Agent } from './base.js';
import { read, write, add } from '../store.js';
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

// afax prospect --target "SaaS founders" --limit 20   (AI-synthesized profiles)
// afax prospect source <domain> [--limit 10]           (REAL contacts via Hunter.io)
export async function cmd(args) {
  if (args._[0] === 'source') return sourceReal(args);
  if (args._[0] === 'verify') return verifyEmail(args);
  const target = args.target || args._[0];
  const limit = Math.min(parseInt(args.limit || '10', 10) || 10, 50);
  if (!target) {
    warn('Usage: afax prospect --target "SaaS founders" --limit 20  |  afax prospect source acme.com');
    return;
  }

  header(`${prospect.emoji} Prospect`, `Sourcing ${limit} leads for: ${target}`);

  let leads;
  if (prospect.online) {
    leads = await spin('Researching & qualifying', () =>
      prospect.structured(
        `Generate ${limit} qualified B2B leads matching: "${target}".\n` +
          `Return JSON: {"leads":[{"name","title","company","industry","email","score","signal"}]}\n` +
          `- score: 0-100 fit score vs the ICP\n- signal: the buying/intent signal that qualifies them\n- email: plausible pattern, mark unverified`,
        { maxTokens: 2200 }
      ).then((r) => r.leads || [])
    );
  } else {
    info('No LLM configured — generating template leads. Run ' + c.cyan('afax init') + ' to enable AI.');
    leads = templateLeads(target, limit);
  }

  const saved = [];
  for (const l of leads) {
    const rec = add('leads', {
      ...l,
      target,
      status: 'new',
      verified: false,
    });
    // Mirror into CRM as a contact.
    upsertContact(rec);
    saved.push(rec);
  }
  prospect.note(`Sourced ${saved.length} leads for "${target}".`);

  table(
    ['Score', 'Name', 'Title', 'Company', 'Signal'],
    saved
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .map((l) => [
        scoreBadge(l.score),
        l.name,
        l.title,
        l.company,
        truncate(l.signal, 32),
      ])
  );
  console.log('');
  ok(`${saved.length} leads saved → CRM. Next: ${c.cyan('afax sales pipeline')} or ${c.cyan('afax content email --topic outreach')}`);
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
    const rec = add('leads', { ...l, target: domain, status: 'new' });
    upsertContact(rec);
    return rec;
  });
  prospect.note(`Sourced ${saved.length} REAL contacts @ ${domain}.`);
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

function upsertContact(lead) {
  const contacts = read('contacts', []);
  if (contacts.find((x) => x.email === lead.email)) return;
  contacts.push({
    id: lead.id,
    name: lead.name,
    email: lead.email,
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

function templateLeads(target, n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const co = `${capitalize(target.split(' ')[0] || 'Acme')}Co${i}`;
    out.push({
      name: `Lead ${i}`,
      title: target.replace(/s$/, ''),
      company: co,
      industry: 'B2B SaaS',
      email: `contact${i}@${co.toLowerCase()}.com`,
      score: 70 - i,
      signal: 'Template lead — enable AI for real qualification',
    });
  }
  return out;
}

const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
