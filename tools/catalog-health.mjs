#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogHealth, CatalogHealthError } from "../lib/catalog-health.mjs";

const help = `Genlib catalog health (read-only package inventory; network enrichment is opt-in)

  node tools/catalog-health.mjs [--root DIR] [--limit 1..100] [--offset N] [--json]
  node tools/catalog-health.mjs --network [--cache FILE] [--refresh] [--product SLUG]

Defaults: offline, limit 10, offset 0, cache .genlib/catalog-health-cache.json.
--network sends selected public npm names/exact versions to deps.dev and OSV.
--product selects endoflife.date evidence (repeat at most three times).
Network mode uses Genlib's compiled clients: run npm run build first.
No upstream package installation, code execution, catalog edits or manifest edits.
Output is JSON; inspect provider statuses and coverage, not only the process exit code.
`;

function options(argv) {
  const result = { root: fileURLToPath(new URL("../", import.meta.url)), products: [] }, seen = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") return { help: true };
    if (flag !== "--product" && seen.has(flag)) throw new CatalogHealthError("INVALID_OPTIONS", `Duplicate flag: ${flag}`);
    seen.add(flag);
    if (["--network", "--refresh", "--json"].includes(flag)) { if (flag !== "--json") result[flag.slice(2)] = true; continue; }
    if (!["--root", "--limit", "--offset", "--cache", "--product"].includes(flag)) throw new CatalogHealthError("INVALID_OPTIONS", "Unknown catalog-health flag. Use --help.");
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new CatalogHealthError("INVALID_OPTIONS", `Missing value for ${flag}.`);
    if (flag === "--product") result.products.push(value);
    else if (flag === "--root") result.root = path.resolve(value);
    else if (flag === "--cache") result.cacheFile = path.resolve(value);
    else { if (!/^\d+$/u.test(value)) throw new CatalogHealthError("INVALID_OPTIONS", `${flag} needs a nonnegative integer.`); result[flag.slice(2)] = Number(value); }
  }
  return result;
}
const controller = new AbortController();
const cancel = () => controller.abort();
process.once("SIGINT", cancel);
try {
  const selected = options(process.argv.slice(2));
  if (selected.help) process.stdout.write(help);
  else process.stdout.write(`${JSON.stringify(await catalogHealth({ ...selected, signal: controller.signal }), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error instanceof CatalogHealthError ? error.code : "CATALOG_HEALTH_FAILED",
    message: error instanceof CatalogHealthError ? error.message : "The inventory or cache operation could not be completed." })}\n`);
  process.exitCode = 1;
} finally { process.removeListener("SIGINT", cancel); }
