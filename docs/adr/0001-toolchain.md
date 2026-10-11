# ADR 0001 — Toolchain: plain JavaScript, in-house build, hash-locked CSP

Date: 2026-10-11 · Status: accepted · Piece: E1-001 · Plan decisions: D1, D13, D16

## Context

The product is one `.html` file that must contain only code written in this repository, work offline and stay small (≤ 32 KB blank at the end of Phase 1). Every later piece is built and judged on the same toolchain, locally and in CI.

## Decision

- **Source:** plain JavaScript ES modules in `src/` with JSDoc types, checked by `tsc -p jsconfig.json` (`checkJs`, `strict`, `noEmit`, target ES2022, lib DOM + ES2023). TypeScript is a dev dependency only.
- **Build (`tools/build.mjs`):** reads the modules in the fixed order of `MODULES`, strips module syntax and concatenates them into one strict IIFE. Supported module syntax is deliberately narrow so stripping is a line operation: `import { a, b } from './x.js';` on one line, importing only from earlier modules, and `export` directly in front of a `function`, `const`, `let` or `class` declaration. Anything else, import renaming, unknown imports and top-level name clashes between modules fail the build. The bundles are compiled with `node:vm` as a syntax check.
- **Minifier (`tools/minify.mjs`):** a tokenizer (strings, template literals with nested `${}`, regex vs division, comments, numbers, punctuators). It removes comments and whitespace and never renames. A line break is kept wherever the previous token can end a statement and the next can start one, so automatic semicolon insertion is unchanged. Inside strings, templates and regex literals `</script` becomes `<\/script` and `<!--` becomes `<\!--`. Known limits: `/` after `}` is a regex unless the brace closed an object literal, and after `)` only when the parenthesis belonged to `if`/`while`/`for`/`with`; `String.raw` over a template containing `</script` sees the escaped text; HTML-like comments are rejected. CSS gets a conservative comment/whitespace minifier.
- **CSP:** the build computes SHA-256 (base64, `node:crypto`) of the exact inline script and style and writes `default-src 'none'; script-src 'sha256-…'; style-src 'sha256-…'; img-src data: blob:` into a meta element placed before both. `dist/blank.dev.html` is the unminified twin with its own hashes. A `data:` favicon stops browsers from requesting `/favicon.ico`.
- **Reproducibility:** the output depends only on the sources (no timestamps, fixed module order, LF line endings); two builds are byte-identical.
- **Gates (`tools/gates.mjs`):** one runner for G1–G12 with the statuses green / red / not-checked / n.a. Relevant gates come from the piece JSON; a gate without implementation or a target without driver is not-checked, which fails the run like red.
- **Sizes:** 1 KB = 1024 B. `tools/size.mjs` compares against the piece's `ceiling_kb` and logs to `docs/plan/size-log.md`.
- **Commits:** Conventional Commits in English; `tools/hooks/commit-msg` (installed with `npm run hooks`) rejects `Co-Authored-By:` and `Generated with`; CI applies the same check to pull-request commits.
- **CI:** GitHub Actions on `ubuntu-latest` with Node 20 runs `npm ci`, the Playwright browser install, the build and gates G1–G5, G7–G9, G11 on the desktop targets. Mobile gates need the local simulator and emulator and run locally only. Actions are pinned by commit SHA.
- **Dev dependencies (exact):** `typescript` 7.0.2, `@playwright/test` 1.64.0, `axe-core` 4.14.0.

## Consequences

- No third-party code can enter `dist/`, and there is no bundler or minifier package to audit or update.
- Identifiers are never shortened, so size is bought with lean source; if a ceiling cannot be met, renaming in the minifier is a separate decision (PHASE-1.md section 9).
- Module authors follow the narrow import/export forms above; the build explains violations.
- Any change to the inline script or style changes the CSP hashes; the browser tests check that a one-byte change is blocked.

## Alternatives considered

- esbuild / terser: fast and proven, but third-party code in the build path conflicts with D1.
- TypeScript source compiled by `tsc`: adds an emit step and makes the shipped code differ from the reviewed code; JSDoc keeps the source runnable as is.
- CSP via `'unsafe-inline'` or nonces: `'unsafe-inline'` allows injected scripts; nonces need a server. Hashes work on `file://`.
