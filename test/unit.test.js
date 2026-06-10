// AFAX unit tests — run with: npm test  (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Isolate all filesystem state to a temp home before importing modules.
process.env.AFAX_HOME = mkdtempSync(join(tmpdir(), 'afax-test-'));
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AFAX_PROVIDER;

const { parse } = await import('../src/cli.js');
const { parseJSON } = await import('../src/llm/index.js');
const { tokenize } = await import('../src/agents/automation.js');
const { add, read, update, find } = await import('../src/store.js');
const { slugify } = await import('../src/paths.js');
const { createWorkspace, useWorkspace, listSlugs } = await import('../src/workspace.js');
const { buildExport } = await import('../src/data.js');

test('parse: flags, values, =, positionals, booleans', () => {
  const a = parse(['prospect', '--target', 'SaaS founders', '--limit=5', 'extra', '--live']);
  assert.equal(a._[0], 'prospect');
  assert.equal(a._[1], 'extra');
  assert.equal(a.target, 'SaaS founders');
  assert.equal(a.limit, '5');
  assert.equal(a.live, true);
});

test('parseJSON: strips fences and surrounding prose', () => {
  assert.deepEqual(parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJSON('here you go: {"x":[1,2]} done'), { x: [1, 2] });
});

test('tokenize: honors single/double quotes', () => {
  assert.deepEqual(tokenize(`crm contact add "a b@x.com" --name 'Jane Doe'`), [
    'crm', 'contact', 'add', 'a b@x.com', '--name', 'Jane Doe',
  ]);
});

test('store: add/read/update/find round-trip', () => {
  const rec = add('deals', { name: 'Acme', value: 100 });
  assert.ok(rec.id);
  assert.equal(read('deals').length, 1);
  update('deals', rec.id, { stage: 'won' });
  assert.equal(find('deals', (d) => d.id === rec.id).stage, 'won');
});

test('slugify', () => {
  assert.equal(slugify('Acme Inc!'), 'acme-inc');
  assert.equal(slugify('   '), 'default');
});

test('workspaces: isolated data', () => {
  createWorkspace('Company A');
  useWorkspace('Company A');
  add('leads', { name: 'lead-in-A' });
  useWorkspace('Company B');
  assert.equal(read('leads').length, 0, 'B starts empty');
  add('leads', { name: 'lead-in-B' });
  useWorkspace('company-a');
  assert.equal(read('leads').length, 1);
  assert.equal(read('leads')[0].name, 'lead-in-A');
  assert.ok(listSlugs().includes('company-a'));
  assert.ok(listSlugs().includes('company-b'));
});

test('export: redacts secrets by default', async () => {
  const { save, load } = await import('../src/config.js');
  useWorkspace('secret-co');
  const cfg = load();
  cfg.integrations.email.apiKey = 'super-secret';
  cfg.business.name = 'Secret Co';
  save(cfg);
  const exp = buildExport('secret-co');
  assert.equal(exp.profile.integrations.email.apiKey, '***REDACTED***');
  assert.equal(exp.profile.business.name, 'Secret Co');
  const exp2 = buildExport('secret-co', { withSecrets: true });
  assert.equal(exp2.profile.integrations.email.apiKey, 'super-secret');
});
