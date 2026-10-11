# Behaviour bar dossier: ProseMirror basic example

Scout date: 2026-10-11. Facts only; no judgement. Third-party source code is not copied here, only short identifiers, keymap entries and regexes.

## 0. What was inspected

- https://prosemirror.net/examples/basic/ (HTML, fetched with curl)
- https://prosemirror.net/examples/basic/example.js (919 bytes)
- https://prosemirror.net/examples/prosemirror.js (252989 bytes, minified bundle; `Last-Modified: Tue, 29 Sep 2026 09:02:41 GMT`, `ETag: "6abb7eb1-3dc3d"`)
- npm tarballs (`npm pack`, extracted to /Users/joelsommerer/DEV/ether/bars/tmp/pm-src/): prosemirror-example-setup 1.2.3, prosemirror-history 1.5.1, prosemirror-commands 1.7.2, prosemirror-schema-list 1.5.1, prosemirror-inputrules 1.5.1
- https://raw.githubusercontent.com/ProseMirror/prosemirror-example-setup/master/src/keymap.ts and .../src/inputrules.ts: byte-identical (`diff -q`) to the npm 1.2.3 `src/` files
- https://raw.githubusercontent.com/ProseMirror/prosemirror-history/master/src/history.ts (line 393 `newGroupDelay: config.newGroupDelay || 500}`)
- Note: the page now links source to https://code.haverbeke.berlin/prosemirror/... ; https://github.com/ProseMirror/prosemirror-example-setup still answers HTTP 200.
- Live observation: Playwright 1.64.0 (Node 20) in /Users/joelsommerer/DEV/ether/bars/tmp/pw/, headless shell from ~/Library/Caches/ms-playwright/chromium_headless_shell-1234 (UA `HeadlessChrome/151.0.7922.34`, `navigator.platform=MacIntel`, so ProseMirror's `mac` flag is true and `Mod` = Meta).

## 1. Packages, versions, page access

### 1.1 What the page loads
- `<script src="../prosemirror.js">` then `<script src="example.js">` (i.e. /examples/prosemirror.js, /examples/basic/example.js).
- The bundle ends by assigning a global:
  `window.PM={model:…,transform:…,state:…,view:…,keymap:…,inputrules:…,history:…,commands:…,schema_basic:…,schema_list:…,dropcursor:…,menu:…,example_setup:…,gapcursor:…}`
  So the packages are: prosemirror-model, -transform, -state, -view, -keymap, -inputrules, -history, -commands, -schema-basic, -schema-list, -dropcursor, -menu, -example-setup, -gapcursor.
- example.js: IIFE called with `(PM.state, PM.view, PM.model, PM.schema_basic, PM.schema_list, PM.example_setup)`; builds `mySchema` with `addListNodes(prosemirrorSchemaBasic.schema.spec.nodes, "paragraph block*", "block")` and basic marks; then `window.view = new prosemirrorView.EditorView(document.querySelector("#editor"), {state: EditorState.create({doc: DOMParser.fromSchema(mySchema).parse(document.querySelector("#content")), plugins: exampleSetup({schema: mySchema})})})`.

### 1.2 Versions
The bundle contains NO version strings. Versions below are the npm `latest` (FALLBACK via `npm view <pkg> version`, 2026-10-11) with publish time; not proven to be what the bundle was built from. Bundle Last-Modified 2026-09-29T09:02:41Z is 14 s before prosemirror-history 1.5.1 was published (09:02:55Z).

| package | npm latest | published |
|---|---|---|
| prosemirror-model | 1.25.12 | 2026-09-21 |
| prosemirror-transform | 1.12.2 | 2026-09-25 |
| prosemirror-state | 1.4.4 | 2025-10-23 |
| prosemirror-view | 1.42.6 | 2026-09-25 |
| prosemirror-keymap | 1.2.3 | 2025-05-04 |
| prosemirror-inputrules | 1.5.1 | 2025-10-15 |
| prosemirror-history | 1.5.1 | 2026-09-29 |
| prosemirror-commands | 1.7.2 | 2026-08-05 |
| prosemirror-schema-basic | 1.2.5 | 2026-09-25 |
| prosemirror-schema-list | 1.5.1 | 2025-03-04 |
| prosemirror-dropcursor | 1.8.4 | 2026-09-24 |
| prosemirror-menu | 1.3.2 | 2026-04-17 |
| prosemirror-example-setup | 1.2.3 | 2024-08-16 |
| prosemirror-gapcursor | 1.4.1 | 2026-03-10 |

Spot checks that the bundle matches these sources: bundle contains `depth:e.depth||100,newGroupDelay:e.newGroupDelay||500`, the heading regex `"^(#{1,"+t+"})\\s$"`, `"Shift-Ctrl-8"` followed by the ordered_list check, and the same newGroup condition as history 1.5.1 (`!s&&e.prevComposition!=i&&(e.prevTime<(n.time||0)-r.newGroupDelay||…`).

### 1.3 Reading state from page JavaScript (verified live)
- `typeof window.view === "object"` (the EditorView). `window.PM` exposes all modules (verified keys: `model,transform,state,view,keymap,inputrules,history,commands,schema_basic,schema_list,dropcursor,menu,example_setup,gapcursor`).
- Document: `view.state.doc` (`.toJSON()`, `.forEach`, `node.type.name`, `node.attrs`, `node.marks`).
- Selection: `view.state.selection` (`from`, `to`, `$from.parent.type.name`, `$from.parentOffset`, `$from.depth`). Class name is minified (`dt` for TextSelection) so use `instanceof PM.state.TextSelection`.
- History: `PM.history.undoDepth(view.state)`, `PM.history.redoDepth(view.state)`.
- Set cursor: `view.dispatch(view.state.tr.setSelection(PM.state.TextSelection.create(view.state.doc, pos)))`.
- Initial doc (verified): `heading{level:3}("Hello ProseMirror") | paragraph | paragraph(with em, strong, link, code marks and an image) | paragraph | paragraph` (5 top-level blocks). Position 1 = start of heading text, 18 = end of heading, 20 = start of 2nd block.

### 1.4 Reading from the DOM (verified live)
- `#editor` contains `DIV.ProseMirror-menubar-wrapper`; editable root is `#editor .ProseMirror`: `DIV class="ProseMirror ProseMirror-example-setup-style ProseMirror-focused" contenteditable=true translate=no` (no `role`).
- Block tags: children of the root were `H3,P,P,P,P`. Schema-basic node DOM: heading -> `h1..h6`, paragraph -> `p`, blockquote -> `blockquote`, code_block -> `pre>code`, bullet_list -> `ul`, ordered_list -> `ol` (start attr from `order`), list_item -> `li`, hard_break -> `br`, horizontal_rule -> `hr`, image -> `img`.
- Marks in the DOM (para 2): `EM, STRONG, A[href=http://marijnhaverbeke.nl/blog], CODE, IMG`. With strong+em on the same text, DOM nesting observed was `EM>STRONG` (mark order em before strong in the schema).
- DOM selection: `window.getSelection()` on the contenteditable; the authoritative positions are `view.state.selection` (above).

## 2. Keymap of prosemirror-example-setup 1.2.3 (src/keymap.ts, `buildKeymap`)

`mac = /Mac|iP(hone|[oa]d)/.test(navigator.platform)`. Bindings, in order of `bind(...)` calls:

| key | command |
|---|---|
| `Mod-z` | `undo` (prosemirror-history) |
| `Shift-Mod-z` | `redo` |
| `Backspace` | `undoInputRule` (prosemirror-inputrules) |
| `Mod-y` | `redo` — only `if (!mac)` |
| `Alt-ArrowUp` | `joinUp` |
| `Alt-ArrowDown` | `joinDown` |
| `Mod-BracketLeft` | `lift` |
| `Escape` | `selectParentNode` |
| `Mod-b`, `Mod-B` | `toggleMark(schema.marks.strong)` |
| `Mod-i`, `Mod-I` | `toggleMark(schema.marks.em)` |
| ``Mod-` `` | `toggleMark(schema.marks.code)` |
| `Shift-Ctrl-8` | `wrapInList(schema.nodes.bullet_list)` |
| `Shift-Ctrl-9` | `wrapInList(schema.nodes.ordered_list)` |
| `Ctrl->` | `wrapIn(schema.nodes.blockquote)` |
| `Mod-Enter`, `Shift-Enter` (+ `Ctrl-Enter` if mac) | `chainCommands(exitCode, <insert hard_break via tr.replaceSelectionWith(br.create()).scrollIntoView()>)` |
| `Enter` | `splitListItem(schema.nodes.list_item)` |
| `Mod-[` | `liftListItem(schema.nodes.list_item)` |
| `Mod-]` | `sinkListItem(schema.nodes.list_item)` |
| `Shift-Ctrl-0` | `setBlockType(schema.nodes.paragraph)` |
| `Shift-Ctrl-\` | `setBlockType(schema.nodes.code_block)` |
| `Shift-Ctrl-1` .. `Shift-Ctrl-6` | `setBlockType(schema.nodes.heading, {level: i})` for i = 1..6 |
| `Mod-_` | insert horizontal_rule (`tr.replaceSelectionWith(hr.create()).scrollIntoView()`) |

Discrepancy recorded verbatim: the doc comment in keymap.ts says "**Ctrl-Shift-8** to wrap the selection in an ordered list / **Ctrl-Shift-9** to wrap the selection in a bullet list", but the code binds `Shift-Ctrl-8` -> bullet_list and `Shift-Ctrl-9` -> ordered_list. Live observation matches the code (S22 below).

Plugin order in `exampleSetup` (src/index.ts): `buildInputRules(schema)`, `keymap(buildKeymap(schema, mapKeys))`, `keymap(baseKeymap)`, `dropCursor()`, `gapCursor()`, then `menuBar({floating: options.floatingMenu !== false, content: …fullMenu})` unless `menuBar === false`, then `history()` unless `history === false`, then a plugin with `attributes: {class: "ProseMirror-example-setup-style"}`. So example-setup keys take precedence; if a command returns false, baseKeymap runs.

baseKeymap (prosemirror-commands 1.7.2, `pcBaseKeymap`; `macBaseKeymap` = these plus mac extras):
- `"Enter"`: `chainCommands(newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock)`
- `"Mod-Enter"`: `exitCode`
- `"Backspace"`, `"Mod-Backspace"`, `"Shift-Backspace"`: `chainCommands(deleteSelection, joinBackward, selectNodeBackward)`
- `"Delete"`, `"Mod-Delete"`: `chainCommands(deleteSelection, joinForward, selectNodeForward)`
- `"Mod-a"`: `selectAll`
- mac only: `"Ctrl-h"` = Backspace, `"Alt-Backspace"` = Mod-Backspace, `"Ctrl-d"` = Delete, `"Ctrl-Alt-Backspace"`, `"Alt-Delete"`, `"Alt-d"` = Mod-Delete, `"Ctrl-a"`: `selectTextblockStart`, `"Ctrl-e"`: `selectTextblockEnd`.

Effective chains: Enter = splitListItem -> newlineInCode -> createParagraphNear -> liftEmptyBlock -> splitBlock. Backspace = undoInputRule -> deleteSelection -> joinBackward -> selectNodeBackward.

`splitListItem` doc comment: "Build a command that splits a non-empty textblock at the top level of a list item by also splitting that list item." It returns false unless `$from.depth >= 2`, same parent, grandparent is the item type; empty block as last child of the item is handled specially (nested list: split the wrapping item; otherwise bail out to the next command).

## 3. Input rules (example-setup src/inputrules.ts + prosemirror-inputrules src/rules.ts)

`buildInputRules`: `smartQuotes.concat(ellipsis, emDash)`, then in this order if the node exists: blockquote, ordered_list, bullet_list, code_block, heading (maxLevel 6); `inputRules({rules})`.

| rule | regex / pattern | effect |
|---|---|---|
| blockQuoteRule | `/^\s*>\s$/` | `wrappingInputRule(…, blockquote)` |
| orderedListRule | `/^(\d+)\.\s$/` | `wrappingInputRule`, attrs `{order: +match[1]}`, join predicate `node.childCount + node.attrs.order == +match[1]` |
| bulletListRule | `/^\s*([-+*])\s$/` | `wrappingInputRule(…, bullet_list)` |
| codeBlockRule | `` /^```$/ `` | `textblockTypeInputRule(…, code_block)` |
| headingRule | `new RegExp("^(#{1," + maxLevel + "})\\s$")`, maxLevel 6 | `textblockTypeInputRule`, attrs `{level: match[1].length}` |
| emDash | `/--$/` -> `"—"` | `{inCodeMark: false}` |
| ellipsis | `/\.\.\.$/` -> `"…"` | `{inCodeMark: false}` |
| openDoubleQuote | `/(?:^|[\s\{\[\(\<'"‘“])(")$/` -> `"“"` | `{inCodeMark: false}` |
| closeDoubleQuote | `/"$/` -> `"”"` | `{inCodeMark: false}` |
| openSingleQuote | `/(?:^|[\s\{\[\(\<'"‘“])(')$/` -> `"‘"` | `{inCodeMark: false}` |
| closeSingleQuote | `/'$/` -> `"’"` | `{inCodeMark: false}` |

`smartQuotes = [openDoubleQuote, closeDoubleQuote, openSingleQuote, closeSingleQuote]`.
InputRule options: `undoable` defaults true (`options.undoable !== false`), `inCode` default false, `inCodeMark` default true. Matching: `MAX_MATCH = 500`; text before cursor = `$from.parent.textBetween(Math.max(0, $from.parentOffset - MAX_MATCH), $from.parentOffset, null, "￼") + text`; triggered from `handleTextInput` and `compositionend`. `undoInputRule` reverts the last rule if it was the last transaction and re-inserts the typed text (with marks at `from`).

## 4. Undo grouping (prosemirror-history 1.5.1)

- `history(config)`: `depth: config.depth || 100`, `newGroupDelay: config.newGroupDelay || 500` (ms). Doc: depth = "The amount of history events that are collected before the oldest events are discarded. Defaults to 100."; newGroupDelay = "The delay between changes after which a new group should be started. Defaults to 500 (milliseconds). Note that when changes aren't adjacent, a new group is always started."
- `const DEPTH_OVERFLOW = 20` (events are only cut when `eventCount - depth > 20`); `const max_empty_items = 500`.
- New group condition (applyTransaction): `newGroup = history.prevTime == 0 || (!appended && history.prevComposition != composition && (history.prevTime < (tr.time || 0) - options.newGroupDelay || !isAdjacentTo(tr, history.prevRanges)))`, where `composition = tr.getMeta("composition")`. Initial state `new HistoryState(Branch.empty, Branch.empty, null, 0, -1)`.
- `isAdjacentTo`: false if no prevRanges; true if `!transform.docChanged`; otherwise true if any changed range of `mapping.maps[0]` touches/overlaps a previous range (`start <= prevRanges[i + 1] && end >= prevRanges[i]`).
- Transactions with meta `addToHistory: false` are not recorded; `closeHistory(tr)` forces the next change into a new event.
- Commands: `undo`, `redo` (scroll), `undoNoScroll`, `redoNoScroll`; `undoDepth(state)`, `redoDepth(state)`.
- Note: the timing is between consecutive transactions (prevTime updates on every recorded transaction), not from the group start.

Observed (live, Playwright `keyboard.type`, ~immediate keystrokes):
- S14 type "abc" at end of heading -> undoDepth 1; Meta+z removes all three -> heading "Hello ProseMirror", cursor 18.
- S15 "ab", 700 ms pause, "cd" -> undoDepth 2; Meta+z -> "…ab" (cursor 20); Meta+Shift+z -> "…abcd"; Meta+y -> no change (unbound on mac).
- S16 "ab", 300 ms pause, "cd" -> Meta+z removes all of "abcd" (one group).
- S17 "a" at end of heading, then immediately "b" at start of next paragraph (non-adjacent) -> undoDepth 2; Meta+z removes only "b".
- S18 "ab", Enter, "cd" typed fast -> undoDepth 1; one Meta+z reverts text and the split together.
- S1 Enter at end of heading then "x" -> undoDepth 1 (grouped).
- S28 Enter, 700 ms pause, "- " (bullet rule fires) -> undoDepth 2; Meta+z -> empty `paragraph()` (the "- " text is NOT restored by Mod-z; it is restored by Backspace, see S13).

## 5. Enter/Backspace at block boundaries (observed live)

Method: fresh page load per scenario; cursor placed with `TextSelection.create` (or arrow keys where stated); keys via `page.keyboard.press`. Doc notation: `type{attrs}(children)`; "|" separates top-level blocks. Raw logs: /Users/joelsommerer/DEV/ether/bars/tmp/pw/observe-output.txt and observe-output-2.txt.

- S1 Enter at END of heading (pos 18): -> `heading{3}("Hello ProseMirror") | paragraph() | …` (6 blocks), cursor 20 in the new paragraph (offset 0). New block is a paragraph, not a heading. Typing "x" goes into it.
- S26 Enter in MIDDLE of heading (pos 6): -> `heading{3}("Hello") | heading{3}(" ProseMirror")`, cursor 8 at offset 0 of the second heading.
- S2 Enter at START of heading (pos 1): -> `paragraph() | heading{3}("Hello ProseMirror") | …`, cursor 3 at start of heading (empty paragraph inserted above).
- S3 Backspace at START of FIRST block (pos 1, heading): no change, undoDepth stays 0.
- S3b Backspace at start of paragraph after heading (pos 20): joins into heading -> `heading{3}("Hello ProseMirrorThis is editable text. …")`, cursor 18. Block type of the first block wins.
- S25 Delete at end of heading: same join result as S3b, cursor 18.
- S27 Enter at end of heading, then Backspace in the empty paragraph: empty paragraph removed, cursor 18 at end of heading.
- S4 list built by Enter at end of heading, "- ", "a", Enter, "b": `bullet_list(list_item(paragraph("a")) list_item(paragraph("b")))`.
- S5 Backspace at START of 2nd list item "b" (pos 27): -> `bullet_list(list_item(paragraph("a") paragraph("b")))` (item merged into previous item as a second paragraph), cursor 25. Second Backspace -> `list_item(paragraph("ab"))`, cursor 23.
- S9 Backspace at START of FIRST list item "a" (pos 22): -> `heading | paragraph("a") | bullet_list(list_item(paragraph("b")))` (item lifted out of the list, list split), cursor 20. Second Backspace -> joins into heading `heading{3}("Hello ProseMirrora")`, cursor 18.
- S6 Enter at START of non-empty 2nd item "b": -> `list_item(paragraph("a")) list_item(paragraph()) list_item(paragraph("b"))`, cursor 31 in the "b" item (offset 0).
- S7 Enter at end of last item -> new empty item; Enter again in EMPTY LAST item -> item removed, `bullet_list(a, b) | paragraph()`, cursor 32 in the new top-level paragraph (depth 1).
- S11 Enter in EMPTY MIDDLE item (a, empty, b): -> `bullet_list(list_item(paragraph("a"))) | paragraph() | …` (8 top blocks; i.e. list split, empty paragraph between, "b" continues in a following bullet_list — top blocks beyond the 3rd not dumped), cursor 27 depth 1.
- S8 Backspace in EMPTY LAST item: -> `list_item(paragraph("b") paragraph())` (empty item joined into previous item as an empty paragraph), cursor 30.
- S10 Meta+] on 2nd item -> `list_item(paragraph("a") bullet_list(list_item(paragraph("b"))))`; Meta+[ -> back to flat list.
- S23 blockquote: "> q", Enter -> `blockquote(paragraph("q") paragraph())`; Enter in that empty paragraph -> `blockquote(paragraph("q")) | paragraph()` (lifted out).
- S24 Backspace at start of paragraph inside blockquote -> `paragraph("q")` (blockquote unwrapped).
- S20 Shift+Enter in paragraph (pos 25) -> `paragraph("This " hard_break "is editable…")`, cursor 26.
- S19 Meta+b on selection 1..6 -> "Hello"[strong]; Meta+i -> "Hello"[em,strong]; selection stays 1..6. S19b Meta+b with collapsed cursor then "z" -> "z"[strong] (stored mark).
- S21 Ctrl+Shift+2 on paragraph -> heading{2}; Ctrl+Shift+0 -> paragraph. S22 Ctrl+Shift+8 -> bullet_list; Ctrl+Shift+9 -> ordered_list{order:1}.
- S12 input rules typed into an empty paragraph: "# " -> heading{1}; "### " -> heading{3}; "1. " -> ordered_list{order:1}; "3. " -> ordered_list{order:3}; "* " and "+ " -> bullet_list; "> " -> blockquote(paragraph()); "```" -> code_block(); `"q" 's' ` -> `“q” ‘s’ `; "a -- b ... c" -> "a — b … c". Each rule application = 1 undo event.
- S13 "## " -> heading{2}(); Backspace right after -> `paragraph("## ")`, cursor offset 3 (undoInputRule).

## Saved artifacts
- /Users/joelsommerer/DEV/ether/bars/tmp/pw/observe.mjs, observe2.mjs (observation scripts)
- /Users/joelsommerer/DEV/ether/bars/tmp/pw/observe-output.txt, observe-output-2.txt, run.log, run2.log (raw logs; note: S9 in observe-output.txt is invalid — ArrowUp moved the cursor into the heading; use the S9 rerun in observe-output-2.txt)
- /Users/joelsommerer/DEV/ether/bars/tmp/pm-src/ (npm tarballs + extracted sources; GitHub copies gh-keymap.ts, gh-inputrules.ts)

## Not obtained
- Exact versions built into prosemirror.net/examples/prosemirror.js (no version strings in bundle; npm latest used as fallback).
- Behaviour in a headed browser, Firefox, WebKit/Safari or on touch/mobile devices (only headless Chromium 151 on macOS observed); IME/composition grouping not observed.
- Mod-y on non-mac, Escape, Alt-ArrowUp/Down, Mod-_, Mod-`, Ctrl->, Shift-Ctrl-\, Mod-BracketLeft not exercised live.
