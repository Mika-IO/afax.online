// Dev convenience: reinstall the AFAX CLI globally from this checkout so code
// changes take effect on the next `afax` invocation. No-fuss inner-loop testing.
//   afax self-update           → npm install -g <repo root>
//   afax self-update --link    → npm link (symlink global bin to the checkout)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { c, info, ok, err, warn } from './logger.js';

// <root>/src/selfupdate.js → <root>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function pkgVersion() {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  } catch {
    return '?';
  }
}

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))));
  });
}

export async function selfUpdate(args = {}) {
  const link = !!args.link;
  const npmArgs = link ? ['link'] : ['install', '-g', ROOT];
  info(`Reinstalling AFAX v${pkgVersion()} from ${c.dim(ROOT)}`);
  info(c.dim(`$ npm ${npmArgs.join(' ')}`));
  try {
    await run('npm', npmArgs, ROOT);
    ok(`AFAX reinstalled. Run ${c.cyan('afax version')} to confirm.`);
  } catch (e) {
    err(`Reinstall failed: ${e.message}`);
    warn('Global installs may need sudo, or use: afax self-update --link');
    throw e;
  }
}
