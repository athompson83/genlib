#!/usr/bin/env node
// Generates registry.json at the repository root in the shadcn registry format, so any TypeScript project can
// install Genlib's original recipes and modules with the shadcn CLI straight from GitHub:
//   npx shadcn@4.21.4 add athompson83/genlib/<item>
// Items are "registry:item" with explicit "~/genlib/..." file targets, which the shadcn CLI installs without
// components.json or framework detection. File contents are not inlined (the shadcn directory requires that),
// so the root file stays small and the CLI reads each file from the repository.
//   node scripts/build-shadcn-registry.mjs          write registry.json
//   node scripts/build-shadcn-registry.mjs --check  fail when registry.json is stale
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const json = path => JSON.parse(read(path));
const items = [];

// One-line description from the recipe's header comment ("// Genlib recipe: <what>. Original source...").
// Falls back to the first comment line that is not a license header.
function headerSummary(path) {
  const lines = read(path).split('\n').slice(0, 8);
  const recipe = lines.find(text => /Genlib recipe:/.test(text));
  if (recipe) return recipe.replace(/^.*Genlib recipe:\s*/, '').replace(/\s*Original source.*$/, '').replace(/\.$/, '').trim();
  const comment = lines.find(text => /^\s*(\/\/|\/\*\*?|\*)\s*\S/.test(text) && !/SPDX|@license|eslint|use client/i.test(text));
  return comment?.replace(/^\s*(\/\/|\/\*\*?|\*)\s*/, '').replace(/\s*\*\/\s*$/, '').replace(/\.$/, '').trim() || undefined;
}

for (const entry of json('resources/agent-recipes.json').entries) {
  if (!/\.(ts|tsx)$/.test(entry.path) || !existsSync(new URL(entry.path, root))) continue;
  const summary = headerSummary(entry.path) ?? entry.taskTerms.slice(0, 4).join(', ');
  items.push({
    name: entry.id,
    type: 'registry:item',
    title: entry.title ?? entry.id.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()),
    description: summary.slice(0, 300),
    files: [{ path: entry.path, type: 'registry:file', target: `~/genlib/${entry.path.split('/').pop()}` }],
    categories: ['genlib-recipe'],
    docs: `Genlib recipe (Apache-2.0, no dependencies). ${entry.caveat ? entry.caveat + ' ' : ''}Checks for your integration: ${entry.checks.join('; ')}.`,
    meta: { source: 'https://github.com/athompson83/genlib', kind: entry.kind },
  });
}

for (const name of readdirSync(new URL('modules/', root)).sort()) {
  const module = json(`modules/${name}/module.json`);
  const react = module.compatibility.frameworks.includes('react');
  items.push({
    name: module.id,
    type: 'registry:item',
    title: module.title,
    description: module.description.slice(0, 300),
    ...(react ? { dependencies: ['react'] } : {}),
    ...(module.dependencies.length ? { registryDependencies: module.dependencies.map(dep => dep.id) } : {}),
    files: module.files.map(file => ({ path: `modules/${module.id}/${file.source}`, type: 'registry:file', target: `~/genlib/${file.target}` })),
    categories: ['genlib-module', module.kind],
    docs: `Genlib module ${module.id}@${module.version} (Apache-2.0). Configure: ${module.configuration.join(' ')} Contract: https://github.com/athompson83/genlib/blob/main/modules/${module.id}/CONTRACT.md`,
    meta: { source: 'https://github.com/athompson83/genlib', version: module.version, verification: module.verification.level },
  });
}

const names = new Set();
for (const item of items) {
  if (names.has(item.name)) throw new Error('Duplicate registry item name: ' + item.name);
  names.add(item.name);
}
const targets = new Set();
for (const item of items) for (const file of item.files) {
  if (targets.has(file.target) && !item.categories.includes('genlib-module')) throw new Error('Two items write ' + file.target);
  targets.add(file.target);
}

const registry = {
  $schema: 'https://ui.shadcn.com/schema/registry.json',
  name: 'genlib',
  homepage: 'https://github.com/athompson83/genlib',
  items,
};
const text = JSON.stringify(registry, null, 1) + '\n';
if (process.argv.includes('--check')) {
  if (!existsSync(new URL('registry.json', root)) || read('registry.json') !== text) {
    console.error('registry.json is stale. Run node scripts/build-shadcn-registry.mjs');
    process.exit(1);
  }
  console.log(`shadcn registry current (${items.length} items)`);
} else {
  writeFileSync(new URL('registry.json', root), text);
  console.log(`wrote registry.json (${items.length} items)`);
}
