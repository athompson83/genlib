// SPDX-License-Identifier: Apache-2.0
// data: URLs (RFC 2397 with simplified WHATWG fetch rules). parse lowercases the media type (default text/plain with
// charset US-ASCII), keeps parameters in order (first wins), percent-decodes the body to bytes and strictly decodes base64
// (Foundation's decoder after validation). build picks base64 for binary or non-text types unless told otherwise.
import Foundation

public enum DataUriError: Error, Equatable {
    case invalid(String)
}

/// A parsed data: URL.
public struct DataUri {
    /// Lowercased type/subtype.
    public let mime: String
    /// Parameters in order (names lowercased, values as given).
    public let params: [(name: String, value: String)]
    /// Whether the body was base64.
    public let base64: Bool
    /// The decoded body bytes.
    public let data: [UInt8]

    private static let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".utf8)

    private static func isMime(_ c: [UInt32]) -> Bool {
        guard let slash = c.firstIndex(of: 0x2F) else { return false }
        let a = c[..<slash], b = c[(slash + 1)...]
        return !a.isEmpty && !b.isEmpty && a.allSatisfy(isTchar) && b.allSatisfy(isTchar)
    }

    /// Parses a data: URL; throws DataUriError when it is not one or its base64 body is invalid.
    public static func parse(_ url: String) throws -> DataUri {
        let u = codePoints(url)
        guard u.count >= 5, fromCodePoints(u[..<5]).lowercased() == "data:" else { throw DataUriError.invalid("not a data: URL") }
        let rest = u[5...]
        guard let comma = rest.firstIndex(of: 0x2C) else { throw DataUriError.invalid("missing comma") }
        var header = stripSpace(rest[..<comma])
        let body = fromCodePoints(rest[(comma + 1)...])
        var isB64 = false
        if header.count >= 6, asciiLower(header.suffix(6)) == codePoints("base64") {
            var k = header.endIndex - 6
            while k > header.startIndex && isSpace(header[k - 1]) { k -= 1 }
            if k > header.startIndex && header[k - 1] == 0x3B { isB64 = true; header = header[..<(k - 1)] }
        }
        let parts = header.split(separator: 0x3B, omittingEmptySubsequences: false)
        var mimeCP = Array(stripSpace(parts[0])), params: [(name: String, value: String)] = []
        var mime = fromCodePoints(mimeCP).lowercased()
        mimeCP = codePoints(mime)
        for p in parts.dropFirst() {
            guard let eq = p.firstIndex(of: 0x3D) else { continue }
            let k = fromCodePoints(stripSpace(p[..<eq])).lowercased()
            if !k.isEmpty && !params.contains(where: { $0.name == k }) { params.append((name: k, value: fromCodePoints(stripSpace(p[(eq + 1)...])))) }
        }
        if !isMime(mimeCP) {
            mime = "text/plain"
            if !params.contains(where: { $0.name == "charset" }) { params.insert((name: "charset", value: "US-ASCII"), at: 0) }
        }
        var data = percentDecodeBytes(body)
        if isB64 {
            var s = data.filter { ![0x09, 0x0A, 0x0C, 0x0D, 0x20].contains($0) }
            if s.count >= 2 && s[s.count - 1] == 0x3D && s[s.count - 2] == 0x3D { s.removeLast(2) } else if s.last == 0x3D { s.removeLast() }
            guard s.count % 4 != 1, s.allSatisfy(alphabet.contains) else { throw DataUriError.invalid("invalid base64") }
            // Clear unused trailing bits so decoding is lenient about them, like the reference.
            let rem = s.count % 4
            if rem != 0, let v = alphabet.firstIndex(of: s[s.count - 1]) { s[s.count - 1] = alphabet[rem == 2 ? v & 0x30 : v & 0x3C] }
            s += Array(repeating: 0x3D, count: (4 - rem) % 4)
            guard let decoded = Data(base64Encoded: Data(s)) else { throw DataUriError.invalid("invalid base64") }
            data = [UInt8](decoded)
        }
        return DataUri(mime: mime, params: params, base64: isB64, data: data)
    }

    private static func validMediaType(_ c: [UInt32]) -> Bool {
        var i = tokenEnd(c, 0)
        guard i > 0, i < c.count, c[i] == 0x2F else { return false }
        let j = tokenEnd(c, i + 1)
        guard j > i + 1 else { return false }
        i = j
        while i < c.count {
            var k = i
            while k < c.count && isSpace(c[k]) { k += 1 }
            guard k < c.count, c[k] == 0x3B else { return false }
            k += 1
            while k < c.count && isSpace(c[k]) { k += 1 }
            let t = tokenEnd(c, k)
            guard t > k, t < c.count, c[t] == 0x3D else { return false }
            var v = t + 1
            while v < c.count && c[v] != 0x3B && c[v] != 0x2C && !isSpace(c[v]) { v += 1 }
            guard v > t + 1 else { return false }
            i = v
        }
        return true
    }

    /// Builds a data: URL. base64 nil picks base64 unless mime is textual and data is valid UTF-8.
    public static func build(_ data: [UInt8], mime: String = "application/octet-stream", base64: Bool? = nil) throws -> String {
        guard validMediaType(codePoints(mime)) else { throw DataUriError.invalid("invalid media type") }
        var useB64 = base64
        if useB64 == nil {
            let c = codePoints(mime)
            let base = trimWhitespace(fromCodePoints(c[..<(c.firstIndex(of: 0x3B) ?? c.count)])).lowercased()
            let textual = base.hasPrefix("text/") || base.hasSuffix("+json") || base.hasSuffix("+xml")
                || ["application/json", "application/xml", "application/javascript"].contains(base)
            useB64 = !(textual && strictUtf8(data) != nil)
        }
        if useB64! { return "data:\(mime);base64," + Data(data).base64EncodedString() }
        let keep = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'();/?:@&=+$,".utf8)
        var out = "data:\(mime),"
        for b in data { if keep.contains(b) { out.unicodeScalars.append(Unicode.Scalar(b)) } else { out += pctByte(b) } }
        return out
    }
}
