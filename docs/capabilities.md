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

Copying takes one command: `tools/recipe-install.mjs add` for TypeScript recipes (one file in `genlib/`, or `--into <dir>`), or `tools/language-modules.mjs add <id> --with-tests` (Python adds `--flat`; `--into <dir>` chooses the folder) for the other languages, which prints the copied paths, the public signatures and the test command. Both record what they copy in `.genlib/lock.json` with a receipt, reuse an identical file another installed capability already brought (such as Swift's shared `Encoding.swift`), and refuse to overwrite untracked or edited files; `remove <id>` keeps files another capability still needs ([lifecycle.md](lifecycle.md#after-installing-receipts-updates-and-rollback)). Run the copied tests inside the consuming project.

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
| `check-digits` Check digits: Luhn, IBAN, GTIN/EAN/UPC and ISBN | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `signed-urls` Signed, expiring URLs (HMAC-SHA256) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `polyline` Encoded polylines (Google polyline algorithm) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `tile-math` Web map tile math: slippy tiles, quadkeys, Web Mercator | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `email-address` Email address validation and normalization | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `iso-duration` ISO 8601 durations | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `geometry` Polygon geometry: point in polygon, area, centroid, simplification | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `safe-redirect` Safe redirects (open-redirect guard) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `ip-cidr` IP addresses, CIDR ranges and SSRF guard | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `http-range` HTTP Range requests (byte ranges, 206 and 416) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `content-negotiation` Content negotiation: Accept and Accept-Language | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `http-conditional` ETags and conditional requests (304, 412) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `cookies` Cookies: Set-Cookie and Cookie headers | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `url-normalize` URL normalization (RFC 3986) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `string-similarity` String similarity: Levenshtein, Damerau, Jaro-Winkler | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `rrule` Recurring events: RFC 5545 RRULE expansion | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `base-encodings` Base32, Base58 and Base64url encoding | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `vcard` vCard 4.0 contact export (.vcf) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `hashing` Non-cryptographic hashing and jump consistent hashing | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `feature-flags` Feature flags: deterministic rollout and A/B variants | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `human-units` Human-readable bytes, durations and relative times | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `line-diff` Line diff and unified diff output | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `password-policy` Password policy checks (NIST SP 800-63B) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `text-sanitize` Text sanitizing and Trojan Source (bidi) detection | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `slugify` URL slugs: slugify titles and make them unique | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `json-patch` JSON Patch, JSON Pointer and merge patch (RFC 6902, 6901, 7396) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `sse` Server-sent events: parse and format event streams | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `text-chunking` Text chunking for retrieval (RAG) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `vector-math` Vector similarity: cosine, top-k and MMR | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `circuit-breaker` Circuit breaker (closed, open, half-open) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `business-days` Business days: add, count and check with holidays | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `natural-sort` Natural sort order (file2 before file10) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `file-signature` File type detection from magic bytes | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `color` Color conversion: hex, RGB, HSL and OKLCH | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `glob-match` Glob pattern matching for file paths | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `dotenv` .env file parsing | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `query-string` URL query string parse and build | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `mime-types` MIME type lookup by file extension | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `data-uri` data: URLs (RFC 2397) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `iso-week` ISO 8601 week dates | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `topo-sort` Topological sort and dependency order | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `link-header` HTTP Link header (pagination links) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `content-disposition` Content-Disposition header for downloads | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `cache-control` Cache-Control header parse and build | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `punycode` Punycode and internationalized domain names | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `base58` Base58 and Base58Check | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `roman-numerals` Roman numerals | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `dotted-path` Dotted-path get, set and delete on nested data | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `template-render` Logic-less templates (Mustache subset) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `ini-parse` INI file parse and write | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `pii-mask` PII masking and redaction | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `password-generate` Password and passphrase generation | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `html-escape` HTML escape, unescape and tag stripping | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `url-template` URI templates (RFC 6570) | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `bloom-filter` Bloom filter | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `stats-summary` Descriptive statistics and percentiles | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `interval-merge` Interval merge, intersect and gaps | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `shell-quote` Shell quoting and splitting | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `number-to-words` Numbers to English words | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `pagination-window` Pagination page numbers | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `text-wrap` Text wrapping and truncation | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `markdown-table` Markdown tables | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
| `ndjson` NDJSON / JSON Lines | pure | yes | yes | yes | yes | yes | yes | yes | yes | yes | [capabilities.md](../docs/capabilities.md) |
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

## Adoption steps

`genlib capability inspect <id> --language <lang> --json` (MCP: `genlib_capability` with `language`) returns, besides the copy `commands`, an ordered plan the agent can execute and check:

```json
{
  "steps": [
    { "kind": "copy", "run": "node \"$GENLIB_ROOT\"/tools/language-modules.mjs add java-dotted-path --target \"$APP_ROOT\" --with-tests", "cwd": "\"$APP_ROOT\"", "purpose": "Copy genlib/java/DottedPath.java, genlib/java/JsonPatch.java, genlib/java/DottedPathTest.java (refuses to overwrite)." },
    { "kind": "test", "run": "cd genlib/java && out=$(mktemp -d) && javac --release 17 -d \"$out\" DottedPath.java JsonPatch.java DottedPathTest.java && java -cp \"$out\" DottedPathTest", "cwd": "\"$APP_ROOT\"", "purpose": "Run the copied tests; they check the shared vectors." }
  ],
  "verify": "test",
  "onFailure": ["A vector mismatch means the copy was edited or a dependency version differs from the one pinned; diff against the Genlib source.", "..."]
}
```

Step kinds are `copy`, `install` (run in the folder holding the copied manifest), `integrate` (what the project must do by hand), `test` and `check`. A `test` step is emitted only where the copied files run on their own (Python, Go, Java and Kotlin, each run end to end in a fresh app by the test suite). Rust, C#, Dart and Swift get an `integrate` step and a build `check`, because their tests live in Genlib's harness. TypeScript recipes and modules end with a typecheck or `genlib verify`. `verify` names the acceptance step. Steps appear only for a single language, which keeps the all-languages view small.

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

**ip-cidr**
- `parseIp`/`canonicalIp` (strict IPv4, RFC 4291 IPv6 text, RFC 5952 output), `cidrContains` (rejects CIDRs with host bits set; IPv4 and IPv6 never match each other) and `isPublicIp`, which rejects private, loopback, link-local (including the 169.254.169.254 metadata address), CGNAT, multicast, reserved and documentation ranges, and judges IPv4-mapped and NAT64 addresses by their embedded IPv4.
- For SSRF protection, resolve the hostname yourself, check every resolved address, connect to the address you checked (no second lookup), and check again after each redirect. Go and Rust return false for unparseable input; the other languages raise an error.

**http-range**
- `parseRange(header, size)` returns `none` (serve 200 with the whole body), `unsatisfiable` (416 with `Content-Range: bytes */size`) or the inclusive byte ranges in header order; `contentRange` writes the 206 header. More than 100 ranges or any malformed range ignores the header.

**content-negotiation**
- `negotiateMediaType` and `negotiateLanguage` pick the available value with the highest q from the most specific matching range (`text/csv;q=0` excludes CSV even with `text/*`), preferring earlier available entries on ties; a missing header returns the first available value. Send `Vary: Accept` or `Vary: Accept-Language` with the response.

**http-conditional**
- `parseEtags`, strong and weak comparison, and `evaluateConditional`, which applies If-Match, If-Unmodified-Since, If-None-Match and If-Modified-Since in the RFC 9110 order and returns 200, 304 or 412. Use If-Match on PUT/PATCH/DELETE to prevent lost updates.

**cookies**
- `serializeCookie` writes `Set-Cookie` with attributes in a fixed order and refuses unsafe combinations (SameSite=None or Partitioned without Secure, `__Secure-`/`__Host-` prefix violations, characters outside cookie-octet: encode values yourself). `parseCookieHeader` returns ordered pairs, keeping duplicates.

**url-normalize**
- `normalizeUrl` canonicalizes http(s) URLs (lowercase scheme and host, default port removed, dot segments resolved, percent-encoding normalized, fragment dropped) for cache keys and de-duplication; `removeDotSegments` is RFC 3986 section 5.2.4. It is not a safety check: pair it with `safe-redirect` or `ip-cidr`.

**string-similarity**
- `levenshtein`, `damerauOsa`, `jaro`, `jaroWinkler` and `similarityRatio` over Unicode code points (so "café" and "cafe" differ by one). They are O(n·m); cap input length for user-supplied strings.

**rrule**
- `expandRRule(dtstart, rule, limit)` expands DAILY, WEEKLY, MONTHLY and YEARLY rules with INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY and BYMONTH in UTC, using python-dateutil's model: each period (day, Monday-start week, month or year) is filtered by every BY part given, so BYDAY works with any frequency, BYDAY with BYMONTHDAY intersects (Friday the 13th), and BYMONTH or BYMONTHDAY narrow DAILY and WEEKLY rules. Ordinals such as `2TU` and `-1FR` count within the month for MONTHLY (or YEARLY with BYMONTH, as in US Thanksgiving `FREQ=YEARLY;BYMONTH=11;BYDAY=4TH`) and within the year otherwise (`20MO`). Without BYDAY or BYMONTHDAY, WEEKLY repeats dtstart's weekday, MONTHLY its day of month and YEARLY its date, skipping dates that do not exist (31 April, 29 February). The 28 shared vectors were checked against python-dateutil, and the reference agreed with it on 3,000 random rules. Rejected: BYSETPOS, BYHOUR and the other time-of-day parts, WKST, EXDATE, COUNT with UNTIL, ordinals with DAILY or WEEKLY, and plain and ordinal weekdays mixed in one BYDAY (python-dateutil accepts that mix but intersects the two lists, so `FREQ=MONTHLY;BYDAY=MO,1TU` yields nothing; RFC 5545 means their union, so Genlib refuses rather than guess). Convert local times to UTC around daylight-saving changes yourself.

**base-encodings**
- `base32Encode`/`base32Decode` (RFC 4648 standard and extended-hex alphabets, padded or not), `base58Encode`/`base58Decode` (Bitcoin alphabet, leading zero bytes as "1") and unpadded `base64UrlEncode`/`base64UrlDecode`. Decoders are strict: they reject wrong padding, unknown characters and non-canonical trailing bits, so one value has one encoding.

**vcard**
- `buildVcard(contact)` writes RFC 6350 vCard 4.0 (FN, N, ORG, TITLE, EMAIL, TEL, ADR, URL, NOTE, UID) with text escaping, TYPE parameters and 75-octet folding. Serve it as `text/vcard; charset=utf-8` with a `.vcf` file name.

**hashing**
- `crc32`, `fnv1a32`, `fnv1a64`, `murmur3_32` and `jumpHash` (Lamping and Veach) for checksums, sharding and stable bucketing. They are not cryptographic: use HMAC or a password hash for anything an attacker can influence.

**feature-flags**
- `evaluateFlag(flag, userId)` applies disabled, deny, allow and a sticky percentage rollout (FNV-1a bucket of `key:userId` out of 10,000), then picks a weighted variant. The same user always gets the same answer, raising the percentage only adds users, and the result carries the reason and bucket for logs and experiment analysis.

**human-units**
- `formatBytes` (SI kB or IEC KiB, integer rounding, 64-bit safe), `parseBytes`, `formatDuration` ("1h 2m") and `relativeTime` ("3 minutes ago", "in 2 days"; English only, localize with Intl or ICU for other languages).

**line-diff**
- `diffLines` returns equal/removed/added lines and `unifiedDiff` writes a valid unified diff (hunks, three lines of context by default, "No newline at end of file") that `patch` applies to reproduce the new text. The edit script is minimal: lines that occur only in one file are set aside, then Myers' linear-space algorithm (written from the 1986 paper, not from GNU diffutils) compares the rest in O((N+M)·D) time and O(N+M) memory, so two 100,000-line files with a few edits diff in well under a second. Changed runs are then slid down, and moved next to a change in the other file when that shows a replacement. Output equalled GNU `diff -u` on about 95% of our 3,000 small random inputs (the previous LCS version: about 86%), and on 82% of an independent agent's 1,500 differently shaped inputs, so do not promise byte-identical GNU output; call the system `diff` when a test pins GNU bytes. Inputs above 1,000,000 lines in total are rejected.

**slugify**
- `slugify(text, separator, maxLength)` lowercases, transliterates Latin accents through one fixed 190-entry table (U+00C0 to U+017F: é→e, ß→ss, Ł→L, Æ→AE), joins words across apostrophes and combining marks ("don't" → `dont`), turns every other character into a separator, and truncates at a word boundary. Characters outside the table (CJK, emoji, Cyrillic) are dropped, so every language returns the same slug; keep a non-Latin title's id-based fallback in the app. `uniqueSlug(base, taken)` returns base, base-2, base-3 ... (the first free one). TypeScript also has the older `slugify-and-unique-slug` recipe with an options object, a Unicode mode and an "item" fallback.

**json-patch**
- `applyPatch(doc, patch)` applies RFC 6902 (add, remove, replace, move, copy, test) atomically and returns a new document; `getPointer` resolves RFC 6901 pointers; `mergePatch` applies RFC 7396; `createPatch(a, b)` returns a deterministic patch (object keys in code point order, arrays compared by index, so it is correct but not the shortest for inserted array items); `canonical` prints compact JSON with sorted keys. Java, Kotlin, Swift and Rust include a strict RFC 8259 parser because their standard libraries have none (Swift's avoids Foundation's number/boolean ambiguity). Numbers compare numerically (1 equals 1.0, true never equals 1); use the test vectors' integers when values cross languages.

**sse**
- `SseParser.feed(chunk)` turns server-sent event text into `{event, data, id}` events as it arrives, following the WHATWG rules: CRLF, CR or LF line endings even when a CRLF is split across chunks, comments, multi-line data, an id that persists until changed, and `retry` as the parser's reconnection delay. An unterminated final event is dropped, as browsers do. `formatSse(data, event, id, retry)` and `formatComment(text)` write events and keep-alive pings; serve them as `text/event-stream` with caching disabled.

**text-chunking**
- `chunkText(text, maxChars, overlap)` splits at the largest boundary that fits (paragraph, line, sentence, word, then code point), packs pieces greedily, trims each chunk and can repeat whole trailing pieces of the previous chunk as overlap. Lengths are code points, not model tokens, so leave a margin under the embedding model's limit.

**vector-math**
- `dot`, `norm`, `cosine`, `normalize`, `topK(query, vectors, k)` (best first, ties by index) and `mmr(query, vectors, k, lambda)` for relevance-plus-diversity re-ranking. Brute force is right for thousands of vectors; beyond that use an approximate index such as HNSW or pgvector.

**circuit-breaker**
- `CircuitBreaker(failureThreshold, cooldownMs, halfOpenMax)` with `allow(now)`, `recordSuccess(now)`, `recordFailure(now)`, `state(now)` and `retryAfterMs(now)`. The clock is passed in, so it is deterministic in tests and works with any HTTP client; pair it with `retry-backoff` and only retry idempotent requests.

**business-days**
- `addBusinessDays(date, n, holidays, weekend)`, `businessDaysBetween(start, end, holidays, weekend)` (counts `[start, end)`, negative when reversed) and `isBusinessDay` over ISO dates. The weekend is configurable (Friday/Saturday, Sunday only); the holiday list is yours to supply per country and year.

**natural-sort**
- `naturalCompare(a, b)` and `naturalSort(list)` order embedded numbers by value of any length (file2 before file10, v1.9 before v1.10), fold ASCII case, and break ties deterministically (fewer leading zeros first, then code points). Use the platform collator instead when you need locale-aware ordering of accented letters.

**file-signature**
- `detectFileType(bytes)` names about 30 formats from their first bytes (PNG, JPEG, GIF, WebP, AVIF/HEIC, PDF, ZIP and Office containers, gzip, 7z, RAR, audio, video, fonts, WASM, SQLite) and `matchesExtension(bytes, filename)` checks an upload's content against its name. It is a first gate, not a malware scan: still re-encode images and sandbox documents. Text formats (SVG, HTML, CSV) are not detected.

**color**
- `parseHex`/`toHex` (#rgb to #rrggbbaa), `rgbToHsl`/`hslToRgb`, `rgbToOklch`/`oklchToRgb` (Björn Ottosson's Oklab matrices, unclamped) and `inGamut`. OKLCH keeps perceived lightness steady when you change hue, which makes it the better space for generated palettes; clamp or reduce chroma when `inGamut` is false.

**password-policy**
- `checkPassword` reports too-short, too-long (code points), control-characters, blocklisted, contains-context and repetitive (aaaa, 1234, dcba) with no composition rules, following NIST SP 800-63B. Use a large breached-password list as the blocklist, allow spaces and emoji, never truncate, and rate-limit attempts.

**text-sanitize**
- `sanitizeText` normalizes newlines and removes control, bidirectional-override and invisible characters (keeping the zero-width joiners emoji and some scripts need), `findBidiControls` reports Trojan Source characters (CVE-2021-42574) in code or reviews, and `normalizeWhitespace` collapses runs of whitespace.

**glob-match**
- `globMatch(pattern, path, dot)` and `globFilter` match /-separated paths. `*`, `?` and `[classes]` stay within one segment, a whole-segment `**` spans directories (so `src/**` matches `src` too) and `{a,b}` gives alternatives. Hidden segments match only a literal `.` unless `dot` is set. Matching is memoized, so patterns such as `*a*a*a*b` cannot blow up.

**dotenv**
- `parseDotenv(text, expand, vars)` reads `.env` files the way the common loaders do: `#` comments, `export`, unquoted values with ` #` comments, literal single quotes, and double quotes with escapes that may span lines. Later keys win. With `expand`, `${NAME}` and `${NAME:-default}` are filled from earlier keys and then `vars`. Errors carry the line number.

**query-string**
- `parseQuery`/`stringifyQuery`/`getAll` follow the WHATWG urlencoded rules browsers use: ordered pairs, repeated keys kept, `+` for spaces and UTF-8 percent-encoding (invalid `%` sequences stay literal). For typed filter, sort and page state in a URL, use the `url-query-state` recipe instead.

**mime-types**
- `mimeTypeFor(name)`, `extensionFor(type)` and `contentTypeFor(name)` cover about 80 web, media, font, archive and office formats. `contentTypeFor` adds `charset=utf-8` to text types and falls back to `application/octet-stream`. Pair it with file-signature: names can lie.

**data-uri**
- `parseDataUri` returns the media type, parameters and bytes of a `data:` URL; `text/plain;charset=US-ASCII` is the default, and base64 is checked strictly. `buildDataUri(bytes, mime)` picks base64 unless the type is textual and valid UTF-8. Keep data URLs small: browsers and CSP limit them.

**iso-week**
- `isoWeek(y, m, d)` gives the ISO week-numbering year, week and weekday (2021-01-03 is 2020-W53-7). `fromIsoWeek`, `weeksInYear` (52 or 53), `formatIsoWeek` and `parseIsoWeek` (`2026-W41-7`, `2026W417`, `2026-W41`) complete it for weekly reports and calendar weeks.

**topo-sort**
- `topoSort(nodes, edges)` orders nodes so that every `[before, after]` edge is respected. Among ready nodes, the one listed first goes first, so the result is stable. `topoLevels` groups nodes that can run in parallel. A cycle raises `cycle: a -> b -> a`, naming one cycle to fix.

**link-header**
- `parseLinkHeader` reads RFC 8288 `Link` headers (GitHub-style `rel="next"` pagination), including quoted commas and RFC 8187 `title*` values. `findRel(links, "next")` picks a link, and `formatLinkHeader` writes one, encoding non-ASCII values.

**content-disposition**
- `buildContentDisposition(filename, inline)` writes a safe ASCII `filename` plus a UTF-8 `filename*` when needed. `parseContentDisposition` prefers `filename*`. Both sanitize the name: path separators, quotes and control characters become `_`, and leading or trailing dots are trimmed. Store uploaded files under your own generated names anyway.

**cache-control**
- `parseCacheControl` returns typed directives: flags are `true`, delta seconds are integers, and invalid ones are dropped. `formatCacheControl` writes them back, and `cacheFreshness(directives, shared)` gives the freshness lifetime: 0 for `no-store` or `no-cache`, and shared caches prefer `s-maxage`. Use `http-conditional` for ETag revalidation.

**punycode**
- `punycodeEncode`/`punycodeDecode` implement RFC 3492 with its overflow checks; decoding accepts either case and rejects invalid digits, truncated input and code points outside Unicode. `domainToAscii` and `domainToUnicode` convert each label to or from `xn--` form and lowercase ASCII only. They do no IDNA mapping or normalization, so run user-typed domains through the platform IDNA library first.

**base58**
- `base58Encode`/`base58Decode` use the Bitcoin alphabet and keep leading zero bytes as `1`s; `base58CheckEncode`/`base58CheckDecode` add and verify a 4-byte double SHA-256 checksum. The TypeScript check functions are async because they use Web Crypto. The conversion works on byte arrays, so no big-integer library is needed.

**roman-numerals**
- `toRoman(n)` covers 1 to 3999. `fromRoman(s)` is case-insensitive and accepts canonical forms only, so `IIII`, `VX` and `IC` are errors rather than guesses.

**dotted-path**
- `parsePath("a.b[0][\"x.y\"]")` splits a path into keys and indexes. `getPath(data, path, default)`, `hasPath`, `setPath` and `deletePath` work on JSON-like data and return new structures, never mutating the input. `setPath` creates missing objects and lists, appends at index == length, and fails on a larger index or when it would traverse a scalar. The empty path is the root. For RFC 6902/6901 use json-patch.

**template-render**
- `renderTemplate(template, data, escape)` renders a logic-less Mustache subset: `{{path}}` (HTML-escaped), `{{{path}}}` (raw), `{{#path}}…{{/path}}` sections that iterate lists (`.` is the item), `{{^path}}` inverted sections and `{{! comments }}`. Lists and objects cannot be printed directly, and malformed or unclosed tags are errors, not silent output. There are no partials, lambdas or delimiter changes.

**ini-parse**
- `parseIni(text)` returns ordered sections (the unnamed `""` section first) of ordered keys. It handles `;` and `#` comments, repeated section headers, `=` or `:` separators, inline comments after whitespace, and quoted values with escapes. Bare keys become `""` and the last duplicate wins. Errors carry the line number. `stringifyIni` writes the result back. INI has no single standard, so check this dialect against the files you must read.

**pii-mask**
- `maskEmail` (`j***@example.com`), `maskPhone` and `maskCard` (last four digits kept) are for display and logs. `maskMiddle(s, keepStart, keepEnd, mask)` works by code point, and `redact(text)` replaces emails and Luhn-valid card numbers found in free text. This is pattern matching: it is not a data-discovery or compliance control.

**password-generate**
- `generatePassword(length, classes, excludeAmbiguous)` includes at least one character from each requested class. `generatePassphrase(words, count, separator)` picks words from your list, and `entropyBits(alphabetSize, length)` reports the strength. All of them draw from the platform CSPRNG through unbiased rejection sampling (`randomIndex`). The byte source can be injected, so tests are deterministic. Never swap in `Math.random` or `rand`.

**html-escape**
- `escapeHtml` escapes `& < > " '`. `unescapeHtml` decodes numeric references, the windows-1252 C1 table and a fixed set of named entities, and requires the closing `;`. `stripTags` drops script and style contents, removes tags and unescapes the rest into plain text. It is not a sanitizer: use rich-text-sanitization before rendering user HTML. The TypeScript recipe also has the `html` tagged template and `safeUrl`.

**url-template**
- `expandTemplate(template, variables)` implements RFC 6570 levels 1 to 4: simple, reserved (`{+path}`), fragment (`{#x}`), label, path, path-style parameter, query and continuation expressions, `:n` prefixes and `*` explode for lists and ordered maps. Undefined, empty-list and empty-map values are skipped. Malformed templates and prefixes on lists or maps are errors. The tests include every RFC example.

**bloom-filter**
- `bloomSizeFor(n, p)` gives the bit count and hash count for `n` items at false-positive rate `p`. `BloomFilter` adds and tests items using FNV-1a 64-bit double hashing, so every language sets the same bits, and serializes to base64url. Filters built in one language can be read in another. `countEstimate` approximates how many items were added, and `union` merges two filters of the same size. There are no deletions.

**stats-summary**
- `summary(xs)` returns count, sum, min, max, mean, median, sample variance and standard deviation, and p25/p75/p90/p95/p99. `percentile(xs, q)` interpolates linearly between ranks, as numpy and R type 7 do. `histogram(xs, edges)` counts values per bucket, with the last edge inclusive, plus counts below and above the range. Mean and variance use the two-pass method, so large offsets (around 1e9) stay accurate.

**interval-merge**
- Half-open integer intervals `[start, end)`: `merge` joins overlapping and touching ones, and `intersect`, `subtract` and `gaps(xs, lo, hi)` return merged, sorted results. `total` is the covered length, `overlaps` treats touching intervals as not overlapping, and `contains` tests a point. Use them for free/busy slots, booking conflicts and coverage.

**shell-quote**
- `shellQuote(arg)` leaves safe words as they are and single-quotes everything else (`it's` becomes `'it'\''s'`). `shellJoin(args)` builds a command line. `shellSplit(line)` splits one with POSIX quoting (single quotes literal, double quotes with `\$ \` \" \\` escapes, backslash outside quotes, `#` comments at word start) and never expands `$`, `*` or `~`. Every quoted value splits back to itself. Prefer an argument array over a shell string when the process API allows it.

**number-to-words**
- `numberToWords(1234567)` gives "one million two hundred thirty-four thousand five hundred sixty-seven" (US style, no "and"). `ordinalWords(21)` gives "twenty-first" and `ordinalSuffix(112)` gives "112th". `moneyWords(12345, "dollar", "cent", 2)` gives "one hundred twenty-three dollars and forty-five cents", with the minor-unit exponent from the money capability.

**pagination-window**
- `pageCount(total, perPage)` (at least 1) and `pageOffset(page, perPage)` handle the arithmetic. `pageWindow(current, total, siblings, boundaries)` returns the numbers a pager shows, with gaps for ellipses (`1 … 9 10 11 … 20`), using the same algorithm as MUI's `usePagination`. Each language documents how it represents a gap.

**text-wrap**
- `wrapText(text, width)` fills lines greedily on spaces, keeps existing line breaks and blank lines, and breaks words longer than the width. `truncateText(text, max, ellipsis)` returns the text unchanged when it fits. Otherwise it cuts at the last space in the second half of the allowed length, or hard-cuts, and appends the ellipsis inside the limit. Lengths count code points.

**markdown-table**
- `markdownTable(headers, rows, align)` renders a GitHub table with columns padded to equal width (at least 3), `:--`, `--:` and `:-:` alignment markers, pipes and backslashes escaped, and newlines turned into `<br>`. Rows must match the header width.

**ndjson**
- `parseNdjson(text)` reads one JSON value per line, skips blank lines, accepts CRLF and reports the 1-based line of the first invalid value. `stringifyNdjson(values)` writes compact JSON with keys in insertion order and a newline after each value, byte-identical across the nine languages.

Behavior that differs by language (option objects versus keyword arguments, ordered-map types, async Web Crypto in TypeScript cursors and webhooks, null versus exceptions for an unparseable Retry-After) is noted at the top of each source file.

Learn any implementation's API without opening it: `genlib outline <capability> --language <lang>` lists its signatures and one-line docs.

## Adding a capability

1. Add tested code for each language: a recipe in `examples/recipes`, or a language module registered in `examples/languages/modules.json` (use `"base": "cookbook"` for `examples/cookbook`).
2. Add the capability to `scripts/build-capabilities.mjs` (id, title, tier, summary, terms, recipe or module per language), then add its inputs in `resources/capabilities-src/`. `terms.json` holds the everyday words people use for the need. `caveats.json` holds a one-sentence caveat for any limit that would surprise a user, such as output that is not byte-identical to a reference tool, one script only, or UTC only. `quick`, `find`, Jev packets and the copy output show the caveat before anyone copies the code. `notes.json` and `overrides.json` give the reason a language is `unavailable` when it has no responsible option. Run `npm run capabilities:build`. Never edit `resources/capabilities.json` by hand: `npm run check` fails when it differs from the build.
3. Run `npm run docs:sync` and `npm test`. `tests/capability-index.test.mjs` checks that every implementation resolves to registered code.
