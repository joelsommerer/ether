// Gate G11 for the document shell: on file:// and http://localhost, the
// minified dist and its dev twin load with 0 console errors, 0 CSP violations
// and 0 network requests, and the CSP hashes really lock script and style.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const DIST = resolve('dist');
const DOCS = ['blank.html', 'blank.dev.html'];

/**
 * Opens `url` and records everything the shell must not do.
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 */
async function open(page, url) {
  /** @type {string[]} */ const errors = [];
  /** @type {string[]} */ const requests = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('request', (req) => {
    if (!(req.isNavigationRequest() && req.frame() === page.mainFrame() && req.url() === url)) requests.push(req.url());
  });
  await page.addInitScript(() => {
    /** @type {any} */ (window).__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      /** @type {any} */ (window).__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await page.goto(url, { waitUntil: 'load' });
  // Two animation frames: late requests or violations would have fired by now.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const state = await page.evaluate(() => ({
    violations: /** @type {any} */ (window).__cspViolations,
    version: /** @type {any} */ (window).webdoc?.version ?? null,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    resources: performance.getEntriesByType('resource').map((e) => e.name),
  }));
  return { errors, requests, ...state };
}

/** @param {string} html @param {'script'|'style'} tag */
function inline(html, tag) {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(html);
  if (!m) throw new Error(`no inline <${tag}>`);
  return { body: m[1], start: m.index + tag.length + 2 };
}

/** @param {string} text */
const sha = (text) => `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;

// Control: the instruments are not blind. A page without CSP that loads an
// image from the test server must show up in both request listeners and
// resource timing, on file:// in every browser.
test('control: a request from a file:// page is detected', async ({ page, baseURL }, info) => {
  const probe = `${baseURL}/dist/blank.html?probe`;
  const file = info.outputPath('leaky.html');
  writeFileSync(file, `<!doctype html><title>leaky</title><img src="${probe}" alt="">`);
  const r = await open(page, pathToFileURL(file).href);
  expect(r.requests).toContain(probe);
  expect(r.resources).toContain(probe);
});

for (const doc of DOCS) {
  const fileUrl = pathToFileURL(resolve(DIST, doc)).href;

  for (const [scheme, url] of [['file', fileUrl], ['http', `/dist/${doc}`]]) {
    test(`${doc} over ${scheme}: no errors, no CSP violations, no requests`, async ({ page, baseURL }) => {
      const full = url.startsWith('/') ? `${baseURL}${url}` : url;
      const r = await open(page, full);
      expect(r.errors).toEqual([]);
      expect(r.violations).toEqual([]);
      expect(r.requests).toEqual([]);
      expect(r.resources).toEqual([]);
      // Script and style ran, so their hashes were accepted.
      expect(r.version).toBe('0.0.0');
      expect(r.colorScheme).toBe('light dark');
    });
  }

  test(`${doc}: CSP meta hashes equal the inline script and style`, async () => {
    const html = readFileSync(resolve(DIST, doc), 'utf8');
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1];
    expect(csp).toBe(`default-src 'none'; script-src '${sha(inline(html, 'script').body)}'; style-src '${sha(inline(html, 'style').body)}'; img-src data: blob:`);
  });

  for (const tag of /** @type {const} */ (['script', 'style'])) {
    test(`${doc}: one changed byte in the ${tag} is blocked by the browser`, async ({ page }, info) => {
      const html = readFileSync(resolve(DIST, doc), 'utf8');
      const { body, start } = inline(html, tag);
      // Flip one semantically neutral byte: the last ";" becomes a space, so
      // only the hash, not the meaning, changes.
      expect(body.lastIndexOf(';')).toBeGreaterThan(0);
      const at = start + body.lastIndexOf(';');
      const tampered = `${html.slice(0, at)} ${html.slice(at + 1)}`;
      expect(Buffer.byteLength(tampered)).toBe(Buffer.byteLength(html));
      const file = info.outputPath(`tampered-${tag}-${doc}`);
      writeFileSync(file, tampered);
      const r = await open(page, pathToFileURL(file).href);
      expect(r.requests).toEqual([]);
      expect(r.violations.some((v) => v.startsWith(`${tag}-src`))).toBe(true);
      if (tag === 'script') {
        expect(r.version).toBeNull();
        expect(r.colorScheme).toBe('light dark');
      } else {
        expect(r.version).toBe('0.0.0');
        expect(r.colorScheme).not.toBe('light dark');
      }
    });
  }
}
