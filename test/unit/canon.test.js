// src/canon.js: canonical JSON rules and a 10 000-object round-trip property.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canon } from '../../src/canon.js';
import { prng } from '../../tools/fixtures.mjs';

test('keys sorted by UTF-16 code units, no whitespace, nested', () => {
  const v = { b: 1, a: [true, false, null, { z: '', y: -0 }], A: 'x', '\u00e9': 4, '\u{1F600}': 5, '\uffff': 6, '': 0 };
  assert.equal(canon(v), '{"":0,"A":"x","a":[true,false,null,{"y":0,"z":""}],"b":1,"\u00e9":4,"\u{1F600}":5,"\uffff":6}');
});

test('string escapes: JSON.stringify rules plus <, U+2028, U+2029', () => {
  assert.equal(canon('<'), '"\\u003c"');
  assert.equal(canon('</script><!-- -->'), '"\\u003c/script>\\u003c!-- -->"');
  assert.equal(canon('\u2028\u2029'), '"\\u2028\\u2029"');
  assert.equal(canon('"\\/\b\f\n\r\t\u0000\u001f\u007f'), '"\\"\\\\/\\b\\f\\n\\r\\t\\u0000\\u001f\u007f"');
  assert.equal(canon('\u{1F600}\u00e4>&'), '"\u{1F600}\u00e4>&"');
});

test('own "__proto__" keys (from JSON.parse) are kept and sorted', () => {
  assert.equal(canon(JSON.parse('{"__proto__":1,"_":2}')), '{"_":2,"__proto__":1}');
});

test('rejects values outside the canonical subset', () => {
  for (const [k, bad] of [1.5, NaN, Infinity, -Infinity, 2 ** 53, -(2 ** 53), undefined, () => 1, Symbol('s'), 1n, '\ud800', 'a\udc00b', '\udc00\ud800', [1, undefined], { a: undefined }, { '\ud83d': 1 }].entries()) {
    assert.throws(() => canon(bad), (e) => e === 'canon', `case ${k}`);
  }
  assert.equal(canon(2 ** 53 - 1), '9007199254740991');
  assert.equal(canon(-(2 ** 53 - 1)), '-9007199254740991');
});

/** Random canonical-able value. @param {() => number} r @param {number} depth @returns {unknown} */
function value(r, depth) {
  const k = Math.floor(r() * (depth > 2 ? 4 : 6));
  if (k === 0) return [null, true, false][Math.floor(r() * 3)];
  if (k === 1) return Math.floor((r() - 0.5) * 2 ** (1 + Math.floor(r() * 53)));
  if (k <= 3) return str(r);
  if (k === 4) return Array.from({ length: Math.floor(r() * 5) }, () => value(r, depth + 1));
  /** @type {Record<string, unknown>} */
  const o = {};
  for (let n = Math.floor(r() * 5); n > 0; n--) o[str(r)] = value(r, depth + 1);
  return o;
}

const PIECES = ['<', '</script', '</SCRIPT>', '<!--', '-->', '\u2028', '\u2029', '"', '\\', '/', '\n', '\u0000', '\u001f', '\u007f', '\u00e4', '\u{1F600}', '\u{1F468}\u200d\u{1F469}', '\ufeff', 'a', ' ', 'key'];
/** @param {() => number} r */
function str(r) {
  let s = '';
  for (let n = Math.floor(r() * 6); n > 0; n--) {
    const cp = Math.floor(r() * 0x10f800);
    s += r() < 0.25 ? String.fromCodePoint(cp < 0xd800 ? cp : cp + 0x800) : PIECES[Math.floor(r() * PIECES.length)];
  }
  return s;
}

test('10 000 random values: canon(parse(canon(x))) === canon(x), HTML-safe, value preserved', () => {
  const r = prng(2028);
  for (let k = 0; k < 10000; k++) {
    const x = value(r, 0);
    const c = canon(x);
    assert.equal(canon(JSON.parse(c)), c);
    assert.deepEqual(JSON.parse(c), JSON.parse(JSON.stringify(x)));
    assert.doesNotMatch(c, /<\/script|<!--|[\u2028\u2029<]/i);
    // No whitespace outside string literals.
    assert.doesNotMatch(c.replace(/"(?:[^"\\]|\\.)*"/g, '""'), /\s/);
  }
});
