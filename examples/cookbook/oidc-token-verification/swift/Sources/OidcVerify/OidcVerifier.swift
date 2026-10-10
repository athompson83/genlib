// SPDX-License-Identifier: Apache-2.0
// Thin wrapper around Vapor JWTKit 5 for verifying OIDC ID tokens / JWT access tokens.
// JWTKit verifies the signature with the JWK selected by kid and decodes the claims; claim
// checks run in JWTPayload.verify. JWTKit does not fetch JWKS and falls back to a default key
// when the kid is unknown, so this actor owns the JWKS cache (refetch on unknown kid with a
// cooldown), requires a known kid, and enforces the alg allow-list from the header.
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import JWTKit

public struct OidcClaims: JWTPayload {
    public var iss: IssuerClaim
    public var sub: SubjectClaim
    public var aud: AudienceClaim
    public var exp: ExpirationClaim
    public var iat: IssuedAtClaim
    public var nbf: NotBeforeClaim?
    public var nonce: String?

    public init(iss: String, sub: String, aud: String, exp: Date, iat: Date, nbf: Date? = nil, nonce: String? = nil) {
        self.iss = .init(value: iss); self.sub = .init(value: sub); self.aud = .init(value: [aud])
        self.exp = .init(value: exp); self.iat = .init(value: iat); self.nbf = nbf.map { .init(value: $0) }; self.nonce = nonce
    }

    // Structural only; policy (iss/aud/time with leeway) is applied by OidcVerifier.
    public func verify(using _: some JWTAlgorithm) async throws {}
}

public enum OidcError: Error, Equatable {
    case algorithmNotAllowed(String), unknownKid(String), missingKid, issuer, audience, expired, notYetValid, nonce, jwksFetch(String)
}

public actor OidcVerifier {
    public typealias Fetch = @Sendable () async throws -> Data

    let issuer: String
    let audience: String
    let algorithms: Set<String>
    let leeway: TimeInterval
    let cacheTTL: TimeInterval
    let refetchCooldown: TimeInterval
    let fetch: Fetch

    private var keys = JWTKeyCollection()
    private var kids: Set<String> = []
    private var fetchedAt: Date?

    public init(issuer: String, audience: String, jwksURL: URL, algorithms: Set<String> = ["RS256", "ES256"],
                leeway: TimeInterval = 60, cacheTTL: TimeInterval = 600, refetchCooldown: TimeInterval = 30,
                fetch: Fetch? = nil) throws {
        if algorithms.contains(where: { $0 == "none" || $0.hasPrefix("HS") }) { throw OidcError.algorithmNotAllowed("HS*/none") }
        self.issuer = issuer; self.audience = audience; self.algorithms = algorithms
        self.leeway = leeway; self.cacheTTL = cacheTTL; self.refetchCooldown = refetchCooldown
        self.fetch = fetch ?? {
            let (data, resp) = try await URLSession.shared.data(from: jwksURL)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw OidcError.jwksFetch("HTTP status") }
            return data
        }
    }

    private func refresh(force: Bool) async throws {
        let now = Date()
        let stale = fetchedAt.map { now.timeIntervalSince($0) > cacheTTL } ?? true
        let canRefetch = fetchedAt.map { now.timeIntervalSince($0) >= refetchCooldown } ?? true
        guard stale || (force && canRefetch) else { return }
        let jwks = try JSONDecoder().decode(JWKS.self, from: try await fetch())
        let fresh = JWTKeyCollection()
        try await fresh.add(jwks: jwks)
        keys = fresh
        kids = Set(jwks.keys.compactMap { $0.keyIdentifier?.string })
        fetchedAt = now
    }

    /// Verifies `token`; pass the nonce stored with the authorization request, if any.
    public func verify(_ token: String, nonce: String? = nil) async throws -> OidcClaims {
        let header = try Self.header(token)
        guard let alg = header["alg"] as? String, algorithms.contains(alg) else {
            throw OidcError.algorithmNotAllowed(header["alg"] as? String ?? "?")
        }
        guard let kid = header["kid"] as? String else { throw OidcError.missingKid }
        try await refresh(force: !kids.contains(kid))
        guard kids.contains(kid) else { throw OidcError.unknownKid(kid) }

        let c = try await keys.verify(token, as: OidcClaims.self) // signature
        let now = Date()
        guard c.iss.value == issuer else { throw OidcError.issuer }
        guard c.aud.value.contains(audience) else { throw OidcError.audience }
        guard c.exp.value.addingTimeInterval(leeway) > now else { throw OidcError.expired }
        if let nbf = c.nbf, nbf.value > now.addingTimeInterval(leeway) { throw OidcError.notYetValid }
        // nonce binds an ID token to the authorization request (OIDC Core 3.1.3.7)
        if let nonce, c.nonce != nonce { throw OidcError.nonce }
        return c
    }

    static func header(_ token: String) throws -> [String: Any] {
        guard let part = token.split(separator: ".").first else { throw OidcError.missingKid }
        var b64 = part.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64), let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw OidcError.missingKid
        }
        return obj
    }
}
