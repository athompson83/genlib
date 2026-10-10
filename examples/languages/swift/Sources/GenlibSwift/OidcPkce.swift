// SPDX-License-Identifier: Apache-2.0
// Scope: builds and checks the browser leg of OAuth 2.0 authorization code + PKCE (OIDC) only.
// ID token and access token VERIFICATION must use a vetted library (see the Tier B cookbook).
// Never decode a token to make an auth decision here.
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

public enum OidcError: Error, Equatable {
    case invalidArgument(String)
    /// Authorization-server error or callback check failure (`state_mismatch`, `missing_code`, `invalid_callback`).
    case callback(error: String, description: String?)
}

public struct AuthorizationRequest: Sendable {
    public var authorizationEndpoint: String
    public var clientId: String
    public var redirectUri: String
    /// Scope values; entries may also be space-separated strings.
    public var scope: [String]
    public var state: String
    public var nonce: String
    public var codeChallenge: String
    public var extraParams: [(String, String)]

    public init(authorizationEndpoint: String, clientId: String, redirectUri: String, scope: [String], state: String,
                nonce: String, codeChallenge: String, extraParams: [(String, String)] = []) {
        self.authorizationEndpoint = authorizationEndpoint; self.clientId = clientId; self.redirectUri = redirectUri
        self.scope = scope; self.state = state; self.nonce = nonce; self.codeChallenge = codeChallenge; self.extraParams = extraParams
    }
}

public enum OidcPkce {
    private static let unreserved = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~".utf8)

    /// RFC 7636 code verifier of 43-128 unreserved characters (unbiased CSPRNG selection).
    public static func generateCodeVerifier(length: Int = 64) throws -> String {
        guard (43...128).contains(length) else { throw OidcError.invalidArgument("verifier length must be 43-128") }
        var rng = SystemRandomNumberGenerator()
        return String(decoding: (0..<length).map { _ in unreserved[Int.random(in: 0..<unreserved.count, using: &rng)] }, as: UTF8.self)
    }

    /// base64url(SHA-256(ASCII verifier)) without padding.
    public static func codeChallengeS256(_ verifier: String) throws -> String {
        let bytes = Array(verifier.utf8)
        guard (43...128).contains(bytes.count), bytes.allSatisfy(unreserved.contains) else {
            throw OidcError.invalidArgument("verifier must be 43-128 unreserved characters")
        }
        return base64URL(SHA256.hash(data: bytes))
    }

    /// Random base64url token without padding for state and nonce (16-256 bytes).
    public static func randomToken(bytes: Int = 32) throws -> String {
        guard (16...256).contains(bytes) else { throw OidcError.invalidArgument("token must be 16-256 bytes") }
        return base64URL(secureRandomBytes(bytes))
    }

    public static func buildAuthorizationURL(_ request: AuthorizationRequest) throws -> String {
        let endpoint = request.authorizationEndpoint
        try checkEndpoint(endpoint)
        let scopes = request.scope.flatMap { $0.split(separator: " ").map(String.init) }
        guard scopes.contains("openid") else { throw OidcError.invalidArgument("scope must contain openid") }
        for (name, value) in [("clientId", request.clientId), ("redirectUri", request.redirectUri), ("state", request.state),
                              ("nonce", request.nonce), ("codeChallenge", request.codeChallenge)] where value.isEmpty {
            throw OidcError.invalidArgument("\(name) is required")
        }
        var params: [(String, String)] = [
            ("response_type", "code"), ("client_id", request.clientId), ("redirect_uri", request.redirectUri),
            ("scope", scopes.joined(separator: " ")), ("state", request.state), ("nonce", request.nonce),
            ("code_challenge", request.codeChallenge), ("code_challenge_method", "S256"),
        ]
        for (key, value) in request.extraParams {
            guard !key.isEmpty else { throw OidcError.invalidArgument("extra parameter name is required") }
            guard !params.contains(where: { $0.0 == key }) else {
                throw OidcError.invalidArgument("extra parameter '\(key)' would override a protocol parameter")
            }
            params.append((key, value))
        }
        let query = params.map { "\(percentEncode($0.0))=\(percentEncode($0.1))" }.joined(separator: "&")
        let separator = !endpoint.contains("?") ? "?" : (endpoint.hasSuffix("?") || endpoint.hasSuffix("&")) ? "" : "&"
        return endpoint + separator + query
    }

    /// Returns the authorization code after checking error, code presence and state (constant time).
    public static func parseCallback(_ callbackURL: String, expectedState: String) throws -> String {
        guard !expectedState.isEmpty else { throw OidcError.invalidArgument("expectedState is required") }
        var rest = Substring(callbackURL)
        if let hash = rest.firstIndex(of: "#") { rest = rest[..<hash] }
        let query = rest.firstIndex(of: "?").map { rest[rest.index(after: $0)...] } ?? ""
        var values: [String: String] = [:]
        for pair in query.split(separator: "&") where !pair.isEmpty {
            let parts = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            guard let key = formDecode(String(parts[0])), let value = formDecode(parts.count > 1 ? String(parts[1]) : "") else {
                throw OidcError.callback(error: "invalid_callback", description: "malformed percent-encoding")
            }
            guard values[key] == nil else { throw OidcError.callback(error: "invalid_callback", description: "duplicate parameter '\(key)'") }
            values[key] = value
        }
        if let error = values["error"] { throw OidcError.callback(error: error, description: values["error_description"]) }
        guard let code = values["code"], !code.isEmpty else { throw OidcError.callback(error: "missing_code", description: nil) }
        guard constantTimeEquals(Array((values["state"] ?? "").utf8), Array(expectedState.utf8)) else {
            throw OidcError.callback(error: "state_mismatch", description: nil)
        }
        return code
    }

    /// application/x-www-form-urlencoded body for the token request.
    public static func tokenRequestBody(code: String, redirectUri: String, clientId: String, codeVerifier: String) throws -> String {
        guard !code.isEmpty, !redirectUri.isEmpty, !clientId.isEmpty, !codeVerifier.isEmpty else {
            throw OidcError.invalidArgument("code, redirectUri, clientId and codeVerifier are required")
        }
        func f(_ v: String) -> String { percentEncode(v, spaceAsPlus: true) }
        return "grant_type=authorization_code&code=\(f(code))&redirect_uri=\(f(redirectUri))&client_id=\(f(clientId))&code_verifier=\(f(codeVerifier))"
    }

    /// Requires https, or http only for localhost/127.0.0.1; rejects fragments, whitespace and userinfo.
    private static func checkEndpoint(_ endpoint: String) throws {
        let lower = endpoint.lowercased()
        let isHTTPS = lower.hasPrefix("https://"), isHTTP = lower.hasPrefix("http://")
        guard isHTTPS || isHTTP, !endpoint.contains("#"), !endpoint.contains(where: { $0.isWhitespace }) else {
            throw OidcError.invalidArgument("authorizationEndpoint must be an absolute http(s) URL without fragment")
        }
        let afterScheme = lower.dropFirst(isHTTPS ? 8 : 7)
        let authority = afterScheme.prefix { $0 != "/" && $0 != "?" }
        guard !authority.contains("@") else { throw OidcError.invalidArgument("authorizationEndpoint must not contain userinfo") }
        var host = authority
        if let colon = host.lastIndex(of: ":"), !host.hasSuffix("]") { host = host[..<colon] }
        guard !host.isEmpty else { throw OidcError.invalidArgument("authorizationEndpoint must have a host") }
        if isHTTP && host != "localhost" && host != "127.0.0.1" {
            throw OidcError.invalidArgument("authorizationEndpoint must use https (http only for localhost/127.0.0.1)")
        }
    }
}
