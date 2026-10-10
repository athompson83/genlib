# OIDC token verification (ID tokens and JWT access tokens)

Verify a signed OIDC ID token or JWT access token against the identity
provider's JWKS. Every example wraps a maintained JOSE library. None of them
implements JWS, JWK parsing or signature math itself. Each wrapper does only
four things:

- fixes the verification policy (allowed algorithms, `iss`, `aud`, required
  claims, small clock leeway);
- supplies the per-request `nonce` check, which no library can do for you;
- fills gaps where a library lacks JWKS caching, refetch on an unknown `kid`,
  or `nbf`;
- returns a typed failure instead of a boolean.

Code lives in [`examples/cookbook/oidc-token-verification/`](../../examples/cookbook/oidc-token-verification/).

## What to validate

1. **Signature** with a key from the issuer's JWKS, selected by `kid`.
2. **Algorithm allow-list** (for example `RS256`, `ES256`). Reject `none` and
   every `HS*` algorithm: a public JWKS key must never be accepted as an HMAC
   secret (the "alg confusion" attack). All wrappers refuse to be configured
   with HS*/none, and the tests check that an HS256 token is rejected.
3. **`iss`** exactly equal to the discovery document's `issuer`.
4. **`aud`** contains your `client_id` (ID token) or API identifier (access
   token). For ID tokens with several audiences, OIDC Core also expects `azp`.
   Check it if your IdP issues multi-audience tokens. None of the examples
   does this.
5. **`exp` / `nbf`** with a small leeway (the examples use 60 s by default, and
   the tests use 5 s). Require `exp`.
6. **`nonce`** equal to the value you stored with the authorization request
   (ID tokens; OIDC Core 3.1.3.7). Delete it after use.
7. **JWKS handling**: cache the key set, refetch when a token names an unknown
   `kid` (key rotation), and rate-limit those refetches so random `kid` values
   cannot turn your service into a request amplifier. Unknown `kid` after a
   refetch fails closed.

Out of scope (handle it in your OAuth client code): the authorization-code +
PKCE exchange itself, `at_hash`/`c_hash`, `auth_time`/`max_age`, token
revocation and introspection. For RFC 9068 access tokens, also check
`typ: at+jwt`.

## Libraries

| Language | Library (version) | License | Install | Code | Tested here |
| --- | --- | --- | --- | --- | --- |
| TypeScript (Node 22) | `jose` 6.2.12 | MIT | `npm ci` | [typescript/](../../examples/cookbook/oidc-token-verification/typescript/) | yes: `npm test` (1 pass, served JWKS from 127.0.0.1), `npm run typecheck` clean |
| Python 3.13 | `PyJWT[crypto]` 2.15.1 (+ `cryptography` 50.0.2) | MIT (cryptography: Apache-2.0 OR BSD-3-Clause) | `pip install -r requirements.txt` | [python/](../../examples/cookbook/oidc-token-verification/python/) | yes: `python -m unittest -v test_oidc_verify` (4 pass) |
| Go | `github.com/coreos/go-oidc/v3` v3.21.0, `github.com/go-jose/go-jose/v4` v4.1.5 | Apache-2.0 | `go mod download` (go.mod needs Go 1.25; the toolchain auto-downloads) | [go/](../../examples/cookbook/oidc-token-verification/go/) | yes: `go vet ./... && go test ./...` |
| Rust | `jsonwebtoken` 11.1.0 (feature `rust_crypto`), `ureq` 3.4.2 for the JWKS fetch | MIT; MIT OR Apache-2.0 | `cargo build` | [rust/](../../examples/cookbook/oidc-token-verification/rust/) | yes: `cargo test` (stub HTTP server on 127.0.0.1), `cargo clippy --all-targets` clean |
| Java 21 | `com.nimbusds:nimbus-jose-jwt` 10.10 | Apache-2.0 | `mvn test` | [java/](../../examples/cookbook/oidc-token-verification/java/) | yes: `mvn test` (1 pass, JDK HttpServer JWKS) |
| Kotlin (JVM 21) | `com.nimbusds:nimbus-jose-jwt` 10.10 | Apache-2.0 | `gradle test` (Gradle 8.14, Kotlin plugin 2.2.21) | [kotlin/](../../examples/cookbook/oidc-token-verification/kotlin/) | yes: `gradle test` (1 pass) |
| C# (.NET 8) | `Microsoft.IdentityModel.JsonWebTokens` 8.23.0, `Microsoft.IdentityModel.Protocols.OpenIdConnect` 8.23.0 | MIT | `dotnet restore` | [csharp/](../../examples/cookbook/oidc-token-verification/csharp/) | yes: `dotnet run` exits 0 (12 checks, discovery + JWKS served by HttpListener) |
| Dart 3 | `jose` 0.3.5+2, `http` 1.6.0 | BSD-3-Clause | `dart pub get` | [dart/](../../examples/cookbook/oidc-token-verification/dart/) | yes: `dart test` (1 pass), `dart analyze` clean |
| Swift 6.2 | `vapor/jwt-kit` (JWTKit) 5.7.1 | MIT | `swift build` | [swift/](../../examples/cookbook/oidc-token-verification/swift/) | yes: `swift test` on Linux (JWKS from the injected in-memory fetch closure; the default `URLSession` fetch was not exercised) |

Every test generates an RSA or EC key locally, signs tokens, and checks:
acceptance of a valid token (with nonce); rejection of wrong `aud`, wrong
`iss`, expired, future `nbf`, nonce mismatch, a tampered signature and an
HS256 token; acceptance just inside the leeway; refetch of the JWKS for a
rotated `kid`; and fail-closed for a `kid` that never appears.

## Per-library notes (what the library does and does not do)

- **jose (TS)**: `createRemoteJWKSet` caches, refetches on an unknown `kid`
  and rate-limits with `cooldownDuration` (default 30 s). `jwtVerify` checks
  alg, iss, aud, exp/nbf (`clockTolerance`) and required claims. Nonce is
  checked in the wrapper.
- **PyJWT**: `PyJWKClient` caches the JWK set (`lifespan`) and refetches once
  on an unknown `kid`, **with no cooldown**. Put a rate limit in front of it if
  untrusted callers can send arbitrary `kid` values.
- **go-oidc**: `RemoteKeySet` refetches on an unknown `kid`. `exp` has **no
  leeway** and `nbf` has a fixed 5-minute skew. The wrapper adds a small exp
  leeway by shifting `Config.Now`, so the nbf skew becomes 5 min minus leeway.
  go-oidc never checks `nonce`, so the wrapper does.
- **jsonwebtoken (Rust)**: verifies and validates claims but **does not fetch
  JWKS**. The wrapper adds a `kid`-keyed cache with TTL and refetch cooldown
  (ureq). `Validation::new(header.alg)` pins the alg after the allow-list
  check, and the library also requires the alg family to match the JWK. The
  `rust_crypto` backend verifies RSA through the `rsa` crate.
  RUSTSEC-2023-0071 (Marvin) affects RSA private-key operations, not
  verification. Use the `aws_lc_rs` feature if you prefer. The test also uses
  `rsa` (dev-dependency) for key generation.
- **Nimbus (Java/Kotlin)**: `JWKSourceBuilder` provides caching, refresh on
  an unknown `kid` and rate limiting (`rateLimited`). `DefaultJWTClaimsVerifier`
  checks iss (exact match), aud, required claims and `maxClockSkew`.
- **Microsoft.IdentityModel (C#)**: `ConfigurationManager` loads discovery
  plus JWKS, and `JsonWebTokenHandler` requests a refresh on an unknown `kid`
  (rate-limited by `RefreshInterval`). In 8.x that refresh runs **in the
  background** by default, so the first token signed with a new key fails. The
  `.csproj` sets `Switch.Microsoft.IdentityModel.UpdateConfigAsBlocking=true`
  so it succeeds immediately; without the switch the test's rotation case
  failed.
- **jose (Dart)**: verifies with an alg allow-list and checks exp (tolerance),
  iss and aud. It does **not** check `nbf` or require `exp`, and its URL key
  loader caches without refetching on an unknown `kid`. The wrapper adds all
  three.
- **JWTKit (Swift)**: verifies the signature with the JWK chosen by `kid`,
  but **falls back to a default key when the `kid` is unknown** and does not
  fetch JWKS. The wrapper owns the cache, requires a known `kid`, enforces the
  alg allow-list from the header and applies iss/aud/exp/nbf with leeway.

## Not available

None. All nine languages have a maintained, permissively licensed library.
