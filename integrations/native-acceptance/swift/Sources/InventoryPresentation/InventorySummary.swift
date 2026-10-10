// SPDX-License-Identifier: Apache-2.0
public struct InventorySummary: Sendable, Equatable, CustomStringConvertible {
    public let open: Int
    public let completed: Int
    public init(open: Int, completed: Int) {
        precondition(open >= 0 && completed >= 0)
        self.open = open; self.completed = completed
    }
    public var description: String { "Inventory: \(open) open, \(completed) completed\n" }
}
