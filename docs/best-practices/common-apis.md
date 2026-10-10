# Common APIs: installation, credentials, and working clients

The [`common-api-clients` module](../../modules/common-api-clients/CONTRACT.md) contains original, installable TypeScript implementations for ten provider integrations. This guide covers GitHub, Stripe, Resend, Supabase, Microsoft Graph, Google Calendar, OpenAI, and Anthropic. The [commerce and browser guide](commerce-and-browser.md) covers Saleor product queries and Steel session lifecycle. These are concrete bounded operations, not claims that every capability of each provider is implemented.

The module is framework-neutral server code, requires no runtime packages, and never reads environment variables or makes a provider request during import or installation. Supply secrets through the receiving application's own trusted server secret manager and token store. Official sources were reviewed on **October 10, 2026**; current models, API versions, quotas, permissions, and deployed behavior still require verification in the receiving project.

## What is available

| Need | Installed factory and operation | Actual provider request | Configuration and authorization |
| --- | --- | --- | --- |
| Repository metadata and a limited account repository list | [`createGitHubClient`](../../modules/common-api-clients/files/github.ts): `getRepository`, `listRepositories` | `GET https://api.github.com/repos/{owner}/{repo}`; `GET /user/repos` | User access token with repository metadata access and a supported pinned API date. A GitHub App installation token is not interchangeable with a user token for `/user/repos`. [GitHub reference](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user). |
| Hosted payment or subscription Checkout | [`createStripeCheckoutClient`](../../modules/common-api-clients/files/stripe.ts): `createCheckoutSession` | `POST https://api.stripe.com/v1/checkout/sessions` with form encoding | Secret key, explicit Stripe version, server-owned price/mode map and return URLs, mandatory order authorization, persisted idempotency key. [Checkout reference](https://docs.stripe.com/api/checkout/sessions/create). |
| An authorized transactional email | [`createResendClient`](../../modules/common-api-clients/files/resend.ts): `sendEmail` | `POST https://api.resend.com/emails` | API key, verified configured sender, explicit exact-recipient/content authorization, text and optional HTML, persisted idempotency key. [Email reference](https://resend.com/docs/api-reference/emails/send-email). |
| Read a user's permitted database rows | [`createSupabaseReadClient`](../../modules/common-api-clients/files/supabase.ts): `readRows` | `GET https://{trusted-project}/rest/v1/{table}` | Publishable `apikey` plus the caller's `Authorization: Bearer` access token, table/column allowlists, database grants and RLS. [Data API](https://supabase.com/docs/guides/api), [API keys](https://supabase.com/docs/guides/getting-started/api-keys). |
| Read the signed-in Microsoft user's basic profile | [`createMicrosoftGraphClient`](../../modules/common-api-clients/files/microsoft-graph.ts): `getMe` | `GET https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName` | Delegated Graph access token with `User.Read`; `/me` does not support app-only permissions. [Graph reference](https://learn.microsoft.com/en-us/graph/api/user-get?view=graph-rest-1.0). |
| Read one page of calendar events | [`createGoogleCalendarClient`](../../modules/common-api-clients/files/google-calendar.ts): `listEvents` | `GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events` | OAuth token with a suitable events read scope, allowlisted calendar IDs, explicit time range, bounded page size. [Calendar reference](https://developers.google.com/workspace/calendar/api/v3/reference/events/list). |
| A bounded text model response | [`createOpenAIClient`](../../modules/common-api-clients/files/openai.ts): `createResponse` | `POST https://api.openai.com/v1/responses` | API key, tested configured model and output cap, mandatory caller/data/budget authorization. Sends `store: false`; parses actual REST output items. [Text generation](https://developers.openai.com/api/docs/guides/text), [Responses reference](https://developers.openai.com/api/reference/resources/responses/methods/create). |
| A bounded Claude text message | [`createAnthropicClient`](../../modules/common-api-clients/files/anthropic.ts): `createMessage` | `POST https://api.anthropic.com/v1/messages` | API key, explicit `anthropic-version`, tested configured model and output cap, mandatory caller/data/budget authorization. [Messages reference](https://platform.claude.com/docs/en/api/messages/create). |

GitHub's reference currently shows `2026-03-10`, and the Anthropic Messages example uses `2023-06-01`. Those are API version headers, not model names. Choose a version the target application has actually tested. The module deliberately has no “latest model” selection or automatic price lookup.

## Install into an existing application

Set `GENLIB_ROOT` to the absolute path of a reviewed clone and `APP_ROOT` to the existing application's root. Inspect its instructions, framework, server boundary, secret management, and auth policy first.

```bash
node "$GENLIB_ROOT/bin/genlib.mjs" inspect common-api-clients --json
node "$GENLIB_ROOT/bin/genlib.mjs" plan common-api-clients --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" add common-api-clients --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" verify --target "$APP_ROOT" --json
```

The normal destination is `src/genlib/common-api-clients/`. `add` copies the reviewed source and provenance; it does not install packages or configure external accounts. Import only the provider files the application needs. Keep the imported files out of browser bundles and native app distributables containing reusable service secrets. For a platform with a `server-only` import convention, apply that guard in the receiving project's server entry point.

## An integration boundary that can be copied

The following is a server composition example for `src/server/integrations.ts`. It uses the installed code and leaves actual session verification, secret storage, tenant policy, and durable budgets in explicit application interfaces. There is no permissive default authorization callback. The application must implement these interfaces using its existing backend.

```ts
import { createGitHubClient } from "../genlib/common-api-clients/github.js";
import { createStripeCheckoutClient, type AuthorizedPurchase, type CheckoutProduct } from "../genlib/common-api-clients/stripe.js";
import { createResendClient, type TransactionalEmail } from "../genlib/common-api-clients/resend.js";
import { createSupabaseReadClient } from "../genlib/common-api-clients/supabase.js";
import { createMicrosoftGraphClient } from "../genlib/common-api-clients/microsoft-graph.js";
import { createGoogleCalendarClient } from "../genlib/common-api-clients/google-calendar.js";
import { createOpenAIClient } from "../genlib/common-api-clients/openai.js";
import { createAnthropicClient } from "../genlib/common-api-clients/anthropic.js";
import type { AuthorizedAIRequest } from "../genlib/common-api-clients/ai-core.js";

export interface Principal {
  tenantId: string;
  subject: string;
}
type Provider = "github" | "stripe" | "resend" | "supabase-user"
  | "microsoft-graph" | "google-calendar" | "openai" | "anthropic";

export interface ApplicationServices {
  // Obtain the credential for this already authenticated principal and provider.
  // Handle refresh/revocation and storage in the existing application.
  token(provider: Provider, principal: Readonly<Principal>, signal: AbortSignal): Promise<string>;
  authorizePurchase(principal: Readonly<Principal>, purchase: Readonly<AuthorizedPurchase>, signal: AbortSignal): Promise<boolean>;
  authorizeEmail(principal: Readonly<Principal>, email: Readonly<TransactionalEmail>, signal: AbortSignal): Promise<boolean>;
  authorizeModelCall(principal: Readonly<Principal>, request: Readonly<AuthorizedAIRequest>, signal: AbortSignal): Promise<boolean>;
}

export interface IntegrationSettings {
  githubApiVersion: string;
  stripeApiVersion: string;
  products: Readonly<Record<string, CheckoutProduct>>;
  checkoutSuccessUrl: string;
  checkoutCancelUrl: string;
  emailFrom: string;
  supabaseOrigin: string;
  supabasePublishableKey: string;
  readableTables: Readonly<Record<string, readonly string[]>>;
  calendarIds: readonly string[];
  openaiModel: string;
  anthropicModel: string;
  anthropicApiVersion: string;
  modelOutputLimit: number;
}

export function clientsForVerifiedPrincipal(
  verified: Principal,
  services: ApplicationServices,
  settings: IntegrationSettings,
) {
  const principal = Object.freeze({ tenantId: verified.tenantId, subject: verified.subject });
  const token = (provider: Provider) => (signal: AbortSignal) =>
    services.token(provider, principal, signal);
  const samePrincipal = (context: Principal) =>
    context.tenantId === principal.tenantId && context.subject === principal.subject;

  return {
    principal,
    github: createGitHubClient({
      getAccessToken: token("github"), apiVersion: settings.githubApiVersion,
    }),
    stripe: createStripeCheckoutClient<Principal>({
      getSecretKey: token("stripe"), apiVersion: settings.stripeApiVersion,
      products: settings.products,
      successUrl: settings.checkoutSuccessUrl, cancelUrl: settings.checkoutCancelUrl,
      authorize: (context, purchase, signal) => samePrincipal(context)
        ? services.authorizePurchase(principal, purchase, signal) : false,
    }),
    resend: createResendClient<Principal>({
      getApiKey: token("resend"), from: settings.emailFrom,
      authorize: (context, email, signal) => samePrincipal(context)
        ? services.authorizeEmail(principal, email, signal) : false,
    }),
    database: createSupabaseReadClient({
      projectOrigin: settings.supabaseOrigin,
      publishableKey: settings.supabasePublishableKey,
      getAccessToken: token("supabase-user"), tables: settings.readableTables,
    }),
    microsoft: createMicrosoftGraphClient({ getAccessToken: token("microsoft-graph") }),
    calendar: createGoogleCalendarClient({
      getAccessToken: token("google-calendar"), calendarIds: settings.calendarIds,
    }),
    openai: createOpenAIClient<Principal>({
      getApiKey: token("openai"), model: settings.openaiModel,
      maxOutputTokens: settings.modelOutputLimit,
      authorize: (context, request, signal) => samePrincipal(context)
        ? services.authorizeModelCall(principal, request, signal) : false,
    }),
    anthropic: createAnthropicClient<Principal>({
      getApiKey: token("anthropic"), model: settings.anthropicModel,
      apiVersion: settings.anthropicApiVersion,
      maxOutputTokens: settings.modelOutputLimit,
      authorize: (context, request, signal) => samePrincipal(context)
        ? services.authorizeModelCall(principal, request, signal) : false,
    }),
  };
}
```

`verified` is a result of real session verification or an authorized server job. A matching string, a TypeScript interface, and an incoming JSON object are not authentication. Do not expose this factory to public request parameters, and do not use one principal's client instance for another principal. `authorizePurchase` must re-resolve the order and its approved product/quantity. `authorizeEmail` must validate recipient ownership, transaction purpose, and applicable consent. Model authorization must reserve or check budget in a durable system, not just look at an untrusted role string.

### Read operations

Given clients constructed inside an authenticated server handler, read explicit resources and bound the entire task. Fetching every page of every service by default wastes latency and tokens.

```ts
type Clients = ReturnType<typeof clientsForVerifiedPrincipal>;

export async function readRepositoryAndProfile(clients: Clients) {
  const signal = AbortSignal.timeout(25000);
  const repositories = await clients.github.listRepositories({
    perPage: 30, maxPages: 2, visibility: "all", signal,
  });
  const profile = await clients.microsoft.getMe(signal);
  return { repositories, profile };
}

export async function readTaskPage(clients: Clients) {
  // The target project's tasks table, grants and RLS must already exist.
  return clients.database.readRows({
    table: "tasks", columns: ["id", "title"],
    equals: { owner_id: clients.principal.subject },
    limit: 50, offset: 0, signal: AbortSignal.timeout(10000),
  });
}

export async function readCalendarPage(
  clients: Clients,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  pageToken?: string,
) {
  return clients.calendar.listEvents({
    calendarId, timeMin, timeMax, maxResults: 100,
    ...(pageToken === undefined ? {} : { pageToken }),
    signal: AbortSignal.timeout(10000),
  });
}
```

The database filter improves query relevance; RLS provides the row authorization. Match `owner_id` to the actual Supabase identity mapping, which might differ from another identity provider's `subject`. Do not treat a filter as a security boundary. Generate/validate row types against the target schema. Configure `readableTables.tasks` to include `id`, `title`, and `owner_id` for this example. The reader projects only the requested columns in its returned objects and rejects reserved PostgREST filter names.

## Payments and email: retain one business operation identity

Persist an idempotency key in the same durable order or delivery record that tracks the authorized operation. A random UUID is appropriate when the record is first created; reuse the stored value for any retry. Do not generate a fresh UUID inside every HTTP handler invocation. Stripe's [idempotency documentation](https://docs.stripe.com/api/idempotent_requests) describes parameter matching and its finite retention behavior; Resend's [Email API](https://resend.com/docs/api-reference/emails/send-email) documents a 24-hour key lifetime. Neither replaces application-level deduplication.

```ts
interface AuthorizedOrderAttempt {
  orderId: string;
  productKey: string;
  quantity: number;
  checkoutIdempotencyKey: string;
}

export async function createAuthorizedCheckout(
  clients: Clients,
  order: AuthorizedOrderAttempt,
) {
  return clients.stripe.createCheckoutSession({
    context: clients.principal,
    productKey: order.productKey,
    quantity: order.quantity,
    referenceId: order.orderId,
    idempotencyKey: order.checkoutIdempotencyKey,
    signal: AbortSignal.timeout(20000),
  });
}

interface AuthorizedReceiptJob {
  recipient: string;
  subject: string;
  text: string;
  deliveryIdempotencyKey: string;
}

export async function sendAuthorizedReceipt(
  clients: Clients,
  job: AuthorizedReceiptJob,
) {
  return clients.resend.sendEmail({
    context: clients.principal, to: [job.recipient],
    subject: job.subject, text: job.text,
    idempotencyKey: job.deliveryIdempotencyKey,
    signal: AbortSignal.timeout(20000),
  });
}
```

Both operations rerun the configured authorization callback. These application interfaces describe data loaded from durable authorized records; the name of a type does not make arbitrary request JSON safe. Confirm that a product key maps to the correct account and price. Store the returned provider ID with the operation record, and record an uncertain outcome when a timeout prevents confirmation. A Checkout URL is not an entitlement, and an accepted email ID is not delivery confirmation.

Payment fulfillment needs a verified provider event and reconciliation path. Stripe requires verification against the original request payload and signing secret; use its [webhook guidance](https://docs.stripe.com/webhooks). Resend likewise documents [signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests). The module intentionally does not invent a universal webhook signature algorithm. Build provider-specific verification using its maintained verifier, preserve the raw body, check time/replay constraints, durably deduplicate event IDs, and test valid and invalid signatures before granting access or recording delivery.

## Model APIs: configured budgets and explicit results

The included clients accept a model from trusted server configuration. They do not choose a provider/model from public request JSON, enable tools, run generated code, or retry an ambiguous paid request. Input character and response byte limits complement the configured output-token cap. Token limits do not establish a currency budget; pricing and concurrent budget reservations remain application responsibilities.

```ts
export async function summarizeApprovedText(clients: Clients, approvedText: string) {
  const result = await clients.openai.createResponse({
    context: clients.principal,
    input: JSON.stringify({
      task: "summarize",
      requirements: ["Use only the supplied text", "Return concise findings"],
      text: approvedText,
    }),
    signal: AbortSignal.timeout(30000),
  });
  return {
    complete: result.status === "completed" && result.refusals.length === 0,
    text: result.text,
    status: result.status,
    incompleteReason: result.incompleteReason,
    refusals: result.refusals,
    usage: result.usage,
  };
}
```

An OpenAI response can reach its output cap before completing visible output; inspect status and incomplete details. `output_text` is a convenience offered by some SDKs, so this REST adapter traverses `output` message blocks. Its `store: false` setting does not promise zero provider retention. [OpenAI text guide](https://developers.openai.com/api/docs/guides/text) and [reasoning limits](https://developers.openai.com/api/docs/guides/reasoning).

For Anthropic, call `clients.anthropic.createMessage` with the same `{ context, input, signal }` shape. Inspect `stopReason`, including a token limit or refusal, before reporting completion. Usage values are returned only when present and validated; they are not fabricated estimates. Treat all model output as untrusted content when displaying it or selecting further actions. [Anthropic Messages reference](https://platform.claude.com/docs/en/api/messages/create).

## Practices every receiving application should enforce

| Boundary | Practice | Included here / project responsibility |
| --- | --- | --- |
| Application identity | Authenticate server requests; resolve a principal/tenant and verify access to the particular object/action. | Mandatory write/model callbacks and injected caller tokens are included. The actual auth system and policy store are project-owned. |
| Provider credentials | Use separate test/production credentials, narrow scopes, tenant-aware storage, rotation and revocation. Never put service secrets in source, browser code, public logs, or generated prompts. | No secret discovery, serialization to disk, or environment reads. The application supplies token resolvers. |
| Outbound destinations | Keep HTTPS origins in trusted configuration; restrict network egress and private addresses according to the deployment. | Exact-origin enforcement and refused redirects are included. DNS/IP firewall rules are not. |
| Input and output | Build requests from declared fields; validate types, sizes and returned schemas; expose only required fields. | Provider adapters validate their response shapes. Supabase row domain types and UI sanitization remain project-owned. |
| Time and volume | Set an overall operation deadline as well as per-request deadlines. Bound pages, response size and concurrent provider load. | Per-request time/byte caps and bounded pages are included. Scheduling and concurrency policy are external. |
| Failures and retries | Record ambiguous write outcomes; reuse a persisted operation key only for the same intended parameters; make any retry policy provider-aware. | No automatic retries. Stripe/Resend idempotency headers are explicit. There is no invented deduplication guarantee for model or Steel calls. |
| Observability | Record safe operation name, duration, result/error code, numeric HTTP status and application operation ID. Redact access tokens, URLs containing credentials, provider bodies and personal/model content. | Fixed redacted errors are included. Logs, tracing, audit storage and retention need application configuration. |
| Deployment verification | Exercise successful and rejected calls in a provider test environment, confirm policy behavior and reconcile actual provider records. | Repository tests use mocked Fetch only. Live sandbox and deployed acceptance are still required. |

Supabase RLS should be enabled and tested for the tables reachable through the Data API. Publishable keys identify the project/application layer; user access tokens and policies constrain user rows. Secret/service-role credentials have different privileges and must not be substituted to “fix” a denied user read. This adapter rejects non-publishable API keys. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [API-key roles](https://supabase.com/docs/guides/getting-started/api-keys).

For high-frequency GitHub synchronization, implement provider-aware webhooks, conditional requests and rate-limit handling using the [official best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api). This small client uses documented page parameters and stable ordering for a bounded interactive list; it does not expose `Link`, ETag, or rate-limit headers. It refuses redirects, including moved repositories. Resolve the canonical repository reference through a reviewed configuration change, or adopt an SDK integration that validates every redirected/paginated destination before forwarding credentials. Do not enable unrestricted redirects or poll whole accounts continuously.

## Verification status and deliberate exclusions

The source is original Apache-2.0 code. Tests replace the outbound HTTP boundary, not the client implementation, and check exact request paths, headers and payloads, rejected authorization, shared deadline/abort behavior, response byte caps, malformed responses, no retries, and secret redaction. No provider credential, payment, email, database, calendar, model usage, or browser session was exercised during repository validation.

SSO/OIDC provisioning, OAuth callback/PKCE flows, token refresh implementations, tenant credential vaults, webhook receiver implementations, persistent queues, durable budgets, Stripe Connect/merchant onboarding, third-party SDK vendoring, full calendar synchronization, AI streaming/tools, and native secure-storage integration remain outside these client operations. Choose an existing project component or separately reviewed module for those capabilities. Installing this code alone does not complete a live provider integration.
