// SPDX-License-Identifier: Apache-2.0
// Cache-Control (RFC 9111): parse into ordered (directive, value) pairs, format back, compute freshness seconds. Names are
// lowercased and the first occurrence wins; delta-seconds directives must be ASCII digits (quoted digits accepted) and
// become .seconds (values beyond Int are dropped); invalid ones are dropped; unparseable items are skipped to the next comma.

public enum CacheControlError: Error, Equatable {
    case invalid(String)
}

public enum CacheControl {
    /// A directive value: .flag for a bare directive, .seconds for delta-seconds directives, .text otherwise.
    public enum Value: Equatable {
        case flag
        case seconds(Int)
        case text(String)
    }

    private static let delta: Set<String> = ["max-age", "s-maxage", "stale-while-revalidate", "stale-if-error", "max-stale", "min-fresh"]

    /// Parses a Cache-Control value into ordered (name, value) pairs; throws on an unterminated quote.
    public static func parse(_ value: String) throws -> [(name: String, value: Value)] {
        let s = codePoints(value), n = s.count
        var out: [(name: String, value: Value)] = [], i = 0
        func nextComma(_ from: Int) -> Int { s[from...].firstIndex(of: 0x2C) ?? n }
        while i < n {
            while i < n && (s[i] == 0x20 || s[i] == 0x09 || s[i] == 0x2C) { i += 1 }
            if i >= n { break }
            let t = tokenEnd(s, i)
            if t == i { i = nextComma(i); continue }
            let name = fromCodePoints(asciiLower(s[i..<t]))
            i = t
            var val = Value.flag
            while i < n && (s[i] == 0x20 || s[i] == 0x09) { i += 1 }
            if i < n && s[i] == 0x3D {
                i += 1
                while i < n && (s[i] == 0x20 || s[i] == 0x09) { i += 1 }
                if i < n && s[i] == 0x22 {
                    guard let (q, next) = readQuoted(s, i + 1) else { throw CacheControlError.invalid("unterminated quote") }
                    val = .text(q); i = next
                } else {
                    let e = tokenEnd(s, i)
                    val = .text(fromCodePoints(s[i..<e])); i = e
                }
            }
            i = nextComma(i)
            if delta.contains(name) {
                if case .flag = val, name != "max-stale" { continue }
                if case .text(let txt) = val {
                    let c = codePoints(txt)
                    guard !c.isEmpty, c.allSatisfy({ $0 >= 0x30 && $0 <= 0x39 }), let v = Int(txt) else { continue }
                    val = .seconds(v)
                }
            }
            if !out.contains(where: { $0.name == name }) { out.append((name, val)) }
        }
        return out
    }

    /// Formats directives in order: .flag -> name, .seconds -> name=N, text quoted unless it is a token.
    public static func format(_ directives: [(name: String, value: Value)]) -> String {
        directives.map { d in
            switch d.value {
            case .flag: return d.name
            case .seconds(let v): return "\(d.name)=\(v)"
            case .text(let t): return isToken(t) ? "\(d.name)=\(t)" : "\(d.name)=" + quoteHeaderValue(t)
            }
        }.joined(separator: ", ")
    }

    /// Freshness lifetime in seconds: 0 for no-store/no-cache, s-maxage for shared caches, else max-age, else nil.
    public static func freshness(_ directives: [(name: String, value: Value)], shared: Bool = false) -> Int? {
        func get(_ k: String) -> Value? { directives.first { $0.name == k }?.value }
        if get("no-store") != nil || get("no-cache") != nil { return 0 }
        if shared, case .seconds(let v)? = get("s-maxage") { return v }
        if case .seconds(let v)? = get("max-age") { return v }
        return nil
    }
}
