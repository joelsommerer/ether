# Ether document format — specification v0

Status: **v0, draft for Phase 1** (format identifier `webdoc/0`). Written in piece E1-003; it freezes the ledger sketched in [`plan/PHASE-1.md`](plan/PHASE-1.md) §4. Until the Phase 1 release (SPEC v0.1, E1-017) v0 may still change; such changes are made here without a new format identifier.

This document is complete enough to implement a reader without looking at the reference implementation. "MUST", "SHOULD" and "MAY" are used as in RFC 2119. The reference implementation is `src/sha256.js`, `src/canon.js`, `src/model.js` and `src/ledger.js`; the conformance fixtures are in `test/fixtures/ledgers/` (§14).

Contents: 1 Model · 2 Conventions · 3 Ledger text · 4 Canonical JSON · 5 Hashing · 6 Events · 7 State · 8 Ops · 9 Verification · 10 Replay and state hash · 11 Error codes and read-only · 12 Ids · 13 Versioning and forward compatibility · 14 Conformance fixtures · 15 Worked example · 16 Document shell and API

## 1. Model

A document is an append-only **ledger** of **events**. Each event holds one user action as a list of primitive **ops** (§8). The current state of the document is, by definition, the replay of the ledger from the empty state (§10); state is never stored as markup. Events form a hash-chained DAG: every event names its parents by id, and an event id is the SHA-256 of the event's canonical JSON (§4–§6). The ledger records the ids of the DAG's tips (the **heads**) in its header, so changing, removing or reordering any event is detected (§9).

Phase 1 writers only ever append to a single chain (one parent per event). Readers MUST accept events with several parents (§6, §10), so that a later merge (Phase 6) needs no format change.

## 2. Conventions

- **Strings** are sequences of UTF-16 code units, as in JavaScript. All **offsets and lengths** in ops (`o`, `n`, the length of `s`) count UTF-16 code units. A code point above U+FFFF occupies two units (a surrogate pair). No op may place an offset between the two units of a pair (§8.1), so the text of a valid document never contains a lone surrogate.
- **base62** characters are `0-9`, `A-Z`, `a-z`.
- **hex** means lowercase `0-9a-f`.
- **Sorting** of strings is by UTF-16 code units, ascending (JavaScript's default `Array.prototype.sort`). All strings that are sorted by this specification (object keys, ids, actors) are ASCII, where this equals byte order.

## 3. Ledger text

The ledger text is a sequence of lines. Every line, including the last one, is terminated by one LF (U+000A). There are no other line terminators, no blank lines and no whitespace outside JSON strings.

- **Empty ledger:** the empty string. It describes the empty document (no events, no doc id). A blank document ships an empty ledger; the first edit creates the header and the first event with a fresh doc id (§12), so two documents made from the same blank are unrelated, not forks.
- **Line 0, the header:** the canonical JSON (§4) of an object with exactly these four fields:

  | Field | Value |
  |---|---|
  | `doc` | document id: 22 base62 characters (§12) |
  | `enc` | `"jsonl"` (event lines are canonical JSON; a compressed encoding is added in E1-015) |
  | `fmt` | `"webdoc/0"` |
  | `heads` | the ids of all events that are no other event's parent, sorted ascending, no duplicates |

- **Lines 1…n:** one event each, in its stored (lean) form (§6.2): the canonical JSON of an object. Every parent of an event MUST appear on an earlier line (file order is a topological order; it is not the replay order, §10).

Example (three events, see §15 for all hashes):

```
{"doc":"4fGt0Qx9LmZ2pR7sVb1KdE","enc":"jsonl","fmt":"webdoc/0","heads":["83862acbee686d30dfb1ab507e9e55152e1a6dc4b5b53973f1d16dc2a8278bea"]}
{"a":"k7Qx2m","t":1760198400,"x":[{"after":null,"b":"k7Qx2m:1","op":"blk","type":"h1"},{"b":"k7Qx2m:1","o":0,"op":"ins","s":"Hello "}]}
{"x":[{"b":"k7Qx2m:1","m":"11111","o":6,"op":"ins","s":"wörld"}]}
{"t":1760198403,"x":[{"b":"k7Qx2m:1","nb":"k7Qx2m:2","o":11,"op":"split","type":"p"},{"b":"k7Qx2m:2","o":0,"op":"ins","s":"\u003c3 😀"}]}
```

## 4. Canonical JSON

Every stored line and every hashed value is canonical JSON: the single serialization defined here. Only these values exist:

| Value | Serialization |
|---|---|
| `null`, `true`, `false` | as is |
| integer | decimal, `-` for negatives, no leading zeros, no fraction or exponent: `-?(0\|[1-9][0-9]*)`; the value MUST be a safe integer, \|v\| ≤ 2^53 − 1; negative zero is `0` |
| string | see below |
| array | `[` elements joined by `,` `]` |
| object | `{` members `"key":value` joined by `,` `}`, keys sorted ascending by UTF-16 code units, no duplicate keys |

There is no whitespace anywhere outside strings. Non-integer numbers, NaN, infinities and anything else are not representable: a writer MUST reject them.

**Strings** are written between `"` with these escapes and no others:

| Character | Written as |
|---|---|
| `"` | `\"` |
| `\` | `\\` |
| U+0008, U+0009, U+000A, U+000C, U+000D | `\b`, `\t`, `\n`, `\f`, `\r` |
| other U+0000–U+001F | `\u00XX`, lowercase hex (e.g. `\u001f`) |
| `<` | `\u003c` |
| U+2028, U+2029 | `\u2028`, `\u2029` |
| everything else, including `/`, U+007F and characters above U+FFFF | the character itself (UTF-8 in the encoded text) |

A string containing a lone surrogate (a high surrogate not followed by a low one, or a low surrogate not preceded by a high one) is not representable. This is exactly `JSON.stringify` followed by the replacement of `<`, U+2028 and U+2029. Because `<` is always escaped, canonical JSON never contains `</script` or `<!--`, so a ledger can be embedded in an HTML `<script>` element verbatim; U+2028/U+2029 are escaped so the text is also valid inside JavaScript source.

A reader MUST check every line by re-serialization: a line is valid only if it is byte-identical to the canonical JSON of its own parsed value. This rejects whitespace, other escape spellings (`\u003C`, `\/`), unsorted or duplicate keys and non-canonical numbers (`1.0`, `1e3`, `01`).

Example: `{"b":1,"a":["<\u2028",true,null]}` is `{"a":["\u003c\u2028",true,null],"b":1}` in canonical JSON (the first form shows the characters escaped only for readability).

## 5. Hashing

`hash(v)` is SHA-256 (FIPS 180-4) over the UTF-8 bytes of the canonical JSON of `v`, written as 64 lowercase hex digits. Event ids (§6.3) and the state hash (§10.3) use it. Example: the canonical JSON of the empty state is `{"blocks":[],"doc":null}`, its hash `4dbe56456145f9ed824ba19c45c6b9c07c86ccd966d0ba6a118170c376dc96dc`.

## 6. Events

### 6.1 Logical event

| Field | Type | Meaning |
|---|---|---|
| `id` | 64 hex | `hash` of the event without `id` (§6.3); never stored |
| `p` | array of ids, sorted ascending, no duplicates | parents; `[]` for a root (the genesis); two or more for a merge |
| `a` | 6–8 base62 characters | actor: the session that wrote the event (§12) |
| `c` | integer ≥ 1 | Lamport clock: greater than the `c` of every parent |
| `t` | integer ≥ 0 | creation time, Unix seconds (informative; never used by replay) |
| `x` | non-empty array of op objects | the ops, applied in order (§8) |
| `d` | doc id | present exactly when `p` is `[]`: the header's `doc`, so the doc id is covered by the chain |
| `u` | 64 hex (optional) | id of the event this event undoes (history, E1-010). v0 readers check only its format |

No other fields exist in v0 (§13). The **expanded** event is the object with `p`, `a`, `c`, `t`, `x`, `d` when `p` is `[]`, and `u` when present.

### 6.2 Stored (lean) form and implicit fields

A stored line MAY leave out `p`, `a`, `c` and `t`, and MUST leave out `id` and `d`; the reader restores them from the **previous line in the file** (line k−1's expanded event; for line 1 there is no previous event):

| Field | Implicit value on line k | On line 1 |
|---|---|---|
| `p` | `[id of line k−1]` | `[]` |
| `a` | `a` of line k−1 | none: MUST be stored |
| `c` | `c` of line k−1, plus 1 | `1` |
| `t` | `t` of line k−1 | none: MUST be stored |
| `d` | the header `doc` if the expanded `p` is `[]`; otherwise absent | the header `doc` |

A field that is stored is taken as stored, even if it equals its implicit value (so a fully explicit ledger is valid and has the same ids as the lean one). A stored `d` is allowed only when the expanded `p` is `[]`, and MUST equal the header `doc`. A stored `id` is an unknown field.

Writers SHOULD write the lean form: they leave out every field that equals its implicit value and always leave out `id` and `d`. A merge event or a second root stores `p` explicitly (`"p":[]` for a root that is not on line 1).

### 6.3 Event id

`id = hash(expanded event without id)`. The id is therefore independent of how the line was stored (lean or explicit). Example: line 2 of §3 expands to

```
{"a":"k7Qx2m","c":2,"p":["6b94de1a1a85bc7e1188e0ed1ab24404637d4acb75fe6f374632f24378d95717"],"t":1760198400,"x":[{"b":"k7Qx2m:1","m":"11111","o":6,"op":"ins","s":"wörld"}]}
```

and its id is `7d312510538d8774030d354d1793a6df6c96697847d65f04641582f34a49a118`.

### 6.4 Event granularity (writers)

One event is one user action; undo works per event. Typing is coalesced per word (PHASE-1.md D14): a word with its following whitespace is one `ins` event. A writer appends an event with `p` = the current heads, `c` = 1 + the largest `c` in the ledger, `t` = now, its own actor, and validates the ops against the current state before appending.

## 7. State

```
State = { doc: doc id or null, blocks: [Block, …], heads: [id, …], clock: integer }
Block = { id: block id, type: "p" | "h1" | "h2" | "h3" | "li", text: string, marks: string }
```

- `blocks` is the document in reading order. `p` is a paragraph, `h1`–`h3` headings, `li` a bullet-list item (consecutive `li` blocks form one list).
- `marks` holds one **mark digit** per UTF-16 code unit of `text`: the bit set of the marks on that unit, bit 1 = `b` (bold), bit 2 = `i` (italic), so the digits are `0`–`3`. Trailing `0` digits are removed, so `marks` is never longer than `text`, does not end in `0`, and is `""` for an unformatted block. Positions past the end of `marks` have the digit `0`. Both units of a surrogate pair always carry the same digit.
- `heads` and `clock` are bookkeeping of the replay (§10.2); `doc` is set by the first root event.
- The empty state is `{doc: null, blocks: [], heads: [], clock: 0}`.

In the following, `T` is a block's text, `M` its mark digits padded with `0` to the length of `T`, and `trim(x)` removes trailing `0` digits.

## 8. Ops

Every op is an object with a field `op` (its name) and the fields listed for that name; all fields are required except `m` of `ins`.

| `op` | Fields | Effect |
|---|---|---|
| `blk` | `b`, `after`, `type` | new empty block |
| `split` | `b`, `o`, `nb`, `type` | split a block in two (Enter) |
| `join` | `b` | append a block to its predecessor and remove it |
| `ins` | `b`, `o`, `s`, `m`? | insert text |
| `del` | `b`, `o`, `n` | delete text |
| `fmt` | `b`, `o`, `n`, `m`, `on` | set or clear one mark on a range |
| `type` | `b`, `type` | change the block type |

Field types: `o` and `n` are integers; `on` is a boolean; `after` is a block id or `null`; `b`, `nb`, `s`, `type` and `m` are strings. `b` always names the block the op works on (for `blk`: the new block).

### 8.1 Validation

An op is applied only if it is valid for the current state. The checks run in this order; the first failing one gives the error code:

1. The op is not an object (or is an array) → `shape`.
2. `op` is not one of the seven names → `unknown`. A field other than `op` that is not listed for that name → `unknown`.
3. A listed field is missing (except `ins.m`), or has the wrong type → `shape`.
4. `type` is not one of `p`, `h1`, `h2`, `h3`, `li`, or `fmt.m` is not `b` or `i` → `unknown`.
5. The new block id (`b` of `blk`, `nb` of `split`) does not match `<actor>:<n>` (§12) → `id`; it equals the id of an existing block → `exists`.
6. `blk`: `after` is `null` but the document has blocks → `after`; `after` is not `null` and names no block → `block`. Every other op: `b` names no block → `block`.
7. `join` of the first block → `first`.
8. Ops with `o` (with `n` taken as 0 when the op has none): `o < 0`, `o + n` greater than the length of `T`, `n < 1`, or an empty `s` → `range`.
9. `o` or `o + n` lies between the two units of a surrogate pair in `T`, or `s` contains a lone surrogate → `surrogate`.
10. `ins.m` is present and does not match `^[0-3]*[1-3]$` or is longer than `s` → `marks`; its digits differ on the two units of a surrogate pair in `s` → `surrogate`.

### 8.2 Semantics

| Op | Result |
|---|---|
| `blk` | insert `{id: b, type, text: "", marks: ""}` directly after block `after`, or as the first block when `after` is `null` (only in an empty document: the genesis) |
| `split` | block `b` keeps its id and type, `text = T[0, o)`, `marks = trim(M[0, o))`; directly after it a new block `{id: nb, type, text: T[o, end), marks: trim(M[o, end))}` |
| `join` | let P be the block before `b`: `P.text = P.text + T`, `P.marks = trim(padded P.marks + M)`; P keeps its id and type; block `b` is removed |
| `ins` | `text = T[0, o) + s + T[o, end)`, `marks = trim(M[0, o) + m' + M[o, end))` where `m'` is `m` (or `""`) padded with `0` to the length of `s`. The inserted text carries exactly the marks `m`: marks next to the insertion point never extend into it |
| `del` | `text = T[0, o) + T[o + n, end)`, `marks = trim(M[0, o) + M[o + n, end))` |
| `fmt` | for each unit in `[o, o + n)`: digit `d` becomes `d OR bit` when `on` is true, `d AND NOT bit` when false; `bit` is 1 for `b`, 2 for `i`; then `trim` |
| `type` | the block's `type` becomes `type` |

Examples on the block `{id: "k7Qx2m:1", type: "p", text: "Second", marks: ""}`:

| Op | text | marks |
|---|---|---|
| `{"b":"k7Qx2m:1","m":"b","n":3,"o":1,"on":true,"op":"fmt"}` | `Second` | `0111` |
| then `{"b":"k7Qx2m:1","m":"i","n":4,"o":2,"on":true,"op":"fmt"}` | `Second` | `013322` |
| then `{"b":"k7Qx2m:1","o":2,"op":"ins","s":"XY"}` | `SeXYcond` | `01003322` |
| then `{"b":"k7Qx2m:1","m":"2","o":8,"op":"ins","s":"!?"}` | `SeXYcond!?` | `010033222` |
| then `{"b":"k7Qx2m:1","m":"i","n":10,"o":0,"on":false,"op":"fmt"}` | `SeXYcond!?` | `010011` |
| then `{"b":"k7Qx2m:1","nb":"k7Qx2m:5","o":4,"op":"split","type":"p"}` | `SeXY` and `cond!?` | `01` and `11` |
| then `{"b":"k7Qx2m:5","op":"join"}` | `SeXYcond!?` | `010011` |

Text with a surrogate pair, `"Hi 😀!"` (the emoji occupies offsets 3 and 4): `ins` at `o: 4`, `del` with `o: 3, n: 1` and `split` at `o: 4` are rejected with `surrogate`; `del` with `o: 3, n: 2` removes the emoji.

### 8.3 Inverses (informative)

Undo (E1-010) appends the inverse ops as a new event. For an op valid in state S:

| Op | Inverse, applied to the state after the op |
|---|---|
| `blk` (with `after` ≠ null) | `join b` |
| `blk` with `after: null` | none: the genesis block is never removed, a document never returns to zero blocks |
| `split` | `join nb` |
| `join` | `split` of the previous block at its old length, `nb` = `b`, `type` = the old type of `b` |
| `ins` | `del` at `o`, `n` = length of `s` |
| `del` | `ins` of the deleted text at `o` with `m` = the deleted mark digits (trimmed; omitted when empty) |
| `fmt` | `fmt … on: false` over the range, then `fmt … on: true` for every maximal run of units that had the mark before |
| `type` | `type` with the old type |

The inverse of an op sequence is the inverses in reverse order.

## 9. Verification

A reader verifies the whole ledger before replaying it. Given the ledger text:

1. The empty string is the empty ledger: valid, no events.
2. Split at LF. The text MUST end with LF (`eol`).
3. Line 0 MUST be canonical JSON (§4; `parse` if it is no JSON at all, `canon` if it is not canonical), an object whose `fmt` is `"webdoc/0"` (`fmt`, also for a non-object), whose `enc` is `"jsonl"` (`enc`), with exactly the fields `doc`, `enc`, `fmt`, `heads`, a valid doc id and sorted unique hex ids in `heads` (`shape`).
4. For each line k ≥ 1, in file order:
   1. canonical JSON object (`parse`, `canon`, `shape`); every field is one of `a c d p t u x` (`unknown`);
   2. expand the implicit fields (§6.2);
   3. check the field types of §6.1: `p` sorted unique hex ids, `a` 6–8 base62, `c` integer ≥ 1, `t` integer ≥ 0, `x` a non-empty array of objects, `u` 64 hex, `d` only with `p` = `[]` (`shape`; an `x` that is not an array MAY be reported as `parse`); with `p` = `[]`, `d` equals the header `doc` (`doc`);
   4. compute the id (§6.3); an id that already occurred → `dup`;
   5. every parent MUST be the id of an earlier line (`parent`) with a smaller `c` (`clock`).
5. The heads computed from all events (ids that are no event's parent, sorted) MUST equal the header `heads` (`heads`).

Ops are not validated here; that happens during replay (§10). Any change to any event changes its id; with implicit `p` it also changes every later id, and with explicit `p` it breaks a parent reference, so every modification, deletion, insertion or reordering of lines is detected by step 4 or 5.

## 10. Replay and state hash

### 10.1 Order

Events are replayed sorted ascending by `c`, then by `a`, then by `id`. Because every event's `c` is greater than its parents' `c`, this is a topological order of the DAG, and it is the same for every reader and every file order. For a single chain it equals the file order.

### 10.2 Applying an event

Starting from the empty state, each event in replay order is applied atomically:

1. Apply its ops in order (§8). If any op is invalid, the event is not applied, the replay **stops**, and the document is read-only with that op's error code (§11). The state stays as it was before the event.
2. `doc` becomes the event's `d` if it has one; `heads` becomes the old heads without the event's parents, plus the event's id, sorted; `clock` becomes the larger of `clock` and `c`.

v0 replays concurrent branches one after another in this order without transforming their offsets. Branches that edit different blocks merge cleanly (fixture `dag`); an op that does not fit the merged state makes the document read-only. Operational merge semantics are defined in a later version (Phase 6).

### 10.3 State hash

`stateHash = hash({blocks, doc})`: the canonical JSON of an object with the fields `blocks` (the blocks in document order, each with the fields `id`, `marks`, `text`, `type`) and `doc` (`null` for the empty document). `heads` and `clock` are not part of it, so undoing every edit of a session returns the hash of the loaded document. The state hashes of the conformance fixtures are listed in §14.

## 11. Error codes and read-only

| Code | Where | Meaning |
|---|---|---|
| `eol` | §9 | text does not end with LF |
| `parse` | §9 | a line is not JSON |
| `canon` | §9 | a line is not in canonical form, including values canonical JSON cannot represent (a lone surrogate escape, a non-integer number) |
| `fmt` | §9 | header is not a `webdoc/0` header (unknown version) |
| `enc` | §9 | unknown encoding |
| `shape` | §8.1, §9 | missing field, wrong type or malformed value |
| `unknown` | §8.1, §9 | unknown event field, op, op field, block type or mark |
| `doc` | §9 | `d` differs from the header doc id |
| `dup` | §9 | the same event twice |
| `parent` | §9 | a parent is not an earlier event |
| `clock` | §9 | `c` not greater than a parent's `c` |
| `heads` | §9 | recomputed heads differ from the header |
| `id`, `exists`, `after`, `block`, `first`, `range`, `surrogate`, `marks` | §8.1 | invalid op |

A document whose ledger fails verification (§9) MUST be shown read-only with an integrity message; it MUST NOT be repaired silently. `fmt`, `enc` and `unknown` mean the file was written by a newer version: read-only with a message saying so. An op error during replay (§10.2) also makes the document read-only; the state up to the failing event MAY be shown. A reader never throws on any input.

## 12. Ids

- **Actor:** chosen at random per editing session; writers generate 6 base62 characters with `crypto.getRandomValues` (uniform: bytes ≥ 248 are rejected, the rest taken modulo 62). Readers accept 6–8 characters.
- **Document id:** 22 random base62 characters (62^22 > 2^128), generated the same way when the first event of a blank document is written.
- **Block id:** `<actor>:<n>` (regular expression `^[0-9A-Za-z]{6,8}:[1-9][0-9]*$`), where `actor` is the actor of the session that creates the block and `n` counts the blocks created in that session from 1. Since actors are per session, ids are unique across sessions without coordination; a block id is never reused for a different block except by an inverse op restoring the same block (§8.3). Block order is defined by the ops (`after`, `split`), never by the id.

## 13. Versioning and forward compatibility

- The header field `fmt` names the format version: `webdoc/0` for this document. A reader that does not know the version MUST open the document read-only with a message, not try to interpret it.
- Within a version, anything a reader does not know — an event field, an op, an op field, a block type, a mark — is reported as `unknown` (§11): the document opens read-only up to that point. Ids stay verifiable because they hash the whole event, known or not.
- A writer MUST NOT append to a ledger it cannot fully verify and replay.
- `enc` names the encoding of the event lines; `jsonl` is the only v0 encoding. Ids and the state hash are defined over canonical JSON and do not depend on the encoding.

## 14. Conformance fixtures

`test/fixtures/ledgers/` holds ledgers generated by `tools/fixtures.mjs` (deterministic: fixed ids, timestamps and seeds). `expected.json` records for each its byte size, event count, block count, word count, heads and state hash.

| Fixture | Content | Events | Bytes | State hash |
|---|---|---|---|---|
| `empty.jsonl` | the blank document (empty text) | 0 | 0 | `4dbe56456145f9ed824ba19c45c6b9c07c86ccd966d0ba6a118170c376dc96dc` |
| `en.jsonl` | Strunk, *The Elements of Style* (1918), excerpt: headings, list, bold/italic, a typo corrected | 170 | 11 838 | `41bf929d916359fb4fccdcc790d893231bdb195d3933cebbfef325498a4685c9` |
| `de.jsonl` | Kafka, *Die Verwandlung* (1915), excerpt: umlauts, ß, marks on and off, split and join | 130 | 8 982 | `2dad8c0aff5321dbc1752848464950ca31ee28e4a917ac915c0b27469ca33161` |
| `stress.jsonl` | `</script>`, `<!--`, quotes, backslashes, ZWJ emoji, flags, skin tones, combining marks, CJK, Thai, Arabic, Hebrew, U+2028/U+2029, tab, NBSP, BOM, mixed marks on inserted text | 41 | 3 191 | `1485d2b85466c06427ea969fe2eeb18b1cff5d6197829e4832fb55b8d3d14a8b` |
| `10k.jsonl` | generated document of exactly 10 000 words, one event per word, with corrections and formatting | 10 603 | 716 269 | `bafae9ace3361915c17f4aa981b3e49d206649761f76c68dd48edafbb541732e` |
| `dag.jsonl` | two actors fork, merge (an event with two parents) and fork again: two heads | 14 | 1 636 | `f979df3def6f610abeb74cb62010e0d89cbe392d2196ba26ad36fc872ef74d8b` |

A conforming reader verifies every fixture without error, replays it without read-only, and reproduces its state hash.

## 15. Worked example

The ledger of §3, step by step.

Line 1 expands (§6.2: first line, so `p` = `[]`, `c` = 1, `d` = header doc) to

```
{"a":"k7Qx2m","c":1,"d":"4fGt0Qx9LmZ2pR7sVb1KdE","p":[],"t":1760198400,"x":[{"after":null,"b":"k7Qx2m:1","op":"blk","type":"h1"},{"b":"k7Qx2m:1","o":0,"op":"ins","s":"Hello "}]}
```

id `6b94de1a1a85bc7e1188e0ed1ab24404637d4acb75fe6f374632f24378d95717`. Line 2 inherits `a`, `t`, `c` = 2 and `p` = [line 1] (§6.3), id `7d312510538d8774030d354d1793a6df6c96697847d65f04641582f34a49a118`. Line 3 stores `t` because it changed; it expands to

```
{"a":"k7Qx2m","c":3,"p":["7d312510538d8774030d354d1793a6df6c96697847d65f04641582f34a49a118"],"t":1760198403,"x":[{"b":"k7Qx2m:1","nb":"k7Qx2m:2","o":11,"op":"split","type":"p"},{"b":"k7Qx2m:2","o":0,"op":"ins","s":"\u003c3 😀"}]}
```

id `83862acbee686d30dfb1ab507e9e55152e1a6dc4b5b53973f1d16dc2a8278bea`, the only head. Replay gives two blocks; the bold `wörld` has mark digits `11111` after six unmarked units:

```
{"blocks":[{"id":"k7Qx2m:1","marks":"00000011111","text":"Hello wörld","type":"h1"},{"id":"k7Qx2m:2","marks":"","text":"\u003c3 😀","type":"p"}],"doc":"4fGt0Qx9LmZ2pR7sVb1KdE"}
```

state hash `dadc819386331415b27c8b6f336bf5466aa550f1cffb8ce347b602e731b7f11a`.

## 16. Document shell and API

What exists today (E1-001):

- `dist/blank.html`: a valid, self-contained HTML shell. It contains one inline `<style>` and one inline `<script>` and nothing else is loaded. The engine script includes the reference model of this specification.
- Content-Security-Policy (meta element, before any style or script):
  `default-src 'none'; script-src 'sha256-…'; style-src 'sha256-…'; img-src data: blob:`
  The hashes are SHA-256 (base64) over the exact text content of the inline script and style. Any change to either without updating the hash makes the browser refuse it.
- `window.webdoc` is a read-only, frozen object; so far it only has `version` (string).

Embedding the ledger in the document (a `<script type="application/document-ledger" id="ledger">` element whose text is the ledger text of §3), loading, saving and the rest of the `window.webdoc` API (`state()`, `hash()`, `ledger()`, `selection()`, `toHTML()`) are specified with E1-005.
