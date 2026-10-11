// tools/serve.mjs: serves dist/ and bench/ only, never outside them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, resolvePath } from '../../tools/serve.mjs';

test('maps only dist/ and bench/ paths', () => {
  assert.match(String(resolvePath('/dist/blank.html')), /\/dist\/blank\.html$/);
  assert.match(String(resolvePath('/bench/x/y.html?q=1')), /\/bench\/x\/y\.html$/);
  for (const p of ['/', '/package.json', '/src/main.js', '/dist/../package.json', '/%2e%2e/package.json', '/dist/%2e%2e/src/main.js', '/distx/a', '/dist/%00']) {
    assert.equal(resolvePath(p), null, p);
  }
});

test('answers 404 outside the served directories and 405 for POST', async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  try {
    const addr = server.address();
    const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
    assert.equal((await fetch(`${base}/package.json`)).status, 404);
    assert.equal((await fetch(`${base}/dist/blank.html`, { method: 'POST' })).status, 405);
  } finally {
    await new Promise((r) => server.close(() => r(undefined)));
  }
});
