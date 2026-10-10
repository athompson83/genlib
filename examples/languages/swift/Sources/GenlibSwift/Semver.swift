// SPDX-License-Identifier: Apache-2.0
// Semantic Versioning 2.0.0 parsing and precedence, plus npm-style range matching (||, comparators, ^, ~, x-ranges and
// hyphen ranges) desugared the way node-semver does. A prerelease version only matches a comparator set that names a
// prerelease of the same major.minor.patch.

public enum SemverError: Error, Equatable {
    case invalidArgument(String)
}

/// A prerelease identifier: numeric identifiers sort numerically and before alphanumeric ones.
public enum SemverIdentifier: Equatable, Sendable {
    case numeric(UInt64)
    case alphanumeric(String)
}

/// A parsed version. Build metadata is kept but ignored by `Semver.compare`.
public struct SemverVersion: Equatable, Sendable {
    public let major: UInt64, minor: UInt64, patch: UInt64
    public let prerelease: [SemverIdentifier]
    public let build: [String]
}

public enum Semver {
    private static func isDigit(_ c: UInt8) -> Bool { c >= 0x30 && c <= 0x39 }

    private static func numeric(_ s: Substring, _ what: String) throws -> UInt64 {
        let b = Array(s.utf8)
        guard !b.isEmpty, b.allSatisfy(isDigit) else { throw SemverError.invalidArgument("\(what) must be digits: \"\(s)\"") }
        guard b.count == 1 || b[0] != 0x30 else { throw SemverError.invalidArgument("\(what) must not have leading zeros: \"\(s)\"") }
        guard let n = UInt64(s) else { throw SemverError.invalidArgument("\(what) is too large: \"\(s)\"") }
        return n
    }

    private static func identifiers(_ s: Substring, _ what: String) throws -> [Substring] {
        let parts = s.split(separator: ".", omittingEmptySubsequences: false)
        for p in parts {
            guard !p.isEmpty, p.utf8.allSatisfy({ isDigit($0) || ($0 | 0x20 >= 0x61 && $0 | 0x20 <= 0x7A) || $0 == 0x2D }) else {
                throw SemverError.invalidArgument("invalid \(what) identifier: \"\(p)\"")
            }
        }
        return parts
    }

    private static func prerelease(_ s: Substring) throws -> [SemverIdentifier] {
        try identifiers(s, "prerelease").map { p in
            p.utf8.allSatisfy(isDigit) ? .numeric(try numeric(p, "numeric prerelease identifier")) : .alphanumeric(String(p))
        }
    }

    private static func splitOnce(_ s: Substring, _ c: Character) -> (Substring, Substring?) {
        guard let i = s.firstIndex(of: c) else { return (s, nil) }
        return (s[..<i], s[s.index(after: i)...])
    }

    /// Strict SemVer 2.0.0 parse (no `v` prefix, no leading zeros, no whitespace).
    public static func parse(_ text: String) throws -> SemverVersion {
        let (rest, buildText) = splitOnce(Substring(text), "+")
        let build = try buildText.map { try identifiers($0, "build").map(String.init) } ?? []
        let (core, preText) = splitOnce(rest, "-")
        let pre = try preText.map(prerelease) ?? []
        let nums = core.split(separator: ".", omittingEmptySubsequences: false)
        guard nums.count == 3 else { throw SemverError.invalidArgument("version must be MAJOR.MINOR.PATCH: \"\(text)\"") }
        return SemverVersion(major: try numeric(nums[0], "major"), minor: try numeric(nums[1], "minor"),
                             patch: try numeric(nums[2], "patch"), prerelease: pre, build: build)
    }

    private static func order<T: Comparable>(_ a: T, _ b: T) -> Int { a < b ? -1 : (a > b ? 1 : 0) }

    private static func compareIdentifiers(_ a: SemverIdentifier, _ b: SemverIdentifier) -> Int {
        switch (a, b) {
        case let (.numeric(x), .numeric(y)): return order(x, y)
        case (.numeric, .alphanumeric): return -1
        case (.alphanumeric, .numeric): return 1
        case let (.alphanumeric(x), .alphanumeric(y)): return Array(x.utf8).lexicographicallyPrecedes(Array(y.utf8)) ? -1 : (x == y ? 0 : 1)
        }
    }

    static func compareVersions(_ a: SemverVersion, _ b: SemverVersion) -> Int {
        for (x, y) in [(a.major, b.major), (a.minor, b.minor), (a.patch, b.patch)] where x != y { return order(x, y) }
        switch (a.prerelease.isEmpty, b.prerelease.isEmpty) {
        case (true, true): return 0
        case (true, false): return 1
        case (false, true): return -1
        case (false, false):
            for (x, y) in zip(a.prerelease, b.prerelease) {
                let o = compareIdentifiers(x, y)
                if o != 0 { return o }
            }
            return order(a.prerelease.count, b.prerelease.count)
        }
    }

    /// SemVer precedence (spec section 11): -1, 0 or 1. Build metadata is ignored.
    public static func compare(_ a: String, _ b: String) throws -> Int { compareVersions(try parse(a), try parse(b)) }

    private enum Op { case eq, gt, gte, lt, lte }

    private struct Comparator {
        let op: Op
        let version: SemverVersion
        /// The `-0` upper bound produced by desugaring; never admits a prerelease.
        var synthetic = false

        func test(_ v: SemverVersion) -> Bool {
            let o = Semver.compareVersions(v, version)
            switch op {
            case .eq: return o == 0
            case .gt: return o > 0
            case .gte: return o >= 0
            case .lt: return o < 0
            case .lte: return o <= 0
            }
        }
    }

    /// A possibly partial version: nil components are wildcards.
    private struct Partial {
        var major: UInt64?, minor: UInt64?, patch: UInt64?
        var pre: [SemverIdentifier] = []
    }

    private static func parsePartial(_ text: Substring) throws -> Partial {
        let s = text.hasPrefix("v") ? text.dropFirst() : text
        guard !s.isEmpty else { throw SemverError.invalidArgument("empty version in range") }
        let (rest, _) = splitOnce(s, "+")
        let (core, preText) = splitOnce(rest, "-")
        let parts = core.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count <= 3 else { throw SemverError.invalidArgument("too many version components: \"\(s)\"") }
        var nums: [UInt64?] = [nil, nil, nil]
        var wild = false
        for (i, p) in parts.enumerated() {
            if p == "x" || p == "X" || p == "*" {
                wild = true
            } else if wild {
                throw SemverError.invalidArgument("a number cannot follow a wildcard: \"\(s)\"")
            } else {
                nums[i] = try numeric(p, "version component")
            }
        }
        let pre = try preText.map(prerelease) ?? []
        guard pre.isEmpty || nums[2] != nil else { throw SemverError.invalidArgument("a prerelease needs a full version: \"\(s)\"") }
        return Partial(major: nums[0], minor: nums[1], patch: nums[2], pre: pre)
    }

    private static func v(_ major: UInt64, _ minor: UInt64, _ patch: UInt64, _ pre: [SemverIdentifier] = []) -> SemverVersion {
        SemverVersion(major: major, minor: minor, patch: patch, prerelease: pre, build: [])
    }

    private static func inc(_ n: UInt64) throws -> UInt64 {
        guard n < UInt64.max else { throw SemverError.invalidArgument("version component overflow") }
        return n + 1
    }

    /// `< version-0`: the synthetic exclusive upper bound.
    private static func upper(_ major: UInt64, _ minor: UInt64, _ patch: UInt64) -> Comparator {
        Comparator(op: .lt, version: v(major, minor, patch, [.numeric(0)]), synthetic: true)
    }

    /// Desugars one comparator token (operator attached) into primitive comparators.
    private static func desugar(_ token: Substring, into out: inout [Comparator]) throws {
        let kind = ["~>", ">=", "<=", "^", "~", ">", "<", "="].first { token.hasPrefix($0) } ?? ""
        let p = try parsePartial(token.dropFirst(kind.count))
        // A wildcard major (*, x, ^*, >=*, ...) matches every release; >* and <* match nothing.
        guard let major = p.major else {
            if kind == ">" || kind == "<" { out.append(upper(0, 0, 0)) }
            return
        }
        switch kind {
        case "^":
            if let minor = p.minor, let patch = p.patch {
                out.append(Comparator(op: .gte, version: v(major, minor, patch, p.pre)))
                out.append(major > 0 ? upper(try inc(major), 0, 0) : minor > 0 ? upper(0, try inc(minor), 0) : upper(0, 0, try inc(patch)))
            } else if let minor = p.minor {
                out.append(Comparator(op: .gte, version: v(major, minor, 0)))
                out.append(major > 0 ? upper(try inc(major), 0, 0) : upper(0, try inc(minor), 0))
            } else {
                out.append(Comparator(op: .gte, version: v(major, 0, 0)))
                out.append(upper(try inc(major), 0, 0))
            }
        case "~", "~>":
            if let minor = p.minor {
                out.append(Comparator(op: .gte, version: v(major, minor, p.patch ?? 0, p.pre)))
                out.append(upper(major, try inc(minor), 0))
            } else {
                out.append(Comparator(op: .gte, version: v(major, 0, 0)))
                out.append(upper(try inc(major), 0, 0))
            }
        case "", "=":
            if let minor = p.minor, let patch = p.patch {
                out.append(Comparator(op: .eq, version: v(major, minor, patch, p.pre)))
            } else if let minor = p.minor {
                out.append(Comparator(op: .gte, version: v(major, minor, 0)))
                out.append(upper(major, try inc(minor), 0))
            } else {
                out.append(Comparator(op: .gte, version: v(major, 0, 0)))
                out.append(upper(try inc(major), 0, 0))
            }
        case ">":
            if let minor = p.minor, let patch = p.patch {
                out.append(Comparator(op: .gt, version: v(major, minor, patch, p.pre)))
            } else if let minor = p.minor {
                out.append(Comparator(op: .gte, version: v(major, try inc(minor), 0)))
            } else {
                out.append(Comparator(op: .gte, version: v(try inc(major), 0, 0)))
            }
        case ">=":
            out.append(Comparator(op: .gte, version: v(major, p.minor ?? 0, p.patch ?? 0, p.pre)))
        case "<":
            if let minor = p.minor, let patch = p.patch {
                out.append(Comparator(op: .lt, version: v(major, minor, patch, p.pre)))
            } else {
                out.append(upper(major, p.minor ?? 0, 0))
            }
        default: // "<="
            if let minor = p.minor, let patch = p.patch {
                out.append(Comparator(op: .lte, version: v(major, minor, patch, p.pre)))
            } else if let minor = p.minor {
                out.append(upper(major, try inc(minor), 0))
            } else {
                out.append(upper(try inc(major), 0, 0))
            }
        }
    }

    private static func parseSet(_ set: Substring) throws -> [Comparator] {
        let tokens = set.split(whereSeparator: { $0 == " " || $0 == "\t" })
        var out: [Comparator] = []
        if tokens.count == 3 && tokens[1] == "-" {
            let lo = try parsePartial(tokens[0]), hi = try parsePartial(tokens[2])
            if let major = lo.major { out.append(Comparator(op: .gte, version: v(major, lo.minor ?? 0, lo.patch ?? 0, lo.pre))) }
            if let major = hi.major {
                if let minor = hi.minor, let patch = hi.patch {
                    out.append(Comparator(op: .lte, version: v(major, minor, patch, hi.pre)))
                } else if let minor = hi.minor {
                    out.append(upper(major, try inc(minor), 0))
                } else {
                    out.append(upper(try inc(major), 0, 0))
                }
            }
            return out
        }
        let operators: Set<Substring> = [">", ">=", "<", "<=", "=", "^", "~", "~>"]
        var i = 0
        while i < tokens.count {
            let t = tokens[i]
            guard t != "-" else { throw SemverError.invalidArgument("a hyphen range must be exactly `A - B`") }
            if operators.contains(t) { // a detached operator such as `>= 1.2.3`
                guard i + 1 < tokens.count else { throw SemverError.invalidArgument("operator \(t) has no version") }
                try desugar(t + tokens[i + 1], into: &out)
                i += 2
            } else {
                try desugar(t, into: &out)
                i += 1
            }
        }
        return out
    }

    /// Whether `version` satisfies the npm-style `range`.
    public static func satisfies(_ version: String, _ range: String) throws -> Bool {
        let ver = try parse(version)
        var sets: [[Comparator]] = []
        var start = range.startIndex, i = range.startIndex
        while i < range.endIndex {
            let next = range.index(after: i)
            if range[i] == "|" && next < range.endIndex && range[next] == "|" {
                sets.append(try parseSet(range[start..<i]))
                i = range.index(after: next)
                start = i
            } else {
                i = next
            }
        }
        sets.append(try parseSet(range[start...]))
        return sets.contains { set in
            set.allSatisfy { $0.test(ver) } && (ver.prerelease.isEmpty || set.contains { c in
                !c.synthetic && !c.version.prerelease.isEmpty
                    && (c.version.major, c.version.minor, c.version.patch) == (ver.major, ver.minor, ver.patch)
            })
        }
    }
}
