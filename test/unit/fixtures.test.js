// test/fixtures/ledgers: committed fixtures are reproducible, verify, replay to
// the recorded state hashes; the 10k-word fixture size is in the size log.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { stateHash } from '../../src/model.js';
import { parseLedger, replay } from '../../src/ledger.js';
import { DIR, NAMES, buildFixtures, expected } from '../../tools/fixtures.mjs';

const built = buildFixtures();
const want = JSON.parse(readFileSync(`${DIR}/expected.json`, 'utf8'));

test('the generator reproduces every committed fixture byte for byte', () => {
  assert.deepEqual(Object.keys(built), NAMES);
  for (const name of NAMES) assert.ok(readFileSync(`${DIR}/${name}.jsonl`, 'utf8') === built[name], `${name}.jsonl is stale (node tools/fixtures.mjs)`);
  assert.deepEqual(expected(built), want);
});

for (const name of NAMES) {
  test(`${name}: verifies and replays to the recorded state hash`, () => {
    const text = readFileSync(`${DIR}/${name}.jsonl`, 'utf8');
    const led = parseLedger(text);
    assert.equal(led.err, null);
    const { state, ro } = replay(led.events);
    assert.equal(ro, null);
    assert.equal(stateHash(state), want[name].state);
    assert.deepEqual(led.heads, want[name].heads);
    assert.equal(Buffer.byteLength(text), want[name].bytes);
    assert.doesNotMatch(text, /<\/script|<!--|[\u2028\u2029]/i, 'safe to embed in a <script> element');
  });
}

test('10k fixture: exactly 10 000 words, one event per word, bytes recorded in size-log.md', () => {
  assert.equal(want['10k'].words, 10000);
  assert.ok(want['10k'].events >= 10000);
  const log = readFileSync(new URL('../../docs/plan/size-log.md', import.meta.url), 'utf8');
  assert.match(log, new RegExp(`\\| 10k\\.jsonl \\| ${want['10k'].events} \\| ${want['10k'].bytes} \\|`));
});
