// Orchestrates premium media generation: spec → HTML templates → PNG/MP4, saved
// to an auto-organized, dated library folder with a ready-to-post caption.
//   ~/.afax/library/<brand>/<type>/<YYYY-MM-DD>_<slug>/
// Playwright (render) and ffmpeg (video) are optional — image pieces need only
// Playwright; video adds ffmpeg for the mp4 mux. Both degrade with a clear error.
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { AFAX_HOME, ensureDir, slugify } from '../paths.js';
import { load } from '../config.js';
import { brandOf, FORMATS } from './brands.js';
import { carousel, meme, poster, motion } from './templates.js';
import { renderHtmlToPng, recordHtmlVideo } from '../integrations/browser.js';

function outDir(brand, type, slug) {
  const date = new Date().toISOString().slice(0, 10);
  return ensureDir(join(AFAX_HOME, 'library', slugify(brand.name), type, `${date}_${slugify(slug || type)}`));
}

// type: carousel | meme | poster | reel
export async function generate(type, spec = {}) {
  const fmt = FORMATS[type] || FORMATS.poster;
  const brand = brandOf(spec);
  brand._w = spec.width || fmt.width;
  brand._h = spec.height || fmt.height;
  const dir = outDir(brand, type, spec.slug);
  const files = [];

  if (type === 'carousel') {
    const htmls = carousel(spec, brand);
    if (!htmls.length) throw new Error('carousel needs spec.slides[]');
    for (let i = 0; i < htmls.length; i++) {
      const out = join(dir, `slide_${String(i + 1).padStart(2, '0')}.png`);
      await renderHtmlToPng(htmls[i], { width: brand._w, height: brand._h, out });
      files.push(out);
    }
  } else if (type === 'meme') {
    const out = join(dir, 'meme.png');
    await renderHtmlToPng(meme(spec, brand), { width: brand._w, height: brand._h, out });
    files.push(out);
  } else if (type === 'poster') {
    const out = join(dir, 'poster.png');
    await renderHtmlToPng(poster(spec, brand), { width: brand._w, height: brand._h, out });
    files.push(out);
  } else if (type === 'reel' || type === 'motion') {
    files.push(await renderReel(spec, brand, dir));
  } else {
    throw new Error(`Unknown media type: ${type}`);
  }

  if (spec.caption) {
    const cap = join(dir, 'caption.txt');
    writeFileSync(cap, String(spec.caption));
    files.push(cap);
  }
  return { dir, files };
}

async function renderReel(spec, brand, dir) {
  const durMs = Math.min(Math.max(Number(spec.duration) || 6, 2), 30) * 1000;
  const webm = await recordHtmlVideo(motion(spec, brand), { width: brand._w, height: brand._h, durationMs: durMs });
  const audio = await resolveAudio(spec, dir);
  const out = join(dir, 'reel.mp4');
  const muxed = await ffmpegMux(webm, audio, out);
  return muxed ? out : webm; // fall back to the raw webm if ffmpeg is unavailable
}

// Optional audio: an explicit music file, and/or an AI voiceover (OpenAI TTS).
async function resolveAudio(spec, dir) {
  if (spec.music) return spec.music;
  if (spec.voiceover) {
    const voice = await ttsToMp3(String(spec.voiceover), dir);
    if (voice) return voice;
  }
  return null;
}

async function ttsToMp3(text, dir) {
  const cfg = load();
  const key = cfg.providers?.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!key) return null;
  const baseUrl = cfg.providers?.openai?.baseUrl || 'https://api.openai.com/v1';
  try {
    const res = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: text }),
    });
    if (!res.ok) return null;
    const file = join(dir, 'voice.mp3');
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return file;
  } catch {
    return null;
  }
}

function ffmpegMux(video, audio, out) {
  return new Promise((resolve) => {
    const args = ['-y', '-i', video];
    if (audio) args.push('-i', audio);
    args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
    if (audio) args.push('-c:a', 'aac', '-shortest');
    args.push(out);
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const p = spawn('ffmpeg', args, { stdio: 'ignore' });
    p.on('error', () => finish(false)); // ffmpeg not installed
    p.on('close', (code) => finish(code === 0));
  });
}
