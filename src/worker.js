// ⚙️  Background worker — the thing that makes "close the app, come back, it's
// done" real. It drains queued tasks: each task is a natural-language GOAL, run
// through the goal-driven orchestrator. Work that would send leaves a draft in
// the approval queue (it never sends on its own). Runs from `afax work`, and on
// every heartbeat tick of `afax cloud`.
import { read, update } from './store.js';
import { pending } from './approvals.js';
import { c, header, ok, info, warn, step, log } from './logger.js';

// A task is "pickable" when it's still to-do and not already finished/failed.
function pickable(t) {
  return t.status === 'todo' && !['done', 'failed'].includes(t.runState || '');
}

// Run every pickable task once. Cancellable via `signal`.
export async function drain({ signal, quiet = false } = {}) {
  const tasks = read('tasks', []).filter(pickable);
  if (!tasks.length) return { ran: 0 };
  const { executeGoal } = await import('./orchestrator.js');
  let ran = 0;
  for (const t of tasks) {
    if (signal?.aborted) break;
    if (!quiet) step(`Task ${c.dim(t.id)} → ${c.bold(t.title)}`);
    update('tasks', t.id, { status: 'doing', runState: 'running', ranAt: new Date().toISOString() });
    const before = pending().length;
    try {
      const res = await executeGoal(t.title, { signal });
      const produced = Math.max(0, pending().length - before);
      const failedSteps = res.log.filter((s) => !s.ok);
      const patch = { log: res.log, result: res.reasoning, prepared: produced };
      if (produced > 0) {
        update('tasks', t.id, { ...patch, status: 'doing', runState: 'awaiting_approval' });
        if (!quiet) info(`  ${produced} item(s) preparado(s) — aguardando aprovação.`);
      } else if (failedSteps.length && failedSteps.length === res.log.length) {
        update('tasks', t.id, { ...patch, runState: 'failed', error: failedSteps[0]?.error || 'all steps failed' });
        if (!quiet) warn(`  Task falhou: ${failedSteps[0]?.error || ''}`);
      } else {
        update('tasks', t.id, { ...patch, status: 'done', runState: 'done' });
        if (!quiet) ok(`  Concluída.`);
      }
      ran++;
    } catch (e) {
      update('tasks', t.id, { runState: 'failed', error: e.message });
      if (!quiet) warn(`  Task falhou: ${e.message}`);
    }
  }
  return { ran };
}

// `afax work` — drain the queue once, from the terminal.
export async function cmd(args) {
  header('⚙️  Worker', 'Rodando tasks da fila');
  const tasks = read('tasks', []).filter(pickable);
  if (!tasks.length) {
    info('Fila vazia. Crie uma task: afax task add "preparar outreach pra 5 leads reais"');
    return;
  }
  const { ran } = await drain({});
  log('');
  ok(`${ran} task(s) processada(s). Revise os preparos: ${c.cyan('afax approvals')}`);
}
