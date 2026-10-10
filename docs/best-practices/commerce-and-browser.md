# Commerce and browser API recipes

The [common-api-clients module](../../modules/common-api-clients/CONTRACT.md) includes original TypeScript clients for two attached resources: Saleor and Steel Browser. Both use the module's bounded HTTPS transport. Install the source with Genlib, then configure and call it inside a trusted Node 22+ service. Neither client provisions a backend or supplies credentials.

```sh
node bin/genlib.mjs inspect common-api-clients --json
node bin/genlib.mjs plan common-api-clients --target /absolute/path/to/server --json
node bin/genlib.mjs add common-api-clients --target /absolute/path/to/server --json
node bin/genlib.mjs verify --target /absolute/path/to/server --json
```

The target directory must already exist. Follow its TypeScript/module-resolution rules when importing copied source. Genlib installs editable TypeScript, not a global SDK or an npm-published package.

## Saleor: a bounded commerce catalog client

`createSaleorClient` exposes `listProducts` and `getProduct`. It uses variables for GraphQL input, requires a channel, caps a page at 100 products, validates the returned fields and treats GraphQL errors inside an HTTP 200 response as failure. It deliberately returns only product IDs, names, slugs and pagination metadata.

```ts
import { createSaleorClient } from './genlib/common-api-clients/saleor.js';

export function createStorefrontCatalog(configuration: { saleorEndpoint: string }) {
  const saleor = createSaleorClient({
    endpoint: configuration.saleorEndpoint,
    timeoutMs: 10_000,
    maxResponseBytes: 512_000,
  });

  return {
    list(channel: string, after?: string) {
      return saleor.listProducts({
        channel,
        first: 24,
        ...(after === undefined ? {} : { after }),
      });
    },
    get(id: string, channel: string) {
      return saleor.getProduct({ id, channel });
    },
  };
}
```

Pass the endpoint from trusted deployment configuration, such as the HTTPS GraphQL URL for your own Saleor instance. Public storefront reads do not need an administrative token. When a token is required, supply a `token(signal)` resolver backed by the application's approved secret/session mechanism. Privileged tokens can expose unpublished products; apply tenant, channel and publication policies before returning those results to a user.

Keep checkout, inventory mutation, tax calculation, order fulfillment and payment confirmation in explicit application services. This recipe does not implement those operations. Use Saleor's exact versioned schema and upstream SDKs when expanding the scope.

Official contract references: [products query](https://docs.saleor.io/api-reference/products/queries/products), [product query](https://docs.saleor.io/api-reference/products/queries/product), [Saleor source and deployment guidance](https://github.com/saleor/saleor). Saleor Core uses BSD-3-Clause; its deployment, dashboard and storefront are separate parts. For a receiving project's UI, [Storefront UI](https://github.com/vuestorefront/storefront-ui) is a separately licensed option; consult the component-specific [Alokai review](../resources/attachment-review.md).

## Steel: browser session lifecycle

`createSteelBrowserClient` exposes `createSession`, `getSession`, `releaseSession` and `withSession`. Every request calls the application's `authorize` callback and credential resolver within the request deadline. Creation requires an explicit provider-side session timeout. `withSession` attempts a separately bounded release when the callback succeeds, fails or cancels its signal.

```ts
import { createSteelBrowserClient } from './genlib/common-api-clients/steel-browser.js';
import type { SteelSession } from './genlib/common-api-clients/steel-browser.js';

export function createBrowserWork(dependencies: {
  getApiKey: (signal: AbortSignal) => Promise<string>;
  authorize: (operation: 'create' | 'read' | 'release', sessionId: string | null,
    signal: AbortSignal) => Promise<boolean>;
  recordSession: (sessionId: string) => Promise<void>;
}) {
  const steel = createSteelBrowserClient({
    apiKey: dependencies.getApiKey,
    authorize: ({ operation, sessionId }, signal) =>
      dependencies.authorize(operation, sessionId, signal),
    timeoutMs: 15_000,
  });

  return async function run<T>(work: (session: SteelSession) => Promise<T>) {
    return steel.withSession({ timeoutMs: 60_000 }, async session => {
      await dependencies.recordSession(session.id);
      return work(session);
    });
  };
}
```

Implement `authorize` against the authenticated principal, project membership, permitted browser capabilities, current session ownership and a reserved spending budget. The example intentionally injects those real application services; it does not return a default `true`. A provider-side lifetime limit is not a dollar budget. Record session ownership durably before doing work, and provide a cleanup policy for a session created by this operation even if the main task fails before recording it.

Use an independently configured Playwright/Puppeteer/CDP connector in the callback. Validate the connection's destination against your approved CDP hosts before connecting. The returned `websocketUrl` must remain server-side; it can carry sensitive connection information. Supply the cloud authentication details required by Steel's current connection documentation. Do not expose debugging URLs, cookies or browser sessions directly to other tenants or public viewers.

For self-hosting, configure a trusted HTTPS API origin; this client intentionally does not accept plain HTTP. Deploy the browser service separately with private networking, explicit egress rules and session cleanup. The upstream [Steel Browser](https://github.com/steel-dev/steel-browser) repository describes its service setup. It is browser infrastructure, not a complete native tabbed browser UI.

### Failures and recovery

No request is automatically retried. If session creation times out, is cancelled after posting, or fails before a usable response arrives, the remote service may already have created a session. Reconcile through the provider's session inventory and your durable operation record before trying again. When a malformed creation response contains a valid safe session ID, the client attempts an independently bounded, freshly authorized release before reporting failure. A response without a usable ID still requires provider-side reconciliation. A browser's own timeout bounds its lifetime but does not prove cancellation of work it already performed.

If releasing a known session fails or the provider returns `success: false`, the client throws `SteelCleanupError`. It includes the session ID, `phase` (`creation` or `work`) and whether the work callback also failed, without retaining provider response bodies or connection URLs. Returned session fields are immutable, and cleanup retains the actual created ID independently of callback code. Record successful work inside the callback before returning when it must survive an uncertain cleanup result. Reconcile the known session; do not automatically replay the task. After a successful direct `createSession` call, that caller owns release/recovery itself.

The work callback's lifetime is application-owned. Transport deadlines bound HTTP requests, not arbitrary callback code or external work. Supply your normal cancellation and execution policy to the browser connector.

Official API evidence: [Steel SDK endpoint index](https://github.com/steel-dev/steel-node/blob/main/api.md), [session request/response contracts](https://github.com/steel-dev/steel-node/blob/main/src/resources/sessions/sessions.ts), [client authentication header](https://github.com/steel-dev/steel-node/blob/main/src/index.ts). The adapter was authored against those contracts and does not bundle the upstream SDK or browser engine.

## Verification

`tests/commerce-browser.test.mjs` executes these clients against injected HTTP responses. It verifies Saleor variable encoding, bounded pages, GraphQL failure handling, Steel authorization ordering, create/release request contracts, cleanup after task failure/cancellation, immutable session identity, cleanup of malformed creation responses and uncertain release reporting. It does not create live sessions, deploy Saleor, connect a browser or test provider account configuration.

For production acceptance, use a configured test environment to prove authentication, principal/resource isolation, page/schema compatibility, session creation, CDP connectivity, cancellation, cleanup and reconciliation. Keep those live results separate from the local contract-test evidence.
