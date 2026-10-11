// SPDX-License-Identifier: Apache-2.0
import Foundation
import XCTest
import GRDB
@testable import InventoryStore
final class InventoryStoreTests: XCTestCase {
    func testAtomicImportAndCompletion() throws {
        let store = try InventoryStore()
        try store.addAll([(id: "a", title: " One "), (id: "b", title: "Two")])
        try store.complete(id: "a", completed: true)
        XCTAssertTrue(try store.active()[0].completed)
        XCTAssertEqual(try store.active()[0].title, "One")
        XCTAssertThrowsError(try store.addAll([(id: "c", title: "Three"), (id: "d", title: "")]))
        XCTAssertEqual(try store.active().map(\.id), ["a", "b"])
        XCTAssertThrowsError(try store.complete(id: "missing", completed: true))
        try store.archive(id: "a")
        XCTAssertEqual(try store.active().map(\.id), ["b"])
    }
    func testUpgradePreservesVersionOneRows() throws {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).path
        defer { try? FileManager.default.removeItem(atPath: path) }
        do {
            let old = try DatabaseQueue(path: path)
            var migrator = DatabaseMigrator()
            migrator.registerMigration("v1") { db in
                try db.execute(sql: "CREATE TABLE item(id TEXT PRIMARY KEY, title TEXT NOT NULL, completed BOOLEAN NOT NULL DEFAULT 0)")
            }
            try migrator.migrate(old)
            try old.write { db in try db.execute(sql: "INSERT INTO item(id, title) VALUES('legacy', 'Keep me')") }
        }
        let upgraded = try InventoryStore(path: path)
        XCTAssertEqual(try upgraded.active().map(\.title), ["Keep me"])
        XCTAssertFalse(try upgraded.active()[0].archived)
    }
}
