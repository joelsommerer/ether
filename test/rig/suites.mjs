// Rig suites (piece E1-002): scenario corpus, fuzz, planted-bug self-test.
// Each suite runs on one target and returns a JSON-serializable report.

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCorpus, MATRIX } from './dsl.mjs';
import { actionHash, generate, GENERATOR_SOURCE } from './fuzzgen.mjs';
import { checkAll } from './invariants.mjs';
import { FUZZ_INIT, firstDivergence, openSubject, PM_URL, pool, probeKeyboard, probeOurs, ROOT, runSteps } from './run.mjs';
import { shrinkSteps } from './shrink.mjs';

export const SCENARIOS = join(ROOT, 'test/scenarios');
export const REGRESSIONS = join(SCENARIOS, 'regressions');
/** Scenario tags that also run on ProseMirror (structure, marks, history). */
const PM_TAGS = ['structural', 'marks', 'history'];

/** @param {unknown} e */
const msg = (e) => (e instanceof Error ? e.message.split('\n')[0] : String(e));

/**
 * Pages of one worker. Drivers with a single page (iOS: one WebDriver
 * session) share it between subjects.
 * @param {any} driver
 */
function workerPages(driver) {
  /** @type {Record<string, {page: any, loaded: string | null}>} */
  const pages = {};
  /** @type {{page: any, loaded: string | null} | null} */
  let shared = null;
  const open = async () => {
    const page = await driver.newPage();
    page.keyboardOk = driver.keyboard?.ok;
    page.keyboardDetail = driver.keyboard?.detail;
    return { page, loaded: null };
  };
  /** @param {string} subject */
  const slot = async (subject) => {
    if (driver.target === 'ios-safari') return (shared ??= await open());
    return (pages[subject] ??= await open());
  };
  return {
    /**
     * A page showing `subject`. native/stub are reloaded every time (their
     * undo stack must start empty); pm is reused and reset through its API.
     * @param {string} subject @param {Record<string, string>} urls
     */
    async get(subject, urls) {
      const s = await slot(subject);
      if (driver.target === 'android-chrome') await s.page.front();
      if (s.loaded !== subject || subject !== 'pm') {
        s.loaded = null;
        await openSubject(s.page, subject, urls);
        s.loaded = subject;
        if (driver.target === 'android-chrome') await s.page.front();
      }
      return s.page;
    },
    /** @param {string} subject forget a page after an error */
    async drop(subject) {
      const s = driver.target === 'ios-safari' ? shared : pages[subject];
      if (s) s.loaded = null;
    },
    async close() {
      for (const s of [...Object.values(pages), ...(shared ? [shared] : [])]) await s.page.close().catch(() => undefined);
    },
  };
}

/** Compact step record for reports (snapshot without bulky fields). @param {any} t */
function compact(t) {
  if (!t) return t;
  /** @param {any} s */
  const snap = (s) => (s ? { blocks: s.blocks, sel: s.sel, events: s.events, composing: s.composing, errors: s.errors?.length ? s.errors : undefined, doc: s.doc, undoDepth: s.undoDepth, storedMarks: s.storedMarks ?? undefined, shape: s.shape } : null);
  return { ...t, initial: snap(t.initial), steps: t.steps.map((/** @type {any} */ s) => ({ ...s, snap: snap(s.snap) })) };
}

/**
 * ProseMirror build facts. The bundle carries no version strings (dossier
 * behavior-bar.md 1.2), so the prosemirror-view version is inferred: the
 * newest npm release published before the bundle's Last-Modified date.
 */
export async function pmInfo() {
  try {
    const r = await fetch('https://prosemirror.net/examples/prosemirror.js', { signal: AbortSignal.timeout(30_000) });
    const body = Buffer.from(await r.arrayBuffer());
    const lastModified = r.headers.get('last-modified');
    const npm = /** @type {any} */ (await (await fetch('https://registry.npmjs.org/prosemirror-view', { signal: AbortSignal.timeout(30_000) })).json());
    const lm = lastModified ? Date.parse(lastModified) : Date.now();
    const releases = Object.entries(/** @type {Record<string, string>} */ (npm.time))
      .filter(([v]) => /^\d+\.\d+\.\d+$/.test(v))
      .sort((a, b) => Date.parse(a[1]) - Date.parse(b[1]));
    const before = releases.filter(([, t]) => Date.parse(t) <= lm);
    const inferred = before[before.length - 1] ?? null;
    return {
      page: PM_URL,
      bundle: { url: 'https://prosemirror.net/examples/prosemirror.js', bytes: body.length, sha256: createHash('sha256').update(body).digest('hex'), lastModified, etag: r.headers.get('etag') },
      prosemirrorView: inferred ? { version: inferred[0], published: inferred[1] } : null,
      npmLatest: npm['dist-tags']?.latest ?? null,
      versionStrings: /prosemirror-view@\d/.test(body.toString('latin1')),
      method: 'inferred: the bundle has no version string; newest prosemirror-view on npm published before the bundle Last-Modified',
    };
  } catch (e) {
    return { page: PM_URL, error: msg(e) };
  }
}

/**
 * Scenario corpus on one target: native oracle for every scenario,
 * ProseMirror for structural/marks/history scenarios, a probe of our four
 * dist variants, and the planted-bug control on the stub.
 * @param {any} driver @param {Record<string, string>} urls
 * @param {{workers: number, only?: string[], pm?: any}} opt
 */
export async function corpusSuite(driver, urls, opt) {
  const t0 = Date.now();
  const { corpus, regressions } = loadCorpus(SCENARIOS);
  let scenarios = [...corpus, ...regressions];
  if (opt.only?.length) scenarios = scenarios.filter((s) => opt.only?.includes(s.id));
  const settle = true;
  const workers = driver.target === 'ios-safari' || driver.target === 'android-chrome' ? 1 : Math.min(4, opt.workers);
  const W = Array.from({ length: workers }, () => workerPages(driver));

  // Our document: probe each dist variant first; scenarios run on it once it has a surface.
  const oursVariants = Object.keys(urls).filter((k) => k.startsWith('ours'));
  const ours = [];
  for (const v of oursVariants) {
    const page = await driver.newPage();
    ours.push(await probeOurs(page, v, urls));
    await page.close();
  }
  const oursSurface = ours.filter((o) => o.surface).map((o) => o.variant);

  const results = await pool(scenarios, workers, async (sc, w) => {
    const pages = W[w];
    /** @type {Record<string, any>} */
    const subjects = {};
    const list = ['native'];
    if (sc.tags.some((/** @type {string} */ t) => PM_TAGS.includes(t))) list.push('pm');
    if (sc.tags.includes('regression') && sc.origin?.kind === 'planted') list.push('stub');
    for (const v of oursSurface) list.push(v);
    for (const subject of list) {
      if (process.env.ETHER_RIG_DEBUG) console.error(`rig: ${sc.id} / ${subject}`);
      try {
        const page = await pages.get(subject, urls);
        const t = await runSteps(page, driver.platform, sc.init, sc.steps, { settle });
        subjects[subject] = compact(t);
        if (t.status === 'error') await pages.drop(subject);
        if (subject.startsWith('ours') && t.status !== 'not-run') {
          // Invariants after every step; I4 against the native trace for plain-text scenarios.
          const ref = subjects.native;
          subjects[subject].checks = t.steps.map((/** @type {any} */ s, /** @type {number} */ i) => (s.snap
            ? checkAll(s.snap, { ref: ref?.steps[i]?.snap, plain: sc.tags.includes('plain') }).filter((c) => c.status !== 'inactive')
            : []));
        }
      } catch (e) {
        await pages.drop(subject);
        subjects[subject] = { status: 'error', reason: msg(e), steps: [] };
      }
    }
    if (subjects.stub && subjects.native) {
      const d = firstDivergence(subjects.stub, subjects.native);
      subjects.stub.detected = d;
    }
    return { id: sc.id, tags: sc.tags, covers: sc.covers, subjects };
  });
  for (const p of W) await p.close();

  // Coverage of the Phase-1 inputType matrix: which scenarios name a type,
  // and whether the native oracle actually received a beforeinput of it.
  /** @type {Record<string, {scenarios: string[], firedIn: string[]}>} */
  const coverage = {};
  for (const t of MATRIX) coverage[t] = { scenarios: [], firedIn: [] };
  for (const r of results) {
    for (const t of r.covers) coverage[t]?.scenarios.push(r.id);
    const fired = new Set();
    for (const s of r.subjects.native?.steps ?? []) for (const e of s.snap?.events ?? []) if (e.e === 'beforeinput') fired.add(e.it);
    for (const t of fired) if (coverage[t]) coverage[t].firedIn.push(r.id);
  }

  /** @param {string} subject */
  const tally = (subject) => {
    /** @type {Record<string, number>} */
    const c = { complete: 0, incomplete: 0, error: 0, 'not-run': 0 };
    for (const r of results) if (r.subjects[subject]) c[r.subjects[subject].status] = (c[r.subjects[subject].status] ?? 0) + 1;
    return c;
  };
  /** @type {{scenario: string, subject: string, step: number, kind: string, reason: string}[]} */
  const unsupported = [];
  /** @type {{scenario: string, subject: string, step: number, reason: string}[]} */
  const errors = [];
  for (const r of results) {
    for (const [subject, t] of Object.entries(r.subjects)) {
      if (t.status === 'error' && !t.steps.length) errors.push({ scenario: r.id, subject, step: -1, reason: t.reason });
      for (const s of t.steps ?? []) {
        if (s.status === 'unsupported-by-driver') unsupported.push({ scenario: r.id, subject, step: s.i, kind: Object.keys(s.step)[0], reason: s.reason });
        if (s.status === 'error') errors.push({ scenario: r.id, subject, step: s.i, reason: s.reason });
      }
    }
  }
  const planted = results.filter((r) => r.subjects.stub).map((r) => ({ scenario: r.id, detected: !!r.subjects.stub.detected, detail: r.subjects.stub.detected }));
  const pmIncluded = results.some((r) => r.subjects.pm);
  return {
    kind: 'corpus',
    target: driver.target,
    browser: driver.browserVersion,
    startedAt: new Date(t0).toISOString(),
    durationMs: Date.now() - t0,
    counts: { corpus: corpus.length, regressions: regressions.length, run: scenarios.length },
    native: tally('native'),
    pm: pmIncluded ? { ...tally('pm'), info: opt.pm ?? null } : null,
    ours,
    oursChecksActive: oursSurface.length > 0,
    sessionRecoveries: driver.recoveries ?? 0,
    planted,
    unsupported,
    errors,
    coverage,
    results,
  };
}

/**
 * In-browser generator check: the page evaluates the generator source for
 * every seed and hashes the JSON with WebCrypto; node compares the hashes.
 * @param {any} page @param {number[]} seeds
 */
async function browserHashes(page, seeds) {
  const fn = `async (seeds) => {
    const generate = ${GENERATOR_SOURCE};
    const out = [];
    for (const s of seeds) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(generate(s))));
      out.push(Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join(''));
    }
    return out;
  }`;
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < seeds.length; i += 250) out.push(...await page.eval(fn, seeds.slice(i, i + 250)));
  return out;
}

/**
 * Fuzz on one subject (default: the native oracle): `count` sequences from
 * `seed`, every step executed and snapshotted, per-step checks recorded.
 * @param {any} driver @param {Record<string, string>} urls
 * @param {{subject: string, count: number, seed: number, workers: number, hashCount?: number}} opt
 */
export async function fuzzSuite(driver, urls, opt) {
  if (opt.subject.startsWith('ours')) {
    // Our document joins the fuzz once it has an editing surface (E1-007+).
    const page = await driver.newPage();
    const probe = await probeOurs(page, opt.subject, urls);
    await page.close();
    if (!probe.surface) {
      return { kind: 'fuzz', target: driver.target, subject: opt.subject, browser: driver.browserVersion, startedAt: new Date().toISOString(), inactive: `our document has no editing surface yet (${probe.surfaceReason ?? probe.error})`, seeds: { first: opt.seed, count: opt.count } };
    }
  }
  const seeds = Array.from({ length: opt.count }, (_, k) => opt.seed + k);
  // The generator check may cover more seeds than are run (slow mobile drivers).
  const hashSeeds = Array.from({ length: Math.max(opt.count, opt.hashCount ?? 0) }, (_, k) => opt.seed + k);
  const allHashes = hashSeeds.map((s) => actionHash(generate(s)));
  const nodeHashes = allHashes.slice(0, seeds.length);
  const listDigest = createHash('sha256').update(allHashes.join('\n')).digest('hex');

  const hp = await driver.newPage();
  await openSubject(hp, 'native', urls);
  const inBrowser = await browserHashes(hp, hashSeeds);
  await hp.close();
  const genMismatch = hashSeeds.filter((_, k) => inBrowser[k] !== allHashes[k]);

  const workers = driver.target === 'ios-safari' || driver.target === 'android-chrome' ? 1 : Math.min(4, opt.workers);
  const W = Array.from({ length: workers }, () => workerPages(driver));
  const engine = opt.subject.startsWith('ours');
  const settle = driver.platform !== 'mac';
  const t0 = Date.now();
  const runs = await pool(seeds, workers, async (seed, w) => {
    const steps = generate(seed);
    const s0 = Date.now();
    /** @type {Record<string, number>} */
    const violations = {};
    /** @type {Record<string, number>} */
    const quirks = {};
    let inactive = 0;
    try {
      const page = await W[w].get(opt.subject, urls);
      const t = await runSteps(page, driver.platform, FUZZ_INIT, steps, {
        settle,
        keepSnaps: false,
        onStep: (_i, snap) => {
          for (const c of checkAll(snap)) {
            if (c.status === 'fail') violations[c.id] = (violations[c.id] ?? 0) + 1;
            else if (c.status === 'inactive') inactive++;
          }
          if (snap.errors?.length) violations.pageError = (violations.pageError ?? 0) + 1;
          if (snap.sel?.invalidOffset) quirks.invalidSelectionOffset = (quirks.invalidSelectionOffset ?? 0) + 1;
        },
      });
      if (t.status === 'error') await W[w].drop(opt.subject);
      const err = t.steps.find((/** @type {any} */ s) => s.status === 'error');
      return { seed, hash: nodeHashes[seed - opt.seed], steps: steps.length, executed: t.steps.length, unsupported: t.unsupported ?? 0, status: t.status, error: err ? `step ${err.i}: ${err.reason}` : t.reason, ms: Date.now() - s0, violations, quirks, inactiveChecks: inactive };
    } catch (e) {
      await W[w].drop(opt.subject);
      return { seed, hash: nodeHashes[seed - opt.seed], steps: steps.length, executed: 0, unsupported: 0, status: 'error', error: msg(e), ms: Date.now() - s0, violations, quirks, inactiveChecks: inactive };
    }
  });
  const durationMs = Date.now() - t0;
  for (const p of W) await p.close();
  const executed = runs.reduce((a, r) => a + r.executed, 0);
  /** @type {Record<string, number>} */
  const violations = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.violations)) violations[k] = (violations[k] ?? 0) + v;
  /** @type {Record<string, number>} */
  const quirks = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.quirks)) quirks[k] = (quirks[k] ?? 0) + v;
  /** @type {Record<string, number>} */
  const statuses = {};
  for (const r of runs) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
  return {
    kind: 'fuzz',
    target: driver.target,
    subject: opt.subject,
    browser: driver.browserVersion,
    startedAt: new Date(t0).toISOString(),
    seeds: { first: opt.seed, count: opt.count },
    listDigest,
    generatorInBrowser: { checked: hashSeeds.length, mismatches: genMismatch.length, firstMismatch: genMismatch[0] ?? null },
    listDigestSeeds: hashSeeds.length,
    workers,
    durationMs,
    sequencesPerSecond: Number((runs.length / (durationMs / 1000)).toFixed(2)),
    stepsPerSecond: Number((executed / (durationMs / 1000)).toFixed(1)),
    steps: { generated: runs.reduce((a, r) => a + r.steps, 0), executed, unsupported: runs.reduce((a, r) => a + r.unsupported, 0) },
    statuses,
    violations,
    oracleQuirks: quirks,
    checks: engine ? 'I1-I8 per step (inactive ones counted separately)' : 'I1-I8 per step: all inactive on the oracle (no webdoc API); page errors counted as violations',
    inactiveChecks: runs.reduce((a, r) => a + r.inactiveChecks, 0),
    errors: runs.filter((r) => r.status === 'error').map((r) => ({ seed: r.seed, error: r.error })).slice(0, 50),
    runs,
  };
}

/**
 * Runs a step list on two subjects and returns the first divergence (I4).
 * @param {{get: (s: string, u: Record<string, string>) => Promise<any>, drop: (s: string) => Promise<void>}} pages
 * @param {any} driver @param {Record<string, string>} urls @param {string} cand @param {string} ref
 * @param {Record<string, any>[]} steps
 */
async function diff(pages, driver, urls, cand, ref, steps) {
  const a = await runSteps(await pages.get(cand, urls), driver.platform, FUZZ_INIT, steps, { settle: true });
  if (a.status === 'error') await pages.drop(cand);
  const b = await runSteps(await pages.get(ref, urls), driver.platform, FUZZ_INIT, steps, { settle: true });
  if (b.status === 'error') await pages.drop(ref);
  return { d: firstDivergence(a, b), a, b };
}

/**
 * Planted-bug self-test: fuzz the broken stub against the native oracle until
 * the first divergence, shrink it (ddmin) and save the minimal scenario under
 * test/scenarios/regressions/. Control: the same seeds native vs native must
 * not diverge (the oracle is deterministic, so a detection is not noise).
 * @param {any} driver @param {Record<string, string>} urls
 * @param {{maxSeeds: number, seed: number, controlSeeds: number, save: boolean}} opt
 */
export async function plantedSuite(driver, urls, opt) {
  const t0 = Date.now();
  if (driver.keyboard && !driver.keyboard.ok) {
    // The planted bug needs typed text and Backspace; without a keyboard the
    // search cannot reach it, which is a driver limitation, not a miss.
    return { kind: 'planted', target: driver.target, browser: driver.browserVersion, startedAt: new Date(t0).toISOString(), durationMs: 0, detected: false, notRunnable: `keyboard probe failed: ${driver.keyboard.detail}`, seedsTried: 0, found: null, shrunk: null, control: { seeds: 0, divergences: 0 } };
  }
  const pages = workerPages(driver);
  /** @type {any} */
  let found = null;
  let tried = 0;
  for (let seed = opt.seed; seed < opt.seed + opt.maxSeeds && !found; seed++) {
    tried++;
    const steps = generate(seed);
    const { d } = await diff(pages, driver, urls, 'stub', 'native', steps);
    if (d) found = { seed, step: d.step, detail: d.detail, length: steps.length, steps };
  }
  const detectMs = Date.now() - t0;
  /** @type {any} */
  let shrunk = null;
  if (found) {
    const prefix = found.steps.slice(0, found.step + 1);
    const s0 = Date.now();
    const r = await shrinkSteps(prefix, async (c) => !!(await diff(pages, driver, urls, 'stub', 'native', c)).d);
    const verify = await diff(pages, driver, urls, 'stub', 'native', r.steps);
    const control = await diff(pages, driver, urls, 'native', 'native', r.steps);
    const fired = new Set();
    for (const s of verify.b.steps) for (const e of s.snap?.events ?? []) if (e.e === 'beforeinput' && MATRIX.includes(e.it)) fired.add(e.it);
    shrunk = { steps: r.steps, count: r.steps.length, runs: r.runs, ms: Date.now() - s0, reproduces: !!verify.d, detail: verify.d?.detail ?? null, controlDiverges: !!control.d, covers: [...fired].sort() };
    if (opt.save && shrunk.reproduces && !shrunk.controlDiverges) {
      const id = `planted-ue-${driver.target}`;
      const scenario = {
        id,
        title: `Planted bug (bench/stubs/broken.html) found by the fuzzer on ${driver.target}, shrunk from ${found.step + 1} steps`,
        tags: ['regression', 'plain'],
        covers: shrunk.covers.length ? shrunk.covers : ['deleteContentBackward'],
        origin: { kind: 'planted', target: driver.target, seed: found.seed, step: found.step, originalLength: found.length, shrinkRuns: r.runs, detail: verify.d?.detail },
        init: FUZZ_INIT,
        steps: r.steps,
      };
      writeFileSync(join(REGRESSIONS, `${id}.json`), `${JSON.stringify(scenario, null, 1)}\n`);
      shrunk.file = `test/scenarios/regressions/${id}.json`;
    }
  }
  // Control: native vs native over the first seeds.
  let controlDivergences = 0;
  for (let seed = opt.seed; seed < opt.seed + opt.controlSeeds; seed++) {
    if ((await diff(pages, driver, urls, 'native', 'native', generate(seed))).d) controlDivergences++;
  }
  await pages.close();
  return {
    kind: 'planted',
    target: driver.target,
    browser: driver.browserVersion,
    startedAt: new Date(t0).toISOString(),
    durationMs: Date.now() - t0,
    detected: !!found,
    seedsTried: tried,
    detectMs,
    found: found ? { seed: found.seed, step: found.step, detail: found.detail, length: found.length } : null,
    shrunk,
    control: { seeds: opt.controlSeeds, divergences: controlDivergences },
  };
}
