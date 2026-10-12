// Gate runner (PHASE-1.md section 6). Node built-ins only.
//
//   node tools/gates.mjs --piece <ID> [--targets all|desktop|mobile|<t1,t2>]
//                        [--gates G1,G2,...] [--no-build]
//   node tools/gates.mjs --piece-file <piece.json> [--dist-dir <dir>] ...
//
// Prints one row per gate G1-G12 with green / red / not-checked / n.a. and
// exits 1 when any relevant gate is red or not-checked. Relevant gates are the
// piece's acceptance.gates, narrowed by --gates. A gate that has no
// implementation yet, or a target without a driver, is "not-checked" - never
// green. Results are also written to test-results/gates/<piece>.json.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digestLines, readReports, summaryLine } from '../test/rig/report.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12'];
const DESKTOP = ['chromium', 'firefox', 'webkit'];
const MOBILE = ['ios-safari', 'android-chrome'];

/** @typedef {'green'|'red'|'not-checked'|'n.a.'} Status */
/** @typedef {{status: Status, detail: string, output?: string, targets?: Record<string, Status>}} Result */
/**
 * @typedef {{piece: any, targets: string[], distDir: string, log: boolean, built: boolean, buildError: string}} Ctx
 */

const DESCRIPTIONS = {
  G1: 'tsc strict (checkJs)',
  G2: 'lint src/',
  G3: 'node --test unit tests',
  G4: 'Playwright scenario corpus',
  G5: 'fuzz differential',
  G6: 'mobile corpus + fuzz',
  G7: 'round trip + integrity',
  G8: 'size ratchet',
  G9: 'a11y + find',
  G10: 'performance',
  G11: 'network silence + CSP',
  G12: 'docs',
};

/**
 * Runs a command and maps its exit code to green/red.
 * @param {string[]} cmd
 * @param {Record<string, string>} [env]
 */
function exec(cmd, env) {
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}`;
  return { ok: r.status === 0, output };
}

/** @param {string} output @param {number} n */
const lastLine = (output, n = 1) => output.trim().split('\n').slice(-n).join(' | ');

/** @param {string} reason @returns {Result} */
const notChecked = (reason) => ({ status: 'not-checked', detail: reason });

/**
 * Judges one target's corpus report (test/rig): red on rig errors, page
 * errors in our document, a violated invariant, a missed planted bug or a
 * ProseMirror run that broke; not-checked when the driver could not perform
 * a step (incomplete) or failed its keyboard probe; green otherwise.
 * @param {any} rep
 * @returns {{status: Status, detail: string}}
 */
function judgeCorpus(rep) {
  if (rep.error) return { status: 'not-checked', detail: `driver: ${rep.error}` };
  const red = [];
  const nc = [];
  if (rep.errors.length) red.push(`${rep.errors.length} rig error(s), first: ${rep.errors[0].scenario}/${rep.errors[0].subject}: ${rep.errors[0].reason}`);
  if (rep.native.error || rep.native['not-run']) red.push(`native error/not-run ${rep.native.error}/${rep.native['not-run']}`);
  if (rep.pm && (rep.pm.error || rep.pm['not-run'])) red.push(`ProseMirror error/not-run ${rep.pm.error}/${rep.pm['not-run']}`);
  const oursBad = rep.ours.filter((/** @type {any} */ o) => !o.loaded || o.errors?.length || o.checks?.some((/** @type {any} */ c) => c.status === 'fail'));
  if (oursBad.length) red.push(`our document: ${oursBad.map((/** @type {any} */ o) => o.variant).join(', ')} failed to load cleanly`);
  const missed = rep.planted.filter((/** @type {any} */ p) => !p.detected);
  const keyboardDown = rep.keyboard && !rep.keyboard.ok;
  // Without a working keyboard the planted regressions cannot type "ü":
  // a driver limitation (not-checked), not a blind rig (red).
  if (missed.length) (keyboardDown ? nc : red).push(`planted bug not detected in ${missed.map((/** @type {any} */ p) => p.scenario).join(', ')}${keyboardDown ? ' (no keyboard)' : ''}`);
  for (const r of rep.results) {
    for (const [subject, t] of Object.entries(r.subjects)) {
      const fails = (/** @type {any} */ (t).checks ?? []).flat().filter((/** @type {any} */ c) => c.status === 'fail');
      if (fails.length) red.push(`${r.id}/${subject}: ${fails[0].id} ${fails[0].detail}`);
    }
  }
  if (keyboardDown) nc.unshift(`keyboard probe failed (${rep.keyboard.detail})`);
  if (rep.unsupported.length) {
    /** @type {Record<string, number>} */
    const kinds = {};
    for (const u of rep.unsupported) kinds[u.kind] = (kinds[u.kind] ?? 0) + 1;
    nc.push(`incomplete: ${rep.unsupported.length} step(s) unsupported-by-driver (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')})`);
  }
  const ours = rep.ours.length
    ? `ours ${rep.ours.filter((/** @type {any} */ o) => o.loaded).length}/${rep.ours.length} variants loaded${rep.oursChecksActive ? ', I1-I8 active' : ', no editing surface yet: I1-I8 inactive'}`
    : 'ours not probed';
  const base = `${rep.counts.run} scenarios, native ${rep.native.complete}/${rep.native.incomplete}/${rep.native.error}${rep.pm ? `, pm ${rep.pm.complete}/${rep.pm.incomplete}/${rep.pm.error}` : ''} (complete/incomplete/error), ${ours}, planted control ${rep.planted.length - missed.length}/${rep.planted.length}`;
  if (red.length) return { status: 'red', detail: `${base}; ${red.join('; ')}` };
  if (nc.length) return { status: 'not-checked', detail: `${base}; ${nc.join('; ')}` };
  return { status: 'green', detail: base };
}

/**
 * Runs the rig corpus (tools/rig.mjs) on `targets` and judges each report.
 * @param {Ctx} ctx @param {string[]} targets @param {string} gate
 * @returns {Result}
 */
function rigCorpus(ctx, targets, gate) {
  if (!ctx.built) return { status: 'red', detail: `build failed: ${ctx.buildError}` };
  if (resolve(ctx.distDir) !== join(ROOT, 'dist')) return notChecked(`${gate} runs against dist/ only`);
  if (!targets.length) return notChecked('no target of this gate selected');
  const t0 = Date.now();
  const r = exec([process.execPath, 'tools/rig.mjs', 'corpus', '--targets', targets.join(',')]);
  const reports = readReports();
  /** @type {Record<string, Status>} */
  const st = {};
  const details = [];
  for (const t of targets) {
    const rep = reports[`corpus-${t}`];
    if (!rep || Date.parse(rep.startedAt) < t0 - 1000) {
      st[t] = 'red';
      details.push(`${t} red (no fresh report: ${lastLine(r.output, 3)})`);
      continue;
    }
    const j = judgeCorpus(rep);
    st[t] = j.status;
    details.push(`${t} ${j.status} (${j.detail})`);
  }
  const values = Object.values(st);
  const status = values.includes('red') ? 'red' : values.includes('not-checked') ? 'not-checked' : 'green';
  return { status, detail: `${details.join(' | ')}; reports: test-results/rig/corpus-<target>.md`, output: r.output, targets: st };
}

/**
 * Fuzz differential on our document (tools/rig.mjs fuzz --subject ours-min-http).
 * Inactive while our document has no editing surface.
 * @param {Ctx} ctx @param {string[]} targets @param {number} count
 * @returns {Result}
 */
function rigFuzz(ctx, targets, count) {
  if (!ctx.built) return { status: 'red', detail: `build failed: ${ctx.buildError}` };
  if (resolve(ctx.distDir) !== join(ROOT, 'dist')) return notChecked('fuzz runs against dist/ only');
  if (!targets.length) return notChecked('no target of this gate selected');
  const t0 = Date.now();
  const r = exec([process.execPath, 'tools/rig.mjs', 'fuzz', '--subject', 'ours-min-http', '--count', String(count), '--targets', targets.join(',')]);
  const reports = readReports();
  /** @type {Record<string, Status>} */
  const st = {};
  const details = [];
  for (const t of targets) {
    const rep = reports[`fuzz-${t}-ours-min-http`];
    if (!rep || Date.parse(rep.startedAt) < t0 - 1000) { st[t] = 'red'; details.push(`${t} red (no fresh report: ${lastLine(r.output, 3)})`); continue; }
    if (rep.error || rep.inactive) { st[t] = 'not-checked'; details.push(`${t} not-checked (${rep.error ?? rep.inactive})`); continue; }
    const v = Object.values(rep.violations).reduce((a, n) => a + Number(n), 0);
    const s = rep.statuses.error || v ? 'red' : rep.steps.unsupported || (rep.keyboard && !rep.keyboard.ok) ? 'not-checked' : 'green';
    st[t] = s;
    details.push(`${t} ${s} (${summaryLine(rep)})`);
  }
  const values = Object.values(st);
  const status = values.includes('red') ? 'red' : values.includes('not-checked') ? 'not-checked' : 'green';
  return { status, detail: details.join(' | '), output: r.output, targets: st };
}

/** @type {Record<string, (ctx: Ctx) => Result>} */
const RUNNERS = {
  G1() {
    const tsc = join(ROOT, 'node_modules/typescript/bin/tsc');
    if (!existsSync(tsc)) return notChecked('typescript not installed (npm ci)');
    const r = exec([process.execPath, tsc, '-p', 'jsconfig.json']);
    const errors = (r.output.match(/error TS\d+/g) ?? []).length;
    return { status: r.ok ? 'green' : 'red', detail: r.ok ? 'tsc -p jsconfig.json: 0 errors' : `tsc: ${errors} error(s)`, output: r.output };
  },
  G2() {
    const r = exec([process.execPath, 'tools/lint.mjs']);
    return { status: r.ok ? 'green' : 'red', detail: lastLine(r.output), output: r.output };
  },
  G3() {
    const r = exec([process.execPath, '--test', 'test/unit/']);
    const pass = /# pass (\d+)/.exec(r.output)?.[1] ?? '?';
    const fail = /# fail (\d+)/.exec(r.output)?.[1] ?? '?';
    return { status: r.ok ? 'green' : 'red', detail: `node --test: ${pass} passed, ${fail} failed`, output: r.output };
  },
  G4: (ctx) => rigCorpus(ctx, ctx.targets.filter((t) => DESKTOP.includes(t)), 'G4'),
  G5: (ctx) => rigFuzz(ctx, ctx.targets.filter((t) => DESKTOP.includes(t)), 10_000),
  G6(ctx) {
    const mobile = ctx.targets.filter((t) => MOBILE.includes(t));
    if (!mobile.length) return notChecked('no target of this gate selected');
    if (resolve(ctx.distDir) !== join(ROOT, 'dist')) return notChecked('G6 runs against dist/ only');
    // Bring the Ether devices up once for both rig runs; restore their state afterwards.
    const flag = mobile.length === 2 ? [] : [mobile[0] === 'ios-safari' ? '--ios-only' : '--android-only'];
    const st = exec([process.execPath, 'tools/devices.mjs', 'status']);
    const was = (() => { try { return JSON.parse(st.output.slice(st.output.indexOf('{'))); } catch { return null; } })();
    const wasUp = (/** @type {string} */ t) => (t === 'ios-safari' ? was?.ios?.state === 'Booted' : !!was?.android?.running);
    const boot = mobile.filter((t) => !wasUp(t));
    let devices = '';
    if (boot.length) {
      const up = exec([process.execPath, 'tools/devices.mjs', 'up', ...flag]);
      devices = `devices up: ${lastLine(up.output)}`;
    }
    try {
      const corpus = rigCorpus(ctx, mobile, 'G6');
      if (corpus.status === 'red') return corpus;
      const fuzz = rigFuzz(ctx, mobile, 1000);
      const order = ['red', 'not-checked', 'green'];
      const status = /** @type {Status} */ (order.find((s) => s === corpus.status || s === fuzz.status) ?? 'green');
      return { status, detail: `corpus: ${corpus.detail} || fuzz 1000 on ours: ${fuzz.detail}${devices ? ` || ${devices}` : ''}`, output: `${corpus.output ?? ''}\n${fuzz.output ?? ''}`, targets: corpus.targets };
    } finally {
      for (const t of boot) exec([process.execPath, 'tools/devices.mjs', 'down', t === 'ios-safari' ? '--ios-only' : '--android-only']);
    }
  },
  G7: () => notChecked('no round-trip suite yet (arrives with E1-005/E1-013)'),
  G8(ctx) {
    if (!ctx.built) return { status: 'red', detail: `build failed: ${ctx.buildError}` };
    const args = [process.execPath, 'tools/size.mjs', '--file', join(ctx.distDir, 'blank.html')];
    if (ctx.piece.__file) args.push('--ceiling-bytes', String(Math.round(ctx.piece.ceiling_kb * 1024)));
    else args.push('--piece', ctx.piece.id);
    if (!ctx.log) args.push('--no-log');
    const r = exec(args);
    return { status: r.ok ? 'green' : 'red', detail: lastLine(r.output), output: r.output };
  },
  G9: () => notChecked('no a11y/find suite yet (arrives with E1-006)'),
  G10: () => notChecked('no performance suite yet (arrives with E1-008)'),
  G11(ctx) {
    if (!ctx.built) return { status: 'red', detail: `build failed: ${ctx.buildError}` };
    if (resolve(ctx.distDir) !== join(ROOT, 'dist')) return notChecked('G11 runs against dist/ only');
    const cli = join(ROOT, 'node_modules/@playwright/test/cli.js');
    if (!existsSync(cli)) return notChecked('@playwright/test not installed (npm ci)');
    /** @type {Record<string, Status>} */
    const targets = {};
    let output = '';
    for (const t of ctx.targets) {
      if (MOBILE.includes(t)) { targets[t] = 'not-checked'; continue; }
      const r = exec([process.execPath, cli, 'test', 'test/e2e/shell.spec.js', `--project=${t}`]);
      const missing = /Executable doesn't exist|npx playwright install/.test(r.output);
      targets[t] = r.ok ? 'green' : missing ? 'not-checked' : 'red';
      output += `--- ${t}\n${r.output}\n`;
    }
    const values = Object.values(targets);
    const status = values.length === 0 ? 'not-checked'
      : values.includes('red') ? 'red'
      : values.includes('not-checked') ? 'not-checked' : 'green';
    const detail = Object.entries(targets).map(([t, s]) => `${t} ${s}${MOBILE.includes(t) ? ' (shell CSP suite has no mobile driver)' : ''}`).join(', ') || 'no targets';
    return { status, detail, output, targets };
  },
  G12(ctx) {
    const missing = [];
    const read = (/** @type {string} */ p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null);
    const readme = read('README.md') ?? '';
    const spec = read('docs/SPEC.md');
    if (spec === null) missing.push('docs/SPEC.md');
    const adrDir = join(ROOT, 'docs/adr');
    const adrs = existsSync(adrDir) ? readdirSync(adrDir).filter((f) => /^\d{4}-.+\.md$/.test(f)) : [];
    if (!adrs.length) missing.push('docs/adr/NNNN-*.md');
    const scripts = Object.keys(JSON.parse(read('package.json') ?? '{}').scripts ?? {});
    for (const s of scripts) {
      if (!readme.includes(`npm run ${s}`) && !(s === 'test' && readme.includes('npm test'))) missing.push(`README: npm run ${s}`);
    }
    const id = ctx.piece.id;
    const docs = [readme, spec ?? '', ...adrs.map((f) => readFileSync(join(adrDir, f), 'utf8'))];
    if (!docs.some((d) => d.includes(id))) missing.push(`${id} not mentioned in README, SPEC or an ADR`);
    return missing.length
      ? { status: 'red', detail: `missing: ${missing.join('; ')}` }
      : { status: 'green', detail: `SPEC, ${adrs.length} ADR(s), README covers ${scripts.length} scripts, ${id} documented` };
  },
};

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @param {string} name */
  const opt = (name) => { const k = argv.indexOf(name); return k >= 0 ? argv[k + 1] : undefined; };
  return {
    piece: opt('--piece'),
    pieceFile: opt('--piece-file'),
    targets: opt('--targets') ?? 'all',
    gates: opt('--gates'),
    distDir: resolve(opt('--dist-dir') ?? join(ROOT, 'dist')),
    noBuild: argv.includes('--no-build'),
  };
}

/** @param {any} piece */
function pieceTargets(piece) {
  const verify = String(piece.verify ?? '');
  if (/all 5 targets/i.test(verify)) return [...DESKTOP, ...MOBILE];
  if (/\(Node\)|^Joel$/i.test(verify)) return [];
  return DESKTOP;
}

/** @param {string} spec */
function requestedTargets(spec) {
  if (spec === 'all') return [...DESKTOP, ...MOBILE];
  if (spec === 'desktop') return DESKTOP;
  if (spec === 'mobile') return MOBILE;
  const list = spec.split(',').map((s) => s.trim());
  for (const t of list) if (![...DESKTOP, ...MOBILE].includes(t)) throw new Error(`unknown target ${t}`);
  return list;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.piece && !args.pieceFile) {
    console.error('usage: node tools/gates.mjs --piece <ID> [--targets all|desktop|mobile|list] [--gates G1,..] [--no-build]');
    process.exit(2);
  }
  const file = args.pieceFile ? resolve(args.pieceFile) : join(ROOT, 'docs/plan/pieces', `${args.piece}.json`);
  const piece = JSON.parse(readFileSync(file, 'utf8'));
  if (args.pieceFile) piece.__file = file;
  const required = new Set(piece.acceptance?.gates ?? []);
  const selected = args.gates ? new Set(args.gates.split(',').map((g) => g.trim().toUpperCase())) : null;
  const requested = requestedTargets(args.targets);
  const relevantTargets = pieceTargets(piece);
  const targets = requested.filter((t) => relevantTargets.includes(t));
  const skippedTargets = requested.filter((t) => !relevantTargets.includes(t));

  /** @type {Ctx} */
  const ctx = { piece, targets, distDir: args.distDir, log: !args.pieceFile && args.distDir === join(ROOT, 'dist'), built: false, buildError: '' };

  console.log(`gates: piece ${piece.id} (${piece.title ?? ''})`);
  console.log(`targets: ${targets.join(', ') || 'none'}${skippedTargets.length ? `; not relevant for this piece (verify: ${piece.verify}): ${skippedTargets.join(', ')}` : ''}`);
  if (args.noBuild) {
    ctx.built = existsSync(join(ctx.distDir, 'blank.html'));
    ctx.buildError = ctx.built ? '' : 'no dist (--no-build)';
  } else {
    const b = exec([process.execPath, 'tools/build.mjs', '--out', ctx.distDir]);
    ctx.built = b.ok;
    ctx.buildError = lastLine(b.output);
    console.log(b.ok ? lastLine(b.output) : `build FAILED: ${b.output.trim()}`);
  }

  /** @type {{gate: string, relevant: boolean, seconds: number} & Result}[]} */
  const rows = [];
  for (const gate of GATES) {
    const relevant = required.has(gate) && (!selected || selected.has(gate));
    if (!relevant) {
      const why = !required.has(gate) ? 'not a gate of this piece' : 'not selected (--gates)';
      rows.push({ gate, relevant, seconds: 0, status: 'n.a.', detail: why });
      continue;
    }
    const t0 = Date.now();
    let result;
    try {
      result = RUNNERS[gate](ctx);
    } catch (err) {
      result = { status: /** @type {Status} */ ('red'), detail: `runner crashed: ${err instanceof Error ? err.message : err}` };
    }
    rows.push({ gate, relevant, seconds: (Date.now() - t0) / 1000, ...result });
  }

  const w = Math.max(...rows.map((r) => DESCRIPTIONS[/** @type {keyof typeof DESCRIPTIONS} */ (r.gate)].length));
  console.log('');
  console.log(`${'Gate'.padEnd(5)} ${'Check'.padEnd(w)}  ${'Status'.padEnd(11)} ${'Time'.padStart(6)}  Detail`);
  for (const r of rows) {
    const desc = DESCRIPTIONS[/** @type {keyof typeof DESCRIPTIONS} */ (r.gate)];
    const time = r.relevant ? `${r.seconds.toFixed(1)}s` : '';
    console.log(`${r.gate.padEnd(5)} ${desc.padEnd(w)}  ${r.status.padEnd(11)} ${time.padStart(6)}  ${r.detail}`);
  }
  for (const r of rows.filter((x) => x.status === 'red' && x.output)) {
    console.log(`\n--- ${r.gate} output (last 40 lines)\n${(r.output ?? '').trim().split('\n').slice(-40).join('\n')}`);
  }

  const rig = readReports();
  const rigNames = Object.keys(rig).filter((n) => targets.some((t) => n.includes(t))).sort();
  if (rigNames.length && rows.some((r) => r.relevant && ['G4', 'G5', 'G6'].includes(r.gate))) {
    console.log('\nrig reports (test-results/rig/, newest run per suite and target):');
    for (const n of rigNames) console.log(`  ${summaryLine(rig[n])}${rig[n].startedAt ? ` [${rig[n].startedAt}]` : ''}`);
    for (const l of digestLines(rig)) console.log(`  ${l}`);
  }

  const red = rows.filter((r) => r.relevant && r.status === 'red').map((r) => r.gate);
  const unchecked = rows.filter((r) => r.relevant && r.status === 'not-checked').map((r) => r.gate);
  const pass = red.length === 0 && unchecked.length === 0;
  console.log(`\nresult: ${pass ? 'PASS' : 'FAIL'}${red.length ? ` - red: ${red.join(', ')}` : ''}${unchecked.length ? ` - not-checked: ${unchecked.join(', ')}` : ''}`);

  const outDir = join(ROOT, 'test-results/gates');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${piece.id}.json`), `${JSON.stringify({
    piece: piece.id, targets, pass,
    gates: rows.map(({ output: _output, ...r }) => r),
  }, null, 2)}\n`);
  console.log(`report: ${relative(process.cwd(), join(outDir, `${piece.id}.json`))}`);
  process.exit(pass ? 0 : 1);
}

main();
