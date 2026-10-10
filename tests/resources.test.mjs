import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadResources, searchResources, validateResource } from '../lib/resources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('every attachment has catalog entries and executable bindings resolve', async () => {
  const { items } = await loadResources();
  const images = new Set(items.flatMap(item => item.attachments));
  for (const name of ['0777', '0914', '0915', '0916', '0921', '0922', '0923', '0924', '0925', '0926']) {
    assert.ok(images.has('IMG_' + name + '.jpeg'));
  }
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  assert.ok(items.some(item => item.genlib.module === 'common-api-clients'));
});

test('source discovery filters, bounds context and keeps restrictions visible', async () => {
  const { items } = await loadResources();
  const result = searchResources(items, 'dropdown', { platform: 'web', mode: 'package', limit: 3 });
  assert.ok(result.length > 0 && result.length <= 3);
  assert.ok(result.every(item => item.integrationMode === 'package' && item.platforms.includes('web')));
  assert.ok(result.every(item => item.license.scope.length > 0));
  assert.equal(searchResources(items, 'zzzzzznomatchingresourceterm').length, 0);
  assert.throws(() => searchResources(items, '', { limit: 0 }));
  assert.throws(() => searchResources(items, '', { mode: 'auto-install' }));
  const echo = items.find(item => item.id === 'echo-music');
  assert.ok(echo);
  assert.equal(echo.integrationMode, 'license-review');
});

test('resource records reject unsafe URLs, guide paths and unresolved code selection', async () => {
  const { items } = await loadResources();
  const original = items[0];
  assert.throws(() => validateResource({ ...original, homepage: 'javascript:alert(1)' }));
  assert.throws(() => validateResource({ ...original, repository: 'https://user:secret@example.com' }));
  assert.throws(() => validateResource({ ...original, genlib: { module: null, guide: '../outside.md' } }));
  assert.throws(() => validateResource({ ...original, verification: 'unresolved', integrationMode: 'package' }));
  for (const module of [undefined, false, 0, true, 1, 'a'.repeat(101), '../escape']) {
    assert.throws(() => validateResource({ ...original, genlib: { ...original.genlib, module } }));
  }
});

test('resource CLI is usable without dependencies and rejects ambiguous flags', () => {
  const run = (...args) => spawnSync(process.execPath, ['tools/resources.mjs', ...args], { cwd: root, encoding: 'utf8' });
  const valid = run('search', 'icons', '--platform', 'web', '--limit', '2', '--json');
  assert.equal(valid.status, 0, valid.stderr);
  assert.ok(JSON.parse(valid.stdout).items.length <= 2);
  for (const args of [['search', 'icons', '--limit', '2x'], ['inspect', 'lucide', '--mode', 'package'],
    ['search', '--json', '--json'], ['validate', 'unexpected'], ['inspect', 'not-a-resource']]) {
    assert.notEqual(run(...args).status, 0);
  }
});
