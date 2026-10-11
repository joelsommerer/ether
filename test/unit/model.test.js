// src/model.js: validator error codes, op semantics (examples of
// docs/SPEC.md §8), purity, inverses, determinism of the reducer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { EMPTY, apply, applyEvent, inverse, stateHash, validate } from '../../src/model.js';
import { prng } from '../../tools/fixtures.mjs';
import { randomOp } from '../helpers/ops.js';

/** @typedef {import('../../src/model.js').State} State */
/** @typedef {import('../../src/model.js').Op} Op */

/** @param {Op[]} ops @param {State} [s] */
const run = (ops, s = EMPTY) => ops.reduce(apply, s);

// "Hi 😀!" in block A, "Second" in block B.
const S0 = run([
  { op: 'blk', b: 'Actor1:1', after: null, type: 'p' },
  { op: 'ins', b: 'Actor1:1', o: 0, s: 'Hi \u{1F600}!' },
  { op: 'blk', b: 'Actor1:2', after: 'Actor1:1', type: 'h2' },
  { op: 'ins', b: 'Actor1:2', o: 0, s: 'Second' },
]);
const A = 'Actor1:1';
const B = 'Actor1:2';

describe('validator', () => {
  /** @param {Op} op @param {string|null} code */
  const is = (op, code) => assert.equal(validate(op, S0), code, JSON.stringify(op));

  test('offset beyond the block length → range', () => {
    is({ op: 'ins', b: A, o: 7, s: 'x' }, 'range');
    is({ op: 'ins', b: A, o: 6, s: 'x' }, null);
    is({ op: 'del', b: A, o: 5, n: 2 }, 'range');
    is({ op: 'del', b: A, o: -1, n: 1 }, 'range');
    is({ op: 'del', b: A, o: 0, n: 0 }, 'range');
    is({ op: 'fmt', b: A, o: 0, n: 7, m: 'b', on: true }, 'range');
    is({ op: 'split', b: A, o: 7, nb: 'Actor1:9', type: 'p' }, 'range');
    is({ op: 'ins', b: A, o: 0, s: '' }, 'range');
  });

  test('an op that splits a surrogate pair → surrogate', () => {
    // "Hi " is 3 units, the emoji occupies offsets 3-4.
    is({ op: 'ins', b: A, o: 4, s: 'x' }, 'surrogate');
    is({ op: 'del', b: A, o: 4, n: 1 }, 'surrogate');
    is({ op: 'del', b: A, o: 3, n: 1 }, 'surrogate');
    is({ op: 'del', b: A, o: 3, n: 2 }, null);
    is({ op: 'fmt', b: A, o: 0, n: 4, m: 'i', on: true }, 'surrogate');
    is({ op: 'split', b: A, o: 4, nb: 'Actor1:9', type: 'p' }, 'surrogate');
    is({ op: 'ins', b: A, o: 0, s: 'a\ud800' }, 'surrogate');
    is({ op: 'ins', b: A, o: 0, s: '\u{1F600}', m: '1' }, 'surrogate');
    is({ op: 'ins', b: A, o: 0, s: '\u{1F600}', m: '11' }, null);
  });

  test('unknown block id → block', () => {
    for (const op of [{ op: 'ins', b: 'Nobody:1', o: 0, s: 'x' }, { op: 'del', b: 'Nobody:1', o: 0, n: 1 }, { op: 'join', b: 'Nobody:1' },
      { op: 'split', b: 'Nobody:1', o: 0, nb: 'Actor1:9', type: 'p' }, { op: 'type', b: 'Nobody:1', type: 'h1' },
      { op: 'fmt', b: 'Nobody:1', o: 0, n: 1, m: 'b', on: true }, { op: 'blk', b: 'Actor1:9', after: 'Nobody:1', type: 'p' }]) is(op, 'block');
  });

  test('joining the first block → first', () => {
    is({ op: 'join', b: A }, 'first');
    is({ op: 'join', b: B }, null);
  });

  test('unknown or missing op name, unknown field, block type or mark → unknown', () => {
    is({ op: 'zap', b: A }, 'unknown');
    is({ op: 'toString', b: A }, 'unknown');
    is({ op: 'constructor' }, 'unknown');
    is({ b: A }, 'unknown');
    is({ op: 7, b: A }, 'unknown');
    is({ op: 'ins', b: A, o: 0, s: 'x', color: 'red' }, 'unknown');
    is({ op: 'type', b: A, type: 'h4' }, 'unknown');
    is({ op: 'fmt', b: A, o: 0, n: 1, m: 'u', on: true }, 'unknown');
  });

  test('malformed fields → shape; new ids → id/exists; blk placement → after', () => {
    for (const op of [null, 1, 'ins', [], { op: 'ins', b: A, o: '0', s: 'x' }, { op: 'ins', b: A, o: 0.5, s: 'x' }, { op: 'ins', b: A, o: 0, s: 1 },
      { op: 'ins', b: A, o: 0 }, { op: 'del', b: A, o: 0 }, { op: 'fmt', b: A, o: 0, n: 1, m: 'b', on: 1 }, { op: 'fmt', b: A, o: 0, n: 1, m: 'b' },
      { op: 'blk', b: 'Actor1:9', type: 'p' }, { op: 'blk', b: 'Actor1:9', after: 5, type: 'p' }, { op: 'join' }, { op: 'type', b: A, type: null }]) is(op, 'shape');
    is({ op: 'ins', b: A, o: 0, s: 'x', m: '10' }, 'marks');
    is({ op: 'ins', b: A, o: 0, s: 'x', m: '11' }, 'marks');
    is({ op: 'ins', b: A, o: 0, s: 'x', m: '4' }, 'marks');
    is({ op: 'ins', b: A, o: 0, s: 'xy', m: '01' }, null);
    is({ op: 'blk', b: 'bad id', after: A, type: 'p' }, 'id');
    is({ op: 'blk', b: 'Actor1:0', after: A, type: 'p' }, 'id');
    is({ op: 'blk', b: B, after: A, type: 'p' }, 'exists');
    is({ op: 'split', b: A, o: 0, nb: B, type: 'p' }, 'exists');
    is({ op: 'blk', b: 'Actor1:9', after: null, type: 'p' }, 'after');
    assert.equal(validate({ op: 'blk', b: 'Actor1:1', after: null, type: 'p' }, EMPTY), null);
  });

  test('apply throws the same code, never anything else', () => {
    assert.throws(() => apply(S0, { op: 'join', b: A }), (e) => e === 'first');
    assert.throws(() => apply(S0, { op: 'zap' }), (e) => e === 'unknown');
  });
});

describe('op semantics', () => {
  /** @param {State} s @param {string} id */
  const blk = (s, id) => s.blocks.find((x) => x.id === id);

  test('blk, split, join keep ids, order and types', () => {
    const s = run([{ op: 'split', b: A, o: 3, nb: 'Actor1:3', type: 'li' }, { op: 'blk', b: 'Actor1:4', after: A, type: 'h1' }], S0);
    assert.deepEqual(s.blocks.map((x) => [x.id, x.type, x.text]), [[A, 'p', 'Hi '], ['Actor1:4', 'h1', ''], ['Actor1:3', 'li', '\u{1F600}!'], [B, 'h2', 'Second']]);
    const j = run([{ op: 'join', b: 'Actor1:4' }, { op: 'join', b: 'Actor1:3' }], s);
    assert.deepEqual(j.blocks.map((x) => [x.id, x.type, x.text]), [[A, 'p', 'Hi \u{1F600}!'], [B, 'h2', 'Second']]);
  });

  test('marks: one digit per code unit, trailing zeros trimmed, inserted text carries exactly m', () => {
    let s = apply(S0, { op: 'fmt', b: B, o: 1, n: 3, m: 'b', on: true });
    assert.equal(blk(s, B)?.marks, '0111');
    s = apply(s, { op: 'fmt', b: B, o: 2, n: 4, m: 'i', on: true });
    assert.equal(blk(s, B)?.marks, '013322');
    s = apply(s, { op: 'ins', b: B, o: 2, s: 'XY' });
    assert.equal(blk(s, B)?.text, 'SeXYcond');
    assert.equal(blk(s, B)?.marks, '01003322');
    s = apply(s, { op: 'ins', b: B, o: 8, s: '!?', m: '2' });
    assert.equal(blk(s, B)?.marks, '010033222');
    assert.equal(blk(apply(s, { op: 'del', b: B, o: 4, n: 6 }), B)?.marks, '01');
    s = apply(s, { op: 'fmt', b: B, o: 0, n: 10, m: 'i', on: false });
    assert.equal(blk(s, B)?.marks, '010011');
    s = apply(s, { op: 'split', b: B, o: 4, nb: 'Actor1:5', type: 'p' });
    assert.deepEqual([blk(s, B)?.marks, blk(s, 'Actor1:5')?.marks], ['01', '11']);
    s = apply(s, { op: 'join', b: 'Actor1:5' });
    assert.equal(blk(s, B)?.marks, '010011');
  });

  test('pure: frozen inputs are never mutated', () => {
    /** @param {any} o @returns {any} */
    const freeze = (o) => (o && typeof o === 'object' ? Object.freeze(Object.values(o).forEach(freeze) ?? o) : o);
    let s = freeze(structuredClone(S0));
    const before = JSON.stringify(s);
    const r = prng(7);
    let n = 0;
    for (let k = 0; k < 500; k++) s = freeze(apply(s, freeze(randomOp(r, s, () => `Pure00:${++n}`))));
    assert.equal(JSON.stringify(freeze(structuredClone(S0))), before);
  });

  test('applyEvent: atomic, sets doc, heads and clock', () => {
    const ev = { id: 'f'.repeat(64), p: [], a: 'Actor1', c: 1, t: 0, d: 'D'.repeat(22), x: [{ op: 'blk', b: 'Actor1:1', after: null, type: 'p' }] };
    const s = applyEvent(EMPTY, ev);
    assert.deepEqual([s.doc, s.heads, s.clock], ['D'.repeat(22), ['f'.repeat(64)], 1]);
    const bad = { ...ev, id: 'e'.repeat(64), p: ['f'.repeat(64)], c: 2, x: [{ op: 'ins', b: 'Actor1:1', o: 0, s: 'ok' }, { op: 'join', b: 'Actor1:1' }] };
    assert.throws(() => applyEvent(s, bad), (e) => e === 'first');
    assert.equal(stateHash(s), stateHash(applyEvent(EMPTY, ev)));
  });
});

describe('inverse', () => {
  test('every op kind: inverse(op, s) applied after op restores the state hash (5 000 random ops)', () => {
    const r = prng(99);
    let s = S0;
    let n = 10;
    const seen = new Set();
    for (let k = 0; k < 5000; k++) {
      const op = randomOp(r, s, () => `Invers:${++n}`);
      const after = apply(s, op);
      const back = run(inverse(op, s), after);
      assert.equal(stateHash(back), stateHash(s), JSON.stringify(op));
      seen.add(op.op);
      s = after;
    }
    assert.deepEqual([...seen].sort(), ['blk', 'del', 'fmt', 'ins', 'join', 'split', 'type']);
  });

  test('the genesis block has no inverse (the join fails with first)', () => {
    const op = { op: 'blk', b: 'Actor1:1', after: null, type: 'p' };
    assert.throws(() => run(inverse(op, EMPTY), apply(EMPTY, op)), (e) => e === 'first');
  });
});

test('the reducer uses no clock and no randomness', () => {
  const src = readFileSync(new URL('../../src/model.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Date|Math\.random|crypto|performance/);
  const { now } = Date;
  const { random } = Math;
  Date.now = Math.random = () => { throw new Error('clock or randomness used'); };
  try {
    const r = prng(5);
    let s = S0;
    let n = 10;
    for (let k = 0; k < 200; k++) s = apply(s, randomOp(r, s, () => `Clock0:${++n}`));
  } finally {
    Date.now = now;
    Math.random = random;
  }
});
