// SPDX-License-Identifier: Apache-2.0
// Argon2id password hashing over the Argon2 reference C library.
// OWASP Password Storage Cheat Sheet minimum: m=19456 KiB, t=2, p=1.
// Output is a PHC string: $argon2id$v=19$m=19456,t=2,p=1$salt$hash.
// swift-crypto/CryptoKit have no Argon2. For legacy bcrypt rows use a
// maintained bcrypt (HummingbirdBcrypt or Vapor's Bcrypt) and rehash on success.
import argon2

#if canImport(Security)
import Security
#endif

public enum Passwords {
    public static let memoryKiB: UInt32 = 19_456
    public static let iterations: UInt32 = 2
    public static let parallelism: UInt32 = 1
    static let saltLength = 16
    static let hashLength = 32

    public enum Failure: Error { case randomUnavailable, hashing(Int32) }

    static func randomSalt() throws -> [UInt8] {
        var salt = [UInt8](repeating: 0, count: saltLength)
        #if canImport(Security)
        guard SecRandomCopyBytes(kSecRandomDefault, salt.count, &salt) == errSecSuccess else { throw Failure.randomUnavailable }
        #else
        var rng = SystemRandomNumberGenerator() // getrandom(2) / arc4random on supported platforms
        for i in salt.indices { salt[i] = UInt8.random(in: .min ... .max, using: &rng) }
        #endif
        return salt
    }

    public static func hash(_ password: String, memoryKiB m: UInt32 = memoryKiB, iterations t: UInt32 = iterations) throws -> String {
        let salt = try randomSalt()
        let pwd = Array(password.utf8)
        let length = argon2_encodedlen(t, m, parallelism, UInt32(saltLength), UInt32(hashLength), Argon2_id)
        var encoded = [CChar](repeating: 0, count: length)
        let rc = argon2id_hash_encoded(t, m, parallelism, pwd, pwd.count, salt, salt.count, hashLength, &encoded, length)
        guard rc == ARGON2_OK.rawValue else { throw Failure.hashing(rc) }
        return String(decoding: encoded.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) }, as: UTF8.self)
    }

    /// `ok` plus a replacement hash to persist when parameters are outdated.
    public struct Verified: Equatable, Sendable {
        public let ok: Bool
        public let rehash: String?
    }

    public static func verify(_ stored: String, _ password: String) throws -> Verified {
        let pwd = Array(password.utf8)
        // Reference decoder: accepts only the canonical m,t,p parameter order.
        guard argon2id_verify(stored, pwd, pwd.count) == ARGON2_OK.rawValue else {
            return Verified(ok: false, rehash: nil)
        }
        return Verified(ok: true, rehash: needsRehash(stored) ? try hash(password) : nil)
    }

    static func needsRehash(_ stored: String) -> Bool {
        let fields = stored.split(separator: "$")
        guard fields.count == 5, fields[0] == "argon2id" else { return true }
        var params: [Substring: UInt32] = [:]
        for kv in fields[2].split(separator: ",") {
            let pair = kv.split(separator: "=")
            if pair.count == 2, let v = UInt32(pair[1]) { params[pair[0]] = v }
        }
        return (params["m"] ?? 0) < memoryKiB || (params["t"] ?? 0) < iterations
    }
}
