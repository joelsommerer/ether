// src/ledger.js: 10 000 seeded random ledgers (deterministic replay, inverse,
// serialize -> parse), tamper detection, lean vs explicit storage, multi-parent
// DAG, unknown ops, error codes and id generation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { canon } from '../../src/canon.js';
import { EMPTY, apply, applyEvent, inverse, stateHash } from '../../src/model.js';
import { FMT, appendEvent, newActor, newDocId, parseLedger, replay, serializeLedger, topo, verifyLedger } from '../../src/ledger.js';
import { DIR, NAMES, prng } from '../../tools/fixtures.mjs';
import { randomOps } from '../helpers/ops.js';

/** @typedef {import('../../src/model.js').State} State */
/** @typedef {import('../../src/model.js').Op} Op */

const fixture = (/** @type {string} */ name) => readFileSync(`${DIR}/${name}.jsonl`, 'utf8');
const DOC = 'Doc0000000000000000001';

/**
 * Inverse of an op sequence: applied after `ops`, it restores `s`.
 * @param {Op[]} ops @param {State} s
 */
function invert(ops, s) {
  /** @type {Op[]} */
  const r = [];
  for (const op of ops) {
    r.unshift(...inverse(op, s));
    s = apply(s, op);
  }
  return r;
}

/**
 * Explicit storage of a parsed ledger: every event with all fields (p, a, c,
 * t, d), no implicit values.
 * @param {ReturnType<typeof parseLedger>} led
 * @param {any[]} [events] file order (default: as parsed)
 */
function explicit(led, events = led.events) {
  const lines = events.map(({ id: _id, ...e }) => canon(e));
  return [canon({ doc: led.doc, enc: 'jsonl', fmt: FMT, heads: led.heads }), ...lines, ''].join('\n');
}

describe('10 000 seeded random op sequences', () => {
  test('replay is deterministic, inverses restore the state hash, serialize → parse is identical', () => {
    const actors = ['Aaaaaa', 'Bbbbbbb', 'Cccccccc'];
    let opsTotal = 0;
    for (let seed = 1; seed <= 10000; seed++) {
      const r = prng(seed);
      const led = parseLedger('');
      led.doc = DOC;
      /** @type {Record<string, number>} */
      const count = {};
      let a = actors[0];
      const newId = () => `${a}:${(count[a] = (count[a] ?? 0) + 1)}`;
      let t = 1760198400;
      let s = /** @type {State} */ (EMPTY);
      appendEvent(led, { a, t, x: [{ op: 'blk', b: newId(), after: null, type: 'p' }] });
      s = applyEvent(s, /** @type {any} */ (led.events.at(-1)));
      const start = s;
      /** @type {Op[]} */
      const all = [];
      for (let n = 1 + Math.floor(r() * 8); n > 0; n--) {
        if (r() < 0.3) a = actors[Math.floor(r() * actors.length)];
        t += Math.floor(r() * 3);
        const x = randomOps(r, s, newId);
        const before = s;
        appendEvent(led, { a, t, x });
        s = applyEvent(s, /** @type {any} */ (led.events.at(-1)));
        // Event inverse restores the state before the event.
        assert.equal(stateHash(invert(x, before).reduce(apply, s)), stateHash(before), `seed ${seed}`);
        all.push(...x);
        opsTotal += x.length;
      }
      // Whole-sequence inverse restores the state after the genesis.
      assert.equal(stateHash(invert(all, start).reduce(apply, s)), stateHash(start), `seed ${seed}`);

      const text = serializeLedger(led);
      const p = parseLedger(text);
      assert.equal(p.err, null, `seed ${seed}`);
      const r1 = replay(p.events);
      const r2 = replay(parseLedger(text).events);
      assert.equal(r1.ro, null);
      assert.equal(stateHash(r1.state), stateHash(r2.state), `seed ${seed}: replay twice`);
      assert.equal(stateHash(r1.state), stateHash(s), `seed ${seed}: replay equals live state`);
      assert.deepEqual(r1.state.heads, led.heads);
      assert.equal(serializeLedger(p), text, `seed ${seed}: serialize → parse → serialize`);
      assert.deepEqual(p.events, led.events, `seed ${seed}: parsed events equal written events`);
    }
    assert.ok(opsTotal > 80000, `ops generated: ${opsTotal}`);
  });
});

describe('integrity', () => {
  /**
   * Replaces the code point at index k with a different one of the same kind
   * where possible (hex digit by hex digit, digit by digit, letter by letter).
   * @param {string[]} cps @param {number} k @param {() => number} r
   */
  function flip(cps, k, r) {
    const c = cps[k];
    const pool = /[0-9a-f]/.test(c) ? '0123456789abcdef' : /\d/.test(c) ? '0123456789' : /[A-Za-z]/.test(c)
      ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' : '{}[]":,\\ \n0aZ\u00e4\u{1F600}<';
    let d = c;
    while (d === c) d = [...pool][Math.floor(r() * [...pool].length)];
    const out = [...cps];
    out[k] = d;
    return out.join('');
  }

  for (const name of ['en', 'de', 'stress', 'dag', '10k']) {
    test(`${name}: flipping one character at 200 random positions always fails verify()`, () => {
      const text = name === '10k' ? fixture(name).split('\n').slice(0, 401).join('\n') : fixture(name);
      // The 10k fixture is cut to its first 400 events: the header heads then mismatch, so
      // rebuild a valid ledger from them first.
      const base = name === '10k' ? rebuild(text) : text;
      assert.equal(verifyLedger(base), null);
      const cps = [...base];
      const r = prng(name.length * 7919);
      for (let k = 0; k < 200; k++) {
        const pos = Math.floor(r() * cps.length);
        const err = verifyLedger(flip(cps, pos, r));
        assert.notEqual(err, null, `flip at code point ${pos} (${JSON.stringify(cps[pos])}) not detected`);
      }
    });
  }

  /** Valid ledger text from the event lines of `text` (recomputed heads). @param {string} text */
  function rebuild(text) {
    const lines = text.split('\n');
    const h = JSON.parse(lines[0]);
    const probe = parseLedger([canon({ ...h, heads: [] }), ...lines.slice(1), ''].join('\n'));
    assert.equal(probe.err?.code, 'heads');
    return [canon({ ...h, heads: probe.heads }), ...lines.slice(1), ''].join('\n');
  }

  test('error codes', () => {
    const text = fixture('en');
    const lines = text.split('\n');
    /** @param {string[]} ls */
    const code = (ls) => verifyLedger(ls.join('\n'))?.code;
    assert.equal(verifyLedger(text.slice(0, -1))?.code, 'eol');
    assert.equal(code([lines[0].replace(FMT, 'webdoc/1'), ...lines.slice(1)]), 'fmt');
    assert.equal(code([lines[0].replace('"jsonl"', '"deflate-raw+b64"'), ...lines.slice(1)]), 'enc');
    assert.equal(code([lines[0], lines[1].replace(/"t":/, ' "t":'), ...lines.slice(2)]), 'canon');
    const st = fixture('stress').split('\n');
    assert.ok(st[3].includes('\\u003c'));
    assert.equal(code([...st.slice(0, 3), st[3].replace('\\u003c', '\\u003C'), ...st.slice(4)]), 'canon');
    assert.equal(code([lines[0], lines[2], lines[1], ...lines.slice(3)]), 'shape');
    assert.equal(code([lines[0], ...lines.slice(1, 3), lines[2], ...lines.slice(3)]), 'heads');
    assert.equal(code([lines[0], ...lines.slice(1, -2), '']), 'heads');
    assert.equal(code([lines[0], '[]', ...lines.slice(2)]), 'shape');
    assert.equal(code([lines[0], '{x', ...lines.slice(2)]), 'parse');
    const led = parseLedger(text);
    const ev = led.events.map(({ id: _id, ...e }) => e);
    /** @param {(e: any[]) => void} edit */
    const explicitCode = (edit) => {
      const copy = structuredClone(ev);
      edit(copy);
      return verifyLedger([lines[0], ...copy.map((e) => canon(e)), ''].join('\n'))?.code;
    };
    assert.equal(explicitCode((e) => { e[1].p = ['0'.repeat(64)]; }), 'parent');
    assert.equal(explicitCode((e) => { e[1].c = 1; }), 'clock');
    assert.equal(explicitCode((e) => { e[0].d = 'X'.repeat(22); }), 'doc');
    assert.equal(explicitCode((e) => { e[1].d = led.doc; }), 'shape');
    assert.equal(explicitCode((e) => { e[1].a = 'too-long-actor'; }), 'shape');
    assert.equal(explicitCode((e) => { e[1].x = []; }), 'shape');
    assert.equal(explicitCode((e) => { e.splice(2, 0, structuredClone(e[1])); }), 'dup');
    assert.equal(explicitCode((e) => { e[1].id = 'x'; }), 'unknown');
    assert.equal(explicitCode((e) => { e[1].z = 1; }), 'unknown');
    assert.equal(explicitCode((e) => { e[1].u = 'x'; }), 'shape');
  });

  test('never throws: verify() returns an error for arbitrary text', () => {
    for (const s of ['x', '\n', '{}\n', 'null\n', '[]\n', '{"fmt":"webdoc/0"}\n', '\u{1F600}\n', '"\\ud800"\n']) {
      assert.notEqual(verifyLedger(s), null, JSON.stringify(s));
    }
  });
});

describe('storage', () => {
  test('empty ledger: empty text, empty state', () => {
    const led = parseLedger('');
    assert.equal(led.err, null);
    assert.deepEqual(replay(led.events), { state: EMPTY, ro: null });
    assert.equal(serializeLedger(led), '');
  });

  for (const name of NAMES.filter((n) => n !== 'empty')) {
    test(`${name}: fully explicit and lean storage yield identical ids, heads and state`, () => {
      const lean = parseLedger(fixture(name));
      const full = explicit(lean);
      assert.notEqual(full, fixture(name));
      assert.ok(full.length > fixture(name).length);
      const p = parseLedger(full);
      assert.equal(p.err, null);
      assert.deepEqual(p.events.map((e) => e.id), lean.events.map((e) => e.id));
      assert.deepEqual(p.heads, lean.heads);
      assert.equal(stateHash(replay(p.events).state), stateHash(replay(lean.events).state));
      // Re-serializing writes the lean form again.
      assert.equal(serializeLedger(p), fixture(name));
    });
  }

  test('appendEvent: genesis gets a fresh doc id, defaults for p, c, t; lean lines', () => {
    const led = parseLedger('');
    const line = appendEvent(led, { a: 'Writer', x: [{ op: 'blk', b: 'Writer:1', after: null, type: 'p' }] });
    assert.match(String(led.doc), /^[\dA-Za-z]{22}$/);
    const [e] = led.events;
    assert.deepEqual([e.p, e.c, e.d], [[], 1, led.doc]);
    assert.ok(Math.abs(e.t - Date.now() / 1000) < 5);
    assert.equal(line, canon({ a: 'Writer', t: e.t, x: e.x }));
    const l2 = appendEvent(led, { a: 'Writer', t: e.t, x: [{ op: 'ins', b: 'Writer:1', o: 0, s: 'Hi' }], u: e.id });
    assert.equal(l2, canon({ u: e.id, x: [{ op: 'ins', b: 'Writer:1', o: 0, s: 'Hi' }] }));
    assert.equal(parseLedger(serializeLedger(led)).err, null);
  });
});

describe('multi-parent DAG', () => {
  test('dag fixture parses, verifies and replays in deterministic topological order', () => {
    const led = parseLedger(fixture('dag'));
    assert.equal(led.err, null);
    assert.equal(led.heads.length, 2);
    assert.ok(led.events.some((e) => e.p.length === 2), 'a merge event with two parents');
    const order = topo(led.events);
    const pos = new Map(order.map((e, k) => [e.id, k]));
    for (const e of order) for (const q of e.p) assert.ok(/** @type {number} */ (pos.get(q)) < /** @type {number} */ (pos.get(e.id)), 'parent before child');
    // Concurrent events with equal clocks are ordered by actor.
    const c = order.map((e) => `${e.c}:${e.a}`);
    assert.deepEqual(c, [...c].sort((x, y) => Number(x.split(':')[0]) - Number(y.split(':')[0]) || (x < y ? -1 : 1)));
    const { state, ro } = replay(led.events);
    assert.equal(ro, null);
    assert.deepEqual(state.heads, led.heads);
    const want = JSON.parse(readFileSync(`${DIR}/expected.json`, 'utf8')).dag.state;
    assert.equal(stateHash(state), want);

    // Any other topological file order (stored explicitly) gives the same ids and state.
    const r = prng(6);
    for (let k = 0; k < 50; k++) {
      /** @type {any[]} */
      const left = [...led.events];
      /** @type {any[]} */
      const out = [];
      while (left.length) {
        const ready = left.filter((e) => e.p.every((/** @type {string} */ q) => out.some((o) => o.id === q)));
        const pick = ready[Math.floor(r() * ready.length)];
        out.push(pick);
        left.splice(left.indexOf(pick), 1);
      }
      const p = parseLedger(explicit(led, out));
      assert.equal(p.err, null);
      assert.deepEqual(p.events.map((e) => e.id).sort(), led.events.map((e) => e.id).sort());
      assert.equal(stateHash(replay(p.events).state), want);
    }
  });
});

describe('forward compatibility', () => {
  test('an unknown op makes the replay read-only instead of throwing', () => {
    const led = parseLedger(fixture('en'));
    const before = replay(led.events).state;
    appendEvent(led, { a: 'Future', t: 1760300000, x: [{ op: 'table', b: 'Future:1', rows: 2 }] });
    appendEvent(led, { a: 'Future', t: 1760300001, x: [{ op: 'type', b: before.blocks[0].id, type: 'h2' }] });
    const text = serializeLedger(led);
    const p = parseLedger(text);
    assert.equal(p.err, null, 'the chain itself is intact');
    const { state, ro } = replay(p.events);
    assert.deepEqual(ro, { code: 'unknown', id: p.events.at(-2)?.id });
    assert.equal(stateHash(state), stateHash(before), 'state before the unknown event');
  });

  test('an unknown event field or format version is reported, not thrown', () => {
    const lines = fixture('de').split('\n');
    assert.equal(verifyLedger([lines[0], canon({ ...JSON.parse(lines[1]), z: 1 }), ...lines.slice(2)].join('\n'))?.code, 'unknown');
    assert.equal(verifyLedger([lines[0].replace('webdoc/0', 'webdoc/1'), ...lines.slice(1)].join('\n'))?.code, 'fmt');
  });
});

describe('ids', () => {
  test('newActor: 6 base62 characters, newDocId: 22, uniform alphabet use', () => {
    /** @type {Record<string, number>} */
    const freq = {};
    for (let k = 0; k < 2000; k++) {
      const a = newActor();
      const d = newDocId();
      assert.match(a, /^[\dA-Za-z]{6}$/);
      assert.match(d, /^[\dA-Za-z]{22}$/);
      for (const ch of d) freq[ch] = (freq[ch] ?? 0) + 1;
    }
    assert.equal(Object.keys(freq).length, 62);
    // 44 000 characters: every one of the 62 should appear about 710 times.
    for (const [ch, n] of Object.entries(freq)) assert.ok(n > 550 && n < 880, `${ch}: ${n}`);
  });
});
