// tools/size.mjs: fails over the ceiling, passes under it, logs once.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const ROOT = new URL('../../', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'ether-size-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const file = join(dir, 'blank.html');
writeFileSync(file, '<!doctype html><title>x</title>');
const run = (/** @type {string[]} */ args) => spawnSync(process.execPath, ['tools/size.mjs', '--file', file, ...args], { cwd: ROOT, encoding: 'utf8' });

test('fails when the ceiling is exceeded (1-byte ceiling)', () => {
  const r = run(['--ceiling-bytes', '1', '--no-log']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /over by \d+ B/);
});

test('passes under the piece ceiling and appends one log row per change', () => {
  const log = join(dir, 'size-log.md');
  assert.equal(run(['--piece', 'E1-001', '--log', log]).status, 0);
  assert.equal(run(['--piece', 'E1-001', '--log', log]).status, 0);
  const rows = readFileSync(log, 'utf8').split('\n').filter((l) => l.includes('| E1-001 |'));
  assert.equal(rows.length, 1);
  assert.match(rows[0], /\| E1-001 \| 31 \| 2048 \| ok \|/);
});

test('exact ceiling passes', () => {
  assert.equal(run(['--ceiling-bytes', '31', '--no-log']).status, 0);
  assert.equal(run(['--ceiling-bytes', '30', '--no-log']).status, 1);
});
