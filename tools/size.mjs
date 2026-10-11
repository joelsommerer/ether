// Size ratchet (gate G8). Node built-ins only.
//
//   node tools/size.mjs --piece <ID> [--file dist/blank.html]
//                       [--ceiling-bytes <n>] [--log <path> | --no-log]
//
// Compares the byte size of the built document with the piece's ceiling_kb
// (1 KB = 1024 bytes) from docs/plan/pieces/<ID>.json and appends a row to
// docs/plan/size-log.md unless the newest row for that piece already records
// the same file content. Exit code 1 when the ceiling is exceeded.

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_HEADER = '# Size log\n\nBytes of `dist/blank.html` per measurement (written by `tools/size.mjs`; 1 KB = 1024 B).\n\n| Date | Piece | Bytes | Ceiling (B) | Result | sha256 (12) |\n|---|---|---|---|---|---|\n';

/**
 * @param {{piece: string, file: string, ceilingBytes?: number, log?: string | null, date?: string}} opts
 */
export function measure({ piece, file, ceilingBytes, log = join(ROOT, 'docs/plan/size-log.md'), date }) {
  let ceiling = ceilingBytes;
  if (ceiling === undefined) {
    const def = JSON.parse(readFileSync(join(ROOT, 'docs/plan/pieces', `${piece}.json`), 'utf8'));
    if (typeof def.ceiling_kb !== 'number') throw new Error(`${piece} has no numeric ceiling_kb`);
    ceiling = Math.round(def.ceiling_kb * 1024);
  }
  if (!existsSync(file)) throw new Error(`${relative(ROOT, file)} missing (run npm run build)`);
  const data = readFileSync(file);
  const bytes = data.length;
  const ok = bytes <= ceiling;
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 12);
  if (log) {
    if (!existsSync(log)) writeFileSync(log, LOG_HEADER);
    const rows = readFileSync(log, 'utf8').split('\n').filter((l) => l.startsWith(`| `) && l.includes(`| ${piece} |`));
    const last = rows[rows.length - 1] ?? '';
    const row = `| ${date ?? new Date().toISOString().slice(0, 10)} | ${piece} | ${bytes} | ${ceiling} | ${ok ? 'ok' : 'over'} | ${hash} |`;
    if (!last.endsWith(`| ${bytes} | ${ceiling} | ${ok ? 'ok' : 'over'} | ${hash} |`)) appendFileSync(log, `${row}\n`);
  }
  return { bytes, ceiling, ok, hash };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  /** @param {string} name */
  const opt = (name) => { const k = args.indexOf(name); return k >= 0 ? args[k + 1] : undefined; };
  const piece = opt('--piece');
  const ceilingArg = opt('--ceiling-bytes');
  if (!piece && ceilingArg === undefined) {
    console.error('usage: node tools/size.mjs --piece <ID> [--file <html>] [--ceiling-bytes <n>] [--log <path> | --no-log]');
    process.exit(2);
  }
  try {
    const file = resolve(opt('--file') ?? join(ROOT, 'dist/blank.html'));
    const r = measure({
      piece: piece ?? 'adhoc',
      file,
      ceilingBytes: ceilingArg === undefined ? undefined : Number(ceilingArg),
      log: args.includes('--no-log') ? null : opt('--log') ? resolve(/** @type {string} */ (opt('--log'))) : undefined,
    });
    const line = `size: ${relative(process.cwd(), file)} ${r.bytes} B / ceiling ${r.ceiling} B (${piece ?? 'adhoc'})`;
    if (!r.ok) { console.error(`${line} — over by ${r.bytes - r.ceiling} B`); process.exit(1); }
    console.log(`${line} — ok`);
  } catch (err) {
    console.error(`size failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
