// Measurement-rig runner (piece E1-002): executes scenario steps through a
// driver on a subject page and records a snapshot after every step.
//
// Subjects:
//   native   bench/oracle/native.html      bar B1, plain contenteditable
//   stub     bench/stubs/broken.html       planted bug (rig self-test)
//   pm       https://prosemirror.net/examples/basic/   bar B2 (recorder injected)
//   ours-*   dist/blank.html and dist/blank.dev.html over http and file:// (recorder injected)

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from '../../tools/serve.mjs';
import { checkAll, I4 } from './invariants.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const RECORDER = readFileSync(join(ROOT, 'bench/oracle/recorder.js'), 'utf8');
export const PM_URL = 'https://prosemirror.net/examples/basic/';
/** Starting content of every fuzz sequence (no "ü": the fuzzer has to type it). */
export const FUZZ_INIT = [
  { t: 'p', s: 'The quick brown fox' },
  { t: 'p', s: 'jumps over the lazy dog.' },
  { t: 'li', s: 'one' },
  { t: 'li', s: 'two' },
];

/** @param {number} ms */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts the static test server (tools/serve.mjs) on 127.0.0.1.
 * @param {number} port 0 = any free port
 */
export async function startServer(port) {
  const server = createServer();
  await new Promise((r, j) => {
    server.once('error', j);
    server.listen(port, '127.0.0.1', () => r(undefined));
  });
  const addr = server.address();
  const p = typeof addr === 'object' && addr ? addr.port : port;
  return {
    port: p,
    base: `http://127.0.0.1:${p}`,
    close: () => new Promise((r) => {
      server.close(() => r(undefined));
      server.closeAllConnections();
    }),
  };
}

/**
 * URLs of the subjects for a server base.
 * @param {string} base
 * @param {boolean} file whether file:// variants exist on this target
 */
export function subjectUrls(base, file) {
  /** @type {Record<string, string>} */
  const u = {
    native: `${base}/bench/oracle/native.html`,
    stub: `${base}/bench/stubs/broken.html`,
    pm: PM_URL,
    'ours-min-http': `${base}/dist/blank.html`,
    'ours-dev-http': `${base}/dist/blank.dev.html`,
  };
  if (file) {
    u['ours-min-file'] = pathToFileURL(join(ROOT, 'dist/blank.html')).href;
    u['ours-dev-file'] = pathToFileURL(join(ROOT, 'dist/blank.dev.html')).href;
  }
  return u;
}

/** @param {string[] | undefined} mods @param {string} platform */
export const resolveMods = (mods, platform) => (mods ?? []).map((m) => (m === 'Mod' ? (platform === 'android' ? 'Control' : 'Meta') : m));

/** Steps that need the driver's keyboard (paste uses Mod+V). */
const KEYBOARD_KINDS = ['text', 'key', 'shortcut', 'undo', 'redo', 'paste'];

/** @param {string} k */
const keyName = (k) => ([...k].length === 1 ? k.toLowerCase() : k);

const SNAPSHOT_FN = `async (settle) => {
  if (settle) await new Promise((r) => setTimeout(r, 0));
  return window.__rig.snapshot();
}`;

/**
 * Opens a subject page and makes sure the recorder is present.
 * @param {any} page @param {string} subject @param {Record<string, string>} urls
 */
export async function openSubject(page, subject, urls) {
  await page.goto(urls[subject]);
  if (subject === 'pm' || subject.startsWith('ours')) await page.inject(RECORDER);
  const sub = await page.eval('() => window.__rig ? window.__rig.subject() : null');
  if (!sub) throw new Error(`${subject}: recorder missing after load`);
  return sub;
}

/**
 * Executes one DSL step.
 * @param {any} page @param {string} platform @param {Record<string, any>} step
 * @returns {Promise<{status: 'ok'|'unsupported-by-driver'|'error', reason?: string}>}
 */
export async function execStep(page, platform, step) {
  const mod = platform === 'android' ? 'Control' : 'Meta';
  if (page.keyboardOk === false && KEYBOARD_KINDS.some((k) => k in step)) {
    return { status: 'unsupported-by-driver', reason: `keyboard probe failed on this target: ${page.keyboardDetail}` };
  }
  // A driver that delivers only some keys (iOS) says which; the others are
  // unsupported-by-driver instead of silent no-ops.
  /** @type {[string, string[]] | null} */
  let chord = null;
  if ('key' in step) chord = [keyName(step.key), resolveMods(step.mods, platform)];
  else if ('shortcut' in step) {
    const parts = step.shortcut.split('+');
    chord = [keyName(/** @type {string} */ (parts.pop())), resolveMods(parts, platform)];
  } else if ('undo' in step) chord = ['z', [mod]];
  else if ('redo' in step) chord = ['z', ['Shift', mod]];
  if (chord && page.canKey && !page.canKey(chord[0], chord[1])) {
    return { status: 'unsupported-by-driver', reason: `the driver cannot deliver ${[...chord[1], chord[0]].join('+')} on this target` };
  }
  try {
    if ('text' in step) await page.type(step.text);
    else if (chord) await page.press(chord[0], chord[1]);
    else if ('select' in step) {
      const r = await page.eval('(s) => window.__rig.select(s)', step.select);
      if (!r?.ok) return { status: 'error', reason: `select: ${r?.reason}` };
    } else if ('compose' in step) {
      if (!page.canCompose) return { status: 'unsupported-by-driver', reason: 'no IME automation on this target (composition needs CDP)' };
      await page.compose(step.compose, step.commit);
    } else if ('paste' in step) {
      if (!page.canPaste) return { status: 'unsupported-by-driver', reason: 'no clipboard access on this target' };
      const r = await page.paste(step.paste.text, step.paste.html, mod);
      if (!r.ok) return { status: r.unsupported ? 'unsupported-by-driver' : 'error', reason: r.reason };
    } else if ('click' in step || 'tap' in step) {
      const spec = step.click ?? step.tap;
      const pt = await page.eval('(s) => window.__rig.point(s)', spec);
      if (!pt) return { status: 'error', reason: 'no point for pointer step' };
      if ('tap' in step && page.canTouch) await page.tap(pt.x, pt.y);
      else await page.click(pt.x, pt.y);
      if (page.pointerSettleMs) await sleep(page.pointerSettleMs);
    } else if ('drag' in step) {
      if (!page.canDrag) return { status: 'unsupported-by-driver', reason: 'no mouse drag on this target' };
      const a = await page.eval('(s) => window.__rig.point(s)', step.drag.from);
      const b = await page.eval('(s) => window.__rig.point(s)', step.drag.to);
      if (!a || !b) return { status: 'error', reason: 'no point for drag step' };
      await page.drag(a.x, a.y, b.x, b.y);
      // A native drag always fires dragstart; without it the driver's mouse
      // drag did not reach the browser's drag machinery.
      const seen = await page.eval('() => window.__rig.peek()');
      if (!seen.includes('dragstart')) return { status: 'unsupported-by-driver', reason: 'the driver\'s mouse drag started no native drag (no dragstart)' };
    } else if ('wait' in step) await sleep(step.wait);
    else return { status: 'error', reason: `unknown step ${JSON.stringify(step)}` };
    return { status: 'ok' };
  } catch (e) {
    return { status: 'error', reason: e instanceof Error ? e.message.split('\n')[0] : String(e) };
  }
}

/**
 * Runs a step list from `init` on an already opened subject page.
 * @param {any} page @param {string} platform @param {{t: string, s: string, m?: string}[]} init
 * @param {Record<string, any>[]} steps
 * @param {{settle?: boolean, keepSnaps?: boolean, onStep?: (i: number, snap: any) => void}} [opt]
 */
export async function runSteps(page, platform, init, steps, opt = {}) {
  const settle = opt.settle ?? true;
  const reset = await page.eval('(b) => window.__rig.reset(b)', init);
  if (!reset?.ok) return { status: 'not-run', reason: reset?.reason ?? 'reset failed', steps: [] };
  // Android Chrome drops the first key events after a programmatic focus
  // until its input connection exists; the page reports no signal for it.
  if (page.focusSettleMs) await sleep(page.focusSettleMs);
  // iOS starts a text input session only for a focus caused by a user
  // gesture; script focus leaves every key event without a receiver. A real
  // tap at the reset caret focuses, then the reset caret is restored. Skipped
  // when the keyboard probe failed: the tap would serve no step.
  if (page.gestureFocus && reset.at && page.keyboardOk !== false) {
    const pt = await page.eval('(s) => window.__rig.point(s)', { at: reset.at });
    if (pt) {
      await page.tap(pt.x, pt.y);
      await sleep(page.pointerSettleMs ?? 0);
      await page.eval('(s) => window.__rig.select(s)', { anchor: reset.at });
    }
  }
  const initial = await page.eval(SNAPSHOT_FN, settle);
  /** @type {any[]} */
  const out = [];
  let unsupported = 0;
  let status = 'complete';
  for (let i = 0; i < steps.length; i++) {
    if (process.env.ETHER_RIG_DEBUG) console.error(`rig: step ${i} ${JSON.stringify(steps[i])}`);
    const r = await execStep(page, platform, steps[i]);
    if (r.status === 'unsupported-by-driver') unsupported++;
    if (r.status === 'error') {
      out.push({ i, step: steps[i], ...r, snap: null });
      status = 'error';
      break;
    }
    let snap;
    try {
      snap = await page.eval(SNAPSHOT_FN, settle);
    } catch (e) {
      out.push({ i, step: steps[i], status: 'error', reason: `snapshot: ${e instanceof Error ? e.message.split('\n')[0] : e}`, snap: null });
      status = 'error';
      break;
    }
    opt.onStep?.(i, snap);
    out.push({ i, step: steps[i], ...r, snap: opt.keepSnaps === false ? undefined : snap });
  }
  if (status === 'complete' && unsupported) status = 'incomplete';
  return { status, unsupported, initial, steps: out };
}

/**
 * Keyboard self-test of a driver: types "ab" into an empty native paragraph
 * and checks that the text arrived. A driver whose key events do not insert
 * text would otherwise make every typing step look executed.
 * @param {any} driver @param {Record<string, string>} urls
 * @returns {Promise<{ok: boolean, detail: string}>}
 */
export async function probeKeyboard(driver, urls) {
  const page = await driver.newPage();
  try {
    await openSubject(page, 'native', urls);
    const t = await runSteps(page, driver.platform, [{ t: 'p', s: '' }], [{ text: 'ab' }]);
    const s = t.steps[0]?.snap;
    const text = s?.blocks?.map((/** @type {any} */ b) => b.s).join('|');
    const keys = (s?.events ?? []).map((/** @type {any} */ e) => e.it ?? e.e).join(' ');
    return text === 'ab'
      ? { ok: true, detail: 'typed "ab" arrived' }
      : { ok: false, detail: `typed "ab" but the paragraph holds ${JSON.stringify(text)} (events: ${keys || 'none'})` };
  } catch (e) {
    return { ok: false, detail: `probe crashed: ${e instanceof Error ? e.message.split('\n')[0] : e}` };
  } finally {
    await page.close();
  }
}

/**
 * Probes one of our dist variants: load, recorder, snapshot, invariants.
 * Returns whether the engine exposes an editing surface; when it does, the
 * caller runs the scenarios on it like on any other subject.
 * @param {any} page @param {string} variant @param {Record<string, string>} urls
 */
export async function probeOurs(page, variant, urls) {
  try {
    await openSubject(page, variant, urls);
    const snap = await page.eval(SNAPSHOT_FN, true);
    const reset = await page.eval('(b) => window.__rig.reset(b)', [{ t: 'p', s: '' }]);
    const checks = checkAll(snap);
    return {
      variant,
      url: urls[variant],
      loaded: true,
      version: snap.api?.version ?? null,
      api: snap.api ? Object.keys(snap.api.has).filter((k) => snap.api.has[k]) : [],
      surface: !!reset?.ok,
      surfaceReason: reset?.ok ? null : reset?.reason,
      errors: snap.errors,
      checks,
    };
  } catch (e) {
    return { variant, url: urls[variant], loaded: false, error: e instanceof Error ? e.message.split('\n')[0] : String(e) };
  }
}

/**
 * Step-by-step differential of a candidate trace against a native trace
 * (I4, plain text + caret). Returns the first violation or null.
 * @param {any} cand @param {any} ref
 */
export function firstDivergence(cand, ref) {
  if (cand.status === 'not-run' || ref.status === 'not-run') return { step: -1, detail: 'not run' };
  const init = I4(cand.initial, { ref: ref.initial, plain: true });
  if (init.status === 'fail') return { step: -1, detail: init.detail };
  const n = Math.min(cand.steps.length, ref.steps.length);
  for (let i = 0; i < n; i++) {
    const a = cand.steps[i];
    const b = ref.steps[i];
    if (!a.snap || !b.snap) {
      if (a.status !== b.status) return { step: i, detail: `step status ${a.status} vs native ${b.status}` };
      continue;
    }
    const c = I4(a.snap, { ref: b.snap, plain: true });
    if (c.status === 'fail') return { step: i, detail: c.detail };
  }
  if (cand.steps.length !== ref.steps.length) return { step: n, detail: `trace length ${cand.steps.length} vs native ${ref.steps.length}` };
  return null;
}

/**
 * Simple worker pool.
 * @template T, R
 * @param {T[]} items @param {number} workers @param {(item: T, w: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function pool(items, workers, fn) {
  /** @type {R[]} */
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, items.length)) }, async (_, w) => {
    while (next < items.length) {
      const k = next++;
      out[k] = await fn(items[k], w);
    }
  }));
  return out;
}
