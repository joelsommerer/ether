// iOS input runner of the measurement rig (piece E1-002, ADR 0004).
//
// One long-running UI test that types and taps into Safari on the simulator
// "Ether iPhone 17 Pro" through XCUITest, i.e. through the system's own touch
// and keyboard event path: a tap starts a real text input session and typed
// text arrives as beforeinput/input "insertText" from UIKit.
//
// Protocol (files in ETHER_TYPER_DIR, written by test/rig/drivers/ios.mjs):
//   ready            written once the runner accepts commands
//   cmd-<n>.json     command n: {"op": "tap"|"type"|"key"|"quit", ...}
//   res-<n>.json     answer n:  {"ok": bool, "issues": [String], ...}
// The runner ends after `quit` or when no command arrived for
// ETHER_TYPER_IDLE seconds (default 300), so it never outlives the rig.

import XCTest

final class TyperTests: XCTestCase {
  private var issues: [String] = []

  override func record(_ issue: XCTIssue) {
    issues.append(issue.compactDescription)
  }

  private static let keys: [String: XCUIKeyboardKey] = [
    "Backspace": .delete, "Delete": .forwardDelete, "Enter": .return, "Tab": .tab,
    "Escape": .escape, "ArrowLeft": .leftArrow, "ArrowRight": .rightArrow,
    "ArrowUp": .upArrow, "ArrowDown": .downArrow, "Home": .home, "End": .end,
    "PageUp": .pageUp, "PageDown": .pageDown,
  ]

  private static let mods: [String: XCUIElement.KeyModifierFlags] = [
    "Meta": .command, "Shift": .shift, "Alt": .option, "Control": .control,
  ]

  /// Frames of all text views (editing hosts) in Safari's web view, from one snapshot.
  private func textViewFrames(_ app: XCUIApplication) throws -> [CGRect] {
    var out: [CGRect] = []
    func walk(_ s: XCUIElementSnapshot) {
      if s.elementType == .textView { out.append(s.frame) }
      for c in s.children { walk(c) }
    }
    walk(try app.webViews.firstMatch.snapshot())
    return out
  }

  func testServe() throws {
    continueAfterFailure = true
    let env = ProcessInfo.processInfo.environment
    let dir = URL(fileURLWithPath: env["ETHER_TYPER_DIR"] ?? "/tmp/ether-typer")
    let idle = Double(env["ETHER_TYPER_IDLE"] ?? "") ?? 300
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    try "1".write(to: dir.appendingPathComponent("ready"), atomically: true, encoding: .utf8)
    var seq = 0
    var last = Date()
    while Date().timeIntervalSince(last) < idle {
      let cmdURL = dir.appendingPathComponent("cmd-\(seq).json")
      guard let data = try? Data(contentsOf: cmdURL),
            let cmd = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        usleep(10_000)
        continue
      }
      last = Date()
      issues = []
      var out: [String: Any] = [:]
      let op = cmd["op"] as? String ?? ""
      do {
        switch op {
        case "quit":
          try JSONSerialization.data(withJSONObject: ["ok": true, "issues": []])
            .write(to: dir.appendingPathComponent("res-\(seq).json"))
          return
        case "tap":
          // Tap relative to the editing host the page measured: the text view
          // whose size matches the host's client rect (CSS px = points at scale 1).
          let host = (cmd["host"] as? [Double]) ?? []
          let dx = cmd["dx"] as? Double ?? 0, dy = cmd["dy"] as? Double ?? 0
          guard host.count == 4 else { issues.append("tap: no host rect"); break }
          let frames = try textViewFrames(safari)
          let best = frames.min { a, b in
            abs(a.width - host[2]) + abs(a.height - host[3]) < abs(b.width - host[2]) + abs(b.height - host[3])
          }
          guard let f = best, abs(f.width - host[2]) + abs(f.height - host[3]) < 4 else {
            issues.append("tap: no text view of size \(host[2])x\(host[3]) (found \(frames.map { "\($0.width)x\($0.height)" }))")
            break
          }
          safari.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
            .withOffset(CGVector(dx: f.minX + dx, dy: f.minY + dy)).tap()
          out["at"] = [f.minX + dx, f.minY + dy]
        case "type":
          safari.typeText(cmd["text"] as? String ?? "")
        case "key":
          let name = cmd["key"] as? String ?? ""
          var flags: XCUIElement.KeyModifierFlags = []
          for m in (cmd["mods"] as? [String]) ?? [] {
            guard let f = TyperTests.mods[m] else { issues.append("key: unknown modifier \(m)"); continue }
            flags.insert(f)
          }
          let key = TyperTests.keys[name]?.rawValue ?? name
          if key.count != 1 && TyperTests.keys[name] == nil { issues.append("key: unknown key \(name)") }
          else { safari.typeKey(key, modifierFlags: flags) }
        case "state":
          out["keyboard"] = safari.keyboards.count > 0
        default:
          issues.append("unknown op \(op)")
        }
      } catch {
        issues.append("\(op): \(error)")
      }
      out["ok"] = issues.isEmpty
      out["issues"] = issues
      try JSONSerialization.data(withJSONObject: out).write(to: dir.appendingPathComponent("res-\(seq).json"))
      seq += 1
    }
  }
}
