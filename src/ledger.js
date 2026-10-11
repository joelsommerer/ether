// Ledger core (docs/SPEC.md §3, §5, §6, §9): JSONL with a header line,
// expansion of implicit fields, event ids, chain and heads verification,
// deterministic topological replay, append and serialize. DOM-free; time and
// randomness are used only when an event or an id is created.
// Written compactly on purpose (7 KB core budget, the minifier never renames):
// l = ledger, e = event, v = previous event in file order, k = line index.
import { canon, fail, int, isObj } from './canon.js';
import { sha256 } from './sha256.js';
import { EMPTY, applyEvent, nextHeads } from './model.js';

/**
 * @typedef {import('./model.js').State} State
 * @typedef {import('./model.js').Op} Op
 * @typedef {import('./model.js').LedgerEvent} LedgerEvent
 * @typedef {{doc: string | null, heads: string[], clock: number, events: LedgerEvent[],
 *   err: {code: string, line: number} | null}} Ledger
 */

/** Format identifier of this version (header field fmt). */
export const FMT = 'webdoc/0';
const HEX = /^[\da-f]{64}$/, ACTOR = /^[\dA-Za-z]{6,8}$/, DOC_ID = /^[\dA-Za-z]{22}$/;

/** @param {RegExp} re @param {unknown} v */
const is = (re, v) => typeof v == 'string' && re.test(v);

/** Strictly ascending event ids. @param {unknown} v */
const ids = v => Array.isArray(v) && v.every((h, k) => is(HEX, h) && !(v[k - 1] >= h));

/**
 * Parses one stored line; it must be the canonical JSON of its own value.
 * @param {string} s
 * @returns {any}
 */
const line = (s, v = JSON.parse(s)) => canon(v) == s ? v : fail('canon');

/**
 * Values of p, a, c and t that a line following event `v` leaves out
 * (docs/SPEC.md §6.2); `v` is undefined for the first line.
 * @param {any} v
 * @returns {any}
 */
const implicit = v => ({ p: v ? [v.id] : [], a: v?.a, c: (v?.c ?? 0) + 1, t: v?.t });

/**
 * Stored (lean) line of event `e` that follows event `v` in the file: without
 * id, d and every field equal to its implicit value.
 * @param {any} e
 * @param {any} v
 */
const lean = (e, v) => {
  const o = { ...e }, D = implicit(v);
  delete o.id;
  delete o.d;
  for (const k in D) if (D[k] + '' == e[k]) delete o[k];
  return canon(o);
};

/**
 * Parses and verifies ledger text: header, canonical lines, implicit-field
 * expansion, event ids, parents, clocks and heads. On failure `err` holds the
 * first error code and its 0-based line (0 = header); `events` then holds the
 * events verified before that line.
 * @param {string} s ledger text
 * @returns {Ledger}
 */
export function parseLedger(s) {
  /** @type {Ledger} */
  const l = { doc: null, heads: [], clock: 0, events: [], err: null };
  // L lines, S id -> event, P ids that are parents
  const L = s.split('\n'), S = new Map(), P = new Set();
  /** @type {any} */
  let v, k = L.length - 1;
  if (s) try {
    if (L.pop()) fail('eol');
    k = 0;
    const h = line(L[0]);
    if (h?.fmt !== FMT) fail('fmt');
    if (h.enc != 'jsonl') fail('enc');
    if (Object.keys(h) + '' != 'doc,enc,fmt,heads' || !is(DOC_ID, h.doc) || !ids(h.heads)) fail('shape');
    l.doc = h.doc;
    for (k = 1; k < L.length; k++) {
      const o = line(L[k]);
      if (!isObj(o)) fail('shape');
      for (const f in o) if (!/^[acdptux]$/.test(f)) fail('unknown');
      /** @type {any} */
      const e = { ...implicit(v), ...o };
      // A malformed x (not an array of objects) ends here or as "parse".
      if (!ids(e.p) || !is(ACTOR, e.a) || !int(e.c) || e.c < 1 || !int(e.t) || e.t < 0 || !e.x[0] || !e.x.every(isObj)
        || 'u' in e && !is(HEX, e.u) || e.p[0] && 'd' in e) fail('shape');
      if (!e.p[0] && (e.d ??= h.doc) != h.doc) fail('doc');
      const id = sha256(canon(e));
      if (S.has(id)) fail('dup');
      for (const q of e.p) {
        if (!(S.get(q)?.c < e.c)) fail(S.has(q) ? 'clock' : 'parent');
        P.add(q);
      }
      S.set(id, v = { ...e, id });
      l.events.push(v);
      l.clock = Math.max(l.clock, e.c);
    }
    k = 0;
    if ((l.heads = [...S.keys()].filter(q => !P.has(q)).sort()) + '' != h.heads) fail('heads');
  } catch (x) {
    l.err = { code: typeof x == 'string' ? x : 'parse', line: k };
  }
  return l;
}

/**
 * Integrity check: null when the ledger text is valid, else {code, line}.
 * @param {string} s
 */
export const verifyLedger = s => parseLedger(s).err;

/**
 * Replay order: ascending (c, a, id). Every event's clock exceeds its
 * parents' clocks, so this is a topological order of the event DAG. A space
 * sorts below every base62 character, so "a id" compares like (a, id).
 * @param {LedgerEvent[]} E
 */
export const topo = E => [...E].sort((x, y) => x.c - y.c || (x.a + ' ' + x.id < y.a + ' ' + y.id ? -1 : 1));

/**
 * Replays verified events from the empty state. An event whose ops do not
 * validate (unknown op, conflict) stops the replay without throwing: `ro`
 * holds the error code and the event id, `state` the state before it.
 * @param {LedgerEvent[]} E
 * @returns {{state: State, ro: {code: string, id: string} | null}}
 */
export function replay(E) {
  /** @type {State} */
  let s = EMPTY, ro = null;
  for (const e of topo(E)) {
    try {
      s = applyEvent(s, e);
    } catch (x) {
      ro = { code: String(x), id: e.id };
      break;
    }
  }
  return { state: s, ro };
}

/**
 * n uniform base62 characters from crypto.getRandomValues (rejection sampling;
 * values 0-35 print as 0-9a-z, 36-61 as A-Z).
 * @param {number} n
 * @returns {string}
 */
const rnd = n => {
  let s = '';
  for (const c of crypto.getRandomValues(new Uint8Array(n * 2))) if (c < 248 && s.length < n) s += c % 62 < 36 ? (c % 62).toString(36) : String.fromCharCode(c % 62 + 29);
  return s.length < n ? rnd(n) : s;
};

/** New actor id for a session: 6 base62 characters. */
export const newActor = () => rnd(6);

/** New document id: 22 base62 characters (62^22 > 2^128). */
export const newDocId = () => rnd(22);

/**
 * Appends an event and returns its stored (lean) line. The caller validates
 * the ops against the current state first (applyEvent throws on invalid ops).
 * Defaults: p = current heads, c = clock + 1, t = now (unix seconds); the
 * first event of a ledger without doc id gets a fresh one. p and c may be
 * given explicitly (tooling and merges, Phase 6).
 * @param {Ledger} l mutated: doc, heads, clock, events
 * @param {{a: string, x: Op[], t?: number, u?: string, p?: string[], c?: number}} n new event
 * @returns {string}
 */
export function appendEvent(l, n) {
  const E = l.events, v = E.at(-1), p = [...n.p ?? l.heads].sort();
  /** @type {any} */
  const e = { p, a: n.a, c: n.c ?? l.clock + 1, t: n.t ?? Math.floor(Date.now() / 1e3), x: n.x };
  if (n.u) e.u = n.u;
  if (!p[0]) e.d = l.doc ??= newDocId();
  e.id = sha256(canon(e));
  E.push(e);
  l.heads = nextHeads(l.heads, p, e.id);
  l.clock = Math.max(l.clock, e.c);
  return lean(e, v);
}

/**
 * Ledger text: header line plus one lean line per event, each terminated by
 * "\n". A ledger without events serializes to the empty string.
 * @param {Ledger} l
 */
export const serializeLedger = l => l.events.length
  ? [canon({ doc: l.doc, enc: 'jsonl', fmt: FMT, heads: l.heads }), ...l.events.map((e, k) => lean(e, l.events[k - 1])), ''].join('\n') : '';
