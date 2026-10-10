// SPDX-License-Identifier: Apache-2.0
// HOTP (RFC 4226) and TOTP (RFC 6238) one-time passwords with RFC 4648 base32 helpers.
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

public enum OtpAlgorithm: String, Sendable {
    case sha1 = "SHA1", sha256 = "SHA256", sha512 = "SHA512"
}

public enum TotpError: Error, Equatable {
    case invalidArgument(String)
    case invalidBase32Character(Character)
}

public enum Totp {
    private static let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".utf8)

    /// HOTP code using dynamic truncation, zero-padded to `digits` (6-10).
    public static func hotp(secret: [UInt8], counter: UInt64, digits: Int = 6, algorithm: OtpAlgorithm = .sha1) throws -> String {
        guard !secret.isEmpty else { throw TotpError.invalidArgument("secret must not be empty") }
        guard (6...10).contains(digits) else { throw TotpError.invalidArgument("digits must be between 6 and 10") }
        let message = (0..<8).map { UInt8(truncatingIfNeeded: counter >> (56 - 8 * UInt64($0))) }
        let key = SymmetricKey(data: secret)
        let mac: [UInt8]
        switch algorithm {
        case .sha1: mac = Array(HMAC<Insecure.SHA1>.authenticationCode(for: message, using: key))
        case .sha256: mac = Array(HMAC<SHA256>.authenticationCode(for: message, using: key))
        case .sha512: mac = Array(HMAC<SHA512>.authenticationCode(for: message, using: key))
        }
        let offset = Int(mac[mac.count - 1] & 0x0f)
        let binary = (UInt64(mac[offset] & 0x7f) << 24) | (UInt64(mac[offset + 1]) << 16)
            | (UInt64(mac[offset + 2]) << 8) | UInt64(mac[offset + 3])
        var modulus: UInt64 = 1
        for _ in 0..<digits { modulus *= 10 }
        let text = String(binary % modulus)
        return String(repeating: "0", count: digits - text.count) + text
    }

    /// TOTP code for `unixSeconds`.
    public static func totp(secret: [UInt8], unixSeconds: Int64, step: Int64 = 30, digits: Int = 6,
                            algorithm: OtpAlgorithm = .sha1, t0: Int64 = 0) throws -> String {
        try hotp(secret: secret, counter: counter(unixSeconds, step, t0), digits: digits, algorithm: algorithm)
    }

    /// Verifies `code` within ±`window` steps using constant-time comparison.
    public static func verify(code: String, secret: [UInt8], unixSeconds: Int64, window: Int = 1, step: Int64 = 30,
                              digits: Int = 6, algorithm: OtpAlgorithm = .sha1, t0: Int64 = 0) throws -> Bool {
        guard (0...10).contains(window) else { throw TotpError.invalidArgument("window must be between 0 and 10") }
        let supplied = Array(code.utf8)
        guard supplied.count == digits, supplied.allSatisfy({ $0 >= 48 && $0 <= 57 }) else { return false }
        let current = try counter(unixSeconds, step, t0)
        var matched = false
        for delta in -window...window {
            if delta < 0 && UInt64(-delta) > current { continue }
            let c = delta < 0 ? current - UInt64(-delta) : current + UInt64(delta)
            let expected = Array(try hotp(secret: secret, counter: c, digits: digits, algorithm: algorithm).utf8)
            matched = constantTimeEquals(expected, supplied) || matched
        }
        return matched
    }

    /// RFC 4648 base32 without padding.
    public static func base32Encode(_ data: [UInt8]) -> String {
        var out: [UInt8] = []
        var buffer: UInt32 = 0, bits = 0
        for b in data {
            buffer = (buffer << 8) | UInt32(b); bits += 8
            while bits >= 5 { out.append(alphabet[Int((buffer >> UInt32(bits - 5)) & 31)]); bits -= 5 }
        }
        if bits > 0 { out.append(alphabet[Int((buffer << UInt32(5 - bits)) & 31)]) }
        return String(decoding: out, as: UTF8.self)
    }

    /// Case-insensitive base32 decode ignoring spaces, hyphens and trailing '='.
    public static func base32Decode(_ text: String) throws -> [UInt8] {
        var cleaned = text.filter { $0 != " " && $0 != "-" }
        while cleaned.last == "=" { cleaned.removeLast() }
        var out: [UInt8] = []
        var buffer: UInt32 = 0, bits = 0
        for ch in cleaned {
            guard let ascii = ch.asciiValue,
                  let value = alphabet.firstIndex(of: ascii >= 97 && ascii <= 122 ? ascii - 32 : ascii)
            else { throw TotpError.invalidBase32Character(ch) }
            buffer = ((buffer << 5) | UInt32(value)) & 0xfff; bits += 5
            if bits >= 8 { out.append(UInt8((buffer >> UInt32(bits - 8)) & 0xff)); bits -= 8 }
        }
        return out
    }

    /// otpauth:// provisioning URI for authenticator apps.
    public static func otpauthURI(issuer: String, account: String, secretBase32: String, digits: Int = 6,
                                  period: Int = 30, algorithm: OtpAlgorithm = .sha1) throws -> String {
        guard !issuer.isEmpty, !account.isEmpty else { throw TotpError.invalidArgument("issuer and account are required") }
        guard try !base32Decode(secretBase32).isEmpty else { throw TotpError.invalidArgument("secret is required") }
        guard (6...10).contains(digits), period > 0 else { throw TotpError.invalidArgument("invalid digits or period") }
        let i = percentEncode(issuer)
        return "otpauth://totp/\(i):\(percentEncode(account))?secret=\(secretBase32)&issuer=\(i)"
            + "&algorithm=\(algorithm.rawValue)&digits=\(digits)&period=\(period)"
    }

    /// `bytes` (16-128) random bytes from `SystemRandomNumberGenerator`.
    public static func generateSecret(bytes: Int = 20) throws -> [UInt8] {
        guard (16...128).contains(bytes) else { throw TotpError.invalidArgument("secret must be 16-128 bytes") }
        return secureRandomBytes(bytes)
    }

    private static func counter(_ unixSeconds: Int64, _ step: Int64, _ t0: Int64) throws -> UInt64 {
        guard step > 0 else { throw TotpError.invalidArgument("step must be positive") }
        guard unixSeconds >= t0 else { throw TotpError.invalidArgument("time precedes t0") }
        return UInt64((unixSeconds - t0) / step)
    }
}
