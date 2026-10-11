// SPDX-License-Identifier: Apache-2.0
import XCTest
import SnapshotTesting
@testable import InventoryPresentation
final class InventorySummaryTests: XCTestCase {
    func testSummary() {
        assertSnapshot(of: InventorySummary(open: 2, completed: 1).description, as: .lines, named: "summary", record: .never)
    }
}
