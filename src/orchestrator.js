// The orchestrator — coordinates the 7 agents, holds the state picture,
// proposes the highest-value next actions, and (optionally) executes them.
import { chat } from './llm/index.js';
import { load, hasLLM } from './config.js';
import { read } from './store.js';
import { recall, remember } from './memory.js';
import { tokenize } from './agents/automation.js';
import { c, header, table, ok, info, warn, step, spin, log, dim } from './logger.js';

// Snapshot of the whole company in numbers.
export function snapshot() {
  const leads = read('leads', []);
  const contacts = read('contacts', []);
  const deals = read('deals', []);
  const open = deals.filter((d) => !['won', 'lost'].includes(d.stage));
  const won = deals.filter((d) => d.stage === 'won');
  const campaigns = read('campaigns', []);
  const channels = read('channels', []).filter((x) => x.status === 'active');
  const contentItems = read('content', []);
  const flows = read('flows', []);
  const revenue = read('revenue', []);
  const expenses = read('expenses', []);
  const mrr = revenue.filter((r) => /sub|recur|month/i.test(r.type || '')).reduce((s, r) => s + (+r.amount || 0), 0);
  return {
    leads: leads.length,
    contacts: contacts.length,
    openDeals: open.length,
    pipelineValue: open.reduce((s, d) => s + (+d.value || 0), 0),
    wonValue: won.reduce((s, d) => s + (+d.value || 0), 0),
    campaigns: campaigns.length,
    activeChannels: channels.length,
    content: contentItems.length,
    flows: flows.length,
    revenue: revenue.reduce((s, r) => s + (+r.amount || 0), 0),
    expenses: expenses.reduce((s, e) => s + (+e.amount || 0), 0),
    mrr,
  };
}

// afax status — single-screen company dashboard.
export function status() {
  const cfg0 = load();
  const { business } = cfg0;
  const s = snapshot();
  header(`AFAX · ${business.name || 'Your company'}`, `${business.offer || 'Your company on autopilot'}  ·  workspace: ${cfg0.workspace}`);
  table(
    ['Module', 'Metric', 'Value'],
    [
      ['🎯 Prospect', 'Leads sourced', s.leads],
      ['🤝 CRM', 'Contacts', s.contacts],
      ['🚀 Marketing', 'Active channels', `${s.activeChannels}/16`],
      ['🚀 Marketing', 'Campaigns', s.campaigns],
      ['✍️ Content', 'Pieces', s.content],
      ['💰 Sales', 'Open deals', s.openDeals],
      ['💰 Sales', 'Open pipeline', money(s.pipelineValue)],
      ['💰 Sales', 'Closed won', money(s.wonValue)],
      ['🤖 Automation', 'Flows', s.flows],
      ['📊 Finance', 'Revenue', money(s.revenue)],
      ['📊 Finance', 'MRR', money(s.mrr)],
      ['📊 Finance', 'Net', money(s.revenue - s.expenses)],
    ]
  );
  log('');
  const cfg = load();
  const llm = hasLLM() ? c.green('● online') : c.yellow('○ offline (run afax init)');
  const live = cfg.live ? c.green('LIVE') : c.yellow('dry-run');
  log(`  LLM: ${llm}   Autonomy: ${c.bold(cfg.autonomy)}   Outbound: ${live}`);
  log('');
  info(`Plan the next move: ${c.cyan('afax run')}   ·   Wire platforms: ${c.cyan('afax connections')}`);
}

// afax run [--execute] [--steps N] — autonomous next-best-action loop.
export async function run(args) {
  const cfg = load();
  const execute = args.execute || args.yes || cfg.autonomy === 'execute';
  header('AFAX Orchestrator', execute ? 'Autonomous run · executing' : 'Autonomous run · planning');

  if (!hasLLM()) {
    warn('No LLM configured. The orchestrator needs a model to reason. Run: ' + c.cyan('afax init'));
    return;
  }

  const s = snapshot();
  const mem = recall('orchestrator', 6).map((m) => m.text);
  const stateText = Object.entries(s).map(([k, v]) => `${k}: ${v}`).join(', ');

  const plan = await spin('Deciding next best actions', () =>
    decide(stateText, mem, cfg)
  );

  if (!plan.actions?.length) {
    info(plan.reasoning || 'Nothing to do right now.');
    return;
  }

  log('  ' + c.dim(plan.reasoning || ''));
  log('');
  plan.actions.forEach((a, i) =>
    log(`  ${c.orange(i + 1 + '.')} ${c.bold(a.command)}   ${c.dim('— ' + (a.why || ''))}`)
  );
  log('');

  if (!execute) {
    info(`Review above. Execute with: ${c.cyan('afax run --execute')}  (or set autonomy: afax config set autonomy execute)`);
    remember('orchestrator', `Proposed: ${plan.actions.map((a) => a.command).join(' | ')}`);
    return;
  }

  // Execute (with safety cap).
  const max = Math.min(parseInt(args.steps || '4', 10) || 4, plan.actions.length);
  const { dispatch } = await import('./cli.js');
  for (let i = 0; i < max; i++) {
    const a = plan.actions[i];
    step(`Executing ${i + 1}/${max}: ${a.command}`);
    try {
      await dispatch(tokenize(a.command));
    } catch (e) {
      warn(`Action failed: ${e.message}`);
    }
    log('');
  }
  remember('orchestrator', `Executed ${max} actions: ${plan.actions.slice(0, max).map((a) => a.command).join(' | ')}`);
  ok('Run complete.');
}

async function decide(stateText, mem, cfg) {
  const tools = [
    'prospect --target "<icp>" --limit <n>',
    'marketing channel <key> enable',
    'marketing campaign --channel <key> --goal "<goal>"',
    'content blog|email|post --topic "<topic>"',
    'sales pipeline --deal "<name>" --value <n>',
    'sales followup --deal "<name>"',
    'crm contact add "<email>"',
    'finance report',
  ];
  const { json } = await chat({
    system:
      'You are the AFAX orchestrator running an autonomous company. Given the current state, choose the 2-4 ' +
      'highest-leverage next actions to grow revenue. Only use the available commands verbatim with concrete arguments. ' +
      'Prefer actions that compound. Respond JSON: {"reasoning":"<1 sentence>","actions":[{"command":"<exact afax subcommand>","why":"<short>"}]}',
    messages: [
      {
        role: 'user',
        content:
          `Business: ${cfg.business.name || 'unnamed'} | ICP: ${cfg.business.icp || 'unknown'} | Offer: ${cfg.business.offer || 'unknown'}\n` +
          `State: ${stateText}\n` +
          (mem.length ? `Recent actions:\n- ${mem.join('\n- ')}\n` : '') +
          `Available commands (use exactly, no "afax" prefix):\n- ${tools.join('\n- ')}`,
      },
    ],
    json: true,
    temperature: 0.5,
    maxTokens: 700,
  });
  return json;
}

const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US');
