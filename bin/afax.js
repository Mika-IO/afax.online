#!/usr/bin/env node
import { loadEnv } from '../src/env.js';
loadEnv();
import { run } from '../src/cli.js';

run(process.argv.slice(2)).catch((err) => {
  console.error('\x1b[31m✖\x1b[0m ' + (err?.message || err));
  if (process.env.AFAX_DEBUG) console.error(err);
  process.exit(1);
});
