// SPDX-License-Identifier: Apache-2.0
// HMAC-SHA256 signed, expiring pagination cursors: base64url(body) "." base64url(mac), no padding, where body is
// "v1\n" + expiresAt + "\n" + values.joined("\n").
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

public enum CursorError: Error, Equatable {
    case invalidArgument(String)
    case malformed(String)
    case badSignature
    case expired
}

public enum SignedCursors {
    public static let minSecretBytes = 32
    public static let maxValues = 16

    private static func checkSecret(_ secret: [UInt8]) throws {
        guard secret.count >= minSecretBytes else { throw CursorError.invalidArgument("secret must be at least \(minSecretBytes) bytes") }
    }

    private static func mac(_ secret: [UInt8], _ body: [UInt8]) -> [UInt8] {
        Array(HMAC<SHA256>.authenticationCode(for: body, using: SymmetricKey(data: secret)))
    }

    /// Unpadded base64url decode; rejects `=`, other characters and impossible lengths. `strict` also rejects
    /// non-zero trailing bits.
    private static func base64URLDecode(_ s: ArraySlice<UInt8>, strict: Bool) -> [UInt8]? {
        guard !s.isEmpty, s.count % 4 != 1 else { return nil }
        var out: [UInt8] = []
        var acc: UInt32 = 0, bits: UInt32 = 0
        for c in s {
            let v: UInt8
            switch c {
            case UInt8(ascii: "A")...UInt8(ascii: "Z"): v = c - UInt8(ascii: "A")
            case UInt8(ascii: "a")...UInt8(ascii: "z"): v = c - UInt8(ascii: "a") + 26
            case UInt8(ascii: "0")...UInt8(ascii: "9"): v = c - UInt8(ascii: "0") + 52
            case UInt8(ascii: "-"): v = 62
            case UInt8(ascii: "_"): v = 63
            default: return nil
            }
            acc = (acc << 6) | UInt32(v)
            bits += 6
            if bits >= 8 {
                bits -= 8
                out.append(UInt8(truncatingIfNeeded: acc >> bits))
                acc &= (1 << bits) - 1
            }
        }
        return !strict || acc == 0 ? out : nil
    }

    /// Signs `values` (1-16 entries, none containing a newline) with an expiry in unix seconds.
    public static func encodeCursor(_ values: [String], secret: [UInt8], expiresAt: Int64) throws -> String {
        try checkSecret(secret)
        guard (1...maxValues).contains(values.count) else { throw CursorError.invalidArgument("values must contain 1 to \(maxValues) entries") }
        guard !values.contains(where: { $0.utf8.contains(0x0A) }) else { throw CursorError.invalidArgument("values must not contain a newline") }
        guard expiresAt > 0 else { throw CursorError.invalidArgument("expiresAt must be positive") }
        let body = Array("v1\n\(expiresAt)\n\(values.joined(separator: "\n"))".utf8)
        return base64URL(body) + "." + base64URL(mac(secret, body))
    }

    /// Verifies the MAC (constant time), header and expiry, returning the values.
    public static func decodeCursor(_ token: String, secret: [UInt8], now: Int64) throws -> [String] {
        try checkSecret(secret)
        let bytes = Array(token.utf8)
        guard let dot = bytes.lastIndex(of: 0x2E) else { throw CursorError.malformed("missing '.'") }
        let bodyPart = bytes[..<dot], sigPart = bytes[(dot + 1)...]
        guard let body = base64URLDecode(bodyPart, strict: true) else { throw CursorError.malformed("invalid body encoding") }
        // Trailing bits are not checked: a non-canonical signature fails the comparison below, so any change to the
        // signature text is reported as a bad signature.
        guard base64URLDecode(sigPart, strict: false) != nil else { throw CursorError.malformed("invalid signature encoding") }
        guard constantTimeEquals(Array(base64URL(mac(secret, body)).utf8), Array(sigPart)) else { throw CursorError.badSignature }
        let text = String(decoding: body, as: UTF8.self)
        guard Array(text.utf8) == body else { throw CursorError.malformed("body is not UTF-8") }
        let lines = body.split(separator: 0x0A, omittingEmptySubsequences: false).map { String(decoding: $0, as: UTF8.self) }
        guard lines.count >= 3, lines[0] == "v1" else { throw CursorError.malformed("unsupported version") }
        guard !lines[1].isEmpty, lines[1].utf8.allSatisfy({ $0 >= 0x30 && $0 <= 0x39 }), let expiresAt = Int64(lines[1]) else {
            throw CursorError.malformed("expiresAt is not decimal digits")
        }
        guard now < expiresAt else { throw CursorError.expired }
        return Array(lines[2...])
    }
}
