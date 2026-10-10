// SPDX-License-Identifier: Apache-2.0
// Local-only test: ES256 keys generated here; the JWKS is served from memory through the
// injectable fetch closure (the default closure uses URLSession).
import Foundation
import JWTKit
import XCTest
@testable import OidcVerify

final class Box: @unchecked Sendable {
    let lock = NSLock()
    var jwks: [[String: String]] = []
    var fetches = 0
    func data() -> Data {
        lock.lock(); defer { lock.unlock() }
        fetches += 1
        return try! JSONSerialization.data(withJSONObject: ["keys": jwks])
    }
    func add(_ k: ES256PrivateKey, kid: String) {
        let p = k.publicKey.parameters!
        lock.lock(); jwks.append(["kty": "EC", "crv": "P-256", "x": p.x, "y": p.y, "kid": kid, "alg": "ES256", "use": "sig"]); lock.unlock()
    }
}

final class OidcVerifierTests: XCTestCase {
    let iss = "https://idp.example.test", aud = "client-123"

    func sign(_ k: ES256PrivateKey, kid: String, exp: TimeInterval = 300, nbf: TimeInterval = 0,
              iss: String? = nil, aud: String? = nil) async throws -> String {
        let signer = JWTKeyCollection()
        await signer.add(ecdsa: k, kid: JWKIdentifier(string: kid))
        let now = Date()
        return try await signer.sign(OidcClaims(iss: iss ?? self.iss, sub: "user-1", aud: aud ?? self.aud,
            exp: now.addingTimeInterval(exp), iat: now, nbf: now.addingTimeInterval(nbf), nonce: "n-1"), kid: JWKIdentifier(string: kid))
    }

    func rejects(_ v: OidcVerifier, _ token: String, nonce: String? = nil, _ name: String) async {
        do { _ = try await v.verify(token, nonce: nonce); XCTFail("\(name) accepted") } catch {}
    }

    func testVerifyAndReject() async throws {
        let box = Box()
        let k1 = ES256PrivateKey()
        box.add(k1, kid: "k1")
        let v = try OidcVerifier(issuer: iss, audience: aud, jwksURL: URL(string: "https://idp.example.test/jwks")!,
                                 leeway: 5, refetchCooldown: 0, fetch: { box.data() })

        let ok = try await v.verify(try await sign(k1, kid: "k1"), nonce: "n-1")
        XCTAssertEqual(ok.sub.value, "user-1")
        await rejects(v, try await sign(k1, kid: "k1", aud: "other"), "aud")
        await rejects(v, try await sign(k1, kid: "k1", iss: "https://evil.test"), "iss")
        await rejects(v, try await sign(k1, kid: "k1", exp: -30, nbf: -60), "expired")
        await rejects(v, try await sign(k1, kid: "k1", nbf: 120), "nbf")
        await rejects(v, try await sign(k1, kid: "k1"), nonce: "other", "nonce")
        _ = try await v.verify(try await sign(k1, kid: "k1", exp: -2, nbf: -60)) // within leeway
        let good = try await sign(k1, kid: "k1")
        await rejects(v, String(good.dropLast(4)) + (good.hasSuffix("AAAA") ? "BBBB" : "AAAA"), "tampered")
        let hs = JWTKeyCollection()
        await hs.add(hmac: "x-secret-x-secret-x-secret-x-sec", digestAlgorithm: .sha256, kid: "k1")
        let hsToken = try await hs.sign(OidcClaims(iss: iss, sub: "x", aud: aud, exp: Date().addingTimeInterval(60), iat: Date()), kid: "k1")
        await rejects(v, hsToken, "HS256")
        // a key the verifier has never seen, signed with the known kid, must fail the signature check
        await rejects(v, try await sign(ES256PrivateKey(), kid: "k1"), "wrong key same kid")

        let before = box.fetches
        let k2 = ES256PrivateKey()
        box.add(k2, kid: "k2")
        _ = try await v.verify(try await sign(k2, kid: "k2"))
        XCTAssertGreaterThan(box.fetches, before)
        await rejects(v, try await sign(ES256PrivateKey(), kid: "nope"), "unknown kid")
        XCTAssertThrowsError(try OidcVerifier(issuer: iss, audience: aud, jwksURL: URL(string: "https://x")!, algorithms: ["HS256"]))
    }
}
