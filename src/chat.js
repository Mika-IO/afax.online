// 💬 Chat — the natural-language interface to AFAX. `afax` (no args) drops
// you into a Claude-style conversational session: you talk, the assistant
// answers in natural language and runs real AFAX commands under the hood.
// `afax ask "..."` is the one-shot, scriptable version of the same engine.
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { chat as llm } from './llm/index.js';
import { load, hasLLM } from './config.js';
import { snapshot } from './orchestrator.js';
import { recall, remember } from './memory.js';
import { tokenize } from './agents/automation.js';
import { c, log, warn, info } from './logger.js';

const MAX_ACTIONS_PER_TURN = 5;
const MAX_HISTORY = 30;

// Commands the assistant may run. Interactive/recursive ones are excluded.
const BLOCKED = ['chat', 'ask', 'serve', 'init', 'connect'];

const COMMANDS = `
status | run [--execute --steps N] | memory [clear]
context ingest <url> | context show | context set <field> <value>
workspace list|create|use|current
prospect --target "<icp>" --limit N | prospect source <domain> | prospect verify <email> | prospect import <file.csv>
outreach --channel email|whatsapp|telegram --limit N [--live] | outreach preview
marketing channel list | marketing channel <key> enable|disable
marketing campaign --channel <key> --goal "<g>" | marketing campaigns
marketing publish --platform facebook|instagram|telegram|slack|discord [--message|--topic] [--image url] [--live]
marketing ads --goal "<g>" --budget <usd/day> [--live]
sales pipeline [--deal "<n>" --value N --stage <s>] | sales followup --deal "<n>" | sales move --deal "<n>" --stage <s>
content blog|email|post|landing|ad --topic "<t>" [--save f] | content image --prompt "<p>" | content list
crm contact add "<email>" [--name --company] | crm contact list|show | crm note "<email>" "<text>"
automation flow add "<name>" --trigger "<t>" --steps "<cmd; cmd>" | automation flow list|run|rm
finance revenue --source "<s>" --amount N [--type subscription] | finance expense --label "<l>" --amount N
finance invoice --to "<who>" --amount N [--live] | finance report
schedule "<when>" --do "<cmd>" | schedule list|run|rm <id>
export [--out f] | import <file> | connections | config show|get|set
deploy --src <dir> [--run "<cmd>"] [--live]`.trim();

const ABOUT = `AFAX (Autonomous Force for Automation eXecution) is a zero-dependency CLI that runs an autonomous AI company: 7 agents (Prospect, Outreach, Marketing, Sales, Content, CRM, Automation, Finance) + an orchestrator with persistent memory, over local JSON data in ~/.afax. Outbound actions are dry-run unless BOTH gates are set: \`config set live true\` AND --live per command. It runs 24/7 on a VPS via \`afax schedule run\` in cron plus \`afax serve\` for inbound webhooks. Docs: https://afax.online/docs.html`;

function systemPrompt() {
  const cfg = load();
  const s = snapshot();
  const mem = recall(null, 10).map((m) => `- [${m.scope}] ${m.text}`).join('\n');
  const b = cfg.business;
  return [
    'You are AFAX, the user\'s autonomous company copilot, in an interactive terminal session. ',
    'Be direct, concise and helpful. The user is the CEO.',
    '',
    'You can answer questions (about the business, the data, or AFAX itself) and you can act by running AFAX commands.',
    '',
    `About AFAX: ${ABOUT}`,
    '',
    `Business: ${b.name || 'unnamed'} | Offer: ${b.offer || '—'} | ICP: ${b.icp || '—'} | workspace: ${cfg.workspace}`,
    `Company state: ${Object.entries(s).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `Outbound: ${cfg.live ? 'LIVE enabled globally' : 'dry-run (live=false)'} | Autonomy: ${cfg.autonomy}`,
    mem ? `Recent memory:\n${mem}` : '',
    '',
    'Available commands (exact syntax, no "afax" prefix):',
    COMMANDS,
    '',
    'Respond with VALID JSON ONLY: {"say":"<what you tell the user, plain text>","run":["<command>", ...]}',
    '- "run" is optional; include it only when executing commands serves the request. Max ' + MAX_ACTIONS_PER_TURN + ' per turn.',
    '- After commands execute you will receive their terminal output and can continue (run more) or answer.',
    '- Never invent command output. Never use commands outside the list. Quote multi-word values.',
    '- Outbound commands send real messages only when the user clearly asked; otherwise keep them dry-run (no --live).',
  ].filter(Boolean).join('\n');
}

// Run one dispatched command while capturing its terminal output (for the model).
async function execCapture(command) {
  const { dispatch } = await import('./cli.js');
  const orig = console.log;
  let buf = '';
  console.log = (...a) => { buf += a.map(String).join(' ') + '\n'; orig(...a); };
  try {
    await dispatch(tokenize(command));
  } catch (e) {
    buf += `Error: ${e.message}\n`;
    warn(`Command failed: ${e.message}`);
  } finally {
    console.log = orig;
  }
  return buf.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 3000);
}

// One conversational turn: think → act (≤ MAX_ACTIONS) → answer.
async function turn(messages, userText) {
  messages.push({ role: 'user', content: userText });
  let final = '';
  for (let hop = 0; hop <= MAX_ACTIONS_PER_TURN; hop++) {
    const { json } = await llm({
      system: systemPrompt(),
      messages: messages.slice(-MAX_HISTORY),
      json: true,
      temperature: 0.4,
      maxTokens: 1200,
    });
    const say = (json.say || '').trim();
    const run = (Array.isArray(json.run) ? json.run : []).slice(0, MAX_ACTIONS_PER_TURN);
    messages.push({ role: 'assistant', content: JSON.stringify(json) });

    if (say) log('\n' + c.orange('●') + ' ' + say.split('\n').join('\n  '));
    if (!run.length || hop === MAX_ACTIONS_PER_TURN) { final = say; break; }

    let results = '';
    for (const cmd of run) {
      const head = tokenize(cmd)[0];
      if (BLOCKED.includes(head)) {
        results += `[${cmd}] blocked: "${head}" is interactive — tell the user to run it themselves.\n`;
        info(`Skipped interactive command: ${cmd}`);
        continue;
      }
      log('\n' + c.dim('⏺ afax ' + cmd));
      const out = await execCapture(cmd);
      results += `[output of \`${cmd}\`]\n${out || '(no output)'}\n`;
    }
    messages.push({ role: 'user', content: results + '\nContinue: more commands if needed, then answer the user in "say".' });
  }
  return final;
}

// afax chat — interactive REPL (also the default when running plain `afax`).
export async function repl() {
  if (!hasLLM()) {
    warn('Chat needs an LLM. Run: ' + c.cyan('afax init') + '  (every other command still works).');
    return;
  }
  const cfg = load();
  log('');
  log('  ' + c.orange('▰▰▰ ') + c.bold('AFAX') + c.dim(' · ' + (cfg.business.name || cfg.workspace) + ' · ' + cfg.provider));
  log('  ' + c.dim('Talk to your company in natural language — I run the commands.'));
  log('  ' + c.dim('Try: "how are we doing?" · "find 10 leads and draft outreach" · "what is AFAX?"'));
  log('  ' + c.dim('exit to quit'));

  const rl = createInterface({ input: stdin, output: stdout });
  const messages = [];
  try {
    for (;;) {
      let q;
      try {
        q = (await rl.question('\n' + c.orange('❯ '))).trim();
      } catch {
        break; // Ctrl+C / Ctrl+D
      }
      if (!q) continue;
      if (['exit', 'quit', 'q'].includes(q.toLowerCase())) break;
      try {
        await turn(messages, q);
      } catch (e) {
        warn(e.message);
      }
    }
  } finally {
    rl.close();
    remember('chat', `Chat session ended (${Math.floor(messages.length / 2)} turns).`);
    log('');
  }
}

// afax ask "<question>" — one-shot natural language, scriptable.
export async function ask(args) {
  const q = args._.join(' ');
  if (!q) return warn('Usage: afax ask "how is the pipeline looking?"');
  if (!hasLLM()) return warn('Ask needs an LLM. Run: afax init');
  await turn([], q);
}
