// Source linter for src/ (gate G2). Node built-ins only.
//
//   node tools/lint.mjs [file-or-dir ...]     (default: src/)
//
// Fails on HTML-string sinks, dynamic code evaluation, string timers,
// TODO/FIXME markers and http(s) URLs. The check is textual on purpose: it also
// catches forbidden constructs inside comments and strings, which keeps the
// rule simple and the sources unambiguous.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSIONS = /\.(?:js|mjs|html|css|ts)$/;

/** @type {{id: string, re: RegExp, why: string}[]} */
export const RULES = [
  { id: 'html-sink', re: /\.\s*(?:inner|outer)HTML\s*(?:\+|\|\||&&|\?\?)?=(?!=)/, why: 'innerHTML/outerHTML assignment' },
  { id: 'html-sink', re: /\binsertAdjacentHTML\b/, why: 'insertAdjacentHTML' },
  { id: 'html-sink', re: /\bdocument\s*\.\s*write(?:ln)?\b/, why: 'document.write' },
  { id: 'html-sink', re: /\b(?:createContextualFragment|setHTMLUnsafe|parseHTMLUnsafe|srcdoc)\b/, why: 'HTML string parsing' },
  { id: 'eval', re: /\beval\b/, why: 'eval' },
  { id: 'eval', re: /\bnew\s+Function\b|\bFunction\s*\(/, why: 'new Function / Function()' },
  { id: 'string-timer', re: /\bset(?:Timeout|Interval)\s*\(\s*['"`]/, why: 'string passed to setTimeout/setInterval' },
  { id: 'marker', re: /\b(?:TODO|FIXME)\b/, why: 'TODO/FIXME marker' },
  { id: 'url', re: /\bhttps?:\/\//i, why: 'http(s) URL' },
];

/** @param {string} path @returns {string[]} */
function collect(path) {
  const st = statSync(path);
  if (st.isFile()) return [path];
  return readdirSync(path).sort().flatMap((name) => {
    const p = join(path, name);
    return statSync(p).isDirectory() ? collect(p) : EXTENSIONS.test(name) ? [p] : [];
  });
}

/**
 * Lints files; returns findings as "file:line: why".
 * @param {string[]} paths
 */
export function lint(paths) {
  const findings = [];
  for (const file of paths.flatMap(collect)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, n) => {
      for (const rule of RULES) {
        if (rule.re.test(line)) findings.push(`${relative(process.cwd(), file)}:${n + 1}: ${rule.why} [${rule.id}]`);
      }
    });
  }
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const paths = (args.length ? args : [join(ROOT, 'src')]).map((p) => resolve(p));
  const findings = lint(paths);
  if (findings.length) {
    console.error(findings.join('\n'));
    console.error(`lint: ${findings.length} finding(s)`);
    process.exit(1);
  }
  console.log(`lint: ok (${paths.map((p) => relative(process.cwd(), p) || '.').join(', ')})`);
}
