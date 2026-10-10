// SPDX-License-Identifier: Apache-2.0
// JSON-LD script elements and HTML meta / Open Graph / Twitter tags.

public enum StructuredDataError: Error, Equatable {
    case invalidArgument(String)
}

/// An ordered JSON value. Object members keep their literal (insertion) order.
public indirect enum JSONValue: Equatable, Sendable, ExpressibleByStringLiteral, ExpressibleByIntegerLiteral,
    ExpressibleByFloatLiteral, ExpressibleByBooleanLiteral, ExpressibleByNilLiteral, ExpressibleByArrayLiteral,
    ExpressibleByDictionaryLiteral {
    case object([(String, JSONValue)]), array([JSONValue]), string(String), int(Int), number(Double), bool(Bool), null

    public init(stringLiteral value: String) { self = .string(value) }
    public init(integerLiteral value: Int) { self = .int(value) }
    public init(floatLiteral value: Double) { self = .number(value) }
    public init(booleanLiteral value: Bool) { self = .bool(value) }
    public init(nilLiteral: ()) { self = .null }
    public init(arrayLiteral elements: JSONValue...) { self = .array(elements) }
    public init(dictionaryLiteral elements: (String, JSONValue)...) { self = .object(elements) }

    public static func == (a: JSONValue, b: JSONValue) -> Bool {
        switch (a, b) {
        case let (.object(x), .object(y)): return x.count == y.count && zip(x, y).allSatisfy { $0.0 == $1.0 && $0.1 == $1.1 }
        case let (.array(x), .array(y)): return x == y
        case let (.string(x), .string(y)): return x == y
        case let (.int(x), .int(y)): return x == y
        case let (.number(x), .number(y)): return x == y
        case let (.bool(x), .bool(y)): return x == y
        case (.null, .null): return true
        default: return false
        }
    }
}

/// Inputs for `StructuredData.metaTags`. Nil or empty optional values are omitted.
public struct MetaTagOptions: Sendable {
    public var title: String
    public var description: String?, canonical: String?, image: String?, siteName: String?
    public var type: String
    public var twitterCard: String
    public var locale: String?
    public init(title: String, description: String? = nil, canonical: String? = nil, image: String? = nil, siteName: String? = nil,
                type: String = "website", twitterCard: String = "summary_large_image", locale: String? = nil) {
        self.title = title; self.description = description; self.canonical = canonical; self.image = image
        self.siteName = siteName; self.type = type; self.twitterCard = twitterCard; self.locale = locale
    }
}

public enum StructuredData {
    private static let maxDepth = 64
    private static let twitterCards = ["summary", "summary_large_image", "app", "player"]
    private static let hex = Array("0123456789abcdef")

    /// Serializes an object or array to compact JSON inside `<script type="application/ld+json">`, escaping
    /// `<`, `>`, `&`, U+2028 and U+2029 as `\uXXXX` so the element cannot be closed early.
    public static func jsonLdScript(_ value: JSONValue) throws -> String {
        switch value {
        case .object, .array: break
        default: throw StructuredDataError.invalidArgument("JSON-LD root must be an object or an array")
        }
        var out = "<script type=\"application/ld+json\">"
        try write(value, to: &out, depth: 0)
        return out + "</script>"
    }

    /// Returns title, description, canonical, Open Graph and Twitter tags joined by "\n" (no trailing newline).
    public static func metaTags(_ o: MetaTagOptions) throws -> String {
        func present(_ v: String?) -> String? { (v?.isEmpty ?? true) ? nil : v }
        guard !trimmed(o.title).isEmpty else { throw StructuredDataError.invalidArgument("title must not be empty") }
        if let c = present(o.canonical), !isAbsoluteHTTPURL(c, httpsOnly: true) {
            throw StructuredDataError.invalidArgument("canonical must be an absolute https URL: \(c)")
        }
        if let i = present(o.image), !isAbsoluteHTTPURL(i, httpsOnly: true) {
            throw StructuredDataError.invalidArgument("image must be an absolute https URL: \(i)")
        }
        guard !trimmed(o.type).isEmpty else { throw StructuredDataError.invalidArgument("type must not be empty") }
        guard twitterCards.contains(o.twitterCard) else {
            throw StructuredDataError.invalidArgument("twitterCard must be one of \(twitterCards.joined(separator: ", "))")
        }
        var lines = ["<title>\(htmlEscape(o.title))</title>"]
        func meta(_ attr: String, _ key: String, _ value: String?) {
            if let v = present(value) { lines.append("<meta \(attr)=\"\(key)\" content=\"\(htmlEscape(v))\">") }
        }
        meta("name", "description", o.description)
        if let c = present(o.canonical) { lines.append("<link rel=\"canonical\" href=\"\(htmlEscape(c))\">") }
        meta("property", "og:title", o.title)
        meta("property", "og:description", o.description)
        meta("property", "og:url", o.canonical)
        meta("property", "og:image", o.image)
        meta("property", "og:site_name", o.siteName)
        meta("property", "og:type", o.type)
        meta("property", "og:locale", o.locale)
        meta("name", "twitter:card", o.twitterCard)
        meta("name", "twitter:title", o.title)
        meta("name", "twitter:description", o.description)
        meta("name", "twitter:image", o.image)
        return lines.joined(separator: "\n")
    }

    private static func write(_ value: JSONValue, to out: inout String, depth: Int) throws {
        guard depth <= maxDepth else { throw StructuredDataError.invalidArgument("JSON-LD nesting exceeds \(maxDepth) levels") }
        switch value {
        case .null: out += "null"
        case let .bool(b): out += b ? "true" : "false"
        case let .string(s): writeString(s, to: &out)
        case let .int(i): out += String(i)
        case let .number(d):
            guard d.isFinite else { throw StructuredDataError.invalidArgument("JSON-LD numbers must be finite") }
            if d == d.rounded(.towardZero) && abs(d) < 1e15 { out += String(Int64(d)) } else { out += d.description }
        case let .array(items):
            out += "["
            for (i, item) in items.enumerated() {
                if i > 0 { out += "," }
                try write(item, to: &out, depth: depth + 1)
            }
            out += "]"
        case let .object(members):
            out += "{"
            for (i, (key, item)) in members.enumerated() {
                if i > 0 { out += "," }
                writeString(key, to: &out)
                out += ":"
                try write(item, to: &out, depth: depth + 1)
            }
            out += "}"
        }
    }

    private static func writeString(_ s: String, to out: inout String) {
        out += "\""
        for scalar in s.unicodeScalars {
            let u = scalar.value
            switch u {
            case 0x22: out += "\\\""
            case 0x5c: out += "\\\\"
            case 0x08: out += "\\b"
            case 0x0c: out += "\\f"
            case 0x0a: out += "\\n"
            case 0x0d: out += "\\r"
            case 0x09: out += "\\t"
            case 0x3c, 0x3e, 0x26, 0x2028, 0x2029, 0x00..<0x20:
                out += "\\u"
                for shift in stride(from: 12, through: 0, by: -4) { out.append(hex[Int((u >> UInt32(shift)) & 0xf)]) }
            default:
                out.unicodeScalars.append(scalar)
            }
        }
        out += "\""
    }
}
