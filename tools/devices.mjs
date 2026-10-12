// Device lifecycle for the mobile targets (piece E1-002). Node built-ins only.
//
//   node tools/devices.mjs up|down|status [--ios-only|--android-only]
//
// Touches exactly two devices and nothing else:
//   iOS simulator "Ether iPhone 17 Pro" (iPhone 17 Pro, iOS 26.5)  - created if missing, booted, shut down
//   Android AVD "ether" (system-images;android-36;google_apis;arm64-v8a, pixel_6)
//                                                                   - created if missing, started headless, killed
// Every simctl / adb / emulator / avdmanager call has a timeout (test/rig/sh.mjs).
// `up` and `down` compare all other simulators and AVDs before and after and
// fail if anything else changed; the comparison is written to
// test-results/devices/<command>-<time>.json.

import { closeSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timed } from '../test/rig/sh.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const IOS_NAME = 'Ether iPhone 17 Pro';
const IOS_RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-26-5';
const IOS_TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro';
export const AVD = 'ether';
const AVD_IMAGE = 'system-images;android-36;google_apis;arm64-v8a';
/** Console port of our emulator; its adb serial is emulator-<port>. */
export const EMU_PORT = 5580;
export const SERIAL = `emulator-${EMU_PORT}`;
const SDK = process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk');
const ADB = join(SDK, 'platform-tools/adb');
const EMULATOR = join(SDK, 'emulator/emulator');
const AVDMANAGER = join(SDK, 'cmdline-tools/latest/bin/avdmanager');
const STUDIO_JBR = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
const CHROME_FLAGS = '_ --disable-fre --no-default-browser-check --no-first-run';

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @param {string[]} args @param {number} [seconds] */
const simctl = (args, seconds = 120) => timed(seconds, 'xcrun', ['simctl', ...args]);
/** @param {string[]} args @param {number} [seconds] */
const adb = (args, seconds = 30) => timed(seconds, ADB, args);

// ---- inventory ----------------------------------------------------------------

/** All simulators: [{udid, name, state, runtime}]. */
export function simulators() {
  const r = simctl(['list', 'devices', '-j'], 60);
  if (r.status !== 0) throw new Error(`simctl list failed: ${r.output}`);
  const j = JSON.parse(r.stdout);
  /** @type {{udid: string, name: string, state: string, runtime: string}[]} */
  const out = [];
  for (const [runtime, list] of Object.entries(j.devices)) {
    for (const d of /** @type {any[]} */ (list)) out.push({ udid: d.udid, name: d.name, state: d.state, runtime });
  }
  return out;
}

/** The Ether simulator(s) by name. */
export function etherSims() {
  return simulators().filter((d) => d.name === IOS_NAME);
}

/** AVD names known to the emulator. */
export function avds() {
  const r = timed(60, EMULATOR, ['-list-avds']);
  if (r.status !== 0) throw new Error(`emulator -list-avds failed: ${r.output}`);
  return r.stdout.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('INFO'));
}

/** Running emulators: [{serial, avd}]. */
export function runningEmulators() {
  const r = adb(['devices'], 30);
  if (r.status !== 0) throw new Error(`adb devices failed: ${r.output}`);
  const serials = r.stdout.split('\n').map((l) => l.split('\t')[0].trim()).filter((s) => /^emulator-\d+$/.test(s));
  return serials.map((serial) => {
    const n = adb(['-s', serial, 'emu', 'avd', 'name'], 15);
    return { serial, avd: n.stdout.split('\n')[0].trim() };
  });
}

/** Everything except our two devices, for the before/after comparison. */
export function others() {
  return {
    simulators: simulators().filter((d) => d.name !== IOS_NAME).map((d) => `${d.udid} ${d.name} ${d.state}`).sort(),
    avds: avds().filter((a) => a !== AVD).sort(),
    // Our console port is ours even while the emulator shuts down (its AVD name is then empty).
    running: runningEmulators().filter((e) => e.avd !== AVD && e.serial !== SERIAL).map((e) => `${e.serial} ${e.avd}`).sort(),
  };
}

// ---- iOS ------------------------------------------------------------------------

/** UDID of the Ether simulator; creates it when missing. */
export function iosEnsure() {
  const found = etherSims();
  if (found.length > 1) throw new Error(`${found.length} simulators named "${IOS_NAME}" - refusing to guess`);
  if (found.length === 1) return found[0].udid;
  const r = simctl(['create', IOS_NAME, IOS_TYPE, IOS_RUNTIME], 120);
  if (r.status !== 0) throw new Error(`simctl create failed: ${r.output}`);
  return r.stdout.trim();
}

/** Boots the Ether simulator and waits until it is usable. */
export function iosUp() {
  const udid = iosEnsure();
  const state = etherSims()[0]?.state;
  if (state !== 'Booted') {
    const b = simctl(['boot', udid], 120);
    if (b.status !== 0 && !/current state: Booted/.test(b.output)) throw new Error(`simctl boot failed: ${b.output}`);
  }
  const s = simctl(['bootstatus', udid, '-b'], 300);
  if (s.status !== 0) throw new Error(`simctl bootstatus failed: ${s.output}`);
  return { udid, state: 'Booted', wasBooted: state === 'Booted' };
}

export function iosDown() {
  const found = etherSims();
  if (!found.length) return { state: 'absent' };
  if (found[0].state === 'Shutdown') return { udid: found[0].udid, state: 'Shutdown' };
  const r = simctl(['shutdown', found[0].udid], 120);
  if (r.status !== 0 && !/current state: Shutdown/.test(r.output)) throw new Error(`simctl shutdown failed: ${r.output}`);
  return { udid: found[0].udid, state: 'Shutdown' };
}

// ---- Android --------------------------------------------------------------------

export function androidEnsure() {
  if (avds().includes(AVD)) return;
  const r = timed(180, AVDMANAGER, ['create', 'avd', '-n', AVD, '-k', AVD_IMAGE, '-d', 'pixel_6'], {
    input: 'no\n',
    env: { JAVA_HOME: process.env.JAVA_HOME ?? STUDIO_JBR },
  });
  if (r.status !== 0) throw new Error(`avdmanager create failed: ${r.output}`);
}

/** Serial of our running emulator, or null. */
export function androidSerial() {
  return runningEmulators().find((e) => e.avd === AVD)?.serial ?? null;
}

/**
 * Starts the emulator process headless. It is a daemon, so instead of a
 * per-call timeout it gets a boot watchdog: if the device has not booted
 * within `seconds`, the process is killed.
 * @param {number} seconds
 */
async function emulatorWatchdog(seconds) {
  const logDir = join(ROOT, 'test-results/devices');
  mkdirSync(logDir, { recursive: true });
  const fd = openSync(join(logDir, 'emulator.log'), 'a');
  const proc = spawn(EMULATOR, ['-avd', AVD, '-port', String(EMU_PORT), '-no-window', '-no-audio', '-no-boot-anim', '-no-snapshot-save'], {
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  proc.unref();
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`emulator exited with ${proc.exitCode} (see test-results/devices/emulator.log)`);
    const r = adb(['-s', SERIAL, 'shell', 'getprop', 'sys.boot_completed'], 15);
    if (r.status === 0 && r.stdout.trim() === '1') return;
    await sleep(2000);
  }
  try { process.kill(/** @type {number} */ (proc.pid), 'SIGKILL'); } catch { /* gone */ }
  throw new Error(`emulator did not boot within ${seconds} s (killed)`);
}

/** Starts the AVD (if needed) and Chrome with remote debugging reachable. */
export async function androidUp() {
  androidEnsure();
  let serial = androidSerial();
  const wasRunning = !!serial;
  if (serial && serial !== SERIAL) throw new Error(`AVD ${AVD} already runs as ${serial}, expected ${SERIAL}`);
  if (!serial) {
    if (runningEmulators().some((e) => e.serial === SERIAL)) throw new Error(`${SERIAL} is taken by another AVD`);
    await emulatorWatchdog(300);
    serial = SERIAL;
  }
  // Chrome reads its flags from this file on userdebug images (scout, dossier platform.md 4).
  const f = adb(['-s', serial, 'shell', `echo '${CHROME_FLAGS}' > /data/local/tmp/chrome-command-line`], 30);
  if (f.status !== 0) throw new Error(`chrome flags: ${f.output}`);
  return { serial, wasRunning };
}

/**
 * Opens Chrome on the device and forwards its DevTools socket to cdpPort;
 * makes the host test server reachable from the device (adb reverse).
 * @param {number} cdpPort @param {number} serverPort
 */
export async function androidChrome(cdpPort, serverPort) {
  const serial = androidSerial();
  if (!serial) throw new Error(`AVD ${AVD} is not running (node tools/devices.mjs up)`);
  const st = adb(['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'about:blank', 'com.android.chrome'], 30);
  if (st.status !== 0) throw new Error(`am start chrome: ${st.output}`);
  let socket = false;
  for (let i = 0; i < 30 && !socket; i++) {
    const r = adb(['-s', serial, 'shell', 'cat', '/proc/net/unix'], 15);
    socket = r.stdout.includes('@chrome_devtools_remote');
    if (!socket) await sleep(1000);
  }
  if (!socket) throw new Error('chrome_devtools_remote socket did not appear');
  const fw = adb(['-s', serial, 'forward', `tcp:${cdpPort}`, 'localabstract:chrome_devtools_remote'], 30);
  if (fw.status !== 0) throw new Error(`adb forward: ${fw.output}`);
  const rv = adb(['-s', serial, 'reverse', `tcp:${serverPort}`, `tcp:${serverPort}`], 30);
  if (rv.status !== 0) throw new Error(`adb reverse: ${rv.output}`);
  return serial;
}

/** @param {number} cdpPort @param {number} serverPort */
export function androidUnforward(cdpPort, serverPort) {
  const serial = androidSerial();
  if (!serial) return;
  adb(['-s', serial, 'forward', '--remove', `tcp:${cdpPort}`], 30);
  adb(['-s', serial, 'reverse', '--remove', `tcp:${serverPort}`], 30);
}

export async function androidDown() {
  const serial = androidSerial();
  if (!serial) return { state: 'stopped' };
  adb(['-s', serial, 'forward', '--remove-all'], 30);
  adb(['-s', serial, 'reverse', '--remove-all'], 30);
  adb(['-s', serial, 'emu', 'kill'], 60);
  for (let i = 0; i < 60; i++) {
    if (!runningEmulators().some((e) => e.serial === serial)) return { state: 'stopped', serial };
    await sleep(1000);
  }
  throw new Error(`${serial} still running after emu kill`);
}

// ---- CLI ------------------------------------------------------------------------

export function status() {
  const sims = etherSims();
  const serial = androidSerial();
  return {
    ios: sims.length ? { name: IOS_NAME, udid: sims[0].udid, state: sims[0].state, runtime: sims[0].runtime } : { name: IOS_NAME, state: 'absent' },
    android: { avd: AVD, exists: avds().includes(AVD), running: !!serial, serial },
  };
}

/**
 * Runs `fn` and proves that no other simulator or AVD changed.
 * @param {string} name @param {() => Promise<any>} fn
 */
export async function guarded(name, fn) {
  const before = others();
  let result;
  let error = null;
  try {
    result = await fn();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const after = others();
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  const dir = join(ROOT, 'test-results/devices');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = { command: name, at: new Date().toISOString(), result, error, othersUnchanged: unchanged, before, after, status: status() };
  writeFileSync(join(dir, `${name}-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function main() {
  const [cmd, ...flags] = process.argv.slice(2);
  const ios = !flags.includes('--android-only');
  const android = !flags.includes('--ios-only');
  if (cmd === 'status') {
    console.log(JSON.stringify({ ...status(), others: others() }, null, 2));
    return;
  }
  if (cmd !== 'up' && cmd !== 'down') {
    console.error('usage: node tools/devices.mjs up|down|status [--ios-only|--android-only]');
    process.exit(2);
  }
  const report = await guarded(cmd, async () => {
    /** @type {Record<string, any>} */
    const out = {};
    if (cmd === 'up') {
      if (ios) out.ios = iosUp();
      if (android) out.android = await androidUp();
    } else {
      if (ios) out.ios = iosDown();
      if (android) out.android = await androidDown();
    }
    return out;
  });
  console.log(`devices ${cmd}: ${report.error ? `FAILED: ${report.error}` : 'ok'}`);
  console.log(JSON.stringify(report.status, null, 2));
  console.log(`other simulators (${report.after.simulators.length}), AVDs (${report.after.avds.length}) and running emulators (${report.after.running.length}): ${report.othersUnchanged ? 'unchanged' : 'CHANGED'}`);
  if (!report.othersUnchanged) console.log(JSON.stringify({ before: report.before, after: report.after }, null, 2));
  process.exit(report.error || !report.othersUnchanged ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
