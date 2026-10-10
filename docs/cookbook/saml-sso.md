# SAML 2.0 single sign-on (service-provider side)

Act as a SAML **service provider (SP)**. The flow has two halves:

- Build an AuthnRequest and redirect the browser to the IdP (HTTP-Redirect
  binding).
- Validate the signed `SAMLResponse` POSTed back to your Assertion Consumer
  Service (ACS).

Every example wraps an established SAML/XML-DSig library. None of them
parses, canonicalizes or verifies XML signatures itself. Where a library skips
a required check, the wrapper adds it, reading values only from the
**verified** assertion.

Code lives in [`examples/cookbook/saml-sso/`](../../examples/cookbook/saml-sso/).
Each language exposes:

- `login redirect` returns the IdP URL plus the AuthnRequest **ID**. Store the
  ID server-side (session or shared cache).
- `validate ACS` takes the base64 `SAMLResponse` and the pending request ID(s),
  and returns the NameID or attributes. It throws on any failure and refuses
  when no request is pending.

## What to validate

1. **XML signature** over the Assertion (or the whole Response) with the IdP
   certificate you **pinned from its metadata**. Never use the certificate
   embedded in the message's `KeyInfo`. Allow SHA-256 or stronger.
2. **Issuer** equals the IdP entityID.
3. **Audience** (`AudienceRestriction`) contains your SP entityID.
4. **Recipient** (`SubjectConfirmationData/@Recipient`) equals your ACS URL,
   and **Destination** (`Response/@Destination`), when present, equals your
   ACS URL.
5. **Time**: `NotBefore` / `NotOnOrAfter` on Conditions and on
   SubjectConfirmationData, with small clock skew.
6. **InResponseTo** matches an AuthnRequest **you sent and have not yet
   consumed**. Remove the ID after one use, which rejects replays and
   unsolicited (IdP-initiated) responses. Keep IdP-initiated login off unless
   you need it.
7. **Replay**: remember assertion IDs until they expire if you run without
   the request-ID check. Use a shared store when you run more than one
   instance.
8. Signature-wrapping defense: read claims only from the element the library
   verified. Never re-parse the raw document and pick "the first Assertion".

Not exercised in any example: encrypted assertions, signed AuthnRequests,
Single Logout, metadata fetching or refresh, and artifact binding.

## Libraries

| Language | Library (version) | License | Install | Code | Tested here |
| --- | --- | --- | --- | --- | --- |
| TypeScript (Node 22) | `@node-saml/node-saml` 5.1.0 (+ `@xmldom/xmldom` 0.8.15) | MIT | `npm ci` | [typescript/](../../examples/cookbook/saml-sso/typescript/) | yes: `npm test` (1 pass), `npm run typecheck` clean, `npm audit --omit=dev` 0 vulnerabilities |
| Python 3.13 | `python3-saml` 1.16.0 (+ `xmlsec` 1.3.17, `lxml` 6.1.3) | MIT | `pip install -r requirements.txt` (xmlsec wheel bundles libxmlsec1) | [python/](../../examples/cookbook/saml-sso/python/) | yes: `python -m unittest -v test_saml_sp` (2 tests, 7 subtests) |
| Go | `github.com/crewjam/saml` v0.5.1 (goxmldsig v1.4.0) | BSD-2-Clause (goxmldsig: Apache-2.0) | `go mod download` | [go/](../../examples/cookbook/saml-sso/go/) | yes: `go vet ./... && go test ./...` |
| Rust | `samael` 0.0.22, feature `xmlsec` | MIT | needs system `libxmlsec1-dev`, `libxml2-dev`, `libclang-dev`, OpenSSL headers, `pkg-config`; then `cargo build` | [rust/](../../examples/cookbook/saml-sso/rust/) | yes: `cargo test`, after `apt-get install libxmlsec1-dev libxml2-dev libclang-dev` in this container |
| Java 21 | `spring-security-saml2-service-provider` 7.1.1 (OpenSAML 5.2.3) | Apache-2.0 | `mvn test` (pom adds the Shibboleth releases repo for OpenSAML) | [java/](../../examples/cookbook/saml-sso/java/) | yes: `mvn test` (1 pass) |
| Kotlin (JVM 21) | `spring-security-saml2-service-provider` 7.1.1 (OpenSAML 5.2.3) | Apache-2.0 | `gradle test` (Shibboleth repo in `build.gradle.kts`) | [kotlin/](../../examples/cookbook/saml-sso/kotlin/) | yes: `gradle test` (1 pass). Run with a local init script that tried `~/.m2` first because Maven Central returned HTTP 429; the committed build file is unchanged |
| C# (.NET 8) | `ITfoxtec.Identity.Saml2` 4.21.0 | BSD-3-Clause | `dotnet restore` | [csharp/](../../examples/cookbook/saml-sso/csharp/) | yes: `dotnet run` exits 0 (10 checks) |
| Dart | Not available | n/a | n/a | n/a | n/a |
| Swift | Not available | n/a | n/a | n/a | n/a |

Every test does the following:

1. Generates an IdP key and a self-signed certificate locally (`@peculiar/x509`,
   `cryptography`, `crypto/x509`, samael's openssl helper, JDK `keytool`,
   `CertificateRequest`).
2. Builds an AuthnRequest through the SP library and inflates it to check
   the ACS URL and ID.
3. Signs a Response in-process. Each language uses an IdP-side signer that is
   independent of the SP code where practical: xml-crypto, python3-saml's
   `add_sign`, goxmldsig, samael's IdP builder + xmlsec, the JDK XML DSig API,
   and ITfoxtec's IdP mode.
4. Checks acceptance of a valid response.
5. Checks rejection of: wrong audience, wrong Recipient, wrong Destination, an
   expired assertion, wrong InResponseTo, an untrusted signer, content changed
   after signing, and a replay or missing pending request.

The Rust test also rejects a SHA-1 digest and IdP metadata without a signing
key.

## Per-library notes (what the library does and does not do)

- **node-saml (TS)** checks the signature, Issuer, Audience, NotBefore and
  NotOnOrAfter, and InResponseTo (cache-backed and one-time with
  `validateInResponseTo: "always"`). It does **not** check Recipient or
  Destination, so the wrapper checks them, taking Recipient from
  `profile.getAssertionXml()` (the verified assertion). The default request-ID
  cache is in-memory, so pass a shared `cacheProvider` when you run more than
  one instance. Latest release is 5.1.0 (July 2025).
- **python3-saml** in strict mode checks the signature, Issuer, Audience,
  Destination, Recipient, time (fixed 300 s drift) and InResponseTo when you
  pass the request ID. It keeps **no replay cache**: pop the ID from the
  session. `wantAttributeStatement` defaults to true. The last PyPI release was
  October 2023. The actively released alternative is `pysaml2` 7.5.5
  (Apache-2.0), which shells out to the `xmlsec1` binary.
- **crewjam/saml** checks the signature, Destination, InResponseTo, Issuer,
  Status, Recipient, time (`MaxClockSkew` 180 s) and Audience. It **accepts an
  assertion with no AudienceRestriction**, so the wrapper requires one. Keep
  `AllowIDPInitiated` false.
- **samael** is pre-1.0. It **skips signature verification entirely when the
  IdP metadata has no signing certificate**; the wrapper refuses such
  metadata. It also accepts a missing AudienceRestriction (the wrapper
  requires one), and the wrapper pins `allowed_signature_algorithms`.
  samael's own IdP template uses a SHA-1 digest and no SubjectConfirmationData
  NotOnOrAfter, so the test overrides both. It needs the C libxmlsec1 at build
  and run time.
- **Spring Security SAML2 / OpenSAML 5** (`OpenSaml5AuthenticationProvider`)
  checks the signature, Issuer, Destination, InResponseTo against the stored
  request, Status, Conditions and Audience, and bearer
  Recipient/NotOnOrAfter. The wrapper uses it outside the filter chain:
  `Saml2AuthenticationToken` takes the **decoded** XML. In a Spring Boot app
  use `http.saml2Login()` instead. OpenSAML is published only to the
  Shibboleth Maven repository. The examples set
  `wantAuthnRequestsSigned(false)`; add an SP signing credential if the IdP
  requires signed requests.
- **ITfoxtec.Identity.Saml2** checks the signature against the pinned
  certificates (the wrapper sets `CertificateValidationMode.None` and pins
  instead of chain-building), Issuer (`AllowedIssuer`), Audience and
  NotOnOrAfter. It does **not** check Destination, Recipient or InResponseTo,
  which the wrapper adds. On .NET (Core) replay detection is a no-op without
  an `ITokenReplayCache`, so the wrapper supplies a single-process one; the
  replay case failed before it was added. `Sustainsys.Saml2` 2.11.0 (MIT) is
  an alternative with deeper ASP.NET integration.
- Not chosen: OneLogin `java-saml` (no release since February 2022).

## Not available

- **Dart** and **Swift**: no maintained, permissively licensed SAML SP
  library with XML-signature verification exists for either language. Do not
  hand-roll XML-DSig. Instead, choose one of:
  - Put an identity broker in front of the app. Keycloak (Apache-2.0),
    Authentik, or ZITADEL (Apache-2.0) can accept SAML from the enterprise
    IdP and issue OIDC to the app. The app then verifies OIDC tokens with the
    [OIDC recipe](oidc-token-verification.md) (Dart `jose`, Swift JWTKit).
  - Run SAML in a backend written in one of the languages above and give
    mobile or desktop clients an OIDC or session token.
