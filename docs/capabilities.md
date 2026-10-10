# Capabilities: one task, every language

A capability is a common application task (MFA codes, SSO login, PDF filling, document editing, a safe calculator, ...) mapped to tested Genlib code in each supported language:

TypeScript, Python, Go, Rust, Java, Kotlin, C#, Dart and Swift.

The index lives in `resources/capabilities.json`. Each language entry points at code Genlib already ships, and comes with the command that copies it.

## Fastest path

```sh
# With a detected project, find picks that project's language and prints its copy command.
node "$GENLIB_ROOT"/bin/genlib.mjs quick totp two factor --target "$APP_ROOT"

# Without a project: list the capabilities and their language coverage, then inspect one language.
node "$GENLIB_ROOT"/bin/genlib.mjs capability list --json
node "$GENLIB_ROOT"/bin/genlib.mjs capability inspect oidc-pkce --language kotlin --json
```

Copying takes one command: `tools/recipe-install.mjs add` for TypeScript recipes, or `tools/language-modules.mjs add <id> --with-tests` for the other languages. Both refuse to overwrite existing files. Run the copied tests inside the consuming project.

<!-- genlib:capabilities:start -->
| Capability | Tier | TS | Py | Go | Rust | Java | Kotlin | C# | Dart | Swift | Guide |
| --- | --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| `totp` TOTP / HOTP MFA codes | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `oidc-pkce` SSO login request: OAuth 2.0 / OIDC authorization code + PKCE | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `recovery-codes` MFA recovery (backup) codes | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `calculator` Safe calculator and loan / interest math | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `form-schema` Form schema validation | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `seo-files` SEO files: sitemap.xml, robots.txt with AI-crawler rules, llms.txt | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `structured-data` Structured data: JSON-LD and meta / Open Graph tags | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `utm-links` UTM campaign links: build, parse and strip tracking | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `csv-safe` CSV read/write (RFC 4180) with formula-injection protection | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `money` Money in integer minor units: parse, format, rates and allocation | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `signed-cursors` Signed, expiring pagination cursors (HMAC-SHA256) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `ics-events` Calendar invites: RFC 5545 .ics events | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `ids` Sortable IDs: UUIDv7 and ULID | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `retry-backoff` Retry with exponential backoff and Retry-After | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `token-bucket` Token-bucket rate limiter (pure, injectable clock) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `semver` Semantic versions and npm-style ranges | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `cron-next` Cron schedules: next run time | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `wcag-contrast` WCAG color contrast | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `geo` Geo distance, geohash and bounding boxes | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `webhook-signature` Webhook signing and verification (HMAC-SHA256, t/v1 header) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `oidc-token-verification` OIDC ID token / JWT verification | library | yes | yes | yes | yes | yes | yes | yes | yes | yes | [oidc-token-verification.md](../docs/cookbook/oidc-token-verification.md) |
| `saml-sso` SAML 2.0 SSO (service provider) | library | yes | yes | yes | yes | yes | yes | yes | - | - | [saml-sso.md](../docs/cookbook/saml-sso.md) |
| `webauthn-passkeys` WebAuthn passkeys | library | yes | yes | yes | yes | yes | yes | yes | - | yes | [webauthn-passkeys.md](../docs/cookbook/webauthn-passkeys.md) |
| `password-hashing` Password hashing (Argon2id / bcrypt / scrypt) | library | yes | yes | yes | yes | yes | yes | yes | yes | yes | [password-hashing.md](../docs/cookbook/password-hashing.md) |
| `pdf-form-filling` PDF form filling | library | yes | yes | yes | yes | yes | yes | yes | - | untested | [pdf-form-filling.md](../docs/cookbook/pdf-form-filling.md) |
| `pdf-text-extraction` PDF parsing and text extraction | library | yes | yes | yes | yes | yes | yes | yes | yes | untested | [pdf-text-extraction.md](../docs/cookbook/pdf-text-extraction.md) |
| `docx-documents` Word (DOCX) document editing | library | yes | yes | yes | yes | yes | yes | yes | yes | - | [docx-documents.md](../docs/cookbook/docx-documents.md) |
| `rich-text-sanitization` Rich text / HTML sanitization | library | yes | yes | yes | yes | yes | yes | yes | yes | yes | [rich-text-sanitization.md](../docs/cookbook/rich-text-sanitization.md) |
<!-- genlib:capabilities:end -->

The table above is generated by `npm run docs:sync`.

## Tiers

The two tiers follow one rule: Genlib never reimplements a security protocol or a complex file format.

- **pure**: original, standard-library code with no dependencies beyond each platform's crypto primitives. It is tested against the published RFC vectors in every language (RFC 4226, RFC 6238, RFC 7636), and each language runs the same vectors in CI.
- **library**: a thin wrapper around the maintained library for each language, in `examples/cookbook/<capability>/<language>/` with a manifest that pins exact versions and a local test (no network or real identity provider: tests sign tokens, assertions and passkey responses locally, and generate their PDFs and documents in memory). `scripts/cookbook-test.sh <language>` runs them, and the `Cookbook` workflow runs every language in CI. Each guide in `docs/cookbook/` names the library, its version, its license and what was actually tested here. Where no maintained, permissively licensed library exists, the language is marked unavailable and the guide says what to use instead.

## Pure capability notes

**totp**
- `hotp`, `totp`, `verifyTotp` (accepts within ±window steps, constant-time), base32 encode/decode, `otpauthUri` and `generateSecret`.
- Store secrets encrypted at rest.
- Record the last accepted counter per user to block replay.
- Rate-limit verification.

**oidc-pkce**
- Covers the browser leg of SSO only: the PKCE verifier and S256 challenge, state and nonce, the authorization URL (https only, except localhost), callback parsing with a constant-time state check, and the token request body.
- Verify the returned ID token with the `oidc-token-verification` capability.
- Never decode a token to make an authorization decision.

**recovery-codes**
- Codes use the Crockford alphabet without I, L, O, U, with unbiased generation. Input is normalized (O→0, I/L→1).
- Store only the HMAC-SHA256 under a server key.
- Lookup is constant-time with no early exit. Delete a code after its first use.

**calculator**
- A tokenizer and recursive-descent evaluator; it never calls `eval` and has no reflection or code execution. Supports `+ - * / % ^`, parentheses and variables.
- Errors on unknown names, division by zero, unbalanced input, non-finite results and input over 1000 characters.
- Finance helpers: loan payment, amortization schedule (rounded to cents, final row closes the balance) and compound interest.

**form-schema**
- Ordered field schema covering string, number, integer, boolean, email and date, with required, length, range, pattern (full match) and enum rules.
- Error codes are stable and returned in a fixed order. Unknown fields are rejected unless allowed.
- Lengths count Unicode code points.
- Pair it with the UI form modules (`find form`) for client-side rendering. Keep this check on the server.

**seo-files**
- `sitemapXml` (XML-escaped, 2-space indentation, validated lastmod, changefreq and priority, at most 50,000 URLs), `robotsTxt` and `llmsTxt` ([llmstxt.org](https://llmstxt.org)).
- `robotsTxt` can append one group that allows or disallows the known AI crawlers (GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-Web, anthropic-ai, Google-Extended, PerplexityBot, CCBot, Bytespider, Applebot-Extended, Meta-ExternalAgent). It rejects newline injection.
- Output is byte-exact in every language.

**structured-data**
- `jsonLdScript` writes compact JSON in insertion order and escapes `<`, `>`, `&`, U+2028 and U+2029 as `\u003c`-style escapes, so the script cannot break out of the element.
- `metaTags` renders title, description, canonical, Open Graph and Twitter card tags with HTML escaping. canonical and image must be absolute https URLs.

**utm-links**
- `buildUtmUrl` appends `utm_*` in a fixed order. It replaces an existing parameter in place and keeps the fragment.
- `parseUtm` returns the present values in spec order; the first occurrence wins.
- `stripTracking` removes `utm_*` and click IDs (gclid, fbclid, msclkid, ttclid and others) while keeping other parameters and their encoding.

**csv-safe**
- `writeCsv` follows RFC 4180: CRLF after every record, and a field is quoted (with `"` doubled) when it contains a comma, quote, CR or LF, or starts or ends with a space.
- By default a field starting with `=`, `+`, `-`, `@`, TAB or CR gets a leading `'`, so a spreadsheet does not run it as a formula (OWASP CSV injection). Turn this off only for files no spreadsheet opens.
- `parseCsv` accepts CRLF or LF records, strips a leading BOM and handles quoted commas, newlines and doubled quotes. It rejects an unterminated quote, a bare quote inside a field and text after a closing quote, and never undoes neutralization.

**money**
- Amounts are integer minor units. Only listed ISO 4217 codes are accepted (2 decimals for USD, EUR and others; 0 for JPY, KRW and others; 3 for BHD, KWD and others), and `toMinor` refuses to round silently.
- `applyRate` multiplies by a decimal rate string with banker's rounding (half to even) on the exact product, without floating point.
- `allocate` splits a total by integer ratios with the largest-remainder method (ties to the earlier entry). Shares always add up to the total, and a zero ratio never receives a unit.
- Arithmetic is checked or uses big integers, so it never overflows silently.

**signed-cursors**
- A cursor is `base64url(body).base64url(HMAC-SHA256)`. The body holds a version, an expiry and the last sort-key values. Use a secret of at least 32 bytes from the server's secret store.
- `decodeCursor` compares the encoded signature in constant time, so changing any single character fails. Errors are distinguished as malformed, bad signature or expired, which lets an API answer 400 rather than 500.
- Cursors are opaque but not encrypted: do not put private data in the values.

**ics-events**
- `icsCalendar` writes a VCALENDAR with one VEVENT per event: UTC (`...Z`) or all-day dates, TEXT escaping of `\ ; ,` and newlines, and 75-octet line folding that never splits a UTF-8 character.
- It validates that end is after start, that both have the same kind and that the URL is absolute http(s). Serve the file as `text/calendar; charset=utf-8`.
- Keep `uid` stable for an event so calendar clients update it instead of duplicating it.

**ids**
- `uuidV7` and `ulid` build time-ordered IDs from a millisecond timestamp and 10 random bytes; `newUuidV7` and `newUlid` use the CSPRNG and the clock. `uuidV7Time` and `ulidTime` read the timestamp back, rejecting bad versions, variants and characters.
- Both sort by creation time, which keeps database indexes compact. They reveal the creation time, so do not use them where that is sensitive.

**retry-backoff**
- `backoffDelay` is full-jitter exponential backoff, `floor(random * min(cap, base * 2^attempt))`, capped before multiplying so large attempts cannot overflow.
- `retryAfterMs` reads a `Retry-After` header as delay-seconds or an IMF-fixdate. Retry only idempotent requests, and give up after a bounded number of attempts.

**token-bucket**
- A pure state machine in integer millitokens: `newBucket` starts full, and `take(state, now, cost, capacity, rate)` returns whether the request is allowed, the new state and the exact `retryAfterMs`. A clock moving backwards adds nothing.
- Keep the state per key in memory or in a shared store (with an atomic update) to rate-limit across instances.

**semver**
- Strict SemVer 2.0.0 parsing and ordering, and `satisfies` with npm-style ranges (`^`, `~`, x-ranges, hyphen ranges, `||`) desugared exactly like node-semver. A prerelease only matches a range that names a prerelease of the same version.

**cron-next**
- Five-field cron (lists, ranges, steps, Sunday as 0 or 7, no names). When both day-of-month and day-of-week are restricted, either may match (the Vixie rule). `nextRun` returns the next UTC minute strictly after the given time, and gives up after five years.

**wcag-contrast**
- WCAG 2.x relative luminance and contrast ratio for `#rgb` and `#rrggbb`, and `passes` for AA (4.5, large text 3) and AAA (7, large text 4.5), using the unrounded ratio.

**geo**
- `haversineMeters` (mean Earth radius 6,371,008.8 m), `geohashEncode` and `geohashDecode` with error bounds, and `boundingBox` for a radius query: filter rows by the box in the database, then by exact distance.
- Spherical distance is accurate to about 0.5%; use a geodesic library for surveying.

**webhook-signature**
- `signWebhook` writes a `t=<seconds>,v1=<hex HMAC-SHA256 of "t.body">` header. `verifyWebhook` accepts any matching `v1` (so secrets can rotate), compares in constant time and rejects timestamps outside the tolerance (300 s by default).
- Verify the exact raw body bytes before parsing JSON. Errors are `malformed`, `bad signature` or `expired`.

**check-digits**
- `luhnValid` and `luhnCheckDigit` for card and account numbers, `ibanValid` and `ibanFormat` (ISO 13616 mod 97, computed without big integers), `gtinValid` for GTIN-8/12/13/14 (EAN, UPC), and `isbn10Valid`, `isbn13Valid` and `isbn10To13`.
- Validators return false instead of throwing. A valid check digit proves the number is well formed, not that the card, account or book exists.

**signed-urls**
- `signUrl(path?query, secret, expires)` appends `expires=<seconds>&signature=<base64url HMAC-SHA256>`. `verifyUrl` checks it in constant time and returns `malformed`, `bad signature` or `expired` (valid through the expiry second).
- Sign the exact path and query the server will see. Keep the secret on the server and rotate it by accepting the old one for one expiry window.

**polyline**
- `encodePolyline` and `decodePolyline` for the Google encoded polyline algorithm at precision 5 (Google, Mapbox) or 6 (OSRM, Valhalla). Points are `(lat, lon)` in that order; decoding rejects bad characters and truncated input.

**tile-math**
- `lonLatToTile`, `tileBounds`, `tileToQuadkey`, `quadkeyToTile` and `lonLatToMercator` for XYZ (slippy-map) tiles and EPSG:3857, zoom 0 to 24. Latitudes are clamped to the Web Mercator limit of ±85.0511°.

**email-address**
- `emailValid` applies the WHATWG HTML "valid e-mail address" rule plus the 254/64-character limits, so `a@b` and `user.@example.com` pass, as they do in browsers. `emailNormalize` trims and lowercases only the domain.
- This checks syntax only. Prove ownership with a confirmation email; never lowercase or strip the local part.

**iso-duration**
- `parseDuration` (ISO 8601 `PnYnMnWnDTnHnMnS`, fractions only on seconds, at most 3 digits), `durationMilliseconds` (refuses years and months, whose length depends on the calendar) and `formatDuration`.

**geometry**
- `pointInPolygon` (points on an edge count as inside), `signedArea` (counter-clockwise positive), `centroid`, `simplify` (Douglas-Peucker) and `ringAreaSquareMeters` (spherical approximation used by Turf and Mapbox).
- Planar functions treat longitude and latitude as x and y: fine for geofences and small shapes; project first for large areas or areas near the poles.

**safe-redirect**
- `safeRedirect(target, allowedOrigins, fallback)` accepts a same-site path (not `//` or containing `\`) or an absolute http(s) URL whose origin exactly matches an allowed origin. Everything else, including `javascript:`, userinfo (`user@host`) and control characters, returns the fallback.

Behavior that differs by language (option objects versus keyword arguments, ordered-map types, async Web Crypto in TypeScript cursors and webhooks, null versus exceptions for an unparseable Retry-After) is noted at the top of each source file.

Learn any implementation's API without opening it: `genlib outline <capability> --language <lang>` lists its signatures and one-line docs.

## Adding a capability

1. Add tested code for each language: a recipe in `examples/recipes`, or a language module registered in `examples/languages/modules.json` (use `"base": "cookbook"` for `examples/cookbook`).
2. Add the entry to `resources/capabilities.json`. Use `kind: "unavailable"` with a note when a language has no responsible option.
3. Run `npm run docs:sync` and `npm test`. `tests/capability-index.test.mjs` checks that every implementation resolves to registered code.
