// 🚀 Marketing — multichannel acquisition, campaigns, distribution.
import { Agent } from './base.js';
import { read, write, add, update, remove } from '../store.js';
import { load } from '../config.js';
import { c, header, table, ok, info, warn, spin, step, log } from '../logger.js';

const DAILY = 86400000, WEEKLY = 604800000;

export const marketing = new Agent({
  key: 'marketing',
  name: 'Marketing',
  emoji: '🚀',
  role: 'Acquisition channels & campaigns',
  system:
    'You are AFAX Marketing, a growth strategist. You design channel-specific campaigns that move the ICP from attention to conversion. ' +
    'You are concrete: hooks, angles, cadence, CTA, and a measurable goal. You optimize for ROI and compounding loops.',
});

// The channels AFAX actually RUNS. Enabling one schedules a real, recurring
// action (it produces approvable work — never an autonomous send). Each entry's
// `job(cfg)` returns the cadence + the exact command the scheduler will run.
const CHANNELS = [
  ['content', 'Content Marketing', 'Gera artigos de alto valor periodicamente', (cfg) => ({ when: 'weekly', every: WEEKLY, command: `content blog --topic "${cfg.business.offer || cfg.business.name || 'our product'}: guia prático"` })],
  ['seo', 'SEO', 'Conteúdo otimizado pra busca, recorrente', (cfg) => ({ when: 'weekly', every: WEEKLY, command: `content blog --topic "como ${cfg.business.icp || 'clientes'} resolvem o problema que ${cfg.business.name || 'nós'} ataca"` })],
  ['email', 'Email Marketing', 'Nurture/newsletter pros contatos', (cfg) => ({ when: 'weekly', every: WEEKLY, command: `content email --topic "novidade pra ${cfg.business.icp || 'nossos clientes'}"` })],
  ['outreach', 'Direct Outreach', 'Lote diário de cold email (pra aprovar)', () => ({ when: 'daily', every: DAILY, command: 'outreach --channel email --limit 10' })],
  ['partnerships', 'Partnerships', 'Outreach semanal pra parceiros (pra aprovar)', () => ({ when: 'weekly', every: WEEKLY, command: 'outreach --channel email --limit 5' })],
  ['pr', 'PR / Earned Media', 'Estudo/dado pauta semanal pra imprensa', (cfg) => ({ when: 'weekly', every: WEEKLY, command: `content blog --topic "dados do setor de ${cfg.business.icp || 'nosso mercado'}"` })],
  ['build-in-public', 'Build in Public', 'Post social recorrente de bastidores', (cfg) => ({ when: 'weekly', every: WEEKLY, command: `marketing publish --platform x --topic "build in public: ${cfg.business.name || 'nosso produto'}"` })],
  ['ppc', 'Ads / PPC', 'Rascunha campanha Meta paga (pra revisar)', (cfg) => ({ when: 'weekly', every: WEEKLY, command: `marketing ads --goal "${cfg.business.offer || 'gerar leads'}" --budget 10` })],
];

function channelDef(key) { return CHANNELS.find((ch) => ch[0] === key); }

function channelState() {
  const saved = read('channels', []);
  const byKey = Object.fromEntries(saved.map((s) => [s.key, s]));
  return CHANNELS.map(([key, name, desc, job]) => ({
    key, name, desc,
    cadence: job(load()).when,
    status: byKey[key]?.status || 'idle',
  }));
}

// afax marketing <sub> ...
export async function cmd(args) {
  const sub = args._[0];
  if (sub === 'channel') return channelCmd(args);
  if (sub === 'campaign') return campaignCmd(args);
  if (sub === 'campaigns') return listCampaigns();
  if (sub === 'publish' || sub === 'post') return publishCmd(args);
  if (sub === 'ads') return adsCmd(args);
  warn('Usage: afax marketing channel list | campaign --channel <key> --goal "..." | publish --platform facebook --message "..." [--live] | ads --goal "..." --budget 20 [--live]');
}

function channelCmd(args) {
  const action = args._[1];
  if (!action || action === 'list') {
    header(`${marketing.emoji} Marketing`, 'Canais de aquisição que o AFAX roda');
    table(
      ['Channel', 'Key', 'Status', 'Cadência', 'O que faz'],
      channelState().map((ch) => [
        ch.name,
        c.dim(ch.key),
        ch.status === 'active' ? c.green('● ativo') : c.dim('○ parado'),
        ch.cadence,
        ch.desc,
      ])
    );
    log('');
    info(`Ativar (agenda ação real): ${c.cyan('afax marketing channel seo enable')}`);
    return;
  }
  const key = action;
  const verb = args._[2]; // enable | disable
  const known = channelDef(key);
  if (!known) return warn(`Canal "${key}" desconhecido. Veja: afax marketing channel list`);
  const enabling = verb !== 'disable';

  // The status toggle is just bookkeeping; the real work is the scheduled job.
  const saved = read('channels', []).filter((s) => s.key !== key);
  saved.push({ key, status: enabling ? 'active' : 'idle', updatedAt: new Date().toISOString() });
  write('channels', saved);

  // Remove any existing job for this channel, then (re)create it if enabling.
  for (const s of read('schedule', []).filter((x) => x.channel === key)) remove('schedule', s.id);
  if (enabling) {
    const j = known[3](load());
    add('schedule', { channel: key, when: j.when, every: j.every, command: j.command, nextRun: Date.now(), runs: 0 });
    ok(`Canal ${c.bold(known[1])} ${c.green('ativo')} — agendado (${j.when}): ${c.dim(j.command)}`);
    info(`Roda no heartbeat do ${c.cyan('afax cloud')} (ou ${c.cyan('afax schedule run')}). Resultados caem em ${c.cyan('afax approvals')}.`);
  } else {
    ok(`Canal ${c.bold(known[1])} ${c.dim('parado')} — agendamento removido.`);
  }
}

async function campaignCmd(args) {
  const channel = args.channel || 'email';
  const goal = args.goal || args.topic || 'drive qualified signups';
  const known = CHANNELS.find((ch) => ch[0] === channel);
  header(`${marketing.emoji} Marketing`, `Campaign · ${known?.[1] || channel}`);

  if (!marketing.online) return warn('Campanha precisa de um LLM pra planejar. Rode ' + c.cyan('afax init') + '.');
  const plan = await spin('Designing campaign', () =>
    marketing.structured(
      `Design a ${known?.[1] || channel} campaign. Goal: "${goal}".\n` +
        `Return JSON: {"name","hook","angle","audience","cadence","assets":["..."],"cta","kpi","steps":["..."]}`,
      { maxTokens: 1600 }
    )
  );

  const rec = add('campaigns', { channel, goal, ...plan, status: 'draft' });
  marketing.note(`Drafted campaign "${plan.name}" on ${channel} (goal: ${goal}).`);

  step(plan.name || 'Campaign');
  if (plan.hook) log('  ' + c.bold('Hook:   ') + plan.hook);
  if (plan.angle) log('  ' + c.bold('Angle:  ') + plan.angle);
  if (plan.audience) log('  ' + c.bold('Who:    ') + plan.audience);
  if (plan.cadence) log('  ' + c.bold('Cadence:') + ' ' + plan.cadence);
  if (plan.cta) log('  ' + c.bold('CTA:    ') + plan.cta);
  if (plan.kpi) log('  ' + c.bold('KPI:    ') + plan.kpi);
  if (plan.steps?.length) {
    log('');
    plan.steps.forEach((s, i) => log(`  ${c.orange(i + 1 + '.')} ${s}`));
  }
  log('');
  ok(`Saved campaign ${c.dim(rec.id)}. List all: ${c.cyan('afax marketing campaigns')}`);
}

// afax marketing publish --platform facebook|instagram|telegram|slack|discord --message "..." [--image url] [--live]
// Omit --message to have the agent write the post for you.
async function publishCmd(args) {
  const platform = args.platform || 'telegram';
  let message = args.message;
  const live = !!args.live;
  header(`${marketing.emoji} Marketing`, `Publish · ${platform} · ${live ? 'LIVE' : 'dry-run'}`);

  if (!message) {
    if (!marketing.online) return warn('Provide --message, or run afax init so the agent can write it.');
    const topic = args.topic || args.goal || 'our latest update';
    message = await spin('Writing post', () =>
      marketing.generate(`Write a platform-native ${platform} post about: "${topic}". Hook-first, no hashtags spam. Ready to publish.`, { temperature: 0.8, maxTokens: 400 })
    );
  }

  // Instagram needs a public image URL — auto-host local files via `afax serve`.
  let imageUrl = args.image;
  if (imageUrl && !/^https?:\/\//.test(imageUrl)) {
    const { media } = await import('../integrations/registry.js');
    const hosted = media.hostedUrl(imageUrl);
    if (hosted) {
      imageUrl = hosted;
      info(`Hosting local image → ${hosted}`);
    } else if (platform === 'instagram') {
      return warn('Local image but no public URL. Set integrations.server.publicUrl and run afax serve (docs: server).');
    }
  }

  const { publish } = await import('../integrations/registry.js');
  const res = await publish({ platform, message, imageUrl, link: args.link, live });

  add('posts', { platform, message, pending: !!res.pending, sent: res.sent === true, delivered: res.sent === true, error: res.error || '' });
  marketing.note(`Publish ${platform} (sent=${res.sent === true}).`);

  log('');
  log(message.split('\n').map((l) => '  ' + l).join('\n'));
  log('');
  if (res.pending) {
    info(`Preparado — ${c.bold('nada foi publicado')}. Pra publicar: ${c.cyan('afax config set live true')} e ${c.cyan('--live')}.`);
  } else if (res.sent) {
    ok(`Published to ${platform}.`);
  } else {
    warn(`Publish failed: ${res.error}`);
  }
}

// afax marketing ads --goal "..." [--budget 20] [--live]
// AI designs the campaign; live mode creates it PAUSED in Meta Ads.
async function adsCmd(args) {
  if (args._[1] === 'insights') return adsInsightsCmd(args);
  const goal = args.goal || args.topic || 'drive qualified signups';
  const budget = Number(args.budget || 10);
  const live = !!args.live;
  const { isLive } = await import('../config.js');
  const cfg = load();
  header(`${marketing.emoji} Marketing`, `Paid ads · $${budget}/day · ${live && isLive() ? 'LIVE' : 'dry-run'}`);

  let plan = { name: `Ads: ${goal}`.slice(0, 60), objective: 'OUTCOME_TRAFFIC', audience: '', headline: '', primaryText: '', countries: ['US'], ageMin: 18, ageMax: 65, link: cfg.business.website || '' };
  if (marketing.online) {
    plan = await spin('Designing ad campaign + creative + audience', () =>
      marketing.structured(
        `Design a complete Meta paid-ads unit. Goal: "${goal}". Daily budget: $${budget}. Business: ${cfg.business.name || '—'} (ICP: ${cfg.business.icp || '—'}).\n` +
          `Return JSON: {"name","objective":"OUTCOME_TRAFFIC|OUTCOME_LEADS|OUTCOME_SALES|OUTCOME_AWARENESS",` +
          `"headline":"<under 40 chars>","primaryText":"<ad body, 1-2 sentences>","audience":"<one-line description>",` +
          `"countries":["ISO codes e.g. BR or US"],"ageMin":<int>,"ageMax":<int>}`,
        { maxTokens: 800 }
      )
    );
    plan.link ||= cfg.business.website || '';
  }
  step(plan.name || 'Campaign');
  if (plan.audience) log('  ' + c.bold('Audience: ') + plan.audience + c.dim(`  (${(plan.countries || ['US']).join(',')}, ${plan.ageMin || 18}-${plan.ageMax || 65})`));
  if (plan.headline) log('  ' + c.bold('Headline: ') + plan.headline);
  if (plan.primaryText) log('  ' + c.bold('Text:     ') + plan.primaryText);
  log('  ' + c.bold('Objective:') + ' ' + (plan.objective || 'OUTCOME_TRAFFIC') + '   ' + c.bold('Budget:') + ` $${budget}/day`);
  log('');

  if (!(live && isLive())) {
    const rec = add('campaigns', { channel: 'ppc', goal, ...plan, budget, status: 'draft' });
    info(`Preparado — ${c.bold('nada criado')}. Criar de verdade (PAUSED): ${c.cyan('afax config set live true')} + ${c.cyan('--live')}.`);
    return;
  }
  const { meta } = await import('../integrations/registry.js');
  const rec = add('campaigns', { channel: 'ppc', goal, ...plan, budget, status: 'creating' });
  try {
    const ids = await spin('Campaign + ad set (targeting)', () =>
      meta.adsCreateCampaign({ name: plan.name, objective: plan.objective, dailyBudget: budget, countries: plan.countries || ['US'], ageMin: plan.ageMin || 18, ageMax: plan.ageMax || 65 }));
    const cr = await spin('Ad creative (copy + link)', () =>
      meta.adsCreateCreative({ name: plan.name, message: plan.primaryText, headline: plan.headline, link: plan.link }));
    const ad = await spin('Ad (paused)', () => meta.adsCreateAd({ name: plan.name, adsetId: ids.adsetId, creativeId: cr.creativeId }));
    update('campaigns', rec.id, { status: 'paused', metaCampaignId: ids.campaignId, metaAdsetId: ids.adsetId, metaCreativeId: cr.creativeId, metaAdId: ad.adId });
    marketing.note(`Created Meta ad unit "${plan.name}" ($${budget}/day, paused).`);
    ok(`PAUSED ad ready (campaign ${ids.campaignId}) — creative + targeting attached. Review/activate in Ads Manager. Results later: ${c.cyan('afax marketing ads insights ' + ids.campaignId)}.`);
  } catch (e) {
    update('campaigns', rec.id, { status: 'failed', error: e.message });
    warn(`Ads creation failed: ${e.message}`);
  }
}

// Read live performance for a campaign/adset/ad id.
async function adsInsightsCmd(args) {
  const id = args._[2] || args.id;
  if (!id) return warn('Usage: afax marketing ads insights <campaign|adset|ad id>');
  const { meta } = await import('../integrations/registry.js');
  header(`${marketing.emoji} Marketing`, `Ad insights · ${id}`);
  try {
    const r = await spin('Reading Meta insights', () => meta.adsInsights({ id, datePreset: args.preset || 'last_7d' }));
    if (!r || !Object.keys(r).length) return info('Sem dados ainda (campanha pausada/nova não gera insights).');
    table(['Metric', 'Value'], [
      ['Impressions', r.impressions || '0'], ['Clicks', r.clicks || '0'], ['CTR', (r.ctr || '0') + '%'],
      ['Spend', '$' + (r.spend || '0')], ['CPC', '$' + (r.cpc || '0')], ['Reach', r.reach || '0'],
    ]);
  } catch (e) { warn(`Insights failed: ${e.message}`); }
}

function listCampaigns() {
  header(`${marketing.emoji} Marketing`, 'Campaigns');
  const rows = read('campaigns', []).map((x) => [x.id, x.channel, x.name || '—', x.status]);
  table(['ID', 'Channel', 'Name', 'Status'], rows);
}
