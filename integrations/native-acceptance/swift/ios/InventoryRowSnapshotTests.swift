// SPDX-License-Identifier: Apache-2.0
// Add this file to an iOS XCTest target linked to the package. Record and review
// the first image baseline on the same simulator/runtime used by CI.
import XCTest
import SwiftUI
import SnapshotTesting
import InventoryPresentation
@MainActor final class InventoryRowSnapshotTests: XCTestCase {
    func testCompletedRow() {
        let view = InventoryRow(title: "Ship integration", completed: true)
            .environment(\.locale, Locale(identifier: "en_US"))
            .environment(\.colorScheme, .light)
            .environment(\.sizeCategory, .large)
        let controller = UIHostingController(rootView: view)
        assertSnapshot(of: controller, as: .image(on: .iPhone13), record: .never)
    }
}
