// SPDX-License-Identifier: Apache-2.0
// registry.json lets any TypeScript project install Genlib recipes and modules with the shadcn CLI
// (npx shadcn@4.21.4 add athompson83/genlib/<item>). These checks keep it current and installable.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const registry = JSON.parse(readFileSync(new URL('registry.json', root), 'utf8'));

test('registry.json is current', () => {
  const run = spawnSync(process.execPath, [new URL('scripts/build-shadcn-registry.mjs', root).pathname, '--check'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});

test('installable recipe metadata retains authored delivery titles and caveats', () => {
  const recipes = JSON.parse(readFileSync(new URL('resources/agent-recipes.json', root), 'utf8')).entries;
  for (const recipe of recipes.filter(entry => entry.caveat)) {
    const item = registry.items.find(entry => entry.name === recipe.id);
    assert.equal(item.title, recipe.title);
    assert.ok(item.docs.includes(recipe.caveat), recipe.id);
  }
});

test('every item is a universal registry:item whose files exist and target ~/genlib/', () => {
  assert.equal(registry.$schema, 'https://ui.shadcn.com/schema/registry.json');
  assert.equal(registry.name, 'genlib');
  assert.ok(registry.homepage.startsWith('https://'));
  const names = new Set();
  for (const item of registry.items) {
    assert.match(item.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!names.has(item.name), item.name);
    names.add(item.name);
    assert.equal(item.type, 'registry:item', item.name);
    assert.ok(item.description.length > 10, item.name);
    for (const file of item.files) {
      // No inlined content (the shadcn directory requires that); the CLI reads the file from the repository.
      assert.equal(file.content, undefined);
      assert.equal(file.type, 'registry:file');
      assert.match(file.target, /^~\/genlib\/[\w./-]+\.(ts|tsx|css|sql)$/, item.name);
      assert.ok(existsSync(new URL(file.path, root)), file.path);
    }
    for (const dependency of item.registryDependencies ?? []) assert.ok(registry.items.some(other => other.name === dependency), dependency);
  }
  // Every module is installable this way.
  for (const name of readdirSync(new URL('modules/', root))) assert.ok(names.has(name), name);
});
