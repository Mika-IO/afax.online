// Zero-dependency terminal styling + helpers.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const c = {
  reset: wrap(0),
  bold: wrap(1),
  dim: wrap(2),
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  blue: wrap(34),
  magenta: wrap(35),
  cyan: wrap(36),
  gray: wrap(90),
  orange: wrap('38;5;208'),
};

// The AFAX wordmark, shared by `afax help` and the chat welcome screen.
export const LOGO = [
  '█████╗ ███████╗ █████╗ ██╗  ██╗',
  '██╔══██╗██╔════╝██╔══██╗╚██╗██╔╝',
  '███████║█████╗  ███████║ ╚███╔╝ ',
  '██╔══██║██╔══╝  ██╔══██║ ██╔██╗ ',
  '██║  ██║██║     ██║  ██║██╔╝ ██╗',
  '╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝',
];

// Print the wordmark in brand orange with a left indent.
export function banner(indent = '  ') {
  for (const line of LOGO) console.log(indent + c.orange(line));
}

export const log = (...a) => console.log(...a);
export const info = (msg) => console.log(`${c.cyan('›')} ${msg}`);
export const ok = (msg) => console.log(`${c.green('✔')} ${msg}`);
export const warn = (msg) => console.log(`${c.yellow('!')} ${msg}`);
export const err = (msg) => console.log(`${c.red('✖')} ${msg}`);
export const step = (msg) => console.log(`${c.orange('◆')} ${c.bold(msg)}`);
export const dim = (msg) => console.log(c.dim(msg));

export function header(title, subtitle) {
  console.log('');
  console.log(c.orange('  ▰▰▰ ') + c.bold(title));
  if (subtitle) console.log('      ' + c.dim(subtitle));
  console.log('');
}

// Simple aligned table. rows: array of arrays; cols: array of header strings.
export function table(cols, rows) {
  if (!rows.length) {
    console.log(c.dim('  (empty)'));
    return;
  }
  const widths = cols.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length))
  );
  const line = (cells, styler) =>
    '  ' +
    cells
      .map((cell, i) => styler(String(cell ?? '').padEnd(widths[i])))
      .join('  ');
  console.log(line(cols, c.dim));
  console.log('  ' + c.dim(widths.map((w) => '─'.repeat(w)).join('  ')));
  for (const r of rows) console.log(line(r, (x) => x));
}

// Inline spinner for async work (no-op when not a TTY).
export async function spin(label, fn) {
  if (!process.stdout.isTTY) {
    process.stdout.write(`  ${label}...\n`);
    return fn();
  }
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r  ${c.orange(frames[i++ % frames.length])} ${label}`);
  }, 80);
  try {
    const out = await fn();
    clearInterval(id);
    process.stdout.write(`\r  ${c.green('✔')} ${label}\n`);
    return out;
  } catch (e) {
    clearInterval(id);
    process.stdout.write(`\r  ${c.red('✖')} ${label}\n`);
    throw e;
  }
}
