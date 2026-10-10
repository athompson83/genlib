// SPDX-License-Identifier: Apache-2.0
// RFC 6350 vCard 4.0 export with TEXT escaping, validated EMAIL/TEL/URL values and UTF-8-safe 75-octet line folding.
// Output is CRLF-terminated and byte-for-byte deterministic; serve it as text/vcard.

public enum VCardError: Error, Equatable {
    case invalidArgument(String)
}

public struct VCardName: Equatable {
    public var family, given, additional, prefix, suffix: String
    public init(family: String = "", given: String = "", additional: String = "", prefix: String = "", suffix: String = "") {
        self.family = family; self.given = given; self.additional = additional; self.prefix = prefix; self.suffix = suffix
    }
}

public struct VCardValue: Equatable {
    public var value: String
    public var type: String?
    public init(_ value: String, type: String? = nil) { self.value = value; self.type = type }
}

public struct VCardAddress: Equatable {
    public var type: String?
    public var poBox, extended, street, locality, region, postalCode, country: String
    public init(type: String? = nil, poBox: String = "", extended: String = "", street: String = "", locality: String = "",
                region: String = "", postalCode: String = "", country: String = "") {
        self.type = type; self.poBox = poBox; self.extended = extended; self.street = street; self.locality = locality
        self.region = region; self.postalCode = postalCode; self.country = country
    }
}

public struct VCardContact: Equatable {
    public var fn: String
    public var n: VCardName?
    public var org, title, note, uid: String?
    public var emails: [VCardValue]
    public var phones: [VCardValue]
    public var address: VCardAddress?
    public var urls: [String]
    public init(fn: String, n: VCardName? = nil, org: String? = nil, title: String? = nil, emails: [VCardValue] = [],
                phones: [VCardValue] = [], address: VCardAddress? = nil, urls: [String] = [], note: String? = nil, uid: String? = nil) {
        self.fn = fn; self.n = n; self.org = org; self.title = title; self.emails = emails; self.phones = phones
        self.address = address; self.urls = urls; self.note = note; self.uid = uid
    }
}

public enum VCard {
    private static func fail(_ message: String) -> VCardError { .invalidArgument(message) }

    private static func isSpace(_ s: Unicode.Scalar) -> Bool { s.properties.isWhitespace || (0x1C...0x1F).contains(s.value) }

    private static func escape(_ value: String) throws -> String {
        var out = String.UnicodeScalarView()
        for s in value.unicodeScalars {
            switch s {
            case "\\": out.append(contentsOf: "\\\\".unicodeScalars)
            case ",": out.append(contentsOf: "\\,".unicodeScalars)
            case ";": out.append(contentsOf: "\\;".unicodeScalars)
            case "\n": out.append(contentsOf: "\\n".unicodeScalars)
            default:
                if s.value < 0x20 || s.value == 0x7F { throw fail("text contains a control character") }
                out.append(s)
            }
        }
        return String(out)
    }

    private static func typeParam(_ type: String?) throws -> String {
        guard let t = type else { return "" }
        let b = Array(t.utf8)
        let ok = !b.isEmpty && b[0] >= 0x61 && b[0] <= 0x7A
            && b.allSatisfy { ($0 >= 0x61 && $0 <= 0x7A) || ($0 >= 0x30 && $0 <= 0x39) || $0 == 0x2D }
        guard ok else { throw fail("TYPE must match [a-z][a-z0-9-]*") }
        return ";TYPE=" + t
    }

    private static func validEmail(_ v: String) -> Bool {
        let s = Array(v.unicodeScalars)
        guard let at = s.firstIndex(of: "@"), at > 0, at < s.count - 1 else { return false }
        return s.filter { $0 == "@" }.count == 1 && !s.contains(where: isSpace)
    }

    private static func validPhone(_ v: String) -> Bool {
        var b = Array(v.utf8)[...]
        if b.first == 0x2B { b = b.dropFirst() }
        guard let first = b.first, first >= 0x30 && first <= 0x39 else { return false }
        let rest = b.dropFirst()
        return (1...30).contains(rest.count) && rest.allSatisfy { ($0 >= 0x30 && $0 <= 0x39) || " ().-".utf8.contains($0) }
    }

    private static func validUrl(_ v: String) -> Bool {
        for scheme in ["http://", "https://"] where v.utf8.starts(with: scheme.utf8) {
            let rest = v.unicodeScalars.dropFirst(scheme.count)
            return !rest.isEmpty && !rest.contains(where: isSpace)
        }
        return false
    }

    /// Appends `line` folded at 75 octets (74 after the leading space), never splitting a UTF-8 sequence.
    private static func appendFolded(_ out: inout [UInt8], _ line: String) {
        var used = 0, limit = 75
        for s in line.unicodeScalars {
            let bytes = Array(String(s).utf8)
            if used + bytes.count > limit { out += [0x0D, 0x0A, 0x20]; used = 0; limit = 74 }
            out += bytes
            used += bytes.count
        }
        out += [0x0D, 0x0A]
    }

    private static func present(_ s: String?) -> String? { (s?.isEmpty ?? true) ? nil : s }

    /// Builds one vCard 4.0 with CRLF line ends. Throws VCardError for a blank FN, invalid EMAIL/TEL/URL/TYPE values
    /// or control characters (other than newline) in text.
    public static func buildVcard(_ c: VCardContact) throws -> String {
        guard c.fn.unicodeScalars.contains(where: { !$0.properties.isWhitespace }) else { throw fail("fn is required") }
        var lines = ["BEGIN:VCARD", "VERSION:4.0", "FN:" + (try escape(c.fn))]
        if let n = c.n {
            lines.append("N:" + (try [n.family, n.given, n.additional, n.prefix, n.suffix].map(escape).joined(separator: ";")))
        }
        if let org = present(c.org) { lines.append("ORG:" + (try escape(org))) }
        if let title = present(c.title) { lines.append("TITLE:" + (try escape(title))) }
        for e in c.emails {
            guard validEmail(e.value) else { throw fail("invalid email: \(e.value)") }
            lines.append("EMAIL" + (try typeParam(e.type)) + ":" + (try escape(e.value)))
        }
        for p in c.phones {
            guard validPhone(p.value) else { throw fail("invalid phone: \(p.value)") }
            lines.append("TEL" + (try typeParam(p.type)) + ":" + p.value)
        }
        if let a = c.address {
            let parts = try [a.poBox, a.extended, a.street, a.locality, a.region, a.postalCode, a.country].map(escape)
            lines.append("ADR" + (try typeParam(a.type)) + ":" + parts.joined(separator: ";"))
        }
        for u in c.urls {
            guard validUrl(u) else { throw fail("invalid URL: \(u)") }
            lines.append("URL:" + u)
        }
        if let note = present(c.note) { lines.append("NOTE:" + (try escape(note))) }
        if let uid = present(c.uid) { lines.append("UID:" + (try escape(uid))) }
        lines.append("END:VCARD")
        var out: [UInt8] = []
        for line in lines { appendFolded(&out, line) }
        return String(decoding: out, as: UTF8.self)
    }
}
