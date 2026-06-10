// 📨 Outreach — multichannel cold outreach engine. Drafts human-quality,
// personalized messages per lead and sends them through real connectors.
// SAFE BY DEFAULT: dry-run unless --live (and global config.live) is set.
import { Agent } from './base.js';
import { read, write, add } from '../store.js';
import { isLive } from '../config.js';
import * as registry from '../integrations/registry.js';
import { c, header, table, ok, info, warn, step, spin, log, dim } from '../logger.js';

const agent = new Agent({
  key: 'outreach',
  name: 'Outreach',
  emoji: '📨',
  role: 'Personalized cold outreach',
  system:
    'You are AFAX Outreach, a world-class SDR. You write short, specific, human cold messages that earn a reply. ' +
    'No spam, no fake flattery, no "I hope this finds you well". Lead with a concrete, relevant observation about the ' +
    'prospect, connect it to one clear value, and end with a low-friction ask. Match the channel: email gets a subject; ' +
    'whatsapp/telegram are 2-3 sentences max.',
});

// afax outreach --channel email [--limit 10] [--status new] [--live]
export async function cmd(args) {
  const channel = args.channel || 'email';
  const limit = Math.min(parseInt(args.limit || '5', 10) || 5, 50);
  const live = !!args.live;

  const leads = read('leads', [])
    .filter((l) => (args.status ? l.status === args.status : l.status !== 'contacted'))
    .slice(0, limit);

  header(`${agent.emoji} Outreach`, `${channel} · ${leads.length} lead(s) · ${live ? (isLive() ? c.green('LIVE') : c.yellow('LIVE flag but config.live=false → dry-run')) : c.dim('dry-run')}`);

  if (!leads.length) return info('No leads to contact. Run: afax prospect --target "..." or afax leads source <domain>');
  if (!agent.online) return warn('Outreach needs an LLM to personalize. Run: afax init');

  const results = [];
  for (const lead of leads) {
    const drafted = await spin(`Writing → ${lead.name} @ ${lead.company}`, () =>
      draft(agent, lead, channel)
    );
    const target = channel === 'email' ? lead.email : lead.phone || lead.email;
    const sent = await registry.dm({
      platform: channel,
      to: target,
      subject: drafted.subject,
      text: drafted.body,
      live,
    });

    add('messages', {
      leadId: lead.id,
      channel,
      to: target,
      subject: drafted.subject || '',
      body: drafted.body,
      dryRun: sent.dryRun,
      delivered: sent.ok && !sent.dryRun,
      error: sent.error || '',
    });
    // Mark contacted only on a real send.
    if (sent.ok && !sent.dryRun) {
      const all = read('leads', []);
      const i = all.findIndex((x) => x.id === lead.id);
      if (i >= 0) { all[i].status = 'contacted'; write('leads', all); }
      add('crm_notes', { email: lead.email, text: `Outreach via ${channel}: ${drafted.subject || drafted.body.slice(0, 60)}` });
    }
    results.push([lead.name, lead.company, drafted.subject || '(dm)', verdict(sent)]);
  }

  agent.note(`Outreach run: ${channel}, ${results.length} leads, live=${live && isLive()}.`);
  log('');
  table(['Lead', 'Company', 'Subject', 'Status'], results);
  log('');
  if (!(live && isLive())) {
    info(`Dry-run. To actually send: ${c.cyan('afax config set live true')} then ${c.cyan('afax outreach --channel ' + channel + ' --live')}`);
    dim('  Preview the latest drafts: afax outreach preview');
  } else {
    ok('Outreach sent.');
  }
}

// Show the most recent drafted messages in full.
export function preview() {
  header(`${agent.emoji} Outreach`, 'Recent drafts');
  const msgs = read('messages', []).slice(-3);
  if (!msgs.length) return info('No drafts yet.');
  for (const m of msgs) {
    log(`  ${c.dim('to:')} ${m.to}  ${c.dim(m.channel)}`);
    if (m.subject) log(`  ${c.bold('Subject:')} ${m.subject}`);
    log(m.body.split('\n').map((l) => '  ' + l).join('\n'));
    log('  ' + c.dim('─'.repeat(40)));
  }
}

async function draft(agent, lead, channel) {
  const j = await agent.structured(
    `Write a cold ${channel} message to:\n` +
      `Name: ${lead.name}\nTitle: ${lead.title}\nCompany: ${lead.company}\nSignal: ${lead.signal || 'n/a'}\n\n` +
      `Return JSON: {"subject":"<email subject or empty>","body":"<message>"}. ` +
      `${channel === 'email' ? 'Subject under 6 words.' : 'No subject. 2-3 sentences.'} Body under 90 words.`,
    { temperature: 0.7, maxTokens: 400 }
  );
  return { subject: j.subject || '', body: j.body || '' };
}

function verdict(sent) {
  if (sent.dryRun) return c.dim('dry-run');
  if (sent.ok) return c.green('sent');
  return c.red('fail: ' + (sent.error || '').slice(0, 24));
}

export const outreach = agent;
