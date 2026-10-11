# Visual bar dossier (B3) - Ether Phase 1

Scout output. Extracted values only, no judgement. Captured 2026-10-11 with Playwright 1.57.0 (Chromium headless, deviceScaleFactor 2). Third-party images live ONLY under `/Users/joelsommerer/DEV/ether/bars/` and are never committed; this file contains numbers and paths only.

## Artifacts (outside the repo)

- Manifest (62 images: area, source_url, fetched_at, sha256, resolution, viewport, theme): `/Users/joelsommerer/DEV/ether/bars/manifest.json`; repo copy (no images, relative paths): `docs/plan/bars-manifest.json`
- practicaltypography.com: `/Users/joelsommerer/DEV/ether/bars/visual/practicaltypography/<page>_<width>_light_{viewport,full}.png`, pages `line-length`, `line-spacing`, `typography-in-ten-minutes`, widths 390/768/1280/1920 (24 files)
- press.stripe.com fallback: `/Users/joelsommerer/DEV/ether/bars/visual/stripe-press/an-elegant-puzzle_<width>_darkonly_{viewport,full}.png` (8 files; cookie banner dismissed with "Reject all" before capture)
- iA Writer: `/Users/joelsommerer/DEV/ether/bars/visual/ia-writer/` - `appstore_mac_01..10.png` (2560x1600), `appstore_iphone_01..10.png` (2796x1290), `web_*` (10 files from https://ia.net/writer)
- Raw computed-style dumps: `/Users/joelsommerer/DEV/ether/bars/computed-styles/practicaltypography-stripe-press.json`, `/Users/joelsommerer/DEV/ether/bars/computed-styles/stripe-press-title-author.json`; PT stylesheet as fetched: `/Users/joelsommerer/DEV/ether/bars/computed-styles/practicaltypography-styles.css`
- Capture/extraction scripts (temp dir): `/Users/joelsommerer/DEV/ether/bars/tmp/{capture.mjs,capture-stripe.mjs,extract2.mjs,extract2pt.mjs,extract3.mjs}`

Viewports (CSS px): 390x844, 768x1024, 1280x800, 1920x1080; DPR 2, so image px = 2x CSS px.

## Dark mode availability

- practicaltypography.com: no dark theme. 0 `prefers-color-scheme` rules in any stylesheet, no `<meta name="color-scheme">`; `colorScheme: dark` captures were pixel-identical to light at all 4 widths (Pillow ImageChops bbox None) and were deleted.
- press.stripe.com: single dark theme; 0 `prefers-color-scheme` rules, no color-scheme meta; light vs dark emulation differed only inside the animated 3D book region. Saved once, labelled `darkonly`.
- iA Writer: light and dark editor surfaces both present in the screenshots (per-image theme in manifest and table below).

## practicaltypography.com

Pages: https://practicaltypography.com/line-length.html, https://practicaltypography.com/line-spacing.html, https://practicaltypography.com/typography-in-ten-minutes.html

Site mechanics (verbatim from https://practicaltypography.com/functions.js and https://practicaltypography.com/styles.css):
- Font switcher cookie `bpt-body-text`; `const valid_fonts = ["equity", "valkyrie", "century-supra", "concourse", "hermes-maia", "triplicate", "heliotrope"];` `const default_body_text_family = "valkyrie";` -> body class `body-text_valkyrie` on every capture.
- `html { font-size: 2.4vw; }` / `@media all and (min-width:1000px) { html { font-size: 24px; } }` / `@media all and (max-width:520px) { html{ font-size: 18px; } }`
- `.body-text_valkyrie { font-family: valkyrie-text; line-height: 1.45; font-size: 0.91rem; font-variant-numeric: oldstyle-nums; }`
- Other body-text classes: `.body-text_equity` 0.98rem / 1.4 / oldstyle-nums; `.body-text_century-supra` 0.93rem / 1.46 / oldstyle-nums; `.body-text_concourse` 1rem / 1.35; `.body-text_heliotrope` 0.96rem / 1.42; `.body-text_hermes-maia` 0.88rem / 1.52; `.body-text_triplicate` 0.85rem / 1.45 / `font-feature-settings: "ss01"`
- `body { margin-left:auto; margin-right:auto; width: 100%; max-width: 1000px; min-height: 100%; position: relative; z-index: -10000; -webkit-font-smoothing: subpixel-antialiased; }`
- `div#content { padding: 3rem 0 18rem 0; margin-left: 12rem; margin-right: 2.5rem; }`; at `max-width:520px`: `div#content { margin: 1.5rem; ... }`
- `p, li { margin-bottom: 1em; }`; `topic + p { font-size: 115%; }`
- `title-block, aside { display: block; float: left; position: absolute; margin-left: 0; left: 2.5rem; width: calc(2.5rem * 3); text-align: right; list-style-type: none; ...}` (left margin column; in-flow and left-aligned at 390)
- `title-block { margin-bottom: 2em; border-top: solid 3px #333; padding-top: 5px; }`; `title-block topic { font-family: inherit; text-transform: inherit; letter-spacing: inherit; font-size: 125%; line-height: 1.10; border-bottom: inherit; margin-top: 0rem; margin-bottom: 0.8rem; ...}`; `short-rule { display: block; font-size: 100%; line-height: 1.25; font-style: italic; hyphens: none; }`
- `topic { display: block; font-family: "advocate-c41"; font-size: 2.3rem; text-transform: uppercase; letter-spacing: 0.02em; font-style: normal; line-height: 1.1; margin-top: 1rem; margin-bottom: 2rem; ...}`
- `aside p { font-family: "heliotrope-t3"; font-size: 0.83rem; line-height: 1.4; color: #667; letter-spacing: 0.015em; hyphens: none; font-feature-settings: "liga"; }`
- Links: `a { text-decoration: none; color: inherit; transition-property: background; transition-duration: 0.2s; }`; `a:after { position: relative; content: "\FEFF°"; margin-left: 0.10em; font-size: 90%; top: -0.10em; color: #933; font-feature-settings: "caps"; font-variant-numeric: normal; }`; `a:hover { background: #fbf3f3; transition-property: background; transition-duration: 0.2s; border-radius: 8px; }`; `a:active { color: #777; }`; `a.xref { text-transform: lowercase; font-feature-settings: 'c2sc' 1; font-style: normal; hyphens: none; }`; `div > a:after, a.xref:after, a.sample-document:after { content: none; }`
- Hyphenation: soft hyphens (U+00AD) inserted server-side into the HTML; computed `hyphens: manual`.
- Colours: html and body `background-color: rgba(0, 0, 0, 0)` -> rendered `#ffffff`; body/paragraph `color: rgb(0, 0, 0)`; aside p `rgb(102, 102, 119)`; link degree mark `rgb(153, 51, 51)`; title-block rule `3px solid rgb(51, 51, 51)`.

Body paragraph per viewport. Sampled element: first `#doc > p` with >250 chars not directly after `topic`/`title-block`; on typography-in-ten-minutes none qualified, so the first `#doc > p` >150 chars outside aside/.howto/.btw was used - those are `topic + p` paragraphs (115% rule, hence larger size). measure ch = paragraph width / width of a 1ch probe in the paragraph font; chars/line counted per rendered line via Range rects (soft hyphens excluded); avg excludes last line; gap = first consecutive p->p pair, top of next minus bottom of previous.

| page | vw | html font-size | font-family | font-size | line-height | weight | margin-bottom | width px | left px | 1ch px | measure ch | chars per line | avg chars/line | gap p->p px |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| line-length | 390 | 18px | valkyrie-text | 16.38px | 23.751px | 400 | 16.38px | 336 | 27 | 9.89 | 33.97 | [46, 45, 45, 46, 47, 29] | 45.8 | 16.38 |
| line-length | 768 | 18.432px | valkyrie-text | 16.7731px | 24.321px | 400 | 16.7731px | 500.75 | 221.17 | 10.14 | 49.38 | [68, 68, 64, 58] | 66.67 | 16.77 |
| line-length | 1280 | 24px | valkyrie-text | 21.84px | 31.668px | 400 | 21.84px | 652 | 428 | 13.2 | 49.38 | [68, 68, 64, 58] | 66.67 | 21.83 |
| line-length | 1920 | 24px | valkyrie-text | 21.84px | 31.668px | 400 | 21.84px | 652 | 748 | 13.2 | 49.38 | [68, 68, 64, 58] | 66.67 | 21.83 |
| line-spacing | 390 | 18px | valkyrie-text | 16.38px | 23.751px | 400 | 16.38px | 336 | 27 | 9.89 | 33.97 | [37, 42, 46, 42, 48, 45, 46, 26] | 43.71 | 16.38 |
| line-spacing | 768 | 18.432px | valkyrie-text | 16.7731px | 24.321px | 400 | 16.7731px | 500.75 | 221.17 | 10.14 | 49.38 | [64, 66, 66, 70, 66] | 66.5 | 16.77 |
| line-spacing | 1280 | 24px | valkyrie-text | 21.84px | 31.668px | 400 | 21.84px | 652 | 428 | 13.2 | 49.38 | [64, 66, 66, 70, 66] | 66.5 | 21.83 |
| line-spacing | 1920 | 24px | valkyrie-text | 21.84px | 31.668px | 400 | 21.84px | 652 | 748 | 13.2 | 49.38 | [64, 66, 66, 70, 66] | 66.5 | 21.83 |
| typography-in-ten-minutes | 390 | 18px | valkyrie-text | 18.837px | 27.3137px | 400 | 18.837px | 336 | 27 | 11.39 | 29.5 | [41, 42, 39, 34, 32] | 39 | 18.83 |
| typography-in-ten-minutes | 768 | 18.432px | valkyrie-text | 19.2891px | 27.9692px | 400 | 19.2891px | 500.75 | 221.17 | 11.66 | 42.96 | [62, 60, 48, 18] | 56.67 | 19.28 |
| typography-in-ten-minutes | 1280 | 24px | valkyrie-text | 25.116px | 36.4182px | 400 | 25.116px | 652 | 428 | 15.19 | 42.93 | [62, 60, 48, 18] | 56.67 | 25.11 |
| typography-in-ten-minutes | 1920 | 24px | valkyrie-text | 25.116px | 36.4182px | 400 | 25.116px | 652 | 748 | 15.19 | 42.93 | [62, 60, 48, 18] | 56.67 | 25.11 |

Paragraph also (all PT pages/viewports): `letter-spacing: normal`, `text-align: start`, `text-indent: 0px`, `hyphens: manual`, color `rgb(0, 0, 0)`; font-variant-numeric as listed in raw dump (`oldstyle-nums` for valkyrie body text).

Headings and secondary elements (computed):

| page | vw | element | font-family | size | weight | style | line-height | letter-spacing | color | margin-bottom | align | x | w |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| line-length | 390 | title-block topic (page heading) | valkyrie-text | 20.475px | 700 | normal | 22.5225px | normal | rgb(0, 0, 0) | 14.4px | left | 27 | 336 |
| line-length | 390 | short-rule (subtitle) | valkyrie-text | 16.38px | 400 | italic | 20.475px | normal | rgb(0, 0, 0) | 0px | left | 27 | 336 |
| line-length | 390 | title-block + p | valkyrie-text | 16.38px | 400 | normal | 23.751px | normal | rgb(0, 0, 0) | 16.38px | start | 27 | 336 |
| line-length | 390 | aside p (margin note) | heliotrope-t3 | 14.94px | 400 | normal | 20.916px | 0.2241px | rgb(102, 102, 119) | 0px | left | 39 | 302.39 |
| line-length | 390 | a.xref (cross-ref link) | valkyrie-caps | 16.38px | 400 | normal | 23.751px | normal | rgb(0, 0, 0) | 0px | start | 54.23 | 89.56 |
| line-length | 768 | title-block topic (page heading) | valkyrie-text | 20.9664px | 700 | normal | 23.063px | normal | rgb(0, 0, 0) | 14.7456px | right | 46.08 | 138.23 |
| line-length | 768 | short-rule (subtitle) | valkyrie-text | 16.7731px | 400 | italic | 20.9664px | normal | rgb(0, 0, 0) | 0px | right | 46.08 | 138.23 |
| line-length | 768 | title-block + p | valkyrie-text | 16.7731px | 400 | normal | 24.321px | normal | rgb(0, 0, 0) | 16.7731px | start | 221.17 | 500.75 |
| line-length | 768 | aside p (margin note) | heliotrope-t3 | 15.2986px | 400 | normal | 21.418px | 0.229478px | rgb(102, 102, 119) | 15.2986px | right | 46.08 | 138.23 |
| line-length | 768 | a.xref (cross-ref link) | valkyrie-caps | 16.7731px | 400 | normal | 24.321px | normal | rgb(0, 0, 0) | 0px | start | 249.06 | 91.75 |
| line-length | 1280 | title-block topic (page heading) | valkyrie-text | 27.3px | 700 | normal | 30.03px | normal | rgb(0, 0, 0) | 19.2px | right | 200 | 180 |
| line-length | 1280 | short-rule (subtitle) | valkyrie-text | 21.84px | 400 | italic | 27.3px | normal | rgb(0, 0, 0) | 0px | right | 200 | 180 |
| line-length | 1280 | title-block + p | valkyrie-text | 21.84px | 400 | normal | 31.668px | normal | rgb(0, 0, 0) | 21.84px | start | 428 | 652 |
| line-length | 1280 | aside p (margin note) | heliotrope-t3 | 19.92px | 400 | normal | 27.888px | 0.2988px | rgb(102, 102, 119) | 19.92px | right | 140 | 240 |
| line-length | 1280 | a.xref (cross-ref link) | valkyrie-caps | 21.84px | 400 | normal | 31.668px | normal | rgb(0, 0, 0) | 0px | start | 464.33 | 119.5 |
| line-length | 1920 | title-block topic (page heading) | valkyrie-text | 27.3px | 700 | normal | 30.03px | normal | rgb(0, 0, 0) | 19.2px | right | 520 | 180 |
| line-length | 1920 | short-rule (subtitle) | valkyrie-text | 21.84px | 400 | italic | 27.3px | normal | rgb(0, 0, 0) | 0px | right | 520 | 180 |
| line-length | 1920 | title-block + p | valkyrie-text | 21.84px | 400 | normal | 31.668px | normal | rgb(0, 0, 0) | 21.84px | start | 748 | 652 |
| line-length | 1920 | aside p (margin note) | heliotrope-t3 | 19.92px | 400 | normal | 27.888px | 0.2988px | rgb(102, 102, 119) | 19.92px | right | 460 | 240 |
| line-length | 1920 | a.xref (cross-ref link) | valkyrie-caps | 21.84px | 400 | normal | 31.668px | normal | rgb(0, 0, 0) | 0px | start | 784.33 | 119.5 |
| line-spacing | 390 | title-block topic (page heading) | valkyrie-text | 20.475px | 700 | normal | 22.5225px | normal | rgb(0, 0, 0) | 14.4px | left | 27 | 336 |
| line-spacing | 390 | short-rule (subtitle) | valkyrie-text | 16.38px | 400 | italic | 20.475px | normal | rgb(0, 0, 0) | 0px | left | 27 | 336 |
| line-spacing | 390 | title-block + p | valkyrie-text | 16.38px | 400 | normal | 23.751px | normal | rgb(0, 0, 0) | 16.38px | start | 27 | 336 |
| line-spacing | 390 | aside p (margin note) | heliotrope-t3 | 14.94px | 400 | normal | 20.916px | 0.2241px | rgb(102, 102, 119) | 0px | left | 39 | 302.39 |
| line-spacing | 390 | a.xref (cross-ref link) | valkyrie-caps | 16.38px | 400 | normal | 23.751px | normal | rgb(0, 0, 0) | 0px | start | 27 | 285.77 |
| line-spacing | 390 | a (plain link in #doc p) | heliotrope-t3 | 16.2px | 400 | italic | 21.87px | normal | rgb(0, 0, 0) | 0px | start | 241.05 | 85.2 |
| line-spacing | 768 | title-block topic (page heading) | valkyrie-text | 20.9664px | 700 | normal | 23.063px | normal | rgb(0, 0, 0) | 14.7456px | right | 46.08 | 138.23 |
| line-spacing | 768 | short-rule (subtitle) | valkyrie-text | 16.7731px | 400 | italic | 20.9664px | normal | rgb(0, 0, 0) | 0px | right | 46.08 | 138.23 |
| line-spacing | 768 | title-block + p | valkyrie-text | 16.7731px | 400 | normal | 24.321px | normal | rgb(0, 0, 0) | 16.7731px | start | 221.17 | 500.75 |
| line-spacing | 768 | aside p (margin note) | heliotrope-t3 | 15.2986px | 400 | normal | 21.418px | 0.229478px | rgb(102, 102, 119) | 15.2986px | right | 46.08 | 138.23 |
| line-spacing | 768 | a.xref (cross-ref link) | valkyrie-caps | 16.7731px | 400 | normal | 24.321px | normal | rgb(0, 0, 0) | 0px | start | 410.92 | 167.73 |
| line-spacing | 768 | a (plain link in #doc p) | heliotrope-t3 | 16.5888px | 400 | italic | 22.3949px | normal | rgb(0, 0, 0) | 0px | start | 469.09 | 87.2 |
| line-spacing | 1280 | title-block topic (page heading) | valkyrie-text | 27.3px | 700 | normal | 30.03px | normal | rgb(0, 0, 0) | 19.2px | right | 200 | 180 |
| line-spacing | 1280 | short-rule (subtitle) | valkyrie-text | 21.84px | 400 | italic | 27.3px | normal | rgb(0, 0, 0) | 0px | right | 200 | 180 |
| line-spacing | 1280 | title-block + p | valkyrie-text | 21.84px | 400 | normal | 31.668px | normal | rgb(0, 0, 0) | 21.84px | start | 428 | 652 |
| line-spacing | 1280 | aside p (margin note) | heliotrope-t3 | 19.92px | 400 | normal | 27.888px | 0.2988px | rgb(102, 102, 119) | 19.92px | right | 140 | 240 |
| line-spacing | 1280 | a.xref (cross-ref link) | valkyrie-caps | 21.84px | 400 | normal | 31.668px | normal | rgb(0, 0, 0) | 0px | start | 675.11 | 218.45 |
| line-spacing | 1280 | a (plain link in #doc p) | heliotrope-t3 | 21.6px | 400 | italic | 29.16px | normal | rgb(0, 0, 0) | 0px | start | 750.64 | 113.59 |
| line-spacing | 1920 | title-block topic (page heading) | valkyrie-text | 27.3px | 700 | normal | 30.03px | normal | rgb(0, 0, 0) | 19.2px | right | 520 | 180 |
| line-spacing | 1920 | short-rule (subtitle) | valkyrie-text | 21.84px | 400 | italic | 27.3px | normal | rgb(0, 0, 0) | 0px | right | 520 | 180 |
| line-spacing | 1920 | title-block + p | valkyrie-text | 21.84px | 400 | normal | 31.668px | normal | rgb(0, 0, 0) | 21.84px | start | 748 | 652 |
| line-spacing | 1920 | aside p (margin note) | heliotrope-t3 | 19.92px | 400 | normal | 27.888px | 0.2988px | rgb(102, 102, 119) | 19.92px | right | 460 | 240 |
| line-spacing | 1920 | a.xref (cross-ref link) | valkyrie-caps | 21.84px | 400 | normal | 31.668px | normal | rgb(0, 0, 0) | 0px | start | 995.11 | 218.45 |
| line-spacing | 1920 | a (plain link in #doc p) | heliotrope-t3 | 21.6px | 400 | italic | 29.16px | normal | rgb(0, 0, 0) | 0px | start | 1070.64 | 113.59 |
| typography-in-ten-minutes | 390 | topic.small | valkyrie-text | 27.846px | 400 | italic | 30.6306px | normal | rgb(0, 0, 0) | 36px | start | 27 | 336 |
| typography-in-ten-minutes | 390 | a.xref (cross-ref link) | valkyrie-caps | 14.4px | 400 | normal | 20.16px | normal | rgb(0, 0, 0) | 0px | start | 45 | 199.14 |
| typography-in-ten-minutes | 390 | a (plain link in #doc p) | valkyrie-text | 16.38px | 400 | normal | 23.751px | normal | rgb(0, 0, 0) | 0px | start | 72 | 111.14 |
| typography-in-ten-minutes | 768 | topic.small | valkyrie-text | 28.5143px | 400 | italic | 31.3657px | normal | rgb(0, 0, 0) | 36.864px | start | 221.17 | 500.75 |
| typography-in-ten-minutes | 768 | a.xref (cross-ref link) | valkyrie-caps | 14.7456px | 400 | normal | 20.6438px | normal | rgb(0, 0, 0) | 0px | start | 239.59 | 203.84 |
| typography-in-ten-minutes | 768 | a (plain link in #doc p) | valkyrie-text | 16.7731px | 400 | normal | 24.321px | normal | rgb(0, 0, 0) | 0px | start | 267.25 | 113.84 |
| typography-in-ten-minutes | 1280 | topic.small | valkyrie-text | 37.128px | 400 | italic | 40.8408px | normal | rgb(0, 0, 0) | 48px | start | 428 | 652 |
| typography-in-ten-minutes | 1280 | a.xref (cross-ref link) | valkyrie-caps | 19.2px | 400 | normal | 26.88px | normal | rgb(0, 0, 0) | 0px | start | 452 | 265.53 |
| typography-in-ten-minutes | 1280 | a (plain link in #doc p) | valkyrie-text | 21.84px | 400 | normal | 31.668px | normal | rgb(0, 0, 0) | 0px | start | 488 | 148.25 |
| typography-in-ten-minutes | 1920 | topic.small | valkyrie-text | 37.128px | 400 | italic | 40.8408px | normal | rgb(0, 0, 0) | 48px | start | 748 | 652 |
| typography-in-ten-minutes | 1920 | a.xref (cross-ref link) | valkyrie-caps | 19.2px | 400 | normal | 26.88px | normal | rgb(0, 0, 0) | 0px | start | 772 | 265.53 |
| typography-in-ten-minutes | 1920 | a (plain link in #doc p) | valkyrie-text | 21.84px | 400 | normal | 31.668px | normal | rgb(0, 0, 0) | 0px | start | 808 | 148.25 |

Plain-link decoration (computed): (sampled link on line-spacing sits inside `div.howto` instruction text, hence heliotrope-t3 italic) practicaltypography/line-spacing/390: text-decoration-line `none`, color `rgb(0, 0, 0)`, ::after content `"\FEFF°"`, ::after color `rgb(153, 51, 51)`, ::after font-size `14.58px`; practicaltypography/line-spacing/768: text-decoration-line `none`, color `rgb(0, 0, 0)`, ::after content `"\FEFF°"`, ::after color `rgb(153, 51, 51)`, ::after font-size `14.9299px`; practicaltypography/line-spacing/1280: text-decoration-line `none`, color `rgb(0, 0, 0)`, ::after content `"\FEFF°"`, ::after color `rgb(153, 51, 51)`, ::after font-size `19.44px`; practicaltypography/line-spacing/1920: text-decoration-line `none`, color `rgb(0, 0, 0)`, ::after content `"\FEFF°"`, ::after color `rgb(153, 51, 51)`, ::after font-size `19.44px`; practicaltypography/typography-in-ten-minutes/390: text-decoration-line `none`, color `rgb(0, 0, 0)`, ::after content `"\FEFF°"`, ::after color `rgb(153, 51, 51)`, ::after font-size `14.742px`; practicaltypography/typography-in-ten-minutes/768: text-decoration-line `none`, color `rgb(0, 0, 0)`, ::after content `"\FEFF°"`, ::after color `rgb(153, 51, 51)`, ::after font-size `15.0958px`; practicaltypography/typography-in-ten-minutes/1280: text-decoration-line `none`, color `rgb(0, 0, 0)`, ::after content `"\FEFF°"`, ::after color `rgb(153, 51, 51)`, ::after font-size `19.656px`; practicaltypography/typography-in-ten-minutes/1920: text-decoration-line `none`, color `rgb(0, 0, 0)`, ::after content `"\FEFF°"`, ::after color `rgb(153, 51, 51)`, ::after font-size `19.656px`

div#content computed (line-length page): @390: margin-left 27px, margin-right 27px, padding-top 0px, x 27, w 336; @768: margin-left 221.184px, margin-right 46.08px, padding-top 55.296px, x 221.17, w 500.75; @1280: margin-left 288px, margin-right 60px, padding-top 72px, x 428, w 652; @1920: margin-left 288px, margin-right 60px, padding-top 72px, x 748, w 652

## press.stripe.com (fallback) - https://press.stripe.com/an-elegant-puzzle

- html font-size 16px; body `background-color: rgb(32, 24, 25)`, body `color: rgb(219, 219, 219)`; rendered most frequent pixel in viewport screenshots `#2f2f2f`, text pixel `#dbdbdb`.
- The description is a single `<p>` with margin 0 (no consecutive paragraphs, no p->p gap). No h1-h4 in the rendered layout; title/author are divs.

| vw | font-family | size | weight | line-height | color | width px | left px | 1ch px | measure ch | chars per line | avg chars/line |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 390 | "Ivar Text", Georgia | 17px | 500 | 25.5px | rgb(219, 219, 219) | 312.02 | 54.59 | 10.36 | 30.12 | [36, 30, 38, 36, 34, 36, 36, 28, 35, 38, 36, 37, 36, 31, 40, 33, 37, 35, 36, 35, 36, 40, 40, 44, 39, 39, 11] | 36.19 |
| 768 | "Ivar Text", Georgia | 17px | 500 | 25.5px | rgb(219, 219, 219) | 614.41 | 107.52 | 10.36 | 59.31 | [66, 74, 70, 76, 74, 74, 71, 71, 74, 69, 76, 82, 75] | 73.08 |
| 1280 | "Ivar Text", Georgia | 17px | 500 | 25.5px | rgb(219, 219, 219) | 451.58 | 726.02 | 10.36 | 43.59 | [54, 54, 44, 53, 51, 53, 57, 54, 49, 58, 49, 56, 56, 51, 56, 58, 58, 41] | 53.59 |
| 1920 | "Ivar Text", Georgia | 17px | 500 | 25.5px | rgb(219, 219, 219) | 537.59 | 1062.39 | 10.36 | 51.89 | [66, 60, 65, 65, 67, 68, 66, 59, 60, 66, 61, 66, 67, 66, 50] | 64.43 |

| vw | element | font-family | size | weight | style | line-height | letter-spacing | color | x | w |
|---|---|---|---|---|---|---|---|---|---|---|
| 390 | div.PressHomepageBookDetails__title | "Ivar Display" | 21.925px | 700 | normal | 30.695px | normal | rgb(219, 219, 219) | 54.59 | 312.02 |
| 390 | div.PressHomepageBookDetails__author | "Ivar Display" | 21px | 500 | italic | 31.5px | normal | rgb(219, 219, 219) | 54.59 | 312.02 |
| 768 | div.PressHomepageBookDetails__title | "Ivar Display" | 24.76px | 700 | normal | 34.664px | normal | rgb(219, 219, 219) | 107.52 | 614.41 |
| 768 | div.PressHomepageBookDetails__author | "Ivar Display" | 21px | 500 | italic | 31.5px | normal | rgb(219, 219, 219) | 107.52 | 614.41 |
| 1280 | div.PressHomepageBookDetails__title | "Ivar Display" | 28.6px | 700 | normal | 40.04px | normal | rgb(219, 219, 219) | 726.02 | 451.58 |
| 1280 | div.PressHomepageBookDetails__author | "Ivar Display" | 21px | 500 | italic | 31.5px | normal | rgb(219, 219, 219) | 726.02 | 97.91 |
| 1920 | div.PressHomepageBookDetails__title | "Ivar Display" | 29.75px | 700 | normal | 41.65px | 0.32px | rgb(219, 219, 219) | 1062.39 | 537.59 |
| 1920 | div.PressHomepageBookDetails__author | "Ivar Display" | 21px | 500 | italic | 31.5px | normal | rgb(219, 219, 219) | 1062.39 | 97.91 |

Link inside the paragraph (computed, @1280; same font/colour at all widths): fontFamily `"Ivar Text", Georgia`, fontStyle `italic`, fontWeight `500`, letterSpacing `0.32px`, color `rgb(219, 219, 219)`, textDecorationLine `underline`, textDecorationColor `rgb(219, 219, 219)`, textDecorationThickness `auto`, textUnderlineOffset `auto`

## iA Writer (screenshots only; native app, no DOM)

Sources: https://ia.net/writer (img/source/video-poster tags) and App Store CH - iPhone/iPad app https://apps.apple.com/ch/app/ia-writer/id775737172, Mac app https://apps.apple.com/ch/app/ia-writer/id775737590. Screenshot URLs from https://itunes.apple.com/lookup?id=775737172,775737590&country=ch; size suffix `/320x480bb.jpg` (iPhone) and `/800x500bb.jpg` (Mac) replaced with `/9999x9999bb.png`; CDN returned native 2796x1290 (iPhone 6.9-inch set, landscape-format marketing images) and 2560x1600 (Mac).

| file | resolution | kind | theme |
|---|---|---|---|
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_iphone_01.png | 2796x1290 | App Store iPhone 6.9-inch screenshot (landscape-format marketing image) | light (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_iphone_02.png | 2796x1290 | App Store iPhone 6.9-inch screenshot (landscape-format marketing image) | dark (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_iphone_03.png | 2796x1290 | App Store iPhone 6.9-inch screenshot (landscape-format marketing image) | dark (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_iphone_04.png | 2796x1290 | App Store iPhone 6.9-inch screenshot (landscape-format marketing image) | dark (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_iphone_05.png | 2796x1290 | App Store iPhone 6.9-inch screenshot (landscape-format marketing image) | light (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_iphone_06.png | 2796x1290 | App Store iPhone 6.9-inch screenshot (landscape-format marketing image) | light (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_iphone_07.png | 2796x1290 | App Store iPhone 6.9-inch screenshot (landscape-format marketing image) | dark (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_iphone_08.png | 2796x1290 | App Store iPhone 6.9-inch screenshot (landscape-format marketing image) | light (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_iphone_09.png | 2796x1290 | App Store iPhone 6.9-inch screenshot (landscape-format marketing image) | light (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_iphone_10.png | 2796x1290 | App Store iPhone 6.9-inch screenshot (landscape-format marketing image) | light (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_mac_01.png | 2560x1600 | App Store Mac screenshot | light (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_mac_02.png | 2560x1600 | App Store Mac screenshot | dark (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_mac_03.png | 2560x1600 | App Store Mac screenshot | dark (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_mac_04.png | 2560x1600 | App Store Mac screenshot | dark (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_mac_05.png | 2560x1600 | App Store Mac screenshot | light (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_mac_06.png | 2560x1600 | App Store Mac screenshot | light (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_mac_07.png | 2560x1600 | App Store Mac screenshot | dark (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_mac_08.png | 2560x1600 | App Store Mac screenshot | dark (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_mac_09.png | 2560x1600 | App Store Mac screenshot | light (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/appstore_mac_10.png | 2560x1600 | App Store Mac screenshot | light (editor surface, classified by visual inspection) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/web_family-all-shadow-1dd365.webp | 2500x835 | marketing image (native size as served) | dark (device mockups on black) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/web_family-apple-shadow-a47f1e.webp | 2500x1155 | marketing image (native size as served) | dark (device mockups on black) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/web_family-desktop-shadow-dec063.webp | 2500x1010 | marketing image (native size as served) | dark (device mockups on black) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/web_family-mobile-shadow-598e43.webp | 2500x790 | marketing image (native size as served) | light (device mockups) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/web_iA-Writer-in-Focus-Mode-slide.png | 2446x1781 | marketing image (native size as served) | light |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/web_iAW-alice-writing-formatting-desktop.png | 3150x1680 | marketing image (native size as served) | split: left editor dark, right preview light |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/web_ia-writer-ios-focus-mode-i2510p.webp | 1412x1344 | marketing image (native size as served) | light |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/web_iaw-alice-focus-desktop-smaller-vuga7w.webp | 3234x1819 | marketing image (native size as served) | light |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/web_iaw-hero-auth-poster-igeknf.webp | 1920x1080 | marketing image (native size as served) | dark (video poster, starfield) |
| /Users/joelsommerer/DEV/ether/bars/visual/ia-writer/web_writer-compare-iaw-mobile-c7720d.webp | 1412x2325 | marketing image (native size as served) | light |

Pixel-sampled colours (most frequent RGB values via Pillow; samples, not design tokens):
- Light editor background: `#f7f7f7` (web_iA-Writer-in-Focus-Mode-slide.png, web_iaw-alice-focus-desktop-smaller-vuga7w.webp); `#f9f9f9` (web_writer-compare-iaw-mobile-c7720d.webp, web_ia-writer-ios-focus-mode-i2510p.webp, appstore_mac_01.png editor area)
- Dark editor background: `#1a1a1a` (web_iAW-alice-writing-formatting-desktop.png left half, appstore_mac_02.png, appstore_mac_03.png); dark editor text `#cccccc` (second most frequent colour in those crops)
- Preview pane (light): background `#fcfcfc`, text `#1a1a1a` (web_iAW-alice-writing-formatting-desktop.png right half)
- Caret samples: `#01c4ff` (desktop, light), `#00b5ff` (appstore_mac_02.png, dark), `#0ac0eb` (iPhone, light)
- Visible in the images (observation only, not measured): monospaced editor face; Focus Mode greys out text outside the current sentence/paragraph; Markdown markers (`#`, `*`) stay visible in the editor; preview pane uses a serif face.

## Not obtained

- practicaltypography.com dark theme and press.stripe.com light theme: not offered by the sites.
- iA Writer: no computed typography (native app); no px font-size, line-height or measure extracted - only pixel-sampled colours. apps.apple.com/ch HTML pages not scraped directly (screenshot URLs via iTunes lookup API, country=ch). iPad screenshots (10 in lookup) and ia.net videos (iAW-*.mp4) not downloaded. Light-mode editor text colour not isolated by sampling.
- Stripe Press: source of rendered background `#2f2f2f` vs computed body background `rgb(32, 24, 25)` not identified.
