// 🚀 Marketing — multichannel acquisition, campaigns, distribution.
import { Agent } from './base.js';
import { read, write, add } from '../store.js';
import { c, header, table, ok, info, warn, spin, step, log } from '../logger.js';

export const marketing = new Agent({
  key: 'marketing',
  name: 'Marketing',
  emoji: '🚀',
  role: 'Acquisition channels & campaigns',
  system:
    'You are AFAX Marketing, a growth strategist. You design channel-specific campaigns that move the ICP from attention to conversion. ' +
    'You are concrete: hooks, angles, cadence, CTA, and a measurable goal. You optimize for ROI and compounding loops.',
});

// The 16 acquisition channels from the AFAX spec.
const CHANNELS = [
  ['seo', 'Search Engine Optimization', 'Organic indexing on Google'],
  ['content', 'Content Marketing', 'High-value articles, video, guides'],
  ['partnerships', 'Partnerships', 'B2B collabs sharing your ICP'],
  ['outreach', 'Direct Outreach', 'Cold email + LinkedIn automation'],
  ['events', 'In-person Events', 'Lead capture at conferences'],
  ['ppc', 'Ads / PPC', 'Paid traffic for fast ROI'],
  ['eng-marketing', 'Engineering as Marketing', 'Free micro-tools for top of funnel'],
  ['marketplaces', 'Integrations & Marketplaces', 'App directories & extension stores'],
  ['virality', 'Built-in Virality', 'Growth loops inside the product'],
  ['affiliates', 'Affiliate Marketing', 'Commission for third-party promoters'],
  ['referral', 'Referral Programs', 'In-app rewards for invites'],
  ['build-in-public', 'Build in Public', 'Transparency to attract early adopters'],
  ['communities', 'Niche Forum Launches', 'Product Hunt, HN, Reddit'],
  ['email', 'Email Marketing', 'Nurture flows & newsletters'],
  ['sponsorships', 'Niche Sponsorships', 'Micro-influencers & technical podcasts'],
  ['pr', 'Unconventional PR', 'Data-driven earned media & backlinks'],
];

function channelState() {
  const saved = read('channels', []);
  const byKey = Object.fromEntries(saved.map((s) => [s.key, s]));
  return CHANNELS.map(([key, name, desc]) => ({
    key,
    name,
    desc,
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
    header(`${marketing.emoji} Marketing`, 'Acquisition channels');
    table(
      ['Channel', 'Key', 'Status', 'What it does'],
      channelState().map((ch) => [
        ch.name,
        c.dim(ch.key),
        ch.status === 'active' ? c.green('● active') : c.dim('○ idle'),
        ch.desc,
      ])
    );
    log('');
    info(`Enable one: ${c.cyan('afax marketing channel seo enable')}`);
    return;
  }
  const key = action;
  const verb = args._[2]; // enable | disable
  const known = CHANNELS.find((ch) => ch[0] === key);
  if (!known) return warn(`Unknown channel "${key}". Run: afax marketing channel list`);
  const status = verb === 'disable' ? 'idle' : 'active';
  const saved = read('channels', []).filter((s) => s.key !== key);
  saved.push({ key, status, updatedAt: new Date().toISOString() });
  write('channels', saved);
  ok(`Channel ${c.bold(known[1])} → ${status === 'active' ? c.green(status) : c.dim(status)}`);
}

async function campaignCmd(args) {
  const channel = args.channel || 'email';
  const goal = args.goal || args.topic || 'drive qualified signups';
  const known = CHANNELS.find((ch) => ch[0] === channel);
  header(`${marketing.emoji} Marketing`, `Campaign · ${known?.[1] || channel}`);

  let plan;
  if (marketing.online) {
    plan = await spin('Designing campaign', () =>
      marketing.structured(
        `Design a ${known?.[1] || channel} campaign. Goal: "${goal}".\n` +
          `Return JSON: {"name","hook","angle","audience","cadence","assets":["..."],"cta","kpi","steps":["..."]}`,
        { maxTokens: 1600 }
      )
    );
  } else {
    info('No LLM — saving campaign stub. Run ' + c.cyan('afax init') + ' for AI plans.');
    plan = { name: `${channel} campaign`, hook: goal, angle: '', cadence: '', cta: '', kpi: '', steps: [] };
  }

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

  add('posts', { platform, message, dryRun: res.dryRun, delivered: res.ok && !res.dryRun, error: res.error || '' });
  marketing.note(`Publish ${platform} (live=${res.ok && !res.dryRun}).`);

  log('');
  log(message.split('\n').map((l) => '  ' + l).join('\n'));
  log('');
  if (res.dryRun) {
    info(`Dry-run. Go live: ${c.cyan('afax config set live true')} then add ${c.cyan('--live')}.`);
  } else if (res.ok) {
    ok(`Published to ${platform}.`);
  } else {
    warn(`Publish failed: ${res.error}`);
  }
}

// afax marketing ads --goal "..." [--budget 20] [--live]
// AI designs the campaign; live mode creates it PAUSED in Meta Ads.
async function adsCmd(args) {
  const goal = args.goal || args.topic || 'drive qualified signups';
  const budget = Number(args.budget || 10);
  const live = !!args.live;
  const { isLive } = await import('../config.js');
  header(`${marketing.emoji} Marketing`, `Paid ads · $${budget}/day · ${live && isLive() ? 'LIVE' : 'dry-run'}`);

  let plan = { name: `Ads: ${goal}`.slice(0, 60), objective: 'OUTCOME_TRAFFIC', audience: '', headline: '', primaryText: '' };
  if (marketing.online) {
    plan = await spin('Designing ad campaign', () =>
      marketing.structured(
        `Design a Meta paid-ads campaign. Goal: "${goal}". Daily budget: $${budget}.\n` +
          `Return JSON: {"name","objective":"OUTCOME_TRAFFIC|OUTCOME_LEADS|OUTCOME_SALES|OUTCOME_AWARENESS","audience","headline","primaryText"}`,
        { maxTokens: 700 }
      )
    );
  }
  step(plan.name || 'Campaign');
  if (plan.audience) log('  ' + c.bold('Audience: ') + plan.audience);
  if (plan.headline) log('  ' + c.bold('Headline: ') + plan.headline);
  if (plan.primaryText) log('  ' + c.bold('Text:     ') + plan.primaryText);
  log('  ' + c.bold('Objective:') + ' ' + (plan.objective || 'OUTCOME_TRAFFIC') + '   ' + c.bold('Budget:') + ` $${budget}/day`);
  log('');

  if (!(live && isLive())) {
    const rec = add('campaigns', { channel: 'ppc', goal, ...plan, budget, status: 'draft' });
    info(`Dry-run — saved as draft ${c.dim(rec.id)}. Create for real: ${c.cyan('afax config set live true')} + ${c.cyan('--live')}.`);
    return;
  }
  const { meta } = await import('../integrations/registry.js');
  const ids = await spin('Creating PAUSED campaign in Meta Ads', () =>
    meta.adsCreateCampaign({ name: plan.name, objective: plan.objective, dailyBudget: budget })
  );
  const rec = add('campaigns', { channel: 'ppc', goal, ...plan, budget, status: 'paused', metaCampaignId: ids.campaignId, metaAdsetId: ids.adsetId });
  marketing.note(`Created Meta ads campaign "${plan.name}" ($${budget}/day, paused).`);
  ok(`PAUSED campaign created (${ids.campaignId}). Add creative & activate in Ads Manager. Saved ${c.dim(rec.id)}.`);
}

function listCampaigns() {
  header(`${marketing.emoji} Marketing`, 'Campaigns');
  const rows = read('campaigns', []).map((x) => [x.id, x.channel, x.name || '—', x.status]);
  table(['ID', 'Channel', 'Name', 'Status'], rows);
}
