// Host app of the UI test bundle. XCUITest needs a target application; the
// runner itself only drives Safari (com.apple.mobilesafari).
import SwiftUI

@main
struct TyperHostApp: App {
  var body: some Scene { WindowGroup { Text("Ether rig input runner") } }
}
