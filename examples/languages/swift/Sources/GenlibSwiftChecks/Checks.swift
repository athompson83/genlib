// SPDX-License-Identifier: Apache-2.0
// Minimal dependency-free check harness (no XCTest needed, so it runs with `swift run` on macOS and Linux).

struct Checks {
    var passed = 0, failed = 0

    mutating func check(_ name: String, _ condition: Bool) {
        if condition { passed += 1 } else { failed += 1; print("FAIL: \(name)") }
    }

    mutating func eq<T: Equatable>(_ name: String, _ expected: T, _ actual: @autoclosure () throws -> T) {
        do {
            let value = try actual()
            if value != expected { print("  expected <\(expected)> got <\(value)>") }
            check(name, value == expected)
        } catch {
            print("  unexpected error: \(error)")
            check(name, false)
        }
    }

    mutating func throwsError(_ name: String, _ body: () throws -> Void, where predicate: (Error) -> Bool = { _ in true }) {
        do { try body(); check("\(name) (no error)", false) } catch { check(name, predicate(error)) }
    }
}
