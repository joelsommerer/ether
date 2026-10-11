// src/sha256.js: NIST vectors, equality with node:crypto on padding
// boundaries and 10 000 random strings (incl. non-BMP), robust constants.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { sha256 } from '../../src/sha256.js';
import { prng } from '../../tools/fixtures.mjs';

/** @param {string} s */
const ref = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// FIPS 180-2 Appendix B / NIST CAVP SHA-256 short and long message examples.
const NIST = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ['abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu', 'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1'],
  ['a'.repeat(1000000), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'],
];

test('NIST vectors', () => {
  for (const [msg, digest] of NIST) assert.equal(sha256(msg), digest, `length ${msg.length}`);
});

test('equals node:crypto on every length 0..300 (padding boundaries 55/56/63/64/119/120)', () => {
  for (let n = 0; n <= 300; n++) {
    const s = 'x'.repeat(n);
    assert.equal(sha256(s), ref(s), `length ${n}`);
  }
});

test('equals node:crypto on 10 000 random strings incl. non-BMP characters', () => {
  const r = prng(256);
  const pool = ['a', 'Z', '0', ' ', '\n', '"', '\\', '<', 'ä', 'ß', '\u2028', '€', '漢', 'ไ', 'ש', '\ufeff', '\u{1F600}', '\u{1F468}\u200d\u{1F469}', '\u{1F1E8}\u{1F1ED}', '\u{10FFFF}', 'e\u0301'];
  for (let k = 0; k < 10000; k++) {
    let s = '';
    const len = Math.floor(r() * (k % 10 === 0 ? 400 : 60));
    for (let i = 0; i < len; i++) {
      // Uniform over all Unicode scalar values (the surrogate range is skipped).
      const cp = Math.floor(r() * 0x10f800);
      s += r() < 0.3 ? String.fromCodePoint(cp < 0xd800 ? cp : cp + 0x800) : pool[Math.floor(r() * pool.length)];
    }
    assert.equal(sha256(s), ref(s), JSON.stringify(s));
  }
});

test('round constants: every scaled root is more than 1e-4 from an integer', () => {
  // Same derivation as src/sha256.js; the margin makes a last-bit difference in
  // an engine's Math.sqrt/Math.cbrt irrelevant for the truncated 32-bit word.
  const primes = [];
  for (let p = 2; primes.length < 64; p++) if (primes.every((q) => p % q)) primes.push(p);
  for (const [k, p] of primes.entries()) {
    for (const x of k < 8 ? [Math.sqrt(p), Math.cbrt(p)] : [Math.cbrt(p)]) {
      const scaled = (x % 1) * 2 ** 32;
      const margin = Math.min(scaled - Math.floor(scaled), Math.ceil(scaled) - scaled);
      assert.ok(margin > 1e-4, `prime ${p}: margin ${margin}`);
    }
  }
});
