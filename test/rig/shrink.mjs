// Shrinker: delta debugging (Zeller and Hildebrandt, ddmin) of a failing step
// list, then text simplification inside the remaining text steps. The
// predicate runs the candidate on the real target, so it is async; the result
// is 1-minimal: removing any single step makes the failure disappear.

/**
 * @template T
 * @param {T[]} items failing input
 * @param {(c: T[]) => Promise<boolean>} fails true when the candidate still fails
 * @returns {Promise<T[]>}
 */
export async function ddmin(items, fails) {
  let cur = items.slice();
  let n = 2;
  while (cur.length >= 2) {
    const size = Math.ceil(cur.length / n);
    const chunks = [];
    for (let i = 0; i < cur.length; i += size) chunks.push(cur.slice(i, i + size));
    let reduced = false;
    for (const c of chunks) {
      if (await fails(c)) {
        cur = c;
        n = 2;
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      for (let i = 0; i < chunks.length; i++) {
        const complement = chunks.filter((_, k) => k !== i).flat();
        if (complement.length && await fails(complement)) {
          cur = complement;
          n = Math.max(n - 1, 2);
          reduced = true;
          break;
        }
      }
    }
    if (!reduced) {
      if (n >= cur.length) break;
      n = Math.min(cur.length, n * 2);
    }
  }
  // Final 1-minimality pass (ddmin guarantees it, this keeps it explicit).
  for (let i = cur.length - 1; i >= 0 && cur.length > 1; i--) {
    const without = cur.filter((_, k) => k !== i);
    if (await fails(without)) cur = without;
  }
  return cur;
}

/** @param {string} s */
const graphemes = (s) => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].map((g) => g.segment);

/**
 * Shrinks a failing step list: ddmin over steps, then ddmin over the
 * graphemes of every remaining text step (a text step never becomes empty).
 * @param {Record<string, any>[]} steps
 * @param {(c: Record<string, any>[]) => Promise<boolean>} fails
 * @returns {Promise<{steps: Record<string, any>[], runs: number}>}
 */
export async function shrinkSteps(steps, fails) {
  let runs = 0;
  /** @param {Record<string, any>[]} c */
  const counted = async (c) => { runs++; return fails(c); };
  let cur = await ddmin(steps, counted);
  for (let i = 0; i < cur.length; i++) {
    if (typeof cur[i].text !== 'string') continue;
    const g = graphemes(cur[i].text);
    if (g.length < 2) continue;
    const kept = await ddmin(g, (part) => counted(cur.map((s, k) => (k === i ? { text: part.join('') } : s))));
    cur = cur.map((s, k) => (k === i ? { text: kept.join('') } : s));
  }
  return { steps: cur, runs };
}
