// SPDX-License-Identifier: Apache-2.0
import Foundation
import XCTest
import WebAuthn
@testable import Passkeys

final class PasskeysTests: XCTestCase {
    struct Fixture: Decodable {
        let rpId, origin, userId, credentialId, credentialPublicKeyCose: String
        let registrationChallenge, authenticationChallenge: String
        let expectedSignCountAfterAuthentication: UInt32
    }

    static let fixtureURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().appendingPathComponent("fixtures/passkey-es256-none.json")

    var raw: [String: Any] = [:]
    var fx: Fixture!
    var service: PasskeyService!

    override func setUpWithError() throws {
        let data = try Data(contentsOf: Self.fixtureURL)
        raw = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        fx = try JSONDecoder().decode(Fixture.self, from: data)
        service = PasskeyService(rpID: fx.rpId, rpName: "Example", origin: fx.origin)
    }

    func bytes(_ b64url: String) -> [UInt8] { URLEncodedBase64(b64url).decodedBytes ?? [] }
    func json(_ key: String) throws -> Data { try JSONSerialization.data(withJSONObject: raw[key]!) }

    func testOptions() throws {
        let a = try service.registrationOptions(userID: bytes(fx.userId), userName: "alice@example.com")
        let b = try service.registrationOptions(userID: bytes(fx.userId), userName: "alice@example.com")
        let obj = try JSONSerialization.jsonObject(with: a.json) as! [String: Any]
        XCTAssertEqual((obj["rp"] as! [String: Any])["id"] as? String, "example.com")
        XCTAssertEqual((obj["authenticatorSelection"] as! [String: Any])["userVerification"] as? String, "required")
        XCTAssertEqual(obj["challenge"] as? String, a.challenge.base64URLEncodedString().asString())
        XCTAssertNotEqual(a.challenge, b.challenge)
        XCTAssertGreaterThanOrEqual(a.challenge.count, 16)
        let get = try JSONSerialization.jsonObject(with: service.authenticationOptions().json) as! [String: Any]
        XCTAssertEqual(get["rpId"] as? String, "example.com")
        XCTAssertEqual(get["userVerification"] as? String, "required")
    }

    func testRecordedCeremony() async throws {
        let cred = try await service.verifyRegistration(
            responseJSON: json("registrationResponse"), challenge: bytes(fx.registrationChallenge),
            userID: bytes(fx.userId), isUnused: { _ in true })
        XCTAssertEqual(cred.credentialID, fx.credentialId)
        XCTAssertEqual(cred.publicKeyCOSE, bytes(fx.credentialPublicKeyCose))
        XCTAssertEqual(cred.signCount, 0)
        let updated = try service.verifyAuthentication(
            responseJSON: json("authenticationResponse"), challenge: bytes(fx.authenticationChallenge), stored: cred)
        XCTAssertEqual(updated.signCount, fx.expectedSignCountAfterAuthentication)
    }

    func testRejections() async throws {
        let reg = try json("registrationResponse")
        do {
            _ = try await service.verifyRegistration(responseJSON: reg, challenge: Array(repeating: 1, count: 32), userID: bytes(fx.userId), isUnused: { _ in true })
            XCTFail("wrong challenge accepted")
        } catch {}
        do {
            _ = try await service.verifyRegistration(responseJSON: reg, challenge: bytes(fx.registrationChallenge), userID: bytes(fx.userId), isUnused: { _ in false })
            XCTFail("duplicate credential id accepted")
        } catch {}
        let evil = PasskeyService(rpID: "example.com", rpName: "Example", origin: "https://evil.example")
        do {
            _ = try await evil.verifyRegistration(responseJSON: reg, challenge: bytes(fx.registrationChallenge), userID: bytes(fx.userId), isUnused: { _ in true })
            XCTFail("wrong origin accepted")
        } catch {}
        let cred = try await service.verifyRegistration(responseJSON: reg, challenge: bytes(fx.registrationChallenge), userID: bytes(fx.userId), isUnused: { _ in true })
        let auth = try json("authenticationResponse")
        XCTAssertThrowsError(try service.verifyAuthentication(responseJSON: auth, challenge: Array(repeating: 2, count: 32), stored: cred))
        var ahead = cred; ahead.signCount = 5
        XCTAssertThrowsError(try service.verifyAuthentication(responseJSON: auth, challenge: bytes(fx.authenticationChallenge), stored: ahead))
        var other = cred; other.userID = [1, 2, 3]
        XCTAssertThrowsError(try service.verifyAuthentication(responseJSON: auth, challenge: bytes(fx.authenticationChallenge), stored: other))
    }
}
