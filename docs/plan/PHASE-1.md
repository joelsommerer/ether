# Ether — Phase 1 Plan: The Core Loop

Date: 2026-10-11 · Status: approved for the gauntlet run · Pieces: `docs/plan/pieces/*.json` · Index: `docs/plan/plan-pieces.json`

## 1. Goal

Phase 1 ships a single self-contained `.html` file that is at once the stored document, the viewer and the editor, with a text-input loop that is provably detached from native DOM mutations:

```
beforeinput / composition / shortcuts / clipboard / drop
  → intent → transaction (1..n primitive ops)
  → ledger.append (hash-chained)  → reducer → state
  → ghost(state)   [semantic, keyed by block id]
  → projection: Fluid (edit | read)        [Phase 2+: Solid, Ether]
  → position mapper (model ↔ DOM) → selection restore
guard: MutationObserver on the projection
```

Phases 2+ (Solid/SVG, Ether canvas, assets, merge UI, print export, web fonts) are out of scope. Phase 1 must lay a format they can build on without breaking files written in Phase 1.

## 2. Decisions (2026-10-11)

| # | Topic | Decision | Why |
|---|---|---|---|
| D1 | Dependencies | Zero runtime dependencies. Source is plain JavaScript with JSDoc types, checked by `tsc --checkJs` (dev only). No bundler: `tools/build.mjs` (Node built-ins only) concatenates `src/` and runs an in-house conservative minifier (comments/whitespace, never renames). Test-only deps: `typescript`, `@playwright/test`, `axe-core`, pinned exactly. | Spec constraint 1 applies to the document; proving "flawless" needs real browsers. |
| D2 | Input surface | Constrained `contenteditable` on the Fluid surface. Every cancelable `beforeinput` → `preventDefault()` → ledger → render. Composition (`insertCompositionText`) is not cancelable (Input Events L2) and is reconciled at `compositionend`. | Native caret, selection, spellcheck, mobile handles and screen-reader editing. Solid is immutable by spec, so it never needs an input surface; Ether can host contenteditable per element. |
| D3 | Ghost DOM | Always built; it is the source of every projection. In Fluid (edit **and** read) the projection is itself semantic, so the ghost is `inert` (no double reading, no double Cmd+F hits). The ghost is exposed as `.sr-only` (projection `aria-hidden`) only for non-semantic projections (Solid/Ether, Phase 2+); the switch is built and tested in Phase 1 against a stub. | Spec item 3 without breaking screen-reader editing or find-in-page. |
| D4 | Phase 1 extras | Save and reopen, undo/redo, formatting (p, h1–h3, bold, italic, bullet list), copy/cut/paste plain text, drag-move inside the document. | With every input intercepted, anything not built is dead. |
| D5 | Ledger | Hash-chained DAG, merge-ready. Event id = SHA-256 (in-house, synchronous) of the canonical JSON of the event without its id. Parents, actor and Lamport clock are part of the hashed event but stored implicitly when derivable (§4). | "Cryptographic delta" plus Phase 6 merge without a format break; lean files. |
| D6 | Encoding | Canonical JSONL now; `deflate-raw` via native `CompressionStream` + Base64 as the last engine piece (E1-015). | Debuggable while the schema settles. |
| D7 | Platforms | Hard gates on five targets: Chromium, Firefox, WebKit (Playwright, desktop), Safari on iOS Simulator "Ether iPhone 17 Pro" (safaridriver, `safari:useSimulator`), Chrome on Android emulator AVD "ether" (CDP via `adb forward`). | Owner decision ("all hard"). |
| D8 | Size | Blank document ≤ 32 KB on disk at the end of Phase 1, per-piece ratchet (§9). | "File bloat is the enemy." |
| D9 | Behaviour bar | Native contenteditable of the same browser (text + caret oracle) and the ProseMirror basic example (structure). | Automatable, no login, per-engine truth. |
| D10 | Visual bar | iA Writer (writing surface) and practicaltypography.com (reading typesetting, live in the same viewports; fallback press.stripe.com). Floor: UA-default rendering of the same fixture. | Typographer-grade references; one of them comparable live. |
| D11 | Repo | github.com/joelsommerer/ether, public, MIT, English. Local container `~/DEV/ether/{main,phase1}`, one worktree per phase. | Open standard. |
| D12 | Orchestration | Gauntlet loop: scout → per piece a fresh builder and a separate critic (Opus) → hard gates → blind verdict → one gap back → commit + push per won piece → regression every 5 pieces → live progress page. Pause a piece after 3× the same gap or 10 rounds. | Proven in earlier projects. |
| D13 | Commits | Conventional Commits in English, no AI trailers. | Owner convention. |
| D14 | Event granularity | Word-level coalescing ("typing a word" = one event). Flush on word boundary (`Intl.Segmenter`), 1 s idle, caret jump, op-type change, save, undo, `webdoc.ledger()` read. | Spec wording; keeps the ledger small. |
| D15 | Offsets | UTF-16 code units. Ops never split a surrogate pair; caret positions on grapheme boundaries (`Intl.Segmenter`). | JS-native, deterministic. |
| D16 | Security | CSP meta `default-src 'none'` with hashes for the inline script and style. User content is never parsed as HTML into the live document (no `innerHTML`, `outerHTML=`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`). | The file is executable; it must be inert to its own content and offline by construction. |

## 3. Modules (`src/`)

`sha256.js` · `canon.js` (canonical JSON) · `model.js` (state, ops, validator, reducer, inverse) · `ledger.js` (parse, expand, verify, append, serialize) · `ghost.js` · `fluid.js` (projection, guard) · `map.js` (positions) · `input.js` (beforeinput router, coalescing) · `ime.js` · `history.js` · `format.js` · `clip.js` · `save.js` · `compress.js` · `ui.js` · `main.js` · `template.html`.

Public read-only API `window.webdoc` (documented in SPEC): `version`, `state()`, `hash()`, `ledger()`, `selection()`, `toHTML()`. The test harness uses only this API plus the DOM.

## 4. Ledger format v0 (sketch — frozen in `docs/SPEC.md` by E1-003)

```html
<script type="application/document-ledger" id="ledger">
{"fmt":"webdoc/0","enc":"jsonl","doc":"<128-bit base62>","heads":["<sha256 hex>"]}
{"a":"k7Qx2m","t":1760198400,"x":[{"op":"blk","b":"k7Qx2m:1","after":null,"type":"h1"}]}
{"x":[{"op":"ins","b":"k7Qx2m:1","o":0,"s":"Hello "}]}
{"x":[{"op":"ins","b":"k7Qx2m:1","o":6,"s":"world"}]}
</script>
```

- Logical event: `{id, p:[parent ids], a:actor, c:lamport, t:unix seconds, x:[ops], u?:undone id}`.
- Stored lean: `id` never stored (recomputed); `p` omitted when it equals the previous line's id; `c` omitted when it equals previous `c` + 1; `a` omitted when unchanged. Hashing always runs over the expanded event.
- Ops: `blk` (new block after a block id), `split`, `join`, `ins`, `del`, `fmt` (mark on/off over a range), `type` (p|h1|h2|h3|li). An event is one user action; undo granularity = event.
- Block ids `<actor>:<n>`; order by `after` references (merge-safe).
- Escaping: `<` → `<`, U+2028/U+2029 escaped; lone surrogates rejected.
- Blank template ships an empty ledger; the genesis (fresh doc id) is created on first edit, so documents made from the same blank are not forks of each other.
- Integrity: recompute the chain; `heads` mismatch → integrity banner and read-only, never silent repair. Unknown `fmt` or op → read-only with message.

## 5. "Mathematically flawless" = these invariants hold after every step

| ID | Invariant |
|---|---|
| I1 | Outside an active composition the visible projection DOM equals `render(state)` (normalized structural deep-equal). |
| I2 | Ghost DOM equals `ghost(state)`; same state → byte-identical ghost markup on every target. |
| I3 | `replay(ledger)` equals the live state (state hash). |
| I4 | Final text equals the reference model applied to the logical op sequence; for plain-text scenarios also equals the native contenteditable result (text + caret) in the same browser. |
| I5 | The MutationObserver sees zero mutations not issued by the renderer; the only allowlisted exception is the composing text node during an active composition. |
| I6 | Model selection equals the mapped DOM selection; never inside a surrogate pair or grapheme cluster. |
| I7 | `serialize → load` gives the same state hash; the HTML stays valid (one ledger script, one engine script, CSP hash valid). |
| I8 | Recomputed chain heads equal the stored heads. |

Fuzzing: seeded sequences (50–200 steps) over a weighted alphabet (words incl. umlauts, ZWJ emoji, CJK, Thai, combining marks; Enter, Shift+Enter; all delete variants; ranges incl. cross-block; select all; paste; undo/redo; Mod+B/I; markdown rules; composition where the driver supports it). 10 000 sequences per desktop target, 1 000 per mobile target, same seeds everywhere. Failing seeds are shrunk to a minimal scenario and added to the corpus.

## 6. Gates (`node tools/gates.mjs --piece <ID> [--targets all]`)

| Gate | Check |
|---|---|
| G1 | `tsc -p jsconfig.json` (checkJs, strict, noEmit): 0 errors |
| G2 | `tools/lint.mjs`: no HTML-string sinks, no eval, no TODO/FIXME, no external URLs in `src/` |
| G3 | `node --test`: model, SHA-256 (NIST vectors), canonical JSON, property tests |
| G4 | Playwright desktop (Chromium, Firefox, WebKit): scenario corpus against `dist/blank.html` (minified) **and** `dist/blank.dev.html`, on `file://` and `http://localhost` |
| G5 | Fuzz differential (§5): 10 000 per desktop target, 0 violations |
| G6 | Mobile: iOS Simulator Safari + Android emulator Chrome — scenario corpus + 1 000 fuzz, 0 violations |
| G7 | Round trip and integrity: save → reopen → equal hash on all targets; tampered ledgers → banner, read-only, no exception |
| G8 | Size ratchet: `dist/blank.html` ≤ the piece's ceiling (§9) |
| G9 | Accessibility and find: a11y snapshot text exposed exactly once; `window.find` count 1 per unique word; axe-core 0 serious/critical |
| G10 | Performance: input → committed render p95 ≤ 4 ms desktop / ≤ 16 ms mobile on the 10k-word fixture; load + verify + replay ≤ 300 ms desktop / ≤ 1 s mobile |
| G11 | Network silence and CSP: 0 requests during runs, 0 CSP violations, CSP hashes match |
| G12 | Docs: SPEC, ADR, README, input matrix updated for the piece |

A gate a driver cannot execute is **not checked**, never green. Only Joel may relax a gate or threshold.

## 7. Bars

- **B1 native oracle** — `bench/oracle/native.html`: a plain contenteditable; records text and caret after every step on each target.
- **B2 ProseMirror** — https://prosemirror.net/examples/basic/: structure, marks and selection after every step, per target; prosemirror-view version recorded. Behaviour only: no ProseMirror code is copied.
- **B3 visual** — iA Writer (ia.net/writer, App Store screenshots) and practicaltypography.com (captured live at 390, 768, 1280 and 1920 px, light and dark where offered); fallback press.stripe.com. Third-party screenshots live outside the repo in `~/DEV/ether/bars/`; only the manifest (URL, date, sha256, viewport) is committed.
- **F1 floor** — UA-default rendering of the same fixture.
- **Fixtures** (public domain): EN excerpt of *The Elements of Style* (Strunk, 1918), DE excerpt of *Die Verwandlung* (Kafka, 1915), a stress fixture (ZWJ emoji, flags, combining marks, CJK, Thai, RTL for text integrity only), and a generated 10k-word document.

## 8. Critic modes (from each piece's `kind`)

| kind | How the critic judges |
|---|---|
| `infra`, `model` | Criteria: run every acceptance criterion itself; the gap is the first criterion without evidence. |
| `behavior` | Differential: corpus and fuzz on ours, B1 and B2 per target; results anonymized as X/Y/Z; each divergence judged blind ("which outcome would a user expect?"); ties go to the bar. Plus criteria. |
| `visual` | Blind screenshots (neutral file names) ours vs B3 **and** ours vs F1 at 4 viewports × light/dark; ours must win both. |
| `design-gate` | No verdict. The builder delivers 5 bullets with concrete values plus one isolated prototype; Joel approves (X-03). The loop continues with independent pieces meanwhile. |

## 9. Pieces, run order and size ceilings

| Order | ID | Milestone | Title | kind | Ceiling (KB) | Depends |
|---|---|---|---|---|---|---|
| 1 | E1-001 | M0 | Repo, build, CSP shell, gate runner, CI | infra | 2 | – |
| 2 | E1-002 | M0 | Measurement rig: 5 targets, scenario DSL, oracles, fuzz + shrink | infra | 2 | E1-001 |
| 3 | E1-003 | M0 | Format SPEC v0 + reference model (pure, Node) | model | 9 | E1-001 |
| 4 | E1-004 | M0 | Fluid design proposal (Joel gate) | design-gate | – | E1-001 |
| 5 | E1-005 | M1 | Ledger in the document: load, verify, replay, serialize | model | 11 | E1-003 |
| 6 | E1-006 | M1 | Ghost DOM generator + exposure modes | model | 12.5 | E1-005 |
| 7 | E1-007 | M1 | Fluid projection, position mapper, mutation guard | behavior | 16 | E1-006, E1-002 |
| 8 | E1-008 | M1 | Input engine: beforeinput router, inputType matrix, word coalescing | behavior | 20 | E1-007 |
| 9 | E1-009 | M1 | Composition and IME reconciliation | behavior | 22 | E1-008 |
| 10 | E1-010 | M2 | Undo/redo as appended inverse events | behavior | 23.5 | E1-009 |
| 11 | E1-011 | M2 | Formatting: marks, headings, lists, input rules | behavior | 26 | E1-010 |
| 12 | E1-012 | M2 | Clipboard and drag-move | behavior | 27.5 | E1-011 |
| 13 | E1-013 | M2 | Save and reopen | behavior | 29 | E1-012 |
| 14 | E1-014 | M3 | Fluid design implementation + read mode | visual | 31 | E1-013, E1-004 (X-03) |
| 15 | E1-015 | M3 | Ledger compression | model | 32 | E1-013 |
| 16 | E1-016 | M3 | Performance and hardening | infra | 32 | E1-014, E1-015 |
| 17 | E1-017 | M3 | Phase 1 acceptance, SPEC v0.1, v0.1.0 release draft, PR | infra | 32 | E1-016 (X-04) |

If a piece cannot meet its ceiling, it pauses and Joel decides (own identifier renamer in the minifier vs. budget change).

## 10. External steps (Joel)

| ID | Step | Needed by |
|---|---|---|
| X-01 | `sudo safaridriver --enable` once on the Mac | before the run (E1-002) |
| X-02 | Safari › Advanced › Remote Automation **on** in the Settings app of simulator "Ether iPhone 17 Pro" | before the run (E1-002) |
| X-03 | Approve the Fluid design proposal (E1-004) → recorded in `docs/adr/0002-fluid-design.md` | E1-014 |
| X-04 | Manual IME checklist: Swiss-German dead keys (^ ` ´ ¨ ~) in Safari/Firefox/Chrome; macOS Japanese, Korean, Pinyin; macOS autocorrect, text replacement, dictation; iOS autocorrect, predictive bar, dictation, swipe typing; Android Gboard glide and voice typing | E1-017 |

## 11. Rules for every agent

- Work only in the phase worktree. Never commit third-party screenshots or text (bars live in `~/DEV/ether/bars/`).
- Devices: only simulator "Ether iPhone 17 Pro" and AVD "ether". Never touch other simulators or AVDs. Every `simctl`/`adb` call has a timeout.
- Long commands (browser installs, emulator boot, full fuzz) run in the background with output to a file.
- Never weaken a test, gate or threshold to pass. Never mark a driver limitation as green.
- No HTML-string sinks; DOM is built with `createElement`/`textContent`.
- English code, comments, docs and Conventional Commits; no AI trailers. Builders never commit; a separate step commits reported files only.

## 12. Risks

| ID | Risk | Handling |
|---|---|---|
| R1 | Composition automation exists only via CDP (Chromium desktop, Android). | Firefox/WebKit/iOS composition marked "not checked" in G5/G6; covered by iOS simulator keyboard scripts (E1-009) and X-04. |
| R2 | With the native undo stack empty, Edit-menu Undo and iOS shake/three-finger undo may never fire `historyUndo`. | Keyboard shortcuts are the contract; gestures documented if not emitted. |
| R3 | Outside Chromium, "save" is a download (new file), not in-place. | Documented limitation of the format in README. |
| R4 | iOS may open local `.html` from Files as a preview without JavaScript. | Scout verifies; documented as a Phase 1 limitation if true. |
| R5 | In-house minifier could break code. | Minifier corpus tests; every gate runs against the minified dist. |
| R6 | 32 KB without identifier renaming is tight. | Ceilings per piece; pause + Joel decision. |
| R7 | Word-level history grows: ~400 KB JSONL for 10k words. | Compression target ≤ 150 KB (E1-015); history squash later. |
| R8 | The `google_apis` Android image may lack Chrome or CDP access. | Scout checks first; otherwise Joel decides the Android target. |
| R9 | A `.html` document is executable: a malicious file can carry its own engine. | CSP limits network and foreign scripts; engine-hash allowlists or signatures are a later-phase format question. |
| R10 | Chrome gives all `file://` documents one origin. | No local-storage drafts in Phase 1. |
| R11 | Pixel-perfect Solid (Phase 2) needs embedded fonts; the spec allows fonts only on demand. | Decide before Phase 2. |
| R12 | Append-only history keeps every deleted word in the shared file (privacy leak like Word's tracked changes). | "Export clean copy" (squashed history) must exist before anyone shares real documents; scheduled for Phase 2. |

## 13. Out of scope for Phase 1

Solid/SVG rendering, Ether canvas, images and video, rich HTML paste, links, ordered and nested lists, tables, comments, merge UI (the format already allows DAGs), print/PDF, web fonts, collaboration, mobile gesture undo.
