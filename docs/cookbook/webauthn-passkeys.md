# WebAuthn passkeys (relying-party server)

These examples run the server side of passkey sign-in in each language. The
server generates registration options and verifies the result of
`navigator.credentials.create()`. It stores the credential id, COSE public key
and signature counter. It then generates authentication options and verifies
the result of `navigator.credentials.get()`. Every example is a thin wrapper
over the maintained WebAuthn library for its language: no example parses CBOR,
COSE, attestation or signatures itself.

Code lives in [`examples/cookbook/webauthn-passkeys/<language>/`](../../examples/cookbook/webauthn-passkeys/).
Each wrapper fixes the relying-party settings: RP ID, exact origins, required
user verification and, where the library allows it, a required discoverable
credential. It also returns or updates a storage record.

## How the tests verify real responses without an authenticator

[`fixtures/generate_fixture.py`](../../examples/cookbook/webauthn-passkeys/fixtures/generate_fixture.py)
acts as a software authenticator. It uses a throwaway P-256 key and records one
ceremony in
[`passkey-es256-none.json`](../../examples/cookbook/webauthn-passkeys/fixtures/passkey-es256-none.json)
(2 KB, public data only; the private key is discarded). The ceremony has two
parts: a `none`-attestation registration, with flags UP, UV, BE, BS and AT and
sign count 0, and one ES256 assertion with sign count 1. Both use RP ID
`example.com` and origin `https://example.com`.

Every test does the following:

1. Generates real options. It checks the RP ID, that user verification and
   discoverable credentials are required, and that each challenge is fresh,
   random and at least 16 bytes.
2. Passes the recorded registration response to the library's **real
   verification function**, with the recorded challenge as the expected
   challenge. It checks the stored credential id, COSE key and sign count.
3. Verifies the recorded assertion against the stored record and checks that
   the counter advances to 1.
4. Checks rejections: a wrong challenge, a wrong origin, and a stored counter
   ahead of the authenticator (a possible clone). Some languages also test a
   foreign user handle and a duplicate credential id.

Some libraries create the challenge inside opaque state. For those, the test
swaps the recorded challenge into genuinely generated state: Yubico uses
`toBuilder()`, Go uses `SessionData.Challenge`, C# sets `options.Challenge`,
and Rust uses serde with the dev-only `danger-allow-state-serialisation`
feature. Production code never does this.

## Libraries

| Language | Library (version) | License | Install | Code | Tested here |
| --- | --- | --- | --- | --- | --- |
| TypeScript (Node 22.18+) | `@simplewebauthn/server` 14.0.3 (+ `@simplewebauthn/browser` 14.0.0 for the client) | MIT | `npm ci` | [typescript/](../../examples/cookbook/webauthn-passkeys/typescript/) | yes: `npm test` (4 pass, Node 22.22); `npx tsc -p tsconfig.json` clean, including `client.browser.ts` |
| Python 3.13 | `webauthn` (py_webauthn) 3.0.1 | BSD-3-Clause | `pip install -r requirements.txt` | [python/](../../examples/cookbook/webauthn-passkeys/python/) | yes: `python -m unittest -v test_passkeys` (5 pass) |
| Go 1.26 | `github.com/go-webauthn/webauthn` v0.18.2 | BSD-3-Clause | `go mod download` | [go/](../../examples/cookbook/webauthn-passkeys/go/) | yes: `go vet ./... && go test ./...` (4 pass; GOTOOLCHAIN downloaded go1.26.0) |
| Rust | `webauthn-rs` 0.5.5 (Kanidm) | **MPL-2.0** | `cargo build` (needs OpenSSL headers) | [rust/](../../examples/cookbook/webauthn-passkeys/rust/) | yes: `cargo test` (4 pass, cargo 1.97) |
| Java 21 | `com.yubico:webauthn-server-core` 2.10.1 | BSD-2-Clause | `mvn -B test` | [java/](../../examples/cookbook/webauthn-passkeys/java/) | yes: `mvn -B test` (3 pass) |
| Kotlin 2.2.20 (JVM) | `com.yubico:webauthn-server-core` 2.10.1 | BSD-2-Clause | `mvn -B test` | [kotlin/](../../examples/cookbook/webauthn-passkeys/kotlin/) | yes: `mvn -B test` (3 pass) |
| C# (.NET 8) | `Fido2` (fido2-net-lib) 4.2.0 | MIT | `dotnet restore` | [csharp/](../../examples/cookbook/webauthn-passkeys/csharp/) | yes: `dotnet run` (16 checks pass) |
| Swift 6.2 (server) | `swift-server/webauthn-swift` 1.0.0-beta.1 | Apache-2.0 | `swift build` | [swift/](../../examples/cookbook/webauthn-passkeys/swift/) | yes: `swift test` on Linux (3 pass) |
| Swift (iOS 16+/macOS 13+ client) | AuthenticationServices (system) | Apple SDK | none | [swift/client-apple/](../../examples/cookbook/webauthn-passkeys/swift/client-apple/PasskeyClient.swift) | not run: Apple-only framework, not compiled on Linux |
| Dart | **Not available** | | | | not run |

Library status was checked on the registries on 2026-10-10. The latest releases
are: SimpleWebAuthn server, 2026-09-25; py_webauthn, 2026-09-25; go-webauthn,
2026-09-19; webauthn-rs, 2026-04-30; Yubico, 2026-10; Fido2, 2026-10-02;
webauthn-swift, 2025-10-14. None carries a deprecation notice.

### Gaps and caveats per language

- **Dart: not available.** pub.dev has no maintained WebAuthn relying-party
  (server) library. The `webauthn` package (0.2.5, 2024) is an authenticator
  model, not a server. Run verification in one of the server libraries above, or
  use an identity broker that supports passkeys (Keycloak, Auth0, Corbado and so
  on), and keep Dart for the client. On the client, Flutter's `passkeys` package
  (2.23.1, BSD-3-Clause, Corbado) uses the platform authenticator.
- **Rust (`webauthn-rs`)**: MPL-2.0 is file-level copyleft. Using the crate
  unmodified as a dependency is fine, but changes to its own files must be
  published under MPL-2.0. Flag this for license review in closed-source
  products. The library is deliberately opinionated: `start_passkey_registration`
  sets `residentKey: discouraged`, and user IDs are UUIDs. Usernameless sign-in
  needs the `conditional-ui` feature (`start_discoverable_authentication`). To
  keep ceremony state in a shared session store, enable
  `danger-allow-state-serialisation`.
- **Go (`go-webauthn`)**: a counter regression does not raise an error. The
  library sets `Authenticator.CloneWarning`, and the wrapper rejects such logins
  with `ErrPossibleClone`. Given an empty `RPID`, the library does not fail, so
  the wrapper rejects an empty RP ID itself.
- **Java/Kotlin (Yubico)**: you implement `CredentialRepository`. An in-memory
  example is included; map it to tables keyed by credential id and user handle.
  The backup-flag and transport accessors on `RegisteredCredential` are marked
  `@Deprecated`, which is how Yubico labels experimental API. They compile with
  warnings. Set `validateSignatureCounter(true)` so that counter regressions throw.
- **C# (Fido2)**: `ServerDomain` and `ServerName` are obsolete in 4.x. Use
  `RPID` and `RPName`. Your `IsCredentialIdUniqueToUserCallback` must query
  every user, not only the current one.
- **Swift (`webauthn-swift`)**: this is a pre-1.0 beta, so pin it exactly and
  review each upgrade. The options type has no `authenticatorSelection`, so the
  wrapper adds `residentKey`/`userVerification: required` to the JSON it sends.
  Only one origin is supported per manager.

## Client snippets

- Browser: [`typescript/client.browser.ts`](../../examples/cookbook/webauthn-passkeys/typescript/client.browser.ts)
  uses `startRegistration` / `startAuthentication` from `@simplewebauthn/browser`,
  including conditional UI (`useBrowserAutofill`, which needs
  `<input autocomplete="username webauthn">`). Without a library, use
  `PublicKeyCredential.parseCreationOptionsFromJSON()`,
  `parseRequestOptionsFromJSON()` and `credential.toJSON()` where supported.
- iOS/macOS: [`swift/client-apple/PasskeyClient.swift`](../../examples/cookbook/webauthn-passkeys/swift/client-apple/PasskeyClient.swift)
  uses `ASAuthorizationPlatformPublicKeyCredentialProvider`. It needs the
  Associated Domains entitlement `webcredentials:<rp-id>` and an
  `apple-app-site-association` file on the RP domain. The server then sees
  origin `https://<rp-id>`.
- Android: Credential Manager (`androidx.credentials`) returns the same JSON.
  Android apps report an `android:apk-key-hash:...` origin, which must be added
  to the server's allowed origins and to `assetlinks.json`.

## Security notes

- **The RP ID and origins are fixed server configuration.** Never take them from
  the request. The RP ID must equal the origin's host or a registrable suffix of
  it. List exact origins, including the scheme and any port.
- **Challenges**: generate them on the server (16 bytes or more, from a
  cryptographic RNG; the libraries do this). Bind each one to the session, give
  it a short expiry, and **use it once**: delete it before or during
  verification, whatever the result.
- **User verification**: passkeys used as a single factor must require UV in
  both the options and the verification call (`requireUserVerification` /
  `require_user_verification` / `VerificationRequired`).
- **Credential ids are unique across all accounts.** Reject a registration whose
  id already exists. During sign-in, look the credential up by id and check
  that the `userHandle` in the response maps to the same account.
- **Signature counter**: store it. Reject an assertion whose non-zero counter is
  not greater than the stored value (possible cloned authenticator), then save
  the new value. Synced passkeys often report 0 every time, which is allowed.
- **Attestation**: these examples request `none`, which suits consumer passkeys.
  To restrict authenticator models, request `direct` attestation, configure the
  library's trust roots or FIDO MDS, and check AAGUIDs. None of that is enabled
  here.
- **What the libraries do not do**: session or cookie management, account
  recovery, rate limiting, storing challenges, persisting credentials, or
  Related Origin Requests (`/.well-known/webauthn`) unless configured. You must
  build these.
- Record and show the backup flags (BE/BS) if your policy treats synced and
  device-bound passkeys differently.
