// Rig reports: JSON + markdown per run in test-results/rig/ (gitignored),
// summarized by tools/gates.mjs and `node tools/rig.mjs summary`.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './run.mjs';

export const REPORTS = join(ROOT, 'test-results/rig');

/** @param {any} r */
export function reportName(r) {
  return r.kind === 'fuzz' ? `fuzz-${r.target}-${r.subject}` : `${r.kind}-${r.target}`;
}

/** @param {unknown} v */
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, '\\n');
/** @param {any} s */
const stepText = (s) => JSON.stringify(s);

/** @param {any} r */
function corpusMd(r) {
  const L = [];
  L.push(`# Corpus — ${r.target}`, '');
  L.push(`Browser: ${r.browser} · started ${r.startedAt} · ${(r.durationMs / 1000).toFixed(1)} s`, '');
  L.push(`Scenarios: ${r.counts.corpus} corpus + ${r.counts.regressions} regressions (${r.counts.run} run)`, '');
  if (r.keyboard) L.push(`Keyboard probe: ${r.keyboard.ok ? 'ok' : 'FAILED'} (${cell(r.keyboard.detail)})`, '');
  if (r.sessionRecoveries) L.push(`WebDriver session recoveries after a hung command: ${r.sessionRecoveries}`, '');
  L.push('| Subject | complete | incomplete | error | not-run |', '|---|---|---|---|---|');
  for (const [name, t] of [['native (B1)', r.native], ['ProseMirror (B2)', r.pm]]) {
    if (t) L.push(`| ${name} | ${t.complete ?? 0} | ${t.incomplete ?? 0} | ${t.error ?? 0} | ${t['not-run'] ?? 0} |`);
  }
  L.push('');
  if (r.pm?.info) {
    const i = r.pm.info;
    L.push(`ProseMirror: prosemirror-view ${i.prosemirrorView?.version ?? '?'} (${i.method ?? i.error}); bundle sha256 ${i.bundle?.sha256?.slice(0, 16) ?? '?'}…, Last-Modified ${i.bundle?.lastModified ?? '?'}`, '');
  }
  L.push('## Our document', '', '| Variant | loaded | version | API | surface | I1–I8 |', '|---|---|---|---|---|---|');
  for (const o of r.ours) {
    const checks = (o.checks ?? []).map((/** @type {any} */ c) => `${c.id} ${c.status}`).join(', ');
    L.push(`| ${o.variant} | ${o.loaded} | ${o.version ?? ''} | ${(o.api ?? []).join(', ')} | ${o.surface ? 'yes' : cell(o.surfaceReason ?? o.error)} | ${checks} |`);
  }
  L.push('');
  if (r.planted.length) {
    L.push('## Planted-bug control (stub vs native)', '');
    for (const p of r.planted) L.push(`- ${p.scenario}: ${p.detected ? `detected at step ${p.detail.step}: ${cell(p.detail.detail)}` : 'NOT detected'}`);
    L.push('');
  }
  L.push(`## Unsupported by driver (${r.unsupported.length})`, '');
  /** @type {Record<string, number>} */
  const byKind = {};
  for (const u of r.unsupported) byKind[`${u.subject}/${u.kind}: ${u.reason}`] = (byKind[`${u.subject}/${u.kind}: ${u.reason}`] ?? 0) + 1;
  for (const [k, n] of Object.entries(byKind)) L.push(`- ${n} × ${cell(k)}`);
  L.push('', `## Errors (${r.errors.length})`, '');
  for (const e of r.errors) L.push(`- ${e.scenario} / ${e.subject} / step ${e.step}: ${cell(e.reason)}`);
  L.push('', '## inputType coverage (Phase-1 matrix)', '', '| inputType | scenarios | fired on native in |', '|---|---|---|');
  for (const [t, c] of Object.entries(r.coverage)) L.push(`| ${t} | ${c.scenarios.length} | ${c.firedIn.length ? c.firedIn.length + ' scenario(s)' : 'not emitted on this target under this driver'} |`);
  L.push('', '## Steps (target × scenario × step)', '');
  for (const res of r.results) {
    L.push(`### ${res.id}`, '');
    for (const [subject, t] of Object.entries(res.subjects)) {
      L.push(`${subject}: **${t.status}**${t.reason ? ` (${cell(t.reason)})` : ''}`, '');
      if (!t.steps?.length) continue;
      L.push('| # | step | status | blocks | selection | beforeinput |', '|---|---|---|---|---|---|');
      if (t.initial) L.push(`| init | | | ${cell(JSON.stringify(t.initial.blocks.map((/** @type {any} */ b) => [b.t, b.s, b.m || undefined])))} | ${cell(JSON.stringify(t.initial.sel))} | |`);
      for (const s of t.steps) {
        const bi = (s.snap?.events ?? []).filter((/** @type {any} */ e) => e.e === 'beforeinput').map((/** @type {any} */ e) => e.it).join(' ');
        L.push(`| ${s.i} | ${cell(stepText(s.step))} | ${s.status}${s.reason ? `: ${cell(s.reason)}` : ''} | ${s.snap ? cell(JSON.stringify(s.snap.blocks.map((/** @type {any} */ b) => [b.t, b.s, b.m || undefined]))) : ''} | ${s.snap ? cell(JSON.stringify(s.snap.sel)) : ''} | ${cell(bi)} |`);
      }
      L.push('');
    }
  }
  return L.join('\n');
}

/** @param {any} r */
function fuzzMd(r) {
  return [
    `# Fuzz — ${r.target} / ${r.subject}`, '',
    `Browser: ${r.browser} · started ${r.startedAt}`, '',
    '| Measure | Value |', '|---|---|',
    `| seeds | ${r.seeds.first} … ${r.seeds.first + r.seeds.count - 1} (${r.seeds.count}) |`,
    `| action-list digest | \`${r.listDigest}\` (seeds ${r.seeds.first} … ${r.seeds.first + (r.listDigestSeeds ?? r.seeds.count) - 1}) |`,
    `| generator in this browser | ${r.generatorInBrowser.checked} seeds, ${r.generatorInBrowser.mismatches} mismatches |`,
    `| duration | ${(r.durationMs / 1000).toFixed(1)} s (${r.workers} worker(s)) |`,
    `| throughput | ${r.sequencesPerSecond} sequences/s, ${r.stepsPerSecond} steps/s |`,
    `| steps | ${r.steps.generated} generated, ${r.steps.executed} executed, ${r.steps.unsupported} unsupported-by-driver |`,
    `| statuses | ${cell(JSON.stringify(r.statuses))} |`,
    `| violations | ${cell(JSON.stringify(r.violations))} |`,
    `| oracle quirks (recorded, not violations) | ${cell(JSON.stringify(r.oracleQuirks ?? {}))} |`,
    `| checks | ${cell(r.checks)}; ${r.inactiveChecks} inactive check evaluations |`,
    '',
    `## Errors (${r.errors.length})`, '',
    ...r.errors.map((/** @type {any} */ e) => `- seed ${e.seed}: ${cell(e.error)}`),
    '',
    '## Sequences', '', '| seed | steps | executed | unsupported | status | ms | action hash |', '|---|---|---|---|---|---|---|',
    ...r.runs.map((/** @type {any} */ x) => `| ${x.seed} | ${x.steps} | ${x.executed} | ${x.unsupported} | ${x.status} | ${x.ms} | ${x.hash.slice(0, 16)} |`),
  ].join('\n');
}

/** @param {any} r */
function plantedMd(r) {
  const L = [`# Planted bug — ${r.target}`, '', `Browser: ${r.browser} · started ${r.startedAt} · ${(r.durationMs / 1000).toFixed(1)} s`, ''];
  if (r.notRunnable) L.push(`Not runnable on this target: ${cell(r.notRunnable)}`);
  else if (!r.detected) L.push(`NOT detected in ${r.seedsTried} seeds.`);
  else {
    L.push(`Detected at seed ${r.found.seed}, step ${r.found.step} of ${r.found.length} (${r.seedsTried} seed(s) tried, ${(r.detectMs / 1000).toFixed(1)} s): ${cell(r.found.detail)}`, '');
    const s = r.shrunk;
    L.push(`Shrunk to **${s.count} step(s)** in ${s.runs} runs (${(s.ms / 1000).toFixed(1)} s); reproduces: ${s.reproduces}; native-vs-native on the shrunk steps diverges: ${s.controlDiverges}.`, '');
    L.push('```json', JSON.stringify(s.steps, null, 1), '```', '');
    if (s.file) L.push(`Saved: \`${s.file}\``, '');
  }
  L.push(`Control: native vs native over ${r.control.seeds} seeds: ${r.control.divergences} divergence(s).`);
  return L.join('\n');
}

/**
 * Writes `<name>.json` and `<name>.md`.
 * @param {any} r
 */
export function writeReport(r) {
  mkdirSync(REPORTS, { recursive: true });
  const name = reportName(r);
  writeFileSync(join(REPORTS, `${name}.json`), `${JSON.stringify(r, null, 1)}\n`);
  const md = r.error ? `# ${r.kind} — ${r.target}\n\nERROR: ${r.error}` : r.inactive ? `# ${r.kind} — ${r.target} / ${r.subject}\n\nInactive: ${r.inactive}` : r.kind === 'corpus' ? corpusMd(r) : r.kind === 'fuzz' ? fuzzMd(r) : plantedMd(r);
  writeFileSync(join(REPORTS, `${name}.md`), `${md}\n`);
  return { json: `test-results/rig/${name}.json`, md: `test-results/rig/${name}.md` };
}

/** All reports currently on disk, by name. */
export function readReports() {
  if (!existsSync(REPORTS)) return {};
  /** @type {Record<string, any>} */
  const out = {};
  for (const f of readdirSync(REPORTS).filter((n) => n.endsWith('.json'))) {
    try {
      out[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(REPORTS, f), 'utf8'));
    } catch { /* partial file */ }
  }
  return out;
}

/** One line per report, for the gate table and the summary command. @param {any} r */
export function summaryLine(r) {
  if (r.inactive) return `${r.kind} ${r.target}/${r.subject}: inactive - ${r.inactive}`;
  if (r.error) return `${r.kind} ${r.target}${r.subject && r.kind === 'fuzz' ? '/' + r.subject : ''}: ERROR ${r.error}`;
  const kb = r.keyboard && !r.keyboard.ok ? ' [keyboard probe FAILED]' : '';
  if (r.kind === 'corpus') {
    const pm = r.pm ? `, pm ${r.pm.complete}/${r.pm.incomplete}/${r.pm.error}` : '';
    return `corpus ${r.target}: ${r.counts.run} scenarios, native complete/incomplete/error ${r.native.complete}/${r.native.incomplete}/${r.native.error}${pm}, ${r.unsupported.length} unsupported step(s), ${r.errors.length} error(s), planted control ${r.planted.filter((/** @type {any} */ p) => p.detected).length}/${r.planted.length}${kb}`;
  }
  if (r.kind === 'fuzz') {
    return `fuzz ${r.target}/${r.subject}: ${r.seeds.count} seq from seed ${r.seeds.first} in ${(r.durationMs / 1000).toFixed(1)} s (${r.sequencesPerSecond} seq/s, ${r.stepsPerSecond} steps/s), digest ${r.listDigest.slice(0, 12)} over ${r.listDigestSeeds ?? r.seeds.count} seeds, generator mismatches ${r.generatorInBrowser.mismatches}, errors ${r.statuses.error ?? 0}, violations ${JSON.stringify(r.violations)}${kb}`;
  }
  if (r.notRunnable) return `planted ${r.target}: not runnable - ${r.notRunnable}`;
  return `planted ${r.target}: ${r.detected ? `detected (seed ${r.found.seed}, step ${r.found.step}), shrunk to ${r.shrunk.count} step(s), reproduces ${r.shrunk.reproduces}` : 'NOT detected'}, control divergences ${r.control.divergences}/${r.control.seeds}${kb}`;
}

/**
 * Same seeds -> same action lists on every target: compares the action-list
 * digests of all fuzz reports that cover the same seed range.
 * @param {Record<string, any>} reports
 * @returns {string[]}
 */
export function digestLines(reports) {
  /** @type {Map<string, {target: string, digest: string}[]>} */
  const groups = new Map();
  for (const r of Object.values(reports)) {
    if (r.kind !== 'fuzz' || !r.listDigest) continue;
    const key = `${r.seeds.first}+${r.listDigestSeeds ?? r.seeds.count}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push({ target: `${r.target}/${r.subject}`, digest: r.listDigest });
  }
  return [...groups].map(([key, list]) => {
    const distinct = new Set(list.map((x) => x.digest));
    const [first, n] = key.split('+').map(Number);
    return `action lists for seeds ${first}..${first + n - 1}: ${distinct.size === 1 ? `identical digest ${list[0].digest.slice(0, 16)} on` : 'DIFFERENT digests on'} ${list.map((x) => x.target).join(', ')}`;
  });
}
