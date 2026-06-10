// 📊 Finance — cash flow, MRR/ARR, invoices, AI reconciliation & reports.
import { Agent } from './base.js';
import { read, add } from '../store.js';
import { c, header, table, ok, info, warn, spin, step, log } from '../logger.js';

export const finance = new Agent({
  key: 'finance',
  name: 'Finance',
  emoji: '📊',
  role: 'Cash flow & reporting',
  system:
    'You are AFAX Finance, a fractional CFO. You read the numbers and give sharp, honest, actionable read-outs: ' +
    'runway, burn, MRR trend, concentration risk, and the single highest-leverage money move this week.',
});

// afax finance revenue --source "Acme" --amount 99 [--type subscription]
// afax finance expense --label "Ads" --amount 200
// afax finance invoice --to "Acme" --amount 1500
// afax finance report
export async function cmd(args) {
  const sub = args._[0] || 'report';
  if (sub === 'revenue') return record('revenue', args, ['source', 'amount']);
  if (sub === 'expense') return record('expenses', args, ['label', 'amount']);
  if (sub === 'invoice') return invoice(args);
  if (sub === 'report') return report();
  warn('Usage: afax finance revenue|expense|invoice|report ...');
}

function record(coll, args, [labelKey]) {
  const amount = Number(args.amount);
  if (!amount) return warn(`Provide --amount. e.g. afax finance ${coll === 'revenue' ? 'revenue --source "Acme"' : 'expense --label "Ads"'} --amount 99`);
  const rec = add(coll, {
    [labelKey]: args[labelKey] || args.source || args.label || 'unlabeled',
    amount,
    type: args.type || (coll === 'revenue' ? 'one-time' : 'opex'),
  });
  finance.note(`${coll === 'revenue' ? 'Revenue' : 'Expense'} ${money(amount)} — ${rec[labelKey]}.`);
  ok(`${coll === 'revenue' ? 'Revenue' : 'Expense'} booked: ${money(amount)} · ${rec[labelKey]}`);
}

// afax finance invoice --to "Acme" --amount 1500 [--live]
// With Stripe connected + both live gates: also creates a real payment link.
// Pair with `afax serve` so /webhook/stripe marks it paid automatically.
async function invoice(args) {
  const amount = Number(args.amount);
  if (!args.to || !amount) return warn('Usage: afax finance invoice --to "Acme" --amount 1500 [--live]');
  const number = 'INV-' + Date.now().toString(36).toUpperCase();

  let linkUrl = '', linkId = '';
  const { payments } = await import('../integrations/registry.js');
  const { isLive } = await import('../config.js');
  if (payments.status().connected && args.live && isLive()) {
    const link = await spin('Creating Stripe payment link', () =>
      payments.createPaymentLink({ name: `${args.to} — ${number}`, amount, invoiceNumber: number })
    );
    linkUrl = link.url;
    linkId = link.id;
  }

  const rec = add('invoices', { to: args.to, amount, status: 'sent', number, linkUrl, linkId });
  finance.note(`Invoice ${number} → ${args.to} (${money(amount)})${linkUrl ? ' with Stripe link' : ''}.`);
  ok(`Invoice ${c.bold(rec.number)} → ${args.to} · ${money(amount)} (status: sent)`);
  if (linkUrl) {
    info(`Payment link: ${c.bold(linkUrl)}`);
    info(`Run ${c.cyan('afax serve')} so the Stripe webhook marks it paid + books revenue automatically.`);
  } else if (payments.status().connected && !(args.live && isLive())) {
    info(`Stripe is connected but dry-run. Real payment link: ${c.cyan('afax config set live true')} + ${c.cyan('--live')}.`);
  }
}

async function report() {
  header(`${finance.emoji} Finance`, 'Financial report');
  const revenue = read('revenue', []);
  const expenses = read('expenses', []);
  const invoices = read('invoices', []);

  const totalRev = sum(revenue);
  const mrr = sum(revenue.filter((r) => /sub|recur|month/i.test(r.type || '')));
  const totalExp = sum(expenses);
  const net = totalRev - totalExp;
  const outstanding = sum(invoices.filter((i) => i.status !== 'paid'));

  table(
    ['Metric', 'Value'],
    [
      ['Total revenue', money(totalRev)],
      ['MRR', money(mrr)],
      ['ARR (MRR×12)', money(mrr * 12)],
      ['Total expenses', money(totalExp)],
      ['Net', (net >= 0 ? c.green : c.red)(money(net))],
      ['Outstanding invoices', money(outstanding)],
    ]
  );
  log('');

  if (finance.online && (revenue.length || expenses.length)) {
    const insight = await spin('CFO read-out', () =>
      finance.generate(
        `Numbers: revenue ${money(totalRev)}, MRR ${money(mrr)}, expenses ${money(totalExp)}, net ${money(net)}, outstanding ${money(outstanding)}.\n` +
          `Give a 3-bullet CFO read-out: health, biggest risk, and the single highest-leverage money move this week. Be specific and brief.`,
        { temperature: 0.4, maxTokens: 400 }
      )
    );
    log(insight.split('\n').map((l) => '  ' + l).join('\n'));
    log('');
  } else if (!finance.online) {
    info('Run ' + c.cyan('afax init') + ' for an AI CFO read-out.');
  }
}

const sum = (rows) => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US');
