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
  if (sub === 'score') return scoreCmd();
  if (sub === 'forecast') return forecastCmd();
  if (sub === 'sequence') return sequenceCmd(args);
  warn('Usage: afax sales pipeline | followup --deal "X" | move --deal "X" --stage <s> | score | forecast | sequence --deal "X"');
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

// Deterministic deal scoring (no LLM): stage momentum + deal size + recency.
function dealScore(deal, maxValue) {
  const stagePts = weight(deal.stage) * 40;
  const valuePts = maxValue > 0 ? ((deal.value || 0) / maxValue) * 35 : 0;
  const days = (Date.now() - new Date(deal.updatedAt || deal.createdAt || Date.now()).getTime()) / 86400000;
  const recencyPts = days < 7 ? 25 : days < 30 ? 15 : 5;
  return Math.round(stagePts + valuePts + recencyPts);
}

function scoreCmd() {
  const open = read('deals', []).filter((d) => !['won', 'lost'].includes(d.stage));
  header(`${sales.emoji} Sales`, 'Deal scores (hot → cold)');
  if (!open.length) return info('No open deals. Add one: afax sales pipeline --deal "Acme" --value 5000');
  const maxValue = Math.max(...open.map((d) => d.value || 0), 1);
  const scored = open.map((d) => ({ d, score: dealScore(d, maxValue) })).sort((a, b) => b.score - a.score);
  for (const { d, score } of scored) update('deals', d.id, { score });
  table(['Score', 'Deal', 'Stage', 'Value'], scored.map(({ d, score }) => [
    score >= 70 ? c.green(String(score)) : score >= 40 ? c.yellow(String(score)) : c.dim(String(score)),
    d.name, stageColor(d.stage)(d.stage), money(d.value),
  ]));
  log('');
  info(`Focus the hottest: ${c.cyan('afax sales sequence --deal "' + scored[0].d.name + '"')}`);
}

function forecastCmd() {
  const open = read('deals', []).filter((d) => !['won', 'lost'].includes(d.stage));
  const won = read('deals', []).filter((d) => d.stage === 'won');
  header(`${sales.emoji} Sales`, 'Forecast (probability-weighted)');
  const rows = [];
  let pipe = 0, weighted = 0;
  for (const st of STAGES.filter((s) => !['won', 'lost'].includes(s))) {
    const inStage = open.filter((d) => d.stage === st);
    if (!inStage.length) continue;
    const val = inStage.reduce((s, d) => s + (d.value || 0), 0);
    const w = val * weight(st);
    pipe += val; weighted += w;
    rows.push([st, inStage.length, money(val), Math.round(weight(st) * 100) + '%', c.green(money(w))]);
  }
  if (!rows.length) return info('No open pipeline to forecast.');
  table(['Stage', 'Deals', 'Value', 'Prob', 'Expected'], rows);
  log('');
  log(`  ${c.bold('Open pipeline:')} ${money(pipe)}   ${c.bold('Expected (weighted):')} ${c.green(money(weighted))}`);
  log(`  ${c.dim('Closed won so far:')} ${money(won.reduce((s, d) => s + (d.value || 0), 0))}`);
}

// Schedule a follow-up cadence for one deal (drafts via sales followup on each day).
function sequenceCmd(args) {
  const deal = find('deals', (d) => d.name.toLowerCase() === String(args.deal || '').toLowerCase());
  if (!deal) return warn(`Deal "${args.deal}" not found. Add it: afax sales pipeline --deal "${args.deal || 'Acme'}"`);
  const days = args.days ? String(args.days).split(',').map((n) => parseInt(n, 10) || 0) : [0, 2, 5, 9];
  const now = Date.now();
  for (const d of days) add('schedule', { command: `sales followup --deal "${deal.name.replace(/"/g, '')}"`, when: `day ${d}`, nextRun: now + d * 86400000, runs: 0, source: 'sales-sequence', dealId: deal.id });
  sales.note(`Scheduled ${days.length}-touch follow-up sequence for "${deal.name}".`);
  header(`${sales.emoji} Sales`, `Sequence · ${deal.name}`);
  ok(`${days.length} follow-ups agendados (dias ${days.join(',')}). Rodam no ${c.cyan('afax cloud')} heartbeat.`);
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
