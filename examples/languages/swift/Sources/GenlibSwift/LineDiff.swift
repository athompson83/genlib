// SPDX-License-Identifier: Apache-2.0
// Line diff and unified output. The result is a valid unified diff (patch reproduces the new text) and minimal (a
// shortest edit script). It usually equals GNU diff -u (about 95% of small random inputs) but that is not guaranteed.
// Algorithm: lines that occur nowhere in the other text are marked changed; Myers' linear-space middle-snake recursion
// (O((N+M)·D) time, O(N+M) memory) runs on the rest; runs of changes are then slid down and aligned with changes in the
// other text. Inputs with more than 1,000,000 lines in total are rejected.
// Lines split on "\n" only (a trailing "\n" ends the last line; "\r" stays part of the line) and compare byte-for-byte,
// not by Swift's canonical String equality. The last line of a text without a trailing "\n" only equals another last
// line without one.

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
    /// Maximum total number of lines (old + new) accepted.
    public static let maxLines = 1_000_000

    /// One line without its "\n"; noEol marks the last line of a text that does not end in "\n".
    private struct Line: Hashable {
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

    /// A middle snake (x, y) -> (u, v) of the box a[a0..<a1] x b[b0..<b1].
    private static func middleSnake(_ a: [Int], _ b: [Int], _ a0: Int, _ a1: Int, _ b0: Int, _ b1: Int) -> (Int, Int, Int, Int) {
        let n = a1 - a0, m = b1 - b0
        let delta = n - m, odd = (delta & 1) != 0, off = n + m + 1
        // vf[off + k]: furthest x on diagonal k (x - y = k); vb the same on the reversed sequences.
        var vf = [Int](repeating: 0, count: 2 * off + 1), vb = [Int](repeating: 0, count: 2 * off + 1)
        for d in 0...((n + m + 1) / 2) {
            var k = -d
            while k <= d {  // forward
                var x = (k == -d || (k != d && vf[off + k - 1] < vf[off + k + 1])) ? vf[off + k + 1] : vf[off + k - 1] + 1
                var y = x - k
                let sx = x, sy = y
                while x < n && y < m && a[a0 + x] == b[b0 + y] { x += 1; y += 1 }
                vf[off + k] = x
                if odd && delta - (d - 1) <= k && k <= delta + (d - 1) && x + vb[off + delta - k] >= n {
                    return (a0 + sx, b0 + sy, a0 + x, b0 + y)
                }
                k += 2
            }
            k = -d
            while k <= d {  // backward, on the reversed sequences
                var x = (k == -d || (k != d && vb[off + k - 1] < vb[off + k + 1])) ? vb[off + k + 1] : vb[off + k - 1] + 1
                var y = x - k
                let sx = x, sy = y
                while x < n && y < m && a[a1 - 1 - x] == b[b1 - 1 - y] { x += 1; y += 1 }
                vb[off + k] = x
                if !odd && -d <= delta - k && delta - k <= d && x + vf[off + delta - k] >= n {
                    return (a1 - x, b1 - y, a1 - sx, b1 - sy)
                }
                k += 2
            }
        }
        preconditionFailure("no middle snake")
    }

    private static func compare(_ a: [Int], _ b: [Int], _ a0In: Int, _ a1In: Int, _ b0In: Int, _ b1In: Int,
                                _ ca: inout [Bool], _ cb: inout [Bool]) {
        var a0 = a0In, a1 = a1In, b0 = b0In, b1 = b1In
        while a0 < a1 && b0 < b1 && a[a0] == b[b0] { a0 += 1; b0 += 1 }
        while a1 > a0 && b1 > b0 && a[a1 - 1] == b[b1 - 1] { a1 -= 1; b1 -= 1 }
        if a0 == a1 {
            for j in stride(from: b0, to: b1, by: 1) { cb[j] = true }
            return
        }
        if b0 == b1 {
            for i in stride(from: a0, to: a1, by: 1) { ca[i] = true }
            return
        }
        let (x, y, u, v) = middleSnake(a, b, a0, a1, b0, b1)
        compare(a, b, a0, x, b0, y, &ca, &cb)
        compare(a, b, u, a1, v, b1, &ca, &cb)
    }

    /// Moves each run of changed lines down while the line after it equals its first line.
    private static func slide(_ lines: [Int], _ changed: inout [Bool]) {
        var i = 0
        let n = lines.count
        while i < n {
            if !changed[i] { i += 1; continue }
            var j = i
            while j < n && changed[j] { j += 1 }
            while j < n && lines[i] == lines[j] {
                changed[i] = false; changed[j] = true; i += 1; j += 1
                while j < n && changed[j] { j += 1 }  // merged with the next run
            }
            i = j
        }
    }

    /// Equal line pairs (i, j) in order.
    private static func pairs(_ ca: [Bool], _ cb: [Bool]) -> [(Int, Int)] {
        var out: [(Int, Int)] = [], i = 0, j = 0
        while i < ca.count || j < cb.count {
            if i < ca.count && ca[i] { i += 1 }
            else if j < cb.count && cb[j] { j += 1 }
            else { out.append((i, j)); i += 1; j += 1 }
        }
        return out
    }

    /// One bottom-up pass: slides a run of changed x lines up through equal lines (into gaps with no changed x lines)
    /// when that places it next to changed lines of the other file, so the hunk shows a replacement instead of a
    /// deletion and an insertion apart.
    private static func align(_ x: [Int], _ cx: inout [Bool], _ cy: [Bool], swap: Bool) {
        let e = swap ? pairs(cy, cx).map { ($0.1, $0.0) } : pairs(cx, cy)
        let xb = [-1] + e.map { $0.0 }               // xb[g]: x index of the pair above gap g
        let yb = [-1] + e.map { $0.1 } + [cy.count]  // gap g holds other-file lines yb[g]+1 ..< yb[g+1]
        let xe = e.map { $0.0 } + [cx.count]         // gap g holds x lines xb[g]+1 ..< xe[g]
        var g = e.count
        while g >= 1 {
            let x0 = xb[g] + 1, x1 = xe[g]
            if x1 > x0 && yb[g + 1] - yb[g] == 1 {  // a run of x changes with no other-file change beside it
                var h = g, top = x0, last = x1 - 1
                while h >= 1 && xb[h] == top - 1 && x[top - 1] == x[last] {
                    h -= 1; top -= 1; last -= 1  // the run now sits in gap h
                    if yb[h + 1] - yb[h] > 1 {   // other-file changes here: move the run
                        for k in stride(from: top, to: x0, by: 1) { cx[k] = true }
                        for k in stride(from: last + 1, to: x1, by: 1) { cx[k] = false }
                        g = h
                        break
                    }
                    if h >= 1 && xe[h] - xb[h] > 1 { break }  // would merge with another x run
                }
            }
            g -= 1
        }
    }

    /// (op, line) in order; throws when the texts hold more than maxLines lines in total.
    private static func ops(_ a: [Line], _ b: [Line]) throws -> [(Character, Line)] {
        guard a.count + b.count <= maxLines else {
            throw LineDiffError.invalidArgument("diff input too large (more than 1,000,000 lines)")
        }
        // Intern lines as integers so every later comparison is O(1).
        var ids: [Line: Int] = [:]
        func intern(_ l: Line) -> Int {
            if let id = ids[l] { return id }
            let id = ids.count
            ids[l] = id
            return id
        }
        let ia = a.map(intern), ib = b.map(intern)
        let inA = Set(ia), inB = Set(ib)
        // A line that never occurs in the other text is in no common subsequence: mark it changed and run Myers only
        // on the remaining lines (the result stays minimal).
        var ca = ia.map { !inB.contains($0) }, cb = ib.map { !inA.contains($0) }
        let ka = ia.indices.filter { !ca[$0] }, kb = ib.indices.filter { !cb[$0] }
        let fa = ka.map { ia[$0] }, fb = kb.map { ib[$0] }
        var sa = [Bool](repeating: false, count: fa.count), sb = [Bool](repeating: false, count: fb.count)
        compare(fa, fb, 0, fa.count, 0, fb.count, &sa, &sb)
        for (k, i) in ka.enumerated() { ca[i] = sa[k] }
        for (k, j) in kb.enumerated() { cb[j] = sb[k] }
        slide(ia, &ca); slide(ib, &cb)
        align(ia, &ca, cb, swap: false); align(ib, &cb, ca, swap: true)
        var out: [(Character, Line)] = [], i = 0, j = 0
        out.reserveCapacity(max(a.count, b.count))
        while i < a.count || j < b.count {
            if i < a.count && ca[i] { out.append(("-", a[i])); i += 1 }
            else if j < b.count && cb[j] { out.append(("+", b[j])); j += 1 }
            else { out.append(("=", a[i])); i += 1; j += 1 }
        }
        return out
    }

    /// Line operations from a to b ("=" kept, "-" removed, "+" added).
    public static func diffLines(_ a: String, _ b: String) throws -> [DiffOp] {
        try ops(split(a), split(b)).map { DiffOp(String($0.0), str($0.1.bytes)) }
    }

    /// Valid, minimal unified diff (patch reproduces the new text); "" when the texts are identical.
    public static func unifiedDiff(_ aText: String, _ bText: String, fromName: String = "a", toName: String = "b",
                                   context: Int = 3) throws -> String {
        guard context >= 0 else { throw LineDiffError.invalidArgument("context must be >= 0") }
        let rows = try ops(split(aText), split(bText))
        let changes = rows.indices.filter { rows[$0].0 != "=" }
        guard let firstChange = changes.first else { return "" }
        var hunks: [(Int, Int)] = [], start = firstChange, end = firstChange
        for k in changes.dropFirst() {
            if k - end - 1 <= 2 * context { end = k } else { hunks.append((start, end)); start = k; end = k }
        }
        hunks.append((start, end))
        // aBefore[k] / bBefore[k]: old / new lines in rows[..<k].
        var aBefore = [0], bBefore = [0]
        aBefore.reserveCapacity(rows.count + 1); bBefore.reserveCapacity(rows.count + 1)
        for r in rows {
            aBefore.append(aBefore[aBefore.count - 1] + (r.0 != "+" ? 1 : 0))
            bBefore.append(bBefore[bBefore.count - 1] + (r.0 != "-" ? 1 : 0))
        }
        func range(_ before: [Int], _ s: Int, _ e: Int) -> String {
            let first = before[s], count = before[e + 1] - before[s]
            if count == 0 { return "\(first),0" }
            return count == 1 ? "\(first + 1)" : "\(first + 1),\(count)"
        }
        var out: [UInt8] = Array("--- \(fromName)\n+++ \(toName)\n".utf8)
        for (hs, he) in hunks {
            let s = max(0, hs - context), e = min(rows.count - 1, he + context)
            out += Array("@@ -\(range(aBefore, s, e)) +\(range(bBefore, s, e)) @@\n".utf8)
            for (op, line) in rows[s...e] {
                out.append(op == "=" ? 0x20 : (op == "-" ? 0x2D : 0x2B))
                out += line.bytes
                out.append(0x0A)
                if line.noEol { out += Array("\\ No newline at end of file\n".utf8) }
            }
        }
        return str(out)
    }
}
