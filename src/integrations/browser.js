// 🌐 Browser — a real headless browser the agent can drive (navigate, read,
// click, type, screenshot). Hermes-style act→observe loop, but DOM-based: each
// observation returns the page text plus an indexed list of interactive
// elements, and the agent acts on those indices.
//
// Playwright is an OPTIONAL dependency to keep the core zero-dep. It is lazy-
// imported; if it's missing the agent gets a clear "install it" message instead
// of a crash. Install once:  npm i playwright && npx playwright install chromium
import { join } from 'node:path';
import { AFAX_HOME, ensureDir } from '../paths.js';
import { assertSafeUrl } from './ssrf.js';

let session = null; // single reused browser across a task

async function playwright() {
  try {
    return await import('playwright');
  } catch {
    throw new Error('Browser needs Playwright (optional). Install once: npm i playwright && npx playwright install chromium');
  }
}

export function isAvailable() {
  return import('playwright').then(() => true).catch(() => false);
}

async function getPage() {
  if (session) return session.page;
  const { chromium } = await playwright();
  const browser = await chromium.launch({ headless: process.env.AFAX_BROWSER_HEADFUL ? false : true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (AFAX browser agent)',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  session = { browser, context, page };
  return page;
}

export async function close() {
  if (session) {
    await session.browser.close().catch(() => {});
    session = null;
  }
}

// Tag interactive elements with a stable index and return a compact snapshot the
// LLM can act on. Runs in the page; assigns data-afax-id so click/type can hit
// an element by number regardless of how brittle its real selector is.
const SNAPSHOT_FN = `() => {
  const sel = 'a,button,input,textarea,select,[role=button],[onclick]';
  const out = [];
  let i = 0;
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;            // skip hidden
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    el.setAttribute('data-afax-id', i);
    const tag = el.tagName.toLowerCase();
    const label = (el.getAttribute('aria-label') || el.value || el.placeholder || el.innerText || el.getAttribute('name') || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
    out.push({ i, tag, type: el.getAttribute('type') || '', label });
    i++;
    if (i >= 120) break;
  }
  const text = (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 4000);
  return { url: location.href, title: document.title, text, elements: out };
}`;

function formatSnapshot(s) {
  const els = s.elements
    .map((e) => `  [${e.i}] <${e.tag}${e.type ? ' ' + e.type : ''}> ${e.label || '(no label)'}`)
    .join('\n');
  return `URL: ${s.url}\nTitle: ${s.title}\n\nText:\n${s.text || '(empty)'}\n\nInteractive elements:\n${els || '  (none)'}`;
}

async function snapshot(page) {
  const s = await page.evaluate(SNAPSHOT_FN);
  return formatSnapshot(s);
}

// --- actions (each returns text the agent observes) --------------------------
export async function goto(url) {
  const safe = await assertSafeUrl(url);
  const page = await getPage();
  await page.goto(safe, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  return snapshot(page);
}

export async function click(idx) {
  const page = await getPage();
  await page.click(`[data-afax-id="${Number(idx)}"]`);
  await page.waitForTimeout(500);
  return snapshot(page);
}

export async function type(idx, text) {
  const page = await getPage();
  const target = `[data-afax-id="${Number(idx)}"]`;
  await page.fill(target, String(text));
  return snapshot(page);
}

export async function press(key) {
  const page = await getPage();
  await page.keyboard.press(key || 'Enter');
  await page.waitForTimeout(500);
  return snapshot(page);
}

export async function scroll(dir = 'down') {
  const page = await getPage();
  await page.mouse.wheel(0, dir === 'up' ? -800 : 800);
  await page.waitForTimeout(250);
  return snapshot(page);
}

export async function read() {
  const page = await getPage();
  return snapshot(page);
}

export async function screenshot(name) {
  const page = await getPage();
  const dir = ensureDir(join(AFAX_HOME, 'assets'));
  const file = join(dir, (name || `shot-${Date.now()}`).replace(/[^a-z0-9_-]/gi, '') + '.png');
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

// Render an arbitrary HTML string/file to a PNG (the premium-asset path).
export async function renderHtmlToPng(html, { width = 1080, height = 1350, scale = 2, out } = {}) {
  const { chromium } = await playwright();
  const browser = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb'] });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate('document.fonts && document.fonts.ready').catch(() => {});
    await page.waitForTimeout(200);
    const file = out || join(ensureDir(join(AFAX_HOME, 'assets')), `render-${Date.now()}.png`);
    ensureDir(file.slice(0, file.lastIndexOf('/')) || '.');
    await page.screenshot({ path: file });
    return file;
  } finally {
    await browser.close().catch(() => {});
  }
}
