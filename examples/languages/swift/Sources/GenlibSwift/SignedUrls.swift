// SPDX-License-Identifier: Apache-2.0
// Expiring signed URLs: target + "expires=<unix seconds>" + "&signature=" + base64url(HMAC-SHA256(secret, message)),
// unpadded. Verification compares in constant time and reports malformed, badSignature or expired.
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

public enum SignedUrlError: Error, Equatable {
    case invalidArgument(String)
    case malformed(String)
    case badSignature
    case expired
}

public enum SignedUrls {
    private static let marker = Array("&signature=".utf8)

    private static func signature(_ secret: String, _ message: [UInt8]) throws -> [UInt8] {
        guard !secret.isEmpty else { throw SignedUrlError.invalidArgument("secret must not be empty") }
        let mac = HMAC<SHA256>.authenticationCode(for: message, using: SymmetricKey(data: Array(secret.utf8)))
        return Array(base64URL(mac).utf8)
    }

    /// Query parameters (name, value) of `target` after its first "?".
    private static func params(_ target: ArraySlice<UInt8>) -> [(ArraySlice<UInt8>, ArraySlice<UInt8>)] {
        guard let q = target.firstIndex(of: 0x3F) else { return [] }
        return target[(q + 1)...].split(separator: 0x26).map { part in
            if let eq = part.firstIndex(of: 0x3D) { return (part[..<eq], part[(eq + 1)...]) }
            return (part, part[part.endIndex...])
        }
    }

    /// Signs a path (plus optional query) starting with "/", without "#" and without expires/signature parameters.
    public static func signUrl(_ target: String, secret: String, expiresUnixSeconds: UInt64) throws -> String {
        let t = Array(target.utf8)
        guard t.first == 0x2F else { throw SignedUrlError.invalidArgument("target must start with /") }
        guard !t.contains(0x23) else { throw SignedUrlError.invalidArgument("target must not contain #") }
        for (name, _) in params(t[...]) where name.elementsEqual("expires".utf8) || name.elementsEqual("signature".utf8) {
            throw SignedUrlError.invalidArgument("target already has an expires or signature parameter")
        }
        let message = t + Array((t.contains(0x3F) ? "&" : "?").utf8) + Array("expires=\(expiresUnixSeconds)".utf8)
        return String(decoding: message + marker + (try signature(secret, message)), as: UTF8.self)
    }

    /// Verifies a signed URL at `nowUnixSeconds` (valid while now <= expires). The signature is checked before expiry.
    public static func verifyUrl(_ signed: String, secret: String, nowUnixSeconds: UInt64) throws {
        guard !secret.isEmpty else { throw SignedUrlError.invalidArgument("secret must not be empty") }
        let b = Array(signed.utf8)
        var split: Int? = nil
        if b.count >= marker.count {
            for i in stride(from: b.count - marker.count, through: 0, by: -1) where b[i..<(i + marker.count)].elementsEqual(marker) {
                split = i
                break
            }
        }
        guard let at = split else { throw SignedUrlError.malformed("missing signature") }
        let message = Array(b[..<at]), sig = Array(b[(at + marker.count)...])
        let isB64 = { (c: UInt8) in (0x41...0x5A).contains(c) || (0x61...0x7A).contains(c) || (0x30...0x39).contains(c) || c == 0x2D || c == 0x5F }
        guard sig.count == 43, sig.allSatisfy(isB64) else { throw SignedUrlError.malformed("signature must be 43 base64url characters") }
        let expires = params(message[...]).filter { $0.0.elementsEqual("expires".utf8) }
        guard expires.count == 1 else { throw SignedUrlError.malformed("expected exactly one expires parameter") }
        let value = expires[0].1
        guard !value.isEmpty, value.count <= 19, value.allSatisfy({ $0 >= 0x30 && $0 <= 0x39 }),
              let exp = UInt64(String(decoding: value, as: UTF8.self)) else {
            throw SignedUrlError.malformed("expires must be decimal seconds")
        }
        guard constantTimeEquals(try signature(secret, message), sig) else { throw SignedUrlError.badSignature }
        guard nowUnixSeconds <= exp else { throw SignedUrlError.expired }
    }
}
