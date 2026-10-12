// Minimal W3C WebDriver client (fetch only) for Safari on the iOS simulator
// "Ether iPhone 17 Pro" through safaridriver.
//
// Not the default iOS driver (that is ios.mjs): in a WebDriver session
// Safari runs in automation mode, its key actions insert no text and real
// input is blocked (ADR 0004). Selected with ETHER_IOS_DRIVER=webdriver to
// reproduce that finding.
//
// Capabilities: platformName "iOS", safari:useSimulator true,
// safari:deviceName "Ether iPhone 17 Pro". The simulator shares the host's
// network, so the test server is reached as http://localhost:<port>.
//   composition  unsupported-by-driver (no IME automation in WebDriver)
//   paste        text only: `xcrun simctl pbcopy <udid>` + Cmd+V; an html flavor is unsupported-by-driver
//   touch        W3C pointer actions with pointerType "touch"
//   drag         unsupported-by-driver (a touch drag of a selection needs a long press)
// Prerequisites (Joel, PHASE-1.md section 10): X-01 `sudo safaridriver --enable`,
// X-02 Settings > Safari > Advanced > Remote Automation on in the simulator.

import { spawn } from 'node:child_process';
import { timed } from '../sh.mjs';

export const IOS_DEVICE = 'Ether iPhone 17 Pro';
export const IOS_UDID = '4BA9F329-8BB2-4B14-8572-8E8ABBAF4B1F';

/** W3C WebDriver key codes (WebDriver section 17.4.2). */
const KEY = {
  Backspace: '', Tab: '', Enter: '', Shift: '', Control: '', Alt: '',
  Escape: '', PageUp: '', PageDown: '', End: '', Home: '', ArrowLeft: '',
  ArrowUp: '', ArrowRight: '', ArrowDown: '', Delete: '', Meta: '',
};

/** @param {string} k */
const keyValue = (k) => /** @type {Record<string, string>} */ (KEY)[k] ?? k;

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with a hard deadline. A referenced timer aborts the request and the
 * race rejects even if the body never arrives (AbortSignal.timeout alone
 * left a request hanging for minutes).
 * @param {string} url @param {RequestInit} init @param {number} ms
 */
async function fetchJson(url, init, ms) {
  const ctl = new AbortController();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort();
      reject(new Error(`webdriver: no answer within ${ms / 1000} s for ${init.method ?? 'GET'} ${url}`));
    }, ms);
  });
  try {
    return await Promise.race([
      (async () => {
        const r = await fetch(url, { ...init, signal: ctl.signal });
        return { ok: r.ok, status: r.status, body: /** @type {any} */ (await r.json()) };
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Starts safaridriver on a free port; resolves when it answers /status. */
async function startSafaridriver() {
  const port = 44000 + Math.floor(Math.random() * 1000);
  const proc = spawn('safaridriver', ['-p', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.stderr.on('data', (d) => { out += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    if (proc.exitCode !== null) throw new Error(`safaridriver exited ${proc.exitCode}: ${out.trim()}`);
    try {
      const r = await fetch(`${base}/status`);
      if (r.ok) return { proc, base };
    } catch { /* not up yet */ }
    await sleep(200);
  }
  proc.kill();
  throw new Error(`safaridriver did not start: ${out.trim()}`);
}

/** Capabilities of the one session we create. */
const CAPS = {
  capabilities: {
    alwaysMatch: {
      browserName: 'safari',
      platformName: 'iOS',
      'safari:useSimulator': true,
      'safari:deviceName': IOS_DEVICE,
    },
  },
};

/** @param {string} base */
async function newSession(base) {
  const r = await fetchJson(`${base}/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(CAPS) }, 300_000);
  const j = r.body;
  if (!r.ok) throw new Error(`session: ${j?.value?.error ?? r.status} ${j?.value?.message ?? ''}`.trim());
  return j.value;
}

class Session {
  /** @param {string} base @param {string} id */
  constructor(base, id) {
    this.base = base;
    this.id = id;
    this.recoveries = 0;
  }

  /**
   * After a command ran into its deadline Safari's automation is usually hung
   * (observed after a tap into ProseMirror's editor): quit Safari on the
   * Ether simulator and open a new session, so the rest of the run goes on.
   */
  async recover() {
    this.recoveries++;
    await fetchJson(`${this.base}/session/${this.id}`, { method: 'DELETE' }, 15_000).catch(() => undefined);
    timed(30, 'xcrun', ['simctl', 'terminate', IOS_UDID, 'com.apple.mobilesafari']);
    await sleep(2000);
    const v = await newSession(this.base);
    this.id = v.sessionId;
    await this.cmd('POST', '/timeouts', { script: 30_000, pageLoad: 60_000 });
  }

  /**
   * @param {'GET'|'POST'|'DELETE'} method @param {string} path @param {unknown} [body]
   * @param {number} [timeoutMs]
   */
  async cmd(method, path, body, timeoutMs = 40_000) {
    let r;
    try {
      r = await fetchJson(`${this.base}/session/${this.id}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }, timeoutMs);
    } catch (e) {
      if (/no answer within/.test(String(e))) await this.recover().catch(() => undefined);
      throw e;
    }
    const j = r.body;
    if (!r.ok) throw new Error(`webdriver ${method} ${path}: ${j?.value?.error ?? r.status} ${j?.value?.message ?? ''}`.trim());
    return j.value;
  }

  /** @param {any[]} actions */
  async perform(actions) {
    await this.cmd('POST', '/actions', { actions });
    await this.cmd('DELETE', '/actions');
  }
}

export class WdPage {
  /** @param {Session} s @param {string} mod */
  constructor(s, mod) {
    this.s = s;
    this.mod = mod;
  }

  /** @param {string} url */
  async goto(url) {
    await this.s.cmd('POST', '/url', { url }, 70_000);
  }

  /**
   * Evaluates a function (or its source) with one JSON argument; async results are awaited.
   * @param {string | Function} fn @param {unknown} [arg]
   */
  async eval(fn, arg) {
    const src = typeof fn === 'string' ? fn : fn.toString();
    const script = `const done = arguments[arguments.length - 1];
      Promise.resolve().then(() => (${src})(arguments[0])).then(
        (v) => done({ ok: true, v: v === undefined ? null : v }),
        (e) => done({ ok: false, e: String(e && e.stack || e) }));`;
    const r = await this.s.cmd('POST', '/execute/async', { script, args: [arg ?? null] });
    if (!r || !r.ok) throw new Error(`script failed: ${r?.e}`);
    return r.v;
  }

  /** @param {string} src */
  async inject(src) {
    await this.s.cmd('POST', '/execute/sync', { script: src, args: [] });
  }

  /** @param {string} text typed one grapheme cluster per key */
  async type(text) {
    const g = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].map((x) => x.segment);
    /** @type {any[]} */
    const acts = [];
    for (const c of g) {
      const v = c === '\n' ? KEY.Enter : c;
      acts.push({ type: 'keyDown', value: v }, { type: 'keyUp', value: v });
    }
    await this.s.perform([{ type: 'key', id: 'kbd', actions: acts }]);
  }

  /** @param {string} key @param {string[]} mods */
  async press(key, mods) {
    /** @type {any[]} */
    const acts = [];
    for (const m of mods) acts.push({ type: 'keyDown', value: keyValue(m) });
    acts.push({ type: 'keyDown', value: keyValue(key) }, { type: 'keyUp', value: keyValue(key) });
    for (const m of [...mods].reverse()) acts.push({ type: 'keyUp', value: keyValue(m) });
    await this.s.perform([{ type: 'key', id: 'kbd', actions: acts }]);
  }

  get canCompose() { return false; }

  get canPaste() { return true; }

  /**
   * Text paste through the simulator pasteboard; html cannot be delivered.
   * @param {string} text @param {string | undefined} html @param {string} mod
   */
  async paste(text, html, mod) {
    if (html != null) return { ok: false, unsupported: true, reason: 'simctl pbcopy carries text/plain only; the html flavor cannot be delivered' };
    const r = timed(30, 'xcrun', ['simctl', 'pbcopy', IOS_UDID], { input: text });
    if (r.status !== 0) return { ok: false, reason: `simctl pbcopy failed: ${r.output}` };
    await this.press('v', [mod]);
    return { ok: true };
  }

  /** @param {number} x @param {number} y @param {'mouse'|'touch'} kind */
  async pointer(x, y, kind) {
    // Right after a navigation safaridriver rejects every pointer move with
    // "move target out of bounds" for a moment, whatever the coordinates
    // (observed on iOS 26.5); retry that error only, for at most 5 s.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.pointerOnce(x, y, kind);
      } catch (e) {
        if (attempt >= 25 || !/move target out of bounds/.test(String(e))) throw e;
        await sleep(200);
      }
    }
  }

  /** @param {number} x @param {number} y @param {'mouse'|'touch'} kind */
  async pointerOnce(x, y, kind) {
    await this.s.perform([{
      type: 'pointer', id: kind, parameters: { pointerType: kind },
      actions: [
        { type: 'pointerMove', duration: 0, origin: 'viewport', x: Math.round(x), y: Math.round(y) },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerUp', button: 0 },
      ],
    }]);
  }

  /** @param {number} x @param {number} y */
  async click(x, y) { await this.pointer(x, y, 'touch'); }

  get canDrag() { return false; }

  get canTouch() { return true; }

  /** @param {number} x @param {number} y */
  async tap(x, y) { await this.pointer(x, y, 'touch'); }

  /** Delay after a pointer step: a touch tap places the caret asynchronously. */
  get pointerSettleMs() { return 400; }

  /** Script focus starts no input session on iOS; the runner focuses with a tap. */
  get gestureFocus() { return true; }

  async close() { /* one session, one page: nothing to close */ }
}

/**
 * iOS driver: safaridriver + one WebDriver session on the Ether simulator.
 * Safari hosts one WebDriver session at a time, so pages are sequential and
 * share that session.
 */
export async function iosDriver() {
  try {
    return await iosSession();
  } catch (e) {
    // A previous run that died mid-session leaves Safari paired with it;
    // quitting Safari on the Ether simulator (only there) releases it.
    if (!/already paired/.test(String(e))) throw e;
    timed(30, 'xcrun', ['simctl', 'terminate', IOS_UDID, 'com.apple.mobilesafari']);
    await sleep(2000);
    return iosSession();
  }
}

async function iosSession() {
  const { proc, base } = await startSafaridriver();
  try {
    const v = await newSession(base);
    const s = new Session(base, v.sessionId);
    const caps = v.capabilities ?? {};
    await s.cmd('POST', '/timeouts', { script: 30_000, pageLoad: 60_000 });
    let busy = false;
    return {
      target: 'ios-safari',
      platform: 'ios',
      browserVersion: `${caps.browserVersion ?? '?'} (iOS ${caps.platformVersion ?? caps['safari:platformVersion'] ?? '?'})`,
      caps: { composition: false, paste: true, touch: true, file: false },
      get recoveries() { return s.recoveries; },
      async newPage() {
        if (busy) throw new Error('ios-safari: one page at a time');
        busy = true;
        const p = new WdPage(s, 'Meta');
        p.close = async () => { busy = false; };
        return p;
      },
      async close() {
        await fetchJson(`${base}/session/${s.id}`, { method: 'DELETE' }, 60_000).catch(() => undefined);
        proc.kill();
      },
    };
  } catch (e) {
    proc.kill();
    throw e;
  }
}
