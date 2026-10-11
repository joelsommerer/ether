// Fixture ledgers for format v0 (docs/SPEC.md §13). Node built-ins only.
//
//   node tools/fixtures.mjs           write test/fixtures/ledgers/*.jsonl and expected.json
//   node tools/fixtures.mjs --check   exit 1 if the committed files differ from a fresh build
//
// Every fixture is generated deterministically through the reference model
// (src/model.js, src/ledger.js): fixed doc ids, actors and timestamps, a seeded
// PRNG, word-level events as the editor writes them (PHASE-1.md D14). The text
// excerpts are public domain: W. Strunk Jr., "The Elements of Style" (1918) and
// F. Kafka, "Die Verwandlung" (1915).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/sha256.js';
import { EMPTY, applyEvent, stateHash } from '../src/model.js';
import { appendEvent, parseLedger, replay, serializeLedger } from '../src/ledger.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DIR = join(ROOT, 'test/fixtures/ledgers');
export const NAMES = ['empty', 'en', 'de', 'stress', '10k', 'dag'];
const T0 = 1760198400; // 2025-10-11T16:00:00Z

/**
 * Seeded PRNG (mulberry32): returns floats in [0, 1).
 * @param {number} seed
 */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/**
 * Deterministic base62 id of length n derived from a label.
 * @param {string} label
 * @param {number} n
 */
const fixedId = (label, n) => [...sha256(label).slice(0, 2 * n).matchAll(/../g)].map((h) => B62[parseInt(h[0], 16) % 62]).join('');

/** Writes events like the editor would: one actor, word-level events. */
export class Writer {
  /**
   * @param {string} name fixture name (seeds ids and PRNG)
   * @param {number} [seed]
   */
  constructor(name, seed = 1) {
    this.led = parseLedger('');
    this.led.doc = fixedId(`doc:${name}`, 22);
    this.state = EMPTY;
    this.actor = fixedId(`actor:${name}`, 6);
    /** @type {Record<string, number>} next block counter per actor */
    this.count = {};
    this.t = T0;
    this.rand = prng(seed);
    /** @type {string | null} current block */
    this.cur = null;
  }

  /** New block id for the current actor. */
  nextId() {
    this.count[this.actor] = (this.count[this.actor] ?? 0) + 1;
    return `${this.actor}:${this.count[this.actor]}`;
  }

  /**
   * Appends one event and applies it (applyEvent validates every op).
   * @param {any[]} x
   * @param {number} [dt] seconds since the previous event
   */
  ev(x, dt = Math.floor(this.rand() * 3)) {
    this.t += dt;
    appendEvent(this.led, { a: this.actor, t: this.t, x });
    this.state = applyEvent(this.state, /** @type {any} */ (this.led.events.at(-1)));
  }

  /** @param {string} [b] */
  block(b = /** @type {string} */ (this.cur)) {
    const blk = this.state.blocks.find((x) => x.id === b);
    if (!blk) throw new Error(`no block ${b}`);
    return blk;
  }

  /**
   * Starts the document (genesis) or a new block after the current one
   * (Enter at the end of the block).
   * @param {string} type
   */
  start(type) {
    const id = this.nextId();
    if (this.cur === null) this.ev([{ op: 'blk', b: id, after: null, type }], 0);
    else this.ev([{ op: 'split', b: this.cur, o: this.block().text.length, nb: id, type }]);
    this.cur = id;
    return id;
  }

  /**
   * Types text into the current block, one event per word (with its trailing
   * whitespace). `marks` is the mark digit of the typed words ("" = none).
   * @param {string} text
   * @param {string} [marks]
   */
  type(text, marks = '') {
    for (const [w] of text.matchAll(/\s*\S+\s*/gu)) {
      const op = { op: 'ins', b: this.cur, o: this.block().text.length, s: w };
      const word = w.replace(/\s+$/u, '');
      if (marks) Object.assign(op, { m: marks.repeat(word.length).replace(/0+$/, '') });
      this.ev([op]);
    }
  }

  /**
   * Applies a mark to the first occurrence of `needle` in block b.
   * @param {string} b
   * @param {string} needle
   * @param {string} m
   * @param {boolean} [on]
   */
  mark(b, needle, m, on = true) {
    const o = this.block(b).text.indexOf(needle);
    if (o < 0) throw new Error(`"${needle}" not in ${b}`);
    this.ev([{ op: 'fmt', b, o, n: needle.length, m, on }]);
  }

  text() {
    return serializeLedger(this.led);
  }
}

function en() {
  const w = new Writer('en', 11);
  w.start('h1');
  w.type('The Elements of Style');
  w.start('h2');
  w.type('I. Introductory');
  w.start('p');
  w.type('This book is intended for use in English courses in which the practice of composition is combined with the study of literature. It aims to give in brief space the principal requirements of plain English style.');
  w.start('h2');
  w.type('II. Elementary Rules of Usage');
  w.start('h3');
  w.type('1. Form the possessive singular of nouns by adding ’s.');
  const p1 = w.start('p');
  w.type('Follow this rule whatever the final consonant. Thus write, Charles’s friend, Burns’s poems, the witch’s malice.');
  w.mark(p1, 'Charles’s friend', 'i');
  w.start('h3');
  w.type('13. Omit needles');
  // A typo, corrected word by word as a writer would: backspace, retype.
  const h = w.block();
  w.ev([{ op: 'del', b: h.id, o: h.text.length - 7, n: 7 }]);
  w.type('needless words.');
  const p2 = w.start('p');
  w.type('Vigorous writing is concise.', '1');
  w.type(' A sentence should contain no unnecessary words, a paragraph no unnecessary sentences, for the same reason that a drawing should have no unnecessary lines and a machine no unnecessary parts.');
  w.mark(p2, 'unnecessary parts', 'i');
  w.mark(p2, 'concise', 'i');
  for (const item of ['the question as to whether → whether', 'there is no doubt but that → no doubt (doubtless)', 'used for fuel purposes → used for fuel', 'he is a man who → he']) {
    w.start('li');
    w.type(item);
  }
  // Enter on the empty last item turns it into a paragraph, as in the editor.
  const last = w.start('li');
  w.ev([{ op: 'type', b: last, type: 'p' }]);
  w.type('Many a “the fact that” can be removed.');
  return w.text();
}

function de() {
  const w = new Writer('de', 22);
  w.start('h1');
  w.type('Die Verwandlung');
  w.start('h2');
  w.type('I');
  const p1 = w.start('p');
  w.type('Als Gregor Samsa eines Morgens aus unruhigen Träumen erwachte, fand er sich in seinem Bett zu einem ungeheueren Ungeziefer verwandelt. Er lag auf seinem panzerartig harten Rücken und sah, wenn er den Kopf ein wenig hob, seinen gewölbten, braunen, von bogenförmigen Versteifungen geteilten Bauch, auf dessen Höhe sich die Bettdecke, zum gänzlichen Niedergleiten bereit, kaum noch erhalten konnte. Seine vielen, im Vergleich zu seinem sonstigen Umfang kläglich dünnen Beine flimmerten ihm hilflos vor den Augen.');
  w.mark(p1, 'Ungeziefer', 'i');
  const p2 = w.start('p');
  w.type('»Was ist mit mir geschehen?« dachte er. Es war kein Traum. Sein Zimmer, ein richtiges, nur etwas zu kleines Menschenzimmer, lag ruhig zwischen den vier wohlbekannten Wänden.');
  w.mark(p2, 'Es war kein Traum.', 'b');
  w.mark(p2, 'Traum', 'i');
  w.mark(p2, 'Es war ', 'b', false);
  // Split a paragraph in the middle (Enter inside text) and join it back.
  const o = w.block(p2).text.indexOf(' Sein Zimmer');
  const nb = w.nextId();
  w.ev([{ op: 'split', b: p2, o: o + 1, nb, type: 'p' }]);
  w.ev([{ op: 'del', b: p2, o, n: 1 }, { op: 'join', b: nb }, { op: 'ins', b: p2, o, s: ' ' }]);
  w.cur = p2;
  const p3 = w.start('p');
  w.type('Über der Kommode hing ein Bild, Grüße aus der Straße, äußerst schön gerahmt.');
  w.ev([{ op: 'type', b: p3, type: 'li' }]);
  return w.text();
}

function stress() {
  const w = new Writer('stress', 33);
  w.start('h1');
  w.type('Stress </script> <!-- --> & "quotes" \\ back\\slash </SCRIPT');
  const p1 = w.start('p');
  w.type('Family \u{1F468}\u200d\u{1F469}\u200d\u{1F467}\u200d\u{1F466} flags \u{1F1E8}\u{1F1ED}\u{1F1E9}\u{1F1EA} thumbs \u{1F44D}\u{1F3FD} combining e\u0301 A\u030a');
  // Bold the family emoji (11 code units), then delete the thumbs emoji with its modifier (4 units).
  w.mark(p1, '\u{1F468}\u200d\u{1F469}\u200d\u{1F467}\u200d\u{1F466}', 'b');
  const t = w.block(p1).text;
  w.ev([{ op: 'del', b: p1, o: t.indexOf('\u{1F44D}'), n: 4 }]);
  const p2 = w.start('p');
  w.type('CJK 漢字かな交じり文 한국어 Thai ภาษาไทย');
  w.mark(p2, '漢字', 'i');
  w.start('p');
  w.type('RTL: مرحبا بالعالم and שלום עולם');
  const p4 = w.start('p');
  w.ev([{ op: 'ins', b: p4, o: 0, s: 'Separators:\u2028line\u2029para\ttab\u00a0nbsp \u{1D518}\u{1D51E}\u{1D52F} \ufeffbom' }]);
  // Mixed marks on an inserted string, the way a paste of formatted text arrives.
  w.ev([{ op: 'ins', b: p4, o: 0, s: '\u{1F600}xy', m: '3312' }]);
  // Split right after the first emoji pair (a code-point boundary).
  const nb = w.nextId();
  w.ev([{ op: 'split', b: p4, o: 2, nb, type: 'li' }]);
  w.ev([{ op: 'fmt', b: nb, o: 0, n: 1, m: 'b', on: false }]);
  return w.text();
}

const VOCAB = ('the of and to in a is that for it as was with be by on not he this are or his from at which but have an they '
  + 'you were her she there would their we him been has when who will more no if out so said what up its about into than them can only '
  + 'Haus und der die das nicht ist zu mit sich auf für über schön grösser Mädchen Straße Käse ähnlich '
  + 'writing sentence paragraph word style rule English concise vigorous needless clear plain brief composition').split(' ');

/**
 * A generated document of exactly `words` words, one event per word, with
 * headings, lists, formatting and corrections.
 * @param {number} words
 * @param {string} [name]
 */
export function wordsLedger(words, name = '10k') {
  const w = new Writer(name, 44);
  const r = w.rand;
  const pick = () => VOCAB[Math.floor(r() * VOCAB.length)];
  let left = words;
  w.start('h1');
  w.type('Generated Document');
  left -= 2;
  let para = 0;
  while (left > 0) {
    para++;
    if (para % 12 === 1) {
      w.start('h2');
      const n = Math.min(left, 2 + Math.floor(r() * 3));
      w.type(Array.from({ length: n }, pick).join(' '));
      left -= n;
      continue;
    }
    const list = para % 7 === 0;
    const len = Math.min(left, list ? 6 + Math.floor(r() * 6) : 40 + Math.floor(r() * 80));
    w.start(list ? 'li' : 'p');
    for (let k = 0; k < len; k++) {
      const word = pick() + (k === len - 1 ? '.' : r() < 0.08 ? ',' : '');
      const b = w.block();
      if (r() < 0.02) {
        // Typo then correction: type, delete the word, retype.
        const typo = `${word}x `;
        w.ev([{ op: 'ins', b: b.id, o: b.text.length, s: typo }]);
        w.ev([{ op: 'del', b: b.id, o: w.block().text.length - typo.length, n: typo.length }]);
      }
      const o = w.block().text.length;
      const s = k === len - 1 ? word : `${word} `;
      const bold = r() < 0.01;
      w.ev([{ op: 'ins', b: b.id, o, s, ...(bold ? { m: '1'.repeat(word.length) } : {}) }]);
      if (r() < 0.005) w.ev([{ op: 'fmt', b: b.id, o, n: word.length, m: 'i', on: true }]);
    }
    left -= len;
  }
  return w.text();
}

/** Two actors fork, merge (two parents) and fork again: two heads at the end. */
function dag() {
  const A = new Writer('dag', 55);
  A.start('h1');
  A.type('Merge-ready ledger');
  const pa = A.start('p');
  A.type('Paragraph of actor A.');
  const B = fixedId('actor:dag-b', 6);
  const led = A.led;
  // Branch point: the current head.
  const fork = led.heads[0];
  const c0 = led.clock;
  // Actor B, concurrently: a new block after the heading, typed in two events.
  const h1 = A.state.blocks[0].id;
  appendEvent(led, { a: B, t: A.t + 5, p: [fork], c: c0 + 1, x: [{ op: 'blk', b: `${B}:1`, after: h1, type: 'p' }, { op: 'ins', b: `${B}:1`, o: 0, s: 'Inserted by B ' }] });
  const b1 = led.events.at(-1)?.id;
  appendEvent(led, { a: B, t: A.t + 6, p: [/** @type {string} */ (b1)], c: c0 + 2, x: [{ op: 'ins', b: `${B}:1`, o: 14, s: 'concurrently.' }] });
  const bTip = /** @type {string} */ (led.events.at(-1)?.id);
  // Actor A continues on its own branch (same clocks as B: tiebreak by actor).
  appendEvent(led, { a: A.actor, t: A.t + 7, p: [fork], c: c0 + 1, x: [{ op: 'fmt', b: pa, o: 13, n: 7, m: 'b', on: true }] });
  const aTip = /** @type {string} */ (led.events.at(-1)?.id);
  // Merge event with two parents.
  appendEvent(led, { a: A.actor, t: A.t + 9, p: [aTip, bTip], c: c0 + 3, x: [{ op: 'type', b: `${B}:1`, type: 'h2' }] });
  const merge = /** @type {string} */ (led.events.at(-1)?.id);
  // Fork again from the merge: both stay heads.
  appendEvent(led, { a: B, t: A.t + 12, p: [merge], c: c0 + 4, x: [{ op: 'ins', b: pa, o: 0, s: '§ ' }] });
  appendEvent(led, { a: A.actor, t: A.t + 13, p: [merge], c: c0 + 4, x: [{ op: 'ins', b: h1, o: 18, s: ' (v0)' }] });
  return serializeLedger(led);
}

/** @returns {Record<string, string>} fixture name -> ledger text */
export function buildFixtures() {
  return { empty: '', en: en(), de: de(), stress: stress(), '10k': wordsLedger(10000), dag: dag() };
}

/**
 * Expected values per fixture, computed with the reference model.
 * @param {Record<string, string>} fx
 */
export function expected(fx) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [name, text] of Object.entries(fx)) {
    const led = parseLedger(text);
    if (led.err) throw new Error(`${name}: ${JSON.stringify(led.err)}`);
    const { state, ro } = replay(led.events);
    if (ro) throw new Error(`${name}: read-only ${JSON.stringify(ro)}`);
    const words = state.blocks.map((b) => b.text.split(/\s+/u).filter(Boolean).length).reduce((a, b) => a + b, 0);
    out[name] = { bytes: Buffer.byteLength(text), events: led.events.length, blocks: state.blocks.length, words, heads: led.heads, state: stateHash(state) };
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fx = buildFixtures();
  const exp = `${JSON.stringify(expected(fx), null, 2)}\n`;
  const files = { ...Object.fromEntries(Object.entries(fx).map(([n, t]) => [`${n}.jsonl`, t])), 'expected.json': exp };
  if (process.argv.includes('--check')) {
    const stale = Object.entries(files).filter(([f, t]) => {
      try {
        return readFileSync(join(DIR, f), 'utf8') !== t;
      } catch {
        return true;
      }
    }).map(([f]) => f);
    if (stale.length) {
      console.error(`fixtures: out of date: ${stale.join(', ')} (run node tools/fixtures.mjs)`);
      process.exit(1);
    }
    console.log('fixtures: up to date');
  } else {
    mkdirSync(DIR, { recursive: true });
    for (const [f, t] of Object.entries(files)) writeFileSync(join(DIR, f), t);
    for (const [n, e] of Object.entries(JSON.parse(exp))) console.log(`${n}: ${e.events} events, ${e.bytes} B, ${e.words} words, state ${e.state.slice(0, 12)}`);
  }
}
