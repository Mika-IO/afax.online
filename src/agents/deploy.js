// 🚀 Deploy — ship a local folder to your VPS over SSH (rsync), and run a
// remote command. Real: shells out to the system ssh/rsync. Requires your key.
import { spawn } from 'node:child_process';
import { integration } from '../config.js';
import { isLive } from '../config.js';
import { c, header, ok, info, warn, step, log } from '../logger.js';

// afax deploy --src ./dist [--run "systemctl restart app"] [--live]
export async function cmd(args) {
  const d = integration('deploy');
  const live = !!args.live;
  const src = args.src || './';
  header('🚀 Deploy', `${d.user || '?'}@${d.host || '?'}:${d.path || '?'} · ${live ? 'LIVE' : 'dry-run'}`);

  if (!d.host || !d.user || !d.path) {
    return warn('Deploy not configured. Run: afax connect deploy  (host, user, path[, key]).');
  }

  const keyArgs = d.key ? ['-e', `ssh -i ${d.key} -o StrictHostKeyChecking=accept-new`] : [];
  const rsyncArgs = ['-az', '--delete', ...keyArgs, src, `${d.user}@${d.host}:${d.path}`];

  if (!(live && isLive())) {
    step('Would run:');
    log('  ' + c.dim(`rsync ${rsyncArgs.join(' ')}`));
    if (args.run) log('  ' + c.dim(`ssh ${d.user}@${d.host} "${args.run}"`));
    log('');
    return info(`Dry-run. Go live: ${c.cyan('afax config set live true')} then add ${c.cyan('--live')}.`);
  }

  step('Syncing files (rsync)');
  await run('rsync', rsyncArgs);
  if (args.run) {
    step(`Remote: ${args.run}`);
    const sshArgs = [...(d.key ? ['-i', d.key] : []), '-o', 'StrictHostKeyChecking=accept-new', `${d.user}@${d.host}`, args.run];
    await run('ssh', sshArgs);
  }
  ok('Deploy complete.');
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: 'inherit' });
    p.on('error', (e) => reject(new Error(`${bin} failed: ${e.message} (is it installed?)`)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}`))));
  });
}
