// ✍️ Content — autonomous copy, posts, emails, rich assets.
import { Agent } from './base.js';
import { add, read } from '../store.js';
import { load } from '../config.js';
import { c, header, ok, info, warn, spin, log, dim, link, table } from '../logger.js';

export const content = new Agent({
  key: 'content',
  name: 'Content',
  emoji: '✍️',
  role: 'Content generation',
  system:
    'You are AFAX Content, a senior copywriter. You write in the brand voice, lead with a strong hook, ' +
    'and always tie copy to the reader\'s outcome. You match format conventions (blog = structured with headers; ' +
    'email = subject + body; tweet/post = punchy, no fluff).',
});

const FORMATS = {
  blog: 'a structured blog post (title, intro, 3-5 sections with headers, conclusion, ~600 words)',
  email: 'a marketing/outreach email (compelling subject line + body under 150 words + CTA)',
  post: 'a social post / thread (punchy, hook-first, platform-native)',
  social: 'a social post / thread (punchy, hook-first, platform-native)',
  landing: 'landing page copy (headline, subhead, 3 benefit bullets, CTA)',
  ad: 'ad copy variations (3 headlines + 3 primary texts)',
};

// Premium rendered media (HTML → Chromium → PNG/MP4).
const MEDIA = ['carousel', 'meme', 'poster', 'reel', 'motion'];

// afax content <format> --topic "..." [--save out.md]
// afax content image --prompt "..."                 (AI image generation)
// afax content carousel|meme|poster|reel --topic "..." [--spec f.json] [--slug] [--lang] [--accent]
export async function cmd(args) {
  const format = (args._[0] || 'post').toLowerCase();
  if (format === 'image') return image(args);
  if (format === 'repurpose') return repurpose(args);
  if (format === 'plan') return plan(args);
  if (format === 'calendar') return calendar();
  if (MEDIA.includes(format)) return renderMedia(format, args);
  const topic = args.topic || args._.slice(1).join(' ');
  if (format === 'blog') return blog(args, topic);
  const spec = FORMATS[format];
  if (!spec) return warn(`Format must be: ${Object.keys(FORMATS).join(', ')}, image · or: repurpose <id> | plan | calendar`);
  if (!topic) return warn(`Usage: afax content ${format} --topic "your topic"`);

  header(`${content.emoji} Content`, `${format} · ${topic}`);

  if (!content.online) {
    info('No LLM configured. Run ' + c.cyan('afax init') + ' to generate content.');
    return;
  }

  const body = await spin('Writing', () =>
    content.generate(`Write ${spec}.\nTopic: "${topic}".\nReturn the finished piece only — ready to publish.`, {
      temperature: 0.75,
      maxTokens: 2200,
    })
  );

  const rec = add('content', { format, topic, body });
  content.note(`Wrote ${format} on "${topic}".`);
  const { emit } = await import('../events.js');
  await emit('content.created', { format, topic, id: rec.id });

  log('');
  log(body.split('\n').map((l) => '  ' + l).join('\n'));
  log('');

  if (args.save) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(args.save, body);
    ok(`Written to ${args.save}`);
  }
  ok(`Saved ${c.dim(rec.id)}. Library: ${c.cyan('afax content list')}`);
}

// SEO-structured blog: keyword-targeted, with title tag, meta, slug, H2s and
// internal-link suggestions — not just 600 generic words.
async function blog(args, topic) {
  if (!topic) return warn('Usage: afax content blog --topic "your topic" [--keyword "target kw"]');
  const keyword = args.keyword || topic;
  header(`${content.emoji} Content`, `blog (SEO) · ${keyword}`);
  if (!content.online) return info('No LLM configured. Run ' + c.cyan('afax init') + ' to generate content.');
  const j = await spin('Writing SEO post', () =>
    content.structured(
      `Write an SEO-optimized blog post targeting the keyword "${keyword}".\n` +
        `Return JSON: {"title":"<title tag under 60 chars, includes the keyword>","metaDescription":"<=155 chars, compelling>",` +
        `"slug":"<kebab-case-url>","h2":["3-5 section headings"],"body":"<full markdown post ~700 words using those H2s, keyword in the first 100 words, strong intro + clear CTA>",` +
        `"internalLinks":["anchor text → related topic to link", "..."]}`,
      { temperature: 0.7, maxTokens: 2800 }
    )
  );
  const rec = add('content', { format: 'blog', topic, keyword, title: j.title, metaDescription: j.metaDescription, slug: j.slug, body: j.body, internalLinks: j.internalLinks || [] });
  content.note(`Wrote SEO blog "${j.title}" (kw: ${keyword}).`);
  log('');
  log(`  ${c.bold('Title:')} ${j.title}`);
  log(`  ${c.bold('Meta:')}  ${c.dim(j.metaDescription)}`);
  log(`  ${c.bold('Slug:')}  ${c.dim('/' + (j.slug || ''))}`);
  if (j.internalLinks?.length) log(`  ${c.bold('Links:')} ${c.dim(j.internalLinks.slice(0, 4).join(' · '))}`);
  log('');
  log((j.body || '').split('\n').map((l) => '  ' + l).join('\n'));
  log('');
  if (args.save) { const { writeFileSync } = await import('node:fs'); writeFileSync(args.save, j.body || ''); ok(`Written to ${args.save}`); }
  ok(`Saved ${c.dim(rec.id)}. Repurpose it: ${c.cyan('afax content repurpose ' + rec.id)}`);
}

// Repurpose ONE source piece into a multi-channel pack in a SINGLE LLM call —
// the cost-doctrine: author once, fan out deterministically.
async function repurpose(args) {
  const id = args._[1] || args.id;
  if (!id) return warn('Usage: afax content repurpose <content-id>');
  const items = read('content', []);
  const src = items.find((x) => x.id === id || x.id.startsWith(String(id).toUpperCase()));
  if (!src) return warn(`No content "${id}". List: afax content list`);
  if (!content.online) return warn('Repurpose needs an LLM. Run ' + c.cyan('afax init') + '.');
  header(`${content.emoji} Content`, `repurpose · ${src.title || src.topic}`);
  const j = await spin('Deriving a multi-channel pack (1 call)', () =>
    content.structured(
      `Repurpose this ${src.format} into a multi-channel content pack. Keep the brand voice.\n` +
        `SOURCE: "${src.title || src.topic}"\n${(src.body || '').slice(0, 3000)}\n\n` +
        `Return JSON: {"posts":["3-5 platform-native social posts, hook-first, no hashtag spam"],` +
        `"email":{"subject":"<6 words>","body":"<under 150 words + CTA>"},` +
        `"thread":["3-6 tweet-length lines"],` +
        `"carousel":{"slides":[{"title":"hook","body":"1-2 lines"}],"caption":"post caption"}}`,
      { maxTokens: 2200 }
    )
  );
  const made = [];
  for (const p of j.posts || []) made.push(add('content', { format: 'post', topic: src.topic, body: p, sourceId: src.id }));
  if (j.email?.body) made.push(add('content', { format: 'email', topic: src.topic, subject: j.email.subject, body: j.email.body, sourceId: src.id }));
  if (j.thread?.length) made.push(add('content', { format: 'post', topic: src.topic, body: j.thread.join('\n\n'), sourceId: src.id }));
  if (j.carousel?.slides?.length) made.push(add('content', { format: 'carousel', topic: src.topic, spec: j.carousel, sourceId: src.id }));
  content.note(`Repurposed ${src.id} → ${made.length} assets.`);
  ok(`${made.length} assets derived from ${c.dim(src.id)} in 1 LLM call. Render a carousel: ${c.cyan('afax content carousel --spec ...')} · see all: ${c.cyan('afax content list')}`);
}

// Content calendar: one LLM call drafts a dated plan, stored as `planned` items
// AND scheduled for real generation via the scheduler — the autopilot calendar.
async function plan(args) {
  const weeks = Math.min(parseInt(args.weeks || '4', 10) || 4, 12);
  const perWeek = Math.min(parseInt(args['per-week'] || args.perWeek || '3', 10) || 3, 7);
  const cfg = load();
  header(`${content.emoji} Content`, `calendar · ${weeks} weeks × ${perWeek}/week`);
  if (!content.online) return warn('Planning needs an LLM. Run ' + c.cyan('afax init') + '.');
  const j = await spin('Drafting the calendar (1 call)', () =>
    content.structured(
      `Build a ${weeks}-week content calendar, ${perWeek} pieces per week, for ${cfg.business.name || 'this company'} ` +
        `(offer: ${cfg.business.offer || '—'}, ICP: ${cfg.business.icp || '—'}). Mix formats across blog, post, email, carousel; ` +
        `each ties to a real buyer question. Return JSON: {"items":[{"week":1,"format":"blog|post|email|carousel","topic":"...","keyword":"...","hook":"..."}]}`,
      { maxTokens: 2200 }
    )
  );
  const now = Date.now();
  const WEEK = 7 * 86400000;
  const saved = [];
  const sched = [];
  for (const it of j.items || []) {
    const when = new Date(now + (Math.max(1, it.week || 1) - 1) * WEEK + (saved.length % perWeek) * 2 * 86400000).toISOString();
    saved.push(add('content', { format: it.format || 'post', topic: it.topic, keyword: it.keyword || '', hook: it.hook || '', status: 'planned', scheduledFor: when }));
    // Schedule real generation at that date (one-shot job).
    const cmd = it.format === 'blog' ? `content blog --topic "${(it.topic || '').replace(/"/g, '')}" --keyword "${(it.keyword || it.topic || '').replace(/"/g, '')}"`
      : `content ${it.format || 'post'} --topic "${(it.topic || '').replace(/"/g, '')}"`;
    sched.push({ command: cmd, when: when.slice(0, 10), nextRun: now + (Math.max(1, it.week || 1) - 1) * WEEK, runs: 0, source: 'content-calendar' });
  }
  for (const s of sched) add('schedule', s);
  content.note(`Planned ${saved.length} pieces over ${weeks} weeks.`);
  ok(`${saved.length} pieces on the calendar + scheduled. View: ${c.cyan('afax content calendar')} · runs on ${c.cyan('afax cloud')} heartbeat.`);
}

function calendar() {
  header(`${content.emoji} Content`, 'Calendar');
  const items = read('content', []).filter((x) => x.status === 'planned' || x.scheduledFor).sort((a, b) => String(a.scheduledFor).localeCompare(String(b.scheduledFor)));
  if (!items.length) return info('Nothing planned. Build one: afax content plan --weeks 4 --per-week 3');
  table(['Date', 'Format', 'Topic', 'Keyword'], items.map((x) => [(x.scheduledFor || '').slice(0, 10), x.format, (x.topic || '').slice(0, 40), (x.keyword || '').slice(0, 22)]));
}

// Real media asset generation via the configured images provider.
async function image(args) {
  const prompt = args.prompt || args.topic || args._.slice(1).join(' ');
  if (!prompt) return warn('Usage: afax content image --prompt "brand hero, orange on black, minimal"');
  header(`${content.emoji} Content`, `image · ${prompt.slice(0, 48)}`);
  const { media } = await import('../integrations/registry.js');
  if (!media.status().connected)
    return warn('Media not connected. Set a key: afax connect media  (or integrations.media.apiKey).');
  const out = await spin('Generating image', () =>
    media.generateImage({ prompt, size: args.size || '1024x1024' })
  );
  add('content', { format: 'image', topic: prompt, path: out.path });
  content.note(`Generated image for "${prompt.slice(0, 40)}".`);
  ok(`Saved → ${link(c.cyan(out.path), 'file://' + out.path)}`);
  const hosted = media.hostedUrl(out.path);
  if (hosted) info(`Public URL (via afax serve): ${c.bold(hosted)}`);
  else dim('  Tip: set integrations.server.publicUrl + run afax serve to get a public URL for Instagram.');
}

// Premium rendered media: spec from a JSON file or drafted by the LLM from a topic.
async function renderMedia(type, args) {
  const t = type === 'motion' ? 'reel' : type;
  const topic = args.topic || args._.slice(1).join(' ');
  header(`${content.emoji} Content`, `${t} · ${(topic || args.spec || '').slice(0, 48)}`);

  let spec = {};
  if (args.spec) {
    const { readFileSync } = await import('node:fs');
    try { spec = JSON.parse(readFileSync(args.spec, 'utf8')); }
    catch (e) { return warn(`Could not read spec ${args.spec}: ${e.message}`); }
  } else if (topic) {
    if (!content.online) return info('No LLM — pass a --spec file, or run ' + c.cyan('afax init') + ' so I can draft one.');
    spec = await spin('Drafting the spec', () => specFromTopic(t, topic));
  } else {
    return warn(`Usage: afax content ${type} --topic "..."   (or --spec file.json)`);
  }

  // Flag overrides.
  spec.slug ||= topic ? topic : t;
  if (args.slug) spec.slug = args.slug;
  if (args.duration) spec.duration = Number(args.duration);
  if (args.music) spec.music = args.music;
  if (args.voiceover) spec.voiceover = args.voiceover === true ? (spec.subtitle || spec.title || topic) : args.voiceover;
  spec.brand = Object.assign({}, spec.brand, args.accent && { accent: args.accent }, args.lang && { lang: args.lang }, args['brand-name'] && { name: args['brand-name'] });

  const { generate } = await import('../content/render.js');
  try {
    const res = await spin(`Rendering ${t}`, () => generate(t, spec));
    const assets = res.files.filter((f) => !f.endsWith('.txt'));
    add('content', { format: t, topic: spec.title || spec.text || spec.slug, path: res.dir });
    content.note(`Rendered ${t}: ${spec.slug}.`);
    log('');
    ok(`Made ${assets.length} file(s) — ${link(c.cyan('open folder'), 'file://' + res.dir)}`);
    for (const f of assets) log('  ' + link(c.cyan(f.split('/').pop()), 'file://' + f) + c.dim('  ' + f));
  } catch (e) {
    warn(e.message);
    if (/Playwright/.test(e.message)) info('One-time setup: ' + c.cyan('npm i playwright && npx playwright install chromium'));
  }
}

// Let the model author the premium spec JSON from a plain topic.
async function specFromTopic(type, topic) {
  const { chat } = await import('../llm/index.js');
  const { workModel } = await import('../config.js');
  const schema =
    type === 'carousel'
      ? '{"slides":[{"kind":"cover","title":"hook","body":"1 line"},{"title":"point","body":"1-2 lines"}, … 4-6 slides],"caption":"post caption with hashtags"}'
      : type === 'meme'
        ? '{"text":"one punchy statement","sub":"optional small line","caption":"post caption"}'
        : '{"eyebrow":"SHORT LABEL","title":"big hook","subtitle":"1 supporting line","cta":"button text","caption":"post caption"}';
  const { json } = await chat({
    system: 'You write premium, hook-first social media specs as STRICT JSON. Match the brand voice and language. Be concise — these are big-type visuals, not paragraphs.',
    messages: [{ role: 'user', content: `Make a ${type} about: "${topic}".\nReturn JSON ONLY in this shape:\n${schema}` }],
    json: true,
    temperature: 0.7,
    maxTokens: 1000,
    model: workModel(),
  });
  return json;
}

export function list() {
  header(`${content.emoji} Content`, 'Library');
  const items = read('content', []);
  if (!items.length) return info('Nothing yet. Try: afax content blog --topic "..."');
  for (const x of items) log(`  ${c.dim(x.id)}  ${c.bold(x.format.padEnd(7))} ${x.topic}`);
}
