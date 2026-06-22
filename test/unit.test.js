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
delete process.env.AFAX_WORKSPACE;

const { parse } = await import('../src/cli.js');
const { parseJSON } = await import('../src/llm/index.js');
const { tokenize } = await import('../src/agents/automation.js');
const { add, read, update, find } = await import('../src/store.js');
const { slugify } = await import('../src/paths.js');
const { createWorkspace, useWorkspace, listSlugs } = await import('../src/workspace.js');
const { buildExport } = await import('../src/data.js');
const { fsTool, saySoFar } = await import('../src/chat.js');
const { costOf, priceOf } = await import('../src/llm/pricing.js');
const { assertSafeUrl } = await import('../src/integrations/ssrf.js');
const { detect } = await import('../src/integrations/catalog.js');
const { record, monthTotals, budgetState } = await import('../src/usage.js');

test('parse: flags, values, =, positionals, booleans', () => {
  const a = parse(['prospect', '--target', 'SaaS founders', '--limit=5', 'extra', '--live']);
  assert.equal(a._[0], 'prospect');
  assert.equal(a._[1], 'extra');
  assert.equal(a.target, 'SaaS founders');
  assert.equal(a.limit, '5');
  assert.equal(a.live, true);
});

test('saySoFar: decodes partial streamed JSON say field', () => {
  assert.equal(saySoFar('{"say":"Hello wor'), 'Hello wor');           // mid-stream
  assert.equal(saySoFar('{"say":"Hi there","run":[]}'), 'Hi there');  // closed
  assert.equal(saySoFar('{"say":"a\\nb\\"c'), 'a\nb"c');              // escapes
  assert.equal(saySoFar('{"run":[]}'), null);                         // not started
});

test('fsTool: read-only filesystem inspection', () => {
  const ls = fsTool(parse(['ls', '.']));
  assert.match(ls, /package\.json/);
  assert.match(ls, /src\//);
  const read = fsTool(parse(['read', 'package.json']));
  assert.match(read, /"name": "afax"/);
  const find = fsTool(parse(['find', 'openai', '--in', 'src']));
  assert.match(find, /openai\.js/);
  assert.match(fsTool(parse(['read', 'nope.xyz'])), /no such path/);
  assert.match(fsTool(parse(['warp'])), /unknown fs tool/);
});

test('catalog: smart-paste detects the right service', () => {
  assert.equal(detect('re_abcd1234efgh5678ij').key, 'email');
  assert.equal(detect('123456789:ABCdefGHIjklMNOpqrstUVWXyz1234567890').key, 'telegram');
  assert.equal(detect('sk-ant-abcdefghij1234567890').key, 'anthropic'); // not openai
  assert.equal(detect('sk-proj-abcdefghij1234567890').key, 'openai');
  assert.equal(detect('sk_live_abcdefghij1234567890').key, 'stripe');
  assert.equal(detect('https://hooks.slack.com/services/T/B/x').key, 'slack');
  assert.equal(detect('nope'), null);
});

test('ssrf: blocks loopback/private/metadata, non-http schemes', async () => {
  for (const u of ['http://127.0.0.1', 'http://10.0.0.5', 'http://169.254.169.254/latest', 'http://localhost', 'file:///etc/passwd', 'http://[::1]']) {
    await assert.rejects(assertSafeUrl(u), undefined, `should block ${u}`);
  }
});

test('pricing: cost by model prefix, fallback for unknown', () => {
  assert.equal(priceOf('gpt-5').estimated, false);
  assert.equal(priceOf('some-weird-model').estimated, true);
  // gpt-5: 1M in @ $1.25 + 1M out @ $10 = $11.25
  assert.ok(Math.abs(costOf('gpt-5', { input: 1e6, output: 1e6 }) - 11.25) < 1e-9);
  assert.equal(costOf('llama3.1', { input: 1e6, output: 1e6 }), 0);
});

test('usage: ledger records, month totals, budget state', () => {
  record({ provider: 'openai', model: 'gpt-4o-mini', usage: { input: 1e6, output: 1e6 } }); // $0.75
  const m = monthTotals();
  assert.equal(m.calls, 1);
  assert.ok(Math.abs(m.cost - 0.75) < 1e-9);
  const cfg = { budget: { monthly: 0.5 } };
  assert.equal(budgetState(cfg).over, true); // 0.75 >= 0.50
  assert.equal(budgetState({ budget: { monthly: 0 } }).over, false); // unlimited
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

test('events: trigger matching + placeholder fill', async () => {
  const { matches, fill } = await import('../src/events.js');
  assert.ok(matches('lead.new', 'new lead'));
  assert.ok(matches('lead.new', 'When a NEW LEAD arrives'));
  assert.ok(matches('deal.won', 'deal won'));
  assert.ok(matches('message.received', 'inbound'));
  assert.ok(matches('payment.received', 'invoice paid'));
  assert.ok(!matches('lead.new', 'deal won'));
  assert.equal(fill('crm note {{email}} "{{name}} replied"', { email: 'a@b.c', name: 'Jane' }), 'crm note a@b.c "Jane replied"');
  assert.equal(fill('x {{missing}} y', {}), 'x  y');
});

test('csv: parse quoted fields and map LinkedIn-style headers', async () => {
  const { parseCSV, csvToLeads } = await import('../src/csv.js');
  const rows = parseCSV('a,"b,c",d\n"e ""q""",f,g\n');
  assert.deepEqual(rows, [['a', 'b,c', 'd'], ['e "q"', 'f', 'g']]);
  const leads = csvToLeads(
    'First Name,Last Name,Email Address,Company,Position\nJane,Doe,jane@acme.com,Acme,CEO\n,,no-name@x.io,X,\n'
  );
  assert.equal(leads.length, 2);
  assert.equal(leads[0].name, 'Jane Doe');
  assert.equal(leads[0].email, 'jane@acme.com');
  assert.equal(leads[0].company, 'Acme');
  assert.equal(leads[1].name, 'no-name');
});

test('stripe: webhook signature verification', async () => {
  const { verifyStripe } = await import('../src/server.js');
  const { createHmac } = await import('node:crypto');
  const payload = '{"type":"checkout.session.completed"}';
  const secret = 'whsec_test';
  const t = '1700000000';
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  assert.ok(verifyStripe(payload, `t=${t},v1=${v1}`, secret));
  assert.ok(!verifyStripe(payload, `t=${t},v1=${'0'.repeat(64)}`, secret));
  assert.ok(!verifyStripe(payload, undefined, secret));
});

// --- 0.6.0 honesty invariants -------------------------------------------------

test('sanitizeEmail strips "(unverified)" and junk', async () => {
  const { sanitizeEmail } = await import('../src/integrations/email.js');
  assert.equal(sanitizeEmail('a@b.com (unverified)'), 'a@b.com');
  assert.equal(sanitizeEmail('  a@b.com  '), 'a@b.com');
  assert.equal(sanitizeEmail('a@b.com (verified)'), 'a@b.com');
  assert.equal(sanitizeEmail(''), '');
});

test('guarded: never reports a send it did not make (no-live = pending, not ok)', async () => {
  const { dm } = await import('../src/integrations/registry.js');
  const r = await dm({ platform: 'email', to: 'x@y.com', subject: 'hi', text: 'yo', live: false });
  assert.equal(r.ok, false);
  assert.equal(r.sent, false);
  assert.equal(r.pending, true);
  // The dishonest dry-run flag must be gone.
  assert.equal('dryRun' in r, false);
});

test('approvals: pending surfaces drafted-but-unsent messages', async () => {
  const { add } = await import('../src/store.js');
  const { pending } = await import('../src/approvals.js');
  add('messages', { channel: 'email', to: 'p@q.com', subject: 'S', body: 'B', pending: true, sent: false });
  add('messages', { channel: 'email', to: 'done@q.com', subject: 'X', body: 'Y', pending: false, sent: true });
  const ids = pending().map((p) => p.to);
  assert.ok(ids.includes('p@q.com'));
  assert.ok(!ids.includes('done@q.com'));
});

test('workModel: cheaper model for agent work', async () => {
  const { workModel } = await import('../src/config.js');
  const m = workModel();
  assert.ok(typeof m === 'string' && m.length > 0);
});

// --- outreach template-merge (scale) -----------------------------------------

test('outreach: merge vars + spintax render locally (no LLM per email)', async () => {
  const { _internals } = await import('../src/agents/outreach.js');
  const { mergeVars, spintax, renderForLead, whereFilter } = _internals;
  // merge
  assert.equal(mergeVars('Hi {{first_name}} at {{company}}', { name: 'Jane Doe', company: 'Acme' }), 'Hi Jane at Acme');
  // unknown token → empty
  assert.equal(mergeVars('x{{nope}}y', { name: 'A' }), 'xy');
  // spintax resolves and is stable per seed
  const a = spintax('{Hi|Hey|Hello} there', 'seed1');
  assert.ok(['Hi there', 'Hey there', 'Hello there'].includes(a));
  assert.equal(spintax('{Hi|Hey} x', 'seed1'), spintax('{Hi|Hey} x', 'seed1'));
  // full render leaves no literal tokens
  const out = renderForLead('{Oi|Olá} {{first_name}}, {{company}}', { id: 'L1', name: 'Bob Silva', company: 'BobCo' });
  assert.ok(!/\{\{|\|/.test(out));
  assert.ok(out.includes('Bob') && out.includes('BobCo'));
  // segment filter
  const f = whereFilter('signal~pos,title=ceo');
  assert.ok(f({ signal: 'seeking POS integrations', title: 'CEO' }));
  assert.ok(!f({ signal: 'nope', title: 'CEO' }));
});

test('deliverability: suppress + footer compliance', async () => {
  const { suppress, isSuppressed, withFooter } = await import('../src/deliverability.js');
  useWorkspace('deliver-co');
  assert.equal(isSuppressed('a@b.com'), false);
  assert.equal(suppress(['A@b.com', 'a@b.com'], 'unsubscribe'), 1); // dedup + normalize
  assert.equal(isSuppressed('a@b.com'), true);
  assert.equal(suppress('a@b.com'), 0); // already there
  const body = withFooter('Hi there', 'x@y.com');
  assert.match(body, /STOP|unsubscribe/i);
  // doesn't double-append if one already present
  assert.equal(withFooter(body, 'x@y.com'), body);
});
