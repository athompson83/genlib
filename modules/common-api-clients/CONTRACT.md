# Common API clients · 0.1.0

## What installs

Original Apache-2.0 TypeScript source for ten deliberately narrow provider integrations and a shared HTTP transport. The source has no runtime dependencies and supports Node.js 22+ with standard Fetch and Web Platform APIs. The receiving application compiles it with its existing TypeScript pipeline. Import and installation cause no network traffic, credential lookup, account creation, or configuration changes.

Keep every credentialed client in the receiving application's server-only code. `frameworks: ["any"]` means framework-neutral TypeScript; it does not certify every browser, mobile runtime, framework, or provider deployment. A generic HTTP client is not an SSO flow, OAuth callback, credential vault, permissions system, or payment authorization engine.

## Install and imports

From a reviewed Genlib checkout, use its normal plan/add/verify sequence:

```bash
node "$GENLIB_ROOT/bin/genlib.mjs" plan common-api-clients --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" add common-api-clients --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" verify --target "$APP_ROOT" --json
```

The default destination is `src/genlib/common-api-clients/`. Imports below assume a server file beneath `src/`; adjust the relative path for the application. `.js` import extensions resolve to the TypeScript sources through the supplied NodeNext build convention.

```ts
import { createGitHubClient } from "./genlib/common-api-clients/github.js";
import { ApiClientError } from "./genlib/common-api-clients/http.js";
```

All provider files import sibling helpers. No provider package installation or environment file is required by the module. The [common APIs guide](../../docs/best-practices/common-apis.md) provides copyable configuration and integration examples.

## Public operations and limits

| Factory | Implemented operations | Application contract |
| --- | --- | --- |
| `createGitHubClient` | `getRepository(owner, name, signal?)`; `listRepositories(options?)` for the authenticated user | Supply a caller-scoped user token and pinned GitHub version. Lists fetch at most 10 pages of 100 repositories. `possiblyMore` means the last fetched page was full; it is not proof of a following page. |
| `createStripeCheckoutClient<Context>` | `createCheckoutSession(input)` | Supply approved price IDs/modes/maximum quantities and HTTPS success/cancel URLs from trusted server configuration. Mandatory authorization runs before credential resolution. A caller-provided product key selects an approved price; it cannot introduce an amount. Persist the idempotency key with the authorized order attempt. Only the standard `checkout.stripe.com` hosted return URL is supported. |
| `createResendClient<Context>` | `sendEmail(input)` | Supply one verified sender in server configuration and authorize the exact immutable recipient/message snapshot. Plain text is required; HTML is optional. At most 50 recipients, no duplicates, no attachments, no arbitrary email headers. Persist the idempotency key with the delivery event. |
| `createSupabaseReadClient` | `readRows(input)` | Supply a trusted project origin, `sb_publishable_` key, caller access-token resolver, and table/column allowlists. Uses scalar equality filters and bounded limit/offset; no writes, arbitrary PostgREST expressions, or service-role API keys. Rows remain `Record<string, unknown>` until the receiving app validates its schema. |
| `createMicrosoftGraphClient` | `getMe(signal?)` | Supply the signed-in user's delegated Graph token with `User.Read`; app-only tokens cannot use `/me`. Returns only ID, display name, mail, and user principal name. The example targets the global Graph service. |
| `createGoogleCalendarClient` | `listEvents(input)` | Supply an authorized Calendar token and allowlisted calendar IDs. Require explicit RFC3339 time bounds. Returns one page of at most 250 events with an opaque continuation token. Does not perform a full or incremental calendar sync. |
| `createOpenAIClient<Context>` | `createResponse(input)` | Supply a tested model, output-token limit, token resolver, and mandatory budget/data authorization. Sends text to Responses with `store: false` and no tools or streaming. Preserve status, refusal, incomplete reason, and usage; partial text does not mean completion. |
| `createAnthropicClient<Context>` | `createMessage(input)` | Supply a tested model, output-token limit, explicit API version, resolver, and mandatory budget/data authorization. Sends one text Messages request with optional trusted system instructions. Preserve stop reason and usage. |
| `createSaleorClient` | `listProducts(input)`; `getProduct(input)` | Query product ID/name/slug by channel at a trusted Saleor GraphQL endpoint. Each page is capped at 100 products. GraphQL error responses fail even with HTTP 200. No cart, checkout, inventory, or payment mutation is implemented. |
| `createSteelBrowserClient` | `createSession`, `getSession`, `releaseSession`, `withSession` | Authorize operation, owner, project, and budget for each session call. Create uses an explicit provider timeout of 1–900 seconds. Returned sessions are immutable. `withSession` retains the original session ID and attempts release even on task failure. An unconfirmed release raises `SteelCleanupError` with its phase and session ID. Does not launch local Chromium, navigate a website, handle logins, or make CDP connection URLs safe to expose. |

See the [commerce and browser guide](../../docs/best-practices/commerce-and-browser.md) for Saleor/Steel lifecycle and deployment boundaries.

## Authentication and application authority

Token providers receive a signal and return the appropriate API key or access token. They are part of the trusted application, not a place to accept a key or arbitrary origin from public request JSON. No resolver is provided by default. Scope delegated token resolution to the authenticated principal and tenant; do not cache a caller's token in a shared mutable singleton.

Stripe, Resend, and AI methods accept a generic `context` solely to pass it to the required application authorization function. The module does not authenticate that object. Construct it from a verified server session or durable authorized job. Never pass an incoming `{ "role": "admin" }` object and treat it as authenticated. The callback must return the boolean `true`; missing, false, truthy non-booleans, and failures do not send a provider request. Authorization and credential resolution share the HTTP timeout and abort signal.

The Stripe purchase and Resend email snapshot used for authorization are the values serialized to the provider. Authorization and delivery still need durable application records to prevent two workers from creating distinct operation keys for the same business action. Callbacks can perform atomic budget reservation, ownership checks, or recipient lookup; those stores and their implementation belong to the application.

## Transport contract

`createHttpClient({ origin, headers?, fetch?, timeoutMs?, maxResponseBytes?, maxRequestBytes? })` returns `request<T = unknown>(path, { method?, headers?, body?, signal? })`. The path must be relative to the exact configured HTTPS origin. It rejects userinfo, scheme-relative destinations, fragments, control characters, backslashes, and dot path segments. Supported methods are GET/POST/PUT/PATCH/DELETE. A body is an already serialized string. The generic return type is a compile-time assertion, not validation of arbitrary JSON; provider adapters validate the response fields they expose.

The transport defaults to a 15-second deadline, 256 KiB request body limit, and 1 MiB decoded response limit. Configuration permits 1–120000 milliseconds and byte limits from 1 byte to 8 MiB. The deadline includes authorization/credential resolution, Fetch, and response reading. GitHub pagination performs multiple individually bounded requests; use a caller signal with an overall deadline for the whole list. A custom resolver/Fetch that ignores cancellation can continue its own internal work; the client stops waiting and prevents a late resolver from starting the provider request.

Every request sets `redirect: "error"`, `credentials: "omit"`, and `cache: "no-store"`. There is no automatic retry. JSON responses require a JSON content type, strict UTF-8, valid JSON, and a streamed byte count within the configured limit. Unsuccessful HTTP responses are discarded rather than parsed into error messages. No error includes a provider body, credential, URL, raw cause, or provider status text. `ApiClientError` exposes a fixed `code` and an optional numeric `status`. Native Fetch may report a refused redirect as `NETWORK`; never enable redirects to make that request pass.

Both configured headers and per-call headers are trusted server inputs. Per-call headers can override configured values and must never be forwarded wholesale from a public request. The transport rejects cookie, proxy authorization, host, connection, content-length, and transfer-encoding headers. Exact-origin validation is not a DNS/IP egress firewall, and it cannot police a deliberately unsafe injected Fetch. Use the platform's standard Fetch and configure network egress for tenant isolation and private infrastructure protection.

The transport snapshots method, body, caller signal, and a copy of per-request headers before awaiting credentials. It validates and sends that same body. Mutating the original request options or `Headers` instance while authorization is pending cannot change the operation being sent or bypass its request-size limit. GitHub's multi-page listing likewise retains its original caller signal for all pages.

## Side effects, failure, and reconciliation

A timeout does not prove that an external provider rejected a write or avoided charging for a model call. Do not create a new idempotency key after an ambiguous result. Stripe and Resend accept the explicit key passed by the application, but provider retention windows are finite; the application also needs its own durable operation record. OpenAI, Anthropic, and Steel are not given invented idempotency guarantees. No request is retried automatically.

If Steel creation returns a safe session ID but invalid remaining session fields, the client attempts a separately authorized cleanup request before failing. An unconfirmed cleanup records `phase: "creation"`; cleanup following application work records `phase: "work"`. A transport timeout or invalid JSON can prevent recovery of any trustworthy ID, so those outcomes require external provider reconciliation. The provider lifetime limit remains a fallback, not evidence that release was confirmed.

Checkout creation is not payment confirmation or an entitlement grant. Resend acceptance is not inbox delivery. A valid user token does not prove that a database has correct row policies. `store: false` is an API storage choice, not a claim of zero provider retention. A Steel session timeout does not impose a currency budget. Validate successful response fields in the receiving workflow, and keep secrets, email content, model inputs, and browser connection URLs out of logs.

The module does not supply OAuth/PKCE, token refresh/revocation, a webhook receiver or signature verification, a queue, consent records, spending ledger, database migrations, SSO provisioning, or production observability. Use the current official provider SDK or a separate reviewed module where those broader operations are required.

## Verification and provenance

The repository's TypeScript build and tests exercise the real adapters with the outbound Fetch boundary replaced. `tests/common-api-clients.test.mjs` covers provider paths/headers/payloads, immutable authorization snapshots, bounded pages, token separation, no retries, schema validation, cancellation, redirected/oversize/invalid responses, and redacted failures. `tests/commerce-browser.test.mjs` exercises the Saleor queries and Steel session lifecycle. No live account, payment, email, model request, calendar, database, or browser session was used. `tested` records these repository checks; the receiving application's integrated and deployed behavior remains to be verified.

All installed source is original code written against public protocol documentation, not copied vendor SDK implementation. Official API references and the review date appear in the [common APIs guide](../../docs/best-practices/common-apis.md) and [commerce/browser guide](../../docs/best-practices/commerce-and-browser.md). Provider terms, credentials, permissions, usage charges, and third-party software licenses remain separate from this module's Apache-2.0 source license.
