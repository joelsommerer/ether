// Scenario DSL (test/scenarios/*.json): schema check and corpus loading.
// The format is documented in test/README.md.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Block types a scenario's `init` may use (format v0 types). */
export const BLOCK_TYPES = ['p', 'h1', 'h2', 'h3', 'li'];
/** Keys the drivers can press (W3C key names). */
export const KEYS = ['Backspace', 'Delete', 'Enter', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Home', 'End', 'PageUp', 'PageDown'];
/** Modifiers; "Mod" is Meta on macOS/iOS targets and Control elsewhere. */
export const MODS = ['Shift', 'Alt', 'Control', 'Meta', 'Mod'];
/** Step kinds, one per step object. */
export const KINDS = ['text', 'key', 'select', 'compose', 'paste', 'undo', 'redo', 'shortcut', 'click', 'tap', 'drag', 'wait'];
/** Scenario tags with a meaning for the runner. */
export const TAGS = ['plain', 'structural', 'marks', 'composition', 'paste', 'history', 'pointer', 'navigation', 'regression'];
/**
 * The Phase-1 inputType matrix (E1-008 scope: handled + delegated types).
 * Every type needs at least one scenario that names it in `covers`.
 */
export const MATRIX = [
  'insertText', 'insertReplacementText', 'insertLineBreak', 'insertParagraph', 'insertFromYank', 'insertTranspose',
  'deleteContentBackward', 'deleteContentForward', 'deleteWordBackward', 'deleteWordForward',
  'deleteSoftLineBackward', 'deleteSoftLineForward', 'deleteEntireSoftLine', 'deleteHardLineBackward',
  'deleteHardLineForward', 'deleteContent', 'insertCompositionText', 'historyUndo', 'historyRedo',
  'formatBold', 'formatItalic', 'formatRemove', 'insertUnorderedList', 'insertFromPaste', 'insertFromPasteAsQuotation',
  'insertFromDrop', 'deleteByCut', 'deleteByDrag',
];

/** @param {unknown} v */
const isPos = (v) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0);
/** @param {unknown} v */
const isPath = (v) => Array.isArray(v) && v.every((n) => Number.isInteger(n) && n >= 0);
/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Problems with one step (empty array = valid).
 * @param {unknown} step
 * @returns {string[]}
 */
export function checkStep(step) {
  if (!isObj(step)) return ['step is not an object'];
  const kinds = Object.keys(step).filter((k) => KINDS.includes(k));
  if (kinds.length !== 1) return [`step needs exactly one of ${KINDS.join('/')}, got ${Object.keys(step).join(',')}`];
  const kind = kinds[0];
  const extra = Object.keys(step).filter((k) => k !== kind && !(kind === 'key' && k === 'mods') && !(kind === 'compose' && k === 'commit') && k !== 'note');
  if (extra.length) return [`unknown field(s) ${extra.join(',')} in ${kind} step`];
  const v = step[kind];
  switch (kind) {
    case 'text': return typeof v === 'string' && v.length > 0 ? [] : ['text must be a non-empty string'];
    case 'key': {
      const e = KEYS.includes(v) || (typeof v === 'string' && [...v].length === 1) ? [] : [`unknown key ${v}`];
      if ('mods' in step && !(Array.isArray(step.mods) && step.mods.every((m) => MODS.includes(m)))) e.push('mods must be a list of ' + MODS.join('/'));
      return e;
    }
    case 'shortcut': return typeof v === 'string' && /^((Shift|Alt|Control|Meta|Mod)\+)+[^+]+$/.test(v) ? [] : [`bad shortcut ${v}`];
    case 'select': {
      if (!isObj(v)) return ['select must be an object'];
      if ('anchor' in v) {
        const e = isPos(v.anchor) ? [] : ['select.anchor must be [block, offset]'];
        if ('focus' in v && !isPos(v.focus)) e.push('select.focus must be [block, offset]');
        return e;
      }
      if ('anchorPath' in v) {
        const e = isPath(v.anchorPath) && Number.isInteger(v.anchorOffset) ? [] : ['select.anchorPath needs anchorOffset'];
        if ('focusPath' in v && !(isPath(v.focusPath) && Number.isInteger(v.focusOffset))) e.push('select.focusPath needs focusOffset');
        return e;
      }
      return ['select needs anchor or anchorPath'];
    }
    case 'compose': {
      const e = Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string') ? [] : ['compose must be a list of strings'];
      if (typeof step.commit !== 'string') e.push('compose needs a commit string');
      return e;
    }
    case 'paste': return isObj(v) && typeof v.text === 'string' && (!('html' in v) || typeof v.html === 'string') ? [] : ['paste needs {text, html?}'];
    case 'undo': case 'redo': return v === true ? [] : [`${kind} must be true`];
    case 'click': case 'tap': {
      if (!isObj(v)) return [`${kind} must be an object`];
      if ('x' in v || 'y' in v) return Number.isFinite(v.x) && Number.isFinite(v.y) ? [] : [`${kind} needs numeric x and y`];
      return isPos(v.at) ? [] : [`${kind} needs {x, y} or {at: [block, offset]}`];
    }
    case 'drag': {
      if (!isObj(v) || !isObj(v.from) || !isObj(v.to)) return ['drag needs {from, to}'];
      return [...checkStep({ click: v.from }), ...checkStep({ click: v.to })].map((e) => e.replace('click', 'drag'));
    }
    case 'wait': return Number.isInteger(v) && v >= 0 && v <= 5000 ? [] : ['wait must be 0-5000 ms'];
    default: return [`unknown step kind ${kind}`];
  }
}

/**
 * Problems with one scenario (empty array = valid).
 * @param {unknown} sc
 * @returns {string[]}
 */
export function checkScenario(sc) {
  if (!isObj(sc)) return ['scenario is not an object'];
  /** @type {string[]} */
  const e = [];
  if (typeof sc.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(sc.id)) e.push('id must be kebab-case');
  if (typeof sc.title !== 'string' || !sc.title) e.push('title missing');
  if (!Array.isArray(sc.tags) || !sc.tags.every((t) => TAGS.includes(t))) e.push(`tags must be a list of ${TAGS.join('/')}`);
  if (!Array.isArray(sc.covers) || !sc.covers.every((t) => MATRIX.includes(t))) e.push('covers must list Phase-1 inputTypes');
  if (!Array.isArray(sc.init) || !sc.init.length) e.push('init must be a non-empty list of blocks');
  else for (const b of sc.init) {
    if (!isObj(b) || !BLOCK_TYPES.includes(b.t) || typeof b.s !== 'string') e.push(`bad init block ${JSON.stringify(b)}`);
    else if ('m' in b && !(typeof b.m === 'string' && /^[0-3]*$/.test(b.m) && b.m.length <= b.s.length)) e.push(`bad marks in init block ${JSON.stringify(b)}`);
  }
  if (!Array.isArray(sc.steps) || !sc.steps.length) e.push('steps must be a non-empty list');
  else sc.steps.forEach((s, i) => { for (const p of checkStep(s)) e.push(`step ${i}: ${p}`); });
  const known = ['id', 'title', 'tags', 'covers', 'init', 'steps', 'note', 'origin'];
  for (const k of Object.keys(sc)) if (!known.includes(k)) e.push(`unknown field ${k}`);
  return e;
}

/**
 * Reads every scenario of a directory (sorted by file name).
 * @param {string} dir
 * @returns {{file: string, scenario: Record<string, any>}[]}
 */
export function loadDir(dir) {
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  } catch {
    return [];
  }
  return names.map((n) => ({ file: join(dir, n), scenario: JSON.parse(readFileSync(join(dir, n), 'utf8')) }));
}

/**
 * Corpus + regressions; throws on an invalid scenario or a duplicate id.
 * @param {string} root test/scenarios
 */
export function loadCorpus(root) {
  const corpus = loadDir(root);
  const regressions = loadDir(join(root, 'regressions'));
  const ids = new Set();
  for (const { file, scenario } of [...corpus, ...regressions]) {
    const e = checkScenario(scenario);
    if (e.length) throw new Error(`${file}: ${e.join('; ')}`);
    if (ids.has(scenario.id)) throw new Error(`${file}: duplicate id ${scenario.id}`);
    ids.add(scenario.id);
  }
  return { corpus: corpus.map((c) => c.scenario), regressions: regressions.map((c) => c.scenario) };
}
