// tools/lint.mjs: rejects the forbidden fixture, accepts src/.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lint } from '../../tools/lint.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const run = (/** @type {string[]} */ args) => spawnSync(process.execPath, ['tools/lint.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });

test('fails on a fixture containing el.innerHTML = x', () => {
  const r = run(['test/fixtures/lint/inner-html.js']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /inner-html\.js:4: innerHTML\/outerHTML assignment/);
});

test('passes on src/', () => {
  const r = run([]);
  assert.equal(r.status, 0, r.stderr);
});

test('every rule fires on its pattern and not on harmless code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ether-lint-'));
  try {
    const bad = {
      'a.js': 'el.outerHTML += s;',
      'b.js': "el.insertAdjacentHTML('beforeend', s);",
      'c.js': 'document.write(s);',
      'd.js': 'eval(s);',
      'e.js': "const f = new Function('return 1');",
      'f.js': "setTimeout('tick()', 10);",
      'g.js': '// TODO later',
      'h.js': '/* FIXME */',
      'i.js': "const u = 'https://example.com';",
      'j.html': '<a href="http://x">x</a>',
      'k.js': 'range.createContextualFragment(s);',
    };
    for (const [name, code] of Object.entries(bad)) {
      writeFileSync(join(dir, name), code);
      assert.equal(lint([join(dir, name)]).length, 1, `${name}: ${code}`);
    }
    writeFileSync(join(dir, 'ok.js'), "if (el.innerHTML === '') el.textContent = s; setTimeout(() => {}, 1); const evaluate = 1;");
    assert.deepEqual(lint([join(dir, 'ok.js')]), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
