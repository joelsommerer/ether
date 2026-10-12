// Playwright drivers: chromium, firefox, webkit (desktop, headless) and
// android-chrome (Chrome on the AVD "ether", attached over CDP through
// `adb forward tcp:<port> localabstract:chrome_devtools_remote`).
//
// Capabilities per target (a step outside them is reported as
// "unsupported-by-driver", never as passed):
//   composition  CDP Input.imeSetComposition + Input.insertText: chromium, android-chrome
//   paste        navigator.clipboard.write + Mod+V: chromium, firefox, webkit, android-chrome
//                (headless clipboards; the macOS pasteboard is not touched)
//   touch        CDP Input.synthesizeTapGesture: android-chrome
//   drag         mouse drag: chromium, firefox, webkit (touch drag is unsupported-by-driver)

import { chromium, firefox, webkit } from '@playwright/test';

const ENGINES = { chromium, firefox, webkit };

/** Serializes clipboard write + paste per browser (workers share one clipboard). */
class Mutex {
  constructor() { /** @type {Promise<void>} */ this.tail = Promise.resolve(); }
  /** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
  run(fn) {
    const next = this.tail.then(fn, fn);
    this.tail = next.then(() => undefined, () => undefined);
    return next;
  }
}

/**
 * Playwright key string: modifiers + key ("Meta+Shift+ArrowLeft").
 * @param {string} key @param {string[]} mods already resolved (no "Mod")
 */
const combo = (key, mods) => [...mods, key].join('+');

export class PwPage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {{target: string, platform: string, cdp: boolean, touch: boolean, clip: Mutex, close: () => Promise<void>}} o
   */
  constructor(page, o) {
    this.page = page;
    this.o = o;
    /** @type {import('@playwright/test').CDPSession | null} */
    this.session = null;
  }

  /** Brings the tab to the front (Android: only the front tab gets focus, keys and the clipboard). */
  async front() {
    await this.page.bringToFront();
    await this.page.waitForFunction(() => document.hasFocus(), null, { timeout: 5000, polling: 50 }).catch(() => undefined);
  }

  /** @param {string} url */
  async goto(url) {
    await this.page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  }

  /**
   * Evaluates `fn` (a function or its source) with one JSON argument.
   * @param {string | Function} fn @param {unknown} [arg]
   */
  async eval(fn, arg) {
    if (typeof fn === 'string') return this.page.evaluate(`(${fn})(${JSON.stringify(arg ?? null)})`);
    return this.page.evaluate(/** @type {any} */ (fn), arg);
  }

  /** @param {string} src classic script source */
  async inject(src) {
    await this.page.evaluate(src);
  }

  async cdp() {
    if (!this.o.cdp) throw new Error('no CDP on this target');
    this.session ??= await this.page.context().newCDPSession(this.page);
    return this.session;
  }

  /** @param {string} text */
  async type(text) {
    await this.page.keyboard.type(text);
  }

  /** @param {string} key @param {string[]} mods */
  async press(key, mods) {
    await this.page.keyboard.press(combo(key, mods));
  }

  get canCompose() { return this.o.cdp; }

  /** @param {string[]} updates @param {string} commit */
  async compose(updates, commit) {
    const s = await this.cdp();
    for (const text of updates) await s.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
    await s.send('Input.insertText', { text: commit });
  }

  get canPaste() { return true; }

  /**
   * Puts text (and html) on the browser's clipboard, then presses Mod+V.
   * @param {string} text @param {string | undefined} html @param {string} mod
   */
  async paste(text, html, mod) {
    return this.o.clip.run(async () => {
      if (this.o.target === 'chromium' || this.o.target === 'android-chrome') {
        await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
      }
      const r = await this.page.evaluate(async ([t, h]) => {
        try {
          /** @type {Record<string, Blob>} */
          const parts = { 'text/plain': new Blob([t], { type: 'text/plain' }) };
          if (h != null) parts['text/html'] = new Blob([h], { type: 'text/html' });
          await navigator.clipboard.write([new ClipboardItem(parts)]);
          return 'ok';
        } catch (e) {
          return String(e);
        }
      }, [text, html ?? null]);
      if (r !== 'ok') return { ok: false, reason: `clipboard write failed: ${r}` };
      await this.page.keyboard.press(combo('v', [mod]));
      return { ok: true };
    });
  }

  /** @param {number} x @param {number} y */
  async click(x, y) {
    await this.page.mouse.click(x, y);
  }

  get canDrag() { return !this.o.touch; }

  /** Mouse drag in small moves (native drag and drop of a selection). @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 */
  async drag(x1, y1, x2, y2) {
    const m = this.page.mouse;
    await m.move(x1, y1);
    await m.down();
    await m.move(x1 + 4, y1, { steps: 2 });
    await m.move(x2, y2, { steps: 8 });
    await m.up();
  }

  get canTouch() { return this.o.touch; }

  /** @param {number} x @param {number} y */
  async tap(x, y) {
    const s = await this.cdp();
    await s.send('Input.synthesizeTapGesture', { x, y, duration: 50, gestureSourceType: 'touch' });
  }

  /** Delay after the starting content is focused (Android input connection). */
  get focusSettleMs() { return this.o.target === 'android-chrome' ? 500 : 0; }

  /** Delay after a pointer step: a touch tap places the caret asynchronously. */
  get pointerSettleMs() { return this.o.touch ? 400 : 0; }

  async close() {
    await this.o.close();
  }
}

/**
 * Desktop driver: one headless browser, one context per page.
 * @param {'chromium'|'firefox'|'webkit'} target
 */
export async function desktopDriver(target) {
  const browser = await ENGINES[target].launch({ headless: true });
  const clip = new Mutex();
  return {
    target,
    platform: 'mac',
    browserVersion: browser.version(),
    caps: { composition: target === 'chromium', paste: true, touch: false, file: true },
    async newPage() {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      return new PwPage(page, { target, platform: 'mac', cdp: target === 'chromium', touch: false, clip, close: () => ctx.close() });
    },
    async close() {
      await browser.close();
    },
  };
}

/**
 * Android driver: attaches to Chrome on the emulator over CDP. The caller has
 * set up `adb forward tcp:<cdpPort> localabstract:chrome_devtools_remote`
 * and `adb reverse` for the test server (tools/devices.mjs, test/rig/mobile.mjs).
 * Pages are opened as new tabs and closed afterwards.
 * @param {number} cdpPort
 */
export async function androidDriver(cdpPort) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 30_000 });
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error('android-chrome: no default browser context over CDP');
  const clip = new Mutex();
  return {
    target: 'android-chrome',
    platform: 'android',
    browserVersion: browser.version(),
    caps: { composition: true, paste: true, touch: true, file: false },
    async newPage() {
      const page = await ctx.newPage();
      return new PwPage(page, { target: 'android-chrome', platform: 'android', cdp: true, touch: true, clip, close: () => page.close() });
    },
    async close() {
      // Detach only: closing would quit Chrome on the device.
      await browser.close().catch(() => undefined);
    },
  };
}
