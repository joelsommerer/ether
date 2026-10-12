# test/

| Folder | What |
|---|---|
| `unit/` | `node --test` (gate G3): format core, tooling, and the measurement rig's pure parts (`rig.test.js`, `rig-invariants.test.js`) |
| `e2e/` | Playwright test runner suites (desktop): the document shell's CSP and network checks (G11) |
| `rig/` | The measurement rig (piece E1-002): drivers, runner, invariants, fuzz generator, shrinker, reports |
| `scenarios/` | The scenario corpus (DSL below); `scenarios/regressions/` holds shrunk failing seeds |
| `fixtures/`, `helpers/` | Inputs and generators for the unit tests |

## Measurement rig

One harness drives the same scripted input against three subjects on five targets and records a snapshot after every step:

| Subject | Page | Bar |
|---|---|---|
| `native` | `bench/oracle/native.html` — plain `contenteditable`, browser defaults | B1 |
| `pm` | <https://prosemirror.net/examples/basic/> (the recorder is injected; network needed) | B2 |
| `ours-*` | `dist/blank.html` and `dist/blank.dev.html`, over `http://127.0.0.1` and (desktop) `file://` | — (probed every corpus run: load, page errors, `window.webdoc`, I1–I8; scenarios run on it once the recorder can load a starting content into it — today `reset` reports "no editable surface") |
| `stub` | `bench/stubs/broken.html` — native oracle plus a planted bug (Backspace drops every "ü" of the caret's text node) | rig self-test |

| Target | Driver | Composition | Paste | Pointer | Drag |
|---|---|---|---|---|---|
| `chromium` | Playwright (headless) | CDP `Input.imeSetComposition` + `Input.insertText` | clipboard API + Mod+V | mouse | unsupported-by-driver (no `dragstart`) |
| `firefox` | Playwright (headless) | unsupported-by-driver | clipboard API + Mod+V | mouse | mouse |
| `webkit` | Playwright (headless) | unsupported-by-driver | clipboard API + Mod+V | mouse | unsupported-by-driver (no `dragstart`) |
| `ios-safari` | Safari on the simulator "Ether iPhone 17 Pro" in normal (non-automation) mode: scripts over the simulator's Web Inspector socket (`test/rig/drivers/wir.mjs`), taps and typing through the XCUITest runner `test/rig/ios-typer` (`test/rig/drivers/ios.mjs`); host via `http://127.0.0.1`. Keys: text, Backspace, Enter, plain arrows; modifiers, Delete, shortcuts, undo/redo are unsupported-by-driver | unsupported-by-driver | unsupported-by-driver (Cmd+V needs a modifier) | touch (XCUITest tap) | unsupported-by-driver |
| `android-chrome` | Chrome on AVD `ether`, `adb forward tcp:9333 localabstract:chrome_devtools_remote`, Playwright `connectOverCDP`; host via `adb reverse` | CDP | clipboard API + Ctrl+V | touch (`Input.synthesizeTapGesture`) | unsupported-by-driver |

"Mod" is Meta on macOS and iOS targets and Control on Android. The desktop browsers run with Playwright's macOS key bindings, so inputTypes that come from a key binding (yank, transpose, line deletes, `formatBold` in WebKit, …) depend on that table; the corpus report lists, per target, which Phase-1 inputTypes the native oracle actually received.

**A driver limitation is never a pass.** A step the driver cannot perform is recorded as `unsupported-by-driver` and makes the scenario — and the target — `incomplete` (gates: not-checked). Two self-checks keep silent failures out:

- *Keyboard probe:* before every suite the rig types "ab" into an empty native paragraph. If the text does not arrive, every keyboard step (text, key, shortcut, undo, redo, paste) on that target is `unsupported-by-driver`. With `safaridriver` the probe fails on the iOS simulator (key events arrive, no text is inserted; `ETHER_IOS_DRIVER=webdriver` reproduces it), which is why `ios-safari` types through XCUITest (see ADR 0004).
- *Deliverable keys:* a driver that delivers only some keys says so (`page.canKey`); every other key, shortcut, undo or redo step is `unsupported-by-driver` instead of a silent no-op. On iOS this applies to every key with a modifier, forward Delete and Command shortcuts (measured: they arrive without modifier, as keydown only, or not at all).
- *Drag check:* a drag step that fires no `dragstart` did not reach the browser's drag machinery and is `unsupported-by-driver`.

Native quirks are recorded, not hidden: a selection offset beyond its node's length (WebKit after some undos) is clamped for mapping and flagged as `sel.invalidOffset`; fuzz reports count such snapshots under "oracle quirks".

Driver details that are not limitations: on Android the first key events after a script focus are dropped until the input connection exists, so the runner waits 500 ms after a reset; on iOS a script focus starts no text input session, so the runner focuses with a real XCUITest tap at the reset caret and restores the caret by script (iOS snaps a tap to a word boundary). The tap is placed relative to the editing host: the page measures the host's client rect, the XCUITest runner finds the text view of that size and taps at the same offset inside it, so safe-area insets, scrolling and the software keyboard need no coordinate mapping. The XCUITest runner is built on first use into `test-results/ios-typer/` (`xcodebuild build-for-testing`, Xcode only) and ends by itself after 300 s without a command.

### Commands

```sh
npm run build                                   # our document must exist in dist/
node tools/devices.mjs up|down|status           # Ether simulator + AVD only (also: npm run devices -- status)
node tools/rig.mjs corpus  --targets all        # every scenario on every target (npm run rig -- corpus ...)
node tools/rig.mjs fuzz    --targets desktop --count 1000 [--subject native] [--seed 1] [--hash-count 1000]
node tools/rig.mjs planted --targets all        # planted bug: detect, shrink, save under scenarios/regressions/
node tools/rig.mjs summary                      # one line per report in test-results/rig/
node tools/gates.mjs --piece <ID> --targets all # G4 (desktop corpus), G5 (fuzz on ours), G6 (mobile corpus + fuzz) use the rig
```

Options: `--only id,id` (corpus), `--workers n` (desktop, at most 4), `--no-pm`, `--max-seeds`, `--control`, `--no-save`, `--keep-devices`. Mobile targets boot their device through `tools/devices.mjs` when needed and shut it down again if the rig booted it. The static server (`tools/serve.mjs`, port `ETHER_RIG_PORT`, default 41741) is started and stopped by the rig.

Reports (gitignored): `test-results/rig/corpus-<target>.{json,md}` (target × scenario × step: step, status, blocks, selection, input events), `fuzz-<target>-<subject>.{json,md}` (action-list digest, in-browser generator check, duration, throughput, violations), `planted-<target>.{json,md}`.

`tools/devices.mjs up|down` compares every other simulator, AVD and running emulator before and after and fails if anything else changed (`test-results/devices/<command>-<time>.json`). Every `simctl`, `adb`, `emulator` and `avdmanager` call goes through `timed()` (`test/rig/sh.mjs`); the emulator daemon itself is started under a boot watchdog. `test/unit/rig.test.js` greps `tools/` and `test/` for device calls outside `timed()`.

## Scenario DSL (`test/scenarios/*.json`)

```json
{
 "id": "yank",
 "title": "Control+K kills, Control+Y yanks (macOS)",
 "tags": ["plain"],
 "covers": ["insertFromYank", "deleteHardLineForward"],
 "init": [{ "t": "p", "s": "Hello world" }],
 "steps": [{ "select": { "anchor": [0, 5] } }, { "key": "k", "mods": ["Control"] }, { "select": { "anchor": [0, 0] } }, { "key": "y", "mods": ["Control"] }]
}
```

- `init`: starting blocks `{t: "p"|"h1"|"h2"|"h3"|"li", s: text, m?: mark digits}` (consecutive `li` form one bullet list; marks: one digit per UTF-16 unit, 1 = bold, 2 = italic). After the reset the caret is at the end of the last block.
- `tags`: `plain` (text-only, compared with the native oracle by I4), `structural`, `marks`, `history` (these three also run on ProseMirror), `composition`, `paste`, `pointer`, `navigation`, `regression`.
- `covers`: the Phase-1 inputTypes the scenario is meant to provoke (`MATRIX` in `test/rig/dsl.mjs`: the E1-008 handled and delegated types). Every matrix type is covered by at least one scenario (unit test); whether a target actually emitted it is in the corpus report.
- Steps, one kind each:

| Step | Meaning |
|---|---|
| `{"text": "Grüsse"}` | typed text (Playwright `keyboard.type`; iOS: XCUITest `typeText`) |
| `{"key": "Backspace", "mods": ["Alt"]}` | one key press; keys: Backspace, Delete, Enter, Tab, Escape, arrows, Home, End, PageUp, PageDown or one character; mods: Shift, Alt, Control, Meta, Mod |
| `{"shortcut": "Mod+B"}` | modifiers + key as one string |
| `{"select": {"anchor": [b, o], "focus": [b, o]}}` | selection by block index and UTF-16 offset (clamped to the document; never inside a surrogate pair) |
| `{"select": {"anchorPath": [0, 0], "anchorOffset": 6, "focusPath": [...], "focusOffset": n}}` | selection by DOM path (child indices from the editing root) |
| `{"compose": ["k", "か", "かな"], "commit": "仮名"}` | IME composition updates, then the commit (empty commit = cancel) — CDP targets only |
| `{"paste": {"text": "a\nb", "html": "<b>a</b>"}}` | clipboard content, then Mod+V |
| `{"undo": true}`, `{"redo": true}` | Mod+Z, Shift+Mod+Z |
| `{"click": {"at": [b, o]}}`, `{"click": {"x": 12, "y": 12}}`, `{"tap": ...}` | pointer activation at a caret position or at coordinates relative to the editing root; `tap` uses touch where the target has it |
| `{"drag": {"from": {"at": [b, o]}, "to": {"at": [b, o]}}}` | mouse drag (drag and drop of a selection) |
| `{"wait": 700}` | pause in ms (e.g. ProseMirror's 500 ms undo grouping) |

Fuzz sequences (`test/rig/fuzzgen.mjs`) use the same step objects. The generator is a pure function of the seed (mulberry32, weighted alphabet of PHASE-1 §5, 50–200 steps); the rig evaluates its source inside every browser and compares the SHA-256 of each action list with Node's, and the reports carry the digest over all seeds, so "same seed → same action list on every target" is checked, not assumed. Every sequence starts from `FUZZ_INIT` (`test/rig/run.mjs`), which contains no "ü".

The shrinker (`test/rig/shrink.mjs`) is delta debugging (ddmin) over the steps of the failing prefix, then over the graphemes of each remaining text step. The planted-bug suite saves the result as `scenarios/regressions/planted-ue-<target>.json`; the corpus runs every planted regression against the stub and the oracle on every target (planted control), so a blind rig turns a gate red.

## Invariants I1–I8 (`test/rig/invariants.mjs`)

Pure functions over recorder snapshots (`bench/oracle/recorder.js`). Each returns `{id, status, detail}` with status `pass`, `fail` or `inactive` — inactive while the document does not expose what the check needs; inactive is never counted as pass. They activate by themselves as `window.webdoc` grows (E1-005 ff.).

| ID | Function | Input | Active when | Check |
|---|---|---|---|---|
| I1 | `I1(snap)` | projection blocks (type, text, marks) read from the editing root; `webdoc.state()` | `state()` exists and no composition is active | projection = state, block by block |
| I2 | `I2(snap)`, `I2acrossTargets(entries)` | ghost element (`[inert]`), its markup | `state()` and a ghost exist | ghost blocks = state; across targets the same state hash has byte-identical ghost markup |
| I3 | `I3(snap)` | `webdoc.ledger()`, `webdoc.hash()`, `webdoc.state()` | `ledger()` and `hash()` exist | the ledger verifies (src/ledger.js) and its replay hashes to `hash()`; `state()` hashes to `hash()` |
| I4 | `I4(snap, {ref, plain})` | ledger replay; the native snapshot of the same step | a ledger, or a native reference for a `plain` scenario | text = replayed model; text and caret = native oracle |
| I5 | `I5(snap)` | `snap.guard` (the renderer's account of foreign mutations) | the document reports guard information (E1-007 decides the source) | 0 foreign mutations; the composing text node is allowlisted |
| I6 | `I6(snap)` | `webdoc.selection()` (`{a, f}` or `{anchor, focus}`, index or block id), DOM selection | `selection()` and `state()` exist | model selection = DOM selection; offsets on grapheme boundaries |
| I7 | `I7(snap, {reloadHash})` | `webdoc.toHTML()` | `toHTML()` exists | one ledger script, one engine script, CSP hashes match script and style; hash after reloading the serialized file = `hash()` |
| I8 | `I8(snap)` | `webdoc.ledger()` | `ledger()` exists | recomputed heads = stored heads |

`checkAll(snap, ctx)` runs all eight. Unit tests on synthetic snapshots: `test/unit/rig-invariants.test.js` (each check passes on a consistent snapshot, fails on a planted inconsistency, and is inactive without its API).
