// Screenshots and measurements of the Fluid design prototype (piece E1-004).
//
//   node bench/design/shoot.mjs [--out <dir>] [--floor-out <dir>]
//
// Renders bench/design/fluid-prototype.html from file:// in Playwright Chromium
// at 390x844, 768x1024, 1280x800 and 1920x1080 CSS px (DPR 2, the same
// viewports as the bar captures in ~/DEV/ether/bars) in light and dark:
//   <out>/fluid-edit_<w>_<theme>.png   edit mode, full page (the 8 deliverables)
//   <out>/fluid-read_<w>_<theme>.png   read mode, full page (multi-column check)
//   <out>/metrics.json                 computed type, measure, rhythm, colours
//   <floor-out>/floor_<w>_<theme>.png  the same fixture with UA defaults (F1)
// Defaults: ../bars/ours/E1-004 and ../bars/floor/E1-004 next to the worktree.
// No server is started; nothing is written into the repository.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PAGE = pathToFileURL(join(ROOT, 'bench/design/fluid-prototype.html')).href;
const arg = (/** @type {string} */ name, /** @type {string} */ dflt) => {
  const k = process.argv.indexOf(name);
  return resolve(k >= 0 ? process.argv[k + 1] : dflt);
};
const OUT = arg('--out', join(ROOT, '../bars/ours/E1-004'));
const FLOOR = arg('--floor-out', join(ROOT, '../bars/floor/E1-004'));
const VIEWPORTS = [[390, 844], [768, 1024], [1280, 800], [1920, 1080]];
const THEMES = /** @type {const} */ (['light', 'dark']);

/** Runs in the page: computed values the ADR quotes. */
function measure() {
  /** @param {string} c rgb()/rgba() string */
  const rgb = (c) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  /** @param {number[]} c */
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  /** @param {string} a @param {string} b */
  const contrast = (a, b) => {
    const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
    return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
  };
  /** Rendered lines of an element: chars per line via Range rects. @param {Element} el */
  const lines = (el) => {
    const host = /** @type {Element} */ (el.closest('article'));
    const box = host.getBoundingClientRect();
    const cols = Number(getComputedStyle(host).columnCount) || 1;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    /** @type {Map<number, number>} */
    const rows = new Map();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? '';
      for (let i = 0; i < text.length; i++) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + 1);
        const rect = r.getClientRects()[0];
        if (!rect) continue;
        // Rows are keyed by column and vertical centre, so balanced columns do not merge.
        const col = Math.floor((rect.left - box.left) / (box.width / cols));
        const key = col * 1e6 + Math.round(rect.top + rect.height / 2);
        const row = [...rows.keys()].find((k) => Math.abs(k - key) < rect.height / 2);
        rows.set(row ?? key, (rows.get(row ?? key) ?? 0) + 1);
      }
    }
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  };
  const body = getComputedStyle(document.body);
  const doc = /** @type {HTMLElement} */ (document.querySelector('.doc'));
  const paras = [...doc.querySelectorAll('p')];
  const longest = paras.reduce((a, b) => ((b.textContent ?? '').length > (a.textContent ?? '').length ? b : a));
  const ps = getComputedStyle(longest);
  const probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;inline-size:1ch;block-size:1px';
  longest.append(probe);
  const ch = probe.getBoundingClientRect().width;
  probe.remove();
  const perLine = lines(longest);
  const full = perLine.slice(0, -1);
  const rect = longest.getClientRects()[0]; // first column fragment in read mode
  const deP = document.querySelectorAll('article[lang="de"] p');
  // p -> p gap, only meaningful while both paragraphs sit in one column.
  const [a, b] = [deP[0].getClientRects(), deP[1].getClientRects()];
  const gap = a.length === 1 && b.length === 1 && Math.abs(a[0].left - b[0].left) < 1 ? b[0].top - a[0].bottom : null;
  const head = (/** @type {string} */ sel) => {
    const el = /** @type {Element} */ (doc.querySelector(sel));
    const s = getComputedStyle(el);
    return { fontSize: s.fontSize, lineHeight: s.lineHeight, weight: s.fontWeight, marginTop: s.marginBlockStart };
  };
  const article = /** @type {Element} */ (document.querySelector('article[lang="de"]'));
  const sel = getComputedStyle(longest, '::selection');
  const chrome = getComputedStyle(/** @type {Element} */ (document.querySelector('.chrome')));
  const muted = getComputedStyle(/** @type {Element} */ (document.querySelector('.save'))).color;
  return {
    mode: document.documentElement.dataset.mode,
    bodyFontSize: body.fontSize,
    paragraph: {
      sample: (longest.textContent ?? '').slice(0, 40),
      fontFamilyDeclared: ps.fontFamily,
      fontSize: ps.fontSize,
      lineHeight: ps.lineHeight,
      hyphens: ps.hyphens,
      widthPx: Math.round(rect.width * 100) / 100,
      leftPx: Math.round(rect.left * 100) / 100,
      chPx: Math.round(ch * 100) / 100,
      measureCh: Math.round((rect.width / ch) * 100) / 100,
      charsPerLine: perLine,
      avgCharsPerLine: full.length ? Math.round((full.reduce((a, b) => a + b, 0) / full.length) * 10) / 10 : null,
    },
    gapPtoPpx: gap === null ? null : Math.round(gap * 100) / 100,
    h1: head('h1'),
    h2: head('h2 ~ h2'),
    h3: head('h3'),
    columns: getComputedStyle(article).columnCount,
    colours: {
      background: body.backgroundColor,
      text: body.color,
      muted,
      caret: getComputedStyle(doc).caretColor,
      selectionBackground: sel.backgroundColor,
      chromeBackground: chrome.backgroundColor,
      contrastTextOnBackground: contrast(body.color, body.backgroundColor),
      contrastTextOnSelection: contrast(body.color, sel.backgroundColor),
      contrastMutedOnBackground: contrast(muted, body.backgroundColor),
      contrastCaretOnBackground: contrast(getComputedStyle(doc).caretColor, body.backgroundColor),
    },
  };
}

/** Puts a collapsed caret after "Wänden." and a demo selection on an EN phrase. */
function stage() {
  const doc = /** @type {HTMLElement} */ (document.querySelector('.doc'));
  doc.focus();
  const deP = /** @type {Element} */ (document.querySelectorAll('article[lang="de"] p')[1]);
  const last = /** @type {Text} */ (deP.lastChild);
  const selection = /** @type {Selection} */ (getSelection());
  selection.collapse(last, (last.textContent ?? '').length);
  const enP = /** @type {Element} */ (document.querySelectorAll('article[lang="en"] p')[2]);
  const walker = document.createTreeWalker(enP, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? '';
    const i = text.indexOf('no unnecessary words');
    if (i < 0) continue;
    const r = document.createRange();
    r.setStart(n, i);
    r.setEnd(n, i + 'no unnecessary words'.length);
    // Custom Highlight API: same colours as ::selection, while the caret stays live.
    CSS.highlights.set('demo-selection', new Highlight(r));
  }
}

/** @param {import('@playwright/test').Page} page */
async function usedFonts(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  /** @type {Record<string, string>} */
  const out = {};
  for (const [name, sel] of [['paragraph', 'article[lang="de"] p'], ['italic', 'article[lang="de"] p i'], ['h1', 'h1'], ['chrome', '.save']]) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    out[name] = fonts.map((f) => `${f.postScriptName || f.familyName} (${f.glyphCount})`).join(', ');
  }
  await cdp.detach();
  return out;
}

mkdirSync(OUT, { recursive: true });
mkdirSync(FLOOR, { recursive: true });
const browser = await chromium.launch();
/** @type {Record<string, any>} */
const metrics = { page: 'bench/design/fluid-prototype.html', browser: `chromium ${browser.version()}`, dpr: 2, runs: {} };
try {
  for (const theme of THEMES) {
    for (const [width, height] of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: theme });
      const page = await context.newPage();
      const key = `${width}_${theme}`;

      await page.goto(PAGE);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.evaluate(stage);
      metrics.runs[`edit_${key}`] = { ...(await page.evaluate(measure)), usedFonts: await usedFonts(page) };
      await page.screenshot({ path: join(OUT, `fluid-edit_${key}.png`), fullPage: true, caret: 'initial', animations: 'disabled' });

      await page.goto(`${PAGE}?mode=read&save=saved`);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      metrics.runs[`read_${key}`] = await page.evaluate(measure);
      await page.screenshot({ path: join(OUT, `fluid-read_${key}.png`), fullPage: true, animations: 'disabled' });

      // Floor F1: the same fixture with the prototype stylesheet and chrome removed.
      await page.goto(PAGE);
      await page.evaluate(() => {
        document.getElementById('fluid')?.remove();
        document.querySelector('.chrome')?.remove();
      });
      await page.screenshot({ path: join(FLOOR, `floor_${key}.png`), fullPage: true, animations: 'disabled' });
      await context.close();
      console.log(`shot ${key}`);
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(OUT, 'metrics.json'), `${JSON.stringify(metrics, null, 1)}\n`);
console.log(`wrote ${OUT} and ${FLOOR}`);
