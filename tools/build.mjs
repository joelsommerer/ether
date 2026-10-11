// Builds the self-contained document shell from src/ with Node built-ins only.
//
//   node tools/build.mjs [--out <dir>]
//
// Steps: read the modules in a fixed order, strip ES module syntax, wrap them in
// one strict IIFE, minify (tools/minify.mjs), hash the inline script and style
// (SHA-256, node:crypto), inject the CSP meta and write
//   <out>/blank.html      minified
//   <out>/blank.dev.html  unminified twin with its own hashes
// The output depends only on the sources: two builds are byte-identical.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { minifyCss, minifyJs } from './minify.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/**
 * Module order is fixed: a module may only import from modules listed before it.
 * New engine modules are added here.
 */
export const MODULES = ['version.js', 'main.js'];

const IMPORT_LINE = /^import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+\.js)';?[ \t]*$/;
const EXPORT_DECL = /^export\s+(?=(?:async\s+)?function\b|const\b|let\b|class\b)/;
const TOP_DECL = /^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/;

/**
 * Removes module syntax from one module and checks its imports and top-level
 * names. Supported forms: `import { a, b } from './x.js';` on one line and
 * `export` in front of a function, const, let or class declaration.
 * @param {string} name
 * @param {string} code
 * @param {Map<string, Set<string>>} exportsByModule exports of earlier modules
 * @param {Map<string, string>} topNames top-level name -> module
 */
export function stripModule(name, code, exportsByModule, topNames) {
  const exported = new Set();
  const lines = code.split('\n').map((line, n) => {
    const where = `src/${name}:${n + 1}`;
    if (/^import\b/.test(line)) {
      const m = IMPORT_LINE.exec(line);
      if (!m) throw new Error(`${where}: unsupported import form (use: import { a } from './x.js';)`);
      const from = exportsByModule.get(m[2]);
      if (!from) throw new Error(`${where}: ${m[2]} is not an earlier module in MODULES`);
      for (const id of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        if (/\sas\s/.test(id)) throw new Error(`${where}: import renaming is not supported`);
        if (!from.has(id)) throw new Error(`${where}: ${m[2]} does not export ${id}`);
      }
      return '';
    }
    if (/^export\b/.test(line)) {
      if (!EXPORT_DECL.test(line)) throw new Error(`${where}: unsupported export form (export a declaration)`);
      line = line.replace(EXPORT_DECL, '');
      const d = TOP_DECL.exec(line);
      if (d) exported.add(d[1]);
    }
    const d = TOP_DECL.exec(line);
    if (d) {
      const other = topNames.get(d[1]);
      if (other) throw new Error(`${where}: top-level name ${d[1]} already declared in src/${other}`);
      topNames.set(d[1], name);
    }
    return line;
  });
  exportsByModule.set(name, exported);
  return lines.join('\n');
}

/** Concatenates the modules into one strict IIFE (unminified). */
export function bundle() {
  /** @type {Map<string, Set<string>>} */
  const exportsByModule = new Map();
  /** @type {Map<string, string>} */
  const topNames = new Map();
  const parts = MODULES.map((name) => {
    const code = readFileSync(join(SRC, name), 'utf8').replace(/\r\n?/g, '\n');
    return `// --- src/${name}\n${stripModule(name, code, exportsByModule, topNames).trim()}`;
  });
  return `(function () {\n'use strict';\n${parts.join('\n\n')}\n})();\n`;
}

/** @param {string} text */
export const sha256 = (text) => `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;

/**
 * @param {string} script
 * @param {string} style
 */
export const csp = (script, style) =>
  `default-src 'none'; script-src '${sha256(script)}'; style-src '${sha256(style)}'; img-src data: blob:`;

/**
 * Fills the template. Fails if the inline script could end its element early.
 * @param {string} template
 * @param {string} script
 * @param {string} style
 */
function render(template, script, style) {
  if (/<\/script|<!--/i.test(script)) throw new Error('inline script contains "</script" or "<!--"');
  if (/<\/style/i.test(style)) throw new Error('inline style contains "</style"');
  for (const key of ['{{CSP}}', '{{STYLE}}', '{{SCRIPT}}']) {
    if (template.split(key).length !== 2) throw new Error(`template must contain ${key} exactly once`);
  }
  // Function replacers: "$" sequences in the code must stay literal.
  return template
    .replace('{{CSP}}', () => csp(script, style))
    .replace('{{STYLE}}', () => style)
    .replace('{{SCRIPT}}', () => script);
}

/**
 * Builds both documents into `outDir`.
 * @param {string} outDir
 */
export function build(outDir) {
  const template = readFileSync(join(SRC, 'template.html'), 'utf8').replace(/\r\n?/g, '\n');
  const css = readFileSync(join(SRC, 'style.css'), 'utf8').replace(/\r\n?/g, '\n');
  const devScript = bundle();
  const script = minifyJs(devScript);
  // Both scripts must at least compile.
  new vm.Script(devScript, { filename: 'blank.dev.html' });
  new vm.Script(script, { filename: 'blank.html' });

  const dev = render(template, devScript, css.trim());
  const min = render(template.replace(/>\s+</g, '><').trim(), script, minifyCss(css));

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'blank.html'), min);
  writeFileSync(join(outDir, 'blank.dev.html'), dev);
  return { min: Buffer.byteLength(min), dev: Buffer.byteLength(dev) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const k = process.argv.indexOf('--out');
  const out = resolve(k > 0 ? process.argv[k + 1] : join(ROOT, 'dist'));
  try {
    const size = build(out);
    console.log(`build: ${join(out, 'blank.html')} ${size.min} B, ${join(out, 'blank.dev.html')} ${size.dev} B`);
  } catch (err) {
    console.error(`build failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
