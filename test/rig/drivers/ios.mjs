// iOS driver: Safari on the simulator "Ether iPhone 17 Pro" without
// safaridriver (piece E1-002, ADR 0004).
//
//   scripts      Web Inspector protocol over the simulator's webinspectord socket (wir.mjs)
//   tap, text    XCUITest runner test/rig/ios-typer (real touches and hardware key events)
//   keys         Backspace, Enter (typed), plain arrows; modifiers, forward Delete and
//                shortcuts are unsupported-by-driver (IosPage.canKey)
//   paste        unsupported-by-driver: Command+V needs a modifier (see canKey)
//   composition  unsupported-by-driver (no IME automation)
//   drag         unsupported-by-driver
//
// Why not safaridriver: a WebDriver session puts Safari into automation mode,
// which blocks real touches and keys; WebDriver's own key actions reach the
// page only as keydown/keypress/keyup and insert no text (measured, ADR 0004).
// The inspector connection leaves Safari in normal mode.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timed } from '../sh.mjs';
import { InspectorPage, inspectorSocket } from './wir.mjs';

export const IOS_DEVICE = 'Ether iPhone 17 Pro';
export const IOS_UDID = '4BA9F329-8BB2-4B14-8572-8E8ABBAF4B1F';
const SAFARI = 'com.apple.mobilesafari';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const TYPER_SRC = join(ROOT, 'test/rig/ios-typer');
const TYPER_OUT = join(ROOT, 'test-results/ios-typer');

/** Keys typed as text by XCUITest (typeText), see IosPage.canKey. */
/** @type {Record<string, string>} */
const TYPED_KEYS = { Backspace: '\b', Enter: '\n' };
const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Newest modification time under a directory (build staleness check). */
function newest(/** @type {string} */ dir) {
  let t = 0;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const s = statSync(p);
    t = Math.max(t, s.isDirectory() ? newest(p) : s.mtimeMs);
  }
  return t;
}

/** Builds the XCUITest runner for the Ether simulator unless an up-to-date build exists. */
function buildTyper() {
  const dd = join(TYPER_OUT, 'dd');
  const products = join(dd, 'Build/Products');
  const find = () => (existsSync(products) ? readdirSync(products).find((n) => n.endsWith('.xctestrun')) : undefined);
  const have = find();
  if (have && statSync(join(products, have)).mtimeMs > newest(TYPER_SRC)) return join(products, have);
  const r = timed(900, 'xcodebuild', ['build-for-testing', '-project', join(TYPER_SRC, 'EtherTyper.xcodeproj'), '-scheme', 'TyperUITests',
    '-destination', `id=${IOS_UDID}`, '-derivedDataPath', dd, '-quiet']);
  const built = find();
  if (r.status !== 0 || !built) throw new Error(`ios-typer build failed: ${r.output.split('\n').slice(-15).join('\n')}`);
  return join(products, built);
}

/** The XCUITest input runner: one long-running UI test fed through files. */
class Typer {
  /** @param {string} xctestrun */
  constructor(xctestrun) {
    this.dir = join(TYPER_OUT, `io-${process.pid}-${Date.now()}`);
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.seq = 0;
    this.log = '';
    // The runner ends by itself after 300 s without a command, so a rig that
    // dies leaves nothing running on the simulator.
    this.proc = spawn('xcodebuild', ['test-without-building', '-xctestrun', xctestrun, '-destination', `id=${IOS_UDID}`,
      '-derivedDataPath', join(TYPER_OUT, 'dd-run'), '-resultBundlePath', join(this.dir, 'result.xcresult')], {
      env: { ...process.env, TEST_RUNNER_ETHER_TYPER_DIR: this.dir, TEST_RUNNER_ETHER_TYPER_IDLE: '300' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    /** @param {Buffer} b */
    const keep = (b) => { this.log = (this.log + b).slice(-20_000); };
    this.proc.stdout?.on('data', keep);
    this.proc.stderr?.on('data', keep);
  }

  async ready(ms = 300_000) {
    const t0 = Date.now();
    while (!existsSync(join(this.dir, 'ready'))) {
      if (this.proc.exitCode !== null) throw new Error(`ios-typer exited ${this.proc.exitCode}: ${this.log.slice(-1500)}`);
      if (Date.now() - t0 > ms) throw new Error(`ios-typer not ready within ${ms / 1000} s: ${this.log.slice(-1500)}`);
      await sleep(200);
    }
  }

  /**
   * @param {Record<string, unknown>} cmd @param {number} [ms]
   * @returns {Promise<any>}
   */
  async run(cmd, ms = 60_000) {
    const k = this.seq++;
    const tmp = join(this.dir, `cmd-${k}.tmp`);
    writeFileSync(tmp, JSON.stringify(cmd));
    renameSync(tmp, join(this.dir, `cmd-${k}.json`));
    const res = join(this.dir, `res-${k}.json`);
    const t0 = Date.now();
    while (!existsSync(res)) {
      if (this.proc.exitCode !== null) throw new Error(`ios-typer exited ${this.proc.exitCode} during ${cmd.op}`);
      if (Date.now() - t0 > ms) throw new Error(`ios-typer: no answer within ${ms / 1000} s for ${cmd.op}`);
      await sleep(10);
    }
    let r;
    for (let i = 0; ; i++) {
      try { r = JSON.parse(readFileSync(res, 'utf8')); break; } catch (e) { if (i > 20) throw e; await sleep(10); }
    }
    if (!r.ok) throw new Error(`ios-typer ${cmd.op}: ${(r.issues ?? []).join('; ')}`);
    return r;
  }

  async close() {
    if (this.proc.exitCode === null) await this.run({ op: 'quit' }, 15_000).catch(() => undefined);
    for (let i = 0; i < 50 && this.proc.exitCode === null; i++) await sleep(100);
    if (this.proc.exitCode === null) this.proc.kill('SIGKILL');
    rmSync(this.dir, { recursive: true, force: true });
  }
}

export class IosPage {
  /** @param {InspectorPage} wir @param {Typer} typer */
  constructor(wir, typer) {
    this.wir = wir;
    this.typer = typer;
    this.mod = 'Meta';
  }

  /** @param {string} url */
  async goto(url) {
    // A marker on the old document tells the new document apart, also when
    // the same URL is loaded again.
    const mark = randomUUID();
    await this.wir.evaluate(`window.__wirNav = ${JSON.stringify(mark)}; location.href = ${JSON.stringify(url)}; 1`);
    const t0 = Date.now();
    for (;;) {
      if (Date.now() - t0 > 70_000) throw new Error(`ios: ${url} did not load within 70 s`);
      await sleep(100);
      const s = await this.wir.evaluate(`[window.__wirNav === ${JSON.stringify(mark)}, document.readyState, location.href]`, 5000).catch(() => null);
      if (s && !s[0] && s[1] === 'complete') return;
    }
  }

  /**
   * Evaluates a function (or its source) with one JSON argument; async results are awaited.
   * @param {string | Function} fn @param {unknown} [arg]
   */
  async eval(fn, arg) {
    const src = typeof fn === 'string' ? fn : fn.toString();
    const v = await this.wir.evaluateAsync(`(${src})(${JSON.stringify(arg ?? null)})`);
    return v === undefined ? null : v;
  }

  /** @param {string} src */
  async inject(src) {
    await this.wir.evaluate(`${src}\n;1`);
  }

  /** @param {string} text typed by XCUITest (hardware key events, one text input session) */
  async type(text) {
    await this.typer.run({ op: 'type', text });
  }

  /**
   * Keys XCUITest delivers with the simulator's software keyboard active
   * (ConnectHardwareKeyboard = 0): Backspace and Enter as typed text, arrows
   * as key presses. Measured (ADR 0004): with any modifier the modifier is
   * dropped, and forward Delete or Command shortcuts reach the page as
   * keydown without an edit or not at all. Those are unsupported-by-driver,
   * never executed as silent no-ops.
   * @param {string} key @param {string[]} mods
   */
  canKey(key, mods) {
    return mods.length === 0 && (key in TYPED_KEYS || ARROWS.includes(key));
  }

  /** @param {string} key @param {string[]} mods */
  async press(key, mods) {
    if (!this.canKey(key, mods)) throw new Error(`ios: key ${[...mods, key].join('+')} is not deliverable`);
    if (key in TYPED_KEYS) await this.typer.run({ op: 'type', text: TYPED_KEYS[key] });
    else await this.typer.run({ op: 'key', key, mods: [] });
  }

  get canCompose() { return false; }

  get canPaste() { return true; }

  /**
   * Text paste through the simulator pasteboard; html cannot be delivered.
   * @param {string} text @param {string | undefined} html @param {string} mod
   */
  async paste(text, html, mod) {
    if (html != null) return { ok: false, unsupported: true, reason: 'simctl pbcopy carries text/plain only; the html flavor cannot be delivered' };
    if (!this.canKey('v', [mod])) return { ok: false, unsupported: true, reason: 'Command+V does not reach the page without a connected hardware keyboard (ConnectHardwareKeyboard = 0)' };
    const r = timed(30, 'xcrun', ['simctl', 'pbcopy', IOS_UDID], { input: text });
    if (r.status !== 0) return { ok: false, reason: `simctl pbcopy failed: ${r.output}` };
    await this.press('v', [mod]);
    return { ok: true };
  }

  /**
   * A real touch through XCUITest. The page measures the editing host at the
   * point; the runner taps at the same offset inside the text view of that
   * size, so insets, scrolling and the keyboard need no mapping here.
   * @param {number} x @param {number} y
   */
  async tap(x, y) {
    const host = await this.eval(`([x, y]) => {
      const at = document.elementFromPoint(x, y);
      const h = (at && at.closest('[contenteditable]')) || document.querySelector('[contenteditable]');
      if (!h) return null;
      const r = h.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height];
    }`, [x, y]);
    if (!host) throw new Error('ios: no editing host to tap into');
    await this.typer.run({ op: 'tap', host, dx: x - host[0], dy: y - host[1] });
  }

  /** @param {number} x @param {number} y */
  async click(x, y) { await this.tap(x, y); }

  get canDrag() { return false; }

  get canTouch() { return true; }

  /** Delay after a pointer step: a touch tap places the caret asynchronously. */
  get pointerSettleMs() { return 400; }

  /** Script focus starts no input session on iOS; the runner focuses with a tap. */
  get gestureFocus() { return true; }

  async close() { /* one tab, one page: nothing to close */ }
}

/**
 * iOS driver: one Safari tab on the Ether simulator, scripts through the
 * inspector, input through XCUITest. Pages are sequential and share the tab.
 * @param {{base: string}} server the rig's static server (reachable from the simulator)
 */
export async function iosDriver(server) {
  const xctestrun = buildTyper();
  // A Safari left in automation mode by an earlier safaridriver session
  // ignores real input; quitting Safari (on the Ether simulator only) resets it.
  timed(30, 'xcrun', ['simctl', 'terminate', IOS_UDID, SAFARI]);
  await sleep(1000);
  // A fresh tab with a token in its URL identifies our page in the listing.
  const token = `rig-${randomUUID()}`;
  const start = `${server.base}/bench/oracle/native.html?${token}`;
  const o = timed(60, 'xcrun', ['simctl', 'openurl', IOS_UDID, start]);
  if (o.status !== 0) throw new Error(`simctl openurl failed: ${o.output}`);
  const wir = new InspectorPage(inspectorSocket(IOS_UDID));
  await wir.open();
  let typer;
  try {
    await wir.attach(SAFARI, token);
    typer = new Typer(xctestrun);
    await typer.ready();
  } catch (e) {
    wir.close();
    await typer?.close();
    throw e;
  }
  const t = typer;
  const ua = String(await wir.evaluate('navigator.userAgent'));
  const ver = /Version\/([\d.]+)/.exec(ua)?.[1] ?? '?';
  const os = /OS (\d+)_(\d+)/.exec(ua);
  const plist = timed(30, 'xcrun', ['simctl', 'getenv', IOS_UDID, 'SIMULATOR_RUNTIME_VERSION']);
  let busy = false;
  return {
    target: 'ios-safari',
    platform: 'ios',
    browserVersion: `${ver} (iOS ${plist.status === 0 ? plist.stdout.trim() : os ? `${os[1]}.${os[2]}` : '?'})`,
    caps: { composition: false, paste: true, touch: true, file: false },
    recoveries: 0,
    async newPage() {
      if (busy) throw new Error('ios-safari: one page at a time');
      busy = true;
      const p = new IosPage(wir, t);
      p.close = async () => { busy = false; };
      return p;
    },
    async close() {
      await t.close();
      wir.close();
    },
  };
}
