// Measurement rig (piece E1-002): fuzz generator determinism, scenario DSL and
// corpus coverage, shrinker, the device-timeout grep check and the binary
// property-list codec of the iOS inspector client. The invariant
// checks have their own file (rig-invariants.test.js).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { checkScenario, checkStep, loadCorpus, MATRIX } from '../rig/dsl.mjs';
import { actionHash, generate, GENERATOR_SOURCE } from '../rig/fuzzgen.mjs';
import { ddmin, shrinkSteps } from '../rig/shrink.mjs';
import { sourcesUnder, untimedDeviceCalls } from '../rig/timeout-check.mjs';
import { bplistDecode, bplistEncode } from '../rig/drivers/wir.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;

describe('fuzz generator', () => {
  test('same seed, same action list; 50-200 steps; every step is valid DSL', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const a = generate(seed);
      assert.deepEqual(generate(seed), a);
      assert.ok(a.length >= 50 && a.length <= 200, `seed ${seed}: ${a.length} steps`);
      for (const s of a) assert.deepEqual(checkStep(s), [], JSON.stringify(s));
    }
  });

  test('different seeds give different lists', () => {
    const hashes = new Set(Array.from({ length: 500 }, (_, k) => actionHash(generate(k + 1))));
    assert.equal(hashes.size, 500);
  });

  test('the generator source is self-contained and reproduces the hash in a fresh realm', () => {
    // The rig evaluates GENERATOR_SOURCE inside every browser; a fresh V8
    // context without the module scope is the closest Node equivalent.
    const ctx = vm.createContext({});
    for (const seed of [1, 2, 99, 4294967295]) {
      const json = vm.runInContext(`JSON.stringify((${GENERATOR_SOURCE})(${seed}))`, ctx);
      assert.equal(createHash('sha256').update(json, 'utf8').digest('hex'), actionHash(generate(seed)));
    }
  });

  test('pinned digest: a change to the generator is visible (seed 1)', () => {
    // If this fails, the alphabet or the PRNG changed: every recorded seed
    // in test-results and regressions/ now means a different sequence.
    assert.equal(actionHash(generate(1)), '8681e229962867cef7c9321b78a97890069af2355c678198c3fa99b7dc99480a');
  });

  test('the weighted alphabet reaches every action kind (PHASE-1 section 5)', () => {
    const kinds = new Set();
    let text = '';
    for (let seed = 1; seed <= 200; seed++) {
      for (const s of generate(seed)) {
        kinds.add(Object.keys(s)[0] + (s.mods ? `+${s.mods.join('+')}` : '') + (s.shortcut ? `:${s.shortcut}` : ''));
        if (s.text) text += s.text;
      }
    }
    for (const k of ['text', 'key', 'key+Shift', 'key+Alt', 'key+Mod', 'select', 'shortcut:Mod+A', 'shortcut:Mod+B', 'shortcut:Mod+I', 'paste', 'undo', 'redo', 'compose']) {
      assert.ok(kinds.has(k), `kind ${k} never generated`);
    }
    for (const c of ['ü', '‍', '\u{1F1E8}', '漢', 'ภ', '́', '# ', '- ']) assert.ok(text.includes(c), `text never contains ${JSON.stringify(c)}`);
  });
});

describe('scenario DSL and corpus', () => {
  const { corpus, regressions } = loadCorpus(`${ROOT}test/scenarios`);

  test('at least 60 valid scenarios, unique ids', () => {
    assert.ok(corpus.length >= 60, `${corpus.length} scenarios`);
    assert.equal(new Set([...corpus, ...regressions].map((s) => s.id)).size, corpus.length + regressions.length);
  });

  test('every inputType of the Phase-1 matrix is covered by a scenario', () => {
    const covered = new Set(corpus.flatMap((s) => s.covers));
    assert.deepEqual(MATRIX.filter((t) => !covered.has(t)), []);
  });

  test('every step kind of the DSL is used', () => {
    const kinds = new Set(corpus.flatMap((s) => s.steps.map((/** @type {any} */ st) => Object.keys(st).find((k) => k !== 'mods' && k !== 'commit' && k !== 'note'))));
    for (const k of ['text', 'key', 'select', 'compose', 'paste', 'undo', 'redo', 'shortcut', 'click', 'tap', 'drag', 'wait']) assert.ok(kinds.has(k), k);
    const paths = corpus.some((s) => s.steps.some((/** @type {any} */ st) => st.select?.anchorPath));
    assert.ok(paths, 'a select by DOM path');
  });

  test('invalid scenarios and steps are rejected', () => {
    const ok = { id: 'x', title: 'x', tags: ['plain'], covers: ['insertText'], init: [{ t: 'p', s: '' }], steps: [{ text: 'a' }] };
    assert.deepEqual(checkScenario(ok), []);
    assert.notDeepEqual(checkScenario({ ...ok, id: 'Bad Id' }), []);
    assert.notDeepEqual(checkScenario({ ...ok, covers: ['insertHorizontalRule'] }), []);
    assert.notDeepEqual(checkScenario({ ...ok, init: [{ t: 'h4', s: '' }] }), []);
    assert.notDeepEqual(checkScenario({ ...ok, extra: 1 }), []);
    for (const bad of [{}, { text: '' }, { key: 'Fn' }, { key: 'a', mods: ['Hyper'] }, { text: 'a', key: 'b' }, { select: {} },
      { select: { anchor: [0] } }, { compose: ['a'] }, { paste: {} }, { undo: 1 }, { click: { x: 1 } }, { drag: { from: { x: 1, y: 1 } } },
      { wait: 9000 }, { shortcut: 'B' }]) {
      assert.notDeepEqual(checkStep(bad), [], JSON.stringify(bad));
    }
  });
});

describe('shrinker', () => {
  test('ddmin finds the 1-minimal failing subset', async () => {
    const items = Array.from({ length: 120 }, (_, k) => k);
    let runs = 0;
    const r = await ddmin(items, async (c) => { runs++; return c.includes(17) && c.includes(93); });
    assert.deepEqual(r, [17, 93]);
    assert.ok(runs < 200, `${runs} runs`);
  });

  test('shrinkSteps also shortens text steps grapheme by grapheme', async () => {
    const steps = [{ text: 'abc' }, { key: 'Enter' }, { text: 'xüy\u{1F469}‍\u{1F469}‍\u{1F467}' }, { key: 'Backspace' }, { undo: true }];
    const fails = async (/** @type {any[]} */ c) => c.some((s) => s.text?.includes('ü')) && c.some((s) => s.key === 'Backspace');
    const r = await shrinkSteps(steps, fails);
    assert.deepEqual(r.steps, [{ text: 'ü' }, { key: 'Backspace' }]);
  });

  test('a non-failing input stays as it is when nothing smaller fails', async () => {
    const r = await ddmin([1], async () => true);
    assert.deepEqual(r, [1]);
  });
});

describe('device calls have timeouts', () => {
  test('every simctl/adb/emulator/avdmanager call in tools/ and test/ goes through timed()', () => {
    // Excluded: the checker itself and this file, whose "not blind" test
    // below holds deliberately bad lines as data.
    const files = sourcesUnder(ROOT, ['tools', 'test']).filter((f) => f.file !== 'test/rig/timeout-check.mjs' && f.file !== 'test/unit/rig.test.js');
    assert.ok(files.some((f) => f.file === 'tools/devices.mjs'), 'devices.mjs scanned');
    assert.deepEqual(untimedDeviceCalls(files), []);
  });

  test('the check is not blind', () => {
    const bad = untimedDeviceCalls([{
      file: 'x.mjs',
      text: [
        "spawnSync('adb', ['devices']);",
        "execSync('xcrun simctl boot X');",
        'spawn(EMULATOR, []);',
        "timed(10, 'adb', ['devices']);",
        'const re = /simctl/.exec(s);',
        'async function emulatorWatchdog(s) {',
        '  spawn(EMULATOR, []);',
        '}',
      ].join('\n'),
    }]);
    assert.deepEqual(bad.map((b) => b.line), [1, 2, 3]);
  });
});

describe('binary property lists (iOS inspector client)', () => {
  test('round trip of the value kinds webinspectord uses', () => {
    const v = {
      __selector: '_rpc_forwardSocketData:',
      __argument: {
        WIRConnectionIdentifierKey: 'A1B2', WIRPageIdentifierKey: 7, big: 70000, huge: 2 ** 40, neg: -3, f: 1.5,
        t: true, n: false, z: null, s: 'Grüsse ü ✓', data: Buffer.from('{"id":1}'),
        list: Array.from({ length: 20 }, (_, i) => `item ${i}`),
      },
    };
    const back = bplistDecode(bplistEncode(v));
    assert.deepEqual({ ...back, __argument: { ...back.__argument, data: back.__argument.data.toString() } },
      { ...v, __argument: { ...v.__argument, data: '{"id":1}' } });
  });

  test('more than 255 objects switch to 2-byte references', () => {
    const v = { list: Array.from({ length: 400 }, (_, i) => i) };
    assert.deepEqual(bplistDecode(bplistEncode(v)), v);
  });

  test('header matches the bplist00 format', () => {
    assert.equal(bplistEncode({ a: 1 }).subarray(0, 8).toString('latin1'), 'bplist00');
    assert.throws(() => bplistDecode(Buffer.from('notaplist-------------------------------------')), /bad header/);
  });
});
