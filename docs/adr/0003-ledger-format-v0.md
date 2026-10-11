# ADR 0003 — Ledger format v0 and reference model

Date: 2026-10-11 · Status: accepted · Piece: E1-003 · Plan decisions: D5, D6, D14, D15 · Specification: [`../SPEC.md`](../SPEC.md)

(ADR 0002 is reserved for the Fluid design decision, X-03.)

## Context

E1-003 freezes the format sketched in PHASE-1.md §4 and builds a pure, DOM-free reference model in Node: SHA-256, canonical JSON, the state and its seven ops, the ledger reader and writer. Every later piece builds on it; an independent reader must be able to reproduce the state hashes from the specification alone. Budgets: core ≤ 7 KB minified, SHA-256 ≥ 50 MB/s, replay of 20 000 events ≤ 100 ms.

## Decisions

- **Marks as one digit per UTF-16 code unit** (`marks: "0011"`, bit 1 bold, bit 2 italic, trailing zeros trimmed) instead of mark ranges. Every op on marks becomes the same slicing as on the text, the canonical form is trivial (no range normalization that two implementations could do differently) and the code is about 700 B smaller. Cost: a formatted block stores a second string as long as its formatted prefix. Marks with attributes (links, Phase 2+) need their own structure and a new format version anyway.
- **Inserted text carries exactly `ins.m`.** Marks never extend implicitly into inserted text; the editor decides (stored marks, E1-011) and writes them explicitly. This keeps `ins`/`del` exact inverses.
- **`blk` with `after: null` only in an empty document.** Enter at the start of the first block is a `split`, so a block at the very top is never needed after the genesis, and every op except the genesis `blk` has an exact inverse. A document never returns to zero blocks.
- **Event ids hash the expanded event; implicit fields come from the previous line in file order.** Lean and explicit storage give the same ids. The genesis carries the doc id implicitly (`d`), so the header's doc id is covered by the chain.
- **Replay order `(c, a, id)`**, not file order. Clocks must exceed their parents' clocks, so the order is topological and identical for every reader and every file order; for a single chain it is the file order. Concurrent branches are replayed without offset transformation in v0; an op that does not fit makes the document read-only (merge semantics: Phase 6).
- **State hash over `{blocks, doc}` only.** `heads` and `clock` stay in the state as bookkeeping but are not hashed, so undoing all edits returns the load hash (E1-010).
- **Strict canonical lines.** A line must be byte-identical to the canonical JSON of its parsed value; together with the hash chain every single-character change of a ledger is detected (tamper test: 200 random flips on each of five fixtures).
- **Error codes are plain strings** thrown by `fail()` and returned by `validate()`/`verifyLedger()`; `replay()` and `parseLedger()` never throw.
- **SHA-256** derives its constants from prime roots at load (each scaled root is more than 1e-4 from an integer, so engine rounding cannot change them) and keeps the eight working variables in plain locals (destructuring the `Int32Array` cost two thirds of the speed): about 200 MB/s in Node 20.
- **Mark trimming** uses `search(/[^0]0*$/)`: the obvious `/0+$/` backtracks quadratically on long mark strings and made replay ten times slower.
- **Compact source.** The minifier never renames, so the core modules use short local names (documented at the top of each function) to stay within 7 KB.

## Consequences

- E1-005 embeds the ledger text verbatim (canonical JSON never contains `</script` or `<!--`) and uses `parseLedger`, `replay`, `appendEvent`, `serializeLedger`.
- E1-010 builds undo from `inverse()`; the genesis event cannot be undone.
- E1-011 must write stored marks explicitly into `ins.m`.
- The 10k-word fixture is 716 269 B as JSONL (PHASE-1.md R7 estimated about 400 KB); compression (E1-015) has to reach ≤ 150 KB from there.
- Phase 6 (merge) can add operational transformation without changing ids, storage or the DAG checks.

## Alternatives considered

- Mark ranges `{b: [[from, to], …]}` normalized after every op: implemented first; correct but about 700 B larger and with more room for disagreement between implementations.
- Replaying in file order: simpler for a chain, but two files with the same events in different topological orders would replay differently.
- Hashing the stored (lean) line: makes ids depend on the storage form and the previous line.
- A `rm` op for removing blocks: not needed once the genesis is the only top-level `blk`; fewer ops keep the validator and SPEC smaller.
