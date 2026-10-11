// tools/hooks/commit-msg rejects AI trailers in a real (temporary) repository.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const HOOKS = new URL('../../tools/hooks', import.meta.url).pathname;
const repo = mkdtempSync(join(tmpdir(), 'ether-hook-'));
const git = (/** @type {string[]} */ ...args) => spawnSync('git', [
  '-c', 'user.name=Hook Test', '-c', 'user.email=hook@test.invalid', '-c', 'commit.gpgsign=false', ...args,
], { cwd: repo, encoding: 'utf8' });

before(() => {
  assert.equal(git('init', '-q').status, 0);
  assert.equal(git('config', 'core.hooksPath', HOOKS).status, 0);
  writeFileSync(join(repo, 'f.txt'), 'x');
  git('add', 'f.txt');
});
after(() => rmSync(repo, { recursive: true, force: true }));

test('rejects a commit containing "Co-Authored-By:"', () => {
  const r = git('commit', '-q', '-m', 'feat: add f\n\nCo-Authored-By: Someone <a@b.invalid>');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /forbidden trailer: Co-Authored-By/);
  assert.notEqual(git('rev-parse', '--verify', 'HEAD').status, 0, 'no commit was created');
});

test('rejects a commit containing "Generated with"', () => {
  const r = git('commit', '-q', '-m', 'feat: add f\n\nGenerated with some tool');
  assert.notEqual(r.status, 0);
});

test('accepts a clean Conventional Commit, and --range checks history', () => {
  const r = git('commit', '-q', '-m', 'feat: add f');
  assert.equal(r.status, 0, r.stderr);
  const range = spawnSync(process.execPath, [join(HOOKS, 'commit-msg'), '--range', 'HEAD'], { cwd: repo, encoding: 'utf8' });
  assert.equal(range.status, 0, range.stderr);
  writeFileSync(join(repo, 'g.txt'), 'y');
  git('add', 'g.txt');
  assert.equal(git('commit', '-q', '--no-verify', '-m', 'fix: g\n\nCo-authored-by: X <x@y.invalid>').status, 0);
  const bad = spawnSync(process.execPath, [join(HOOKS, 'commit-msg'), '--range', 'HEAD~1..HEAD'], { cwd: repo, encoding: 'utf8' });
  assert.equal(bad.status, 1);
});
