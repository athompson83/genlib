#!/usr/bin/env node
// Rewrites the install steps in resources/apis.json from each record's spec version and SDK (lib/api-install.mjs).
// --check exits non-zero when the stored steps differ from the derived ones.
import { readFileSync, writeFileSync } from 'node:fs';
import { apiSteps } from '../lib/api-install.mjs';
const file = new URL('../resources/apis.json', import.meta.url);
const raw = readFileSync(file, 'utf8');
const data = JSON.parse(raw);
let changed = 0;
for (const api of data.apis) {
  const install = apiSteps(api).map(step => step.command);
  if (JSON.stringify(install) !== JSON.stringify(api.install)) { api.install = install; changed++; }
}
if (process.argv.includes('--check')) {
  if (changed) { console.error(`${changed} API records have stale install steps; run node scripts/api-install.mjs`); process.exit(1); }
  console.log('API install steps current');
} else {
  writeFileSync(file, JSON.stringify(data, null, raw.match(/^{\n( +)/)?.[1].length ?? 1) + '\n');
  console.log(`updated ${changed} API records`);
}
