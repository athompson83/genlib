// SPDX-License-Identifier: Apache-2.0
// HTTP Link header (RFC 8288): parse into ordered links, find a link by rel, format back. Commas inside <...> and quoted
// strings do not split; parameter names are lowercased; RFC 8187 "name*" values win over the plain form and are stored
// without "*"; otherwise the first occurrence wins; rel is lowercased with whitespace collapsed.

public enum LinkHeaderError: Error, Equatable {
    case invalid(String)
}

/// One link-value: target URI and ordered parameters (names lowercased, without "*").
public struct Link: Equatable {
    public let uri: String
    public var params: [(name: String, value: String)]

    public init(uri: String, params: [(name: String, value: String)]) { self.uri = uri; self.params = params }

    /// The value of a parameter, or nil.
    public func param(_ name: String) -> String? { params.first { $0.name == name }?.value }

    public static func == (a: Link, b: Link) -> Bool {
        codePoints(a.uri) == codePoints(b.uri) && a.params.count == b.params.count
            && zip(a.params, b.params).allSatisfy { codePoints($0.name) == codePoints($1.name) && codePoints($0.value) == codePoints($1.value) }
    }
}

public enum LinkHeader {
    private static func fail(_ m: String) -> LinkHeaderError { .invalid(m) }

    private static func words(_ s: String) -> [String] {
        codePoints(s).split(whereSeparator: isSpace).map { fromCodePoints($0) }
    }

    /// Parses a Link header value into links in order; an empty value gives [].
    public static func parse(_ value: String) throws -> [Link] {
        let s = codePoints(value), n = s.count
        var i = 0, links: [Link] = []
        func ws() { while i < n && (s[i] == 0x20 || s[i] == 0x09) { i += 1 } }
        while true {
            ws()
            if i >= n { break }
            if s[i] == 0x2C { i += 1; continue }
            guard s[i] == 0x3C else { throw fail("expected <") }
            guard let end = s[i...].firstIndex(of: 0x3E) else { throw fail("unterminated <") }
            var link = Link(uri: fromCodePoints(s[(i + 1)..<end]), params: [])
            i = end + 1
            var ext = Set<String>()
            while true {
                ws()
                if i >= n || s[i] == 0x2C { break }
                guard s[i] == 0x3B else { throw fail("expected ;") }
                i += 1; ws()
                let t = tokenEnd(s, i)
                guard t > i else { throw fail("expected parameter name") }
                let name = fromCodePoints(asciiLower(s[i..<t]))
                i = t; ws()
                var val = ""
                if i < n && s[i] == 0x3D {
                    i += 1; ws()
                    if i < n && s[i] == 0x22 {
                        guard let (q, next) = readQuoted(s, i + 1) else { throw fail("unterminated quote") }
                        val = q; i = next
                    } else {
                        let st = i
                        while i < n && s[i] != 0x2C && s[i] != 0x3B && !isSpace(s[i]) { i += 1 }
                        val = fromCodePoints(s[st..<i])
                    }
                }
                if name.hasSuffix("*") && name.unicodeScalars.last == "*" {
                    let base = String(name.unicodeScalars.dropLast())
                    guard let decoded = decodeExtValue(val) else { throw fail("bad extended value") }
                    if let k = link.params.firstIndex(where: { $0.name == base }) { link.params[k].value = decoded } else { link.params.append((base, decoded)) }
                    ext.insert(base)
                } else if !ext.contains(name) && link.param(name) == nil {
                    link.params.append((name, val))
                }
            }
            if let k = link.params.firstIndex(where: { $0.name == "rel" }) {
                link.params[k].value = words(link.params[k].value.lowercased()).joined(separator: " ")
            }
            links.append(link)
        }
        return links
    }

    /// The first link whose rel list contains rel (case-insensitive), else nil.
    public static func findRel(_ links: [Link], _ rel: String) -> Link? {
        let want = codePoints(rel.lowercased())
        return links.first { words($0.param("rel") ?? "").contains { codePoints($0) == want } }
    }

    /// Formats links as <uri>; rel="next"; ... joined with ", "; non-printable-ASCII values use name*=UTF-8''<pct>.
    public static func format(_ links: [Link]) -> String {
        links.map { l in
            var parts = ["<\(l.uri)>"]
            for (k, v) in l.params {
                if v.unicodeScalars.contains(where: { $0.value > 0x7E || $0.value < 0x20 }) {
                    parts.append("\(k)*=UTF-8''" + encodeAttrChars(v))
                } else {
                    parts.append(isToken(v) && k != "rel" ? "\(k)=\(v)" : "\(k)=" + quoteHeaderValue(v))
                }
            }
            return parts.joined(separator: "; ")
        }.joined(separator: ", ")
    }
}
