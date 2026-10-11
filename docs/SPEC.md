# Ether document format — specification

Status: stub. The format (ledger v0, ops, public `window.webdoc` API) is specified in piece E1-003; see [`plan/PHASE-1.md`](plan/PHASE-1.md) section 4 for the current sketch.

## What exists today (E1-001)

- `dist/blank.html`: a valid, self-contained HTML shell. It contains one inline `<style>` and one inline `<script>` and nothing else is loaded.
- Content-Security-Policy (meta element, before any style or script):
  `default-src 'none'; script-src 'sha256-…'; style-src 'sha256-…'; img-src data: blob:`
  The hashes are SHA-256 (base64) over the exact text content of the inline script and style. Any change to either without updating the hash makes the browser refuse it.
- `window.webdoc` is a read-only, frozen object; so far it only has `version` (string).
