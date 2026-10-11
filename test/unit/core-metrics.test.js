// Bar metrics of E1-003 (Node): SHA-256 throughput, replay time of 20 000
// events and the minified size of the core modules. Thresholds come from the
// piece definition (docs/plan/pieces/E1-003.json) and must not be relaxed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { sha256 } from '../../src/sha256.js';
import { parseLedger, replay } from '../../src/ledger.js';
import { stripModule } from '../../tools/build.mjs';
import { minifyJs } from '../../tools/minify.mjs';
import { wordsLedger } from '../../tools/fixtures.mjs';

/** Median of n timed runs in ms. @param {() => void} fn @param {number} n */
function median(fn, n) {
  const times = [];
  for (let k = 0; k < n; k++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  return times.sort((a, b) => a - b)[n >> 1];
}

test('SHA-256 >= 50 MB/s (1 MB = 2^20 bytes of UTF-8 input)', (t) => {
  const text = 'Gregor Samsa erwachte über Träumen \u{1F600} '.repeat(200000);
  const mb = Buffer.byteLength(text) / 2 ** 20;
  sha256(text);
  const ms = median(() => sha256(text), 5);
  const rate = mb / (ms / 1000);
  t.diagnostic(`sha256: ${mb.toFixed(1)} MB in ${ms.toFixed(1)} ms = ${rate.toFixed(0)} MB/s`);
  assert.ok(rate >= 50, `${rate.toFixed(1)} MB/s`);
});

test('replay of 20 000 events <= 100 ms', (t) => {
  const text = wordsLedger(19000, 'replay-20k');
  const led = parseLedger(text);
  assert.equal(led.err, null);
  const events = led.events.slice(0, 20000);
  assert.equal(events.length, 20000);
  assert.equal(replay(events).ro, null);
  const ms = median(() => replay(events), 5);
  const load = median(() => replay(parseLedger(text).events), 3);
  t.diagnostic(`replay 20000 events: ${ms.toFixed(1)} ms (median of 5); parse + verify + replay of ${led.events.length} events: ${load.toFixed(1)} ms`);
  assert.ok(ms <= 100, `${ms.toFixed(1)} ms`);
});

test('core (sha256, canon, model, ledger) <= 7 KB minified', (t) => {
  /** @type {Map<string, Set<string>>} */
  const exportsByModule = new Map();
  let bytes = 0;
  for (const name of ['sha256.js', 'canon.js', 'model.js', 'ledger.js']) {
    const code = readFileSync(new URL(`../../src/${name}`, import.meta.url), 'utf8');
    const n = Buffer.byteLength(minifyJs(stripModule(name, code, exportsByModule, new Map())));
    t.diagnostic(`${name}: ${n} B`);
    bytes += n;
  }
  t.diagnostic(`core: ${bytes} B of 7168 B`);
  assert.ok(bytes <= 7 * 1024, `${bytes} B`);
});
