#!/usr/bin/env node
import { loadSources } from '../lib/discover.mjs';
import { invariant } from '../lib/safety.mjs';

invariant(process.argv.length === 2, 'INVALID_OPTION', 'Usage: node scripts/check-integration-bindings.mjs');
const sources = await loadSources();
const resources = new Map(sources.resources.map(item => [item.id, item]));
const packs = new Map(sources.integrations.map(item => [item.id, item]));
for (const pack of packs.values()) {
  for (const id of pack.resources) {
    const item = resources.get(id);
    invariant(item, 'INVALID_BINDING', `${pack.id} refers to unknown resource ${id}.`);
    invariant(item.genlib.integrations?.includes(pack.id), 'INVALID_BINDING', `${pack.id} has no reverse resource binding on ${id}.`);
    invariant(['recipe-available', 'integration-verified'].includes(item.readiness?.level), 'INVALID_BINDING', `${id} must expose its available integration recipe.`);
  }
}
for (const item of resources.values()) {
  for (const id of item.genlib.integrations ?? []) {
    invariant(packs.has(id) && packs.get(id).resources.includes(item.id), 'INVALID_BINDING', `${item.id} has an unresolved or one-sided integration binding: ${id}.`);
  }
  if (item.genlib.module) invariant(sources.manifests.has(item.genlib.module), 'INVALID_BINDING', `${item.id} refers to an unregistered module.`);
}
process.stdout.write(JSON.stringify({ valid: true, integrations: packs.size, resources: resources.size, bindings: [...packs.values()].reduce((n, item) => n + item.resources.length, 0) }) + '\n');
