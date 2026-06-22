// 📨 Outreach — scalable cold outreach. Writes ONE template (a single LLM call,
// or zero if you pass --template), then mail-merges it locally for every lead:
// {{merge_vars}} + {spintax|variation}. N emails cost ~1 LLM call, not N — the
// way Instantly/Smartlead/lemlist do it. Optional --personalize adds a batched
// AI icebreaker (one call for the whole batch). Drafts are held for approval.
import { Agent } from './base.js';
import { read, write, addMany } from '../store.js';
import { isLive } from '../config.js';
import { suppressedSet, isSuppressed, remainingToday, withFooter } from '../deliverability.js';
import * as registry from '../integrations/registry.js';
import { c, header, table, ok, info, warn, spin, log, dim } from '../logger.js';

const agent = new Agent({
  key: 'outreach',
  name: 'Outreach',
  emoji: '📨',
  role: 'Personalized cold outreach',
  system:
    'You are AFAX Outreach, a world-class SDR. You write short, specific, human cold messages that earn a reply. ' +
    'No spam, no fake flattery, no "I hope this finds you well". Lead with a concrete, relevant observation about the ' +
    'prospect, connect it to one clear value, and end with a low-friction ask.',
});

// afax outreach --channel email [--limit 25] [--status new] [--where "field~val,.."]
//   [--template "..." --subject "..."]   provide your own template (0 LLM calls)
//   [--personalize]                      add a batched AI icebreaker (1 extra call)
//   [--live]                             actually send (else drafted for approval)
export async function cmd(args, { signal } = {}) {
  const channel = args.channel || 'email';
  const limit = Math.min(parseInt(args.limit || '25', 10) || 25, 1000);
  const live = !!args.live;
  const personalize = !!args.personalize;

  const supp = suppressedSet();
  let leads = read('leads', []).filter((l) => (args.status ? l.status === args.status : l.status !== 'contacted'));
  if (args.where) leads = leads.filter(whereFilter(args.where));
  // Deliverability: never contact opted-out / bounced addresses.
  const beforeSupp = leads.length;
  if (channel === 'email') leads = leads.filter((l) => !isSuppressed(l.email, supp));
  const suppressed = beforeSupp - leads.length;
  // Respect the per-day send cap (email only).
  const cap = channel === 'email' ? remainingToday() : Infinity;
  const room = Math.min(limit, cap);
  const capped = leads.length > room;
  leads = leads.slice(0, room);

  header(`${agent.emoji} Outreach`, `${channel} · ${leads.length} lead(s) · ${live ? (isLive() ? c.green('LIVE') : c.yellow('--live mas config.live=false → não envia')) : c.dim('preparação (não envia)')}`);
  if (suppressed) dim(`  ${suppressed} pulado(s) (opt-out/bounce)`);
  if (capped) dim(`  limitado pelo cap diário (restam ${cap} hoje)`);
  if (!leads.length) return info(cap === 0 ? 'Cap diário de envio atingido.' : 'No leads to contact. Run: afax prospect source <domain>  or  afax prospect import leads.csv');

  // 1) Get ONE template — provided verbatim, or generated in a single LLM call.
  let tpl, llmCalls = 0;
  if (args.template) {
    tpl = { subject: String(args.subject || ''), body: String(args.template) };
  } else if (agent.online) {
    tpl = await spin('Escrevendo 1 template pro segmento', () => makeTemplate(agent, channel, leads));
    llmCalls++;
  } else {
    return warn('Sem LLM: passe um template com ' + c.cyan('--template "Oi {{first_name}}, ..." --subject "..."') + ' ou rode ' + c.cyan('afax init') + '.');
  }

  // Optional A/B: a second template alternated per lead over the SAME audience,
  // tagged variant A/B so metrics can pick the winner.
  const tplB = args['template-b'] ? { subject: String(args['subject-b'] || tpl.subject), body: String(args['template-b']) } : null;

  // 2) Optional: one batched call to write a per-lead icebreaker line.
  let lines = [];
  if (personalize && agent.online) {
    lines = await spin(`Personalizando ${leads.length} icebreakers (1 chamada)`, () => icebreakers(agent, leads));
    llmCalls++;
  }

  // 3) Render locally + queue per lead. NO per-lead LLM call. Records are
  // accumulated and written ONCE (O(n)) — not one file rewrite per lead.
  const results = [];
  const newMessages = [], notes = [], contacted = new Set();
  let prepared = 0, sentN = 0;
  for (let i = 0; i < leads.length; i++) {
    if (signal?.aborted) { warn('Interrompido pelo usuário.'); break; }
    const lead = leads[i];
    const extra = { icebreaker: lines[i] || '' };
    const useB = tplB && i % 2 === 1;
    const t = useB ? tplB : tpl;
    const variant = tplB ? (useB ? 'B' : 'A') : (args.variant ? String(args.variant) : undefined);
    const subject = renderForLead(t.subject, lead, extra);
    const target = channel === 'email' ? lead.email : lead.phone || lead.email;
    let body = renderForLead(t.body, lead, extra);
    if (channel === 'email') body = withFooter(body, target);   // compliant unsubscribe

    const sent = await registry.dm({ platform: channel, to: target, subject, text: body, live });
    newMessages.push({
      leadId: lead.id, channel, to: target, subject: subject || '', body,
      ...(args.campaign ? { campaignId: String(args.campaign) } : {}),
      ...(variant ? { variant } : {}),
      pending: !!sent.pending, sent: sent.sent === true, delivered: sent.sent === true,
      receipt: sent.sent === true ? (sent.result?.id || 'ok') : undefined, error: sent.error || '',
    });
    if (sent.sent === true) {
      sentN++;
      contacted.add(lead.id);
      notes.push({ email: lead.email, text: `Outreach via ${channel}: ${subject || body.slice(0, 60)}` });
    } else if (sent.pending) prepared++;
    if (results.length < 8) results.push([lead.name, lead.company, (subject || '(dm)').slice(0, 28), verdict(sent)]);
  }
  // Flush everything in one write per collection.
  if (newMessages.length) addMany('messages', newMessages);
  if (notes.length) addMany('crm_notes', notes);
  if (contacted.size) {
    const all = read('leads', []); let changed = false;
    for (const l of all) if (contacted.has(l.id) && l.status !== 'contacted') { l.status = 'contacted'; changed = true; }
    if (changed) write('leads', all);
  }

  agent.note(`Outreach: ${channel}, ${leads.length} leads, ${llmCalls} LLM call(s), live=${live && isLive()}.`);
  log('');
  table(['Lead', 'Company', 'Subject', 'Status'], results);
  if (leads.length > results.length) dim(`  … +${leads.length - results.length} mais`);
  log('');
  info(`${c.bold(String(leads.length))} emails montados com ${c.bold(llmCalls + ' chamada(s) LLM')} (template + merge local, não 1 por email).`);
  if (!(live && isLive())) {
    info(`${prepared} preparado(s) — ${c.bold('nada enviado')}. Enviar: ${c.cyan('afax approve --all')} ou ${c.cyan('afax config set live true')} + ${c.cyan('--live')}.`);
    dim('  Ver os rascunhos: afax outreach preview');
  } else {
    ok(`${sentN} enviado(s).`);
  }
}

// Show the most recent drafted messages in full.
export function preview() {
  header(`${agent.emoji} Outreach`, 'Recent drafts');
  const msgs = read('messages', []).slice(-3);
  if (!msgs.length) return info('No drafts yet.');
  for (const m of msgs) {
    log(`  ${c.dim('to:')} ${m.to}  ${c.dim(m.channel)}`);
    if (m.subject) log(`  ${c.bold('Subject:')} ${m.subject}`);
    log(m.body.split('\n').map((l) => '  ' + l).join('\n'));
    log('  ' + c.dim('─'.repeat(40)));
  }
}

// --- one template for the whole segment (single LLM call) -------------------
async function makeTemplate(agent, channel, leads) {
  const sample = leads.slice(0, 5).map((l) => `${l.company || l.name} (${l.signal || '—'})`).join('; ');
  const j = await agent.structured(
    `Write ONE reusable cold ${channel} TEMPLATE for this segment — not a message to a single person.\n` +
      `Use these merge variables as LITERAL tokens (do NOT fill them in): {{first_name}}, {{company}}, {{title}}, {{signal}}.\n` +
      `Add light spintax for natural variation on the greeting and the CTA, using {option one|option two} syntax.\n` +
      `Segment sample: ${sample}.\n` +
      `Return JSON: {"subject":"<${channel === 'email' ? 'subject, {{company}} allowed' : 'empty'}>","body":"<template>"}. ` +
      `${channel === 'email' ? 'Subject under 7 words.' : 'No subject. 2-3 sentences.'} Body under 90 words. ` +
      `Every variable must remain as {{token}} verbatim.`,
    { temperature: 0.6, maxTokens: 500 }
  );
  return { subject: j.subject || '', body: j.body || '' };
}

// --- optional: batched icebreakers, one call for the whole batch ------------
async function icebreakers(agent, leads) {
  const list = leads.map((l, i) => `${i + 1}. ${l.name} @ ${l.company || '?'} — signal: ${l.signal || 'n/a'}`).join('\n');
  const j = await agent.structured(
    `For each prospect below, write ONE short, specific opening line (max 18 words) referencing their company/signal. ` +
      `Return JSON: {"lines":["line for 1","line for 2", ...]} in the SAME order, one per prospect.\n${list}`,
    { temperature: 0.6, maxTokens: Math.min(2000, 60 * leads.length + 200) }
  );
  return Array.isArray(j.lines) ? j.lines : [];
}

// --- local render: merge vars + spintax (zero LLM) --------------------------
function renderForLead(tpl, lead, extra) {
  return spintax(mergeVars(tpl, lead, extra), lead.id || lead.email || '');
}

function mergeVars(str, lead, extra) {
  const map = {
    name: lead.name || '', first_name: firstName(lead.name),
    company: lead.company || 'sua empresa', title: lead.title || '',
    signal: lead.signal || '', icebreaker: (extra && extra.icebreaker) || '',
  };
  return String(str || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (k in map ? map[k] : ''));
}

// {a|b|c} → pick one deterministically per lead (stable, varied across leads).
function spintax(str, seed) {
  let i = 0;
  return String(str || '').replace(/\{([^{}|]+(?:\|[^{}|]+)+)\}/g, (_, body) => {
    const opts = body.split('|');
    return opts[hash(seed + ':' + i++) % opts.length];
  });
}
function hash(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || 'olá'; }

// Tiny segment filter: "field=value,field~substr" (AND of conditions).
function whereFilter(expr) {
  const conds = String(expr).split(',').map((s) => s.trim()).filter(Boolean).map(parseCond);
  return (l) => conds.every((fn) => fn(l));
}
function parseCond(s) {
  let m;
  if ((m = s.match(/^(\w+)~(.+)$/))) return (l) => String(l[m[1]] ?? '').toLowerCase().includes(m[2].toLowerCase());
  if ((m = s.match(/^(\w+)=(.+)$/))) return (l) => String(l[m[1]] ?? '').toLowerCase() === m[2].toLowerCase();
  return () => true;
}

function verdict(sent) {
  if (sent.pending) return c.yellow('pendente (não enviado)');
  if (sent.sent) return c.green('enviado');
  return c.red('falha: ' + (sent.error || '').slice(0, 24));
}

export const outreach = agent;
export const _internals = { spintax, mergeVars, renderForLead, whereFilter };
