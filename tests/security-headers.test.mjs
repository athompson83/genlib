// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCsp, createNonce, securityHeaders, withSecurityHeaders,
} from "../.build/modules/security-headers/files/security-headers.js";

test("defaults are conservative", () => {
  const headers = securityHeaders();
  assert.deepEqual(headers, {
    "Content-Security-Policy": "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-Frame-Options": "DENY",
  });
  assert.doesNotThrow(() => new Headers(headers));
});

test("CSP directives merge, remove, and support valueless directives", () => {
  const headers = securityHeaders({
    csp: { "img-src": ["'self'", "https://cdn.example.com", "data:"], "frame-ancestors": false, "upgrade-insecure-requests": true },
  });
  assert.equal(headers["Content-Security-Policy"],
    "default-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; img-src 'self' https://cdn.example.com data:; upgrade-insecure-requests");
});

test("nonce is random base64 and injected into script-src", () => {
  const a = createNonce();
  const b = createNonce();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9+/]{22}==$/);
  assert.equal(Buffer.from(createNonce(32), "base64").length, 32);
  assert.throws(() => createNonce(8), TypeError);

  const derived = securityHeaders({ nonce: a })["Content-Security-Policy"];
  assert.ok(derived.includes(`script-src 'self' 'nonce-${a}'`));
  const explicit = securityHeaders({ nonce: a, csp: { "script-src": ["'strict-dynamic'"] }, nonceDirectives: ["script-src", "style-src"] });
  assert.ok(explicit["Content-Security-Policy"].includes(`script-src 'strict-dynamic' 'nonce-${a}'`));
  assert.ok(explicit["Content-Security-Policy"].includes(`style-src 'self' 'nonce-${a}'`));
  assert.throws(() => securityHeaders({ nonce: "short" }), TypeError);
  assert.throws(() => securityHeaders({ nonce: "a".repeat(20) + "'; script-src *" }), TypeError);
  assert.throws(() => securityHeaders({ csp: false, nonce: a }), TypeError);
});

test("report-only moves CSP to the report-only header", () => {
  const headers = securityHeaders({ reportOnly: true, csp: { "report-uri": ["/csp-report"] } });
  assert.equal(headers["Content-Security-Policy"], undefined);
  assert.ok(headers["Content-Security-Policy-Report-Only"].endsWith("report-uri /csp-report"));
});

test("directive injection and unsafe values are rejected", () => {
  for (const csp of [
    { "script-src": ["'self'; script-src *"] },
    { "script-src": ["https://a.example\nX-Injected: 1"] },
    { "script-src": ["https://a.example https://b.example"] },
    { "script-src": ["a,b"] },
    { "script-src": [""] },
    { "Script-Src": ["'self'"] },
    { "script-src;": ["'self'"] },
    { "script-src": "'self'" },
  ]) {
    assert.throws(() => securityHeaders({ csp }), TypeError, JSON.stringify(csp));
  }
  assert.throws(() => buildCsp({ "default-src": ["x\r"] }), TypeError);
  assert.throws(() => securityHeaders({ permissionsPolicy: { camera: ["https://evil.example\"), x=("] } }), TypeError);
  assert.throws(() => securityHeaders({ referrerPolicy: "always" }), TypeError);
});

test("HSTS is configurable and preload is opt-in with prerequisites", () => {
  assert.equal(securityHeaders({ hsts: { maxAge: 600, includeSubDomains: false } })["Strict-Transport-Security"], "max-age=600");
  assert.equal(securityHeaders({ hsts: { maxAge: 63072000, preload: true } })["Strict-Transport-Security"],
    "max-age=63072000; includeSubDomains; preload");
  assert.throws(() => securityHeaders({ hsts: { preload: true, includeSubDomains: false } }), TypeError);
  assert.throws(() => securityHeaders({ hsts: { preload: true, maxAge: 86400 } }), TypeError);
  assert.equal(securityHeaders({ hsts: false })["Strict-Transport-Security"], undefined);
});

test("permissions policy merges allowlists", () => {
  const value = securityHeaders({ permissionsPolicy: { geolocation: ["self", "https://maps.example.com"], fullscreen: ["*"] } })["Permissions-Policy"];
  assert.ok(value.includes('geolocation=(self "https://maps.example.com")'));
  assert.ok(value.includes("fullscreen=(*)"));
  assert.ok(value.includes("camera=()"));
});

test("withSecurityHeaders preserves body, status, and existing headers unless override", async () => {
  const original = new Response("hello", {
    status: 201, statusText: "Created",
    headers: { "X-Frame-Options": "SAMEORIGIN", "Content-Type": "text/plain", "Set-Cookie": "a=1" },
  });
  const result = withSecurityHeaders(original);
  assert.notEqual(result, original);
  assert.equal(result.status, 201);
  assert.equal(result.statusText, "Created");
  assert.equal(await result.text(), "hello");
  assert.equal(result.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(result.headers.get("content-type"), "text/plain");
  assert.equal(result.headers.get("set-cookie"), "a=1");
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");

  const overridden = withSecurityHeaders(new Response(null, { status: 204, headers: { "X-Frame-Options": "SAMEORIGIN" } }), { override: true });
  assert.equal(overridden.status, 204);
  assert.equal(overridden.headers.get("x-frame-options"), "DENY");
});

test("withSecurityHeaders works on immutable redirect responses and passes Response.error through", () => {
  const redirect = withSecurityHeaders(Response.redirect("https://app.test/next", 302));
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("location"), "https://app.test/next");
  assert.equal(redirect.headers.get("x-frame-options"), "DENY");
  const error = Response.error();
  assert.equal(withSecurityHeaders(error), error);
});
