// SPDX-License-Identifier: Apache-2.0
// Thin passkey relying party over swift-server/webauthn-swift (pre-1.0).
// The library performs the protocol checks. Store each challenge server-side
// and consume it once; persist StoredCredential per account.
import Foundation
import WebAuthn

public struct StoredCredential: Codable, Equatable, Sendable {
    public var credentialID: String // base64url, unique across all users
    public var userID: [UInt8]
    public var publicKeyCOSE: [UInt8]
    public var signCount: UInt32
    public var backedUp: Bool
}

public struct PasskeyService: Sendable {
    let manager: WebAuthnManager

    public init(rpID: String, rpName: String, origin: String) {
        manager = WebAuthnManager(configuration: .init(relyingPartyID: rpID, relyingPartyName: rpName, relyingPartyOrigin: origin))
    }

    /// Returns (JSON for navigator.credentials.create, challenge to store).
    /// webauthn-swift has no authenticatorSelection field, so it is added here
    /// to request a discoverable credential with user verification.
    public func registrationOptions(userID: [UInt8], userName: String) throws -> (json: Data, challenge: [UInt8]) {
        let options = manager.beginRegistration(user: .init(id: userID, name: userName, displayName: userName))
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(options)) as! [String: Any]
        object["authenticatorSelection"] = ["residentKey": "required", "requireResidentKey": true, "userVerification": "required"]
        return (try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), options.challenge)
    }

    /// `isUnused` must return false when the credential id is stored for any account.
    public func verifyRegistration(responseJSON: Data, challenge: [UInt8], userID: [UInt8],
                                   isUnused: @Sendable (String) async throws -> Bool) async throws -> StoredCredential {
        let response = try JSONDecoder().decode(RegistrationCredential.self, from: responseJSON)
        let credential = try await manager.finishRegistration(
            challenge: challenge,
            credentialCreationData: response,
            requireUserVerification: true,
            confirmCredentialIDNotRegisteredYet: isUnused)
        // Store the id in the same base64url form the assertion response uses.
        return StoredCredential(credentialID: response.id.asString(), userID: userID, publicKeyCOSE: credential.publicKey,
                                signCount: credential.signCount, backedUp: credential.isBackedUp)
    }

    /// Usernameless sign-in options (no allowCredentials) with user verification.
    public func authenticationOptions() throws -> (json: Data, challenge: [UInt8]) {
        let options = manager.beginAuthentication(userVerification: .required)
        return (try JSONEncoder().encode(options), options.challenge)
    }

    /// Verify an assertion against the stored row (look it up by the response id first).
    public func verifyAuthentication(responseJSON: Data, challenge: [UInt8], stored: StoredCredential) throws -> StoredCredential {
        let response = try JSONDecoder().decode(AuthenticationCredential.self, from: responseJSON)
        guard response.id.asString() == stored.credentialID else { throw WebAuthnError.invalidAssertionCredentialType }
        if let handle = response.response.userHandle, handle != stored.userID { throw WebAuthnError.invalidUserID }
        let verified = try manager.finishAuthentication(
            credential: response,
            expectedChallenge: challenge,
            credentialPublicKey: stored.publicKeyCOSE,
            credentialCurrentSignCount: stored.signCount,
            requireUserVerification: true)
        var updated = stored
        updated.signCount = verified.newSignCount
        updated.backedUp = verified.credentialBackedUp
        return updated
    }
}
