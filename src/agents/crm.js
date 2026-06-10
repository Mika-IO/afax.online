// 🤝 CRM — unified contacts, stages, interaction history.
import { Agent } from './base.js';
import { read, write, add, find, cuid } from '../store.js';
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
  warn('Usage: afax crm contact add "email" | contact list | contact show "email" | note "email" "text"');
}

function contactCmd(args) {
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

function noteCmd(args) {
  const email = args._[1];
  const text = args._.slice(2).join(' ') || args.text;
  if (!email || !text) return warn('Usage: afax crm note "you@company.com" "had a great call"');
  if (!find('contacts', (x) => x.email === email)) return warn(`No contact ${email}.`);
  add('crm_notes', { email, text });
  crm.note(`Logged interaction with ${email}.`);
  ok('Interaction logged.');
}
