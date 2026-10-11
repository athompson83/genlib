// SPDX-License-Identifier: Apache-2.0
// Glob matching for "/"-separated paths: "*", "?" and "[...]" never cross "/", a whole-segment "**" matches zero or more
// segments, "{a,b}" alternatives (no nesting), backslash escapes. Segments starting with "." match only a pattern segment
// starting with a literal "." unless dot is true. Case-sensitive; "?" is one Unicode scalar. Memoized, so no blowup.

public enum GlobMatchError: Error, Equatable {
    case invalidPattern(String)
}

public enum GlobMatch {
    private static let bs: UInt32 = 0x5C, star: UInt32 = 0x2A, qm: UInt32 = 0x3F, lb: UInt32 = 0x5B, rb: UInt32 = 0x5D
    private static let dotc: UInt32 = 0x2E, slash: UInt32 = 0x2F

    private static func fail(_ m: String) -> GlobMatchError { .invalidPattern(m) }

    private static func expand(_ p: [UInt32]) throws -> [[UInt32]] {
        var i = -1, k = 0
        while k < p.count {
            if p[k] == bs { k += 2; continue }
            if p[k] == 0x7B { i = k; break }
            if p[k] == 0x7D { throw fail("unmatched }") }
            k += 1
        }
        if i < 0 { return [p] }
        var j = i + 1, parts: [[UInt32]] = [], cur: [UInt32] = [], closed = false
        while j < p.count {
            let c = p[j]
            if c == bs { cur += p[j..<min(j + 2, p.count)]; j += 2; continue }
            if c == 0x7B { throw fail("nested braces are not supported") }
            if c == 0x2C { parts.append(cur); cur = []; j += 1; continue }
            if c == 0x7D { parts.append(cur); closed = true; break }
            cur.append(c); j += 1
        }
        guard closed else { throw fail("unterminated {") }
        var out: [[UInt32]] = []
        for alt in parts { out += try expand(Array(p[..<i]) + alt + Array(p[(j + 1)...])) }
        return out
    }

    private static func segMatch(_ pat: [UInt32], _ s: [UInt32], _ dot: Bool) throws -> Bool {
        if !dot && s.first == dotc {
            let literal = pat.first == dotc || (pat.count > 1 && pat[0] == bs && pat[1] == dotc)
            if !literal { return false }
        }
        var memo: [Int: Bool] = [:]
        func m(_ pi0: Int, _ si0: Int) throws -> Bool {
            let key = pi0 * (s.count + 1) + si0
            if let hit = memo[key] { return hit }
            let r = try step(pi0, si0)
            memo[key] = r
            return r
        }
        func step(_ pi0: Int, _ si0: Int) throws -> Bool {
            var pi = pi0, si = si0
            while pi < pat.count {
                var c = pat[pi]
                if c == star {
                    while pi < pat.count && pat[pi] == star { pi += 1 }
                    if pi == pat.count { return true }
                    for k in si...s.count where try m(pi, k) { return true }
                    return false
                }
                if si >= s.count { return false }
                if c == qm { pi += 1; si += 1; continue }
                if c == lb {
                    var j = pi + 1, neg = false
                    if j < pat.count && (pat[j] == 0x21 || pat[j] == 0x5E) { neg = true; j += 1 }
                    var items: [(UInt32, UInt32)] = [], first = true
                    while true {
                        if j >= pat.count { throw fail("unterminated [") }
                        if pat[j] == rb && !first { break }
                        first = false
                        var a = pat[j]
                        if a == bs && j + 1 < pat.count { j += 1; a = pat[j] }
                        if j + 2 < pat.count && pat[j + 1] == 0x2D && pat[j + 2] != rb {
                            var b = pat[j + 2]
                            if b == bs && j + 3 < pat.count { j += 1; b = pat[j + 2] }
                            items.append((a, b)); j += 3
                        } else { items.append((a, a)); j += 1 }
                    }
                    let ch = s[si]
                    if items.contains(where: { $0.0 <= ch && ch <= $0.1 }) == neg { return false }
                    pi = j + 1; si += 1; continue
                }
                if c == bs {
                    if pi + 1 >= pat.count { throw fail("trailing backslash") }
                    c = pat[pi + 1]; pi += 1
                }
                if s[si] != c { return false }
                pi += 1; si += 1
            }
            return si == s.count
        }
        return try m(0, 0)
    }

    private static func splitSegments(_ p: [UInt32]) -> [[UInt32]] {
        var segs: [[UInt32]] = [], cur: [UInt32] = [], k = 0
        while k < p.count {
            if p[k] == bs && k + 1 < p.count { cur += [p[k], p[k + 1]]; k += 2; continue }
            if p[k] == slash { segs.append(cur); cur = []; k += 1; continue }
            cur.append(p[k]); k += 1
        }
        segs.append(cur)
        return segs
    }

    private static func matchOne(_ pattern: [UInt32], _ path: [UInt32], _ dot: Bool) throws -> Bool {
        let ps = splitSegments(pattern)
        let ss = path.split(separator: slash, omittingEmptySubsequences: false).map(Array.init)
        var memo: [Int: Bool] = [:]
        func m(_ i: Int, _ j: Int) throws -> Bool {
            if i == ps.count { return j == ss.count }
            let key = i * (ss.count + 1) + j
            if let hit = memo[key] { return hit }
            var r = false
            if ps[i] == [star, star] {
                for k in j...ss.count {
                    if k > j && !dot && ss[k - 1].first == dotc { break }
                    if try m(i + 1, k) { r = true; break }
                }
            } else {
                r = try j < ss.count && segMatch(ps[i], ss[j], dot) && m(i + 1, j + 1)
            }
            memo[key] = r
            return r
        }
        return try m(0, 0)
    }

    private static func validate(_ p: [UInt32]) throws {
        if p.isEmpty { throw fail("empty pattern") }
        if p.reversed().prefix(while: { $0 == bs }).count % 2 == 1 { throw fail("trailing backslash") }
        var k = 0
        while k < p.count {
            if p[k] == bs { k += 2; continue }
            if p[k] == lb {
                var j = k + 1
                if j < p.count && (p[j] == 0x21 || p[j] == 0x5E) { j += 1 }
                if j < p.count && p[j] == rb { j += 1 }
                while j < p.count && p[j] != rb { j += p[j] == bs ? 2 : 1 }
                if j >= p.count { throw fail("unterminated [") }
                k = j
            }
            k += 1
        }
    }

    /// True when path matches the glob pattern; hidden segments need dot. Throws GlobMatchError on a bad pattern.
    public static func matches(_ pattern: String, _ path: String, dot: Bool = false) throws -> Bool {
        let p = codePoints(pattern)
        try validate(p)
        let s = codePoints(path)
        for alt in try expand(p) where try matchOne(alt, s, dot) { return true }
        return false
    }

    /// The paths that match pattern, in input order.
    public static func filter(_ pattern: String, _ paths: [String], dot: Bool = false) throws -> [String] {
        try paths.filter { try matches(pattern, $0, dot: dot) }
    }
}
