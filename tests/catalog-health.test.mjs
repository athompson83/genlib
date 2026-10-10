// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { catalogHealth, inventoryLocks } from "../lib/catalog-health.mjs";

const run = promisify(execFile);
const NOW = Date.parse("2026-10-10T12:00:00Z");
const noFetch = async () => assert.fail("Live network requests are forbidden in these fixtures.");
const pin = (name, version, more = {}) => ({ version, resolved: `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-${version}.tgz`, ...more });
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "genlib-catalog-health-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
async function lock(root, directory, entries, version = 3) {
  const destination = path.join(root, directory);
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(path.join(destination, "package.json"), JSON.stringify({ name: "fixture-only", scripts: { preinstall: "THIS_MUST_NEVER_EXECUTE", prepare: "THIS_MUST_NEVER_EXECUTE" } }));
  await fs.writeFile(path.join(destination, "package-lock.json"), JSON.stringify({ lockfileVersion: version, packages: { "": { name: "fixture-only", version: "1.0.0" }, ...entries } }));
}
function response(data, headers = {}) { return Response.json(data, { headers }); }
function mockTransport({ deps = () => ({}), osv = () => ({}), eol = () => ({}), delay = false } = {}) {
  const calls = []; let active = 0, peak = 0;
  return { calls, get peak() { return peak; }, fetch: async (url, init) => {
    const target = new URL(url); active += 1; peak = Math.max(peak, active);
    try {
      assert.equal(init.redirect, "error"); assert.equal(init.credentials, "omit"); assert.ok(init.signal instanceof AbortSignal);
      calls.push({ host: target.hostname, path: target.pathname, method: init.method, body: init.body });
      if (delay) await new Promise(resolve => setTimeout(resolve, 2));
      let value;
      if (target.hostname === "api.deps.dev") {
        assert.equal(init.method, "GET"); assert.ok(!target.pathname.endsWith(":dependencies"));
        const parsed = /\/v3\/systems\/NPM\/packages\/([^/]+)\/versions\/([^/]+)$/u.exec(target.pathname); assert.ok(parsed);
        const name = decodeURIComponent(parsed[1]), version = decodeURIComponent(parsed[2]);
        value = await deps({ name, version });
        if (!(value instanceof Response)) value = { versionKey: { system: "NPM", name, version }, licenses: [], advisoryKeys: [], ...value };
      } else if (target.hostname === "api.osv.dev") {
        assert.equal(target.pathname, "/v1/query"); assert.equal(init.method, "POST");
        const body = JSON.parse(init.body); assert.equal(body.package.ecosystem, "npm"); assert.ok(body.version); assert.equal(body.page_token, undefined);
        value = await osv(body);
      } else if (target.hostname === "endoflife.date") value = await eol(target.pathname);
      else assert.fail(`Unexpected destination ${target.hostname}`);
      return value instanceof Response ? value : response(value);
    } finally { active -= 1; }
  } };
}

test("inventory keeps exact scoped/alias pins and every manifest owner, while skipping local/private/range sources", async t => {
  const root = await fixture(t);
  await lock(root, "", {
    "node_modules/zeta": pin("zeta", "2.0.0"),
    "node_modules/@org/tool": pin("@org/tool", "1.2.3"),
    "node_modules/alias": pin("original-package", "3.0.0", { name: "original-package" }),
    "node_modules/range": pin("range", "^1.0.0"),
    "node_modules/private": pin("private", "1.0.0", { resolved: "https://private.example.test/private.tgz" }),
    "node_modules/local": { version: "1.0.0", link: true, resolved: "../local" },
    "node_modules/bundled": { version: "1.0.0", inBundle: true },
  }, 2);
  await lock(root, "packages/genlib-mcp", { "node_modules/@org/tool": pin("@org/tool", "1.2.3", { dev: true }) });
  await lock(root, "integrations/example", { "node_modules/@org/tool": pin("@org/tool", "1.2.4"), "node_modules/parent/node_modules/@org/tool": pin("@org/tool", "1.2.3", { optional: true }) });
  // Nested package managers/node_modules never broaden the manifest inventory.
  await lock(root, "integrations/example/node_modules/untrusted", { "node_modules/unexpected": pin("unexpected", "9.9.9") });
  const result = await inventoryLocks(root);
  assert.equal(result.lockfiles, 3); assert.equal(result.packages.length, 4); assert.equal(result.issues.length, 0);
  const shared = result.packages.find(item => item.key === "npm:@org/tool@1.2.3");
  assert.deepEqual(shared.owners.map(owner => owner.manifest), ["package.json", "packages/genlib-mcp/package.json", "integrations/example/package.json"]);
  assert.equal(shared.owners[1].dev, true); assert.equal(shared.owners[2].optional, true);
  assert.ok(result.packages.some(item => item.name === "original-package")); assert.ok(result.packages.some(item => item.version === "1.2.4"));
  assert.deepEqual(new Set(result.unqueryable.map(item => item.reason)), new Set(["non-exact-npm-version", "non-public-registry-source", "linked-package", "registry-origin-unknown"]));
});

test("default offline CLI needs no build, sends no requests, writes no cache and leaves scripts/manifests inert", async t => {
  const root = await fixture(t);
  await lock(root, "", { "node_modules/alpha": pin("alpha", "1.0.0"), "node_modules/beta": pin("beta", "1.0.0") });
  const manifest = await fs.readFile(path.join(root, "package.json")), lockfile = await fs.readFile(path.join(root, "package-lock.json"));
  const report = await catalogHealth({ root, fetch: noFetch, limit: 1, now: () => NOW });
  assert.equal(report.mode, "offline"); assert.equal(report.summary.providerQueries, 0); assert.equal(report.cache.written, false);
  assert.equal(report.records.length, 1); assert.equal(report.records[0].advisoryState, "unknown"); assert.equal(report.records[0].coverageComplete, false);
  assert.equal(report.summary.nextOffset, 1); await assert.rejects(fs.stat(path.join(root, ".genlib")), { code: "ENOENT" });
  const second = await catalogHealth({ root, fetch: noFetch, limit: 1, offset: 1 }); assert.equal(second.records[0].name, "beta"); assert.equal(second.summary.nextOffset, null);
  assert.deepEqual(await fs.readFile(path.join(root, "package.json")), manifest); assert.deepEqual(await fs.readFile(path.join(root, "package-lock.json")), lockfile);
  // A standalone copy contains no .build directory. Only --network requires it.
  for (const filename of ["lib/catalog-health.mjs", "tools/catalog-health.mjs"]) {
    await fs.mkdir(path.dirname(path.join(root, filename)), { recursive: true });
    await fs.copyFile(new URL(`../${filename}`, import.meta.url), path.join(root, filename));
  }
  const executed = await run(process.execPath, [path.join(root, "tools/catalog-health.mjs"), "--limit", "1", "--json"]);
  assert.equal(JSON.parse(executed.stdout).summary.providerQueries, 0);
  await assert.rejects(run(process.execPath, [path.join(root, "tools/catalog-health.mjs"), "--network", "--limit", "1"]), error => JSON.parse(error.stderr).error === "CLIENTS_NOT_BUILT");
});

test("bounded network queries reuse production parsers and cache exact-version results with ownership and timestamps", async t => {
  const root = await fixture(t);
  await lock(root, "", { "node_modules/@org/tool": pin("@org/tool", "1.2.3"), "node_modules/beta": pin("beta", "2.0.0"), "node_modules/gamma": pin("gamma", "3.0.0") });
  const mock = mockTransport({ delay: true });
  const report = await catalogHealth({ root, network: true, limit: 2, fetch: mock.fetch, now: () => NOW });
  assert.equal(report.records.length, 2); assert.equal(report.summary.providerQueries, 4); assert.equal(mock.calls.length, 4); assert.ok(mock.peak <= 2);
  assert.equal(report.records[0].depsDev.licenseKnown, false); assert.deepEqual(report.records[0].depsDev.licenses, []);
  assert.equal(report.records[0].advisoryState, "no-known-advisories"); assert.equal(report.records[0].coverageComplete, true);
  assert.equal(report.records[0].depsDev.queriedAt, "2026-10-10T12:00:00.000Z");
  assert.ok(mock.calls.some(call => call.path.includes("%40org%2Ftool")));
  const filename = path.join(root, ".genlib/catalog-health-cache.json"), original = await fs.readFile(filename, "utf8");
  if (process.platform !== "win32") assert.equal((await fs.stat(filename)).mode & 0o777, 0o600);
  const cached = await catalogHealth({ root, network: true, limit: 2, fetch: noFetch, now: () => NOW + 1000 });
  assert.equal(cached.summary.providerQueries, 0); assert.equal(cached.cache.hits, 4); assert.equal(cached.cache.written, false); assert.equal(cached.records[0].osv.cached, true);
  assert.equal(await fs.readFile(filename, "utf8"), original);
  const offline = await catalogHealth({ root, limit: 2, fetch: noFetch, now: () => NOW + 2000 });
  assert.equal(offline.records[0].advisoryState, "no-known-advisories"); assert.equal(offline.records[0].osv.cached, true);
  const expired = await catalogHealth({ root, limit: 2, fetch: noFetch, now: () => NOW + 86400001 });
  assert.equal(expired.records[0].advisoryState, "unknown"); assert.equal(expired.records[0].osv.lastQuery.status, "no-known-advisories");
});

test("provider errors, missing records and pagination remain distinct from a no-advisory result", async t => {
  const root = await fixture(t);
  await lock(root, "", { "node_modules/alpha": pin("alpha", "1.0.0"), "node_modules/beta": pin("beta", "2.0.0"), "node_modules/gamma": pin("gamma", "3.0.0") });
  const secret = "DO_NOT_INCLUDE_PROVIDER_ERROR_BODY";
  const mock = mockTransport({
    deps: ({ name }) => name === "alpha" ? new Response(secret, { status: 404 }) : name === "gamma" ? { advisoryKeys: [{ id: "GHSA-example-deps" }], isDeprecated: true, deprecatedReason: "Replaced upstream" } : {},
    osv: ({ package: pkg }) => pkg.name === "beta" ? { next_page_token: "DO_NOT_PERSIST_OPAQUE_TOKEN" } : pkg.name === "gamma" ? { vulns: [{ id: "GHSA-example-osv", modified: "2026-10-09T12:00:00Z" }] } : {},
  });
  const report = await catalogHealth({ root, network: true, limit: 3, fetch: mock.fetch, now: () => NOW });
  const [missing, paged, found] = report.records;
  assert.equal(missing.advisoryState, "error"); assert.equal(missing.depsDev.error.httpStatus, 404); assert.equal(missing.coverageComplete, false);
  assert.equal(paged.advisoryState, "incomplete"); assert.equal(paged.osv.paginationComplete, false); assert.equal(paged.coverageComplete, false);
  assert.equal(found.advisoryState, "advisories-found"); assert.deepEqual(found.osv.advisoryIds, ["GHSA-example-osv"]); assert.equal(found.depsDev.isDeprecated, true);
  assert.equal(found.osv.advisories[0].modified, "2026-10-09T12:00:00Z");
  const serialized = JSON.stringify(report) + await fs.readFile(path.join(root, ".genlib/catalog-health-cache.json"), "utf8");
  assert.ok(!serialized.includes(secret)); assert.ok(!serialized.includes("DO_NOT_PERSIST_OPAQUE_TOKEN"));
  const errorCache = await catalogHealth({ root, limit: 3, now: () => NOW + 1000, fetch: noFetch }); assert.equal(errorCache.records[0].depsDev.status, "error");
  const staleError = await catalogHealth({ root, limit: 3, now: () => NOW + 120001, fetch: noFetch }); assert.equal(staleError.records[0].depsDev.status, "unknown");
});

test("response identity mismatches fail closed and explicit refresh does not silently reuse old query evidence", async t => {
  const root = await fixture(t); await lock(root, "", { "node_modules/alpha": pin("alpha", "1.0.0") });
  const first = await catalogHealth({ root, network: true, fetch: mockTransport().fetch, now: () => NOW }); assert.equal(first.records[0].advisoryState, "no-known-advisories");
  const mismatch = mockTransport({ deps: () => ({ versionKey: { system: "NPM", name: "another-package", version: "1.0.0" } }) });
  const refreshed = await catalogHealth({ root, network: true, refresh: true, fetch: mismatch.fetch, now: () => NOW + 100 });
  assert.equal(mismatch.calls.length, 2); assert.equal(refreshed.records[0].depsDev.error.code, "INVALID_RESPONSE"); assert.equal(refreshed.records[0].advisoryState, "error");
  await assert.rejects(catalogHealth({ root, refresh: true, fetch: noFetch }), { code: "INVALID_OPTIONS" });
});

test("provider cache directives shorten TTL or suppress persistent response storage", async t => {
  const root = await fixture(t); await lock(root, "", { "node_modules/alpha": pin("alpha", "1.0.0") });
  const deps = ({ name, version }) => response({ versionKey: { system: "NPM", name, version } }, { "cache-control": "public, max-age=60", age: "10" });
  const mock = mockTransport({ deps, osv: () => response({}, { "cache-control": "no-store" }) });
  const result = await catalogHealth({ root, network: true, fetch: mock.fetch, now: () => NOW });
  assert.equal(result.records[0].depsDev.expiresAt, "2026-10-10T12:00:50.000Z");
  const cached = JSON.parse(await fs.readFile(path.join(root, ".genlib/catalog-health-cache.json"), "utf8"));
  assert.equal(Object.keys(cached.entries).length, 1); assert.ok(Object.keys(cached.entries)[0].startsWith("depsDev:"));
  const expired = await catalogHealth({ root, fetch: noFetch, now: () => NOW + 50001 }); assert.equal(expired.records[0].depsDev.status, "unknown"); assert.equal(expired.records[0].osv.reason, "not-queried");
});

test("optional lifecycle lookup uses v1 and retains official policy and independent maintained/EOL states", async t => {
  const root = await fixture(t); await lock(root, "", {});
  const mock = mockTransport({ eol: pathname => {
    assert.equal(pathname, "/api/v1/products/nodejs/");
    return { generated_at: "2026-10-09T00:00:00Z", last_modified: "2026-10-08T00:00:00Z", result: { name: "nodejs", label: "Node.js", links: { releasePolicy: "https://nodejs.org/en/about/previous-releases" }, versionCommand: "DO_NOT_EXECUTE_OR_STORE", releases: [{ name: "20", label: "20", isEol: true, isMaintained: true, latest: { name: "20.20.0" } }] } };
  } });
  const cacheFile = path.join(root, "reports", "health-cache.json");
  const result = await catalogHealth({ root, network: true, products: ["nodejs"], cacheFile, fetch: mock.fetch, now: () => NOW });
  assert.equal(result.summary.providerQueries, 1); assert.equal(result.lifecycle[0].releases[0].isEol, true); assert.equal(result.lifecycle[0].releases[0].isMaintained, true);
  assert.equal(result.lifecycle[0].policyUrl, "https://nodejs.org/en/about/previous-releases");
  assert.ok(!JSON.stringify(result).includes("DO_NOT_EXECUTE_OR_STORE")); assert.equal(JSON.parse(await fs.readFile(cacheFile, "utf8")).schemaVersion, 1);
  const offline = await catalogHealth({ root, products: ["nodejs"], cacheFile, fetch: noFetch, now: () => NOW + 1000 }); assert.equal(offline.lifecycle[0].cached, true);
});

test("malformed/old/missing lockfiles and symlink directories are visible inventory issues", async t => {
  const root = await fixture(t); await lock(root, "", { "node_modules/valid": pin("valid", "1.0.0") });
  await lock(root, "integrations/old", {}, 1);
  await lock(root, "integrations/broken", {}); await fs.writeFile(path.join(root, "integrations/broken/package-lock.json"), "{bad-json");
  await lock(root, "integrations/missing", {}); await fs.unlink(path.join(root, "integrations/missing/package-lock.json"));
  await fs.symlink(root, path.join(root, "packages"), "dir");
  const result = await catalogHealth({ root, fetch: noFetch });
  assert.equal(result.records[0].name, "valid"); assert.equal(result.summary.inventoryIssues, 4);
  assert.deepEqual(new Set(result.inventoryIssues.map(issue => issue.code)), new Set(["UNSUPPORTED_LOCKFILE", "INVALID_JSON", "NO_PACKAGE_LOCK", "UNSAFE_PATH"]));
});

test("invalid/symlink caches and unsafe lock paths never overwrite other files or trigger network requests", async t => {
  const root = await fixture(t); await lock(root, "", { "node_modules/alpha": pin("alpha", "1.0.0") });
  const cacheFile = path.join(root, "existing.json"); await fs.writeFile(cacheFile, '{"belongs":"to the user"}');
  await assert.rejects(catalogHealth({ root, network: true, cacheFile, fetch: noFetch }), { code: "INVALID_CACHE" });
  assert.equal(await fs.readFile(cacheFile, "utf8"), '{"belongs":"to the user"}');
  await fs.symlink(cacheFile, path.join(root, "cache-link.json"));
  await assert.rejects(catalogHealth({ root, network: true, cacheFile: "cache-link.json", fetch: noFetch }), { code: "UNSAFE_PATH" });
  const outside = await fixture(t); await fs.symlink(outside, path.join(root, ".genlib"), "dir");
  await assert.rejects(catalogHealth({ root, network: true, fetch: noFetch }), { code: "UNSAFE_PATH" });
  assert.deepEqual(await fs.readdir(outside), []);
  await fs.unlink(path.join(root, "package-lock.json")); await fs.symlink(cacheFile, path.join(root, "package-lock.json"));
  const inventory = await inventoryLocks(root); assert.equal(inventory.packages.length, 0); assert.equal(inventory.issues[0].code, "UNSAFE_PATH");
});

test("cancelled audits return explicit errors, and CLI/options reject unbounded or malformed requests", async t => {
  const root = await fixture(t); await lock(root, "", { "node_modules/alpha": pin("alpha", "1.0.0") });
  const cancelled = new AbortController(); cancelled.abort();
  const result = await catalogHealth({ root, network: true, signal: cancelled.signal, fetch: noFetch, now: () => NOW });
  assert.equal(result.records[0].advisoryState, "error"); assert.equal(result.records[0].depsDev.error.code, "ABORTED"); assert.equal(result.records[0].osv.error.code, "ABORTED");
  for (const selected of [{ limit: 0 }, { limit: 101 }, { offset: -1 }, { products: ["../nodejs"] }, { products: ["nodejs", "python", "ruby", "go"] }]) await assert.rejects(catalogHealth({ root, fetch: noFetch, ...selected }), { code: "INVALID_OPTIONS" });
  const cli = new URL("../tools/catalog-health.mjs", import.meta.url).pathname;
  for (const args of [["--limit", "1.5"], ["--network", "--network"], ["--unknown"], ["--cache"]]) {
    await assert.rejects(run(process.execPath, [cli, "--root", root, ...args]), error => JSON.parse(error.stderr).error === "INVALID_OPTIONS");
  }
});
