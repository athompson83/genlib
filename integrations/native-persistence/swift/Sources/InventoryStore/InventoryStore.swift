// SPDX-License-Identifier: Apache-2.0
import Foundation
import GRDB

public struct InventoryItem: Codable, FetchableRecord, PersistableRecord, Sendable, Equatable {
    public static let databaseTableName = "item"
    public var id: String
    public var title: String
    public var completed: Bool
    public var archived: Bool
}
public enum StoreError: Error { case invalidItem, missingItem }
// All SQL executes through GRDB's serialized DatabaseQueue. The UI owns actor/queue scheduling.
public final class InventoryStore {
    private let writer: DatabaseQueue
    public init(path: String? = nil) throws {
        writer = try path.map { try DatabaseQueue(path: $0) } ?? DatabaseQueue()
        var migrator = DatabaseMigrator()
        migrator.registerMigration("v1") { db in
            try db.create(table: "item") { t in
                t.column("id", .text).primaryKey()
                t.column("title", .text).notNull()
                t.column("completed", .boolean).notNull().defaults(to: false)
            }
        }
        migrator.registerMigration("v2") { db in
            try db.alter(table: "item") { t in t.add(column: "archived", .boolean).notNull().defaults(to: false) }
        }
        try migrator.migrate(writer)
    }
    public func active() throws -> [InventoryItem] {
        try writer.read { db in try InventoryItem.fetchAll(db, sql: "SELECT * FROM item WHERE archived = 0 ORDER BY id") }
    }
    public func addAll(_ rows: [(id: String, title: String)]) throws {
        try writer.write { db in
            for row in rows {
                let title = row.title.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !row.id.isEmpty, (1...200).contains(title.count) else { throw StoreError.invalidItem }
                try InventoryItem(id: row.id, title: title, completed: false, archived: false).insert(db)
            }
        }
    }
    public func complete(id: String, completed: Bool) throws {
        try writer.write { db in
            guard try InventoryItem.fetchOne(db, key: id) != nil else { throw StoreError.missingItem }
            try db.execute(sql: "UPDATE item SET completed = ? WHERE id = ?", arguments: [completed, id])
        }
    }
    public func archive(id: String) throws {
        try writer.write { db in try db.execute(sql: "UPDATE item SET archived = 1 WHERE id = ?", arguments: [id]) }
    }
}
