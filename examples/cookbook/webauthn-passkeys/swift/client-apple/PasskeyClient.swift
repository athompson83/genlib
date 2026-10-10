// SPDX-License-Identifier: Apache-2.0
// Native iOS 16+/macOS 13+ client using AuthenticationServices. Not part of the
// SwiftPM package (AuthenticationServices is Apple-only); add to an app target.
// Requirements: Associated Domains entitlement "webcredentials:example.com" and
// https://example.com/.well-known/apple-app-site-association listing the app.
// The server then sees origin "https://example.com" in clientDataJSON.
import AuthenticationServices
import Foundation

@MainActor
final class PasskeyClient: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let provider: ASAuthorizationPlatformPublicKeyCredentialProvider
    private let anchor: ASPresentationAnchor
    private var continuation: CheckedContinuation<ASAuthorization, Error>?

    init(rpID: String, anchor: ASPresentationAnchor) {
        provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpID)
        self.anchor = anchor
    }

    /// `challenge` and `userID` come from the server's registration options.
    /// Returns the JSON body the server's verifyRegistration expects.
    func register(challenge: Data, userID: Data, userName: String) async throws -> [String: Any] {
        let request = provider.createCredentialRegistrationRequest(challenge: challenge, name: userName, userID: userID)
        request.userVerificationPreference = .required
        let auth = try await perform(request)
        guard let reg = auth.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration,
              let attestation = reg.rawAttestationObject else { throw ASAuthorizationError(.failed) }
        let id = reg.credentialID.base64URL
        return ["id": id, "rawId": id, "type": "public-key", "clientExtensionResults": [:],
                "authenticatorAttachment": "platform",
                "response": ["clientDataJSON": reg.rawClientDataJSON.base64URL,
                             "attestationObject": attestation.base64URL,
                             "transports": ["internal", "hybrid"]]]
    }

    /// Usernameless sign-in; returns the JSON body for verifyAuthentication.
    func signIn(challenge: Data) async throws -> [String: Any] {
        let request = provider.createCredentialAssertionRequest(challenge: challenge)
        request.userVerificationPreference = .required
        let auth = try await perform(request)
        guard let a = auth.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
            throw ASAuthorizationError(.failed)
        }
        let id = a.credentialID.base64URL
        return ["id": id, "rawId": id, "type": "public-key", "clientExtensionResults": [:],
                "authenticatorAttachment": "platform",
                "response": ["clientDataJSON": a.rawClientDataJSON.base64URL,
                             "authenticatorData": a.rawAuthenticatorData.base64URL,
                             "signature": a.signature.base64URL,
                             "userHandle": a.userID.base64URL]]
    }

    private func perform(_ request: ASAuthorizationRequest) async throws -> ASAuthorization {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { anchor }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        continuation?.resume(returning: authorization)
        continuation = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }
}

private extension Data {
    var base64URL: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
