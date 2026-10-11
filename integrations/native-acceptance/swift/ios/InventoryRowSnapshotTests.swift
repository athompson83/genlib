// SPDX-License-Identifier: Apache-2.0
// Add to a fixed iOS XCTest host. Record/review each image on that exact runner;
// absent baselines intentionally fail. These tests do not capture fake PNG files.
import XCTest
import SwiftUI
import SnapshotTesting
import InventoryPresentation
@MainActor final class InventoryRowSnapshotTests: XCTestCase {
    private func snapshot(_ state: InventoryViewState, scheme: ColorScheme = .light,
                          size: DynamicTypeSize = .large, name: String,
                          file: StaticString = #filePath, testName: String = #function, line: UInt = #line) {
        let view = InventoryDashboard(state: state, onRetry: {})
            .environment(\.locale, Locale(identifier: "en_US"))
            .environment(\.colorScheme, scheme)
            .environment(\.dynamicTypeSize, size)
        let controller = UIHostingController(rootView: view)
        assertSnapshot(of: controller, as: .image(on: .iPhone13), named: name,
                       record: .never, file: file, testName: testName, line: line)
    }
    func testLight() { snapshot(.ready, name: "light") }
    func testDark() { snapshot(.ready, scheme: .dark, name: "dark") }
    func testLargeText() { snapshot(.ready, size: .accessibility3, name: "large-text") }
    func testLoading() { snapshot(.loading, name: "loading") }
    func testError() { snapshot(.failed, name: "error") }
}
