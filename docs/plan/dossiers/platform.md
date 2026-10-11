# Dossier: platform facts (Ether Phase 1)

Scout run: 2026-10-11. Verbatim extracts; no judgement. "not found" = not obtained.

---

## 1. Input Events Level 2

Source: https://w3c.github.io/input-events/ (fetched 2026-10-11; ReSpec `specStatus: "ED"`; HTTP Last-Modified: Fri, 01 May 2026 06:14:22 GMT).

### 1.1 IDL (verbatim)

```
partial interface InputEvent {
   readonly attribute DataTransfer? dataTransfer;
   sequence<StaticRange> getTargetRanges();
};
partial dictionary InputEventInit {
   DataTransfer? dataTransfer = null;
   sequence<StaticRange> targetRanges = [];
};
```

### 1.2 inputType table, spec order (inputType | intention | part of IME composition | beforeinput cancelable | state of selection)

| # | inputType | User's expression of intention | Part of IME composition | beforeinput cancelable | State of selection |
|---|---|---|---|---|---|
| 1 | "insertText" | insert typed plain text | No | Yes | Any |
| 2 | "insertReplacementText" | insert or replace existing content by means of a spell checker, auto-correct, writing suggestions or similar | No | Yes | Any |
| 3 | "insertLineBreak" | insert a line break | No | Yes | Any |
| 4 | "insertParagraph" | insert a paragraph break | No | Yes | Any |
| 5 | "insertOrderedList" | insert a numbered list | No | Yes | Any |
| 6 | "insertUnorderedList" | insert a bulleted list | No | Yes | Any |
| 7 | "insertHorizontalRule" | insert a horizontal rule | No | Yes | Any |
| 8 | "insertFromYank" | replace the current selection with content stored in a kill buffer | No | Yes | Any |
| 9 | "insertFromDrop" | insert content by means of drop | No | Yes | Any |
| 10 | "insertFromPaste" | paste content from clipboard or paste image from client provided image library | No | Yes | Any |
| 11 | "insertFromPasteAsQuotation" | paste content from the clipboard as a quotation | No | Yes | Any |
| 12 | "insertTranspose" | transpose the last two [=grapheme cluster=]. that were entered | No | Yes | Any |
| 13 | "insertCompositionText" | replace the current composition string | Yes | **No** | Any |
| 14 | "insertLink" | insert a link | No | Yes | Any |
| 15 | "deleteWordBackward" | delete a word directly before the caret position | No | Yes | Collapsed |
| 16 | "deleteWordForward" | delete a word directly after the caret position | No | Yes | Collapsed |
| 17 | "deleteSoftLineBackward" | delete from the caret to the nearest visual line break before the caret position | No | Yes | Collapsed |
| 18 | "deleteSoftLineForward" | delete from the caret to the nearest visual line break after the caret position | No | Yes | Collapsed |
| 19 | "deleteEntireSoftLine" | delete from the nearest visual line break before the caret position to the nearest visual line break after the caret position | No | Yes | Collapsed |
| 20 | "deleteHardLineBackward" | delete from the caret to the nearest beginning of a block element or br element before the caret position | No | Yes | Collapsed |
| 21 | "deleteHardLineForward" | delete from the caret to the nearest end of a block element or br element after the caret position | No | Yes | Collapsed |
| 22 | "deleteByDrag" | remove content from the DOM by means of drag | No | Yes | Any |
| 23 | "deleteByCut" | remove the current selection as part of a cut | No | Yes | Any |
| 24 | "deleteContent" | delete the selection without specifying the direction of the deletion and this intention is not covered by another inputType | No | Yes | Non-collapsed |
| 25 | "deleteContentBackward" | delete the content directly before the caret position and this intention is not covered by another inputType or delete the selection with the selection collapsing to its start after the deletion | No | Yes | Any |
| 26 | "deleteContentForward" | delete the content directly after the caret position and this intention is not covered by another inputType or delete the selection with the selection collapsing to its end after the deletion | No | Yes | Any |
| 27 | "historyUndo" | undo the last editing action | No | Yes | Any |
| 28 | "historyRedo" | to redo the last undone editing action | No | Yes | Any |
| 29 | "formatBold" | initiate bold text | No | Yes | Any |
| 30 | "formatItalic" | initiate italic text | No | Yes | Any |
| 31 | "formatUnderline" | initiate underline text | No | Yes | Any |
| 32 | "formatStrikeThrough" | initiate stricken through text | No | Yes | Any |
| 33 | "formatSuperscript" | initiate superscript text | No | Yes | Any |
| 34 | "formatSubscript" | initiate subscript text | No | Yes | Any |
| 35 | "formatJustifyFull" | make the current selection fully justified | No | Yes | Any |
| 36 | "formatJustifyCenter" | center align the current selection | No | Yes | Any |
| 37 | "formatJustifyRight" | right align the current selection | No | Yes | Any |
| 38 | "formatJustifyLeft" | left align the current selection | No | Yes | Any |
| 39 | "formatIndent" | indent the current selection | No | Yes | Any |
| 40 | "formatOutdent" | outdent the current selection | No | Yes | Any |
| 41 | "formatRemove" | remove all formatting from the current selection | No | Yes | Any |
| 42 | "formatSetBlockTextDirection" | set the text block direction | No | Yes | Any |
| 43 | "formatSetInlineTextDirection" | set the text inline direction | No | Yes | Any |
| 44 | "formatBackColor" | change the background color | No | Yes | Any |
| 45 | "formatFontColor" | change the font color | No | Yes | Any |
| 46 | "formatFontName" | change the font-family | No | Yes | Any |

Total: 46 inputTypes. Only "insertCompositionText" is non-cancelable.

Verbatim text after the table:
- "Other specifications may expand on this definition."
- "The existence of the above mentioned inputTypes does not mean that any given implementation will support all of these. But if a given browser supports an editing operation which potentially leads to a change of the DOM, it MUST [=dispatch=] the corresponding beforeinput and input events."
- "If the selection is collapsed, "deleteContentBackward" will be used both when the user asks for text deletion within a text node, and when the user shows the intention to deletion of more complex elements or merge paragraphs if the caret is at the start of a text node."
- "If the selection is collapsed, "deleteContentForward" will be used both when the user asks for text deletion within a text node, and when the user shows the intention to deletion of more complex elements or merge paragraphs if the caret is at the end of a text node."

Abstract (verbatim): "Input Events Level 2 replaces the first version of Input Events [[INPUT-EVENTS]] and includes: Inputtypes for beforeinput events for the start and end of IME compositions that allow isolation of the IME composition process. More requirements for cancelability of beforeinput events, so that all beforeinput events apart from those being emited within an IME composition process are cancelable."
Note (observed fact): the fetched ED's inputType table contains no separate start/end-of-composition inputTypes (no "deleteCompositionText" / "insertFromComposition" string anywhere in the document), despite the abstract.

### 1.3 Overview table (data / dataTransfer / getTargetRanges by host)

| Editing host | inputType | data | dataTransfer | getTargetRanges() |
|---|---|---|---|---|
| Contenteditable | "insertText", "insertCompositionText", "formatSetBlockTextDirection", "formatSetInlineTextDirection", "formatBackColor", "formatFontColor", "formatFontName", "insertLink" | Yes | null | Non-empty Array |
| Contenteditable | "insertFromPaste", "insertFromPasteAsQuotation", "insertFromDrop", "insertReplacementText", "insertFromYank" | null | Yes | Non-empty Array |
| `<textarea>`, `<input type="text">` | "insertText", "insertCompositionText", "insertFromPaste", "insertFromPasteAsQuotation", "insertFromDrop", "insertReplacementText", "insertFromYank", "formatSetBlockTextDirection", "formatSetInlineTextDirection", "formatBackColor", "formatFontColor", "formatFontName", "insertLink" | Yes | null | Empty Array |
| All | "historyUndo", "historyRedo" | null | null | Empty Array |
| Contenteditable | All Remaining | null | null | Non-empty Array |
| `<textarea>`, `<input type="text">` | All Remaining | null | null | Empty Array |

`data` values: "insertText"/"insertCompositionText" (Any host) -> "the plain text string to be inserted"; paste/drop/transpose/replacement/yank (input or textarea) -> "the plain text string to be inserted"; "formatSetInlineTextDirection"/"formatSetBlockTextDirection" -> "ltr", "rtl", "auto" or "null"; "formatBackColor"/"formatFontColor" -> "a string containing a serialized CSS component value [[CSSOM]] of the proposed color"; "formatFontName" -> "the proposed value of the font-family CSS property"; "insertLink" -> "the url of the proposed link"; All remaining -> null.

`dataTransfer` for "insertFromPaste", "insertFromPasteAsQuotation", "insertFromDrop", "insertTranspose", "insertReplacementText", "insertFromYank" on contenteditable: prepopulated DataTransfer, drag data store read-only; file -> one entry with the file's mime type, kind File; one "text/html" entry (Plain Unicode string, HTML representation); one "text/plain" entry; if link, one "text/uri-list" entry. All remaining -> null.

### 1.4 getTargetRanges() (verbatim)

"getTargetRanges() returns an array of StaticRanges representing the content that the event will modify if it is not canceled if the [=editing host=] is a contenteditable node, or the content that the browser assumes to be affected by the event if the [=editing host=] is an EditContext editing host. Otherwise this method returns an empty Array. The returned StaticRanges MUST cover only the code points that the browser would normally replace, even if they are only part of a [=grapheme cluster=]."

Non-normative note: "Depending on the script and the platform, deleting backward or forward in a text node with a collapsed selection may affect one or multiple code points or an entire [=grapheme cluster=]. For example, deleting backward in a text node containing “café” may remove either the acute accent or the entire “é” character, depending on the script and the platform."

Methods table: "historyUndo" or "historyRedo" / Any -> empty Array; All remaining / contenteditable -> "an Array of StaticRanges [[DOM]] associated with event"; All remaining / input or textarea -> an empty Array.

### 1.5 beforeinput / input event definitions (verbatim essentials)

beforeinput: Interface InputEvent; Sync; Bubbles Yes; Trusted Targets "Any Element that is an [=editing host=]."; Default action: "For contentEditable=typing editing hosts for inputType "insertCompositionText": 'Update the DOM'. For contentEditable="true" [=editing hosts=] for all inputTypes: 'Update the DOM'. For EditContext editing hosts for EditContext-handled inputTypes: Handle input for EditContext given the [=editing host=] element. None otherwise." Context: "InputEvent.getTargetRanges(): returns an array of StaticRanges which will be affected by the change to the DOM if it is not canceled."
"A [=user agent=] MUST [=dispatch=] this event when the user has attempted to input in a contenteditable element. It does not necessarily mean the [=user agent=] will then update the DOM. A [=user agent=] MUST NOT [=dispatch=] this event due to events that are not caused by attempted user input, such as system events."

input: Sync; Bubbles Yes; Trusted Targets "Any Element with contenteditable attribute enabled."; Default action None. "A [=user agent=] MUST [=dispatch=] this event immediately after the DOM has been updated due to user expressed intention to change the document contents which the browser has handled. If the browser makes no DOM change, either because the editing host is an EditContext editing host (which does not do automatic DOM changes) or because the [=user agent=] concludes that no DOM change is needed, the user agent MUST NOT dispatch this event."

### 1.6 Composition rules (section "Input Event Order During Composition", verbatim)

"The start of a composition is marked by dispatching a compositionstart event.
During a composition session, whenever a text composition system updates its active text passage, a compositionupdate event is dispatched.
After each compositionupdate event, a pair of {{beforeinput}} and {{input}} events are dispatched.
The {{beforeinput}} and {{input}} events:
- Are not cancellable
- Have an {{InputEvent/inputType}} set to "insertCompositionText"
- Have a {{data}} attribute equal to that of the compositionupdate event
- Have a {{InputEvent/targetRange}} that surrounds the active text passage of the composition
The DOM contents of the active text passage are updated after the {{beforeinput}} event is dispatched and before the {{input}} event is dispatched.
The end of a composition session is marked by dispatching a compositionend event."

Paste order: "When an "insertFromPaste" {{beforeinput}} event is dispatched, it MUST be preceded by a paste [[CLIPBOARD-APIS]] event."

### 1.7 Per-browser support

MDN browser-compat-data (https://unpkg.com/@mdn/browser-compat-data/data.json, version 8.1.5), version_added:

| Feature | chrome | chrome_android | firefox | safari | safari_ios |
|---|---|---|---|---|---|
| api.Element.beforeinput_event | 60 | 60 | 87 | 10.1 | 10.3 |
| api.InputEvent.getTargetRanges | 60 | 60 | 87 | 10.1 | 10.3 |
| api.InputEvent.inputType | 60 | 60 | 66 | 10.1 | 10.3 |
| api.InputEvent.dataTransfer | 60 | 60 | 67 | 10.1 | 10.3 |
| api.InputEvent.data | 60 | 60 | 67 | 10.1 | 10.3 |
| api.InputEvent.isComposing | 60 | 60 | 31 | 16.4 (partial_implementation) | 16.4 (partial_implementation) |

BCD note on Safari/Safari iOS isComposing (verbatim): "The events for the keystroke that completes an IME composition session fire out of order, causing confusing <code>isComposing</code> values. The <code>keydown</code> and <code>input</code> events dispatch after the <code>compositionend</code> event fires instead of before. Consequently, the <code>isComposing</code> value is unexpectedly <code>false</code> instead of <code>true</code>. Events fired earlier in the session are unaffected. See https://webkit.org/b/165004 and https://webkit.org/b/317127."

MDN beforeinput page (https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/element/beforeinput_event/index.md), verbatim note:
"> [!NOTE] Not every user modification results in `beforeinput` firing. Also the event may fire but be non-cancelable. This may happen when the modification is done by autocomplete, by accepting a correction from a spell checker, by password manager autofill, by IME, or in other ways. The details vary by browser and OS. To override the edit behavior in all situations, the code needs to handle the `input` event and possibly revert any modifications that were not handled by the `beforeinput` handler. See bugs [1673558](https://bugzil.la/1673558) and [1763669](https://bugzil.la/1763669)."
MDN feature detection (verbatim):
```js
function isBeforeInputEventAvailable() {
  return (
    window.InputEvent &&
    typeof InputEvent.prototype.getTargetRanges === "function"
  );
}
```
MDN getTargetRanges page (https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/inputevent/gettargetranges/index.md): "returns an array of StaticRange objects that will be affected by a change to the DOM if the input event is not canceled." (same host table as spec).

#### Cmd+B / Cmd+I -> formatBold / formatItalic (source code evidence)

Chromium (https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/editing/editing_behavior.cc, lines 150-158):
```
#if BUILDFLAG(IS_MAC)
    {'B', kCommandKey, "ToggleBold"},
    {'I', kCommandKey, "ToggleItalic"},
    {'U', kCommandKey, "ToggleUnderline"},
#else
    {'B', kCtrlKey, "ToggleBold"},
    {'I', kCtrlKey, "ToggleItalic"},
    {'U', kCtrlKey, "ToggleUnderline"},
#endif
```
(`const uint32_t kCommandKey = kMetaKey;` line 58.)
Chromium editor_command.cc (https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/editing/commands/editor_command.cc, ~line 200):
```
    case CommandType::kBold:
    case CommandType::kToggleBold:
      return InputType::kFormatBold;
    case CommandType::kItalic:
    case CommandType::kToggleItalic:
      return InputType::kFormatItalic;
```
Same file, EditContext path comment: "// 1) BeforeInput event only, ex ctrl+B or <enter>." for kToggleBold/kToggleItalic/kToggleUnderline/kInsertTab/kInsertBacktab/kInsertNewline/kInsertLineBreak.

WebKit (https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/editing/EditCommand.cpp, `inputTypeNameForEditingAction`, line ~69):
```
    case EditAction::Bold:
        return "formatBold"_s;
    case EditAction::Italics:
        return "formatItalic"_s;
```
WebKit EditorCommand.cpp: `executeToggleBold` -> `executeToggleStyle(frame, source, EditAction::Bold, CSSPropertyFontWeight, "normal"_s, "bold"_s)`; command table `{ "ToggleBold"_s, { executeToggleBold, supportedFromMenuOrKeyBinding, enabledInRichlyEditableText, ... } }`, same for "ToggleItalic".
WebKit iOS (Source/WebKit/UIProcess/ios/WKContentViewInteraction.mm): `- (void)toggleBoldfaceForWebView:(id)sender` -> `if (!page->editorState().isContentRichlyEditable) return; [self _executeEditCommand:@"toggleBold"];` (UIKit `toggleBoldface:` / `toggleItalics:` selectors, line 4889). Same pattern for toggleItalicsForWebView -> "toggleItalic".
WebKit macOS (Source/WebKit/UIProcess/mac/WebViewImpl.mm line ~1122): ToggleBold executed from Touch Bar text style control `_wkChangeTextStyle:`. The macOS key-binding path from Cmd+B keydown to ToggleBold in Safari: not found.

Firefox (https://raw.githubusercontent.com/mozilla-firefox/firefox/main/dom/events/ShortcutKeyDefinitions.cpp): `ShortcutKeys::sEditorHandlers[]` at line 591; `grep -c bold` = 0 (no cmd_bold binding for accel+B in this file; only `{u"keypress", nullptr, u"b", u"control", u"cmd_charPrevious"}, // Emacs`). Firefox editor/libeditor/EditAction.h line 591-593: `case EditAction::eSetFontWeightProperty: case EditAction::eRemoveFontWeightProperty: return EditorInputType::eFormatBold;` (i.e. formatBold is emitted when bold is applied via an editor command, e.g. execCommand).
Empirical browser test of Cmd+B in contenteditable: not performed.

---

## 2. safaridriver with iOS simulators

Local facts (this Mac):
- `safaridriver --version` -> `Included with Safari 26.5.2 (21624.2.5.11.8)`
- macOS 26.5.2 (25F84); Xcode 26.6 (17F113)
- iOS simulator runtimes: iOS 26.4 (26.4.1 - 23E254a), iOS 26.5 (26.5 - 23F77)
- "Ether iPhone 17 Pro" UDID 4BA9F329-8BB2-4B14-8572-8E8ABBAF4B1F, runtime com.apple.CoreSimulator.SimRuntime.iOS-26-5, deviceType com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro, state Shutdown (not booted by this scout).
- `safaridriver --enable` was NOT run (requires admin password; and desktop Safari automation not started). Whether it is already enabled: not determined (`defaults read com.apple.Safari AllowRemoteAutomation` -> key does not exist in the container prefs).
- `safaridriver --help` also lists: `-b, --bidi  Port number the driver should use to listen for incoming WebSocket connections. If specified, all sessions hosted by this instance will have WebDriver BiDi support enabled. If port 0 is specified, a default port will be used.`

`man safaridriver` (local, verbatim, Session Creation Capabilities):
- `--enable`: "Applies configuration changes so that subsequent WebDriver sessions will run without further authentication. This includes checking "Enable Remote Automation" in Safari's Develop menu. The user must authenticate via password for the changes to be applied. When this option is specified, safaridriver exits immediately without starting up the REST API service. If the changes were successful or already applied, safaridriver exits 0; otherwise, safaridriver exits >0 and prints an error message to stderr."
- `browserName`: "safaridriver can only create WebDriver sessions for Safari. If the value of browserName is not equal to `Safari', session creation will fail. Values of browserName are compared case-insensitively."
- `browserVersion`: prefix-matched.
- `platformName`: "If the value of platformName is `mac' or `macOS', safaridriver will only create a session using the macOS host on which safaridriver is running. If the value of platformName is `iOS', safaridriver will only create a session on a paired iOS device or simulator. Values of platformName are compared case-insensitively."
- `safari:platformVersion`: "OS version numbers are prefix-matched."
- `safari:platformBuildVersion`
- `safari:useSimulator`: "If the value of safari:useSimulator is true, safaridriver will only use iOS Simulator hosts. If the value of safari:useSimulator is false, safaridriver will not use iOS Simulator hosts. NOTE: An Xcode installation is required in order to run WebDriver tests on iOS Simulator hosts."
- `safari:deviceType`: "`iPhone'" or "`iPad'", compared case-insensitively.
- `safari:deviceName`: "safaridriver will only create a session using hosts whose device name matches the value of safari:deviceName. Device names are compared case-insensitively."
- `safari:deviceUDID`: "safaridriver will only create a session using hosts whose device UDID matches the value of safari:deviceUDID. Device UDIDs are compared case-insensitively."
- Other: `acceptInsecureCerts`, `safari:automaticInspection`, `safari:automaticProfiling`, `safari:diagnose`, `webauthn:virtualAuthenticators`, `webkit:alwaysAllowAutoplay`, `webkit:WebRTC`.
- SESSION CREATION (verbatim): "A host must match all criteria to be usable. If no hosts match all of the criteria, then the New Session command will fail. If multiple hosts match all of the criteria, the order in which safaridriver will use them is unspecified, except that booted simulators are used before unbooted simulators. If a simulator host matches the criteria but is not booted, safaridriver will attempt to boot the simulator instance and wait for it to become usable. If Safari is not running on a host that otherwise matches the criteria, safaridriver will automatically launch Safari and wait for it to become usable."
- NOTES: "For security reasons, the HTTP server accepts connections from localhost only. ... Safari on macOS and iOS can only host one WebDriver session at a time, so it is not recommended to run multiple safaridriver instances at the same time."
- Man page: "Unless noted below, the values of requested capability keys are not read and are assumed to be true if present, and false otherwise."

Apple "Testing with WebDriver in Safari" (JSON: https://developer.apple.com/tutorials/data/documentation/webkit/testing-with-webdriver-in-safari.json; page https://developer.apple.com/documentation/webkit/testing-with-webdriver-in-safari):
- "Safari’s executable is located at `/usr/bin/safaridriver`."
- "High Sierra and later: Run `safaridriver --enable` once. (If you’re upgrading from a previous macOS release, you may need to use `sudo`.)"
- Sierra and earlier: Develop menu -> "Choose Develop > Allow Remote Automation." and run `/usr/bin/safaridriver` once for the authentication prompt.
Apple "About WebDriver for Safari" (https://developer.apple.com/documentation/webkit/about-webdriver-for-safari): debugging capabilities `safari:automaticInspection`, `safari:automaticProfiling`; "Only one Safari browser instance can be active at any given time, and only one WebDriver session at a time can be attached to the browser instance." Neither Apple page mentions iOS simulator capabilities.

WebKit blog "WebDriver is Coming to Safari in iOS 13" (Brian Burg, Jul 8, 2019, https://webkit.org/blog/9395/webdriver-is-coming-to-safari-in-ios-13/), verbatim:
- "If you’ve never used safaridriver on macOS before, you’ll first need to run safaridriver --enable and authenticate as an administrator. Then, you must enable Remote Automation on every device that you intend to use for WebDriver. To do this, toggle the setting in Settings → Safari → Advanced → Remote Automation."
- "The most important new capability to use is ‘platformName’: ‘ios’; this tells the driver you want an iOS host instead of a macOS host. ... safaridriver supports running WebDriver tests on iOS Simulator devices whose runtime is iOS 13 or later. To use a simulator for testing, add the capability ‘safari:useSimulator’: true."
- "Lastly, the software keyboard is suppressed when focusing text fields in WebDriver sessions. To simulate text input with WebDriver, use the existing Perform Actions endpoint or Element Send Keys endpoint."
- "simulated input sources include keyboard, mouse, and single-finger touches. The Perform Actions command and Element Click command synthesize touches using mouse inputs. ... Multiple touch input sources (i.e., fingers) are not supported in this release."
- "the Set Window Rect, Minimize Window, and Maximize Window endpoints will return “unsupported operation”."

Whether the Remote Automation toggle must be set inside a *simulator* (vs. physical device): no Apple statement found.

---

## 3. CDP Input.imeSetComposition / Input.insertText; Playwright on Android

Source: https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/browser_protocol.json (devtools-protocol package version 0.0.1716261). Both commands `"experimental": true`.

Input.insertText — description: "This method emulates inserting text that doesn't come from a key press,\nfor example an emoji keyboard or an IME." Parameters:
- `text` (string): "The text to insert."

Input.imeSetComposition — description: "This method sets the current candidate text for IME.\nUse imeCommitComposition to commit the final text.\nUse imeSetComposition with empty string as text to cancel composition." Parameters:
- `text` (string): "The text to insert"
- `selectionStart` (integer): "selection start"
- `selectionEnd` (integer): "selection end"
- `replacementStart` (integer, optional): "replacement start"
- `replacementEnd` (integer, optional): "replacement end"
Fact: the Input domain command list is ['dispatchDragEvent', 'dispatchKeyEvent', 'insertText', 'imeSetComposition', 'dispatchMouseEvent', 'dispatchTouchEvent', 'cancelDragging', 'emulateTouchFromMouseEvent', 'setIgnoreInputEvents', 'setInterceptDrags', 'synthesizePinchGesture', 'synthesizeScrollGesture', 'synthesizeTapGesture'] — there is no `imeCommitComposition` command in this protocol file despite the description referencing it.

Playwright `BrowserType.connectOverCDP` (https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/api/class-browsertype.md): since v1.9; "This method attaches Playwright to an existing browser instance using the Chrome DevTools Protocol."; "Connecting over the Chrome DevTools Protocol is only supported for Chromium-based browsers."; "This connection is significantly lower fidelity than the Playwright protocol connection via BrowserType.connect."; endpointURL e.g. `http://localhost:9222/` or `ws://127.0.0.1:9222/devtools/browser/...`; options headers, isLocal (v1.58), slowMo, timeout (default 30000), noDefaults (v1.60). Usage:
```js
const browser = await playwright.chromium.connectOverCDP('http://localhost:9222');
const defaultContext = browser.contexts()[0];
const page = defaultContext.pages()[0];
```

Playwright `_android` (https://playwright.dev/docs/api/class-android, "Experimental"): "Playwright has experimental support for Android automation. This includes Chrome for Android and Android WebView." Requirements (verbatim): "Android device or AVD Emulator." / "ADB daemon running and authenticated with your device. Typically running adb devices is all you need to do." / "Chrome 105 or newer installed on the device" / "\"Enable command line on non-rooted devices\" enabled in chrome://flags." Known limitations: "Raw USB operation is not yet supported, so you need ADB." / "Device needs to be awake to produce screenshots. Enabling \"Stay awake\" developer mode will help." / "We didn't run all the tests against the device, so not everything works." Usage: `const { _android: android } = require('playwright'); const [device] = await android.devices(); ... await device.shell('am force-stop com.android.chrome'); const context = await device.launchBrowser();` Methods: connect (v1.28), devices, launchServer, setDefaultTimeout.
Export chain (unpkg, v1.64.0): `@playwright/test/index.d.ts`: `export * from 'playwright/test';` -> `playwright/types/test.d.ts` line 19: `export * from 'playwright-core';` -> `playwright-core/types/types.d.ts` line 19449: `export const _android: Android;`.
Latest @playwright/test on npm (npm view, 2026-10-11): 1.64.0. Project package.json: not present in worktree.
Official doc text for `adb forward tcp:9222 localabstract:chrome_devtools_remote`: not found in Chrome docs (https://developer.chrome.com/docs/devtools/remote-debugging/local-server has no such text). Empirically verified on this Mac, see section 4.

---

## 4. Android check (plan risk R8) — executed

Toolchain: Android emulator 36.6.11.0 (build_id 15507667). avdmanager needs Java; no system JRE — used `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`. avdmanager warns: "This version only understands SDK XML versions up to 3 but an SDK XML file of version 4 was encountered." (non-fatal).
Pixel profiles available (`avdmanager list device -c`): pixel, pixel_2, pixel_2_xl, pixel_3, pixel_3_xl, pixel_3a, pixel_3a_xl, pixel_4, pixel_4_xl, pixel_4a, pixel_5, pixel_6, pixel_6_pro, pixel_c, pixel_xl (newest phone profiles: pixel_6, pixel_6_pro).
System image: system-images;android-36;google_apis;arm64-v8a, Pkg.Revision=7, Dependencies emulator#35.4.9.

Steps run:
1. `echo no | avdmanager create avd -n ether -k "system-images;android-36;google_apis;arm64-v8a" -d pixel_6` -> created; config /Users/joelsommerer/.android/avd/ether.avd/config.ini (hw.device.name = pixel_6, hw.lcd.width = 1080, hw.lcd.height = 2400, hw.lcd.density = 420).
2. `emulator -avd ether -no-window -no-audio -no-boot-anim -no-snapshot-save` (log /Users/joelsommerer/DEV/ether/bars/tmp/emulator.log) -> cold boot; serial emulator-5554; sys.boot_completed=1 after ~2 poll cycles (< 1 min after adb came online).
3. Device: Android 16, fingerprint `google/sdk_gphone64_arm64/emu64a:16/BE2A.250530.026.F3/13894323:userdebug/dev-keys`, ro.debuggable=1.
4. `pm list packages | grep -i -E "chrome|webview"` -> package:com.google.android.overlay.googlewebview, package:com.google.android.webview, package:com.android.chrome.
5. Chrome versionName=133.0.6943.137 (versionCode=694313732); WebView versionName=133.0.6943.137.
6. `am start -a android.intent.action.VIEW -d about:blank com.android.chrome` -> top activity `org.chromium.chrome.browser.firstrun.FirstRunActivity`; `adb forward tcp:9222 localabstract:chrome_devtools_remote` OK, but `curl http://localhost:9222/json/version` -> empty / HTTP 000; `/proc/net/unix` had no `@chrome_devtools_remote` socket (only stetho messaging sockets) even after +15 s with Chrome processes running.
7. Wrote `/data/local/tmp/chrome-command-line` = `_ --disable-fre --no-default-browser-check --no-first-run` (on AVD "ether" only; left in place), `am force-stop com.android.chrome`, restarted with the same intent -> top activity `org.chromium.chrome.browser.ChromeTabbedActivity`; socket `@chrome_devtools_remote` present; `curl http://localhost:9222/json/version` -> HTTP 200:
```
{
   "Android-Package": "com.android.chrome",
   "Browser": "Chrome/133.0.6943.137",
   "Protocol-Version": "1.3",
   "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36",
   "V8-Version": "13.3.415.23",
   "WebKit-Version": "537.36 (@49ec12cc413ffec766028509968b31d7d65fa0b7)",
   "webSocketDebuggerUrl": "ws://localhost:9222/devtools/browser"
}
```
8. `adb forward --remove tcp:9222`; `adb -s emulator-5554 emu kill` -> "OK: killing emulator, bye bye"; `adb devices` empty afterwards; no ether qemu process.
Not tested: Playwright connectOverCDP / _android against this device; "Enable command line on non-rooted devices" chrome://flags flag (not touched).

---

## 5. Plan risk R4: Safari iOS opening a local .html from the Files app with JavaScript

Result: inconclusive from official Apple documentation — no Apple documentation page stating either behaviour was found.
Non-official sources (verbatim):
- Apple Community, https://discussions.apple.com/thread/256102223 (Jul 21, 2025, iPhone 12 mini, iOS 18): asker reports the HTML file "opens in Files Preview but lacks JavaScript functionality"; answer by VikingOSX (Jul 22, 2025): "Due to evolving security reasons, you can no longer open an HTML file directly with Safari (or Firefox) in iOS 18.5. Quick Look is as close as you can get and it will not run JavaScript."
- Apple Developer Forums, https://developer.apple.com/forums/thread/710001 (Jul 2022, iPad iOS 15.x): "Apple at some point disabled the ability to open local files in Safari. This means you cannot open an HTML file with relative src references ... You can only "open" or view the file via the Files app on iPad."
- Apple Developer Forums, https://developer.apple.com/forums/thread/86485 (Sep 2017) "Can I run HTML files from the files app?" — 0 replies.
Not empirically tested on the "Ether iPhone 17 Pro" simulator (iOS 26.5).
