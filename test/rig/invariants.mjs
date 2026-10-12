// Invariants I1-I8 (PHASE-1.md section 5) as pure functions over recorder
// snapshots (bench/oracle/recorder.js). Documented in test/README.md.
//
// Every check returns {id, status, detail} with status
//   "pass"      the invariant was evaluated and holds
//   "fail"      it was evaluated and is violated
//   "inactive"  the engine does not expose what the check needs yet
//               (e.g. no webdoc.state() before E1-005); never counted as pass
// Engine-dependent checks activate on their own once the API exists.

import { createHash } from 'node:crypto';
import { parseLedger, replay } from '../../src/ledger.js';
import { stateHash } from '../../src/model.js';

/** @typedef {{id: string, status: 'pass'|'fail'|'inactive', detail: string}} Check */
/** @typedef {{t: string, s: string, m?: string}} SnapBlock */
/** @typedef {{a: number[], f: number[]} | {outside: true} | null} SnapSel */

/** @param {string} id @param {string} detail @returns {Check} */
const inactive = (id, detail) => ({ id, status: 'inactive', detail });
/** @param {string} id @param {string} detail @returns {Check} */
const pass = (id, detail) => ({ id, status: 'pass', detail });
/** @param {string} id @param {string} detail @returns {Check} */
const fail = (id, detail) => ({ id, status: 'fail', detail });

/** @param {string | undefined} m mark digits without trailing zeros */
const trimMarks = (m) => (m ?? '').replace(/0+$/, '');

/**
 * First difference between two block lists (type, text, marks), or null.
 * @param {SnapBlock[]} got @param {{type: string, text: string, marks: string}[]} want
 */
function blockDiff(got, want) {
  if (got.length !== want.length) return `${got.length} blocks, state has ${want.length}`;
  for (let i = 0; i < got.length; i++) {
    const g = got[i];
    const w = want[i];
    if (g.t !== w.type) return `block ${i}: type ${g.t} != ${w.type}`;
    if (g.s !== w.text) return `block ${i}: text ${JSON.stringify(g.s)} != ${JSON.stringify(w.text)}`;
    if (trimMarks(g.m) !== trimMarks(w.marks)) return `block ${i}: marks ${g.m} != ${w.marks}`;
  }
  return null;
}

/**
 * I1: outside a composition the projection equals render(state). The rig
 * compares the projection's semantic content (block type, text, marks) with
 * the state; the markup itself is covered by I2 and the snapshot shape.
 * @param {any} snap
 * @returns {Check}
 */
export function I1(snap) {
  const st = snap?.api?.state;
  if (!st) return inactive('I1', 'webdoc.state() not available');
  if (snap.composing) return inactive('I1', 'composition active');
  const d = blockDiff(snap.blocks ?? [], st.blocks);
  return d ? fail('I1', `projection != state: ${d}`) : pass('I1', `${st.blocks.length} blocks equal`);
}

/**
 * I2: the ghost DOM equals ghost(state) (semantic content).
 * @param {any} snap
 * @returns {Check}
 */
export function I2(snap) {
  const st = snap?.api?.state;
  if (!st) return inactive('I2', 'webdoc.state() not available');
  if (!snap.ghost) return inactive('I2', 'no ghost element ([inert]) in the document');
  const d = blockDiff(snap.ghost.blocks, st.blocks);
  return d ? fail('I2', `ghost != state: ${d}`) : pass('I2', `${st.blocks.length} ghost blocks equal`);
}

/**
 * I2 across targets: the same state hash gives byte-identical ghost markup.
 * @param {{target: string, hash: string, ghost: string}[]} entries
 * @returns {Check}
 */
export function I2acrossTargets(entries) {
  const usable = entries.filter((e) => e.hash && typeof e.ghost === 'string');
  if (!usable.length) return inactive('I2', 'no ghost markup recorded');
  /** @type {Map<string, {target: string, ghost: string}>} */
  const first = new Map();
  for (const e of usable) {
    const f = first.get(e.hash);
    if (!f) first.set(e.hash, e);
    else if (f.ghost !== e.ghost) return fail('I2', `state ${e.hash.slice(0, 12)}: ghost markup differs between ${f.target} and ${e.target}`);
  }
  return pass('I2', `${usable.length} ghost(s) over ${first.size} state(s) byte-identical`);
}

/**
 * I3: replay(ledger) equals the live state (state hash).
 * @param {any} snap
 * @returns {Check}
 */
export function I3(snap) {
  const api = snap?.api;
  if (!api || typeof api.ledger !== 'string' || typeof api.hash !== 'string') return inactive('I3', 'webdoc.ledger()/hash() not available');
  const led = parseLedger(api.ledger);
  if (led.err) return fail('I3', `ledger does not verify: ${led.err.code} at line ${led.err.line}`);
  const { state, ro } = replay(led.events);
  if (ro) return fail('I3', `replay stopped: ${ro.code} at ${ro.id}`);
  const h = stateHash(state);
  if (h !== api.hash) return fail('I3', `replay hash ${h.slice(0, 12)} != live hash ${api.hash.slice(0, 12)}`);
  if (api.state && stateHash(api.state) !== api.hash) return fail('I3', 'webdoc.state() does not hash to webdoc.hash()');
  return pass('I3', `replay of ${led.events.length} events = ${h.slice(0, 12)}`);
}

/** @param {SnapSel} sel */
const selKey = (sel) => (sel && 'a' in sel ? `${sel.a}|${sel.f}` : JSON.stringify(sel));

/**
 * I4: the text equals the reference model applied to the logical ops and,
 * for plain-text scenarios, the native contenteditable result (text + caret)
 * of the same browser at the same step.
 * @param {any} snap candidate (ours, or the planted stub)
 * @param {{ref?: any, plain?: boolean}} [ctx] ref = native snapshot at the same step
 * @returns {Check}
 */
export function I4(snap, ctx = {}) {
  const parts = [];
  const api = snap?.api;
  if (api && typeof api.ledger === 'string') {
    const led = parseLedger(api.ledger);
    if (!led.err) {
      const text = replay(led.events).state.blocks.map((b) => b.text);
      const got = (snap.blocks ?? []).map((/** @type {SnapBlock} */ b) => b.s);
      if (JSON.stringify(text) !== JSON.stringify(got)) return fail('I4', `text ${JSON.stringify(got)} != model ${JSON.stringify(text)}`);
      parts.push('model');
    }
  }
  if (ctx.ref && ctx.plain) {
    const got = (snap.blocks ?? []).map((/** @type {SnapBlock} */ b) => b.s);
    const want = (ctx.ref.blocks ?? []).map((/** @type {SnapBlock} */ b) => b.s);
    if (JSON.stringify(got) !== JSON.stringify(want)) return fail('I4', `text ${JSON.stringify(got)} != native ${JSON.stringify(want)}`);
    if (selKey(snap.sel) !== selKey(ctx.ref.sel)) return fail('I4', `caret ${selKey(snap.sel)} != native ${selKey(ctx.ref.sel)}`);
    parts.push('native');
  }
  return parts.length ? pass('I4', `equals ${parts.join(' + ')}`) : inactive('I4', 'no ledger and no native reference for this step');
}

/**
 * I5: zero mutations not issued by the renderer (composition allowlisted).
 * Needs the renderer's own account of its mutations (snap.guard), which the
 * projection provides from E1-007 on.
 * @param {any} snap
 * @returns {Check}
 */
export function I5(snap) {
  const g = snap?.guard;
  if (!g) return inactive('I5', 'no renderer/guard information in the document yet');
  const foreign = (g.foreign ?? []).filter((/** @type {any} */ m) => !m.composing);
  return foreign.length ? fail('I5', `${foreign.length} foreign mutation(s)`) : pass('I5', `0 foreign mutations (${snap.mutations ?? 0} observed)`);
}

/** @param {string} s */
function graphemeBounds(s) {
  const b = new Set([0, s.length]);
  for (const g of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)) b.add(g.index);
  return b;
}

/**
 * Normalizes webdoc.selection() to {a: [b, o], f: [b, o]} with block indices.
 * Accepts {a, f}, {anchor, focus} as [index, offset] or [blockId, offset].
 * @param {any} sel @param {{id?: string}[]} blocks
 */
function normSel(sel, blocks) {
  if (!sel) return null;
  const a = sel.a ?? sel.anchor;
  const f = sel.f ?? sel.focus ?? a;
  /** @param {any} p */
  const idx = (p) => (Array.isArray(p) ? [typeof p[0] === 'string' ? blocks.findIndex((b) => b.id === p[0]) : p[0], p[1]] : null);
  const A = idx(a);
  const F = idx(f);
  return A && F ? { a: A, f: F } : null;
}

/**
 * I6: model selection equals the mapped DOM selection, never inside a
 * surrogate pair or grapheme cluster.
 * @param {any} snap
 * @returns {Check}
 */
export function I6(snap) {
  const api = snap?.api;
  if (!api || !('selection' in api) || !api.state) return inactive('I6', 'webdoc.selection()/state() not available');
  const model = normSel(api.selection, api.state.blocks);
  const dom = snap.sel && 'a' in snap.sel ? snap.sel : null;
  if (selKey(model) !== selKey(dom)) return fail('I6', `model ${selKey(model)} != DOM ${selKey(dom)}`);
  if (model) {
    for (const [b, o] of [model.a, model.f]) {
      const text = api.state.blocks[b]?.text ?? '';
      if (!graphemeBounds(text).has(o)) return fail('I6', `offset ${o} in block ${b} is inside a grapheme cluster`);
    }
  }
  return pass('I6', `selection ${selKey(model)}`);
}

/** @param {string} s */
const cspHash = (s) => `sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}`;

/**
 * I7: serialize -> load gives the same state hash; the HTML keeps one ledger
 * script, one engine script and valid CSP hashes.
 * @param {any} snap
 * @param {{reloadHash?: string}} [ctx] hash after loading webdoc.toHTML() in a fresh page
 * @returns {Check}
 */
export function I7(snap, ctx = {}) {
  const html = snap?.api?.html;
  if (typeof html !== 'string') return inactive('I7', 'webdoc.toHTML() not available');
  const ledgers = html.match(/<script type="application\/document-ledger"[^>]*>/g) ?? [];
  if (ledgers.length !== 1) return fail('I7', `${ledgers.length} ledger scripts`);
  const engines = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (engines.length !== 1) return fail('I7', `${engines.length} engine scripts`);
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1] ?? '';
  if (!csp.includes(`'${cspHash(engines[0][1])}'`)) return fail('I7', 'CSP script hash does not match the engine script');
  for (const st of styles) if (!csp.includes(`'${cspHash(st[1])}'`)) return fail('I7', 'CSP style hash does not match');
  if (ctx.reloadHash !== undefined && ctx.reloadHash !== snap.api.hash) return fail('I7', `reloaded hash ${ctx.reloadHash} != ${snap.api.hash}`);
  return pass('I7', `1 ledger, 1 engine script, CSP hashes valid${ctx.reloadHash !== undefined ? ', reload hash equal' : ''}`);
}

/**
 * I8: recomputed chain heads equal the stored heads.
 * @param {any} snap
 * @returns {Check}
 */
export function I8(snap) {
  const text = snap?.api?.ledger;
  if (typeof text !== 'string') return inactive('I8', 'webdoc.ledger() not available');
  const led = parseLedger(text);
  if (led.err) return fail('I8', `ledger error ${led.err.code} at line ${led.err.line}`);
  return pass('I8', `heads ${led.heads.map((h) => h.slice(0, 12)).join(',') || '(empty ledger)'}`);
}

/**
 * All per-snapshot checks.
 * @param {any} snap
 * @param {{ref?: any, plain?: boolean, reloadHash?: string}} [ctx]
 * @returns {Check[]}
 */
export function checkAll(snap, ctx = {}) {
  return [I1(snap), I2(snap), I3(snap), I4(snap, ctx), I5(snap), I6(snap), I7(snap, ctx), I8(snap)];
}
