// 🗓️ Scheduler — natural-language, cron-style task scheduling (Hermes-style).
// Stores tasks; `afax schedule run` executes everything currently due.
import { read, write, add, find } from './store.js';
import { c, header, table, ok, info, warn, step, log } from './logger.js';
import { tokenize } from './agents/automation.js';

// afax schedule "every day at 09:00" --do "finance report"
// afax schedule add "daily" --do "run --execute"
// afax schedule list
// afax schedule run        (run all due tasks)
// afax schedule rm <id>
export async function cmd(args, dispatch) {
  const sub = args._[0];

  if (sub === 'list') return list();
  if (sub === 'rm') {
    const id = args._[1];
    write('schedule', read('schedule', []).filter((t) => t.id !== id));
    return ok(`Removed schedule ${id}.`);
  }
  if (sub === 'run') return runDue(dispatch);

  // add (explicit or implicit)
  const when = sub === 'add' ? args._[1] : sub;
  const doCmd = args.do || args.cmd;
  if (!when || !doCmd) {
    return warn('Usage: afax schedule "every day at 09:00" --do "finance report"');
  }
  const rec = add('schedule', {
    when,
    every: parseEvery(when),
    command: doCmd,
    nextRun: nextRunFrom(when, Date.now()),
    runs: 0,
  });
  ok(`Scheduled ${c.bold(doCmd)} · ${when} ${c.dim('(' + rec.id + ')')}`);
  info(`AFAX runs due tasks when you call ${c.cyan('afax schedule run')} (wire it to system cron for 24/7).`);
}

function list() {
  header('🗓️  Scheduler', 'Recurring tasks');
  const tasks = read('schedule', []);
  table(
    ['ID', 'When', 'Command', 'Next run', 'Runs'],
    tasks.map((t) => [t.id, t.when, t.command, fmt(t.nextRun), t.runs || 0])
  );
  if (tasks.length) {
    log('');
    info(`Add to crontab for true 24/7:  ${c.dim('*/15 * * * * afax schedule run')}`);
  }
}

async function runDue(dispatch) {
  header('🗓️  Scheduler', 'Running due tasks');
  const now = Date.now();
  const tasks = read('schedule', []);
  const due = tasks.filter((t) => !t.nextRun || t.nextRun <= now);
  if (!due.length) {
    info('Nothing due.');
    return;
  }
  for (const t of due) {
    step(`Due: ${t.command} ${c.dim('(' + t.when + ')')}`);
    try {
      await dispatch(tokenize(t.command));
    } catch (e) {
      warn(`Task failed: ${e.message}`);
    }
    t.runs = (t.runs || 0) + 1;
    t.lastRun = now;
    t.nextRun = t.every ? now + t.every : null; // one-shot if no interval
    log('');
  }
  write('schedule', tasks);
  ok(`Ran ${due.length} task(s).`);
}

// Very small NL → interval(ms) parser. Good enough for daily/hourly/weekly + "every N min/hour".
function parseEvery(s) {
  s = s.toLowerCase();
  const HOUR = 3600e3, DAY = 24 * HOUR;
  if (/hourly|every hour/.test(s)) return HOUR;
  if (/daily|every day/.test(s)) return DAY;
  if (/weekly|every week/.test(s)) return 7 * DAY;
  const m = s.match(/every\s+(\d+)\s*(min|minute|hour|day|week)/);
  if (m) {
    const n = +m[1];
    const unit = { min: 60e3, minute: 60e3, hour: HOUR, day: DAY, week: 7 * DAY }[m[2]];
    return n * unit;
  }
  return null; // one-shot
}

function nextRunFrom(when, from) {
  const every = parseEvery(when);
  // If a clock time is given (e.g. "at 09:00"), align to it.
  const t = when.match(/at\s+(\d{1,2}):(\d{2})/);
  if (t) {
    const d = new Date(from);
    d.setHours(+t[1], +t[2], 0, 0);
    if (d.getTime() <= from) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  return every ? from + every : from;
}

const fmt = (ts) => (ts ? new Date(ts).toISOString().slice(0, 16).replace('T', ' ') : 'one-shot');
