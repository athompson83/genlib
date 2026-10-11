#!/usr/bin/env node
// Rewrites the install steps in resources/apis.json from each record's spec version and SDK (lib/api-install.mjs),
// and copies retirement notices from resources/api-lifecycle.json into each record's lifecycle field.
// --check exits non-zero when the stored steps differ from the derived ones.
import { readFileSync, writeFileSync } from 'node:fs';
import { apiSteps } from '../lib/api-install.mjs';
const file = new URL('../resources/apis.json', import.meta.url);
const raw = readFileSync(file, 'utf8');
const data = JSON.parse(raw);
const lifecycle = new Map(JSON.parse(readFileSync(new URL('../resources/api-lifecycle.json', import.meta.url), 'utf8')).groups
  .flatMap(({ ids, resourceIds, ...entry }) => ids.map(id => [id, entry])));
const unknown = [...lifecycle.keys()].filter(id => !data.apis.some(api => api.id === id));
if (unknown.length) throw new Error('api-lifecycle.json names unknown APIs: ' + unknown.join(', '));
let changed = 0;
for (const api of data.apis) {
  const life = lifecycle.get(api.id);
  const before = JSON.stringify(api);
  if (life) api.lifecycle = life; else delete api.lifecycle;
  const install = apiSteps(api).map(step => step.command);
  api.install = install;
  if (JSON.stringify(api) !== before) changed++;
}
if (process.argv.includes('--check')) {
  if (changed) { console.error(`${changed} API records have stale install steps; run node scripts/api-install.mjs`); process.exit(1); }
  console.log('API install steps current');
} else {
  writeFileSync(file, JSON.stringify(data, null, raw.match(/^{\n( +)/)?.[1].length ?? 1) + '\n');
  console.log(`updated ${changed} API records`);
}
