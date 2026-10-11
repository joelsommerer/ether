// Reference model (docs/SPEC.md §7, §8, §10): document state, the seven
// primitive ops, the validator, the pure reducer and op inverses. DOM-free and
// deterministic: no clock, no randomness, inputs are never mutated.
// Written compactly on purpose (7 KB core budget, the minifier never renames).
import { canon, fail, int, isObj } from './canon.js';
import { sha256 } from './sha256.js';

/**
 * marks: one digit per UTF-16 code unit of text, the bit set of the marks on
 * that unit (1 = b, 2 = i), trailing "0" digits removed ("" = no marks).
 * @typedef {{id: string, type: string, text: string, marks: string}} Block
 * @typedef {{doc: string | null, blocks: Block[], heads: string[], clock: number}} State
 * @typedef {Record<string, any>} Op
 * @typedef {{id: string, p: string[], a: string, c: number, t: number, x: Op[], d?: string, u?: string}} LedgerEvent
 */

/** Block types of format v0. */
export const TYPES = ['p', 'h1', 'h2', 'h3', 'li'];
/** Mark names of format v0; the mark at index k is bit 2^k of a mark digit. */
export const MARKS = ['b', 'i'];
/** State before the first event. */
export const EMPTY = Object.freeze({ doc: null, blocks: [], heads: [], clock: 0 });

/**
 * Field names per op; all are required except ins.m.
 * @type {Record<string, string>}
 */
const OPS = { blk: 'b after type', split: 'b o nb type', join: 'b', ins: 'b o s m', del: 'b o n', fmt: 'b o n m on', type: 'b type' };
/** Block id: actor, ":", counter from 1. */
const BID = /^[\dA-Za-z]{6,8}:[1-9]\d*$/;

/**
 * True when offset p of t lies between a high and a low surrogate
 * (0xfc00 = 64512, 0xd800 = 55296, 0xdc00 = 56320).
 * @param {string} t
 * @param {number} p
 */
const mid = (t, p) => (t.charCodeAt(p - 1) & 64512) == 55296 && (t.charCodeAt(p) & 64512) == 56320;

/** @param {string} m @param {number} L mark digits padded with "0" to length L */
const pad = (m, L) => m.padEnd(L, '0');
/**
 * Mark digits without trailing "0" (linear; /0+$/ backtracks quadratically).
 * @param {string} m
 */
const trim = m => m.slice(0, m.search(/[^0]0*$/) + 1);

/**
 * Heads after an event with id `id` and parents `p`: sorted ids.
 * @param {string[]} H heads before
 * @param {string[]} p
 * @param {string} id
 */
export const nextHeads = (H, p, id) => [...H.filter(h => !p.includes(h)), id].sort();

/**
 * Applies one op. Pure: returns a new state and never mutates `s`.
 * Validates first and throws an error code of docs/SPEC.md §8 (a string):
 *   shape, unknown, id, exists, after, block, first, range, surrogate, marks
 * @param {State} s
 * @param {Op} op
 * @returns {State}
 */
export function apply(s, op) {
  if (!isObj(op)) fail('shape');
  const { op: t, b, o, n, nb, s: S, type, m, on, after } = op, B = [...s.blocks], i = B.findIndex(x => x.id == b), k = B[i],
    f = Object.hasOwn(OPS, t) ? OPS[t].split(' ') : fail('unknown'), e = o + (n ?? 0), j = t == 'blk' ? B.findIndex(x => x.id == after) : 0;
  for (const q in op) if (q != 'op' && !f.includes(q)) fail('unknown');
  // Every field present (ins.m optional) with its type: o, n integers, on
  // boolean, after string or null, all others strings.
  for (const q of f) {
    if (q in op ? (q == 'on' ? typeof on != 'boolean' : /^[on]$/.test(q) ? !int(op[q]) : typeof (q == 'after' ? after ?? '' : op[q]) != 'string')
      : q != 'm' || t != 'ins') fail('shape');
  }
  if ('type' in op && !TYPES.includes(type) || t == 'fmt' && !MARKS.includes(m)) fail('unknown');
  // A new block id (b of blk, nb of split) is well-formed and unused.
  const id = t == 'blk' ? b : nb;
  if (id !== void 0) {
    if (!BID.test(id)) fail('id');
    if (B.some(x => x.id == id)) fail('exists');
  }
  // blk: after is null in an empty document, else an existing block; others: b exists.
  if (t == 'blk' ? after === null ? B.length : j < 0 : !k) fail(t == 'blk' && after === null ? 'after' : 'block');
  if (t == 'join' && !i) fail('first');
  // M: the block's mark digits, unpadded (positions past its end are "0").
  const T = k?.text, M = k?.marks, P = B[i - 1], bit = 1 << MARKS.indexOf(m);
  if ('o' in op) {
    if (o < 0 || e > T.length || n < 1 || S === '') fail('range');
    if (mid(T, o) || mid(T, e) || /\p{Cs}/u.test(S || '')) fail('surrogate');
  }
  if (t == 'ins' && 'm' in op) {
    // Mark digits of the inserted string: canonical (no trailing "0"), not longer
    // than the string, equal on both halves of a surrogate pair.
    if (!/^[0-3]*[1-3]$/.test(m) || m.length > S.length) fail('marks');
    const q = pad(m, S.length);
    if ([...q].some((c, p) => mid(S, p) && q[p - 1] != c)) fail('surrogate');
  }
  /**
   * Replaces [o, o + l) of the block with text x and mark digits y.
   * @param {string} x @param {string} y @param {number} l
   */
  const set = (x, y, l = n) => {
    B[i] = { ...k, text: T.slice(0, o) + x + T.slice(o + l), marks: trim(pad(M.slice(0, o), o) + y + M.slice(o + l)) };
  };
  // after null: j is -1 and the new block goes first.
  t == 'blk' ? B.splice(j + 1, 0, { id: b, type, text: '', marks: '' })
    : t == 'ins' ? set(S, pad(m || '', S.length), 0)
    : t == 'del' ? set('', '')
    : t == 'fmt' ? set(T.slice(o, e), [...pad(M.slice(o, e), n)].map(c => on ? +c | bit : +c & ~bit).join(''))
    : t == 'split' ? B.splice(i, 1, { ...k, text: T.slice(0, o), marks: trim(M.slice(0, o)) }, { id: nb, type, text: T.slice(o), marks: trim(M.slice(o)) })
    : t == 'join' ? B.splice(i - 1, 2, { ...P, text: P.text + T, marks: M ? pad(P.marks, P.text.length) + M : P.marks })
    : B[i] = { ...k, type };
  return { ...s, blocks: B };
}

/**
 * Validates one op against a state.
 * @param {unknown} op
 * @param {State} s
 * @returns {string | null} null or the error code apply() would throw
 */
export const validate = (op, s) => {
  try {
    apply(s, /** @type {Op} */ (op));
    return null;
  } catch (x) {
    return String(x);
  }
};

/**
 * Ops that undo `op` when applied to apply(s, op); `op` must be valid for `s`.
 * The genesis block (blk with after null) has no inverse: the returned join
 * fails validation ("first"), a document never returns to zero blocks.
 * @param {Op} op
 * @param {State} s state before op
 * @returns {Op[]}
 */
export function inverse(op, s) {
  const { op: t, b, o, n, m } = op, B = s.blocks, i = B.findIndex(x => x.id == b), k = B[i], P = B[i - 1],
    M = k && pad(k.marks, k.text.length), bit = 1 << MARKS.indexOf(m), q = M && trim(M.slice(o, o + n));
  /** @type {Op[]} */
  const r = [{ op: 'fmt', b, o, n, m, on: !1 }];
  // blk and split: join the new block (blk has no nb).
  if (t == 'blk' || t == 'split') return [{ op: 'join', b: op.nb || b }];
  if (t == 'join') return [{ op: 'split', b: P.id, o: P.text.length, nb: b, type: k.type }];
  if (t == 'ins') return [{ op: 'del', b, o, n: op.s.length }];
  if (t == 'del') return [{ op: 'ins', b, o, s: k.text.slice(o, o + n), ...q ? { m: q } : {} }];
  if (t == 'type') return [{ op: 'type', b, type: k.type }];
  // fmt: clear the range, then set the mark again on each run that had it.
  for (let j = o, l; j < o + n; j++) {
    if (+M[j] & bit) (l = r[r.length - 1]).on && l.o + l.n == j ? l.n++ : r.push({ op: 'fmt', b, o: j, n: 1, m, on: !0 });
  }
  return r;
}

/**
 * Applies a whole event atomically (all ops or none) and updates doc, heads
 * and clock. Throws like apply().
 * @param {State} s
 * @param {LedgerEvent} v event
 * @returns {State}
 */
export function applyEvent(s, v) {
  for (const op of v.x) s = apply(s, op);
  return { ...s, doc: v.d || s.doc, heads: nextHeads(s.heads, v.p, v.id), clock: Math.max(s.clock, v.c) };
}

/**
 * State hash: SHA-256 of the canonical JSON of {blocks, doc}. heads and clock
 * are bookkeeping and not part of it (docs/SPEC.md §10).
 * @param {State} s
 */
export const stateHash = s => sha256(canon({ blocks: s.blocks, doc: s.doc }));
