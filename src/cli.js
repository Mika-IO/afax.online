// AFAX CLI — argument parsing, command routing, dispatch.
import { load, save, configPath, isConfigured, activeProvider, hasLLM } from './config.js';
import { read } from './store.js';
import { recall, forgetAll } from './memory.js';
import { c, header, table, ok, info, warn, log, dim } from './logger.js';

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

const VERSION = '0.1.0';

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
    case 'help':
    case '--help':
    case '-h':
      return help();
    case 'version':
    case '--version':
    case '-v':
      return log(`afax v${VERSION}`);
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
        ['business.name', cfg.business.name || '—'],
        ['business.icp', cfg.business.icp || '—'],
        ['LLM', hasLLM() ? c.green('online') : c.yellow('offline')],
      ]
    );
    return;
  }
  if (action === 'get') {
    return log(JSON.stringify(getPath(cfg, args._[1]), null, 2));
  }
  if (action === 'set') {
    const path = args._[1];
    const value = args._.slice(2).join(' ');
    if (!path) return warn('Usage: afax config set <path> <value>   e.g. afax config set providers.anthropic.apiKey sk-...');
    setPath(cfg, path, coerce(value));
    save(cfg);
    return ok(`Set ${c.bold(path)} = ${path.includes('apiKey') ? '•••' : value}`);
  }
  warn('Usage: afax config show|get <path>|set <path> <value>|path');
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
  log(c.orange('  █████╗ ███████╗ █████╗ ██╗  ██╗'));
  log(c.orange('  ██╔══██╗██╔════╝██╔══██╗╚██╗██╔╝'));
  log(c.orange('  ███████║█████╗  ███████║ ╚███╔╝ '));
  log(c.orange('  ██╔══██║██╔══╝  ██╔══██║ ██╔██╗ '));
  log(c.orange('  ██║  ██║██║     ██║  ██║██╔╝ ██╗'));
  log(c.orange('  ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝'));
  log('  ' + c.dim('Autonomous Force for Automation eXecution · v' + VERSION));
  log('  ' + c.dim('Your company on autopilot with AI.'));
  log('');
  log(c.bold('  SETUP'));
  row('init', 'Interactive setup (provider, model, business profile)');
  row('context ingest <url>', 'Learn your company from its website');
  row('workspace use <name>', 'Switch company (multi-company isolated data)');
  row('export / import <file>', 'Back up or move a company');
  row('connect <platform>', 'Wire email / meta / telegram / leads / media …');
  row('connections', 'Show what is connected (+ live/dry-run)');
  row('status', 'Company dashboard across all 7 modules');
  row('run [--execute]', 'Orchestrator: plan & run the next best actions');
  row('config show|set <path> <v>', 'View/change configuration');
  log('');
  log(c.bold('  AGENTS'));
  row('🎯 prospect --target "<icp>" --limit <n>', 'AI-qualified lead profiles');
  row('🎯 prospect source <domain>', 'REAL contacts via Hunter.io');
  row('📨 outreach --channel email [--live]', 'Personalized cold outreach (sends)');
  row('🚀 marketing channel list', '16 acquisition channels');
  row('🚀 marketing campaign --channel <k> --goal "<g>"', 'Design a campaign');
  row('🚀 marketing publish --platform <p> [--live]', 'Post to FB/IG/Telegram/Slack…');
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
  row('schedule "<when>" --do "<cmd>"', 'NL recurring tasks (cron-ready)');
  row('memory', 'What the agents remember');
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
function setPath(obj, path, value) {
  const keys = path.split('.');
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
