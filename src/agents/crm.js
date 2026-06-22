// 🤝 CRM — unified contacts, stages, interaction history.
import { Agent } from './base.js';
import { read, write, add, update, find, cuid } from '../store.js';
import { c, header, table, ok, info, warn, log, dim } from '../logger.js';

export const crm = new Agent({
  key: 'crm',
  name: 'CRM',
  emoji: '🤝',
  role: 'Relationship management',
  system: 'You are AFAX CRM. You keep a clean, unified record of every contact and interaction.',
});

const STAGES = ['lead', 'prospect', 'customer', 'churned'];

// afax crm contact add "email" [--name "..."] [--company "..."]
// afax crm contact list
// afax crm contact show "email"
// afax crm note "email" "interaction text"
export async function cmd(args) {
  const sub = args._[0];
  if (sub === 'contact') return contactCmd(args);
  if (sub === 'note') return noteCmd(args);
  if (sub === 'score' || sub === 'hot') return scoreCmd();
  warn('Usage: afax crm contact add "email" | contact list | contact show "email" | note "email" "text" | score');
}

async function contactCmd(args) {
  const action = args._[1];
  if (action === 'add') {
    const email = args._[2] || args.email;
    if (!email) return warn('Usage: afax crm contact add "you@company.com" --name "Jane"');
    const contacts = read('contacts', []);
    if (contacts.find((x) => x.email === email)) return warn(`Contact ${email} already exists.`);
    const rec = {
      id: cuid(),
      email,
      name: args.name || email.split('@')[0],
      company: args.company || email.split('@')[1]?.split('.')[0] || '',
      title: args.title || '',
      stage: args.stage && STAGES.includes(args.stage) ? args.stage : 'lead',
      source: 'manual',
      createdAt: new Date().toISOString(),
    };
    contacts.push(rec);
    write('contacts', contacts);
    crm.note(`Added contact ${email} (${rec.company}).`);
    ok(`Contact added: ${c.bold(rec.name)} <${email}> · ${rec.stage}`);
    const { emit } = await import('../events.js');
    await emit('contact.new', { email, name: rec.name, company: rec.company });
    return;
  }
  if (action === 'show') {
    const email = args._[2] || args.email;
    const contact = find('contacts', (x) => x.email === email);
    if (!contact) return warn(`No contact ${email}.`);
    header(`${crm.emoji} CRM`, contact.name);
    log(`  ${c.bold('Email:  ')} ${contact.email}`);
    log(`  ${c.bold('Company:')} ${contact.company || '—'}`);
    log(`  ${c.bold('Title:  ')} ${contact.title || '—'}`);
    log(`  ${c.bold('Stage:  ')} ${contact.stage}`);
    if (contact.score != null) log(`  ${c.bold('Score:  ')} ${contact.score}`);
    const notes = read('crm_notes', []).filter((n) => n.email === email);
    if (notes.length) {
      log('');
      log(`  ${c.dim('History:')}`);
      for (const n of notes) log(`    ${c.dim(n.createdAt.slice(0, 10))}  ${n.text}`);
    }
    return;
  }
  // default: list
  header(`${crm.emoji} CRM`, 'Contacts');
  const contacts = read('contacts', []);
  table(
    ['Name', 'Email', 'Company', 'Stage', 'Score'],
    contacts.map((x) => [x.name, x.email, x.company || '—', x.stage, x.score ?? '—'])
  );
  log('');
  info(`${contacts.length} contact(s).`);
}

// Deterministic engagement scoring (no LLM): rank contacts by how they actually
// interacted with our emails (reply > click > open > sent) + their stage.
function scoreCmd() {
  const contacts = read('contacts', []);
  if (!contacts.length) return info('No contacts yet.');
  const msgs = read('messages', []);
  const eng = {};
  for (const m of msgs) {
    if (!m.to) continue;
    const e = String(m.to).toLowerCase();
    const b = eng[e] || (eng[e] = { sent: 0, opened: 0, clicked: 0, replied: 0 });
    if (m.sent) b.sent++;
    if (m.opens) b.opened++;
    if (m.clicks) b.clicked++;
    if (m.replied) b.replied++;
  }
  const stageBonus = (st) => ({ customer: 20, prospect: 10, lead: 0, churned: -10 }[st] ?? 0);
  const scored = contacts.map((ct) => {
    const b = eng[String(ct.email || '').toLowerCase()] || {};
    const score = Math.max(0, Math.min(100, (b.replied ? 50 : 0) + (b.clicked ? 30 : 0) + (b.opened ? 15 : 0) + (b.sent ? 5 : 0) + stageBonus(ct.stage)));
    return { ct, score };
  }).sort((a, b) => b.score - a.score);
  for (const { ct, score } of scored) update('contacts', ct.id, { score });
  header(`${crm.emoji} CRM`, 'Contact engagement (hot → cold)');
  table(['Score', 'Name', 'Email', 'Stage'], scored.slice(0, 50).map(({ ct, score }) => [
    score >= 60 ? c.green(String(score)) : score >= 25 ? c.yellow(String(score)) : c.dim(String(score)),
    ct.name, ct.email, ct.stage,
  ]));
  log('');
  info(`${scored.length} contact(s) scored from real email engagement.`);
}

function noteCmd(args) {
  const email = args._[1];
  const text = args._.slice(2).join(' ') || args.text;
  if (!email || !text) return warn('Usage: afax crm note "you@company.com" "had a great call"');
  if (!find('contacts', (x) => x.email === email)) return warn(`No contact ${email}.`);
  add('crm_notes', { email, text });
  crm.note(`Logged interaction with ${email}.`);
  ok('Interaction logged.');
}
