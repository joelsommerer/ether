# Ether

An open document format in which a single, self-contained `.html` file is at once the document, the viewer and the editor — meant to replace PDF, DOCX, PPTX, EPUB and infinite-canvas files.

**Status:** Phase 1 (the core input loop) is in progress. Nothing is usable yet.

## Principles

- **Zero runtime dependencies.** The document contains only code written in this repository. It works offline; no network access, enforced by a Content-Security-Policy.
- **Append-only ledger.** Document state is never stored as markup. Every action is appended as a hash-chained event to a ledger inside the file; opening the file replays it.
- **Input is intercepted, not trusted.** Every `beforeinput` is prevented and routed through the ledger; the browser never mutates the document on its own.
- **Ghost DOM.** A semantic tree derived from the ledger is the source for every visual projection and the anchor for assistive technology.
- **Polymorphic rendering.** Fluid (responsive, DOCX/EPUB-like) first; Solid (fixed layout, PDF/PPTX-like) and Ether (infinite canvas) later.

## Documentation

- Phase 1 plan: [`docs/plan/PHASE-1.md`](docs/plan/PHASE-1.md), pieces in [`docs/plan/pieces/`](docs/plan/pieces/)
- Format specification: `docs/SPEC.md` (written in piece E1-003)

## License

[MIT](LICENSE)
