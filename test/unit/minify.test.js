// tools/minify.mjs: every fixture evaluates identically before and after
// minification (node:vm), and the output is safe to inline in <script>.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { minifyCss, minifyJs, tokenize } from '../../tools/minify.mjs';

const FIXTURES = new URL('../fixtures/minify/', import.meta.url);

/** @param {string} code */
const run = (code) => vm.runInNewContext(code, {}, { timeout: 1000 });

describe('minifyJs on fixtures', () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.js')).sort();
  test('the fixture corpus covers the required cases', () => {
    for (const name of ['regex-division.js', 'nested-templates.js', 'comment-like-strings.js', 'script-close.js', 'asi.js', 'operators.js']) {
      assert.ok(files.includes(name), name);
    }
  });
  for (const file of files) {
    test(file, () => {
      const src = readFileSync(join(FIXTURES.pathname, file), 'utf8');
      const min = minifyJs(src);
      assert.equal(run(min), run(src), 'same completion value');
      assert.ok(min.length < src.length, 'output is smaller');
      assert.equal(minifyJs(min), min, 'idempotent');
      assert.doesNotMatch(min, /<\/script|<!--/i, 'no "</script" or "<!--" left');
    });
  }
});

describe('minifyJs cases', () => {
  /** @type {[string, string][]} source -> expected minified */
  const cases = [
    ['a = b / c / d', 'a=b/c/d'],
    ['x = /re/g.test(s)', 'x=/re/g.test(s)'],
    ['if (a) /re/.test(s)', 'if(a)/re/.test(s)'],
    ['f(a) / 2', 'f(a)/2'],
    ['a / /re/.source.length', 'a/ /re/.source.length'],
    ['/re/ in o', '/re/ in o'],
    ['return\nx', 'return\nx'],
    ['a\n++b', 'a\n++b'],
    ['a = b\n(c)', 'a=b\n(c)'],
    ['a = {\n  b: 1,\n}', 'a={b:1,}'],
    ['a - -b; a + +b; a+ ++b', 'a- -b;a+ +b;a+ ++b'],
    ['a < !b; x-- > y', 'a< !b;x-- >y'],
    ['1 .toString(); 1..toString()', '1 .toString();1. .toString()'],
    ["s = '</script>'", "s='<\\/script>'"],
    ['s = "<!--"', 's="<\\!--"'],
    ['/* a\n b */ x', 'x'],
    ['a // c\nb', 'a\nb'],
    ['a /* c\n */ b', 'a\nb'],
    ['`a${b}c${`d${e}`}`', '`a${b}c${`d${e}`}`'],
    ['`${ {a: 1}.a / 2 }`', '`${{a:1}.a/2}`'],
  ];
  for (const [src, expected] of cases) {
    test(JSON.stringify(src), () => assert.equal(minifyJs(src), expected));
  }

  test('"</script" in strings evaluates to the same value', () => {
    const src = "JSON.stringify(['</script>', \"</Script\", `</SCRIPT${1}`])";
    assert.equal(run(minifyJs(src)), run(src));
  });

  test('ASI-sensitive return keeps returning undefined', () => {
    const src = 'function f() {\n  return\n  42\n}\nf()';
    assert.equal(run(minifyJs(src)), undefined);
  });

  test('rejects unterminated tokens and HTML-like comments', () => {
    assert.throws(() => minifyJs("'abc"), /unterminated string/);
    assert.throws(() => minifyJs('`a${b'), /unterminated template|unbalanced/);
    assert.throws(() => minifyJs('/* x'), /unterminated comment/);
    assert.throws(() => minifyJs('x = 1 <!-- y'), /HTML-like comment/);
  });

  test('never renames: every identifier survives', () => {
    const src = readFileSync(join(FIXTURES.pathname, 'operators.js'), 'utf8');
    const words = (/** @type {string} */ s) => tokenize(s).filter((t) => t.type === 'word').map((t) => t.value);
    assert.deepEqual(words(minifyJs(src)), words(src));
  });
});

describe('minifyCss', () => {
  test('removes comments and whitespace, keeps strings and selectors', () => {
    assert.equal(minifyCss('/* c */\n:root {\n  color-scheme: light dark;\n}\n'), ':root{color-scheme:light dark;}');
    assert.equal(minifyCss('a :hover , b > c { content: "a  /* b */  c" ; }'), 'a :hover,b > c{content:"a  /* b */  c";}');
    assert.equal(minifyCss('@media (min-width: 30em) { p { margin: 0 auto } }'), '@media (min-width: 30em){p{margin:0 auto}}');
  });
});
