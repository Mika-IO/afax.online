// Brand + i18n for generated media. The brand is derived from the active
// workspace's business profile, with premium defaults, and can be overridden
// per-spec (so it's multi-company, not hard-coded to anyone's products).
import { load } from '../config.js';
import { slugify } from '../paths.js';

const I18N = {
  en: { swipe: 'swipe', step: 'step', readMore: 'read more', cta: 'Learn more' },
  pt: { swipe: 'arraste', step: 'passo', readMore: 'saiba mais', cta: 'Saiba mais' },
  es: { swipe: 'desliza', step: 'paso', readMore: 'ver más', cta: 'Conoce más' },
};

export function brandOf(spec = {}) {
  const cfg = load();
  const b = cfg.business || {};
  const o = spec.brand || {};
  const name = o.name || b.name || 'Your Brand';
  const lang = (o.lang || cfg.contentLang || 'en').slice(0, 2);
  return {
    name,
    handle: o.handle || '@' + slugify(name),
    accent: o.accent || '#ff8a3d',
    accent2: o.accent2 || '#ff6a2b',
    bg: o.bg || '#0b0c10',
    ink: o.ink || '#f3f4f7',
    dim: o.dim || '#9aa0ab',
    tagline: o.tagline || b.offer || '',
    lang,
    t: I18N[lang] || I18N.en,
  };
}

export const FORMATS = {
  carousel: { width: 1080, height: 1350 },
  meme: { width: 1080, height: 1080 },
  poster: { width: 1080, height: 1350 },
  reel: { width: 1080, height: 1920 },
};
