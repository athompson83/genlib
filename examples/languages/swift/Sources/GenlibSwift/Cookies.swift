// SPDX-License-Identifier: Apache-2.0
// Set-Cookie serialization and Cookie header parsing (RFC 6265 plus current browser rules: SameSite=None and
// Partitioned require Secure; __Secure- and __Host- prefixes). Values must already be cookie-octets: encode anything
// else (for example percent-encoding) before calling serializeCookie.

public enum CookieError: Error, Equatable {
    case invalidArgument(String)
}

public struct CookieOptions {
    public var maxAge: Int?
    public var expires: Int64?  // unix seconds, written as IMF-fixdate
    public var domain: String?
    public var path: String?
    public var secure: Bool
    public var httpOnly: Bool
    public var sameSite: String?  // "Strict" | "Lax" | "None" (exact case)
    public var partitioned: Bool

    public init(maxAge: Int? = nil, expires: Int64? = nil, domain: String? = nil, path: String? = nil, secure: Bool = false,
                httpOnly: Bool = false, sameSite: String? = nil, partitioned: Bool = false) {
        self.maxAge = maxAge; self.expires = expires; self.domain = domain; self.path = path; self.secure = secure
        self.httpOnly = httpOnly; self.sameSite = sameSite; self.partitioned = partitioned
    }
}

public enum Cookies {
    private static let tokenChars = Set(Array("!#$%&'*+-.^_`|~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".unicodeScalars))

    private static func isCookieOctet(_ s: Unicode.Scalar) -> Bool {
        let v = s.value
        return v == 0x21 || (0x23...0x2B).contains(v) || (0x2D...0x3A).contains(v) || (0x3C...0x5B).contains(v) || (0x5D...0x7E).contains(v)
    }

    private static func isAlnum(_ s: Unicode.Scalar) -> Bool {
        ("a"..."z").contains(s) || ("A"..."Z").contains(s) || ("0"..."9").contains(s)
    }

    private static func validDomain(_ domain: String) -> Bool {
        var s = Array(domain.unicodeScalars)[...]
        if s.first == "." { s = s.dropFirst() }
        let labels = s.split(separator: ".", omittingEmptySubsequences: false)
        return labels.allSatisfy { l in
            guard let f = l.first, let e = l.last, isAlnum(f), isAlnum(e) else { return false }
            return l.allSatisfy { isAlnum($0) || $0 == "-" }
        }
    }

    private static func fail(_ message: String) -> CookieError { .invalidArgument(message) }

    /// A Set-Cookie header value; throws CookieError for invalid names, values, attributes or prefix rules.
    public static func serializeCookie(_ name: String, _ value: String, _ o: CookieOptions = CookieOptions()) throws -> String {
        let n = Array(name.unicodeScalars)
        guard !n.isEmpty, n.allSatisfy(tokenChars.contains) else { throw fail("cookie name must be an RFC 7230 token") }
        guard value.unicodeScalars.allSatisfy(isCookieOctet) else { throw fail("cookie value has characters outside cookie-octet") }
        if let d = o.domain, !validDomain(d) { throw fail("invalid cookie domain") }
        if let p = o.path, p.unicodeScalars.first != "/" || p.unicodeScalars.contains(where: { $0.value < 0x20 || $0.value == 0x7F || $0 == ";" }) {
            throw fail("cookie path must start with / and contain no controls or ;")
        }
        if let ss = o.sameSite, !["Strict", "Lax", "None"].contains(ss) { throw fail("SameSite must be Strict, Lax or None") }
        if o.sameSite == "None" && !o.secure { throw fail("SameSite=None requires Secure") }
        if o.partitioned && !o.secure { throw fail("Partitioned requires Secure") }
        if name.hasPrefix("__Secure-") && !o.secure { throw fail("__Secure- requires Secure") }
        if name.hasPrefix("__Host-") && (!o.secure || o.domain != nil || o.path != "/") {
            throw fail("__Host- requires Secure, Path=/ and no Domain")
        }
        if let m = o.maxAge, m < 0 { throw fail("Max-Age must be a non-negative integer") }
        var out = ["\(name)=\(value)"]
        if let m = o.maxAge { out.append("Max-Age=\(m)") }
        if let e = o.expires {
            guard let date = HttpConditional.formatHttpDate(e) else { throw fail("Expires is out of range") }
            out.append("Expires=" + date)
        }
        if let d = o.domain { out.append("Domain=" + String(String.UnicodeScalarView(d.unicodeScalars.map { ("A"..."Z").contains($0) ? Unicode.Scalar($0.value + 32)! : $0 }))) }
        if let p = o.path { out.append("Path=" + p) }
        if o.secure { out.append("Secure") }
        if o.httpOnly { out.append("HttpOnly") }
        if let ss = o.sameSite { out.append("SameSite=" + ss) }
        if o.partitioned { out.append("Partitioned") }
        return out.joined(separator: "; ")
    }

    private static func trim(_ s: ArraySlice<Unicode.Scalar>) -> ArraySlice<Unicode.Scalar> {
        var a = s.startIndex, b = s.endIndex
        while a < b, s[a] == " " || s[a] == "\t" { a += 1 }
        while b > a, s[b - 1] == " " || s[b - 1] == "\t" { b -= 1 }
        return s[a..<b]
    }

    /// Ordered (name, value) pairs of a Cookie request header; duplicates are kept in order.
    public static func parseCookieHeader(_ header: String) -> [(String, String)] {
        var out: [(String, String)] = []
        for piece in Array(header.unicodeScalars).split(separator: ";", omittingEmptySubsequences: false) {
            guard let eq = piece.firstIndex(of: "=") else { continue }
            let n = trim(piece[piece.startIndex..<eq])
            var v = trim(piece[(eq + 1)...])
            if n.isEmpty { continue }
            if v.count >= 2 && v.first == "\"" && v.last == "\"" { v = v.dropFirst().dropLast() }
            out.append((String(String.UnicodeScalarView(n)), String(String.UnicodeScalarView(v))))
        }
        return out
    }
}
