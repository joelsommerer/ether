// tools/build.mjs: reproducible output, CSP hashes that match the inline code,
// a structurally valid shell, and equivalent minified/dev scripts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import vm from 'node:vm';
import { build, stripModule } from '../../tools/build.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'ether-build-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outA = join(tmp, 'a');
const outB = join(tmp, 'b');
build(outA);
build(outB);
const DOCS = ['blank.html', 'blank.dev.html'];

/** @param {string} html @param {'script'|'style'} tag */
function inline(html, tag) {
  const all = [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))];
  assert.equal(all.length, 1, `exactly one <${tag}>`);
  return all[0][1];
}

/** @param {string} text */
const sha = (text) => `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;

describe('build', () => {
  for (const doc of DOCS) {
    test(`${doc}: two builds are byte-identical`, () => {
      assert.ok(readFileSync(join(outA, doc)).equals(readFileSync(join(outB, doc))));
    });

    test(`${doc}: CSP meta hashes equal sha256 of the inline script and style`, () => {
      const html = readFileSync(join(outA, doc), 'utf8');
      const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1];
      assert.equal(csp, `default-src 'none'; script-src '${sha(inline(html, 'script'))}'; style-src '${sha(inline(html, 'style'))}'; img-src data: blob:`);
    });

    test(`${doc}: valid self-contained shell`, () => {
      const html = readFileSync(join(outA, doc), 'utf8');
      assert.match(html, /^<!doctype html>\s*<html lang="en">\s*<head>\s*<meta charset="utf-8">/);
      assert.ok(html.indexOf('<meta charset="utf-8">') < 1024, 'charset within the first 1024 bytes');
      const cspAt = html.indexOf('Content-Security-Policy');
      assert.ok(cspAt > 0 && cspAt < html.indexOf('<style>') && cspAt < html.indexOf('<script>'), 'CSP precedes style and script');
      assert.match(html, /<title>[^<]+<\/title>/);
      assert.match(html, /<\/body>\s*<\/html>\s*$/);
      assert.doesNotMatch(html, /\b(?:src|href)="(?!data:)/, 'no external references');
      assert.doesNotMatch(html, /https?:\/\//);
      assert.doesNotMatch(inline(html, 'script'), /<\/script|<!--/i);
    });
  }

  test('minified and dev scripts expose the same API', () => {
    /** @param {string} doc */
    const api = (doc) => {
      const window = {};
      vm.runInNewContext(inline(readFileSync(join(outA, doc), 'utf8'), 'script'), { window });
      return JSON.stringify(/** @type {any} */ (window).webdoc);
    };
    assert.equal(api('blank.html'), api('blank.dev.html'));
    assert.equal(api('blank.html'), JSON.stringify({ version: '0.0.0' }));
  });

  test('blank.html is smaller than its dev twin', () => {
    assert.ok(readFileSync(join(outA, 'blank.html')).length < readFileSync(join(outA, 'blank.dev.html')).length);
  });
});

describe('module stripping', () => {
  const earlier = () => new Map([['a.js', new Set(['A'])]]);
  test('strips imports and export keywords', () => {
    const out = stripModule('b.js', "import { A } from './a.js';\nexport const B = A;\nexport function f() {}", earlier(), new Map());
    assert.equal(out, '\nconst B = A;\nfunction f() {}');
  });
  for (const [code, re] of /** @type {[string, RegExp][]} */ ([
    ['export default 1;', /unsupported export/],
    ['export { x };', /unsupported export/],
    ["import * as a from './a.js';", /unsupported import/],
    ["import { Z } from './a.js';", /does not export Z/],
    ["import { A } from './c.js';", /not an earlier module/],
    ["import { A as Z } from './a.js';", /renaming/],
  ])) {
    test(`rejects ${code}`, () => assert.throws(() => stripModule('b.js', code, earlier(), new Map()), re));
  }
  test('rejects a top-level name declared by two modules', () => {
    assert.throws(() => stripModule('b.js', 'const A = 1;', earlier(), new Map([['A', 'a.js']])), /already declared in src\/a\.js/);
  });
});
