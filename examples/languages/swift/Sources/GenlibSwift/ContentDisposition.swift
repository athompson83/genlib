// SPDX-License-Identifier: Apache-2.0
// Content-Disposition (RFC 6266 + RFC 8187): build a safe header from any file name, parse one (filename* wins, the
// returned filename is sanitized) and sanitize names (/ \ " and control characters -> "_", spaces and dots trimmed at
// both ends, empty -> "download").

public enum ContentDispositionError: Error, Equatable {
    case invalid(String)
}

/// A parsed Content-Disposition header.
public struct ContentDisposition {
    /// Lowercased disposition type ("attachment", "inline", "form-data").
    public let type: String
    /// The sanitized file name (filename* preferred), or nil.
    public let filename: String?
    /// Raw parameters in order (names lowercased, without "*").
    public let params: [(name: String, value: String)]

    /// Replaces / \ " and control characters with "_", trims spaces and dots at both ends; empty -> "download".
    public static func sanitizeFilename(_ name: String) -> String {
        let c = codePoints(name).map { $0 == 0x2F || $0 == 0x5C || $0 == 0x22 || $0 < 0x20 || $0 == 0x7F ? 0x5F : $0 }
        var a = 0, b = c.count
        while a < b && (c[a] == 0x20 || c[a] == 0x2E) { a += 1 }
        while b > a && (c[b - 1] == 0x20 || c[b - 1] == 0x2E) { b -= 1 }
        return a == b ? "download" : fromCodePoints(c[a..<b])
    }

    /// attachment; filename="..." (or inline), adding an ASCII fallback plus filename*=UTF-8''... for non-ASCII names.
    public static func build(_ filename: String, inline: Bool = false) -> String {
        let name = sanitizeFilename(filename), kind = inline ? "inline" : "attachment"
        let c = codePoints(name)
        if c.allSatisfy({ $0 >= 0x20 && $0 < 0x7F }) { return "\(kind); filename=\"\(name)\"" }
        let fallback = fromCodePoints(c.map { $0 >= 0x20 && $0 < 0x7F ? $0 : 0x5F })
        return "\(kind); filename=\"\(fallback)\"; filename*=UTF-8''" + encodeAttrChars(name)
    }

    /// Parses a Content-Disposition value; throws ContentDispositionError when malformed.
    public static func parse(_ value: String) throws -> ContentDisposition {
        let s = codePoints(value), n = s.count
        var i = 0
        while i < n && isSpace(s[i]) { i += 1 }
        let t = tokenEnd(s, i)
        guard t > i else { throw ContentDispositionError.invalid("missing disposition type") }
        let kind = fromCodePoints(asciiLower(s[i..<t]))
        i = t
        while i < n && isSpace(s[i]) { i += 1 }
        var params: [(name: String, value: String)] = []
        func ws() { while i < n && (s[i] == 0x20 || s[i] == 0x09) { i += 1 } }
        while i < n {
            guard s[i] == 0x3B else { throw ContentDispositionError.invalid("expected ;") }
            i += 1; ws()
            if i >= n { break }
            let e = tokenEnd(s, i)
            guard e > i else { throw ContentDispositionError.invalid("expected parameter") }
            let name = fromCodePoints(asciiLower(s[i..<e]))
            i = e; ws()
            guard i < n, s[i] == 0x3D else { throw ContentDispositionError.invalid("expected =") }
            i += 1; ws()
            var val: String
            if i < n && s[i] == 0x22 {
                guard let (q, next) = readQuoted(s, i + 1) else { throw ContentDispositionError.invalid("unterminated quote") }
                val = q; i = next
            } else {
                let st = i
                while i < n && s[i] != 0x3B && !isSpace(s[i]) { i += 1 }
                val = fromCodePoints(s[st..<i])
            }
            ws()
            if name.unicodeScalars.last == "*" {
                let base = String(name.unicodeScalars.dropLast())
                guard let decoded = decodeExtValue(val) else { throw ContentDispositionError.invalid("bad extended value") }
                if let k = params.firstIndex(where: { $0.name == base }) { params[k].value = decoded } else { params.append((base, decoded)) }
            } else if !params.contains(where: { $0.name == name }) {
                params.append((name, val))
            }
        }
        let fn = params.first { $0.name == "filename" }?.value
        return ContentDisposition(type: kind, filename: fn.map(sanitizeFilename), params: params)
    }
}
