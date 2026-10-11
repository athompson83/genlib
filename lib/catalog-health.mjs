// SPDX-License-Identifier: Apache-2.0
import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_LOCK_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_BYTES = 4 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 2000;
const DAY = 24 * 60 * 60 * 1000;
const SOURCES = Object.freeze({
  depsDev: "https://docs.deps.dev/api/v3/",
  osv: "https://google.github.io/osv.dev/api/",
  endoflife: "https://endoflife.date/docs/api/v1/",
});
const SAFE_ERRORS = new Set(["ABORTED", "TIMEOUT", "NETWORK", "HTTP", "REDIRECT", "INVALID_RESPONSE", "RESPONSE_TOO_LARGE", "INVALID_INPUT", "INVALID_CONFIG", "AUTHENTICATION", "DENIED"]);
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/iu;
const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const slash = value => value.split(path.sep).join("/");
const iso = value => new Date(value).toISOString();
const text = (value, max = 300) => typeof value === "string" && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);

export class CatalogHealthError extends Error {
  constructor(code, message) { super(message); this.name = "CatalogHealthError"; this.code = code; }
}
function fail(code, message) { throw new CatalogHealthError(code, message); }
function integer(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) fail("INVALID_OPTIONS", `${name} must be an integer from ${min} to ${max}.`);
  return value;
}

/** Inspect every parent before reading/writing; no symlink traversal or non-regular file reads. */
async function parents(filename, create = false) {
  const absolute = path.resolve(filename), parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of path.relative(parsed.root, path.dirname(absolute)).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (!create) return false;
      try { await fs.mkdir(current, { mode: 0o700 }); } catch (mkdirError) { if (mkdirError.code !== "EEXIST") throw mkdirError; }
      stat = await fs.lstat(current);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("UNSAFE_PATH", "A data-file parent is a symlink or is not a directory.");
  }
  return true;
}
async function readJson(filename, maxBytes, missing = false) {
  if (!await parents(filename)) {
    if (missing) return null;
    fail("MISSING_FILE", "A required JSON data file is missing.");
  }
  let handle;
  try {
    const stat = await fs.lstat(filename);
    if (stat.isSymbolicLink() || !stat.isFile()) fail("UNSAFE_PATH", "A JSON data file is a symlink or is not a regular file.");
    handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > maxBytes) fail("DATA_LIMIT", "A JSON data file exceeds its byte limit.");
    // The bounded read also catches a file that grows after stat().
    const buffer = Buffer.alloc(maxBytes + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > maxBytes) fail("DATA_LIMIT", "A JSON data file exceeds its byte limit.");
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, total))); }
    catch { fail("INVALID_JSON", "A JSON data file is not valid UTF-8 JSON."); }
  } catch (error) {
    if (error.code === "ENOENT" && missing) return null;
    if (error instanceof CatalogHealthError) throw error;
    fail("FILE_READ", "A JSON data file could not be read.");
  } finally { await handle?.close(); }
}
function relativeOwner(root, directory, lockPath, packagePath) {
  return { manifest: slash(path.relative(root, path.join(directory, "package.json"))), lockfile: slash(path.relative(root, lockPath)), packagePath };
}
function npmName(packagePath, entry) {
  if (text(entry.name, 214) && PACKAGE_NAME.test(entry.name)) return entry.name;
  const marker = "node_modules/", index = packagePath.lastIndexOf(marker);
  const name = index < 0 ? "" : packagePath.slice(index + marker.length);
  return name.length <= 214 && PACKAGE_NAME.test(name) ? name : null;
}
function sourceReason(entry) {
  if (entry.link) return "linked-package";
  if (!text(entry.version, 200) || !EXACT_VERSION.test(entry.version)) return "non-exact-npm-version";
  if (typeof entry.resolved !== "string") return "registry-origin-unknown";
  try {
    const url = new URL(entry.resolved);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["registry.npmjs.org", "registry.yarnpkg.com"].includes(url.hostname)) return "non-public-registry-source";
  } catch { return "non-public-registry-source"; }
  return null;
}

/** Reads root and immediate package/integration manifests. It never reads node_modules or runs a package manager. */
export async function inventoryLocks(root) {
  const absolute = path.resolve(root), directories = [absolute], issues = [], packages = new Map(), unqueryable = [];
  const rootStat = await fs.lstat(absolute).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) fail("INVALID_ROOT", "The inventory root must be an existing directory without symlink traversal.");
  await parents(path.join(absolute, "package-lock.json"));
  for (const base of ["packages", "integrations"]) {
    const directory = path.join(absolute, base), stat = await fs.lstat(directory).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (!stat) continue;
    if (stat.isSymbolicLink() || !stat.isDirectory()) { issues.push({ path: base, code: "UNSAFE_PATH" }); continue; }
    const entries = await fs.readdir(directory, { withFileTypes: true });
    if (entries.length > 200) fail("INVENTORY_LIMIT", "A package/integration directory contains more than 200 entries.");
    for (const entry of entries.sort((a, b) => compare(a.name, b.name))) {
      if (entry.isSymbolicLink()) { issues.push({ path: `${base}/${entry.name}`, code: "UNSAFE_PATH" }); continue; }
      if (entry.isDirectory()) directories.push(path.join(directory, entry.name));
    }
  }
  let lockfiles = 0;
  for (const directory of directories) {
    const manifestPath = path.join(directory, "package.json"), lockPath = path.join(directory, "package-lock.json");
    let manifest, lock;
    try {
      manifest = await readJson(manifestPath, 256 * 1024, true);
      lock = await readJson(lockPath, MAX_LOCK_BYTES, true);
    } catch (error) { issues.push({ path: slash(path.relative(absolute, lockPath)), code: error instanceof CatalogHealthError ? error.code : "FILE_READ" }); continue; }
    if (!manifest && !lock) continue;
    if (!isObject(manifest)) { issues.push({ path: slash(path.relative(absolute, manifestPath)), code: "MISSING_OR_INVALID_MANIFEST" }); continue; }
    if (!lock) { issues.push({ path: slash(path.relative(absolute, lockPath)), code: "NO_PACKAGE_LOCK" }); continue; }
    if (!isObject(lock) || ![2, 3].includes(lock.lockfileVersion) || !isObject(lock.packages)) { issues.push({ path: slash(path.relative(absolute, lockPath)), code: "UNSUPPORTED_LOCKFILE" }); continue; }
    const entries = Object.entries(lock.packages);
    if (entries.length > 50000) { issues.push({ path: slash(path.relative(absolute, lockPath)), code: "LOCK_PACKAGE_LIMIT" }); continue; }
    lockfiles += 1;
    for (const [packagePath, entry] of entries) {
      if (!packagePath) continue; // Root/workspace packages are not registry releases.
      const owner = relativeOwner(absolute, directory, lockPath, packagePath);
      if (!text(packagePath, 1000) || !/(^|\/)node_modules\//u.test(packagePath) || packagePath.split("/").some(part => part === ".." || part === ".") || packagePath.includes("\\") || !isObject(entry)) {
        unqueryable.push({ ...owner, name: null, version: null, reason: "non-registry-lock-entry" }); continue;
      }
      const name = npmName(packagePath, entry), reason = !name ? "invalid-package-name" : sourceReason(entry);
      if (reason) { unqueryable.push({ ...owner, name, version: text(entry.version, 200) ? entry.version : null, reason }); continue; }
      const key = `npm:${name}@${entry.version}`;
      if (!packages.has(key)) packages.set(key, { key, ecosystem: "npm", name, version: entry.version, owners: [] });
      packages.get(key).owners.push({ ...owner, dev: entry.dev === true, optional: entry.optional === true });
    }
  }
  return { root: absolute, lockfiles, packages: [...packages.values()].sort((a, b) => compare(a.key, b.key)),
    unqueryable, issues, scope: "Exact public-registry npm pins from package-lock v2/v3 in root, packages/* and integrations/*. Other ecosystems and unpinned/private/local sources are not queried." };
}

function validCacheEntry(key, value) {
  if (!text(key, 500) || !isObject(value) || !["depsDev", "osv", "endoflife"].includes(value.provider) || !key.startsWith(`${value.provider}:`)) return false;
  if (!text(value.queriedAt, 30) || !text(value.expiresAt, 30) || !Number.isFinite(Date.parse(value.queriedAt)) || !Number.isFinite(Date.parse(value.expiresAt))) return false;
  if (Date.parse(value.expiresAt) < Date.parse(value.queriedAt) || Date.parse(value.expiresAt) - Date.parse(value.queriedAt) > DAY) return false;
  if (value.source !== SOURCES[value.provider]) return false;
  if (value.status === "error") return SAFE_ERRORS.has(value.error?.code);
  if (value.provider === "endoflife") return value.status === "available" && Array.isArray(value.releases) && value.releases.length <= 100;
  if (!Array.isArray(value.advisoryIds) || value.advisoryIds.length > 1000 || !value.advisoryIds.every(id => text(id, 200))) return false;
  if (value.provider === "depsDev") return value.status === "available" && Array.isArray(value.licenses) && value.licenses.length <= 100 && value.licenses.every(license => text(license, 1000));
  return ["no-known-advisories", "advisories-found", "incomplete"].includes(value.status) && Array.isArray(value.advisories) && value.advisories.length <= 1000;
}
async function loadCache(filename) {
  const cache = await readJson(filename, MAX_CACHE_BYTES, true);
  if (!cache) return { schemaVersion: 1, entries: {} };
  if (!isObject(cache) || cache.schemaVersion !== 1 || !isObject(cache.entries) || Object.keys(cache.entries).length > MAX_CACHE_ENTRIES || !Object.entries(cache.entries).every(([key, value]) => validCacheEntry(key, value))) {
    fail("INVALID_CACHE", "The cache format is invalid. Choose another cache file or review and remove the invalid file explicitly.");
  }
  return cache;
}
async function saveCache(filename, cache, generatedAt) {
  const sorted = Object.entries(cache.entries).sort((a, b) => compare(b[1].queriedAt, a[1].queriedAt)).slice(0, MAX_CACHE_ENTRIES);
  let serialized;
  do {
    serialized = `${JSON.stringify({ schemaVersion: 1, generatedAt, entries: Object.fromEntries(sorted) }, null, 2)}\n`;
    if (Buffer.byteLength(serialized) <= MAX_CACHE_BYTES) break;
    sorted.pop();
  } while (sorted.length);
  await parents(filename, true);
  const existing = await fs.lstat(filename).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (existing && (existing.isSymbolicLink() || !existing.isFile())) fail("UNSAFE_PATH", "The cache destination is not a regular file.");
  const temporary = path.join(path.dirname(filename), `.catalog-health-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    await handle.writeFile(serialized); await handle.sync(); await handle.close(); handle = null;
    await fs.rename(temporary, filename);
  } finally { await handle?.close(); await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}
function unknown(provider, reason, previous) {
  return { provider, source: SOURCES[provider], status: "unknown", reason, cached: Boolean(previous),
    ...(previous ? { lastQuery: { queriedAt: previous.queriedAt, expiresAt: previous.expiresAt, status: previous.status, advisoryIds: previous.advisoryIds ?? [] } } : {}) };
}
function cacheTtl(meta, desired) {
  const directive = meta?.cache?.cacheControl ?? "";
  if (/(?:^|,)\s*no-(?:store|cache)(?:\s|,|$)/iu.test(directive)) return 0;
  const maxAge = /(?:^|,)\s*max-age=(\d+)/iu.exec(directive);
  if (!maxAge) return desired;
  const age = Math.max(0, Number(meta?.cache?.ageSeconds) || 0);
  return Math.max(0, Math.min(desired, (Number(maxAge[1]) - age) * 1000));
}
async function publicClients(fetch, timeoutMs) {
  try {
    const [deps, osv, endoflife] = await Promise.all([
      import("../.build/modules/public-data-clients/files/deps-dev.js"),
      import("../.build/modules/public-data-clients/files/osv.js"),
      import("../.build/modules/public-data-clients/files/endoflife.js"),
    ]);
    const options = { ...(fetch ? { fetch } : {}), timeoutMs, maxResponseBytes: 512 * 1024, maxRetries: 0 };
    return { depsDev: deps.createDepsDevClient(options), osv: osv.createOsvClient(options), endoflife: endoflife.createEndOfLifeClient(options) };
  } catch { fail("CLIENTS_NOT_BUILT", "Network mode requires Genlib's compiled public-data clients. Run npm run build in the trusted Genlib checkout first."); }
}
function overview(deps, osv) {
  if ((deps.advisoryIds?.length ?? 0) || (osv.advisoryIds?.length ?? 0)) return "advisories-found";
  if ([deps.status, osv.status].includes("error")) return "error";
  if ([deps.status, osv.status].includes("incomplete")) return "incomplete";
  if (deps.status === "available" && osv.status === "no-known-advisories") return "no-known-advisories";
  return "unknown";
}
async function workers(values, callback, concurrency = 2) {
  const results = new Array(values.length); let index = 0;
  await Promise.all(Array.from({ length: Math.min(values.length, concurrency) }, async () => {
    while (index < values.length) { const current = index++; results[current] = await callback(values[current]); }
  }));
  return results;
}

/** Default is offline; only network:true imports clients or sends registry names/versions. */
export async function catalogHealth(options = {}) {
  const root = path.resolve(options.root ?? process.cwd()), network = options.network === true;
  const limit = integer(options.limit ?? 10, 1, 100, "limit"), offset = integer(options.offset ?? 0, 0, 1000000, "offset");
  const ttlMs = integer(options.ttlMs ?? DAY, 1000, DAY, "ttlMs"), timeoutMs = integer(options.timeoutMs ?? 5000, 1, 30000, "timeoutMs");
  const products = [...new Set(options.products ?? [])];
  if (products.length > 3 || !products.every(value => text(value, 100) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value))) fail("INVALID_OPTIONS", "Supply at most three endoflife.date product slugs.");
  if (options.refresh && !network) fail("INVALID_OPTIONS", "refresh requires explicit network mode.");
  const now = options.now ?? Date.now, started = now();
  if (!Number.isFinite(started)) fail("INVALID_OPTIONS", "The query clock is invalid.");
  const filename = path.resolve(root, options.cacheFile ?? ".genlib/catalog-health-cache.json");
  const inventory = await inventoryLocks(root), cache = await loadCache(filename), selected = inventory.packages.slice(offset, offset + limit);
  const clients = network && (selected.length || products.length) ? await publicClients(options.fetch, timeoutMs) : null;
  let requests = 0, cacheHits = 0, changed = false;
  async function query(provider, identity, execute) {
    const key = `${provider}:${identity}`, existing = cache.entries[key], queryTime = now();
    if (existing && !options.refresh && Date.parse(existing.expiresAt) > queryTime && Date.parse(existing.queriedAt) <= queryTime) { cacheHits += 1; return { ...existing, cached: true }; }
    if (!network) return unknown(provider, existing ? "cache-expired-or-clock-changed" : "not-queried", existing);
    let result, ttl = ttlMs;
    try {
      requests += 1; const response = await execute();
      if (response.notModified) throw Object.assign(new Error(), { code: "INVALID_RESPONSE" });
      const data = response.data;
      ttl = cacheTtl(response.meta, ttlMs);
      if (provider === "depsDev") {
        if (`npm:${data.version.name}@${data.version.version}` !== identity || data.version.system !== "NPM") throw Object.assign(new Error(), { code: "INVALID_RESPONSE" });
        result = { status: "available", advisoryIds: [...new Set(data.advisoryIds)].slice(0, 1000), advisoriesTruncated: data.advisoryIds.length > 1000,
          licenses: data.licenses, licenseKnown: data.licenseKnown, isDeprecated: data.isDeprecated, deprecatedReason: data.deprecatedReason, publishedAt: data.publishedAt };
      } else if (provider === "osv") {
        const advisories = data.advisories.slice(0, 1000).map(({ id, modified, withdrawn }) => ({ id, modified, withdrawn }));
        const advisoryIds = [...new Set(advisories.filter(a => !a.withdrawn).map(a => a.id))];
        const incomplete = Boolean(data.nextPageToken) || data.advisories.length > 1000;
        result = { status: incomplete ? "incomplete" : advisoryIds.length ? "advisories-found" : "no-known-advisories", advisoryIds, advisories,
          paginationComplete: !incomplete, moreResults: Boolean(data.nextPageToken) };
      } else {
        if (data.name !== identity) throw Object.assign(new Error(), { code: "INVALID_RESPONSE" });
        result = { status: "available", product: data.name, label: data.label, policyUrl: data.policyUrl, upstreamGeneratedAt: data.generatedAt,
          upstreamLastModified: data.lastModified, releases: data.releases.slice(0, 100), releasesTruncated: data.releases.length > 100 };
      }
    } catch (error) {
      result = { status: "error", error: { code: SAFE_ERRORS.has(error?.code) ? error.code : "INVALID_RESPONSE",
        ...(Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? { httpStatus: error.status } : {}) } };
      ttl = Math.min(ttlMs, 2 * 60 * 1000);
    }
    const value = { provider, source: SOURCES[provider], ...result, queriedAt: iso(queryTime), expiresAt: iso(queryTime + ttl) };
    if (ttl > 0) cache.entries[key] = value; else delete cache.entries[key];
    changed = true;
    return { ...value, cached: false };
  }
  const records = await workers(selected, async pin => {
    // At most two outbound operations are active: each worker queries providers sequentially.
    const depsDev = await query("depsDev", pin.key, () => clients.depsDev.getVersion({ system: "NPM", name: pin.name, version: pin.version }, { signal: options.signal }));
    const osv = await query("osv", pin.key, () => clients.osv.query({ package: { name: pin.name, ecosystem: "npm" }, version: pin.version }, { signal: options.signal }));
    return { ...pin, advisoryState: overview(depsDev, osv), coverageComplete: depsDev.status === "available" && !depsDev.advisoriesTruncated && ["no-known-advisories", "advisories-found"].includes(osv.status), depsDev, osv };
  });
  const lifecycle = await workers(products, product => query("endoflife", product, () => clients.endoflife.getProduct(product, { signal: options.signal })));
  const generatedAt = iso(now());
  if (network && changed) await saveCache(filename, cache, generatedAt);
  return { schemaVersion: 1, generatedAt, mode: network ? "network" : "offline", scope: inventory.scope,
    cache: { path: filename, written: network && changed, hits: cacheHits },
    summary: { lockfiles: inventory.lockfiles, uniquePublicPins: inventory.packages.length, selected: selected.length, offset,
      nextOffset: offset + selected.length < inventory.packages.length ? offset + selected.length : null,
      unqueryableEntries: inventory.unqueryable.length, inventoryIssues: inventory.issues.length, providerQueries: requests,
      advisoryStates: Object.fromEntries(["unknown", "error", "incomplete", "advisories-found", "no-known-advisories"].map(state => [state, records.filter(record => record.advisoryState === state).length])) },
    records, lifecycle, inventoryIssues: inventory.issues.slice(0, 100), unqueryable: inventory.unqueryable.slice(0, 100),
    limitations: ["An empty response means no matching advisory was returned at query time; it is not a safety or license clearance.",
      "Lockfile ownership is preserved; manifests, lockfiles and catalog records are never modified. Non-npm ecosystems and local/private sources are not queried.",
      "Only the selected exact versions are queried. OSV pagination and large result sets remain explicitly incomplete; there is no automatic transitive graph expansion.",
      "endoflife.date is secondary product-lifecycle evidence. Confirm support or hosted-service retirement with the linked official provider policy."] };
}
