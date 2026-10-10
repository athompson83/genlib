// SPDX-License-Identifier: Apache-2.0
// Deterministic line diff (LCS) and unified output: a valid unified diff (patch reproduces the new text); same format as
// GNU diff -u, which may pick a different alignment of equal size. Lines split on "\n" only (a trailing "\n" ends the
// last line; "\r" stays part of the line) and compare byte-for-byte, not by Swift's canonical String equality. The last
// line of a text without a trailing "\n" only equals another last line without one.

public enum LineDiffError: Error, Equatable {
    case invalidArgument(String)
}

public struct DiffOp: Equatable, CustomStringConvertible {
    public var op: String  // "=", "-" or "+"
    public var line: String
    public init(_ op: String, _ line: String) { self.op = op; self.line = line }
    public var description: String { "\(op)\(line)" }
}

public enum LineDiff {
    public static let maxCells = 4_000_000

    /// One line without its "\n"; noEol marks the last line of a text that does not end in "\n".
    private struct Line: Equatable {
        var bytes: [UInt8]
        var noEol: Bool
    }

    private static func split(_ text: String) -> [Line] {
        let b = Array(text.utf8)
        if b.isEmpty { return [] }
        var parts = b.split(separator: 0x0A, omittingEmptySubsequences: false).map { Line(bytes: Array($0), noEol: false) }
        if b.last == 0x0A { parts.removeLast() } else { parts[parts.count - 1].noEol = true }
        return parts
    }

    private static func str(_ b: [UInt8]) -> String { String(decoding: b, as: UTF8.self) }

    /// (op, line) in order; throws when lines(a) * lines(b) exceeds maxCells.
    private static func ops(_ a: [Line], _ b: [Line]) throws -> [(Character, Line)] {
        let n = a.count, m = b.count
        guard n * m <= maxCells else { throw LineDiffError.invalidArgument("inputs too large to diff (\(n) x \(m) lines)") }
        var table = Array(repeating: Array(repeating: 0, count: m + 1), count: n + 1)
        if n > 0 && m > 0 {
            for i in stride(from: n - 1, through: 0, by: -1) {
                for j in stride(from: m - 1, through: 0, by: -1) {
                    table[i][j] = a[i] == b[j] ? table[i + 1][j + 1] + 1 : max(table[i + 1][j], table[i][j + 1])
                }
            }
        }
        var out: [(Character, Line)] = [], i = 0, j = 0
        while i < n || j < m {
            if i < n && j < m && a[i] == b[j] { out.append(("=", a[i])); i += 1; j += 1 }
            else if j >= m || (i < n && table[i + 1][j] >= table[i][j + 1]) { out.append(("-", a[i])); i += 1 }
            else { out.append(("+", b[j])); j += 1 }
        }
        return out
    }

    /// Line operations from a to b ("=" kept, "-" removed, "+" added).
    public static func diffLines(_ a: String, _ b: String) throws -> [DiffOp] {
        try ops(split(a), split(b)).map { DiffOp(String($0.0), str($0.1.bytes)) }
    }

    private struct Row {
        var op: Character
        var line: Line
        var ai: Int?
        var bi: Int?
    }

    /// Valid unified diff (patch reproduces the new text); same format as GNU diff -u, which may pick a different
    /// alignment of equal size. "" when the texts are identical.
    public static func unifiedDiff(_ aText: String, _ bText: String, fromName: String = "a", toName: String = "b",
                                   context: Int = 3) throws -> String {
        guard context >= 0 else { throw LineDiffError.invalidArgument("context must be >= 0") }
        let a = split(aText), b = split(bText)
        var rows: [Row] = [], ai = 0, bi = 0
        for (op, line) in try ops(a, b) {
            switch op {
            case "=": rows.append(Row(op: op, line: line, ai: ai, bi: bi)); ai += 1; bi += 1
            case "-": rows.append(Row(op: op, line: line, ai: ai, bi: nil)); ai += 1
            default: rows.append(Row(op: op, line: line, ai: nil, bi: bi)); bi += 1
            }
        }
        let changes = rows.indices.filter { rows[$0].op != "=" }
        guard let firstChange = changes.first else { return "" }
        var hunks: [(Int, Int)] = [], start = firstChange, end = firstChange
        for k in changes.dropFirst() {
            if k - end - 1 <= 2 * context { end = k } else { hunks.append((start, end)); start = k; end = k }
        }
        hunks.append((start, end))
        var out: [UInt8] = Array("--- \(fromName)\n+++ \(toName)\n".utf8)
        for (hs, he) in hunks {
            let s = max(0, hs - context), e = min(rows.count - 1, he + context)
            let seg = rows[s...e]
            func range(_ side: Character, _ index: (Row) -> Int?) -> String {
                let lines = seg.filter { $0.op != side }
                if lines.isEmpty { return "\(rows[..<s].filter { $0.op != side }.count),0" }
                let first = index(lines[lines.startIndex])! + 1
                return lines.count == 1 ? "\(first)" : "\(first),\(lines.count)"
            }
            out += Array("@@ -\(range("+", { $0.ai })) +\(range("-", { $0.bi })) @@\n".utf8)
            for r in seg {
                out += Array((r.op == "=" ? " " : String(r.op)).utf8) + r.line.bytes + [0x0A]
                if r.line.noEol { out += Array("\\ No newline at end of file\n".utf8) }
            }
        }
        return str(out)
    }
}
