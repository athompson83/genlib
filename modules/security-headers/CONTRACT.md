# Security headers · 0.1.0

## What installs

Original Apache-2.0 TypeScript in `src/genlib/security-headers/security-headers.ts`: pure functions that build HTTP response security headers and apply them to Fetch `Response` objects. No runtime dependencies, environment reads, or network access. Targets Node.js 22+, Bun, Deno, Cloudflare Workers, Next.js middleware/route handlers, and Hono; `securityHeaders()` returns a plain record for any server. Repository tests ran on Node.js 22 only.

## Install and imports

```bash
node "$GENLIB_ROOT/bin/genlib.mjs" plan security-headers --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" add security-headers --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" verify --target "$APP_ROOT" --json
```

```ts
import { createNonce, withSecurityHeaders } from "./genlib/security-headers/security-headers.js";

const nonce = createNonce();                       // one per response; put it on your <script nonce> tags
const html = renderPage({ nonce });
return withSecurityHeaders(new Response(html, { headers: { "Content-Type": "text/html" } }), {
  nonce,
  csp: { "img-src": ["'self'", "data:"], "connect-src": ["'self'", "https://api.example.com"] },
  reportOnly: true,                                // roll out in report-only first
});
```

## API

| Export | Behavior |
| --- | --- |
| `securityHeaders(options?)` | Returns `Record<string, string>` (valid `HeadersInit`). Throws `TypeError` on invalid configuration. |
| `withSecurityHeaders(response, options?)` | New `Response` with the same body stream, status, statusText, and headers plus security headers. Existing headers win unless `override: true`. Works on immutable-header responses such as `Response.redirect`; a status outside 200–599 (`Response.error()`) is returned unchanged. |
| `buildCsp(directives, { nonce?, nonceDirectives? })` | Serializes a directive object without defaults. |
| `createNonce(bytes = 16)` | Base64 of `crypto.getRandomValues` (16–64 bytes). |
| `DEFAULT_CSP_DIRECTIVES`, `DEFAULT_PERMISSIONS_POLICY` | Frozen defaults. |

Defaults:

| Header | Default | Option |
| --- | --- | --- |
| `Content-Security-Policy` | `default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'` | `csp` (merged per directive; `false` removes a directive, `true` = valueless, `csp: false` omits); `nonce`/`nonceDirectives` (default `script-src`, derived from `default-src` when absent); `reportOnly` → `Content-Security-Policy-Report-Only` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | `hsts: { maxAge, includeSubDomains, preload }`; preload opt-in, requires includeSubDomains and ≥ 1 year; `false` omits |
| `X-Content-Type-Options` | `nosniff` | `contentTypeOptions: false` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `referrerPolicy` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()` | `permissionsPolicy` (merged; `self`, `*`, or http(s) origins) |
| `Cross-Origin-Opener-Policy` | `same-origin` | `crossOriginOpenerPolicy` |
| `X-Frame-Options` | `DENY` | `frameOptions` |

## Security and limits

- CSP names must be lowercase tokens; each value must be one token of printable ASCII without whitespace, `;`, or `,`. Newlines, control characters, and quoted-string breakouts in Permissions-Policy origins are rejected. Nonces must be base64/base64url of 16–256 characters.
- Validation checks syntax, not policy strength: `'unsafe-inline'`, `'unsafe-eval'`, or `*` are accepted if you add them.
- The default CSP blocks inline scripts/styles and third-party resources. Add real sources or nonces, roll out with `reportOnly`, and test every page. Browsers ignore `frame-ancestors` in report-only mode; `X-Frame-Options` still applies.
- Default HSTS `includeSubDomains` applies to every subdomain once cached; disable or shorten it until all subdomains serve HTTPS. Set `hsts: false` for plain-HTTP local development.
- Not included: CSP report collection, Reporting-Endpoints, CORS, COEP/CORP, cookie attributes, or removal of framework headers such as `X-Powered-By`.

## Verification

`tests/security-headers.test.mjs` covers exact default values, directive merge/removal/valueless directives, nonce randomness/format and script-src/style-src injection, report-only header selection, injection rejection (`;`, newline, whitespace, `,`, bad names, Permissions-Policy quote breakout), HSTS options and preload prerequisites, Permissions-Policy allowlists, preserve-versus-override semantics, preserved body/status/statusText/Set-Cookie, immutable redirect responses, and `Response.error()` passthrough. Browser enforcement was not exercised; consumers must test their pages under the resulting policy.
