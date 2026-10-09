// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  createPreferenceSchema,
  defaultPreferences,
  preferencesEqual,
  PreferencesConflictError,
  PreferencesValidationError,
  validateSnapshot,
} from "../.build/modules/notification-preferences/files/core.js";
import { createPreferencesHandler } from "../.build/modules/notification-preferences/files/server.js";
import { createPreferencesClient, PreferencesRequestError } from "../.build/modules/notification-preferences/files/client.js";
import { NotificationPreferencesForm } from "../.build/modules/notification-preferences/files/NotificationPreferencesForm.js";

const schema = createPreferenceSchema([
  { key: "project_activity", label: "Project activity", channels: ["email", "inApp"], defaults: { inApp: true } },
  { key: "weekly_summary", label: "Weekly summary", channels: ["email"] },
]);
const initial = () => ({ revision: 0, preferences: defaultPreferences(schema) });
const clone = (value) => structuredClone(value);
const origin = "https://app.example.test";

/**
 * TEST ONLY: a single-process synchronous map operation models an atomic transaction.
 * Production adapters must use real durable storage with equivalent concurrent-worker semantics.
 */
function testStore() {
  const rows = new Map();
  const calls = [];
  const key = (identity) => JSON.stringify([identity.tenant, identity.subject]);
  return {
    calls,
    rows,
    async read(identity) {
      calls.push(["read", clone(identity)]);
      return clone(rows.get(key(identity)) ?? null);
    },
    async compareAndSet(identity, expectedRevision, preferences) {
      calls.push(["write", clone(identity)]);
      const current = rows.get(key(identity)) ?? initial();
      if (preferencesEqual(current.preferences, preferences)) {
        return { status: "unchanged", snapshot: clone(current) };
      }
      if (current.revision !== expectedRevision) return { status: "conflict", snapshot: clone(current) };
      const next = { revision: current.revision + 1, preferences: clone(preferences) };
      rows.set(key(identity), next);
      return { status: "saved", snapshot: clone(next) };
    },
  };
}

function fixture(overrides = {}) {
  const store = testStore();
  // These static test tokens stand in for trusted server session resolution, not user-supplied identity.
  const sessions = new Map([
    ["session-a", { tenant: "tenant-one", subject: "person-a" }],
    ["session-b", { tenant: "tenant-one", subject: "person-b" }],
    ["session-c", { tenant: "tenant-two", subject: "person-a" }],
  ]);
  const handler = createPreferencesHandler({
    schema,
    store,
    allowedOrigins: [origin],
    authorize: async (request) => sessions.get(request.headers.get("authorization")) ?? null,
    ...overrides,
  });
  function request(method = "GET", body, options = {}) {
    const headers = { authorization: "session-a", ...options.headers };
    if (method === "PUT") {
      if (!Object.hasOwn(headers, "origin")) headers.origin = origin;
      if (!Object.hasOwn(headers, "content-type")) headers["content-type"] = "application/json";
    }
    for (const key of Object.keys(headers)) if (headers[key] === null) delete headers[key];
    return new Request(`${origin}/api/preferences${options.query ?? ""}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
  }
  return { store, handler, request };
}

test("authenticated GET and PUT persist preferences only for the server-resolved identity", async () => {
  const { handler, store, request } = fixture();
  const get = await handler(request());
  assert.equal(get.status, 200);
  assert.equal(get.headers.get("cache-control"), "no-store");
  assert.deepEqual(await get.json(), initial());
  assert.equal(store.rows.size, 0, "reading defaults does not write storage");
  const desired = initial();
  desired.preferences.project_activity.email = true;
  const put = await handler(request("PUT", desired, { query: "?userId=person-b&tenant=tenant-two" }));
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { ...desired, revision: 1 });
  assert.deepEqual(await (await handler(request())).json(), { ...desired, revision: 1 });
  for (const session of ["session-b", "session-c"]) {
    assert.deepEqual(await (await handler(request("GET", undefined, { headers: { authorization: session } }))).json(), initial());
  }
  assert.deepEqual(store.calls.find(([operation]) => operation === "write")[1], {
    subject: "person-a", tenant: "tenant-one",
  });
});

test("identical retries do not increment revision and stale differing updates conflict", async () => {
  const { handler, request } = fixture();
  const desired = initial();
  desired.preferences.weekly_summary.email = true;
  const first = await handler(request("PUT", desired));
  const saved = await first.json();
  assert.equal(saved.revision, 1);
  const retry = await handler(request("PUT", desired));
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), saved);
  const conflicting = initial();
  conflicting.preferences.project_activity.email = true;
  const conflict = await handler(request("PUT", conflicting));
  assert.equal(conflict.status, 409);
  assert.deepEqual((await conflict.json()).snapshot, saved);
  assert.deepEqual(await (await handler(request())).json(), saved);
});

test("simultaneous differing updates from one revision permit only one saved result", async () => {
  const { handler, request } = fixture();
  const first = initial();
  const second = initial();
  first.preferences.weekly_summary.email = true;
  second.preferences.project_activity.email = true;
  const results = await Promise.all([
    handler(request("PUT", first)),
    handler(request("PUT", second)),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const saved = await results.find((result) => result.status === 200).json();
  assert.equal(saved.revision, 1);
  assert.deepEqual(await (await handler(request())).json(), saved);
});

test("missing/denied origins and identities never reach persistence", async () => {
  for (const [headers, expected] of [
    [{ origin: null }, 403],
    [{ origin: "https://attacker.example" }, 403],
    [{ origin: "null" }, 403],
    [{ authorization: null }, 401],
    [{ authorization: "made-up" }, 401],
  ]) {
    const { handler, store, request } = fixture();
    assert.equal((await handler(request("PUT", initial(), { headers }))).status, expected);
    assert.equal(store.calls.length, 0);
  }
  const { handler, store, request } = fixture({ authorize: async () => ({ subject: "", tenant: "tenant-one" }) });
  assert.equal((await handler(request())).status, 401);
  assert.equal(store.calls.length, 0);
  assert.throws(() => fixture({ allowedOrigins: [] }), /origin/i);
  assert.throws(() => fixture({ allowedOrigins: [`${origin}/path`] }), /origin/i);
});

test("invalid preference structure, identity fields, content type, and oversized JSON do not write", async () => {
  const invalid = [
    { ...initial(), userId: "person-b" },
    { ...initial(), tenant: "tenant-two" },
    { ...initial(), revision: -1 },
    { ...initial(), revision: 0.5 },
    { ...initial(), revision: Number.MAX_SAFE_INTEGER },
    { revision: 0, preferences: {} },
    { revision: 0, preferences: { ...initial().preferences, admin_alerts: { email: true } } },
    { revision: 0, preferences: { ...initial().preferences, weekly_summary: { email: "true" } } },
    { revision: 0, preferences: { ...initial().preferences, weekly_summary: { email: true, push: true } } },
    { revision: 0, preferences: { ...initial().preferences, weekly_summary: {} } },
    "{not-json}",
  ];
  const { handler, store, request } = fixture();
  for (const body of invalid) {
    const result = await handler(request("PUT", body));
    assert.equal(result.status, 400, JSON.stringify(body));
  }
  assert.equal((await handler(request("PUT", initial(), { headers: { "content-type": "text/plain" } }))).status, 415);
  assert.equal((await handler(request("PUT", JSON.stringify({ text: "x".repeat(16_384) })))).status, 413);
  assert.equal(store.calls.length, 0);
});

test("adapter exceptions are redacted, malformed stored records fail closed, and methods are bounded", async () => {
  const secret = "database-private-credential";
  const failingStore = {
    async read() { throw new Error(secret); },
    async compareAndSet() { throw new Error(secret); },
  };
  const { handler, request } = fixture({ store: failingStore });
  for (const req of [request(), request("PUT", initial())]) {
    const result = await handler(req);
    assert.equal(result.status, 503);
    assert.ok(!(await result.text()).includes(secret));
  }
  const authFailure = fixture({ authorize: async () => { throw new Error(secret); } });
  const authResponse = await authFailure.handler(authFailure.request());
  assert.equal(authResponse.status, 503);
  assert.ok(!(await authResponse.text()).includes(secret));
  const malformed = fixture({ store: { ...failingStore, read: async () => ({ revision: 1, preferences: {} }) } });
  assert.equal((await malformed.handler(malformed.request())).status, 503);
  const unsupported = await handler(request("DELETE"));
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get("allow"), "GET, PUT");
});

test("schemas reject duplicate, unsafe, and undeclared configuration while snapshots clone input", () => {
  assert.throws(() => createPreferenceSchema([]), PreferencesValidationError);
  assert.throws(() => createPreferenceSchema([schema[0], schema[0]]), PreferencesValidationError);
  assert.throws(() => createPreferenceSchema([{ key: "constructor", label: "Invalid", channels: ["email"] }]), PreferencesValidationError);
  assert.throws(() => createPreferenceSchema([{ key: "test", label: "Test", channels: ["sms"] }]), PreferencesValidationError);
  assert.throws(() => createPreferenceSchema([{ key: "test", label: "Test", channels: ["email"], defaults: { push: true } }]), PreferencesValidationError);
  const source = initial();
  const checked = validateSnapshot(schema, source);
  source.preferences.weekly_summary.email = true;
  assert.equal(checked.preferences.weekly_summary.email, false);
  assert.ok(Object.isFrozen(schema));
});

test("client persists through the handler and exposes a validated conflict instead of overwriting", async () => {
  const { handler, request } = fixture();
  const client = createPreferencesClient({
    endpoint: `${origin}/api/preferences`,
    schema,
    // Browser fetch sends Origin and the authenticated session; this adapter supplies those in tests.
    fetch: async (_url, options) => {
      assert.equal(options.credentials, "same-origin");
      return handler(request(options.method, options.body));
    },
  });
  const first = await client.read();
  const otherTab = clone(first);
  first.preferences.weekly_summary.email = true;
  const saved = await client.save(first);
  otherTab.preferences.project_activity.email = true;
  await assert.rejects(client.save(otherTab), (error) =>
    error instanceof PreferencesConflictError && error.snapshot.revision === saved.revision);
  const denied = createPreferencesClient({ endpoint: "/api/preferences", schema, fetch: async () => new Response("denied", { status: 401 }) });
  await assert.rejects(denied.read(), (error) => error instanceof PreferencesRequestError && error.status === 401);
});

test("React form saves the selected channel, disables in-flight edits, and announces success", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: origin });
  const before = new Map(["window", "document", "IS_REACT_ACT_ENVIRONMENT"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  const root = createRoot(dom.window.document.getElementById("root"));
  let finish;
  let submitted;
  try {
    await act(async () => root.render(createElement(NotificationPreferencesForm, {
      schema,
      initialSnapshot: initial(),
      save: async (snapshot) => {
        submitted = clone(snapshot);
        return new Promise((resolve) => { finish = () => resolve({ ...snapshot, revision: 1 }); });
      },
    })));
    const checkbox = dom.window.document.querySelector('input[name="weekly_summary.email"]');
    const button = dom.window.document.querySelector('button[type="submit"]');
    assert.equal(button.disabled, true);
    await act(async () => checkbox.click());
    assert.equal(button.disabled, false);
    await act(async () => button.click());
    assert.equal(submitted.preferences.weekly_summary.email, true);
    assert.equal(submitted.revision, 0);
    assert.equal(button.disabled, true);
    assert.ok([...dom.window.document.querySelectorAll("fieldset")].every((fieldset) => fieldset.disabled));
    await act(async () => finish());
    assert.match(dom.window.document.querySelector('[role="status"]').textContent, /saved/i);
    assert.equal(button.disabled, true, "saved form has no unsaved changes");
    const current = { ...initial(), revision: 2 };
    current.preferences.project_activity.email = true;
    await act(async () => root.render(createElement(NotificationPreferencesForm, {
      key: "conflict-example",
      schema,
      initialSnapshot: initial(),
      save: async () => { throw new PreferencesConflictError(current); },
    })));
    await act(async () => dom.window.document.querySelector('input[name="weekly_summary.email"]').click());
    await act(async () => dom.window.document.querySelector('button[type="submit"]').click());
    assert.match(dom.window.document.querySelector('[role="alert"]').textContent, /changed elsewhere/i);
    assert.equal(dom.window.document.querySelector('input[name="project_activity.email"]').checked, true);
    assert.equal(dom.window.document.querySelector('input[name="weekly_summary.email"]').checked, false);
    assert.equal(dom.window.document.querySelector('button[type="submit"]').disabled, true);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of before) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
