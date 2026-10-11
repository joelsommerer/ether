// Seeded generator of valid random ops and events for the property tests.
import { MARKS, TYPES, apply } from '../../src/model.js';

/** @typedef {import('../../src/model.js').State} State */
/** @typedef {import('../../src/model.js').Op} Op */

/** Code points and clusters used for random text (surrogate pairs included). */
export const ALPHABET = ['a', 'b', 'Z', ' ', 'ä', 'ß', '<', '"', '\\', '\u2028', '\t', '漢', 'ไ', 'ש', 'e\u0301',
  '\u{1F600}', '\u{1F468}\u200d\u{1F469}\u200d\u{1F467}', '\u{1F1E8}\u{1F1ED}', '\u{1D518}'];

/**
 * @param {() => number} r
 * @param {number} n
 */
const int = (r, n) => Math.floor(r() * n);

/** @param {() => number} r */
export function randomText(r) {
  let s = '';
  for (let n = 1 + int(r, 4); n > 0; n--) s += ALPHABET[int(r, ALPHABET.length)];
  return s;
}

/**
 * Mark digits for s: one digit per code point (both halves of a pair equal),
 * trailing "0" removed; undefined when no marks.
 * @param {() => number} r
 * @param {string} s
 */
export function randomMarks(r, s) {
  if (r() < 0.6) return undefined;
  const m = [...s].map((c) => String(int(r, 4)).repeat(c.length)).join('').replace(/0+$/, '');
  return m || undefined;
}

/**
 * Random offset in t that does not split a surrogate pair.
 * @param {() => number} r
 * @param {string} t
 */
export function offset(r, t) {
  let p = int(r, t.length + 1);
  if (p > 0 && p < t.length && /[\ud800-\udbff]/.test(t[p - 1]) && /[\udc00-\udfff]/.test(t[p])) p--;
  return p;
}

/**
 * A random op that is valid for state s.
 * @param {() => number} r
 * @param {State} s
 * @param {() => string} newId fresh block ids
 * @returns {Op}
 */
export function randomOp(r, s, newId) {
  const B = s.blocks;
  const blk = B[int(r, B.length)];
  const t = blk.text;
  const kinds = ['ins', 'ins', 'ins', 'del', 'fmt', 'split', 'join', 'type', 'blk'];
  for (;;) {
    const kind = kinds[int(r, kinds.length)];
    if (kind === 'ins') {
      const s2 = randomText(r);
      const m = randomMarks(r, s2);
      return { op: 'ins', b: blk.id, o: offset(r, t), s: s2, ...(m ? { m } : {}) };
    }
    if ((kind === 'del' || kind === 'fmt') && t.length) {
      let a = offset(r, t);
      let e = offset(r, t);
      if (a > e) [a, e] = [e, a];
      if (a === e) continue;
      return kind === 'del' ? { op: 'del', b: blk.id, o: a, n: e - a }
        : { op: 'fmt', b: blk.id, o: a, n: e - a, m: MARKS[int(r, MARKS.length)], on: r() < 0.6 };
    }
    if (kind === 'split') return { op: 'split', b: blk.id, o: offset(r, t), nb: newId(), type: TYPES[int(r, TYPES.length)] };
    if (kind === 'join' && B.length > 1) return { op: 'join', b: B[1 + int(r, B.length - 1)].id };
    if (kind === 'type') return { op: 'type', b: blk.id, type: TYPES[int(r, TYPES.length)] };
    if (kind === 'blk') return { op: 'blk', b: newId(), after: blk.id, type: TYPES[int(r, TYPES.length)] };
  }
}

/**
 * A random event body (1-3 ops) valid for s.
 * @param {() => number} r
 * @param {State} s
 * @param {() => string} newId
 */
export function randomOps(r, s, newId) {
  /** @type {Op[]} */
  const ops = [];
  for (let n = 1 + int(r, 3); n > 0; n--) {
    const op = randomOp(r, s, newId);
    ops.push(op);
    s = apply(s, op);
  }
  return ops;
}
