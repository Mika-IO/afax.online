// `afax init` — interactive setup: provider, model, keys, business profile.
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { load, save, hasLLM, DEFAULTS } from './config.js';
import { c, header, ok, info, log, dim } from './logger.js';

export async function init() {
  header('AFAX · Setup', 'Configure your autonomous company in ~60 seconds');
  const rl = createInterface({ input: stdin, output: stdout });
  const cfg = load();

  const ask = async (q, def) => {
    const a = (await rl.question(`  ${c.cyan('?')} ${q}${def ? c.dim(` (${def})`) : ''}: `)).trim();
    return a || def || '';
  };

  try {
    log(c.bold('  1) LLM provider'));
    dim('     anthropic · openai · openrouter (100s of models) · ollama (offline)');
    const provider = (await ask('Provider', cfg.provider)).toLowerCase();
    cfg.provider = ['anthropic', 'openai', 'openrouter', 'ollama'].includes(provider) ? provider : 'anthropic';

    const block = cfg.providers[cfg.provider];
    if (cfg.provider !== 'ollama') {
      const envName = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', openrouter: 'OPENROUTER_API_KEY' }[cfg.provider] || 'OPENAI_API_KEY';
      log('');
      dim(`     Tip: leave blank to use the ${envName} env var instead of storing the key on disk.`);
      const key = await ask('API key', block.apiKey ? '•••stored' : '');
      if (key && key !== '•••stored') block.apiKey = key;
      if (cfg.provider === 'openai') {
        block.baseUrl = await ask('Base URL (OpenAI-compatible)', block.baseUrl);
      }
    } else {
      block.baseUrl = await ask('Ollama URL', block.baseUrl);
    }
    block.model = await ask('Model', block.model);

    log('');
    log(c.bold('  2) Business profile') + c.dim('  (powers every agent)'));
    cfg.business.name = await ask('Company name', cfg.business.name);
    cfg.business.offer = await ask('What you sell', cfg.business.offer);
    cfg.business.icp = await ask('Ideal customer (ICP)', cfg.business.icp);
    cfg.business.tone = await ask('Brand tone', cfg.business.tone);
    cfg.business.website = await ask('Website', cfg.business.website);
    cfg.business.language = await ask('Output language (blank = auto-detect from site)', cfg.business.language);

    log('');
    log(c.bold('  3) Autonomy'));
    dim('     suggest = AFAX proposes, you approve · execute = AFAX acts on its own');
    const aut = (await ask('Autonomy', cfg.autonomy)).toLowerCase();
    cfg.autonomy = aut === 'execute' ? 'execute' : 'suggest';

    save(cfg);
    log('');
    ok('Setup saved.');

    // Learn the company from its website so every agent starts with real context.
    if (cfg.business.website && hasLLM()) {
      log('');
      const go = (await ask(`Learn your company from ${c.cyan(cfg.business.website)} now? [Y/n]`, 'y')).toLowerCase();
      if (go !== 'n' && go !== 'no') {
        rl.close();
        const { cmd: context } = await import('./agents/context.js');
        await context({ _: ['ingest', cfg.business.website] });
      }
    } else if (cfg.business.website) {
      info(`Run ${c.cyan('afax context ingest ' + cfg.business.website)} to learn your company from its site.`);
    }

    log('');
    info(`Try it:  ${c.cyan('afax status')}  ·  ${c.cyan('afax run')}  ·  ${c.cyan('afax prospect source <domain>')}  ·  ${c.cyan('afax work')}`);
  } finally {
    rl.close();
  }
}
