// AFAX CLI — argument parsing, command routing, dispatch.
import { load, save, configPath, isConfigured, activeProvider, hasLLM } from './config.js';
import { read } from './store.js';
import { recall, forgetAll } from './memory.js';
import { c, header, table, ok, info, warn, log, dim, banner } from './logger.js';

import { init } from './init.js';
import { connect, connections } from './connect.js';
import * as workspace from './workspace.js';
import { exportCmd, importCmd } from './data.js';
import { status, run as orchestrate } from './orchestrator.js';
import * as scheduler from './scheduler.js';
import * as prospect from './agents/prospect.js';
import * as marketing from './agents/marketing.js';
import * as sales from './agents/sales.js';
import * as content from './agents/content.js';
import * as crm from './agents/crm.js';
import * as automation from './agents/automation.js';
import * as finance from './agents/finance.js';
import * as context from './agents/context.js';
import * as outreach from './agents/outreach.js';
import * as deploy from './agents/deploy.js';

const VERSION = '0.4.0';

// ---- arg parsing -----------------------------------------------------------
export function parse(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) out[key] = true;
        else { out[key] = next; i++; }
      }
    } else if (a.startsWith('-') && a.length > 1 && isNaN(Number(a))) {
      out[a.slice(1)] = true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

// ---- dispatch (reused by flows / scheduler / orchestrator) -----------------
export async function dispatch(argv) {
  const args = parse(argv);
  const cmd = args._.shift();

  switch (cmd) {
    case undefined:
      // Plain `afax` in a terminal with an LLM → conversational session.
      if (process.stdin.isTTY && hasLLM()) {
        const { repl } = await import('./chat.js');
        return repl();
      }
      return help();
    case 'help':
    case '--help':
    case '-h':
      return help();
    case 'chat': {
      const { repl } = await import('./chat.js');
      return repl();
    }
    case 'ask': {
      const { ask } = await import('./chat.js');
      return ask(args);
    }
    case 'serve': {
      const { cmd: serve } = await import('./server.js');
      return serve(args);
    }
    case 'web': {
      const { cmd: web } = await import('./web.js');
      return web(args);
    }
    case 'browser': {
      const url = args._[0];
      if (!url) return warn('Usage: afax browser <url>   (opens a headless browser and prints the page)');
      const b = await import('./integrations/browser.js');
      try { log(await b.goto(url)); } catch (e) { warn(e.message); } finally { await b.close(); }
      return;
    }
    case 'inbox':
      return inboxCmd();
    case 'version':
    case '--version':
    case '-v':
      return log(`afax v${VERSION}`);
    case 'self-update':
    case 'selfupdate':
    case 'reinstall': {
      const { selfUpdate } = await import('./selfupdate.js');
      return selfUpdate(args);
    }
    case 'init':
      return init();
    case 'connect':
      return connect(args._[0]);
    case 'connections':
      return connections();
    case 'workspace':
    case 'ws':
      return workspace.cmd(args);
    case 'export':
      return exportCmd(args);
    case 'import':
      return importCmd(args);
    case 'config':
      return configCmd(args);
    case 'context':
      return context.cmd(args);
    case 'status':
      return status();
    case 'run':
      return orchestrate(args);
    case 'prospect':
      return prospect.cmd(args);
    case 'marketing':
      return marketing.cmd(args);
    case 'sales':
      return sales.cmd(args);
    case 'content':
      return args._[0] === 'list' ? content.list() : content.cmd(args);
    case 'crm':
      return crm.cmd(args);
    case 'outreach':
      return args._[0] === 'preview' ? outreach.preview() : outreach.cmd(args);
    case 'deploy':
      return deploy.cmd(args);
    case 'automation':
      return automation.cmd(args, dispatch);
    case 'finance':
      return finance.cmd(args);
    case 'schedule':
      return scheduler.cmd(args, dispatch);
    case 'memory':
      return memoryCmd(args);
    case 'usage':
      return usageCmd(args);
    default:
      warn(`Unknown command: ${cmd}`);
      log(`Run ${c.cyan('afax help')} for the command list.`);
  }
}

// Public entry from bin/afax.js
export async function run(argv) {
  // First-run nudge.
  if (argv.length && !['init', 'help', '--help', '-h', 'version', '--version', '-v', 'config', 'connect', 'connections', 'workspace', 'ws', 'import'].includes(argv[0]) && !isConfigured()) {
    info(`First run — set up with ${c.cyan('afax init')} to unlock AI (commands still work offline).`);
    log('');
  }
  return dispatch(argv);
}

// ---- config command --------------------------------------------------------
function configCmd(args) {
  const action = args._[0];
  const cfg = load();
  if (action === 'path') return log(configPath());
  if (action === 'show' || !action) {
    header('AFAX · Config', configPath());
    const p = activeProvider(cfg);
    table(
      ['Key', 'Value'],
      [
        ['provider', cfg.provider],
        ['model', p.model],
        ['baseUrl', p.baseUrl],
        ['apiKey', p.apiKey ? c.green('set') : c.yellow('not set')],
        ['autonomy', cfg.autonomy],
        ['budget.monthly', cfg.budget?.monthly ? '$' + cfg.budget.monthly : 'unlimited'],
        ['business.name', cfg.business.name || '—'],
        ['business.icp', cfg.business.icp || '—'],
        ['LLM', hasLLM() ? c.green('online') : c.yellow('offline')],
      ]
    );
    return;
  }
  if (action === 'get') {
    return log(JSON.stringify(maskSecrets(args._[1], getPath(cfg, args._[1])), null, 2));
  }
  if (action === 'set') {
    const path = args._[1];
    const value = args._.slice(2).join(' ');
    if (!path) return warn('Usage: afax config set <path> <value>   e.g. afax config set providers.anthropic.apiKey sk-...');
    setPath(cfg, path, coerce(value));
    save(cfg);
    return ok(`Set ${c.bold(path)} = ${SECRET_KEY.test(path.split('.').pop()) ? '•••' : value}`);
  }
  warn('Usage: afax config show|get <path>|set <path> <value>|path');
}

function inboxCmd() {
  header('📥 Inbox', 'Inbound messages (via afax serve)');
  const msgs = read('inbox', []).slice(-20);
  if (!msgs.length) return info('Empty. Wire webhooks to `afax serve` — docs: server.');
  for (const m of msgs) {
    log(`  ${c.dim(m.createdAt?.slice(0, 16).replace('T', ' ') || '')} ${c.orange('[' + m.channel + ']')} ${c.bold(m.name || m.from)}: ${String(m.text).slice(0, 100)}${m.repliedAt ? c.green('  ↩ replied') : ''}`);
  }
}

async function usageCmd(args) {
  const { monthTotals, allTotals, budgetState, fmtUSD, fmtTok } = await import('./usage.js');
  const { read } = await import('./store.js');
  const month = monthTotals();
  const all = allTotals();
  const b = budgetState();

  header('💸 Usage', 'LLM token spend for this workspace');
  table(
    ['Window', 'Calls', 'In', 'Out', 'Cost'],
    [
      ['This month', month.calls, fmtTok(month.input), fmtTok(month.output), fmtUSD(month.cost)],
      ['All time', all.calls, fmtTok(all.input), fmtTok(all.output), fmtUSD(all.cost)],
    ]
  );
  log('');
  if (b.monthly > 0) {
    const pct = Math.min(100, Math.round((b.spent / b.monthly) * 100));
    const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '░');
    const styler = b.over ? c.red : pct >= 80 ? c.yellow : c.green;
    log('  ' + c.dim('Budget ') + styler(bar) + '  ' + styler(`${fmtUSD(b.spent)} / ${fmtUSD(b.monthly)} (${pct}%)`));
  } else {
    log('  ' + c.dim('No monthly budget set. Cap spend with: ') + c.cyan('afax config set budget.monthly 50'));
  }

  if (args.recent) {
    log('');
    log('  ' + c.dim('Recent calls:'));
    for (const r of read('usage', []).slice(-10)) {
      log(`    ${c.dim(r.createdAt?.slice(0, 16).replace('T', ' '))}  ${r.model}  ${fmtTok(r.input)}→${fmtTok(r.output)}  ${fmtUSD(r.cost)}`);
    }
  }
  log('');
}

function memoryCmd(args) {
  if (args._[0] === 'clear') {
    forgetAll();
    return ok('Memory cleared.');
  }
  header('AFAX · Memory', 'What the agents remember');
  const facts = recall(null, 30);
  if (!facts.length) return info('No memories yet.');
  for (const f of facts) log(`  ${c.dim(f.at.slice(0, 10))} ${c.orange('[' + f.scope + ']')} ${f.text}`);
}

// ---- help ------------------------------------------------------------------
function help() {
  const cfg = load();
  log('');
  banner();
  log('  ' + c.dim('Autonomous Force for Automation eXecution · v' + VERSION));
  log('  ' + c.dim('Your company on autopilot with AI.'));
  log('');
  log(c.bold('  TALK'));
  row('afax  (no command)', 'Chat — natural language, runs commands for you');
  row('ask "<question>"', 'One-shot natural-language question (scriptable)');
  log('');
  log(c.bold('  SETUP'));
  row('init', 'Interactive setup (provider, model, business profile)');
  row('context ingest <url>', 'Learn your company from its website');
  row('browser <url>', 'Drive a real headless browser (needs: npm i playwright)');
  row('workspace use <name>', 'Switch company (multi-company isolated data)');
  row('export / import <file>', 'Back up or move a company');
  row('connect <platform>', 'Wire email / meta / telegram / leads / media …');
  row('connections', 'Show what is connected (+ live/dry-run)');
  row('status', 'Company dashboard across all 7 modules');
  row('run [--execute]', 'Orchestrator: plan & run the next best actions');
  row('config show|set <path> <v>', 'View/change configuration');
  row('self-update [--link]', 'Reinstall the CLI globally from local source (dev)');
  log('');
  log(c.bold('  AGENTS'));
  row('🎯 prospect --target "<icp>" --limit <n>', 'AI-qualified lead profiles');
  row('🎯 prospect source <domain>', 'REAL contacts via Hunter.io');
  row('📨 outreach --channel email [--live]', 'Personalized cold outreach (sends)');
  row('🚀 marketing channel list', '16 acquisition channels');
  row('🚀 marketing campaign --channel <k> --goal "<g>"', 'Design a campaign');
  row('🚀 marketing publish --platform <p> [--live]', 'Post to FB/IG/Telegram/Slack…');
  row('🚀 marketing ads --goal "<g>" --budget <n>', 'Meta paid-ads campaign (paused)');
  row('💰 sales pipeline [--deal "<n>" --value <v>]', 'Pipeline & deals');
  row('💰 sales followup --deal "<n>"', 'AI follow-up message');
  row('✍️  content blog|email|post --topic "<t>"', 'Generate content');
  row('✍️  content image --prompt "<p>"', 'Generate media assets');
  row('🤝 crm contact add "<email>"', 'Manage contacts & history');
  row('🤖 automation flow add|list|run', 'Wire agents into flows');
  row('📊 finance revenue|expense|report', 'Cash flow, MRR, CFO read-out');
  row('🚀 deploy --src ./dist [--live]', 'Ship to your VPS over SSH');
  log('');
  log(c.bold('  AUTONOMY'));
  row('run [--execute]', 'Orchestrator plans & acts');
  row('schedule "<when>" --do "<cmd>"', 'NL recurring tasks (cron-ready)');
  row('web [--port 8788] [--host H]', 'Web panel (chat/integrations/db) — deployable, token-auth');
  row('serve [--port 8787]', 'Inbound: webhooks, auto-reply, asset hosting');
  row('inbox', 'Inbound messages received by the server');
  row('memory', 'What the agents remember');
  row('usage [--recent]', 'LLM token spend + budget for this workspace');
  log('');
  log('  ' + c.dim('Outbound is dry-run until: ') + c.cyan('afax config set live true'));
  log('');
  const llm = hasLLM() ? c.green('● ' + cfg.provider + '/' + activeProvider(cfg).model) : c.yellow('○ offline — run afax init');
  log('  ' + c.dim('LLM:') + ' ' + llm);
  log('');
}

function row(cmd, desc) {
  log('  ' + c.cyan(cmd.padEnd(46)) + c.dim(desc));
}

// ---- dotted path helpers ---------------------------------------------------
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

// Never print real secret values (apiKey/secret/token/pass) — `config get` is
// reachable from the chat agent and could be tricked into exfiltrating keys.
const SECRET_KEY = /(key|secret|token|pass)$/i;
function maskSecrets(path, value) {
  const leaf = String(path || '').split('.').pop();
  if (value && typeof value === 'object') {
    const out = Array.isArray(value) ? [] : {};
    for (const [k, v] of Object.entries(value)) out[k] = maskSecrets(k, v);
    return out;
  }
  if (SECRET_KEY.test(leaf) && value) return '••• (set — hidden)';
  return value;
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  if (keys.some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) return; // prototype-pollution guard
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}
function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !isNaN(Number(v))) return Number(v);
  return v;
}
