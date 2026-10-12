// Invariant checks I1-I8 of the measurement rig (test/rig/invariants.mjs) on
// synthetic snapshots: each check passes on a consistent snapshot, fails on a
// planted inconsistency and stays inactive while the API it needs is absent.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { parseLedger, replay } from '../../src/ledger.js';
import { stateHash } from '../../src/model.js';
import { checkAll, I1, I2, I2acrossTargets, I3, I4, I5, I6, I7, I8 } from '../rig/invariants.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const LEDGER = readFileSync(`${ROOT}test/fixtures/ledgers/en.jsonl`, 'utf8');
const EXPECTED = JSON.parse(readFileSync(`${ROOT}test/fixtures/ledgers/expected.json`, 'utf8'));
const STATE = replay(parseLedger(LEDGER).events).state;

const csp = (/** @type {string} */ s) => `sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}`;
/** A minimal document as toHTML() would return it. */
function html(script = 'webdoc();', style = 'p{margin:0}', ledgers = 1) {
  const led = '<script type="application/document-ledger" id="ledger">\n</script>'.repeat(ledgers);
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src '${csp(script)}'; style-src '${csp(style)}'"><style>${style}</style></head><body>${led}<script>${script}</script></body></html>`;
}

/** A consistent snapshot of "our" document holding the EN fixture. */
function snap() {
  const blocks = STATE.blocks.map((b) => ({ t: b.type, s: b.text, m: b.marks }));
  return {
    subject: 'ours',
    blocks: structuredClone(blocks),
    sel: { a: [1, 2], f: [1, 2] },
    composing: false,
    ghost: { html: '<div inert>…</div>', blocks: structuredClone(blocks) },
    guard: { foreign: [] },
    mutations: 3,
    api: { version: '0.1.0', state: structuredClone(STATE), hash: stateHash(STATE), ledger: LEDGER, selection: { a: [1, 2], f: [1, 2] }, html: html() },
  };
}

const status = (/** @type {{status: string}} */ c) => c.status;

describe('fixture sanity', () => {
  test('the EN fixture replays to its expected state hash', () => {
    assert.equal(stateHash(STATE), EXPECTED.en.state);
  });
});

describe('without the engine API every check is inactive', () => {
  test('a shell snapshot (only webdoc.version)', () => {
    const shell = { subject: 'ours', blocks: [], sel: null, composing: false, ghost: null, guard: null, api: { version: '0.0.0', has: {} } };
    assert.deepEqual(checkAll(shell).map(status), Array(8).fill('inactive'));
  });

  test('a consistent snapshot passes all eight', () => {
    assert.deepEqual(checkAll(snap(), { ref: { blocks: snap().blocks, sel: snap().sel }, plain: true, reloadHash: snap().api.hash }).map(status), Array(8).fill('pass'));
  });
});

describe('I1 projection = render(state)', () => {
  test('text, type and marks differences fail', () => {
    for (const mutate of [
      (/** @type {any} */ s) => { s.blocks[0].s += 'x'; },
      (/** @type {any} */ s) => { s.blocks[0].t = 'div'; },
      (/** @type {any} */ s) => { s.blocks[1].m = '1'; },
      (/** @type {any} */ s) => { s.blocks.pop(); },
    ]) {
      const s = snap();
      mutate(s);
      assert.equal(I1(s).status, 'fail');
    }
  });
  test('trailing zero mark digits are equal to none; composition makes it inactive', () => {
    const s = snap();
    s.blocks[0].m = `${s.blocks[0].m}000`;
    assert.equal(I1(s).status, 'pass');
    s.blocks[0].s += 'x';
    s.composing = true;
    assert.equal(I1(s).status, 'inactive');
  });
});

describe('I2 ghost = ghost(state)', () => {
  test('a ghost block that differs fails; no ghost element is inactive', () => {
    const s = snap();
    s.ghost.blocks[2].s = 'other';
    assert.equal(I2(s).status, 'fail');
    assert.equal(I2({ ...snap(), ghost: null }).status, 'inactive');
  });
  test('across targets: same state hash needs byte-identical ghost markup', () => {
    assert.equal(I2acrossTargets([{ target: 'chromium', hash: 'h1', ghost: '<p>a</p>' }, { target: 'webkit', hash: 'h1', ghost: '<p>a</p>' }, { target: 'firefox', hash: 'h2', ghost: '<p>b</p>' }]).status, 'pass');
    assert.equal(I2acrossTargets([{ target: 'chromium', hash: 'h1', ghost: '<p>a</p>' }, { target: 'webkit', hash: 'h1', ghost: '<p>a </p>' }]).status, 'fail');
    assert.equal(I2acrossTargets([]).status, 'inactive');
  });
});

describe('I3 replay(ledger) = live state', () => {
  test('a wrong live hash fails', () => {
    const s = snap();
    s.api.hash = EXPECTED.de.state;
    assert.equal(I3(s).status, 'fail');
  });
  test('a tampered ledger fails', () => {
    const s = snap();
    s.api.ledger = LEDGER.replace('"x":[{', '"x":[ {');
    assert.equal(I3(s).status, 'fail');
  });
  test('a state() that does not hash to hash() fails', () => {
    const s = snap();
    s.api.state.blocks[0].text += '!';
    assert.equal(I3(s).status, 'fail');
  });
});

describe('I4 text = model and = native', () => {
  test('differences to the native reference fail (text and caret)', () => {
    const ref = { blocks: snap().blocks, sel: snap().sel };
    const s = snap();
    s.api = /** @type {any} */ (null);
    assert.equal(I4(s, { ref, plain: true }).status, 'pass');
    assert.equal(I4({ ...s, sel: { a: [0, 0], f: [0, 0] } }, { ref, plain: true }).status, 'fail');
    assert.equal(I4({ ...s, blocks: [{ t: 'p', s: 'x' }] }, { ref, plain: true }).status, 'fail');
    // Not a plain-text scenario: the native comparison does not apply.
    assert.equal(I4(s, { ref, plain: false }).status, 'inactive');
  });
  test('projection text that differs from the replayed model fails', () => {
    const s = snap();
    s.blocks[3].s = 'changed';
    assert.equal(I4(s).status, 'fail');
  });
  test('the planted stub case: "ü" lost after Backspace', () => {
    const native = { blocks: [{ t: 'p', s: 'üb' }], sel: { a: [0, 1], f: [0, 1] } };
    const stub = { blocks: [{ t: 'p', s: 'b' }], sel: { a: [0, 0], f: [0, 0] } };
    assert.equal(I4(stub, { ref: native, plain: true }).status, 'fail');
  });
});

describe('I5 no foreign mutations', () => {
  test('a foreign mutation fails; the composing text node is allowlisted', () => {
    assert.equal(I5({ ...snap(), guard: { foreign: [{ type: 'characterData', composing: false }] } }).status, 'fail');
    assert.equal(I5({ ...snap(), guard: { foreign: [{ type: 'characterData', composing: true }] } }).status, 'pass');
    assert.equal(I5({ ...snap(), guard: null }).status, 'inactive');
  });
});

describe('I6 model selection = DOM selection, on grapheme boundaries', () => {
  test('different selections fail', () => {
    const s = snap();
    s.sel = { a: [1, 3], f: [1, 3] };
    assert.equal(I6(s).status, 'fail');
  });
  test('block ids are accepted in webdoc.selection()', () => {
    const s = snap();
    s.api.selection = { anchor: [STATE.blocks[1].id, 2], focus: [STATE.blocks[1].id, 2] };
    assert.equal(I6(s).status, 'pass');
  });
  test('an offset inside a ZWJ cluster or a surrogate pair fails', () => {
    const text = 'a\u{1F469}‍\u{1F469}‍\u{1F467}b';
    for (const o of [2, 3, 4]) {
      const s = snap();
      s.api.state = { ...s.api.state, blocks: [{ id: 'aaaaaa:1', type: 'p', text, marks: '' }] };
      s.api.selection = { a: [0, o], f: [0, o] };
      s.sel = { a: [0, o], f: [0, o] };
      assert.equal(I6(s).status, 'fail', `offset ${o}`);
    }
  });
});

describe('I7 serialize -> load', () => {
  test('ledger and engine script counts and CSP hashes are checked', () => {
    assert.equal(I7(snap()).status, 'pass');
    assert.equal(I7({ ...snap(), api: { ...snap().api, html: html('webdoc();', 'p{margin:0}', 2) } }).status, 'fail');
    assert.equal(I7({ ...snap(), api: { ...snap().api, html: html().replace('webdoc();</script>', 'webdoc(1);</script>') } }).status, 'fail');
    assert.equal(I7({ ...snap(), api: { ...snap().api, html: html().replace('p{margin:0}</style>', 'p{margin:1}</style>') } }).status, 'fail');
    assert.equal(I7({ ...snap(), api: { ...snap().api, html: html().replace('<script>', '<script>x();</script><script>') } }).status, 'fail');
  });
  test('the hash after reloading the serialized document must be equal', () => {
    assert.equal(I7(snap(), { reloadHash: snap().api.hash }).status, 'pass');
    assert.equal(I7(snap(), { reloadHash: EXPECTED.de.state }).status, 'fail');
  });
});

describe('I8 recomputed heads = stored heads', () => {
  test('a header with other heads fails, the empty ledger passes', () => {
    const [head, ...rest] = LEDGER.split('\n');
    const h = JSON.parse(head);
    const other = JSON.stringify({ ...h, heads: [EXPECTED.de.heads[0]] });
    assert.equal(I8(snap()).status, 'pass');
    assert.equal(I8({ ...snap(), api: { ...snap().api, ledger: [other, ...rest].join('\n') } }).status, 'fail');
    assert.equal(I8({ ...snap(), api: { ...snap().api, ledger: '' } }).status, 'pass');
  });
});
