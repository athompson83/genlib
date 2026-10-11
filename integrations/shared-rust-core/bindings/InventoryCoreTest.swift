// SPDX-License-Identifier: Apache-2.0
// Add to the app XCTest target after compiling generated Swift + FFI module map/library.
import XCTest
import InventoryCore
final class InventoryCoreTest: XCTestCase {
    func testCrossLanguageTransition() throws {
        var items = try applyChange(current: [], change: .add(id: "one", title: "  Ship integration  "))
        items = try applyChange(current: items, change: .complete(id: "one", completed: true))
        XCTAssertEqual(items[0].title, "Ship integration")
        XCTAssertTrue(items[0].completed)
        XCTAssertThrowsError(try normalizeTitle(value: " "))
    }
}
