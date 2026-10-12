// Measurement rig CLI (piece E1-002). Builds nothing; run `npm run build`
// first when our document should be probed.
//
//   node tools/rig.mjs corpus  [--targets all|desktop|mobile|<list>] [--only id,id] [--workers 4] [--no-pm]
//   node tools/rig.mjs fuzz    [--targets ...] [--subject native] [--count 1000] [--seed 1] [--workers 4]
//                              [--hash-count n] (check the generator in the browser for n seeds)
//   node tools/rig.mjs planted [--targets ...] [--max-seeds 300] [--control 10] [--no-save]
//   node tools/rig.mjs summary
//   common: [--keep-devices] (leave the simulator/emulator running afterwards)
//
// Reports: test-results/rig/<suite>-<target>[-<subject>].json and .md.
// The static server is started and stopped here (port ETHER_RIG_PORT, default
// 41741; the Android emulator reaches it through adb reverse).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { digestLines, readReports, summaryLine, writeReport } from '../test/rig/report.mjs';
import { probeKeyboard, ROOT, startServer, subjectUrls } from '../test/rig/run.mjs';
import { corpusSuite, fuzzSuite, plantedSuite, pmInfo } from '../test/rig/suites.mjs';
import { DESKTOP, openTarget, parseTargets } from '../test/rig/targets.mjs';

/** @param {string[]} argv */
function parse(argv) {
  /** @param {string} n @param {string} [d] */
  const opt = (n, d) => { const k = argv.indexOf(n); return k >= 0 ? argv[k + 1] : d; };
  return {
    cmd: argv[0],
    targets: parseTargets(opt('--targets', 'desktop') ?? 'desktop'),
    only: opt('--only')?.split(',').map((s) => s.trim()),
    workers: Number(opt('--workers', '4')),
    subject: opt('--subject', 'native') ?? 'native',
    count: Number(opt('--count', '1000')),
    hashCount: Number(opt('--hash-count', '0')),
    seed: Number(opt('--seed', '1')),
    maxSeeds: Number(opt('--max-seeds', '300')),
    control: Number(opt('--control', '10')),
    save: !argv.includes('--no-save'),
    pm: !argv.includes('--no-pm'),
    keepDevices: argv.includes('--keep-devices'),
  };
}

async function main() {
  const a = parse(process.argv.slice(2));
  if (a.cmd === 'summary') {
    const reports = readReports();
    for (const name of Object.keys(reports).sort()) console.log(summaryLine(reports[name]));
    for (const l of digestLines(reports)) console.log(l);
    return 0;
  }
  if (!['corpus', 'fuzz', 'planted'].includes(a.cmd)) {
    console.error('usage: node tools/rig.mjs corpus|fuzz|planted|summary [--targets all|desktop|mobile|<list>] ...');
    return 2;
  }
  if (a.workers > 4) throw new Error('at most 4 workers (PHASE-1 run rules)');
  if (!existsSync(join(ROOT, 'dist/blank.html'))) console.warn('rig: dist/blank.html missing - our document cannot be probed (npm run build)');
  const server = await startServer(Number(process.env.ETHER_RIG_PORT ?? 41741));
  const pm = a.cmd === 'corpus' && a.pm ? await pmInfo() : null;
  let failed = false;
  try {
    for (const target of a.targets) {
      const t0 = Date.now();
      let opened;
      try {
        opened = await openTarget(target, server, { keepDevices: a.keepDevices });
      } catch (e) {
        failed = true;
        console.log(`${target}: driver failed to start: ${e instanceof Error ? e.message : e}`);
        writeReport({ kind: a.cmd, target, subject: a.subject, error: `driver failed to start: ${e instanceof Error ? e.message : e}`, startedAt: new Date(t0).toISOString() });
        continue;
      }
      const urls = subjectUrls(server.base, DESKTOP.includes(target));
      if (!a.pm) delete urls.pm;
      try {
        opened.driver.keyboard = await probeKeyboard(opened.driver, urls);
        if (!opened.driver.keyboard.ok) console.log(`${target}: keyboard probe FAILED - ${opened.driver.keyboard.detail}; keyboard steps are reported unsupported-by-driver`);
        let r;
        if (a.cmd === 'corpus') {
          r = await corpusSuite(opened.driver, urls, { workers: a.workers, only: a.only, pm });
        } else if (a.cmd === 'fuzz') {
          r = await fuzzSuite(opened.driver, urls, { subject: a.subject, count: a.count, seed: a.seed, workers: a.workers, hashCount: a.hashCount });
        } else {
          r = await plantedSuite(opened.driver, urls, { maxSeeds: a.maxSeeds, seed: a.seed, controlSeeds: a.control, save: a.save });
        }
        r.notes = opened.notes;
        r.keyboard = opened.driver.keyboard;
        const files = writeReport(r);
        console.log(summaryLine(r));
        console.log(`  ${files.json}, ${files.md}`);
      } catch (e) {
        failed = true;
        console.log(`${target}: ${a.cmd} crashed: ${e instanceof Error ? e.stack : e}`);
      } finally {
        await opened.close().catch((e) => console.log(`${target}: teardown: ${e instanceof Error ? e.message : e}`));
      }
    }
  } finally {
    await server.close();
  }
  return failed ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => {
  console.error(e);
  process.exit(1);
});
