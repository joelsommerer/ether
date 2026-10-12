# bench

Inputs for the measurement rig (piece E1-002). Served by `tools/serve.mjs` under `/bench/`.

- `oracle/` — `native.html` (plain contenteditable, bar B1) and `recorder.js`, the rig's in-page recorder (also injected into the ProseMirror example and our document)
- `fixtures/` — public-domain text fixtures (Strunk, Kafka, stress, 10k words)
- `stubs/` — deliberately broken documents that the rig must catch: `broken.html` drops every "ü" of the caret's text node on Backspace (see `test/README.md`)
- `design/` — the isolated Fluid design prototype (`fluid-prototype.html`, piece E1-004) and `shoot.mjs`, which renders its screenshots and measurements outside the repo (`../bars/ours/E1-004/`)
