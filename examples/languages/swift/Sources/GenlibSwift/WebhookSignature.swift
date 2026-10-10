// SPDX-License-Identifier: Apache-2.0
// Stripe-style webhook signatures: header `t=<unix seconds>,v1=<hex HMAC-SHA256>` over "<t>.<body>". Verification
// accepts any matching v1 (key rotation), compares in constant time and enforces a timestamp tolerance.
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

public enum WebhookError: Error, Equatable {
    case invalidArgument(String)
    case malformed(String)
    case badSignature
    case expired
}

public enum WebhookSignature {
    public static let defaultToleranceSeconds: UInt64 = 300
    private static let hexDigits = Array("0123456789abcdef".utf8)

    private static func macHex(_ secret: [UInt8], _ timestamp: UInt64, _ body: [UInt8]) throws -> [UInt8] {
        guard !secret.isEmpty else { throw WebhookError.invalidArgument("secret must not be empty") }
        let mac = HMAC<SHA256>.authenticationCode(for: Array("\(timestamp).".utf8) + body, using: SymmetricKey(data: secret))
        return Array(mac).flatMap { [hexDigits[Int($0 >> 4)], hexDigits[Int($0 & 0x0f)]] }
    }

    /// Signature header for `body` at `timestampSeconds`.
    public static func signWebhook(secret: [UInt8], timestampSeconds: UInt64, body: [UInt8]) throws -> String {
        "t=\(timestampSeconds),v1=" + String(decoding: try macHex(secret, timestampSeconds, body), as: UTF8.self)
    }

    private static func trim(_ s: Substring) -> Substring {
        let isSpace: (Character) -> Bool = { $0 == " " || $0 == "\t" }
        guard let first = s.firstIndex(where: { !isSpace($0) }), let last = s.lastIndex(where: { !isSpace($0) }) else { return "" }
        return s[first...last]
    }

    /// Verifies `header` for `body`: exactly one decimal t, at least one v1 (64 lowercase hex; other schemes ignored),
    /// any v1 matching in constant time, and |now - t| <= toleranceSeconds. The signature is checked before the
    /// timestamp, so a tampered request is reported as badSignature.
    public static func verifyWebhook(header: String, body: [UInt8], secret: [UInt8], nowSeconds: UInt64,
                                     toleranceSeconds: UInt64 = defaultToleranceSeconds) throws {
        guard !secret.isEmpty else { throw WebhookError.invalidArgument("secret must not be empty") }
        var timestamp: UInt64? = nil
        var signatures: [[UInt8]] = []
        for item in header.split(separator: ",", omittingEmptySubsequences: false) {
            guard let eq = item.firstIndex(of: "=") else { throw WebhookError.malformed("each item must be key=value") }
            let key = trim(item[..<eq]), value = trim(item[item.index(after: eq)...])
            switch key {
            case "t":
                guard timestamp == nil else { throw WebhookError.malformed("more than one t") }
                guard !value.isEmpty, value.utf8.count <= 19, value.utf8.allSatisfy({ $0 >= 0x30 && $0 <= 0x39 }),
                      let t = UInt64(value) else { throw WebhookError.malformed("t must be decimal seconds") }
                timestamp = t
            case "v1":
                let v = Array(value.utf8)
                guard v.count == 64, v.allSatisfy({ ($0 >= 0x30 && $0 <= 0x39) || ($0 >= 0x61 && $0 <= 0x66) }) else {
                    throw WebhookError.malformed("v1 must be 64 lowercase hex characters")
                }
                signatures.append(v)
            default:
                continue
            }
        }
        guard let t = timestamp else { throw WebhookError.malformed("missing t") }
        guard !signatures.isEmpty else { throw WebhookError.malformed("missing v1") }
        let expected = try macHex(secret, t, body)
        var matched = false
        for sig in signatures { matched = constantTimeEquals(expected, sig) || matched }
        guard matched else { throw WebhookError.badSignature }
        let skew = nowSeconds >= t ? nowSeconds - t : t - nowSeconds
        guard skew <= toleranceSeconds else { throw WebhookError.expired }
    }
}
