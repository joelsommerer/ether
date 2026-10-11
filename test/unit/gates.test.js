// tools/gates.mjs: prints the G1-G12 table and fails on red or not-checked
// relevant gates (deliberately failing piece fixtures).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const ROOT = new URL('../../', import.meta.url).pathname;
const dist = mkdtempSync(join(tmpdir(), 'ether-gates-'));
after(() => rmSync(dist, { recursive: true, force: true }));

/** @param {string} fixture */
const gates = (fixture) => spawnSync(process.execPath, [
  'tools/gates.mjs', '--piece-file', `test/fixtures/gates/${fixture}`, '--dist-dir', dist,
], { cwd: ROOT, encoding: 'utf8' });

/** @param {string} out @param {string} gate */
const row = (out, gate) => out.split('\n').find((l) => l.startsWith(`${gate} `)) ?? '';

test('red and not-checked relevant gates make the run fail', () => {
  const r = gates('failing-piece.json');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  for (let g = 1; g <= 12; g++) assert.ok(row(r.stdout, `G${g}`), `row G${g} printed`);
  assert.match(row(r.stdout, 'G8'), /\bred\b/);
  assert.match(row(r.stdout, 'G5'), /\bnot-checked\b/);
  assert.match(row(r.stdout, 'G1'), /\bn\.a\.\s/);
  assert.match(r.stdout, /result: FAIL - red: G8 - not-checked: G5/);
});

test('a piece whose relevant gates are green passes', () => {
  const r = gates('passing-piece.json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(row(r.stdout, 'G8'), /\bgreen\b/);
  assert.match(r.stdout, /result: PASS/);
});
