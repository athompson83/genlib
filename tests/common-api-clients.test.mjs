// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { ApiClientError, createHttpClient } from "../.build/modules/common-api-clients/files/http.js";
import { createGitHubClient } from "../.build/modules/common-api-clients/files/github.js";
import { createStripeCheckoutClient } from "../.build/modules/common-api-clients/files/stripe.js";
import { createResendClient } from "../.build/modules/common-api-clients/files/resend.js";
import { createSupabaseReadClient } from "../.build/modules/common-api-clients/files/supabase.js";
import { createMicrosoftGraphClient } from "../.build/modules/common-api-clients/files/microsoft-graph.js";
import { createGoogleCalendarClient } from "../.build/modules/common-api-clients/files/google-calendar.js";
import { createOpenAIClient } from "../.build/modules/common-api-clients/files/openai.js";
import { createAnthropicClient } from "../.build/modules/common-api-clients/files/anthropic.js";

const secret = "provider-secret-DO-NOT-LOG";
const token = async () => secret;
const origin = "https://provider.example.test";
const fail = code => error => error instanceof ApiClientError && error.code === code;

/** Only the outbound Fetch boundary is replaced; production adapters run unmodified. */
function fixture(responses = []) {
  const calls = [];
  return {
    calls,
    fetch: async (url, options) => {
      calls.push({ url: String(url), options, headers: new Headers(options.headers) });
      assert.equal(options.redirect, "error");
      assert.equal(options.credentials, "omit");
      assert.equal(options.cache, "no-store");
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.signal.aborted, false);
      assert.ok(responses.length, "unexpected outbound request (possible retry)");
      const result = responses.shift();
      if (result instanceof Error) throw result;
      return result instanceof Response ? result : Response.json(result);
    },
  };
}
const repo = (id, name) => ({ id, name, full_name: `owner/${name}`, private: true, default_branch: "main", html_url: `https://github.com/owner/${name}` });
const purchaseContext = Object.freeze({ tenant: "tenant-a", subject: "person-a", orderId: "order-123" });
const stripeOptions = overrides => ({
  getSecretKey: token, apiVersion: "2026-09-30.clover",
  products: { standard: { priceId: "price_standard123", mode: "subscription", maxQuantity: 5 } },
  successUrl: "https://app.example.test/billing/success", cancelUrl: "https://app.example.test/billing/cancel",
  authorize: (context, purchase) => context === purchaseContext && purchase.referenceId === context.orderId,
  ...overrides,
});
const checkoutInput = { context: purchaseContext, productKey: "standard", referenceId: "order-123", quantity: 2, idempotencyKey: "tenant-a:checkout:order-123:v1" };
const resendOptions = overrides => ({ getApiKey: token, from: "Example <receipts@example.test>",
  authorize: (context, email) => context === purchaseContext && email.to.length === 1 && email.to[0] === "customer@example.test",
  ...overrides,
});
const emailInput = { context: purchaseContext, to: ["customer@example.test"], subject: "Order received", text: "Your order was received.", html: "<p>Your order was received.</p>", idempotencyKey: "tenant-a:receipt:order-123:v1" };
const aiOptions = overrides => ({ getApiKey: token, model: "configured-model", maxOutputTokens: 256,
  authorize: (context, request) => context === purchaseContext && request.maxOutputTokens === 256,
  ...overrides,
});

test("transport fixes the credentialed origin and rejects unsafe URLs before Fetch", async () => {
  for (const invalidOrigin of ["http://provider.example.test", "https://user:secret@provider.example.test", "https://provider.example.test/v1", "https://provider.example.test?x=1", "https://provider.example.test/#fragment", "https://provider.example.test\\"]) {
    assert.throws(() => createHttpClient({ origin: invalidOrigin }), fail("INVALID_CONFIG"));
  }
  const mock = fixture([{ ok: true }]);
  const http = createHttpClient({ origin, fetch: mock.fetch, headers: { authorization: `Bearer ${secret}` } });
  for (const path of ["https://evil.example.test/steal", "//evil.example.test/steal", "/\\evil.example.test", "/a/../secret", "/%2e%2e/secret", "/a#fragment", "/a\nsecret"]) {
    await assert.rejects(http.request(path), fail("INVALID_INPUT"));
  }
  assert.equal(mock.calls.length, 0);
  assert.deepEqual(await http.request("/v1/items?q=red%20blue"), { ok: true });
  assert.equal(mock.calls[0].url, `${origin}/v1/items?q=red%20blue`);
  assert.equal(mock.calls[0].headers.get("authorization"), `Bearer ${secret}`);
  assert.equal(mock.calls[0].headers.get("accept"), "application/json");
});

test("transport refuses cookie/proxy transport headers and oversize UTF-8 requests", async () => {
  const mock = fixture();
  for (const name of ["cookie", "proxy-authorization", "host", "content-length", "connection", "transfer-encoding"]) {
    const http = createHttpClient({ origin, fetch: mock.fetch, headers: { [name]: secret } });
    await assert.rejects(http.request("/v1/items"), fail("INVALID_CONFIG"));
  }
  const http = createHttpClient({ origin, fetch: mock.fetch, maxRequestBytes: 5 });
  await assert.rejects(http.request("/items", { method: "POST", body: "😀😀" }), fail("REQUEST_TOO_LARGE"));
  await assert.rejects(http.request("/items", { body: "{}" }), fail("INVALID_INPUT"));
  assert.equal(mock.calls.length, 0);
});

test("transport sends the validated invocation snapshot after delayed credentials despite caller mutation", async () => {
  for (const replaceHeaders of [false, true]) {
    let provideCredentials;
    const mock = fixture([{ ok: true }]);
    const http = createHttpClient({ origin, fetch: mock.fetch, maxRequestBytes: 16,
      headers: () => new Promise(resolve => { provideCredentials = resolve; }),
    });
    const controller = new AbortController();
    const replacement = new AbortController();
    const initialHeaders = new Headers({ "x-operation-id": "original", "content-type": "application/json" });
    const options = { method: "POST", body: '{"ok":true}', headers: initialHeaders, signal: controller.signal };
    const pending = http.request("/items", options);
    options.body = "x".repeat(4096);
    options.method = "DELETE";
    options.signal = replacement.signal;
    if (replaceHeaders) options.headers = new Headers({ "x-operation-id": "replaced", authorization: "Bearer attacker" });
    else initialHeaders.set("x-operation-id", "mutated");
    replacement.abort();
    provideCredentials({ authorization: `Bearer ${secret}` });
    assert.deepEqual(await pending, { ok: true });
    const call = mock.calls[0];
    assert.equal(call.options.method, "POST");
    assert.ok(new TextEncoder().encode(call.options.body).byteLength <= 16);
    assert.equal(call.options.body, '{"ok":true}');
    assert.equal(call.headers.get("x-operation-id"), "original");
    assert.equal(call.headers.get("content-type"), "application/json");
    assert.equal(call.headers.get("authorization"), `Bearer ${secret}`);
  }
});

test("transport redacts provider errors and never retries a write or reads an error body", async () => {
  let cancelled = 0;
  const body = new ReadableStream({ cancel() { cancelled += 1; } });
  const errorResponse = new Response(body, { status: 500, statusText: secret, headers: { "content-type": "application/json" } });
  const mock = fixture([errorResponse, new Error(`https://${secret}@provider.example.test?token=${secret}`)]);
  const http = createHttpClient({ origin, fetch: mock.fetch });
  await assert.rejects(http.request("/items", { method: "POST", body: "{}" }), error => {
    assert.equal(error.code, "HTTP"); assert.equal(error.status, 500);
    assert.equal(error.cause, undefined); assert.ok(!`${error.stack}${JSON.stringify(error)}`.includes(secret)); return true;
  });
  assert.equal(mock.calls.length, 1);
  assert.equal(cancelled, 1);
  await assert.rejects(http.request("/items"), error => error.code === "NETWORK" && !`${error.stack}${JSON.stringify(error)}`.includes(secret));
});

test("transport redacts resolver failure while preserving explicit authorization denial", async () => {
  const mock = fixture();
  const auth = createHttpClient({ origin, fetch: mock.fetch, headers: async () => { throw new Error(secret); } });
  await assert.rejects(auth.request("/items"), error => error.code === "AUTHENTICATION" && !`${error.stack}${JSON.stringify(error)}`.includes(secret));
  const denied = createHttpClient({ origin, fetch: mock.fetch, headers: () => { throw new ApiClientError("DENIED"); } });
  await assert.rejects(denied.request("/items"), fail("DENIED"));
  assert.equal(mock.calls.length, 0);
});

test("transport rejects redirect responses including unexpected redirected results", async () => {
  const moved = new Response(null, { status: 307, headers: { location: "https://evil.example.test/steal" } });
  const redirected = Response.json({ ok: true });
  Object.defineProperty(redirected, "redirected", { value: true });
  const crossOrigin = Response.json({ ok: true });
  Object.defineProperty(crossOrigin, "url", { value: "https://evil.example.test/items" });
  const mock = fixture([moved, redirected, crossOrigin]);
  const http = createHttpClient({ origin, fetch: mock.fetch });
  for (let i = 0; i < 3; i += 1) await assert.rejects(http.request("/items"), fail("REDIRECT"));
  assert.equal(mock.calls.length, 3);
});

test("transport bounds decoded streaming bytes and validates content type, UTF-8 and JSON", async () => {
  let cancelled = 0;
  const oversized = new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"x":"0123456789"')); },
    cancel() { cancelled += 1; },
  }), { headers: { "content-type": "application/json", "content-length": "1" } });
  const responses = [oversized, new Response("{}", { headers: { "content-type": "text/html" } }),
    new Response("bad-json-secret", { headers: { "content-type": "application/json" } }),
    new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
    new Response("{}", { headers: { "content-type": "application/json", "content-length": "99999" } })];
  const mock = fixture(responses);
  const http = createHttpClient({ origin, fetch: mock.fetch, maxResponseBytes: 16 });
  await assert.rejects(http.request("/items"), fail("RESPONSE_TOO_LARGE"));
  assert.equal(cancelled, 1);
  for (let i = 0; i < 3; i += 1) await assert.rejects(http.request("/items"), fail("INVALID_RESPONSE"));
  await assert.rejects(http.request("/items"), fail("RESPONSE_TOO_LARGE"));
});

test("deadline covers credentials and noncooperative Fetch without leaking abort reasons", async () => {
  let calls = 0;
  const stalledCredentials = createHttpClient({ origin, timeoutMs: 10, headers: () => new Promise(() => {}), fetch: async () => { calls += 1; return Response.json({}); } });
  await assert.rejects(stalledCredentials.request("/items"), fail("TIMEOUT"));
  assert.equal(calls, 0);
  let requestSignal;
  const http = createHttpClient({ origin, timeoutMs: 10, fetch: async (_url, options) => { requestSignal = options.signal; return new Promise(() => {}); } });
  await assert.rejects(http.request("/items"), fail("TIMEOUT"));
  assert.equal(requestSignal.aborted, true);
  const controller = new AbortController();
  const cancelling = createHttpClient({ origin, timeoutMs: 1000, fetch: async () => { controller.abort(new Error(secret)); return new Promise(() => {}); } });
  await assert.rejects(cancelling.request("/items", { signal: controller.signal }), error => error.code === "ABORTED" && !error.message.includes(secret));
  await assert.rejects(cancelling.request("/items", { signal: controller.signal }), fail("ABORTED"));
});

test("a response body arriving after timeout is cancelled; stalled response reading is also bounded", async () => {
  let finish;
  let cancelled = 0;
  const http = createHttpClient({ origin, timeoutMs: 10, fetch: () => new Promise(resolve => { finish = resolve; }) });
  await assert.rejects(http.request("/items"), fail("TIMEOUT"));
  finish(new Response(new ReadableStream({ cancel() { cancelled += 1; } }), { headers: { "content-type": "application/json" } }));
  await nextTurn();
  assert.equal(cancelled, 1);
  const body = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); }, cancel() { cancelled += 1; } }), { headers: { "content-type": "application/json" } });
  const stalled = createHttpClient({ origin, timeoutMs: 10, fetch: async () => body });
  await assert.rejects(stalled.request("/items"), fail("TIMEOUT"));
  assert.equal(cancelled, 2);
});

test("GitHub reads the exact repository endpoint and bounds account listing pages", async () => {
  const mock = fixture([repo(1, "one"), [repo(1, "one"), repo(2, "two")], [repo(3, "three"), repo(4, "four")], []]);
  const github = createGitHubClient({ getAccessToken: token, apiVersion: "2026-03-10", fetch: mock.fetch });
  assert.deepEqual(await github.getRepository("owner", "one"), { id: 1, name: "one", fullName: "owner/one", private: true, defaultBranch: "main", htmlUrl: "https://github.com/owner/one" });
  assert.equal(mock.calls[0].url, "https://api.github.com/repos/owner/one");
  assert.equal(mock.calls[0].headers.get("x-github-api-version"), "2026-03-10");
  assert.equal(mock.calls[0].headers.get("authorization"), `Bearer ${secret}`);
  const listing = await github.listRepositories({ maxPages: 2, perPage: 2, visibility: "private" });
  assert.equal(listing.repositories.length, 4); assert.equal(listing.pagesFetched, 2); assert.equal(listing.possiblyMore, true);
  assert.equal(new URL(mock.calls[2].url).searchParams.get("page"), "2");
  assert.equal(new URL(mock.calls[2].url).searchParams.get("visibility"), "private");
  assert.equal((await github.listRepositories({ perPage: 1, maxPages: 3 })).pagesFetched, 1);
  assert.equal(mock.calls.length, 4);
  await assert.rejects(github.listRepositories({ maxPages: 11 }), fail("INVALID_INPUT"));
  await assert.rejects(github.getRepository("..", "one"), fail("INVALID_INPUT"));
});

test("GitHub pagination retains the invocation signal instead of rereading mutable options", async () => {
  const controller = new AbortController();
  const replacement = new AbortController();
  const input = { maxPages: 2, perPage: 1, signal: controller.signal };
  const mock = fixture([[repo(1, "one")], []]);
  const client = createGitHubClient({ getAccessToken: token, apiVersion: "2026-03-10",
    fetch: async (url, options) => {
      const response = await mock.fetch(url, options);
      input.signal = replacement.signal;
      replacement.abort();
      return response;
    },
  });
  const result = await client.listRepositories(input);
  assert.equal(result.repositories.length, 1);
  assert.equal(result.pagesFetched, 2);
  assert.equal(mock.calls.length, 2);
});

test("Stripe uses approved server price/mode, immutable purchase authorization and persisted idempotency key", async () => {
  const mock = fixture([{ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/test_123" }]);
  const products = { standard: { priceId: "price_original123", mode: "subscription", maxQuantity: 5 } };
  let authorizedPurchase;
  const stripe = createStripeCheckoutClient(stripeOptions({ fetch: mock.fetch, products, authorize: (_context, purchase) => { authorizedPurchase = purchase; return true; } }));
  products.standard.priceId = "price_mutated123";
  const session = await stripe.createCheckoutSession({ ...checkoutInput, priceId: "price_attacker", mode: "payment", successUrl: "https://evil.example.test" });
  assert.equal(session.id, "cs_test_123");
  assert.deepEqual(authorizedPurchase, { productKey: "standard", quantity: 2, referenceId: "order-123" });
  assert.ok(Object.isFrozen(authorizedPurchase));
  const call = mock.calls[0];
  assert.equal(call.url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(call.options.method, "POST");
  assert.equal(call.headers.get("authorization"), `Bearer ${secret}`);
  assert.equal(call.headers.get("idempotency-key"), checkoutInput.idempotencyKey);
  assert.equal(call.headers.get("stripe-version"), "2026-09-30.clover");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(call.options.body)), {
    mode: "subscription", "line_items[0][price]": "price_original123", "line_items[0][quantity]": "2",
    success_url: "https://app.example.test/billing/success", cancel_url: "https://app.example.test/billing/cancel", client_reference_id: "order-123",
  });
});

test("Stripe rejects cross-order authorization, unknown prices, excess quantity and missing keys before network", async () => {
  const mock = fixture();
  const stripe = createStripeCheckoutClient(stripeOptions({ fetch: mock.fetch }));
  await assert.rejects(stripe.createCheckoutSession({ ...checkoutInput, context: { ...purchaseContext, orderId: "different-order" } }), fail("DENIED"));
  await assert.rejects(stripe.createCheckoutSession({ ...checkoutInput, productKey: "unlisted" }), fail("INVALID_INPUT"));
  await assert.rejects(stripe.createCheckoutSession({ ...checkoutInput, quantity: 6 }), fail("INVALID_INPUT"));
  await assert.rejects(stripe.createCheckoutSession({ ...checkoutInput, idempotencyKey: "" }), fail("INVALID_INPUT"));
  assert.equal(mock.calls.length, 0);
});

test("Resend authorizes exact immutable recipients, sender, content and idempotency before sending", async () => {
  const mock = fixture([{ id: "email-123" }]);
  let inspected;
  const resend = createResendClient(resendOptions({ fetch: mock.fetch, authorize: (context, email) => { inspected = email; return context === purchaseContext; } }));
  assert.deepEqual(await resend.sendEmail({ ...emailInput, from: "attacker@evil.example.test" }), { id: "email-123" });
  const call = mock.calls[0];
  assert.equal(call.url, "https://api.resend.com/emails");
  assert.equal(call.headers.get("idempotency-key"), emailInput.idempotencyKey);
  assert.equal(call.headers.get("authorization"), `Bearer ${secret}`);
  assert.ok(Object.isFrozen(inspected)); assert.ok(Object.isFrozen(inspected.to));
  assert.deepEqual(JSON.parse(call.options.body), { from: "Example <receipts@example.test>", to: emailInput.to, subject: emailInput.subject, text: emailInput.text, html: emailInput.html });
});

test("provider authorization snapshots survive mutation of original Stripe and Resend request objects", async () => {
  let authorizePurchase;
  const checkoutMock = fixture([{ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/test_123" }]);
  const checkout = createStripeCheckoutClient(stripeOptions({ fetch: checkoutMock.fetch,
    authorize: (_context, purchase) => new Promise(resolve => { authorizePurchase = () => resolve(purchase.quantity === 2 && purchase.referenceId === "order-123"); }),
  }));
  const purchase = { ...checkoutInput };
  const checkoutPending = checkout.createCheckoutSession(purchase);
  purchase.quantity = 999;
  purchase.referenceId = "changed-order";
  purchase.idempotencyKey = "different-attempt";
  authorizePurchase();
  await checkoutPending;
  const checkoutBody = new URLSearchParams(checkoutMock.calls[0].options.body);
  assert.equal(checkoutBody.get("line_items[0][quantity]"), "2");
  assert.equal(checkoutBody.get("client_reference_id"), "order-123");
  assert.equal(checkoutMock.calls[0].headers.get("idempotency-key"), checkoutInput.idempotencyKey);

  let authorizeEmail;
  const emailMock = fixture([{ id: "email-123" }]);
  const resend = createResendClient(resendOptions({ fetch: emailMock.fetch,
    authorize: (_context, email) => new Promise(resolve => { authorizeEmail = () => resolve(email.to[0] === "customer@example.test" && email.text === emailInput.text); }),
  }));
  const email = { ...emailInput, to: [...emailInput.to] };
  const emailPending = resend.sendEmail(email);
  email.to[0] = "stranger@example.test";
  email.text = "changed content";
  email.idempotencyKey = "different-attempt";
  authorizeEmail();
  await emailPending;
  const emailBody = JSON.parse(emailMock.calls[0].options.body);
  assert.deepEqual(emailBody.to, emailInput.to);
  assert.equal(emailBody.text, emailInput.text);
  assert.equal(emailMock.calls[0].headers.get("idempotency-key"), emailInput.idempotencyKey);
});

test("Resend does not send unauthorized, duplicate or header-injected recipients and never retries 500", async () => {
  const mock = fixture([new Response(secret, { status: 500 })]);
  const resend = createResendClient(resendOptions({ fetch: mock.fetch }));
  await assert.rejects(resend.sendEmail({ ...emailInput, to: ["stranger@example.test"] }), fail("DENIED"));
  await assert.rejects(resend.sendEmail({ ...emailInput, to: ["customer@example.test", "customer@example.test"] }), fail("INVALID_INPUT"));
  await assert.rejects(resend.sendEmail({ ...emailInput, to: ["customer@example.test\r\nBcc: other@example.test"] }), fail("INVALID_INPUT"));
  await assert.rejects(resend.sendEmail({ ...emailInput, subject: "Hello\r\nInjected" }), fail("INVALID_INPUT"));
  assert.equal(mock.calls.length, 0);
  await assert.rejects(resend.sendEmail(emailInput), fail("HTTP"));
  assert.equal(mock.calls.length, 1);
});

test("Supabase separates publishable apikey and caller access token with permitted columns and bounded scalar filters", async () => {
  const mock = fixture([[{ id: "task-1", title: "Ready", private_field: secret }]]);
  const client = createSupabaseReadClient({ projectOrigin: "https://project-ref.supabase.co", publishableKey: "sb_publishable_test", getAccessToken: token, tables: { tasks: ["id", "title", "owner_id"] }, fetch: mock.fetch });
  const rows = await client.readRows({ table: "tasks", columns: ["id", "title"], equals: { owner_id: "user&limit=100000" }, limit: 20, offset: 40 });
  assert.deepEqual(rows, [{ id: "task-1", title: "Ready" }]);
  const call = mock.calls[0]; const url = new URL(call.url);
  assert.equal(url.origin, "https://project-ref.supabase.co"); assert.equal(url.pathname, "/rest/v1/tasks");
  assert.deepEqual([...url.searchParams], [["select", "id,title"], ["limit", "20"], ["offset", "40"], ["owner_id", "eq.user&limit=100000"]]);
  assert.equal(call.headers.get("apikey"), "sb_publishable_test");
  assert.equal(call.headers.get("authorization"), `Bearer ${secret}`);
  await assert.rejects(client.readRows({ table: "users", columns: ["id"] }), fail("INVALID_INPUT"));
  await assert.rejects(client.readRows({ table: "tasks", columns: ["*"] }), fail("INVALID_INPUT"));
  await assert.rejects(client.readRows({ table: "tasks", columns: ["id"], equals: { private_field: "x" } }), fail("INVALID_INPUT"));
  assert.throws(() => createSupabaseReadClient({ projectOrigin: origin, publishableKey: "sb_secret_admin", getAccessToken: token, tables: { tasks: ["id"] } }), fail("INVALID_CONFIG"));
  assert.equal(mock.calls.length, 1);
});

test("Supabase equality filters cannot override reserved pagination or projection parameters", async () => {
  const mock = fixture();
  const client = createSupabaseReadClient({ projectOrigin: "https://project-ref.supabase.co", publishableKey: "sb_publishable_test", getAccessToken: token, tables: { tasks: ["id", "select", "limit", "offset", "or", "order"] }, fetch: mock.fetch });
  for (const key of ["select", "limit", "offset", "or", "order"]) {
    await assert.rejects(client.readRows({ table: "tasks", columns: ["id"], equals: { [key]: "private_field" } }), fail("INVALID_INPUT"));
  }
  assert.equal(mock.calls.length, 0);
});

test("Microsoft Graph calls /me with the supplied delegated token and projects only requested fields", async () => {
  const mock = fixture([{ id: "user-1", displayName: "Alex", mail: null, userPrincipalName: "alex@example.test", extraPrivateField: secret }]);
  const client = createMicrosoftGraphClient({ getAccessToken: token, fetch: mock.fetch });
  assert.deepEqual(await client.getMe(), { id: "user-1", displayName: "Alex", mail: null, userPrincipalName: "alex@example.test" });
  assert.equal(mock.calls[0].url, "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName");
  assert.equal(mock.calls[0].headers.get("authorization"), `Bearer ${secret}`);
});

test("Calendar returns one explicit page and preserves opaque continuation tokens and all-day dates", async () => {
  const mock = fixture([{ items: [{ id: "event-1", status: "confirmed", summary: "Team event", start: { date: "2026-10-10" }, end: { date: "2026-10-11" } }], nextPageToken: "token+/=opaque" }]);
  const client = createGoogleCalendarClient({ getAccessToken: token, calendarIds: ["team@example.test"], fetch: mock.fetch });
  const range = { calendarId: "team@example.test", timeMin: "2026-10-10T00:00:00Z", timeMax: "2026-10-11T00:00:00Z", pageToken: "page+/=" };
  const page = await client.listEvents(range);
  assert.equal(page.nextPageToken, "token+/=opaque"); assert.deepEqual(page.events[0].start, { date: "2026-10-10" });
  const url = new URL(mock.calls[0].url);
  assert.equal(url.pathname, "/calendar/v3/calendars/team%40example.test/events");
  assert.equal(url.searchParams.get("singleEvents"), "true"); assert.equal(url.searchParams.get("pageToken"), "page+/=");
  assert.equal(url.searchParams.get("maxResults"), "100"); assert.equal(url.searchParams.get("orderBy"), "startTime");
  assert.equal(mock.calls.length, 1);
  await assert.rejects(client.listEvents({ ...range, calendarId: "unlisted" }), fail("INVALID_INPUT"));
  await assert.rejects(client.listEvents({ ...range, timeMax: range.timeMin }), fail("INVALID_INPUT"));
  await assert.rejects(client.listEvents({ ...range, maxResults: 251 }), fail("INVALID_INPUT"));
});

test("OpenAI uses Responses REST with storage disabled and reads nested output, refusal, usage and incomplete state", async () => {
  const mock = fixture([{ id: "resp_1", status: "incomplete", incomplete_details: { reason: "max_output_tokens" },
    output: [{ type: "reasoning", summary: [] }, { type: "message", content: [{ type: "output_text", text: "Partial answer" }, { type: "refusal", refusal: "Cannot complete this part" }] }],
    usage: { input_tokens: 12, output_tokens: 256 } }]);
  const client = createOpenAIClient(aiOptions({ fetch: mock.fetch, instructions: "Use the receiving application's approved instructions." }));
  const input = JSON.stringify({ task: "summarize", text: "A small source document." });
  const output = await client.createResponse({ context: purchaseContext, input });
  assert.deepEqual(output, { id: "resp_1", status: "incomplete", text: "Partial answer", refusals: ["Cannot complete this part"], incompleteReason: "max_output_tokens", usage: { inputTokens: 12, outputTokens: 256 } });
  const call = mock.calls[0]; assert.equal(call.url, "https://api.openai.com/v1/responses");
  assert.equal(call.headers.get("authorization"), `Bearer ${secret}`);
  assert.deepEqual(JSON.parse(call.options.body), { model: "configured-model", input, max_output_tokens: 256, store: false, stream: false, instructions: "Use the receiving application's approved instructions." });
});

test("Anthropic uses Messages headers and preserves stop reason and usage without enabling tools", async () => {
  const mock = fixture([{ id: "msg_1", content: [{ type: "text", text: "Answer" }], stop_reason: "end_turn", usage: { input_tokens: 14, output_tokens: 2 } }]);
  const client = createAnthropicClient(aiOptions({ apiVersion: "2023-06-01", fetch: mock.fetch }));
  const input = JSON.stringify({ task: "summarize", text: "A short source." });
  assert.deepEqual(await client.createMessage({ context: purchaseContext, input }), { id: "msg_1", text: "Answer", stopReason: "end_turn", usage: { inputTokens: 14, outputTokens: 2 } });
  const call = mock.calls[0]; assert.equal(call.url, "https://api.anthropic.com/v1/messages");
  assert.equal(call.headers.get("x-api-key"), secret); assert.equal(call.headers.get("anthropic-version"), "2023-06-01");
  assert.deepEqual(JSON.parse(call.options.body), { model: "configured-model", messages: [{ role: "user", content: input }], max_tokens: 256, stream: false });
});

test("paid model calls require authorization and input/output bounds; ambiguous provider failure is never retried", async () => {
  const mock = fixture([new Response(secret, { status: 503 })]);
  const client = createOpenAIClient(aiOptions({ fetch: mock.fetch, maxInputCharacters: 100 }));
  await assert.rejects(client.createResponse({ context: { ...purchaseContext }, input: "denied" }), fail("DENIED"));
  await assert.rejects(client.createResponse({ context: purchaseContext, input: "x".repeat(101) }), fail("INVALID_INPUT"));
  assert.equal(mock.calls.length, 0);
  await assert.rejects(client.createResponse({ context: purchaseContext, input: "approved" }), fail("HTTP"));
  assert.equal(mock.calls.length, 1);
  assert.throws(() => createOpenAIClient(aiOptions({ maxOutputTokens: 0 })), fail("INVALID_INPUT"));
});

test("provider schema failures do not masquerade as successful typed data", async () => {
  const mock = fixture([{ id: "wrong-type" }, { id: "cs_test_1", url: "https://evil.example.test/phishing" }, { id: 42 }, { id: "r", status: "completed", output: { text: "bad-shape" } }]);
  await assert.rejects(createGitHubClient({ getAccessToken: token, apiVersion: "2026-03-10", fetch: mock.fetch }).getRepository("owner", "repo"), fail("INVALID_RESPONSE"));
  await assert.rejects(createStripeCheckoutClient(stripeOptions({ fetch: mock.fetch })).createCheckoutSession(checkoutInput), fail("INVALID_RESPONSE"));
  await assert.rejects(createResendClient(resendOptions({ fetch: mock.fetch })).sendEmail(emailInput), fail("INVALID_RESPONSE"));
  await assert.rejects(createOpenAIClient(aiOptions({ fetch: mock.fetch })).createResponse({ context: purchaseContext, input: "approved" }), fail("INVALID_RESPONSE"));
});
