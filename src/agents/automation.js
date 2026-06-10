// 🤖 Automation — flows, webhooks, event triggers (Make/Zapier-style).
import { Agent } from './base.js';
import { read, write, add, find } from '../store.js';
import { c, header, table, ok, info, warn, step, log, dim } from '../logger.js';

export const automation = new Agent({
  key: 'automation',
  name: 'Automation',
  emoji: '🤖',
  role: 'Flows & triggers',
  system: 'You are AFAX Automation. You wire agents into reliable, observable flows.',
});

// A flow = { name, trigger, steps:[ "<afax subcommand line>", ... ] }
// afax automation flow add "name" --trigger "new lead" --steps "content email --topic onboarding; crm note ..."
// afax automation flow list
// afax automation flow run "name"
// afax automation flow rm "name"
export async function cmd(args, dispatch) {
  const sub = args._[0];
  if (sub !== 'flow') return warn('Usage: afax automation flow add|list|run|rm ...');
  const action = args._[1];

  if (action === 'add') {
    const name = args._[2] || args.name;
    if (!name) return warn('Usage: afax automation flow add "welcome" --trigger "new lead" --steps "content email --topic welcome; sales followup --deal X"');
    const steps = (args.steps || '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    const rec = add('flows', {
      name,
      trigger: args.trigger || 'manual',
      steps,
      runs: 0,
    });
    automation.note(`Created flow "${name}" (${steps.length} steps, trigger: ${rec.trigger}).`);
    ok(`Flow ${c.bold(name)} created · ${steps.length} step(s) · trigger: ${rec.trigger}`);
    return;
  }

  if (action === 'list' || !action) {
    header(`${automation.emoji} Automation`, 'Flows');
    const flows = read('flows', []);
    table(
      ['Name', 'Trigger', 'Steps', 'Runs'],
      flows.map((f) => [f.name, f.trigger, f.steps.length, f.runs || 0])
    );
    if (flows.length) {
      log('');
      info(`Run one: ${c.cyan('afax automation flow run "' + flows[0].name + '"')}`);
    }
    return;
  }

  if (action === 'rm') {
    const name = args._[2];
    const flows = read('flows', []).filter((f) => f.name !== name);
    write('flows', flows);
    return ok(`Removed flow "${name}".`);
  }

  if (action === 'run') {
    const name = args._[2] || args.name;
    const flow = find('flows', (f) => f.name === name);
    if (!flow) return warn(`No flow "${name}".`);
    header(`${automation.emoji} Automation`, `Running flow · ${flow.name}`);
    if (!flow.steps.length) return info('Flow has no steps.');
    let i = 1;
    for (const line of flow.steps) {
      step(`Step ${i++}/${flow.steps.length}: ${c.dim(line)}`);
      try {
        await dispatch(tokenize(line));
      } catch (e) {
        warn(`Step failed: ${e.message}`);
      }
      log('');
    }
    const flows = read('flows', []);
    const f = flows.find((x) => x.id === flow.id);
    if (f) { f.runs = (f.runs || 0) + 1; f.lastRun = new Date().toISOString(); write('flows', flows); }
    automation.note(`Ran flow "${flow.name}".`);
    ok(`Flow ${c.bold(flow.name)} complete.`);
  }
}

// Minimal shell-style tokenizer honoring single/double quotes.
export function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
