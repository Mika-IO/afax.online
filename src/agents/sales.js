// 💰 Sales — pipeline, follow-ups, negotiation, closing.
import { Agent } from './base.js';
import { read, write, add, update, find } from '../store.js';
import { c, header, table, ok, info, warn, spin, step, log, dim } from '../logger.js';

export const sales = new Agent({
  key: 'sales',
  name: 'Sales',
  emoji: '💰',
  role: 'Pipeline & closing',
  system:
    'You are AFAX Sales, an AE who moves deals to close. You write crisp, human follow-ups, surface the next best action, ' +
    'and handle objections with empathy + value framing. You are never pushy; you create momentum.',
});

export const STAGES = ['lead', 'qualified', 'demo', 'proposal', 'negotiation', 'won', 'lost'];

// afax sales pipeline [--deal "Name"] [--value 5000] [--stage demo]
// afax sales followup --deal "Name"
// afax sales move --deal "Name" --stage proposal
export async function cmd(args) {
  const sub = args._[0] || 'pipeline';
  if (sub === 'pipeline') return pipeline(args);
  if (sub === 'followup') return followup(args);
  if (sub === 'move') return move(args);
  warn('Usage: afax sales pipeline | sales pipeline --deal "Acme" --value 5000 | sales followup --deal "Acme" | sales move --deal "Acme" --stage proposal');
}

async function pipeline(args) {
  // If --deal given, add/update a deal.
  if (args.deal) {
    const existing = find('deals', (d) => d.name.toLowerCase() === String(args.deal).toLowerCase());
    if (existing) {
      const patch = {};
      if (args.value) patch.value = Number(args.value);
      if (args.stage) patch.stage = args.stage;
      update('deals', existing.id, patch);
      ok(`Updated deal ${c.bold(args.deal)}`);
    } else {
      const rec = add('deals', {
        name: args.deal,
        value: Number(args.value || 0),
        stage: args.stage && STAGES.includes(args.stage) ? args.stage : 'qualified',
      });
      sales.note(`New deal "${rec.name}" (${money(rec.value)}) at stage ${rec.stage}.`);
      ok(`Added deal ${c.bold(rec.name)} → ${rec.stage}`);
    }
  }

  header(`${sales.emoji} Sales`, 'Pipeline');
  const deals = read('deals', []);
  const open = deals.filter((d) => !['won', 'lost'].includes(d.stage));

  // Kanban-ish summary by stage.
  for (const st of STAGES) {
    const inStage = deals.filter((d) => d.stage === st);
    if (!inStage.length) continue;
    const total = inStage.reduce((s, d) => s + (d.value || 0), 0);
    const label = st.padEnd(12);
    log(`  ${stageColor(st)(label)} ${c.dim(inStage.length + ' deal(s)')}  ${c.bold(money(total))}`);
    for (const d of inStage) log(`     ${c.dim('·')} ${d.name} ${c.dim('— ' + money(d.value))}`);
  }
  log('');
  const weighted = open.reduce((s, d) => s + (d.value || 0) * weight(d.stage), 0);
  const pipe = open.reduce((s, d) => s + (d.value || 0), 0);
  log(`  ${c.bold('Open pipeline:')} ${money(pipe)}   ${c.dim('Weighted:')} ${c.green(money(weighted))}`);
  log('');
  info(`Next: ${c.cyan('afax sales followup --deal "' + (open[0]?.name || 'Acme') + '"')}`);
}

async function followup(args) {
  const deal = find('deals', (d) => d.name.toLowerCase() === String(args.deal || '').toLowerCase());
  if (!deal) return warn(`Deal "${args.deal}" not found. Add it: afax sales pipeline --deal "${args.deal || 'Acme'}"`);
  header(`${sales.emoji} Sales`, `Follow-up · ${deal.name} (${deal.stage})`);

  if (!sales.online) {
    info('No LLM — run ' + c.cyan('afax init') + ' to generate AI follow-ups.');
    return;
  }
  const msg = await spin('Drafting follow-up', () =>
    sales.generate(
      `Write a short, warm follow-up message for deal "${deal.name}" currently at stage "${deal.stage}" ` +
        `(value ${money(deal.value)}). Move it to the next step. Plain text, no subject unless email-appropriate. Keep under 120 words.`,
      { temperature: 0.7, maxTokens: 500 }
    )
  );
  add('messages', { dealId: deal.id, type: 'followup', body: msg });
  sales.note(`Drafted follow-up for "${deal.name}" at ${deal.stage}.`);
  log('');
  log(indent(msg));
  log('');
  ok(`Saved. Advance: ${c.cyan('afax sales move --deal "' + deal.name + '" --stage ' + nextStage(deal.stage))}`);
}

async function move(args) {
  const deal = find('deals', (d) => d.name.toLowerCase() === String(args.deal || '').toLowerCase());
  if (!deal) return warn(`Deal "${args.deal}" not found.`);
  const stage = args.stage;
  if (!STAGES.includes(stage)) return warn(`Stage must be one of: ${STAGES.join(', ')}`);
  update('deals', deal.id, { stage });
  sales.note(`Moved "${deal.name}" → ${stage}.`);
  ok(`${c.bold(deal.name)} → ${stageColor(stage)(stage)}`);
  if (stage === 'won') {
    // Record revenue for Finance.
    add('revenue', { source: deal.name, amount: deal.value || 0, type: 'one-time' });
    info(`Revenue ${money(deal.value)} booked → Finance.`);
    const { emit } = await import('../events.js');
    await emit('deal.won', { deal: deal.name, value: deal.value || 0 });
  }
}

const weight = (st) => ({ lead: 0.05, qualified: 0.15, demo: 0.3, proposal: 0.5, negotiation: 0.75, won: 1, lost: 0 }[st] ?? 0.1);
const nextStage = (st) => STAGES[Math.min(STAGES.indexOf(st) + 1, STAGES.length - 3)];
const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US');
const indent = (s) => s.split('\n').map((l) => '  ' + l).join('\n');
function stageColor(st) {
  if (st === 'won') return c.green;
  if (st === 'lost') return c.red;
  if (['proposal', 'negotiation'].includes(st)) return c.yellow;
  return c.cyan;
}
