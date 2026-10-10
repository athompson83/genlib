// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { PublicDataError, createPublicDataTransport } from "../.build/modules/public-data-clients/files/http.js";
import { createFrankfurterClient } from "../.build/modules/public-data-clients/files/frankfurter.js";
import { createNwsClient } from "../.build/modules/public-data-clients/files/nws.js";
import { createCensusClient } from "../.build/modules/public-data-clients/files/census.js";
import { createVpicClient } from "../.build/modules/public-data-clients/files/vpic.js";
import { createCrossrefClient } from "../.build/modules/public-data-clients/files/crossref.js";
import { createGleifClient } from "../.build/modules/public-data-clients/files/gleif.js";
import { createRorClient } from "../.build/modules/public-data-clients/files/ror.js";
import { createOpenFoodFactsClient } from "../.build/modules/public-data-clients/files/open-food-facts.js";
import { createOpenMeteoClient } from "../.build/modules/public-data-clients/files/open-meteo.js";
import { createDepsDevClient } from "../.build/modules/public-data-clients/files/deps-dev.js";
import { createOsvClient } from "../.build/modules/public-data-clients/files/osv.js";
import { createEndOfLifeClient } from "../.build/modules/public-data-clients/files/endoflife.js";

const sensitive = "secret-must-not-escape";
const agent = "ExampleDataApp/1.0 (https://example.test/contact)";
const fail = code => error => error instanceof PublicDataError && error.code === code;
const transportConfig = { origin: "https://provider.example.test", provider: "fixture", source: "https://provider.example.test/docs", attribution: "Fixture source" };
const json = (data, headers = {}) => Response.json(data, { headers });
/** Replace only outbound Fetch. Production parsing, deadlines, cache handling and retries execute. */
function fixture(responses = []) {
  const calls = [];
  return { calls, fetch: async (url, options) => {
    const call = { url: new URL(String(url)), options, headers: new Headers(options.headers) }; calls.push(call);
    assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit"); assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal); assert.equal(options.signal.aborted, false);
    assert.ok(responses.length, "Unexpected outbound call; live traffic is forbidden in this fixture.");
    const response = responses.shift(); if (typeof response === "function") return response(call);
    if (response instanceof Error) throw response; return response instanceof Response ? response : json(response);
  } };
}
const identity = value => value;

test("public transport validates fixed origins, routes and forbidden headers before fetching", async () => {
  const mock = fixture();
  for (const origin of ["http://example.test", "https://a:b@example.test", "https://example.test/api", "https://example.test?key=secret", "https://example.test/#x"]) {
    assert.throws(() => createPublicDataTransport({ ...transportConfig, origin, fetch: mock.fetch }), fail("INVALID_CONFIG"));
  }
  const client = createPublicDataTransport({ ...transportConfig, fetch: mock.fetch });
  for (const path of ["//evil.test/a", "https://evil.test/a", "/a/../b", "/%2e%2e/b", "/a#secret", "/\\evil.test/a"]) await assert.rejects(client.request(path, identity), fail("INVALID_INPUT"));
  for (const name of ["cookie", "host", "proxy-authorization", "connection", "content-length", "transfer-encoding"]) {
    await assert.rejects(createPublicDataTransport({ ...transportConfig, fetch: mock.fetch, headers: { [name]: sensitive } }).request("/read", identity), fail("INVALID_CONFIG"));
  }
  await assert.rejects(client.request("/read", identity, { method: "DELETE" }), fail("INVALID_INPUT"));
  assert.equal(mock.calls.length, 0);
});

test("credentials are lazy, caller-scoped and absent from returned metadata or normalized failures", async () => {
  let resolutions = 0;
  const mock = fixture([{ ok: true }, new Error(`provider error ${sensitive}`)]);
  const client = createPublicDataTransport({ ...transportConfig, fetch: mock.fetch,
    credentials: async signal => { assert.equal(signal.aborted, false); resolutions += 1; return { query: { apikey: sensitive } }; } });
  assert.equal(resolutions, 0); const result = await client.request("/read", identity);
  assert.equal(mock.calls[0].url.searchParams.get("apikey"), sensitive);
  assert.ok(!JSON.stringify(result.meta).includes(sensitive)); assert.equal(result.meta.source, transportConfig.source);
  await assert.rejects(client.request("/read", identity), error => error.code === "NETWORK" && !`${error.stack}${JSON.stringify(error)}`.includes(sensitive));
  assert.equal(resolutions, 2);
  const denied = createPublicDataTransport({ ...transportConfig, fetch: mock.fetch, credentials: async () => { throw new PublicDataError("DENIED"); } });
  const bad = createPublicDataTransport({ ...transportConfig, fetch: mock.fetch, credentials: async () => { throw new Error(sensitive); } });
  await assert.rejects(denied.request("/read", identity), fail("DENIED"));
  await assert.rejects(bad.request("/read", identity), error => error.code === "AUTHENTICATION" && !error.stack.includes(sensitive));
  assert.equal(mock.calls.length, 2);
});

test("application denial happens before credentials and the browser factory guard does not rely on bundler naming", async () => {
  let credentialCalls = 0;
  const mock = fixture();
  const denied = createPublicDataTransport({ ...transportConfig, fetch: mock.fetch, authorize: (operation) => {
    assert.equal(operation.provider, "fixture"); assert.equal(operation.method, "GET"); assert.ok(Object.isFrozen(operation)); return false;
  }, credentials: async () => { credentialCalls += 1; return {}; } });
  await assert.rejects(denied.request("/read", identity), fail("DENIED")); assert.equal(credentialCalls, 0); assert.equal(mock.calls.length, 0);
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window"), previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  try {
    Object.defineProperty(globalThis, "window", { value: {}, configurable: true }); Object.defineProperty(globalThis, "document", { value: {}, configurable: true });
    assert.throws(() => createFrankfurterClient({ fetch: mock.fetch }), fail("INVALID_CONFIG"));
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else delete globalThis.document;
  }
});

test("total deadline and cancellation cover credential resolution, Fetch and stalled response reads", async () => {
  const preAborted = new AbortController(); preAborted.abort(sensitive);
  let credentialCalls = 0;
  const credentials = createPublicDataTransport({ ...transportConfig, timeoutMs: 15, credentials: async () => { credentialCalls += 1; return new Promise(() => {}); } });
  await assert.rejects(credentials.request("/read", identity, { signal: preAborted.signal }), fail("ABORTED")); assert.equal(credentialCalls, 0);
  await assert.rejects(credentials.request("/read", identity), fail("TIMEOUT"));
  const caller = new AbortController();
  let outboundSignal;
  const stalledFetch = createPublicDataTransport({ ...transportConfig, fetch: async (_url, options) => { outboundSignal = options.signal; return new Promise(() => {}); } });
  const pending = stalledFetch.request("/read", identity, { signal: caller.signal });
  caller.abort(sensitive); await assert.rejects(pending, error => error.code === "ABORTED" && !error.stack.includes(sensitive));
  assert.equal(outboundSignal.aborted, true);
  let cancelled = false;
  const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"pending":')); }, cancel() { cancelled = true; } });
  const read = createPublicDataTransport({ ...transportConfig, timeoutMs: 15, fetch: fixture([new Response(body, { headers: { "content-type": "application/json" } })]).fetch });
  await assert.rejects(read.request("/read", identity), fail("TIMEOUT")); await nextTurn(); assert.equal(cancelled, true);
});

test("transport preserves validator/rate metadata and handles 304 without fabricating cached data", async () => {
  const mock = fixture([json({ value: 42 }, { etag: '"v1"', "cache-control": "public, max-age=60", "last-modified": "Sat, 10 Oct 2026 00:00:00 GMT", age: "7", "x-rate-limit-limit": "10", "x-concurrency-limit": "3" }), new Response(null, { status: 304, headers: { etag: '"v1"' } }), new Response(null, { status: 304 })]);
  const client = createPublicDataTransport({ ...transportConfig, fetch: mock.fetch });
  const first = await client.request("/read", identity);
  assert.equal(first.notModified, false); assert.equal(first.meta.cache.ageSeconds, 7); assert.equal(first.meta.cache.cacheControl, "public, max-age=60");
  assert.equal(first.meta.rateLimit["x-concurrency-limit"], "3");
  const second = await client.request("/read", identity, { cache: { etag: first.meta.cache.etag } });
  assert.equal(second.notModified, true); assert.equal(second.data, null); assert.equal(second.meta.status, 304);
  assert.equal(mock.calls[1].headers.get("if-none-match"), '"v1"');
  await assert.rejects(client.request("/read", identity), fail("INVALID_RESPONSE"));
});

test("retries are opt-in, bounded, honor Retry-After and share the total deadline", async () => {
  const retry = () => new Response(null, { status: 429, headers: { "retry-after": "0" } });
  const mock = fixture([retry(), new Response(null, { status: 503, headers: { "retry-after": "0" } }), { ok: true }]);
  const client = createPublicDataTransport({ ...transportConfig, fetch: mock.fetch, maxRetries: 2 });
  assert.equal((await client.request("/read", identity)).meta.attempts, 3); assert.equal(mock.calls.length, 3);
  const conservative = fixture([retry()]);
  await assert.rejects(createPublicDataTransport({ ...transportConfig, fetch: conservative.fetch }).request("/read", identity), fail("HTTP")); assert.equal(conservative.calls.length, 1);
  const delayed = fixture([new Response(null, { status: 429, headers: { "retry-after": "60" } })]);
  await assert.rejects(createPublicDataTransport({ ...transportConfig, fetch: delayed.fetch, maxRetries: 2 }).request("/read", identity), e => e.code === "HTTP" && e.status === 429 && e.retryAfterMs === 60000); assert.equal(delayed.calls.length, 1);
  const timeout = fixture([new Response(null, { status: 503 })]);
  await assert.rejects(createPublicDataTransport({ ...transportConfig, fetch: timeout.fetch, maxRetries: 1, timeoutMs: 10 }).request("/read", identity), fail("TIMEOUT"));
  await nextTurn(); assert.equal(timeout.calls.length, 1);
});

test("error bodies are not read and redirects, malformed content and decoded byte overruns fail closed", async () => {
  let cancelled = 0;
  const errorBody = new ReadableStream({ cancel() { cancelled += 1; } });
  const crossOrigin = json({ ok: true }); Object.defineProperty(crossOrigin, "url", { value: "https://other.test/read" });
  const oversized = new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('"' + 'x'.repeat(100))); }, cancel() { cancelled += 1; } }), { headers: { "content-type": "application/json", "content-length": "1" } });
  const mock = fixture([new Response(errorBody, { status: 401, statusText: sensitive }), new Response(null, { status: 302 }), crossOrigin,
    new Response("{}", { headers: { "content-type": "text/html" } }), new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
    new Response("not-json", { headers: { "content-type": "application/json" } }), oversized]);
  const client = createPublicDataTransport({ ...transportConfig, fetch: mock.fetch, maxResponseBytes: 40 });
  for (const code of ["HTTP", "REDIRECT", "REDIRECT", "INVALID_RESPONSE", "INVALID_RESPONSE", "INVALID_RESPONSE", "RESPONSE_TOO_LARGE"]) await assert.rejects(client.request("/read", identity), error => error.code === code && !`${error.stack}${JSON.stringify(error)}`.includes(sensitive));
  await nextTurn(); assert.equal(cancelled, 2);
});

test("request invocation captures body, method and conditional headers before delayed credentials", async () => {
  let resolve;
  const mock = fixture([{ ok: true }]);
  const client = createPublicDataTransport({ ...transportConfig, fetch: mock.fetch, maxRequestBytes: 16, credentials: () => new Promise(done => { resolve = done; }) });
  const options = { method: "POST", body: '{"a":1}', contentType: "application/json" };
  const pending = client.request("/query", identity, options); options.body = sensitive.repeat(100); options.method = "DELETE";
  resolve({}); await pending; assert.equal(mock.calls[0].options.body, '{"a":1}'); assert.equal(mock.calls[0].options.method, "POST");
  await assert.rejects(client.request("/query", identity, { method: "POST", body: "😀".repeat(5) }), fail("REQUEST_TOO_LARGE"));
});

test("Frankfurter v2 preserves dates/providers and validates time-series and currency selections", async () => {
  const rate = { date: "2026-10-09", base: "EUR", quote: "USD", rate: 1.123456, providers: ["ecb"] };
  const mock = fixture([rate, [rate]]), client = createFrankfurterClient({ fetch: mock.fetch });
  const result = await client.getRate("eur", "usd", { date: "2026-10-09", providers: ["ecb"] });
  assert.equal(result.data.rate, 1.123456); assert.deepEqual(result.data.providers, ["ecb"]);
  assert.equal(mock.calls[0].url.pathname, "/v2/rate/EUR/USD"); assert.equal(mock.calls[0].url.searchParams.get("providers"), "ecb");
  await client.getRates({ base: "eur", quotes: ["usd"], from: "2026-10-01", to: "2026-10-09" });
  for (const selection of [{ base: "USD", quotes: [] }, { base: "USD", quotes: ["EUR"], date: "2026-02-31" }, { base: "USD", quotes: ["EUR"], from: "2026-10-09", to: "2026-10-01" }]) assert.throws(() => client.getRates(selection), fail("INVALID_INPUT"));
  assert.equal(mock.calls.length, 2);
});

test("NWS discovers a grid without following provider URLs, returns units/nulls and alert expiry", async () => {
  const period = { number: 1, name: "Tonight", startTime: "2026-10-10T18:00:00-04:00", endTime: "2026-10-11T06:00:00-04:00", isDaytime: false, temperature: null, temperatureUnit: "C", windSpeed: "5 km/h", windDirection: "N", shortForecast: "Cloudy", detailedForecast: "Cloudy overnight.", probabilityOfPrecipitation: { value: null } };
  const mock = fixture([{ properties: { gridId: "LWX", gridX: 1, gridY: 2, timeZone: "America/New_York", forecast: "https://other.test/steal" } },
    { properties: { updated: "2026-10-10T14:00:00Z", validTimes: "2026-10-10T14:00:00Z/P7D", periods: [period] } },
    { features: [{ id: "urn:alert:1", properties: { event: "Wind Advisory", severity: "Moderate", certainty: "Likely", urgency: "Expected", headline: null, description: "Gusty winds.", instruction: null, effective: "2026-10-10T14:00:00Z", onset: null, expires: "2026-10-11T00:00:00Z", ends: null } }] }]);
  const client = createNwsClient({ fetch: mock.fetch, userAgent: agent });
  const grid = (await client.getGrid(38.9, -77.0)).data;
  const forecast = (await client.getForecast(grid, { units: "si" })).data;
  assert.equal(forecast.periods[0].temperature, null); assert.equal(forecast.periods[0].temperatureUnit, "C"); assert.equal(forecast.periods[0].precipitationPercent, null);
  assert.equal(mock.calls[1].url.origin, "https://api.weather.gov"); assert.equal(mock.calls[1].url.pathname, "/gridpoints/LWX/1,2/forecast");
  assert.equal(mock.calls[0].headers.get("user-agent"), agent);
  assert.equal((await client.getActiveAlerts(38.9, -77)).data[0].expires, "2026-10-11T00:00:00Z");
  assert.throws(() => client.getGrid(100, -77), fail("INVALID_INPUT")); assert.equal(mock.calls.length, 3);
});

test("Census scopes variables, supplies the server key and preserves vintage/FIPS/suppression strings", async () => {
  const mock = fixture([[['NAME', 'B01003_001E', 'B01003_001M', 'state'], ['Alabama', '12345678901234567890', '-555555555', '01']], [['NAME','state'], ['bad-length']]]);
  let keys = 0;
  const client = createCensusClient({ fetch: mock.fetch, dataset: "2024/acs/acs5", allowedVariables: ["NAME", "B01003_001E", "B01003_001M"], getApiKey: async () => { keys += 1; return sensitive; } });
  assert.throws(() => client.query({ variables: ["OTHER"], for: "state:*" }), fail("INVALID_INPUT")); assert.equal(keys, 0);
  const result = await client.query({ variables: ["NAME", "B01003_001E", "B01003_001M"], for: "state:*" });
  assert.equal(result.data.dataset, "2024/acs/acs5"); assert.equal(result.data.rows[0].state, "01"); assert.equal(result.data.rows[0].B01003_001E, "12345678901234567890"); assert.equal(result.data.rows[0].B01003_001M, "-555555555");
  assert.equal(mock.calls[0].url.searchParams.get("key"), sensitive); assert.ok(!JSON.stringify(result).includes(sensitive)); assert.match(result.meta.attribution, /not endorsed/);
  await assert.rejects(client.query({ variables: ["NAME"], for: "state:01" }), fail("INVALID_RESPONSE"));
});

test("vPIC supports explicitly partial VINs and bounded read-only batches without hiding decode errors", async () => {
  const vin = "5UXWX7C50BA123456", partial = "5UXWX7C5*BA";
  const vehicle = (VIN, ErrorCode = "0") => ({ VIN, Make: "BMW", Model: "X3", ModelYear: "2011", BodyClass: "", VehicleType: "MULTIPURPOSE PASSENGER VEHICLE", FuelTypePrimary: "Gasoline", ErrorCode, ErrorText: ErrorCode === "0" ? "" : "Incomplete VIN" });
  const mock = fixture([{ Results: [vehicle(partial, "6, 14")] }, { Results: [vehicle(vin), vehicle(partial, "6")] }]);
  const client = createVpicClient({ fetch: mock.fetch });
  const result = await client.decodeVin({ vin: partial.toLowerCase(), allowPartial: true, modelYear: 2011 });
  assert.deepEqual(result.data.errorCodes, ["6", "14"]); assert.equal(result.data.bodyClass, null);
  const batch = await client.decodeBatch([{ vin, modelYear: 2011 }, { vin: partial, allowPartial: true }]); assert.equal(batch.data.length, 2);
  const body = new URLSearchParams(mock.calls[1].options.body); assert.equal(body.get("data"), `${vin},2011;${partial}`); assert.equal(mock.calls[1].options.method, "POST");
  assert.throws(() => client.decodeVin({ vin: partial }), fail("INVALID_INPUT")); assert.throws(() => client.decodeBatch(Array(51).fill({ vin })), fail("INVALID_INPUT")); assert.equal(mock.calls.length, 2);
});

test("Crossref normalizes DOI identifiers, preserves cursor opacity and excludes abstracts by default", async () => {
  const work = { DOI: "10.1234/Example.Item", title: ["Example research"], type: "journal-article", publisher: "Example Press", author: [{ given: "Ada", family: "Example", ORCID: "https://orcid.org/0000-0000-0000-0000" }], published: { "date-parts": [[2026, 9]] }, abstract: "Publisher controlled abstract" };
  const mock = fixture([{ message: work }, { message: { items: [work], "total-results": 2, "next-cursor": "opaque+/==" } }, { message: { items: [], "total-results": 2, "next-cursor": "same-opaque" } }]);
  const client = createCrossrefClient({ fetch: mock.fetch, userAgent: agent, mailto: "data@example.test" });
  const result = await client.getWork("https://doi.org/10.1234/Example.Item"); assert.equal(result.data.doi, "10.1234/example.item"); assert.equal(result.data.abstract, null); assert.deepEqual(result.data.published, [2026,9]);
  assert.equal(mock.calls[0].url.pathname, "/works/10.1234%2Fexample.item");
  const first = await client.listWorks({ query: "Example", rows: 1 }); assert.equal(first.data.nextCursor, "opaque+/==");
  const last = await client.listWorks({ query: "Example", rows: 1, cursor: first.data.nextCursor }); assert.equal(last.data.nextCursor, null); assert.equal(mock.calls[2].url.searchParams.get("cursor"), "opaque+/==");
  assert.equal(mock.calls[1].url.searchParams.get("select").includes("abstract"), false); assert.equal(mock.calls[1].url.searchParams.get("mailto"), "data@example.test");
});

const lei = "5493001KJTIIGC8Y1R12";
const legalEntity = { id: lei, attributes: { lei, entity: { legalName: { name: "Example Entity" }, otherNames: [{ name: "Example Alias" }], jurisdiction: "US-DE", legalAddress: { country: "US" }, status: "ACTIVE" }, registration: { status: "LAPSED", lastUpdateDate: "2026-10-01T00:00:00Z" } }, relationships: { "direct-parent": { links: { related: `https://api.gleif.org/api/v1/lei-records/${lei}/direct-parent` } } } };
test("GLEIF preserves legal/registration status and ambiguous paged search, with inert relationship links", async () => {
  const mock = fixture([{ data: legalEntity }, { data: [legalEntity], meta: { goldenCopy: { publishDate: "2026-10-10T00:00:00Z" }, pagination: { currentPage: 1, lastPage: 2, total: 2 } } }]);
  const client = createGleifClient({ fetch: mock.fetch });
  const entity = (await client.getEntity(lei.toLowerCase())).data; assert.equal(entity.entityStatus, "ACTIVE"); assert.equal(entity.registrationStatus, "LAPSED"); assert.equal(entity.relationships[0].kind, "direct-parent");
  const page = (await client.search({ name: "Example", country: "us", pageSize: 1 })).data; assert.equal(page.nextPage, 2); assert.equal(page.total, 2);
  assert.equal(mock.calls[1].url.searchParams.get("filter[entity.legalAddress.country]"), "US"); assert.equal(mock.calls.length, 2);
});

const ror = { id: "https://ror.org/02k7v4d05", names: [{ value: "Example Research", lang: "en", types: ["ror_display", "label"] }, { value: "ER", lang: null, types: ["acronym"] }], status: "inactive", types: ["education"], locations: [{ geonames_details: { name: "Example City", country_code: "US", lat: 40, lng: -73 } }], relationships: [{ id: "https://ror.org/03dz0k314", type: "successor", label: "Successor Research" }] };
test("ROR v2 retains alternate names/successors and respects the 10,000-result page cap", async () => {
  const mock = fixture([ror, { items: Array.from({length:20}, () => ror), number_of_results: 15000 }, { items: [{ chosen: false, score: 0.75, matching_type: "PHRASE", organization: ror }] }]);
  const client = createRorClient({ fetch: mock.fetch });
  const organization = (await client.getOrganization(ror.id)).data; assert.equal(organization.displayName, "Example Research"); assert.equal(organization.names.length, 2); assert.equal(organization.relationships[0].type, "successor");
  const page = (await client.search({ query: "Research", page: 500 })).data; assert.equal(page.nextPage, null); assert.equal(page.resultCap, 10000);
  const matches = (await client.matchAffiliation("Example research department")).data; assert.equal(matches[0].chosen, false); assert.equal(matches[0].score, 0.75);
  assert.equal(mock.calls[0].url.pathname, "/v2/organizations/02k7v4d05"); assert.throws(() => client.search({ query: "Research", page: 501 }), fail("INVALID_INPUT"));
});

test("Open Food Facts keeps v3 product reads separate from structured v2 search and handles sparse data", async () => {
  const product = { code: "3017620422003", product_name: "Example Food", nutriments: { proteins_100g: 5.2 }, allergens_tags: ["en:nuts"] };
  const mock = fixture([{ status: "success", product }, { count: 21, products: [product] }]);
  const client = createOpenFoodFactsClient({ fetch: mock.fetch, userAgent: agent });
  const item = (await client.getProduct(product.code)).data; assert.equal(item.brands, null); assert.equal(item.nutritionPer100g.proteins, 5.2); assert.equal(item.nutritionPer100g.salt, null);
  const page = (await client.search({ categoryTag: "en:spreads", countryTag: "en:france" })).data; assert.equal(page.nextPage, 2);
  assert.equal(mock.calls[0].url.pathname, `/api/v3/product/${product.code}`); assert.equal(mock.calls[1].url.pathname, "/api/v2/search"); assert.equal(mock.calls[1].url.searchParams.get("categories_tags"), "en:spreads");
  assert.throws(() => client.search({}), fail("INVALID_INPUT")); assert.throws(() => client.getProduct("bad/code"), fail("INVALID_INPUT"));
});

test("Open-Meteo requires a hosted-use profile, keeps customer keys server-side and validates parallel series", async () => {
  const weather = { latitude: 40, longitude: -73, timezone: "UTC", utc_offset_seconds: 0, current: { time: 1791633600, interval: 900, temperature_2m: 18 }, current_units: { temperature_2m: "°C" }, hourly: { time: [1791633600, 1791637200], temperature_2m: [18,null] }, hourly_units: { temperature_2m: "°C" } };
  const mock = fixture([weather, { ...weather, hourly: { time: [1,2], temperature_2m: [18] } }]);
  assert.throws(() => createOpenMeteoClient({ fetch: mock.fetch }), fail("INVALID_CONFIG"));
  assert.throws(() => createOpenMeteoClient({ access: "customer", fetch: mock.fetch }), fail("INVALID_CONFIG"));
  const client = createOpenMeteoClient({ access: "customer", fetch: mock.fetch, getApiKey: async () => sensitive });
  const input = { latitude: 40, longitude: -73, current: ["temperature_2m"], hourly: ["temperature_2m"] };
  const result = await client.getForecast(input); assert.equal(result.data.hourly.values.temperature_2m[1], null); assert.equal(result.data.current.units.temperature_2m, "°C");
  assert.equal(mock.calls[0].url.origin, "https://customer-api.open-meteo.com"); assert.equal(mock.calls[0].url.searchParams.get("apikey"), sensitive); assert.equal(mock.calls[0].url.searchParams.get("timeformat"), "unixtime"); assert.ok(!JSON.stringify(result).includes(sensitive));
  await assert.rejects(client.getForecast(input), fail("INVALID_RESPONSE"));
});

test("deps.dev scopes exact encoded versions, keeps missing licenses unknown and exposes graph integrity", async () => {
  const version = { system: "NPM", name: "@example/package", version: "1.2.3" };
  const mock = fixture([{ versionKey: version, licenses: [], isDeprecated: true, deprecatedReason: "Use maintained package", advisoryKeys: [{ id: "GHSA-example" }], relatedProjects: [{ projectKey: { id: "github.com/example/package" }, relation: "SOURCE_REPO" }] },
    { nodes: [{ versionKey: version, relation: "SELF" }, { versionKey: { ...version, name: "dependency" }, relation: "DIRECT" }], edges: [{ toNode: 1, requirement: "^1.2.0" }] },
    { nodes: [{ versionKey: version, relation: "SELF" }], edges: [{ fromNode: 0, toNode: 9, requirement: "*" }] }]);
  const client = createDepsDevClient({ fetch: mock.fetch });
  const metadata = (await client.getVersion(version)).data; assert.equal(metadata.licenseKnown, false); assert.equal(metadata.isDeprecated, true); assert.deepEqual(metadata.advisoryIds, ["GHSA-example"]); assert.equal(metadata.relatedProjects[0].id, "github.com/example/package");
  assert.equal(mock.calls[0].url.pathname, "/v3/systems/NPM/packages/%40example%2Fpackage/versions/1.2.3");
  const graph = (await client.getDependencies(version)).data; assert.equal(graph.nodes[1].relation, "DIRECT"); assert.equal(graph.edges[0].to, 1);
  await assert.rejects(client.getDependencies(version), fail("INVALID_RESPONSE"));
});

const advisory = { id: "GHSA-fixture", modified: "2026-10-10T00:00:00Z", summary: "Fixture advisory", aliases: ["CVE-2026-0000"], references: [{ type: "ADVISORY", url: "https://example.test/advisory" }], affected: [{ package: { ecosystem: "npm", name: "example" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "2.0.0" }] }], versions: ["1.0.0"] }] };
test("OSV distinguishes exact package/commit queries, preserves batch positions and never labels an empty result safe", async () => {
  const mock = fixture([{ vulns: [advisory], next_page_token: "opaque-token" }, { results: [{}, { vulns: [{ id: advisory.id, modified: advisory.modified }], next_page_token: "more" }] }, advisory]);
  const client = createOsvClient({ fetch: mock.fetch });
  const query = { package: { name: "example", ecosystem: "npm" }, version: "1.0.0" };
  const page = (await client.query(query)).data; assert.equal(page.advisories[0].affected[0].ranges[0].events[1].fixed, "2.0.0"); assert.equal(page.nextPageToken, "opaque-token");
  const commit = "a".repeat(40); const result = await client.queryBatch([query, { commit }]);
  assert.deepEqual(result.data[0].findings, []); assert.equal(result.data[1].nextPageToken, "more"); assert.equal(Object.hasOwn(result.data[0], "safe"), false);
  assert.equal(JSON.parse(mock.calls[1].options.body).queries[1].commit, commit); assert.equal(mock.calls[1].options.method, "POST");
  assert.equal((await client.getAdvisory(advisory.id)).data.id, advisory.id);
  assert.throws(() => client.query({ ...query, commit }), fail("INVALID_INPUT")); assert.throws(() => client.queryBatch(Array(101).fill(query)), fail("INVALID_INPUT"));
});

test("endoflife.date uses v1 and keeps EOL, maintained status and official policy evidence distinct", async () => {
  const product = { generated_at: "2026-10-10T00:00:00Z", last_modified: "2026-10-09T00:00:00Z", result: { name: "nodejs", label: "Node.js", aliases: ["node"], category: "framework", links: { releasePolicy: "https://nodejs.org/en/about/previous-releases" }, versionCommand: "untrusted command not to execute", releases: [{ name: "20", label: "20 LTS", releaseDate: "2023-04-18", isLts: true, isEol: true, eolFrom: "2026-04-30", isMaintained: true, latest: { name: "20.20.2", date: "2026-03-24", link: null } }] } };
  const mock = fixture([product, product, product]); const client = createEndOfLifeClient({ fetch: mock.fetch });
  const result = await client.getProduct("nodejs"); assert.equal(result.data.releases[0].isEol, true); assert.equal(result.data.releases[0].isMaintained, true); assert.equal(result.data.policyUrl, product.result.links.releasePolicy);
  assert.equal(mock.calls[0].url.pathname, "/api/v1/products/nodejs/"); assert.equal(Object.hasOwn(result.data, "versionCommand"), false);
  assert.equal((await client.findRelease("nodejs", "20")).data.name, "20"); assert.equal((await client.findRelease("nodejs", "missing")).data, null);
});
