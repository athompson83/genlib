# Password hashing (Argon2id)

Store passwords as Argon2id hashes. Verify them in constant time. Upgrade old
hashes the next time the user signs in successfully. Every example wraps a
maintained library: none of them implements Argon2 or bcrypt itself.

Code lives in [`examples/cookbook/password-hashing/`](../../examples/cookbook/password-hashing/).
Each language exposes the same three operations:

- `hash(password)` returns a self-describing PHC string:
  `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`.
- `verify(stored, password)` returns `ok` plus an optional **replacement hash**.
  Save the replacement when it is present. It appears in two cases: the stored
  value used weaker Argon2 parameters, or it was a legacy bcrypt hash.
- A bcrypt helper, for platforms where Argon2 cannot be used and for reading
  legacy rows.

## Parameters

The [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
gives a minimum for Argon2id of **m = 19456 KiB (19 MiB), t = 2, p = 1**. Every
example uses that minimum, with a 16-byte random salt and a 32-byte output.
OWASP lists settings that cost the same: m=47104/t=1, m=12288/t=3, m=9216/t=4
and m=7168/t=5. Increase memory or time once you have measured what your
servers can sustain under login load.

Fallbacks:

- bcrypt with cost **at least 10** (the examples use 12). bcrypt only reads the
  first 72 bytes of input. The examples refuse longer input instead of
  truncating it silently.
- scrypt is acceptable (OWASP: N=2^17, r=8, p=1), but no example needs it.
- Use PBKDF2-HMAC-SHA256 with 600,000 iterations only when FIPS-140 compliance
  forbids everything else.

## Libraries

| Language | Library (version) | License | Install | Code | Tested here |
| --- | --- | --- | --- | --- | --- |
| TypeScript (Node 22) | `argon2` (node-argon2) 0.45.1; `bcryptjs` 3.0.3 | MIT; BSD-3-Clause | `npm ci` | [typescript/](../../examples/cookbook/password-hashing/typescript/) | yes: `npm test` (5 pass), `npx tsc -p tsconfig.json` clean |
| Python 3.13 | `argon2-cffi` 25.1.0; optional `bcrypt` 5.0.0 | MIT; Apache-2.0 | `pip install -r requirements.txt` | [python/](../../examples/cookbook/password-hashing/python/) | yes: `python -m unittest -v test_passwords` (5 pass) |
| Go 1.26 | `golang.org/x/crypto` v0.58.0 (`argon2`, `bcrypt`) | BSD-3-Clause | `go mod download` | [go/](../../examples/cookbook/password-hashing/go/) | yes: `go test ./...` (the go1.26.0 toolchain was downloaded automatically) |
| Rust | `argon2` 0.6.0 (RustCrypto); `bcrypt` 0.19.3 | MIT OR Apache-2.0; MIT | `cargo build` | [rust/](../../examples/cookbook/password-hashing/rust/) | yes: `cargo test --release` (5 pass) |
| Java 21 | `spring-security-crypto` 7.1.1 + `spring-core` 7.0.9 + `bcprov-jdk18on` 1.86 | Apache-2.0; Apache-2.0; MIT (Bouncy Castle) | `mvn -B test` | [java/](../../examples/cookbook/password-hashing/java/) | yes: `mvn -B test` (5 pass) |
| Kotlin 2.2.20 (JVM) | same as Java | as above | `mvn -B test` | [kotlin/](../../examples/cookbook/password-hashing/kotlin/) | yes: `mvn -B test` (5 pass) |
| C# (.NET 8) | `Geralt` 4.4.0 (libsodium `crypto_pwhash_str`; pulls `libsodium` 1.0.22 native); `BCrypt.Net-Next` 4.2.1 | MIT (libsodium: ISC); MIT | `dotnet restore` | [csharp/](../../examples/cookbook/password-hashing/csharp/) | yes: `dotnet run` (11 checks pass, linux-x64) |
| Dart 3.13 | `cryptography` 2.9.0 (pure-Dart `Argon2id`); `bcrypt` 1.2.0 | Apache-2.0; BSD-2-Clause-Views | `dart pub get` | [dart/](../../examples/cookbook/password-hashing/dart/) | yes: `dart test` (5 pass); `dart analyze` clean |
| Swift 6.2 | Argon2 reference C library (`P-H-C/phc-winner-argon2`, pinned to commit `f57e61e`) | CC0-1.0 OR Apache-2.0 | `swift build` | [swift/](../../examples/cookbook/password-hashing/swift/) | yes: `swift test` on Linux (4 pass) |

Each library was checked against its registry metadata (license, latest release,
no deprecation notice) in October 2026. Notes on choices and alternatives:

- **Go and Dart**: the library provides only the KDF (`argon2.IDKey`,
  `Argon2id.deriveKey`). The example adds PHC encoding and decoding, a
  constant-time comparison and bounds on the parameters it decodes.
  `github.com/alexedwards/argon2id` (MIT) wraps the same KDF, but its last
  release was v1.0.0 in 2023.
- **Java/Kotlin**: version 7 of `spring-security-crypto` needs `spring-core` at
  runtime, which supplies `StringUtils` and commons-logging; without it the code
  fails with `NoClassDefFoundError`. The values carry a `{argon2}` prefix from
  `DelegatingPasswordEncoder`, and unprefixed legacy bcrypt rows are matched too.
  `password4j` (Apache-2.0, 1.8.4, June 2025) is a lighter alternative with no
  Spring dependency.
- **C#**: Geralt wraps libsodium, which supplies `NeedsRehash`. libsodium always
  uses p=1. Alternatives: `Konscious.Security.Cryptography.Argon2` (MIT, 1.3.1,
  2024) provides only the raw KDF. `Isopoh.Cryptography.Argon2` 2.0.0 is
  licensed CC-BY-4.0, which is unusual for code and needs license review.
- **Dart**: `cryptography` runs Argon2 in pure Dart. The OWASP-parameter test
  finished in about a second on this machine. Benchmark it before using it for
  server-side login traffic. `dargon2` (FFI) was last released in 2022.
- **Swift**: neither swift-crypto nor CryptoKit includes Argon2. The example
  links the same reference C code that argon2-cffi bundles. That code has not
  had a release since 2019. It is stable but no longer developed. For legacy
  bcrypt rows in Swift, use `HummingbirdBcrypt` (hummingbird-auth 2.5.0,
  Apache-2.0) or Vapor's `Bcrypt`. They were left out because hummingbird-auth
  resolves about 27 packages.

## Interoperability finding (tested)

The examples cross-check hashes produced by other libraries for the password
`pw`:

- A canonical hash from argon2-cffi (`m=19456,t=2,p=1`) verified in TypeScript,
  Go, Rust, Java, Kotlin, C#, Dart and Swift.
- **node-argon2 0.45.1 writes its parameters as `m=…,p=…,t=…`** because
  `@phc/format` sorts the keys. Decoders built on the reference library only
  parse `m,t,p`. That covers argon2-cffi, libsodium (Geralt), Spring/Bouncy
  Castle and the Swift reference build, and all of them **reject** these hashes.
  The Go, Rust and Dart decoders accept either order. If you are moving hashes
  out of a Node service, re-order the parameters before verifying, or let users
  upgrade through a Node verifier. The tests record this behaviour.

## Security and correctness notes

- Always hash with a fresh random salt. The libraries do this for you; the Go
  and Dart examples use `crypto/rand` and `Random.secure()`.
- Verify by recomputing with the parameters stored in the hash, and compare in
  constant time. Never compare hashes with `==`.
- Treat a malformed or unknown hash as a failed login, not as a server error
  that reveals which accounts exist. Sanity-check decoded parameters (the Go
  and Dart decoders cap memory at 4 GiB) so a tampered row cannot exhaust memory.
- Upgrade only after a successful verification, and write the new hash in the
  same transaction that records the login.
- To stop users being locked out after a parameter change, compare old
  parameters with `<` rather than `!=`, so that stronger hashes are kept. The
  libsodium, argon2-cffi and node-argon2 helpers flag *any* difference, which is
  also safe.
- A pepper (an HMAC key held in a KMS or HSM) is optional defence in depth. If
  you add one, include a key version in the stored value.
- Rate-limit and throttle login attempts. Argon2's memory cost also makes
  hashing an amplification vector for denial of service, so limit concurrent
  hashing.
- These libraries do not handle password policy (minimum length, breached-password
  checks), account lockout, MFA, or encrypting backups.
