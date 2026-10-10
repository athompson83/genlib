// SPDX-License-Identifier: Apache-2.0
import XCTest
@testable import Passwords

final class PasswordsTests: XCTestCase {
    func testHashAndVerify() throws {
        let h = try Passwords.hash("correct horse battery staple")
        XCTAssertTrue(h.hasPrefix("$argon2id$v=19$m=19456,t=2,p=1$"), h)
        XCTAssertEqual(try Passwords.verify(h, "correct horse battery staple"), .init(ok: true, rehash: nil))
        XCTAssertFalse(try Passwords.verify(h, "wrong").ok)
        XCTAssertNotEqual(h, try Passwords.hash("correct horse battery staple"))
    }

    func testWeakParametersRehash() throws {
        let weak = try Passwords.hash("pw", memoryKiB: 8192, iterations: 1)
        let v = try Passwords.verify(weak, "pw")
        XCTAssertTrue(v.ok)
        XCTAssertTrue(v.rehash?.hasPrefix("$argon2id$v=19$m=19456,t=2,p=1$") ?? false)
    }

    func testCrossLibrary() throws {
        // argon2-cffi 25.1.0 output for "pw" verifies; node-argon2's m,p,t order does not.
        let cffi = "$argon2id$v=19$m=19456,t=2,p=1$ecqUURt5rXczDOhwQxrhZw$w2dzt0CPmUdvSjkaj1rGvX6AKzIZ19bg8BnDrVw4KQc"
        XCTAssertEqual(try Passwords.verify(cffi, "pw"), .init(ok: true, rehash: nil))
        let node = "$argon2id$v=19$m=19456,p=1,t=2$yicTHnSW1i8qRUmdNAbUyA$3x14rcRfaMq+Akio0EutaRBea5WF4RsLUtcQfs23CaA"
        XCTAssertFalse(try Passwords.verify(node, "pw").ok)
    }

    func testMalformed() throws {
        XCTAssertFalse(try Passwords.verify("not-a-hash", "pw").ok)
        XCTAssertFalse(try Passwords.verify("", "pw").ok)
    }
}
