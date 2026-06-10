// ✍️ Content — autonomous copy, posts, emails, rich assets.
import { Agent } from './base.js';
import { add, read } from '../store.js';
import { c, header, ok, info, warn, spin, log, dim } from '../logger.js';

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

// afax content <format> --topic "..." [--save out.md]
// afax content image --prompt "..."   (real image generation)
export async function cmd(args) {
  const format = (args._[0] || 'post').toLowerCase();
  if (format === 'image') return image(args);
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
  ok(`Saved → ${c.bold(out.path)}`);
  const hosted = media.hostedUrl(out.path);
  if (hosted) info(`Public URL (via afax serve): ${c.bold(hosted)}`);
  else dim('  Tip: set integrations.server.publicUrl + run afax serve to get a public URL for Instagram.');
}

export function list() {
  header(`${content.emoji} Content`, 'Library');
  const items = read('content', []);
  if (!items.length) return info('Nothing yet. Try: afax content blog --topic "..."');
  for (const x of items) log(`  ${c.dim(x.id)}  ${c.bold(x.format.padEnd(7))} ${x.topic}`);
}
