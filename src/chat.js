// 💬 Chat — the natural-language interface to AFAX. `afax` (no args) drops
// you into a Claude-style conversational session: you talk, the assistant
// answers in natural language and runs real AFAX commands under the hood.
// `afax ask "..."` is the one-shot, scriptable version of the same engine.
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { existsSync, statSync, readFileSync, readdirSync, writeFileSync, appendFileSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { resolve, join, relative, basename, dirname } from 'node:path';
import { chat as llm } from './llm/index.js';
import { load, hasLLM, activeProvider } from './config.js';
import { snapshot } from './orchestrator.js';
import { connections } from './integrations/registry.js';
import { recall, remember } from './memory.js';
import { tokenize } from './agents/automation.js';
import { costOf } from './llm/pricing.js';
import { budgetState, fmtUSD, fmtTok } from './usage.js';
import { styleBlock } from './style.js';
import { c, log, warn, info, banner } from './logger.js';

// Running cost meter for the current chat session.
const session = { cost: 0, input: 0, output: 0, calls: 0 };

const MAX_ACTIONS_PER_TURN = 5;
const MAX_HISTORY = 30;

// Commands the assistant may run. Interactive/recursive ones are excluded.
const BLOCKED = ['chat', 'ask', 'serve', 'web', 'init', 'connect', 'self-update', 'selfupdate', 'reinstall'];

// Interactive/recursive commands the agent must not run — except the
// non-interactive `connect paste|test`, which let it self-configure.
function isInteractive(tokens) {
  const head = tokens[0];
  if (head === 'connect') return !['paste', 'test'].includes(tokens[1]);
  return BLOCKED.includes(head);
}

// Local filesystem inspection tools — the agent's "eyes". Read-only. Let the
// model explore what the user points at (a folder of leads, a CSV, a repo)
// before it plans, instead of asking the user to describe everything.
const TOOLS = `
fs ls <path>            list a directory (files + sizes)
fs tree <path>          recursive listing (depth 3)
fs read <path>          read a file (first ~6 KB)
fs find <pattern> [--in <dir>]   find files by name/glob substring
fs write <path> --content "<text>"    create/overwrite a file (asks approval)
fs append <path> --content "<text>"   append to a file (asks approval)
fs mkdir <path>         create a directory (asks approval)
fs mv <src> <dst>       move/rename a file (asks approval)
fs rm <path>            delete a file or directory (asks approval)
browser open <url>      open a real headless browser at <url> → returns page text + numbered [i] elements
browser read            re-read the current page (text + numbered elements)
browser click <i>       click element [i] from the latest snapshot
browser type <i> "<t>"  type text into field [i]
browser enter           press Enter (submit)
browser scroll up|down  scroll the page
browser shot [name]     screenshot the page to ~/.afax/assets
browser close           close the browser when done`.trim();

const COMMANDS = `
status | run [--execute --steps N] | memory [clear] | usage [--recent]
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
content carousel|meme|poster|reel --topic "<t>" [--spec f.json] [--lang pt] [--accent #hex] [--duration N]   (premium HTML→PNG/MP4 assets; reel = motion video)
crm contact add "<email>" [--name --company] | crm contact list|show | crm note "<email>" "<text>"
email send --to <addr> --subject "<s>" --body "<text>" [--live] | email status   (one email to ONE exact address — use this instead of outreach when the user names a recipient)
automation flow add "<name>" --trigger "<t>" --steps "<cmd; cmd>" | automation flow list|run|rm
finance revenue --source "<s>" --amount N [--type subscription] | finance expense --label "<l>" --amount N
finance invoice --to "<who>" --amount N [--live] | finance report
task add "<title>" [--detail "..."] | task list [--all] | task start|done|reopen|rm <id>
schedule "<when>" --do "<cmd>" | schedule list|run|rm <id>
export [--out f] | import <file> | connections | config show|get|set
deploy --src <dir> [--run "<cmd>"] [--live]`.trim();

const ABOUT = `AFAX (Autonomous Force for Automation eXecution) is a zero-dependency CLI that runs an autonomous AI company: 8 agents (Prospect, Outreach, Marketing, Sales, Content, CRM, Automation, Finance) + an orchestrator with persistent memory, over local JSON data in ~/.afax. Outbound actions are dry-run unless BOTH gates are set: \`config set live true\` AND --live per command. It runs 24/7 on a VPS via \`afax schedule run\` in cron plus \`afax serve\` for inbound webhooks. Docs: https://afax.online/docs.html`;

// A compact "connected / not set" line so the model knows its real reach and
// never promises a channel that isn't wired up.
function connectionLine() {
  try {
    const conn = connections();
    const on = conn.filter(([, ready]) => ready).map(([name]) => name);
    const off = conn.filter(([, ready]) => !ready).map(([name]) => name);
    return `connected: ${on.length ? on.join(', ') : 'none'} | not set: ${off.length ? off.join(', ') : 'none'}`;
  } catch {
    return 'unknown';
  }
}

function systemPrompt() {
  const cfg = load();
  const s = snapshot();
  const mem = recall(null, 10).map((m) => `- [${m.scope}] ${m.text}`).join('\n');
  const b = cfg.business;
  return [
    'You are AFAX, the user\'s autonomous company copilot, in an interactive terminal session. ',
    'Be direct, concise and helpful. The user is the CEO.',
    '',
    'You can answer questions (about the business, the data, or AFAX itself) and you can act by running commands.',
    'You are agentic: when a task is fuzzy, investigate before answering. The CEO often points at things on disk',
    '(e.g. "../crm", "the leads folder", "that CSV"). Do NOT ask them to describe structure you can inspect yourself —',
    `your working directory is ${process.cwd()}. Use the fs tools to ls/tree/read/find, understand the data, then`,
    'propose a concrete plan and run the AFAX commands to execute it. Explore first, plan, then act.',
    '',
    `About AFAX: ${ABOUT}`,
    '',
    `Business: ${b.name || 'unnamed'} | Offer: ${b.offer || '—'} | ICP: ${b.icp || '—'} | workspace: ${cfg.workspace}`,
    `Company state: ${Object.entries(s).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `Outbound: ${cfg.live ? 'LIVE enabled globally' : 'dry-run (live=false)'} | Autonomy: ${cfg.autonomy}`,
    `Connected channels: ${connectionLine()}`,
    mem ? `Recent memory:\n${mem}` : '',
    '',
    'Tools — local filesystem (read + write) and a real browser you can drive:',
    TOOLS,
    'File writes (fs write/append/mkdir/mv/rm) and any --live send are gated: the user is asked to approve',
    'each one (with an "approve all" option). Plan reads freely; only propose a write/send when it\'s actually needed.',
    'Browser: use it for anything the web fetch can\'t do — JS-rendered sites, research, filling forms,',
    'checking a live page, comparing competitors. Loop: open → read the numbered elements → click/type → read again.',
    'It\'s a real browser with no saved logins; if a task needs the user\'s credentials, say so instead of guessing.',
    '',
    'Available commands (exact syntax, no "afax" prefix):',
    COMMANDS,
    '',
    'Respond with VALID JSON ONLY: {"say":"<what you tell the user, plain text>","run":["<command>", ...]}',
    '',
    'HOW TO ACT — be genuinely autonomous, not a chatbot:',
    '- Default to DOING. When the user asks for an outcome, plan it and run the steps end-to-end in one go,',
    '  then report the real result. Do not ask "want me to?" for anything safe — read-only and dry-run work',
    '  needs no permission. Only pause before a real outbound send (--live) or anything destructive/irreversible.',
    '- Chain multiple commands in one turn (explore → generate → preview) instead of doing one and stopping.',
    '- For multi-step or longer work, track it on the shared board: `task add "..."`, mark `task start <id>` when you',
    '  begin and `task done <id>` when finished, so the CEO can watch progress. Keep the board honest and current.',
    '',
    'KNOW YOUR LIMITS — be honest, never stall or pad:',
    '- A channel marked "not set" above is NOT usable. If a request needs it, say so and help connect it:',
    '  tell them exactly where to get the key (you know each service), and the moment they paste a key/token/',
    '  webhook URL, run  connect paste "<value>"  — it auto-detects the service, saves and live-tests it. Use',
    '  connect test to verify. Never pretend an unconnected channel worked.',
    '- If a command output shows an error, "not configured", or stays dry-run, report that plainly — do not spin it as success.',
    '- Self-correct: if a command fails on a fixable mistake (bad flag, wrong quoting, missing arg), fix it and retry once — don\'t give up or ask the user to do it.',
    '- Verify before claiming done: when it\'s cheap, confirm the result with a read (status, *list, crm contact list…) instead of asserting an outcome you didn\'t check.',
    '- If a task is outside AFAX (no command/integration covers it), say so directly and suggest the closest thing. Don\'t invent capabilities.',
    '- Never invent command output. Never use commands outside the list. Quote multi-word values.',
    '- No filler. No motivational fluff. No restating menus. If you cannot do something, the answer is what\'s blocking it',
    '  and the single next step — short. A useful "I can\'t do X because Y, do Z" beats a paragraph of generic text.',
    '- Outbound commands send real messages only when the user clearly asked AND the channel is connected; otherwise keep them dry-run.',
    '- When the user names an email recipient (e.g. "email me at x@y.com"), use `email send --to <that exact address>`.',
    '  Use the address EXACTLY as given — never alter, guess, or substitute it, and never use `outreach` (that targets leads) for a one-off email.',
    '',
    styleBlock(cfg),
    '(These language and style rules govern the "say" field.)',
  ].filter(Boolean).join('\n');
}

// --- streaming UI ------------------------------------------------------------
// Decode the `say` string value out of a partial JSON buffer as it streams in.
// Returns the text-so-far (handling \n \t \" \\ escapes), or null if not started.
export function saySoFar(buf) {
  const m = buf.match(/"say"\s*:\s*"/);
  if (!m) return null;
  let out = '';
  let esc = false;
  for (let i = m.index + m[0].length; i < buf.length; i++) {
    const ch = buf[i];
    if (esc) {
      out += { n: '\n', t: '\t', r: '\r' }[ch] ?? ch;
      esc = false;
    } else if (ch === '\\') {
      esc = true;
    } else if (ch === '"') {
      break; // string closed
    } else {
      out += ch;
    }
  }
  return out;
}

// A loading spinner that erases itself the moment real output arrives.
function thinking() {
  if (!stdout.isTTY) return { stop() {} };
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const id = setInterval(() => {
    stdout.write('\r  ' + c.orange(frames[i++ % frames.length]) + ' ' + c.dim('thinking…'));
  }, 80);
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(id);
      stdout.write('\r\x1b[K'); // clear the spinner line
    },
  };
}

// Renders the assistant `say` field live as JSON tokens stream in.
function sayRenderer() {
  let printed = 0;
  let started = false;
  let text = '';
  return {
    push(buf) {
      const say = saySoFar(buf);
      if (say == null) return;
      text = say;
      if (!started) { stdout.write('\n' + c.orange('●') + ' '); started = true; }
      if (say.length > printed) {
        stdout.write(say.slice(printed).split('\n').join('\n  '));
        printed = say.length;
      }
    },
    done() { if (started) stdout.write('\n'); },
    get text() { return text; },
    get started() { return started; },
  };
}

// --- filesystem tools (the agent's eyes) ------------------------------------
const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '.cache']);

function fmtSize(n) {
  if (n < 1024) return n + 'B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'K';
  return (n / 1024 / 1024).toFixed(1) + 'M';
}

function listDir(p) {
  const out = [];
  for (const name of readdirSync(p).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    let st;
    try { st = statSync(join(p, name)); } catch { continue; }
    out.push(st.isDirectory() ? `${name}/` : `${name}  ${fmtSize(st.size)}`);
    if (out.length >= 200) { out.push('… (truncated)'); break; }
  }
  return out.length ? out.join('\n') : '(empty)';
}

function treeDir(root, depth = 3) {
  const lines = [];
  const walk = (dir, prefix, d) => {
    if (d > depth || lines.length >= 300) return;
    let names;
    try { names = readdirSync(dir).sort(); } catch { return; }
    for (const name of names) {
      if (SKIP_DIRS.has(name) || lines.length >= 300) continue;
      let st;
      try { st = statSync(join(dir, name)); } catch { continue; }
      const isDir = st.isDirectory();
      lines.push(`${prefix}${name}${isDir ? '/' : '  ' + fmtSize(st.size)}`);
      if (isDir) walk(join(dir, name), prefix + '  ', d + 1);
    }
  };
  walk(root, '', 1);
  return lines.length ? lines.join('\n') : '(empty)';
}

function findFiles(root, pattern) {
  const needle = pattern.toLowerCase().replace(/[*?]/g, '');
  const hits = [];
  const walk = (dir) => {
    if (hits.length >= 100) return;
    let names;
    try { names = readdirSync(dir).sort(); } catch { return; }
    for (const name of names) {
      if (SKIP_DIRS.has(name) || hits.length >= 100) continue;
      const full = join(dir, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
      else if (name.toLowerCase().includes(needle)) hits.push(relative(process.cwd(), full) || name);
    }
  };
  walk(root);
  return hits.length ? hits.join('\n') : `(no files matching "${pattern}")`;
}

// Run a read-only `fs` tool and return its output for the model.
export function fsTool(args) {
  const sub = args._[0];
  const target = (args._[1] || (sub === 'find' ? '' : '.')).replace(/^["']|["']$/g, '');
  try {
    if (sub === 'find') {
      const root = resolve(process.cwd(), (args.in || '.').replace(/^["']|["']$/g, ''));
      if (!target) return 'Error: usage — fs find <pattern> [--in <dir>]';
      return findFiles(root, target);
    }
    const p = resolve(process.cwd(), target);
    if (!existsSync(p)) return `Error: no such path: ${target}`;
    const st = statSync(p);
    if (sub === 'ls') return st.isDirectory() ? listDir(p) : `${basename(p)}  ${fmtSize(st.size)} (file)`;
    if (sub === 'tree') return st.isDirectory() ? treeDir(p) : `${basename(p)} is a file`;
    if (sub === 'read') {
      if (st.isDirectory()) return `${target} is a directory — use fs ls/tree`;
      const data = readFileSync(p, 'utf8');
      return data.length > 6000 ? data.slice(0, 6000) + `\n… (${fmtSize(st.size)} total, truncated)` : data;
    }
    return `Error: unknown fs tool "${sub}". Use ls|tree|read|find.`;
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

// --- filesystem write tools (gated by approval) -----------------------------
// Mutating fs subcommands + any `--live` command require the user's go-ahead.
const MUTATING_FS = new Set(['write', 'append', 'mkdir', 'mv', 'move', 'rm', 'del', 'delete']);

// Does running this command change the world (disk / outbound send)?
export function needsApproval(cmd) {
  const tokens = tokenize(cmd);
  if (tokens[0] === 'fs' && MUTATING_FS.has(tokens[1])) return true;
  if (tokens.includes('--live')) return true;
  return false;
}

// Confine writes to the working directory subtree — the agent edits the project
// it was pointed at, not arbitrary system paths.
function safeTarget(target) {
  const root = resolve(process.cwd());
  const p = resolve(root, String(target || '').replace(/^["']|["']$/g, ''));
  if (p !== root && !p.startsWith(root + '/')) {
    throw new Error(`refusing to touch a path outside the working directory: ${target}`);
  }
  return p;
}

// Run a mutating `fs` tool. Approval is enforced by the caller, not here.
export function fsWriteTool(args) {
  const sub = args._[0];
  const content = args.content != null ? String(args.content) : args._.slice(2).join(' ');
  try {
    if (sub === 'write') {
      const p = safeTarget(args.path || args._[1]);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content);
      return `Wrote ${content.length} bytes → ${relative(process.cwd(), p)}`;
    }
    if (sub === 'append') {
      const p = safeTarget(args.path || args._[1]);
      mkdirSync(dirname(p), { recursive: true });
      appendFileSync(p, content);
      return `Appended ${content.length} bytes → ${relative(process.cwd(), p)}`;
    }
    if (sub === 'mkdir') {
      const p = safeTarget(args._[1]);
      mkdirSync(p, { recursive: true });
      return `Created directory ${relative(process.cwd(), p)}`;
    }
    if (sub === 'mv' || sub === 'move') {
      const src = safeTarget(args._[1]);
      const dst = safeTarget(args._[2]);
      if (!existsSync(src)) return `Error: no such path: ${args._[1]}`;
      mkdirSync(dirname(dst), { recursive: true });
      renameSync(src, dst);
      return `Moved ${relative(process.cwd(), src)} → ${relative(process.cwd(), dst)}`;
    }
    if (sub === 'rm' || sub === 'del' || sub === 'delete') {
      const p = safeTarget(args._[1]);
      if (!existsSync(p)) return `Error: no such path: ${args._[1]}`;
      rmSync(p, { recursive: true, force: true });
      return `Deleted ${relative(process.cwd(), p)}`;
    }
    return `Error: unknown fs write tool "${sub}".`;
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

// Drive the headless browser (Playwright, optional). Returns text the agent observes.
async function browserTool(args) {
  const sub = args._[0];
  const a1 = args._[1];
  const unquote = (s) => String(s || '').replace(/^["']|["']$/g, '');
  try {
    const b = await import('./integrations/browser.js');
    switch (sub) {
      case 'open': case 'goto': return await b.goto(unquote(a1));
      case 'read': return await b.read();
      case 'click': return await b.click(a1);
      case 'type': return await b.type(a1, unquote(args._.slice(2).join(' ')));
      case 'enter': case 'press': return await b.press(unquote(a1) || 'Enter');
      case 'scroll': return await b.scroll(a1 || 'down');
      case 'shot': case 'screenshot': return 'Saved screenshot: ' + (await b.screenshot(a1));
      case 'close': await b.close(); return 'Browser closed.';
      default: return 'Unknown browser action. Use open|read|click|type|enter|scroll|shot|close.';
    }
  } catch (e) {
    return 'Error: ' + e.message;
  }
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

// Ask the model for one JSON step, streaming `say` live and degrading
// gracefully so the user always gets an answer (never "Empty model response").
async function think(messages, render) {
  const spin = render ? thinking() : null;
  const renderer = render ? sayRenderer() : null;
  const onToken = render
    ? (_d, full) => { if (spin) spin.stop(); renderer.push(full); }
    : undefined;
  try {
    const { json, usage } = await llm({
      system: systemPrompt(),
      messages: messages.slice(-MAX_HISTORY),
      json: true,
      temperature: 0.4,
      maxTokens: 4000,
      onToken,
    });
    if (renderer) renderer.done();
    return { json, rendered: renderer?.started, usage };
  } catch (e) {
    // Model returned empty / unparseable JSON. Don't crash the turn — recover a
    // plain-language answer so the user is never left staring at an error.
    if (renderer?.text) return { json: { say: renderer.text, run: [] }, rendered: true };
    const { text, usage } = await llm({
      system: systemPrompt(),
      messages: messages.slice(-MAX_HISTORY),
      json: false,
      temperature: 0.4,
      maxTokens: 4000,
    });
    const say = (text || '').trim() || 'Tive um problema para gerar a resposta. Pode repetir ou reformular?';
    return { json: { say, run: [] }, rendered: false, usage };
  } finally {
    if (spin) spin.stop();
  }
}

// Print the live cost meter for one model call and roll it into the session.
function meter(usage) {
  if (!usage) return;
  const { model } = activeProvider();
  const cost = costOf(model, usage);
  session.cost += cost;
  session.input += usage.input || 0;
  session.output += usage.output || 0;
  session.calls += 1;

  const b = budgetState();
  const left = b.monthly > 0 ? `  ·  month ${fmtUSD(b.spent)}/${fmtUSD(b.monthly)}` : '';
  log(
    '  ' +
      c.dim(
        `· ${fmtTok(usage.input || 0)}→${fmtTok(usage.output || 0)} tok  ·  ${fmtUSD(cost)}  ·  ` +
          `session ${fmtUSD(session.cost)}${left}`
      )
  );
}

// One conversational turn: think → act (≤ MAX_ACTIONS) → answer.
async function turn(messages, userText, { stream = false, approve } = {}) {
  messages.push({ role: 'user', content: userText });
  const render = stream && stdout.isTTY;
  const approver = approve || (async () => false);
  let final = '';
  for (let hop = 0; hop <= MAX_ACTIONS_PER_TURN; hop++) {
    const { json, rendered, usage } = await think(messages, render);
    const say = (json.say || '').trim();
    const run = (Array.isArray(json.run) ? json.run : []).slice(0, MAX_ACTIONS_PER_TURN);
    messages.push({ role: 'assistant', content: JSON.stringify(json) });

    if (say && !rendered) log('\n' + c.orange('●') + ' ' + say.split('\n').join('\n  '));
    meter(usage);
    if (!run.length || hop === MAX_ACTIONS_PER_TURN) { final = say; break; }

    const { parse } = await import('./cli.js');
    let results = '';
    for (const cmd of run) {
      const tokens = tokenize(cmd);
      const head = tokens[0];
      const mutatingFs = head === 'fs' && MUTATING_FS.has(tokens[1]);
      if (head === 'fs' && !mutatingFs) {
        log('\n' + c.dim('⏺ ' + cmd));
        const out = fsTool(parse(tokens.slice(1)));
        results += `[output of \`${cmd}\`]\n${out || '(no output)'}\n`;
        continue;
      }
      if (mutatingFs || needsApproval(cmd)) {
        if (!(await approver(cmd))) {
          results += `[${cmd}] not approved by the user — skipped.\n`;
          info(`Skipped (not approved): ${cmd}`);
          continue;
        }
        if (mutatingFs) {
          log('\n' + c.dim('⏺ ' + cmd));
          const out = fsWriteTool(parse(tokens.slice(1)));
          results += `[output of \`${cmd}\`]\n${out || '(no output)'}\n`;
          continue;
        }
      }
      if (head === 'browser') {
        log('\n' + c.dim('⏺ ' + cmd));
        const out = await browserTool(parse(tokens.slice(1)));
        results += `[output of \`${cmd}\`]\n${out || '(no output)'}\n`;
        continue;
      }
      if (isInteractive(tokens)) {
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

// The chat welcome screen: wordmark, status line, and a brief capability guide.
export function welcome() {
  const cfg = load();
  const company = cfg.business.name || cfg.workspace;
  const model = activeProvider(cfg).model;
  const live = cfg.live ? c.green('● live') : c.dim('○ dry-run');

  log('');
  banner();
  log('');
  log('  ' + c.bold('Your company on autopilot') + c.dim('  ·  ' + company + '  ·  ' + cfg.provider + '/' + model + '  ·  ') + live);
  log('');
  log('  ' + c.dim('WHAT I CAN DO — just ask in plain language:'));
  const g = (cmd, what) => log('    ' + c.orange(cmd.padEnd(12)) + c.dim(what));
  g('grow', 'find leads, write & send outreach, run campaigns');
  g('sell', 'manage pipeline, follow up deals, send invoices');
  g('create', 'blogs, emails, posts, ads, images — on brand');
  g('know', 'status across all modules, finance & CRM read-outs');
  g('automate', 'flows, schedules, run the next best actions for you');
  log('');
  log('  ' + c.dim('Try:') + ' "how are we doing?"  ·  "find 10 leads and draft outreach"');
  log('  ' + c.dim('I can read files you point me to. ') + c.dim('Type ') + c.cyan('exit') + c.dim(' to quit.'));
}

// Programmatic, headless turn used by the web UI. Streams structured events via
// onEvent: {type:'token',say} · {type:'say',text,usage} · {type:'command',cmd,out}
// · {type:'done',final}. Shares the same engine, tools and budget as the CLI.
export async function chatTurn(messages, userText, { onEvent = () => {}, signal, approve } = {}) {
  const { parse } = await import('./cli.js');
  messages.push({ role: 'user', content: userText });
  const approver = approve || (async () => false);
  let final = '';
  for (let hop = 0; hop <= MAX_ACTIONS_PER_TURN; hop++) {
    if (signal?.aborted) break;
    let json;
    let usage;
    try {
      const r = await llm({
        system: systemPrompt(),
        messages: messages.slice(-MAX_HISTORY),
        json: true,
        temperature: 0.4,
        maxTokens: 4000,
        signal,
        onToken: (_d, full) => { const say = saySoFar(full); if (say != null) onEvent({ type: 'token', say }); },
      });
      json = r.json; usage = r.usage;
    } catch (e) {
      if (signal?.aborted || e.name === 'AbortError') break; // user pressed Stop
      const r = await llm({ system: systemPrompt(), messages: messages.slice(-MAX_HISTORY), json: false, temperature: 0.4, maxTokens: 4000 });
      json = { say: (r.text || '').trim() || 'Tive um problema para gerar a resposta. Pode reformular?', run: [] };
      usage = r.usage;
    }
    const say = (json.say || '').trim();
    const run = (Array.isArray(json.run) ? json.run : []).slice(0, MAX_ACTIONS_PER_TURN);
    messages.push({ role: 'assistant', content: JSON.stringify(json) });
    onEvent({ type: 'say', text: say, usage });
    if (!run.length || hop === MAX_ACTIONS_PER_TURN) { final = say; break; }

    let results = '';
    for (const cmd of run) {
      // Honour the Stop button between every command — don't keep "reasoning"
      // and executing in the background after the user has aborted.
      if (signal?.aborted) { onEvent({ type: 'command', cmd, out: 'stopped by user' }); break; }
      const tokens = tokenize(cmd);
      const head = tokens[0];
      const mutatingFs = head === 'fs' && MUTATING_FS.has(tokens[1]);
      if (head === 'fs' && !mutatingFs) {
        const out = fsTool(parse(tokens.slice(1)));
        onEvent({ type: 'command', cmd, out });
        results += `[output of \`${cmd}\`]\n${out || '(no output)'}\n`;
        continue;
      }
      if (mutatingFs || needsApproval(cmd)) {
        if (!(await approver(cmd))) {
          const out = 'needs approval — turn on Auto-approve to let AFAX write files / send live.';
          onEvent({ type: 'command', cmd, out, denied: true });
          results += `[${cmd}] not approved by the user — skipped.\n`;
          continue;
        }
        if (mutatingFs) {
          const out = fsWriteTool(parse(tokens.slice(1)));
          onEvent({ type: 'command', cmd, out });
          results += `[output of \`${cmd}\`]\n${out || '(no output)'}\n`;
          continue;
        }
      }
      if (head === 'browser') {
        const out = await browserTool(parse(tokens.slice(1)));
        onEvent({ type: 'command', cmd, out });
        results += `[output of \`${cmd}\`]\n${out || '(no output)'}\n`;
        continue;
      }
      if (isInteractive(tokens)) {
        const out = `blocked: "${head}" is interactive — run it in the terminal.`;
        onEvent({ type: 'command', cmd, out });
        results += `[${cmd}] ${out}\n`;
        continue;
      }
      const out = await execCapture(cmd);
      onEvent({ type: 'command', cmd, out });
      results += `[output of \`${cmd}\`]\n${out || '(no output)'}\n`;
    }
    messages.push({ role: 'user', content: results + '\nContinue: more commands if needed, then answer the user in "say".' });
  }
  onEvent({ type: 'done', final });
  return final;
}

// afax chat — interactive REPL (also the default when running plain `afax`).
export async function repl() {
  if (!hasLLM()) {
    warn('Chat needs an LLM. Run: ' + c.cyan('afax init') + '  (every other command still works).');
    return;
  }
  welcome();
  session.cost = session.input = session.output = session.calls = 0;
  const rl = createInterface({ input: stdin, output: stdout });
  const messages = [];
  // Claude-style permission gate: every file write / live send asks first, with
  // an "all" option to approve the rest of this session.
  let approveAll = false;
  const approve = async (cmd) => {
    if (approveAll) return true;
    let ans;
    try {
      ans = (await rl.question('\n  ' + c.yellow('⚠ approve') + ' ' + c.bold(cmd) + c.dim('  [y]es / [n]o / [a]ll: '))).trim().toLowerCase();
    } catch { return false; }
    if (ans === 'a' || ans === 'all') { approveAll = true; return true; }
    return ans === 'y' || ans === 'yes' || ans === '';
  };
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
        await turn(messages, q, { stream: true, approve });
      } catch (e) {
        warn(e.message);
      }
    }
  } finally {
    rl.close();
    try { (await import('./integrations/browser.js')).close(); } catch {}
    remember('chat', `Chat session ended (${Math.floor(messages.length / 2)} turns).`);
    if (session.calls) {
      log('');
      log('  ' + c.dim(`Session: ${session.calls} calls · ${fmtTok(session.input + session.output)} tok · ${fmtUSD(session.cost)}`));
    }
    log('');
  }
}

// afax ask "<question>" — one-shot natural language, scriptable. File writes /
// live sends are denied unless --yes is passed (no human is at the prompt).
export async function ask(args) {
  const q = args._.join(' ');
  if (!q) return warn('Usage: afax ask "how is the pipeline looking?"');
  if (!hasLLM()) return warn('Ask needs an LLM. Run: afax init');
  const approve = async (cmd) => {
    if (args.yes) return true;
    info(`Skipped (needs --yes for non-interactive approval): ${cmd}`);
    return false;
  };
  await turn([], q, { stream: true, approve });
}
