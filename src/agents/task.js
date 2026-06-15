// ✅ Tasks — a lightweight work board for the company (Polsia-style). The CEO and
// the agents share it: anything multi-step becomes a task with a status you can
// watch move from todo → doing → done. Stored per workspace in `tasks`.
import { add, read, update, remove } from '../store.js';
import { c, header, table, ok, info, warn, log } from '../logger.js';

const STATUS = ['todo', 'doing', 'done'];
const DOT = { todo: c.dim('○'), doing: c.yellow('◐'), done: c.green('●') };

// afax task add "<title>" [--detail "..."] | task list [--all] | task start|done|reopen|rm <id>
export function cmd(args) {
  const action = args._[0] || 'list';

  if (action === 'add') {
    const title = args._.slice(1).join(' ').replace(/^["']|["']$/g, '') || args.title;
    if (!title) return warn('Usage: afax task add "Draft Q3 outreach sequence"');
    const t = add('tasks', { title, status: 'todo', detail: args.detail || '' });
    return ok(`Task ${c.dim(t.id)} added — ${c.bold(title)}`);
  }

  if (['start', 'done', 'reopen', 'rm'].includes(action)) {
    const id = args._[1];
    if (!id) return warn(`Usage: afax task ${action} <id>`);
    const t = read('tasks', []).find((x) => x.id === id || x.id.startsWith(id.toUpperCase()));
    if (!t) return warn(`No task "${id}".`);
    if (action === 'rm') { remove('tasks', t.id); return ok(`Removed ${t.id}.`); }
    const status = action === 'start' ? 'doing' : action === 'done' ? 'done' : 'todo';
    update('tasks', t.id, { status });
    return ok(`${t.id} → ${status}  ${c.dim(t.title)}`);
  }

  // list
  header('✅ Tasks', 'The company work board');
  let tasks = read('tasks', []);
  if (!args.all) tasks = tasks.filter((t) => t.status !== 'done');
  if (!tasks.length) return info(args.all ? 'No tasks yet. Add one: afax task add "..."' : 'Nothing open. ' + c.dim('See all: afax task list --all'));
  tasks.sort((a, b) => STATUS.indexOf(a.status) - STATUS.indexOf(b.status));
  table(
    ['', 'ID', 'Status', 'Task'],
    tasks.map((t) => [DOT[t.status] || '○', c.dim(t.id), t.status, t.status === 'done' ? c.dim(t.title) : t.title])
  );
  log('');
  info(`Move: ${c.cyan('afax task start <id>')} · ${c.cyan('afax task done <id>')}`);
}
