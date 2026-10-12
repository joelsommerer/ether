// Fuzz action generator (PHASE-1.md section 5): seed -> list of scenario steps.
//
// `generate` is self-contained on purpose (no closures, no imports): the rig
// also evaluates `generate.toString()` inside every browser to prove that the
// same seed yields the same action list on every engine. The generator never
// looks at a document, so the list depends on the seed alone; steps that a
// driver cannot perform (composition outside CDP) are still generated and the
// driver reports them as unsupported-by-driver.

import { createHash } from 'node:crypto';

/**
 * Steps of one fuzz sequence for `seed` (unsigned 32-bit integer).
 * PRNG: mulberry32 (Math.imul and >>> only, identical in every JS engine).
 * Length: 50-200 steps. Weighted alphabet: words (EN, DE umlauts, ZWJ emoji,
 * flags, CJK, Thai, combining marks), Enter, Shift+Enter, every delete
 * variant, arrows and word jumps, Shift ranges, block/offset selections incl.
 * cross-block, select all, paste, undo/redo, Mod+B/Mod+I, markdown rules at a
 * new block start, composition.
 * @param {number} seed
 * @returns {Record<string, any>[]}
 */
export function generate(seed) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** @param {number} n */
  const int = (n) => Math.floor(rand() * n);
  /** @template T @param {T[]} xs @returns {T} */
  const pick = (xs) => xs[int(xs.length)];
  const WORDS = [
    'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog', 'Hello', 'world', 'omit', 'needless', 'words',
    'über', 'Grüsse', 'Mädchen', 'Öl', 'Äpfel', 'schön', 'Gregor', 'Samsa', 'Käfer', 'Zürich', 'süss',
    '\u{1F469}‍\u{1F469}‍\u{1F467}', '\u{1F468}‍\u{1F4BB}', '\u{1F1E8}\u{1F1ED}', '\u{1F600}', '\u{1F44D}\u{1F3FD}',
    '漢字', '日本語', '中文', 'ภาษาไทย', 'สวัสดี', 'été', 'ñ', 'ä', '\u{1D518}',
    '.', ',', '!', '?', '-', '"', "'",
  ];
  const COMPOSE = [
    { compose: ['¨'], commit: 'ü' },
    { compose: ['´'], commit: 'é' },
    { compose: ['^'], commit: 'â' },
    { compose: ['~'], commit: 'ñ' },
    { compose: ['k', 'か', 'かn', 'かな'], commit: '仮名' },
    { compose: ['n', 'に', 'にh', 'にほ', 'にほん'], commit: '日本' },
    { compose: ['ㅎ', '하', '한'], commit: '한' },
    { compose: ['z', 'zh', 'zho', 'zhon', 'zhong'], commit: '中' },
  ];
  /** @type {[number, () => Record<string, any> | Record<string, any>[]][]} */
  const ALPHABET = [
    [30, () => ({ text: pick(WORDS) + (rand() < 0.7 ? ' ' : '') })],
    [6, () => ({ key: 'Enter' })],
    [3, () => ({ key: 'Enter', mods: ['Shift'] })],
    [8, () => ({ key: 'Backspace' })],
    [4, () => ({ key: 'Delete' })],
    [2, () => ({ key: 'Backspace', mods: ['Alt'] })],
    [2, () => ({ key: 'Delete', mods: ['Alt'] })],
    [1, () => ({ key: 'Backspace', mods: ['Mod'] })],
    [1, () => ({ key: 'Delete', mods: ['Mod'] })],
    [6, () => ({ key: pick(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) })],
    [2, () => ({ key: pick(['ArrowLeft', 'ArrowRight']), mods: ['Alt'] })],
    [4, () => ({ key: pick(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']), mods: ['Shift'] })],
    [5, () => {
      const anchor = [int(4), int(12)];
      return { select: rand() < 0.4 ? { anchor } : { anchor, focus: [int(4), int(12)] } };
    }],
    [1, () => ({ shortcut: 'Mod+A' })],
    [2, () => ({ paste: { text: pick(WORDS) + (rand() < 0.5 ? '\n' + pick(WORDS) : '') } })],
    [3, () => ({ undo: true })],
    [2, () => ({ redo: true })],
    [2, () => ({ shortcut: 'Mod+B' })],
    [2, () => ({ shortcut: 'Mod+I' })],
    [2, () => [{ key: 'Enter' }, { text: pick(['# ', '## ', '### ', '- ', '* ']) }]],
    [3, () => {
      const c = pick(COMPOSE);
      return { compose: c.compose.slice(), commit: c.commit };
    }],
  ];
  let total = 0;
  for (const [w] of ALPHABET) total += w;
  const length = 50 + int(151);
  /** @type {Record<string, any>[]} */
  const steps = [];
  while (steps.length < length) {
    let r = int(total);
    let k = 0;
    while (r >= ALPHABET[k][0]) r -= ALPHABET[k++][0];
    const out = ALPHABET[k][1]();
    for (const s of Array.isArray(out) ? out : [out]) if (steps.length < length) steps.push(s);
  }
  return steps;
}

/**
 * SHA-256 hex of the JSON of an action list (key order is fixed by the
 * generator, so JSON.stringify is canonical for its output).
 * @param {unknown[]} steps
 */
export const actionHash = (steps) => createHash('sha256').update(JSON.stringify(steps), 'utf8').digest('hex');

/** Source of `generate` for evaluation inside a browser. */
export const GENERATOR_SOURCE = generate.toString();
