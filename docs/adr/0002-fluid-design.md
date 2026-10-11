# ADR 0002 — Fluid design: type, rhythm, colour, caret, read mode, chrome

Date: 2026-10-11 · Status: **proposed** (awaiting Joel, X-03) · Piece: E1-004 · Plan decisions: D2, D3, D10 · Implemented by: E1-014

## Context

Before any styling reaches the engine, Joel approves one concrete visual interpretation of the Fluid projection for writing (edit mode) and reading (read mode). Bars (PHASE-1.md §7, D10): iA Writer for the writing surface, practicaltypography.com for reading typesetting, press.stripe.com as fallback; floor F1 is the UA-default rendering of the same fixture. Constraints: system fonts only in Phase 1 (offline, no web fonts), nothing copied from the bars (layout, text, brand), and every byte counts against the 31 KB ceiling of E1-014.

Prototype: [`bench/design/fluid-prototype.html`](../../bench/design/fluid-prototype.html) — static, no engine, the EN (Strunk) and DE (Kafka) fixtures as their replayed state. `?mode=read` and `?theme=light|dark` switch mode and theme; the Edit/Read toggle works by click. Screenshots and measurements: `node bench/design/shoot.mjs`.

## Decision — five bullets

All px values below are measured from the prototype (Chromium 156, `bench/design/shoot.mjs`, file `metrics.json`) at the four bar viewports 390×844 / 768×1024 / 1280×800 / 1920×1080 CSS px.

1. **Type: one serif for text and headings, system sans for chrome; size, line height and measure.**
   - Text stack: `Charter, "Bitstream Charter", "Sitka Text", Cambria, "Noto Serif", serif` — macOS/iOS: Charter (ships with both; same face in Safari, Chrome and Firefox, unlike `ui-serif`, which only Safari maps to New York); Windows: Sitka Text, else Cambria; Android: Noto Serif (via `serif`); Linux: Bitstream Charter, else Noto Serif. Verified on macOS: `CSS.getPlatformFontsForNode` reports Charter-Roman / Charter-Italic / Charter-Bold. Other OS: not checked.
   - Chrome stack: `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif` (macOS: SF, measured `.SFNS-Regular`).
   - The same face, size and line height in edit and read mode, so switching modes does not reflow the text.
   - Body size `clamp(1.125rem, 1rem + 0.5vw, 1.3125rem)` → **18 / 19.84 / 21 / 21 px**; line height **1.5** → 27 / 29.76 / 31.5 / 31.5 px. Weight 400, `font-kerning: normal`, common ligatures.
   - Headings (weight 700, `text-wrap: balance`): h1 **1.75em** / line height 1.15 (31.5 / 34.72 / 36.75 / 36.75 px); h2 **1.3125em** / 1.25 (23.63 / 26.04 / 27.56 / 27.56 px); h3 **1.0625em** / 1.4 (19.13 / 21.08 / 22.31 / 22.31 px).
   - Measure **`max-inline-size: 56ch`** (content box), centred; side gutter `clamp(1.25rem, 5vw, 3rem)` → 20 / 38.4 / 48 / 48 px. Measured on the longest paragraph: 35.0 / 56.0 / 56.0 / 56.0 ch, i.e. 350 / 617.9 / 654.0 / 654.0 px wide, **39.3 / 63.3 / 63.3 / 63.3 average characters per line** in edit mode (66.6 at ≥ 768 px in read mode, where automatic hyphenation fills the lines). At 390 px the width, not the measure, limits the line.
2. **Vertical rhythm on a 1.5 line.**
   - Block gap (p→p, p→list, list→p): **0.75em** = half a line → 13.5 / 14.88 / 15.75 / 15.75 px (measured p→p). List items: 0.25em between items, `padding-inline-start: 1.25em`, markers in the muted colour.
   - Space before headings: h2 **1.75em** of its own size (41.3 / 45.6 / 48.2 / 48.2 px), h3 **1.5em** of its own size (28.7 / 31.6 / 33.5 / 33.5 px); after h1 **1em**; after h2/h3 **0.35em** (heading binds to its text). Between two documents/articles 4.5em (three lines).
   - Page: top padding `3rem (chrome) + max(2rem, 8vh)`, bottom padding **40vh** so the last line can be scrolled up to eye level while writing. `orphans: 2; widows: 2`. Headings `break-after: avoid`.
3. **Colours via `color-scheme: light dark` and `light-dark()`, following the OS theme.**

   | Token | Light | Dark |
   |---|---|---|
   | background | `#fbfaf7` | `#191817` |
   | text (body and headings) | `#1d1c1a` | `#dad6cf` |
   | muted (chrome, list markers) | `#5f5b54` | `#a29d94` |
   | rule (toggle outline, pressed state) | `#d9d5cd` | `#3a3733` |

   Measured WCAG contrast (computed colours, in-page): **body text 16.31:1 light / 12.24:1 dark** (requirement ≥ 7:1); muted 6.47:1 / 6.57:1 (≥ 4.5:1). No pure black or white: the warm off-white and the off-black reduce glare and halation without dropping below 12:1. No manual theme switch in Phase 1 (chrome stays minimal); the prototype's `?theme=` exists only for review. Browsers without `light-dark()` (before Safari 17.5 / Chrome 123 / Firefox 120) would need a light fallback declaration — decided in E1-014 against the size budget.
4. **Caret, selection and the read-mode column threshold.**
   - Caret: native caret (D2), `caret-color` **`#c63f14` light / `#ff7b47` dark** — 4.88:1 / 6.90:1 against the background (≥ 3:1 for non-text). 1 CSS px wide (the platform caret; no custom caret in Phase 1). Deliberately not the bar's cyan.
   - Selection: `::selection { background: #f5cdb6 light / #66301a dark; color: text }` → text on selection **11.59:1 / 7.24:1**. In the screenshots a live caret (after "Wänden.") and a selection sample ("no unnecessary words", drawn with the Custom Highlight API in exactly the `::selection` colours) are shown together; a document has only one real selection.
   - Read mode: no caret (`caret-color: transparent`, `contenteditable=false`), `hyphens: auto` (by `lang`), `text-wrap: pretty`; edit mode keeps `hyphens: manual` and no `pretty` so lines above the caret do not re-wrap while typing.
   - **Two columns in read mode from `(min-width: 1400px) and (min-height: 700px)`**: `columns: 2; column-gap: 2.5em`, container `max-inline-size: calc(2 × 48ch + 2.5em)` → two columns of 48 ch / 560.6 px (57.4 average characters per line) at 1920 px; 390, 768 and 1280 px stay single-column (measured `column-count`: auto, auto, auto, 2). h1 and h2 span both columns, so every section balances on its own and columns stay about half a section tall; p, li and h3 never break across columns (`break-inside: avoid`). Below the threshold read mode is the edit layout without caret.
5. **Minimal chrome: save state and mode toggle, nothing else.**
   - One row, `position: fixed` top, height **3rem (48 px)**, right-aligned, inline padding = page gutter, background = page background at 92 % opacity, no border or shadow. Type 0.8125rem (13 px) system sans, weight 500, letter-spacing 0.01em, muted colour.
   - Save state (`role="status"`): 6 px dot + label — "Saved" (dot muted) or "Unsaved changes" (dot in the caret colour). The edit screenshots show "Unsaved changes", the read screenshots "Saved".
   - Mode toggle: two-segment group "Edit | Read" (`aria-pressed`), segment height 1.75rem (28 px ≥ 24 px WCAG 2.5.8), 1 px rule-coloured outline, radius 1rem, pressed segment filled with the rule colour; focus ring 2 px in the caret colour, offset 2 px.
   - No toolbar, menus, word count or logo; formatting stays on keyboard shortcuts and input rules (E1-011).

## Screenshots (outside the repo)

Rendered by `node bench/design/shoot.mjs` with Playwright Chromium, DPR 2, full page, `prefers-color-scheme` emulated; directory `~/DEV/ether/bars/ours/E1-004/` (next to the bar captures in `~/DEV/ether/bars/visual/`):

- The 8 deliverables (edit mode): `fluid-edit_390_light.png`, `fluid-edit_768_light.png`, `fluid-edit_1280_light.png`, `fluid-edit_1920_light.png`, `fluid-edit_390_dark.png`, `fluid-edit_768_dark.png`, `fluid-edit_1280_dark.png`, `fluid-edit_1920_dark.png`
- Supplement (read mode, shows the column threshold): `fluid-read_<width>_<theme>.png`, same 8 combinations
- Measurements: `metrics.json`
- Floor F1 for the blind pre-check (same fixture, prototype stylesheet and chrome removed, UA defaults): `~/DEV/ether/bars/floor/E1-004/floor_<width>_<theme>.png`

Caret presence was checked in all 8 edit screenshots (caret-coloured pixels below the chrome: 88–104 per image, a 2-image-px-wide bar after "Wänden.").

## Blind pre-check (informational)

Result of the critic's blind comparison (ours vs the bars and vs F1, anonymized). It is not a gate; the gate is Joel.

- **vs floor F1 (UA defaults): ours wins.**
- **vs bar: the bar wins.** Reason: two-column read mode at 1920 px leaves large empty holes. Because p, li and h3 are unbreakable (`break-inside: avoid`), the columns do not balance. Under "I. Introductory" the right column stays empty.
- Consequence for the decision below: the open column question (see Consequences) is not theoretical. The current threshold produces this unbalanced layout at 1920 px (`fluid-read_1920_light.png` / `fluid-read_1920_dark.png`).

## Approval (X-03)

Pending — needs Joel's decision. What to review:

1. The 8 edit screenshots and the read-mode supplement in `~/DEV/ether/bars/ours/E1-004/`. Compare them with the bars in `~/DEV/ether/bars/visual/` and the floor in `~/DEV/ether/bars/floor/E1-004/`. Look especially at `fluid-read_1920_*.png`.
2. The prototype opened directly in a browser: `bench/design/fluid-prototype.html?mode=read&theme=dark` (also `?mode=read&theme=light`, and without `mode` for edit mode), in a window at least 1400 × 700 px wide so the columns appear.
3. The column question, one of: **(A)** accept two columns as proposed; **(B)** drop columns (read mode is always single-column); **(C)** keep columns, but E1-014 keeps long sections single-column.
4. Optionally: any changes to the five bullets above.

On approval Joel records the decision here and the status changes to **accepted**; changes requested go back into this ADR before E1-014 starts.

## Consequences

- E1-014 implements exactly these values in `src/style.css`; the prototype's stylesheet is about 4.8 KB with comments and about 3.3 KB with comments and whitespace removed (before the E1-014 rewrite against the size budget).
- One face in both modes means the read/edit switch never moves text; the only reflow is hyphenation and, from 1400 × 700 px, the columns.
- Long sections (> about two viewport heights in one column) still produce columns taller than the viewport in read mode, so the reader scrolls down and back up. Options for Joel: accept, drop columns, or let E1-014 measure section height and keep such a section single-column (layout read only, no DOM mutation outside the renderer).
- Fonts differ per OS; line breaks and page height are not identical across platforms (Fluid is responsive by definition; pixel-identical output is Solid's job in Phase 2, R11).
- Not checked: rendering on Windows, Linux and Android fonts; WebKit, Firefox and the mobile targets (the screenshots are Chromium on macOS only); `::selection` styling inside `contenteditable` on iOS Safari.

## Alternatives considered

- Monospace writing face (as the writing bar uses): strong writing feel, but a mode switch would then change face and reflow everything, and the read bar is a proportional serif.
- `ui-serif` first (New York on Apple): only Safari maps it, so Chrome and Firefox on the same Mac would show a different face.
- Sans text (`system-ui`): neutral, but weaker for long reading than the serif bars.
- One column always in read mode: simplest and safest; columns are proposed because the piece asks for a threshold, with the limitation above.
- Paragraphs allowed to break across the columns: in the prototype Chromium split a four-line paragraph 2 + 2 with `orphans/widows: 2` and 3 + 1 with `orphans/widows: 3` (widows not honoured), and a hyphenated word broke across the column gap; rejected in favour of unbreakable blocks.
