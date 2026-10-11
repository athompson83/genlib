// SPDX-License-Identifier: Apache-2.0
// .env parsing: comments, "export ", keys [A-Za-z_][A-Za-z0-9_.]*, unquoted values trimmed (" #" starts a comment),
// literal single quotes, multi-line double quotes with escapes \n \r \t \" \\ \$. Later keys override but keep the first
// position. Optional ${NAME} / ${NAME:-default} expansion from earlier keys, then vars; an escaped \$ never expands.

public enum DotenvError: Error, Equatable {
    /// 1-based line number and message.
    case invalidLine(Int, String)
}

public enum Dotenv {
    private enum Kind { case plain, single, double }
    private static let sentinel: UInt32 = 0 // "\$" is held as NUL + "$" until expansion is done.

    private static func isKeyStart(_ c: UInt32) -> Bool { (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || c == 0x5F }
    private static func isKeyChar(_ c: UInt32) -> Bool { isKeyStart(c) || (c >= 0x30 && c <= 0x39) || c == 0x2E }
    private static func validKey(_ k: ArraySlice<UInt32>) -> Bool {
        guard let f = k.first, isKeyStart(f) else { return false }
        return k.allSatisfy(isKeyChar)
    }

    /// Parses .env text into ordered (key, value) pairs; with expand, substitutes ${NAME} references.
    public static func parse(_ text: String, expand: Bool = false, vars: [String: String] = [:]) throws -> [(key: String, value: String)] {
        var all = codePoints(text), norm: [UInt32] = []
        norm.reserveCapacity(all.count)
        var x = 0
        while x < all.count {
            if all[x] == 0x0D && x + 1 < all.count && all[x + 1] == 0x0A { x += 1; continue }
            norm.append(all[x]); x += 1
        }
        all = []
        let lines = norm.split(separator: 0x0A, omittingEmptySubsequences: false).map(Array.init)
        var keys: [String] = [], values: [String: [UInt32]] = [:], kinds: [String: Kind] = [:]
        var i = 0
        while i < lines.count {
            let no = i + 1
            var s = stripSpace(lines[i][...])
            i += 1
            if s.isEmpty || s.first == 0x23 { continue }
            let export = codePoints("export ")
            if s.starts(with: export) { s = s.dropFirst(7); while let f = s.first, isSpace(f) { s = s.dropFirst() } }
            guard let eq = s.firstIndex(of: 0x3D) else { throw DotenvError.invalidLine(no, "expected KEY=VALUE") }
            let keyCP = stripSpace(s[..<eq])
            let key = fromCodePoints(keyCP)
            guard validKey(keyCP) else { throw DotenvError.invalidLine(no, "invalid key '\(key)'") }
            var rest = s[(eq + 1)...]
            while let f = rest.first, isSpace(f) { rest = rest.dropFirst() }
            var val: [UInt32] = [], tail: ArraySlice<UInt32> = [], kind = Kind.plain
            if rest.first == 0x27 {
                let body = rest.dropFirst()
                guard let end = body.firstIndex(of: 0x27) else { throw DotenvError.invalidLine(no, "unterminated single quote") }
                val = Array(body[..<end]); tail = body[(end + 1)...]; kind = .single
            } else if rest.first == 0x22 {
                var buf = Array(rest.dropFirst()), j = 0
                while true {
                    var closed = false
                    while j < buf.count {
                        let c = buf[j]
                        if c == 0x5C && j + 1 < buf.count {
                            switch buf[j + 1] {
                            case 0x6E: val.append(0x0A)
                            case 0x72: val.append(0x0D)
                            case 0x74: val.append(0x09)
                            case 0x22: val.append(0x22)
                            case 0x5C: val.append(0x5C)
                            case 0x24: val += [sentinel, 0x24]
                            default: val += [0x5C, buf[j + 1]]
                            }
                            j += 2; continue
                        }
                        if c == 0x22 { closed = true; break }
                        val.append(c); j += 1
                    }
                    if closed { tail = buf[(j + 1)...]; break }
                    if i >= lines.count { throw DotenvError.invalidLine(no, "unterminated double quote") }
                    val.append(0x0A); buf = lines[i]; i += 1; j = 0
                }
                kind = .double
            } else {
                var cut = rest.endIndex
                var k = rest.startIndex
                while k + 1 < rest.endIndex {
                    if isSpace(rest[k]) && rest[k + 1] == 0x23 { cut = k; break }
                    k += 1
                }
                val = Array(stripSpace(rest[..<cut]))
            }
            let t = stripSpace(tail)
            if !t.isEmpty && t.first != 0x23 { throw DotenvError.invalidLine(no, "unexpected text after closing quote") }
            if values[key] == nil { keys.append(key) }
            values[key] = val; kinds[key] = kind
        }
        var done: [String: [UInt32]] = [:]
        if expand {
            for k in keys {
                done[k] = kinds[k] == .single ? values[k]! : substitute(values[k]!, done, vars)
            }
        } else { done = values }
        return keys.map { k in
            var out: [UInt32] = [], v = done[k]!, j = 0
            while j < v.count {
                if v[j] == sentinel && j + 1 < v.count && v[j + 1] == 0x24 { j += 1; continue }
                out.append(v[j]); j += 1
            }
            v = []
            return (key: k, value: fromCodePoints(out))
        }
    }

    private static func substitute(_ v: [UInt32], _ done: [String: [UInt32]], _ vars: [String: String]) -> [UInt32] {
        var out: [UInt32] = [], i = 0
        while i < v.count {
            if v[i] == 0x24 && i + 1 < v.count && v[i + 1] == 0x7B && !(i > 0 && v[i - 1] == sentinel) {
                var j = i + 2
                if j < v.count && isKeyStart(v[j]) {
                    while j < v.count && isKeyChar(v[j]) { j += 1 }
                    let name = fromCodePoints(v[(i + 2)..<j])
                    var dflt: [UInt32]? = nil, end = -1
                    if j < v.count && v[j] == 0x7D {
                        end = j
                    } else if j + 1 < v.count && v[j] == 0x3A && v[j + 1] == 0x2D, let close = v[(j + 2)...].firstIndex(of: 0x7D) {
                        dflt = Array(v[(j + 2)..<close]); end = close
                    }
                    if end >= 0 {
                        let got = done[name] ?? vars[name].map(codePoints)
                        if let g = got, !g.isEmpty { out += g } else { out += dflt ?? [] }
                        i = end + 1
                        continue
                    }
                }
            }
            out.append(v[i]); i += 1
        }
        return out
    }
}
