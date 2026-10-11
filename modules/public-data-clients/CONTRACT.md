# Public data clients · 0.1.0

## What installs

Original Apache-2.0 TypeScript source for twelve deliberately narrow, read-only provider adapters and a shared HTTPS transport. No runtime package is required. The supported server baseline is Node.js 22+ with standard Fetch, streams, AbortController, TextEncoder and TextDecoder. The receiving application compiles the files through its TypeScript pipeline. Local fixtures were executed on Node.js **24.19.0** with TypeScript **7.0.2**; this is not evidence that an arbitrary receiving framework or every provider deployment was exercised.

Installation and import perform no network calls, environment reads, key discovery, account setup or package installation. Factories reject a browser DOM runtime. The receiving build must also keep these files in its server-only dependency graph; a runtime guard does not prove that a bundler excludes server code.

External API data, provider software and hosted access retain their own terms. The module's Apache-2.0 license applies to this original adapter source. Consult [the expansion resource guide](../../docs/resources/integration-expansion.md) and the primary provider documentation before shipping a particular connector.

## Installation and imports

From a reviewed Genlib checkout:

```bash
node "$GENLIB_ROOT/bin/genlib.mjs" plan public-data-clients --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" add public-data-clients --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" verify --target "$APP_ROOT" --json
```

The default destination is `src/genlib/public-data-clients/`. Imports below assume a receiving file at `src/server/public-data.ts`; adjust the relative import to the application's own layout.

```ts
import { createCensusClient } from "../genlib/public-data-clients/census.js";
import { PublicDataError } from "../genlib/public-data-clients/http.js";

// Supply these from the application's trusted server configuration and request context.
export function censusForRequest(config: {
  apiKey: string;
  canReadDemographics: boolean;
}) {
  return createCensusClient({
    dataset: "2024/acs/acs5",
    allowedVariables: ["NAME", "B01003_001E", "B01003_001M"],
    authorize: () => config.canReadDemographics,
    getApiKey: async () => config.apiKey,
    timeoutMs: 10_000,
    maxResponseBytes: 2 * 1024 * 1024,
    maxRetries: 0,
  });
}

export async function populationByState(
  client: ReturnType<typeof censusForRequest>,
  signal: AbortSignal,
) {
  try {
    const result = await client.query({
      variables: ["NAME", "B01003_001E", "B01003_001M"],
      for: "state:*",
      signal,
    });
    if (result.notModified) throw new Error("This request did not supply a cached validator.");
    // Keep FIPS leading zeros, large numbers, nulls and Census suppression codes intact.
    return result;
  } catch (error) {
    if (error instanceof PublicDataError) {
      // Map code/status into the application's error response. Do not log request URLs/keys.
      throw error;
    }
    throw error;
  }
}
```

The dataset is an explicit example, not a claim that it is the newest release. Check the chosen dataset's variables, geography requirements and release vintage. Dataset and variable allowlists belong in server configuration; do not forward an incoming URL/query object wholesale.

## Shared request and response contract

Every provider factory accepts `PublicDataOptions`. `fetch` and `origin` are trusted server configuration; an operation cannot change its configured origin. Inject a Fetch implementation for tests or controlled egress. It must honor `redirect: "error"` and AbortSignal. An explicit HTTPS origin is not DNS/IP egress isolation.

| Option | Default and bound | Behavior |
| --- | --- | --- |
| `timeoutMs` | 15,000; 1–120,000 ms | Total operation deadline including authorization, credentials, requests, retry waits and body reading |
| `maxResponseBytes` | 1 MiB; 1 byte–8 MiB | Counts decoded streamed bytes; a misleading or compressed Content-Length cannot bypass it |
| `maxRequestBytes` | 256 KiB; 1 byte–8 MiB | Counts UTF-8 bytes in read-only POST bodies |
| `maxRetries` | 0; maximum 2 | Opt-in retries only for HTTP 429, 502, 503 and 504 on the documented read operations |
| `maxRetryDelayMs` | 5,000; 0–10,000 ms | A longer Retry-After returns an error instead of retrying early |
| `authorize` | Optional application callback | Receives frozen provider/path/method metadata before credentials; only an explicit `true` allows the operation |

No cookies, proxy credentials or forwarding headers are inherited. Unsafe origins, cross-origin responses, redirects and dot-segment routes are rejected. Failed response bodies and raw Fetch/credential/authorization errors are not retained in errors. Credentials are resolved lazily once per operation; no environment or filesystem lookup is built in. Treat paths passed to your authorization callback as application query data. They do not contain credential parameters added later by the transport.

`ReadOptions` accepts a caller `signal` and, for GET operations, matching cache validators. All results use this discriminated union:

```ts
type DataResult<T> =
  | { notModified: false; data: T; meta: ResponseMetadata }
  | { notModified: true; data: null; meta: ResponseMetadata };
```

`meta` includes provider identity, a public documentation source, attribution, retrieval timestamp, HTTP status, attempt count, cache-control/ETag/Last-Modified/Expires/Age, and allowlisted rate/concurrency headers. It excludes request URLs and credential values. The adapter does not store cached representations. If a GET returns 304, retrieve the matching cached data yourself; `data: null` is not a newly downloaded empty dataset. An unsolicited 304 without supplied validators is rejected.

```ts
import { createFrankfurterClient } from "./public-data-clients/frankfurter.js";

const client = createFrankfurterClient();
const previous = await client.getRate("EUR", "USD");
if (!previous.notModified && previous.meta.cache.etag) {
  const checked = await client.getRate("EUR", "USD", {
    cache: { etag: previous.meta.cache.etag },
    signal,
  });
  const value = checked.notModified ? previous.data : checked.data;
  // The cache owner must also apply cache-control, Vary, age and tenant/access boundaries.
}
```

Cache storage, expiration policy, conditional representations, cross-process rate limits and concurrent-request budgets remain application responsibilities. Honor restrictive cache-control, including `no-store`, and avoid retry storms across workers. Metadata is evidence from one response, not a guarantee of later freshness.

`PublicDataError` exposes only a fixed `code`, optional HTTP `status` and optional `retryAfterMs`. Codes cover invalid configuration/input, authentication, denied application authorization, abort, timeout, network, HTTP, redirect, malformed response, and request/response size limits. HTTP 404 remains an HTTP error; a missing provider record is not silently converted into an existing empty record. Model a receiving application's expected not-found UX explicitly.

## Provider operations

Every returned field is validated before exposure. Unknown provider fields are omitted. Response-shape failures become `INVALID_RESPONSE`. Returned links and text are inert data: no relationship URL, product link, version command, embedded HTML or provider instruction is fetched or executed automatically.

| Factory and source file | Implemented operations | Important input/output behavior |
| --- | --- | --- |
| `createFrankfurterClient` · `frankfurter.ts` | `getRate(base, quote, options?)`; `getRates(selection)` | V2 pair/rates routes; dates, selected providers, optional closed date ranges, at most 50 quotes; preserves rate dates/provider attribution |
| `createNwsClient` · `nws.ts` | `getGrid(latitude, longitude, options?)`; `getForecast(grid, options?)`; `getActiveAlerts(latitude, longitude, options?)` | Required application User-Agent; constructs the forecast route from validated grid coordinates; supports standard/hourly forecasts and requested `us`/`si` units; preserves missing temperatures, precipitation and alert expiry |
| `createCensusClient` · `census.ts` | `query({ variables, for, in?, signal?, cache? })` | Fixed vintage/dataset, allowed variables and required key callback; at most 50 selected variables; converts header/row tables while keeping values and FIPS codes as strings or null |
| `createVpicClient` · `vpic.ts` | `decodeVin(input, options?)`; `decodeBatch(inputs, options?)` | Full VIN by default; partial VIN and `*` only when explicitly enabled; optional model year; at most 50 read-only POST batch items; preserves decode error codes independently of HTTP success |
| `createCrossrefClient` · `crossref.ts` | `getWork(doi, options?)`; `listWorks({ query, cursor?, rows?, signal?, cache? })` | Normalizes DOI URL/prefix forms; requires app User-Agent; optional polite-pool contact; selected bibliography fields, at most 100 rows per page and opaque next cursor |
| `createGleifClient` · `gleif.ts` | `getEntity(lei, options?)`; `search({ name, country?, page?, pageSize?, signal?, cache? })` | Normalizes LEI shape; legal and registration statuses stay separate; returns aliases, jurisdiction, source publication date and inert relationship links; does not pick an ambiguous match automatically |
| `createRorClient` · `ror.ts` | `getOrganization(id, options?)`; `search({ query, page?, country?, status?, signal?, cache? })`; `matchAffiliation(text, options?)` | V2 organization schema; multiple names/languages and inactive/successor relationships; preserves affiliation score/chosen flags; never paginates beyond the 10,000-result cap |
| `createOpenFoodFactsClient` · `open-food-facts.ts` | `getProduct(barcode, options?)`; `search({ categoryTag?, brandTag?, countryTag?, page?, pageSize?, signal?, cache? })` | Required app User-Agent; v3 product reads; structured taxonomy search through v2; sparse product/nutrition values; at least one search filter and at most 50 products per page |
| `createOpenMeteoClient` · `open-meteo.ts` | `getForecast(selection)` | Explicit `noncommercial`, `customer` or `self-hosted` profile; customer key callback; approved current/hourly variables, 1–16 forecast days, explicit units/timezone; validates aligned time/value arrays and preserves nulls |
| `createDepsDevClient` · `deps-dev.ts` | `getVersion({ system, name, version }, options?)`; `getDependencies(version, options?)` | Exact, encoded package/version routes; source project links, license/advisory/deprecation metadata and graph edge bounds; empty licenses stay unknown |
| `createOsvClient` · `osv.ts` | `query(exactPackageOrCommit, options?)`; `queryBatch(queries, options?)`; `getAdvisory(id, options?)` | Read-only POST queries; package/version or commit, not both; up to 100 batch queries; per-query pagination and output positions; advisory IDs, aliases, affected ranges and source references |
| `createEndOfLifeClient` · `endoflife.ts` | `getProduct(slug, options?)`; `findRelease(product, release, options?)` | V1 products routes, source generation/modification dates and official policy URL; EOL and maintained status remain separate; no execution of provider-supplied version commands |

The adapters intentionally expose one page at a time instead of hiding unbounded network walks. Carry the returned cursor/page token into another explicit operation and apply the caller's cancellation and budget again. Array and byte bounds may require a smaller query or a bulk-download workflow for large datasets.

## Provider-specific responsibilities

**Frankfurter:** values are reference rates. The module does not multiply or round money, pick a tax authority's accepted rate, select a commercial settlement quote or promise arbitrary-precision decoding of JSON numbers. Choose an authoritative provider/date and perform application money arithmetic with an appropriate decimal representation. Missing `providers` in a pegged-currency response remains `null`, not an invented provider.

**NWS:** cache and periodically refresh point-to-grid mapping. Request units explicitly and preserve the returned unit. This client implements numeric forecast temperatures and GeoJSON alerts without experimental feature flags. Coastal marine forecasts and raw grid-data/observation profiles are outside the implemented surface. It is not a replacement for emergency notification infrastructure.

**Census:** provision the currently required free data-query key and preserve the product attribution/non-endorsement notice. Select estimate and uncertainty columns together where relevant. Suppression codes, estimates and margins of error are not interpreted by this generic table adapter. Access conditions and dataset availability are documented by [Census](https://www.census.gov/data/developers/guidance/api-user-guide.API_Key.html).

**vPIC:** this is vehicle specification decoding. Error codes can coexist with useful partial fields; HTTP 200 does not mean a complete valid VIN. The adapter checks identifier shape, not ownership, vehicle history or an independent VIN check-digit/business eligibility policy. Use NHTSA's downloadable data for bulk workflows.

**Crossref:** abstracts are omitted by default. `includeAbstract: true` opts into returning the field without granting content rights. Keep publisher/author restrictions, contact identification and current rate/concurrency headers visible to consumers. Match cursor results conservatively and handle an empty final page.

**GLEIF and ROR:** validate application identity requirements independently; these are entity/reference catalogs, not universal company coverage. A lapsed LEI registration can describe an active legal entity. An inactive ROR record may need a historical citation or successor relationship, not silent replacement. Preserve GeoNames attribution with ROR geographic data.

**Open Food Facts:** v3 product lookup and v2 structured search are separate routes. This profile does not claim general free-text search. Current documentation lists tight per-IP limits (15 product reads/minute, 10 searches/minute); enforce shared limits and use data exports for bulk enrichment. Treat ingredients, nutrition and product images according to their data/content licenses and application accuracy requirements.

**Open-Meteo:** the free hosted profile is for noncommercial use. A commercial hosted application must select its customer subscription and supply the key; self-hosted configuration requires an explicit origin. The profile setting documents the caller's selected deployment, not legal authorization or subscription provisioning. Current/hourly times are requested as Unix seconds; retain the returned timezone and UTC offset for display.

**deps.dev, OSV and endoflife.date:** run cached enrichment deliberately in a maintainer or backend workflow, not every offline Genlib search. deps.dev direct advisory IDs do not cover its dependency graph automatically; query exact resolved dependency versions separately when needed. Empty or missing license metadata is unknown, and multiple listed licenses are not rewritten as an invented SPDX conjunction/disjunction. No OSV findings is not proof that a version is safe. endoflife.date is secondary evidence; confirm consequential support/retirement decisions against the linked official policy. The upstream API currently describes its v1 contract as beta.

## Verification and limits

The mock-transport test suite covers each provider's route and selected schema plus denied authorization, credential handling, total deadlines, cancellation, redirect rejection, decoded-size limits, malformed JSON/UTF-8, empty and sparse data, partial VINs, cursor/page behavior, conditional 304 responses, bounded retries and error redaction. Fixtures replace only Fetch; production adapters run unmodified.

```bash
npm run build
node --test tests/public-data-clients.test.mjs
```

No provider credentials, live emails, purchases, sessions or write APIs are used in these tests. Public documentation/schema reads used during implementation are separate from runtime acceptance. The fixture suite does not prove live quota behavior, availability, current key entitlement, response freshness, the application's cache isolation, deployment egress controls or the full semantics of provider data. Check those in the receiving application with approved configuration and the actual provider account when needed.
