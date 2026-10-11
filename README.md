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
| `npm run test` | `node --test test/unit/` — gate G3 (minifier, build, lint, size, gates, hook, server). `npm test` is the same. |
| `npm run test:e2e` | Playwright on Chromium, Firefox and WebKit against `dist/` (build first). Starts and stops the static server itself. |
| `npm run size -- --piece <ID>` | `tools/size.mjs`: bytes of `dist/blank.html` against the piece's `ceiling_kb` (1 KB = 1024 B); appends to `docs/plan/size-log.md` — gate G8. |
| `npm run serve` | `tools/serve.mjs`: static server on `http://127.0.0.1:4173` for `/dist/` and `/bench/` (`--port`, `--host`). |
| `npm run gates -- --piece <ID> [--targets all\|desktop\|mobile\|<list>] [--gates G1,..]` | `tools/gates.mjs`: builds, runs the piece's gates and prints the G1–G12 table (green / red / not-checked / n.a.); exit code ≠ 0 when a relevant gate is red or not-checked. Report in `test-results/gates/<ID>.json`. |
| `npm run hooks` | Sets `core.hooksPath` to `tools/hooks`; `commit-msg` rejects `Co-Authored-By:` and `Generated with` lines. |

Targets: `chromium`, `firefox`, `webkit` (desktop, Playwright) and `ios-safari`, `android-chrome` (mobile, from E1-002). `--targets all` runs the targets that the piece's `verify` field names; a target without a driver is reported as not-checked, never green.

## Layout

```
src/            engine modules (JSDoc), style.css, template.html
tools/          build, minify, lint, size, gates, serve (+ hooks/commit-msg)
test/unit/      node --test
test/e2e/       Playwright (desktop targets)
test/fixtures/  inputs for the tool tests
bench/          oracles, fixtures and stubs for the measurement rig (E1-002)
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
- Format specification: [`docs/SPEC.md`](docs/SPEC.md) (stub; written in piece E1-003)
- Architecture decisions: [`docs/adr/`](docs/adr/)
- Size log: [`docs/plan/size-log.md`](docs/plan/size-log.md)

## License

[MIT](LICENSE)
