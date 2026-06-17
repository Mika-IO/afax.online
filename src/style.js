// 🌐 Output style — two cross-cutting rules every agent prompt shares:
//   1. Language: the company speaks ONE configured language in all output.
//   2. Anti-filler: ban simulated-thinking filler, preambles, sycophancy and
//      padding (cuts output tokens, latency and API cost). Real reasoning that
//      improves accuracy on hard tasks is NOT banned — only text that *pretends*
//      to think or wraps the answer in fluff.
import { load } from './config.js';

// Cheap fallback: guess a readable target language from the website's TLD when
// no explicit `business.language` is set and the site hasn't been ingested yet.
const TLD_LANG = [
  [/\.com\.br$|\.br$/i, 'Portuguese (Brazil)'],
  [/\.pt$/i, 'Portuguese (Portugal)'],
  [/\.(es|mx|ar|cl|co|pe|ve)$/i, 'Spanish'],
  [/\.fr$/i, 'French'],
  [/\.(de|at)$/i, 'German'],
  [/\.it$/i, 'Italian'],
  [/\.nl$/i, 'Dutch'],
];

function guessFromWebsite(website) {
  const host = String(website || '').replace(/^https?:\/\//, '').split('/')[0];
  if (!host) return '';
  for (const [re, lang] of TLD_LANG) if (re.test(host)) return lang;
  return '';
}

// The company's target language: explicit config wins, else a TLD guess, else ''.
export function targetLanguage(cfg = load()) {
  const explicit = (cfg.business?.language || '').trim();
  if (explicit) return explicit;
  return guessFromWebsite(cfg.business?.website);
}

// One-line directive forcing all output into the company language. Empty when no
// language is known (then the model just mirrors the user, the previous behaviour).
export function languageDirective(cfg = load()) {
  const lang = targetLanguage(cfg);
  if (!lang) return '';
  return (
    `LANGUAGE: Always write every response, message and generated asset in ${lang}, ` +
    `regardless of the language of the incoming message or lead. A lead who writes in another ` +
    `language still gets ${lang} back — unless the user (the CEO) explicitly asks for a different language.`
  );
}

// Strict anti-filler rules. Phrased as hard bans; keeps real chain-of-thought.
export const STYLE_RULES = [
  'OUTPUT STYLE — be terse and substantive; every banned phrase below wastes tokens, latency and money:',
  '- No simulated-thinking filler in the output: never write "hmm", "let me think", "let me see", "thinking…", "deixa eu pensar".',
  '- No preambles: do not open with "sure", "certainly", "of course", "claro", "com certeza", "here\'s", "aqui está". Lead with the answer.',
  '- No sycophancy or apology padding: skip "great question", "you\'re absolutely right", "I apologize for the confusion", "as an AI model".',
  '- No filler connectives: drop "it\'s important to note that", "it\'s worth mentioning", "in conclusion", "to summarize", "vale ressaltar", "em conclusão".',
  '- Do NOT suppress real reasoning when a task genuinely needs it — think where it improves accuracy, just don\'t narrate fake thinking or wrap the result in fluff.',
].join('\n');

// Combined block to append to any system prompt.
export function styleBlock(cfg = load()) {
  return [languageDirective(cfg), STYLE_RULES].filter(Boolean).join('\n');
}
