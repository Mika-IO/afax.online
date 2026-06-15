// ✍️ Content — autonomous copy, posts, emails, rich assets.
import { Agent } from './base.js';
import { add, read } from '../store.js';
import { c, header, ok, info, warn, spin, log, dim, link } from '../logger.js';

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
  if (MEDIA.includes(format)) return renderMedia(format, args);
  const topic = args.topic || args._.slice(1).join(' ');
  const spec = FORMATS[format];
  if (!spec) return warn(`Format must be: ${Object.keys(FORMATS).join(', ')}, image`);
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
  });
  return json;
}

export function list() {
  header(`${content.emoji} Content`, 'Library');
  const items = read('content', []);
  if (!items.length) return info('Nothing yet. Try: afax content blog --topic "..."');
  for (const x of items) log(`  ${c.dim(x.id)}  ${c.bold(x.format.padEnd(7))} ${x.topic}`);
}
