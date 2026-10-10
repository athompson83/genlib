// SPDX-License-Identifier: Apache-2.0
// URL normalization for http/https (RFC 3986 section 6): lowercase scheme and host, canonical bracketed IPv6, default
// port removed, percent-encodings uppercased and unreserved ones decoded, dot segments removed, empty path -> "/",
// empty query and fragment dropped. Hand-parsed (no URL/URLComponents); userinfo and whitespace are rejected.

public enum UrlNormalizeError: Error, Equatable {
    case invalidArgument(String)
}

public enum UrlNormalize {
    private typealias Scalars = [Unicode.Scalar]

    private static func lastSlashCut(_ out: inout Scalars) {
        if let i = out.lastIndex(of: "/") { out.removeSubrange(i...) } else { out.removeAll() }
    }

    /// RFC 3986 section 5.2.4 remove_dot_segments.
    public static func removeDotSegments(_ path: String) -> String {
        var input = Array(path.unicodeScalars)[...]
        var out: Scalars = []
        while !input.isEmpty {
            if input.starts(with: ["." , ".", "/"]) { input = input.dropFirst(3) }
            else if input.starts(with: [".", "/"]) { input = input.dropFirst(2) }
            else if input.starts(with: ["/", ".", "/"]) { input = ["/"] + input.dropFirst(3) }
            else if input.elementsEqual(["/", "."]) { input = ["/"] }
            else if input.starts(with: ["/", ".", ".", "/"]) { input = ["/"] + input.dropFirst(4); lastSlashCut(&out) }
            else if input.elementsEqual(["/", ".", "."]) { input = ["/"]; lastSlashCut(&out) }
            else if input.elementsEqual(["."]) || input.elementsEqual([".", "."]) { input = [] }
            else {
                let from = input.first == "/" ? input.startIndex + 1 : input.startIndex
                let end = input[from...].firstIndex(of: "/") ?? input.endIndex
                out += input[input.startIndex..<end]
                input = input[end...]
            }
        }
        return String(String.UnicodeScalarView(out))
    }

    private static func hex(_ s: Unicode.Scalar) -> UInt32? {
        switch s {
        case "0"..."9": return s.value - 0x30
        case "A"..."F": return s.value - 0x41 + 10
        case "a"..."f": return s.value - 0x61 + 10
        default: return nil
        }
    }

    private static func isUnreserved(_ v: UInt32) -> Bool {
        (0x41...0x5A).contains(v) || (0x61...0x7A).contains(v) || (0x30...0x39).contains(v) || v == 0x2D || v == 0x2E || v == 0x5F || v == 0x7E
    }

    private static func normalizePercent(_ s: ArraySlice<Unicode.Scalar>) throws -> Scalars {
        var out: Scalars = [], i = s.startIndex
        while i < s.endIndex {
            if s[i] == "%" {
                guard i + 2 < s.endIndex, let h = hex(s[i + 1]), let l = hex(s[i + 2]) else {
                    throw UrlNormalizeError.invalidArgument("'%' must be followed by two hex digits")
                }
                let v = h * 16 + l
                if isUnreserved(v) { out.append(Unicode.Scalar(v)!) }
                else { out += ["%"] + String(v, radix: 16, uppercase: true).leftPad2().unicodeScalars }
                i += 3
            } else { out.append(s[i]); i += 1 }
        }
        return out
    }

    private static func lowerAscii(_ s: ArraySlice<Unicode.Scalar>) -> String {
        String(String.UnicodeScalarView(s.map { ("A"..."Z").contains($0) ? Unicode.Scalar($0.value + 32)! : $0 }))
    }

    /// Normalized http(s) URL; throws UrlNormalizeError for anything else.
    public static func normalizeUrl(_ text: String) throws -> String {
        let bad = UrlNormalizeError.invalidArgument("not a normalizable http(s) URL: \(text.debugDescription)")
        let u = Array(text.unicodeScalars)
        guard !u.contains(where: { $0.value <= 0x20 || $0.value == 0x7F }) else { throw bad }
        var i = 0
        func isAlpha(_ c: Unicode.Scalar) -> Bool { ("a"..."z").contains(c) || ("A"..."Z").contains(c) }
        guard let f = u.first, isAlpha(f) else { throw bad }
        while i < u.count, isAlpha(u[i]) || ("0"..."9").contains(u[i]) || u[i] == "+" || u[i] == "." || u[i] == "-" { i += 1 }
        let scheme = lowerAscii(u[..<i])
        guard u[i...].starts(with: [":", "/", "/"]), scheme == "http" || scheme == "https" else { throw bad }
        i += 3
        let authStart = i
        while i < u.count, u[i] != "/", u[i] != "?", u[i] != "#" { i += 1 }
        let auth = u[authStart..<i]
        let pathStart = i
        while i < u.count, u[i] != "?", u[i] != "#" { i += 1 }
        let rawPath = u[pathStart..<i]
        let queryStart = i
        if i < u.count, u[i] == "?" { while i < u.count, u[i] != "#" { i += 1 } }
        let rawQuery = u[queryStart..<i]
        guard !auth.contains("@") else { throw bad }

        var host: String, j = auth.startIndex
        if auth.first == "[" {
            guard let close = auth.firstIndex(of: "]"), close > j + 1,
                  auth[(j + 1)..<close].allSatisfy({ hex($0) != nil || $0 == ":" || $0 == "." }) else { throw bad }
            guard let canonical = try? IpCidr.canonicalIp(lowerAscii(auth[(j + 1)..<close])) else { throw bad }
            host = "[" + canonical + "]"
            j = close + 1
        } else {
            while j < auth.endIndex, isAlpha(auth[j]) || ("0"..."9").contains(auth[j]) || auth[j] == "." || auth[j] == "-" { j += 1 }
            guard j > auth.startIndex else { throw bad }
            host = lowerAscii(auth[auth.startIndex..<j])
        }
        var port = ""
        if j < auth.endIndex {
            guard auth[j] == ":", auth[(j + 1)...].allSatisfy({ ("0"..."9").contains($0) }) else { throw bad }
            let digits = auth[(j + 1)...].drop(while: { $0 == "0" })
            if !auth[(j + 1)...].isEmpty {
                guard digits.count <= 5, let p = Int(String(String.UnicodeScalarView(digits.isEmpty ? ["0"] : digits))),
                      p <= 65535 else { throw bad }
                if !((scheme == "http" && p == 80) || (scheme == "https" && p == 443)) { port = ":\(p)" }
            }
        }
        var path = removeDotSegments(String(String.UnicodeScalarView(try normalizePercent(rawPath))))
        if path.isEmpty { path = "/" }
        let query = rawQuery.isEmpty ? "" : String(String.UnicodeScalarView(try normalizePercent(rawQuery)))
        return scheme + "://" + host + port + path + (query == "?" ? "" : query)
    }
}

extension String {
    fileprivate func leftPad2() -> String { count < 2 ? "0" + self : self }
}
