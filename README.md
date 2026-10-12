# Ether

An open document format in which a single, self-contained `.html` file is at once the document, the viewer and the editor — meant to replace PDF, DOCX, PPTX, EPUB and infinite-canvas files.

**Status:** Phase 1 (the core input loop) is in progress. Nothing is usable yet.

## Principles

- **Zero runtime dependencies.** The document contains only code written in this repository. It works offline; no network access, enforced by a Content-Security-Policy.
- **Append-only ledger.** Document state is never stored as markup. Every action is appended as a hash-chained event to a ledger inside the file; opening the file replays it.
- **Input is intercepted, not trusted.** Every `beforeinput` is prevented and routed through the ledger; the browser never mutates the document on its own.
- **Ghost DOM.** A semantic tree derived from the ledger is the source for every visual projection and the anchor for assistive technology.
- **Polymorphic rendering.** Fluid (responsive, DOCX/EPUB-like) first; Solid (fixed layout, PDF/PPTX-like) and Ether (infinite canvas) later.

## Toolchain

Plain JavaScript with JSDoc types, Node 20 or newer, no bundler and no runtime dependencies. The tools in `tools/` use Node built-ins only; the only dev dependencies are `typescript`, `@playwright/test` and `axe-core`, pinned exactly. Background: [`docs/adr/0001-toolchain.md`](docs/adr/0001-toolchain.md) (piece E1-001).

```sh
npm ci                                   # install the pinned dev dependencies
npx playwright install --with-deps chromium firefox webkit   # browsers for the e2e tests
npm run hooks                            # once per clone: use tools/hooks (commit-msg)
```

| Command | What it does |
|---|---|
| `npm run build` | `tools/build.mjs`: `src/` → `dist/blank.html` (minified) and `dist/blank.dev.html` (unminified twin), each with its own CSP hashes. `--out <dir>` builds elsewhere. Two builds are byte-identical. |
| `npm run typecheck` | `tsc -p jsconfig.json` (checkJs, strict, noEmit) over `src/` — gate G1. |
| `npm run lint` | `tools/lint.mjs`: no HTML-string sinks, `eval`, `new Function`, string timers, TODO/FIXME or http(s) URLs in `src/` — gate G2. |
| `npm run test` | `node --test test/unit/` — gate G3 (format core: SHA-256 NIST vectors, canonical JSON, model, ledger property tests, fixtures, SPEC examples, core metrics; tooling: minifier, build, lint, size, gates, hook, server). `npm test` is the same. |
| `npm run test:e2e` | Playwright on Chromium, Firefox and WebKit against `dist/` (build first). Starts and stops the static server itself. |
| `npm run size -- --piece <ID>` | `tools/size.mjs`: bytes of `dist/blank.html` against the piece's `ceiling_kb` (1 KB = 1024 B); appends to `docs/plan/size-log.md` — gate G8. |
| `npm run fixtures` | `tools/fixtures.mjs`: regenerates the conformance ledgers in `test/fixtures/ledgers/` and their `expected.json` (deterministic); `-- --check` fails if the committed files are stale. |
| `npm run serve` | `tools/serve.mjs`: static server on `http://127.0.0.1:4173` for `/dist/` and `/bench/` (`--port`, `--host`). |
| `npm run rig -- corpus\|fuzz\|planted\|summary [--targets all\|desktop\|mobile\|<list>]` | `tools/rig.mjs`: the measurement rig (piece E1-002). Drives the scenario corpus (`test/scenarios/`), seeded fuzz sequences and the planted-bug self-test against the native contenteditable oracle (B1), the ProseMirror basic example (B2) and our document on all five targets; reports in `test-results/rig/`. Details, scenario DSL and invariants I1–I8: [`test/README.md`](test/README.md). |
| `npm run devices -- up\|down\|status` | `tools/devices.mjs`: creates/boots/shuts down only the iOS simulator "Ether iPhone 17 Pro" and the AVD "ether" (headless); proves every other simulator and AVD unchanged. |
| `npm run gates -- --piece <ID> [--targets all\|desktop\|mobile\|<list>] [--gates G1,..]` | `tools/gates.mjs`: builds, runs the piece's gates and prints the G1–G12 table (green / red / not-checked / n.a.); exit code ≠ 0 when a relevant gate is red or not-checked. Report in `test-results/gates/<ID>.json`. |
| `npm run hooks` | Sets `core.hooksPath` to `tools/hooks`; `commit-msg` rejects `Co-Authored-By:` and `Generated with` lines. |

Targets: `chromium`, `firefox`, `webkit` (desktop, Playwright) and `ios-safari` (Safari on the simulator "Ether iPhone 17 Pro": Web Inspector socket for scripts, XCUITest for taps and typing), `android-chrome` (Chrome on the AVD "ether" over CDP) — drivers in `test/rig/drivers/` (E1-002). `--targets all` runs the targets that the piece's `verify` field names; a target without a driver, or a step its driver cannot perform, is reported as not-checked, never green. G4 (desktop) and G6 (mobile) run the scenario corpus through the rig, G5 and the fuzz part of G6 fuzz our document once it has an editing surface; the gate table is followed by one summary line per rig report.

Mobile prerequisites: Xcode with the iOS 26.5 simulator runtime (the rig builds its XCUITest input runner `test/rig/ios-typer` on first use); the Android SDK with `system-images;android-36;google_apis;arm64-v8a`. `safaridriver` (X-01, X-02) is only needed for `ETHER_IOS_DRIVER=webdriver`, which reproduces the finding that WebDriver key input inserts no text on iOS. Known limit: on the iOS simulator keys with a modifier, forward Delete, shortcuts, undo/redo and paste are unsupported-by-driver while the Simulator's hardware keyboard is disconnected — see [`docs/adr/0004-measurement-rig.md`](docs/adr/0004-measurement-rig.md).

## Layout

```
src/            engine modules (JSDoc), style.css, template.html
                format core (E1-003): sha256.js, canon.js, model.js, ledger.js
tools/          build, minify, lint, size, gates, serve, rig, devices (+ hooks/commit-msg)
test/unit/      node --test
test/e2e/       Playwright (desktop targets)
test/rig/       measurement rig (E1-002): drivers, runner, invariants I1-I8, fuzz, shrinker, reports
test/scenarios/ scenario corpus (DSL in test/README.md); regressions/: shrunk failing seeds
test/fixtures/  inputs for the tool tests; ledgers/: format v0 conformance ledgers
test/helpers/   shared generators for the property tests
bench/          oracle (native.html + recorder.js), stubs (planted bug), design prototype
docs/           SPEC.md, adr/, plan/
dist/           build output (gitignored; release artifacts are attached to tags)
```

## Continuous integration

`.github/workflows/ci.yml` runs on GitHub Actions (`ubuntu-latest`, Node 20) on every push to `main` and `feature/**` and on pull requests:

```sh
npm ci
npx playwright install --with-deps chromium firefox webkit
npm run build
node tools/gates.mjs --piece "$PIECE" --targets desktop --gates G1,G2,G3,G4,G5,G7,G8,G9,G11
node tools/hooks/commit-msg --range <base>..<head>     # pull requests only
```

`PIECE` in the workflow names the piece whose gates and size ceiling apply. The mobile gates (G6, and the mobile part of every other gate) need the iOS simulator "Ether iPhone 17 Pro" and the Android emulator "ether" and run locally only: `node tools/gates.mjs --piece <ID> --targets all`.

CI duration: not yet measured — the first run happens when E1-001 is committed and pushed; the duration of that run is recorded here.

## Documentation

- Phase 1 plan: [`docs/plan/PHASE-1.md`](docs/plan/PHASE-1.md), pieces in [`docs/plan/pieces/`](docs/plan/pieces/)
- Format specification: [`docs/SPEC.md`](docs/SPEC.md) — ledger format v0 (`webdoc/0`), ops, canonical JSON, hashing, verification, replay (piece E1-003); decisions in [`docs/adr/0003-ledger-format-v0.md`](docs/adr/0003-ledger-format-v0.md)
- Fluid design proposal: [`docs/adr/0002-fluid-design.md`](docs/adr/0002-fluid-design.md) (piece E1-004, status proposed until Joel approves it, X-03); prototype in `bench/design/`
- Measurement rig: [`test/README.md`](test/README.md) — targets and drivers, scenario DSL, invariants I1–I8 (piece E1-002); decisions in [`docs/adr/0004-measurement-rig.md`](docs/adr/0004-measurement-rig.md)
- Architecture decisions: [`docs/adr/`](docs/adr/)
- Size log: [`docs/plan/size-log.md`](docs/plan/size-log.md)

## License

[MIT](LICENSE)
