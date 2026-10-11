// docs/SPEC.md: the examples, hashes and fixture table in the specification
// agree with the reference model, so the document cannot drift from the code.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { canon } from '../../src/canon.js';
import { EMPTY, apply, stateHash } from '../../src/model.js';
import { parseLedger, replay } from '../../src/ledger.js';
import { DIR } from '../../tools/fixtures.mjs';

const spec = readFileSync(new URL('../../docs/SPEC.md', import.meta.url), 'utf8');
const blocks = [...spec.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);

test('§3/§15 example ledger: ids, heads and state hash as stated', () => {
  const text = blocks.find((b) => b.startsWith('{"doc":'));
  assert.ok(text);
  const led = parseLedger(text);
  assert.equal(led.err, null);
  for (const e of led.events) assert.ok(spec.includes(e.id), `id ${e.id} stated in SPEC`);
  const { state, ro } = replay(led.events);
  assert.equal(ro, null);
  const { id: _id, ...second } = led.events[1];
  assert.ok(spec.includes(canon(second)), 'expanded line 2 (§6.3)');
  const c = canon({ blocks: state.blocks, doc: state.doc });
  assert.ok(blocks.some((b) => b.trim() === c), 'state JSON (§15)');
  assert.match(spec, new RegExp(`state hash \`${stateHash(state)}\``));
  assert.ok(spec.includes(stateHash(EMPTY)));
});

test('§8.2 example table: text and marks after each op', () => {
  const rows = spec.split('\n').filter((l) => /^\| (then )?`\{"b":"k7Qx2m:/.test(l));
  assert.equal(rows.length, 7);
  let s = apply(apply(EMPTY, { op: 'blk', b: 'k7Qx2m:1', after: null, type: 'p' }), { op: 'ins', b: 'k7Qx2m:1', o: 0, s: 'Second' });
  for (const row of rows) {
    const [, op, text, marks] = /`(\{.*\})` \| (.*) \| (.*) \|$/.exec(row) ?? [];
    s = apply(s, JSON.parse(op));
    const texts = [...text.matchAll(/`([^`]*)`/g)].map((m) => m[1]);
    const mk = [...marks.matchAll(/`([^`]*)`/g)].map((m) => m[1]);
    const shown = texts.length === 2 ? s.blocks.slice(0, 2) : [s.blocks.find((b) => b.id === 'k7Qx2m:1')];
    assert.deepEqual(shown.map((b) => b?.text), texts, row);
    assert.deepEqual(shown.map((b) => b?.marks), mk, row);
  }
});

test('§14 fixture table matches expected.json', () => {
  const want = JSON.parse(readFileSync(`${DIR}/expected.json`, 'utf8'));
  for (const [name, e] of Object.entries(want)) {
    const row = spec.split('\n').find((l) => l.startsWith(`| \`${name}.jsonl\``));
    assert.ok(row, name);
    const cells = row.split(' | ');
    assert.equal(Number(cells[2].replace(/\s/g, '')), e.events, `${name} events`);
    assert.equal(Number(cells[3].replace(/\s/g, '')), e.bytes, `${name} bytes`);
    assert.ok(row.includes(e.state), `${name} state hash`);
  }
});
