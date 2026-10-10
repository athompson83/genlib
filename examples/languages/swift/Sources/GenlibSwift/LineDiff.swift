// SPDX-License-Identifier: Apache-2.0
// Deterministic line diff (LCS) and GNU `diff -u` compatible unified output. Lines split on "\n" only (a trailing "\n"
// ends the last line; "\r" stays part of the line) and compare byte-for-byte, not by Swift's canonical String equality.

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

    private struct Lines {
        var bytes: [[UInt8]]
        var finalNewline: Bool
    }

    private static func split(_ text: String) -> Lines {
        let b = Array(text.utf8)
        if b.isEmpty { return Lines(bytes: [], finalNewline: true) }
        var parts = b.split(separator: 0x0A, omittingEmptySubsequences: false).map(Array.init)
        let nl = b.last == 0x0A
        if nl { parts.removeLast() }
        return Lines(bytes: parts, finalNewline: nl)
    }

    private static func str(_ b: [UInt8]) -> String { String(decoding: b, as: UTF8.self) }

    /// (op, line bytes) in order; throws when lines(a) * lines(b) exceeds maxCells.
    private static func ops(_ a: [[UInt8]], _ b: [[UInt8]]) throws -> [(Character, [UInt8])] {
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
        var out: [(Character, [UInt8])] = [], i = 0, j = 0
        while i < n || j < m {
            if i < n && j < m && a[i] == b[j] { out.append(("=", a[i])); i += 1; j += 1 }
            else if j >= m || (i < n && table[i + 1][j] >= table[i][j + 1]) { out.append(("-", a[i])); i += 1 }
            else { out.append(("+", b[j])); j += 1 }
        }
        return out
    }

    /// Line operations from a to b ("=" kept, "-" removed, "+" added).
    public static func diffLines(_ a: String, _ b: String) throws -> [DiffOp] {
        try ops(split(a).bytes, split(b).bytes).map { DiffOp(String($0.0), str($0.1)) }
    }

    private struct Row {
        var op: Character
        var line: [UInt8]
        var ai: Int?
        var bi: Int?
    }

    /// GNU-style unified diff; "" when the texts are identical.
    public static func unifiedDiff(_ aText: String, _ bText: String, fromName: String = "a", toName: String = "b",
                                   context: Int = 3) throws -> String {
        guard context >= 0 else { throw LineDiffError.invalidArgument("context must be >= 0") }
        let la = split(aText), lb = split(bText), a = la.bytes, b = lb.bytes
        var rows: [Row] = [], ai = 0, bi = 0
        for (op, line) in try ops(a, b) {
            switch op {
            case "=": rows.append(Row(op: op, line: line, ai: ai, bi: bi)); ai += 1; bi += 1
            case "-": rows.append(Row(op: op, line: line, ai: ai, bi: nil)); ai += 1
            default: rows.append(Row(op: op, line: line, ai: nil, bi: bi)); bi += 1
            }
        }
        // A last line that differs only by its trailing newline is shown as removed and re-added.
        if la.finalNewline != lb.finalNewline, let last = rows.last, last.op == "=", last.ai == a.count - 1, last.bi == b.count - 1 {
            rows.removeLast()
            rows.append(Row(op: "-", line: last.line, ai: last.ai, bi: nil))
            rows.append(Row(op: "+", line: last.line, ai: nil, bi: last.bi))
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
                out += Array((r.op == "=" ? " " : String(r.op)).utf8) + r.line + [0x0A]
                if r.op != "+", r.ai == a.count - 1, !la.finalNewline, r.op == "-" || lb.finalNewline == la.finalNewline {
                    out += Array("\\ No newline at end of file\n".utf8)
                } else if r.op == "+", r.bi == b.count - 1, !lb.finalNewline {
                    out += Array("\\ No newline at end of file\n".utf8)
                }
            }
        }
        return str(out)
    }
}
