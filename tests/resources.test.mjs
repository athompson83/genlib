import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadResources, quickstartFor, searchResources, validateResource } from '../lib/resources.mjs';

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

test('domain catalogs load from resources/catalog with project types and package identities', async () => {
  const { items, catalogs } = await loadResources();
  assert.ok(catalogs.some(entry => entry.path === 'resources/ui-foundations.json'));
  const original = items[0];
  assert.doesNotThrow(() => validateResource({ ...original, projectTypes: ['web-app'], packages: [{ ecosystem: 'npm', name: 'zod' }] }));
  assert.throws(() => validateResource({ ...original, projectTypes: [] }));
  assert.throws(() => validateResource({ ...original, projectTypes: ['Not An Id'] }));
  assert.throws(() => validateResource({ ...original, packages: [{ ecosystem: 'curl-pipe-sh', name: 'x' }] }));
  assert.throws(() => validateResource({ ...original, packages: [{ ecosystem: 'npm', name: '' }] }));
  const tagged = items.filter(item => item.projectTypes);
  for (const type of new Set(tagged.flatMap(item => item.projectTypes))) {
    const result = searchResources(items, '', { project: type, limit: 50 });
    assert.ok(result.length > 0 && result.every(item => item.projectTypes.includes(type)), type);
  }
});

test('the types command lists every Genisys project type with resource counts', () => {
  const result = spawnSync(process.execPath, ['tools/resources.mjs', 'types', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const { types } = JSON.parse(result.stdout);
  assert.ok(types.length >= 20);
  assert.ok(types.every(type => typeof type.resources === 'number' && type.summary.length > 0));
  assert.ok(types.some(type => type.id === 'ai-agent'));
});

test('every resource exposes a shortest-path quickstart, authored or derived from its packages', async () => {
  const { items } = await loadResources();
  for (const item of items) {
    const steps = quickstartFor(item);
    assert.ok(Array.isArray(steps) && steps.length > 0 && steps.every(step => typeof step === 'string' && step.length > 0), item.id);
  }
  const base = items[0];
  assert.deepEqual(quickstartFor({ ...base, quickstart: undefined, packages: [{ ecosystem: 'npm', name: 'zod' }, { ecosystem: 'pypi', name: 'httpx' }], docs: 'https://zod.dev' }),
    ['npm install zod', 'pip install httpx', 'Docs: https://zod.dev']);
  assert.deepEqual(quickstartFor({ ...base, quickstart: ['npx shadcn@4.21.4 add button'] }), ['npx shadcn@4.21.4 add button']);
  assert.match(quickstartFor({ ...base, quickstart: undefined, packages: undefined, integrationMode: 'service', docs: 'https://example.com/docs' })[0], /^Sign up/);
  assert.throws(() => validateResource({ ...base, quickstart: [] }));
  assert.throws(() => validateResource({ ...base, quickstart: ['x'.repeat(301)] }));
  assert.ok(searchResources(items, 'button', { limit: 3 }).every(item => item.quickstart.length > 0));
  const shadcn = items.find(item => item.id === 'shadcn-ui');
  assert.ok(quickstartFor(shadcn).some(step => step.startsWith('npx shadcn@4.21.4 add')));
});

test('the pin gate covers go installs, suffixed image tags and the attachment map', async () => {
  const { readFileSync } = await import('node:fs');
  const script = readFileSync(new URL('../scripts/pin-quickstarts.mjs', import.meta.url), 'utf8');
  assert.match(script, /go \(\?:install\|get\|run\)/);
  assert.match(script, /latest\(\?:-\[\\w\.\]\+\)\?/);
  const attachments = readFileSync(new URL('../resources/attachments.json', import.meta.url), 'utf8');
  assert.doesNotMatch(attachments, /@latest\b/);
  const { spawnSync } = await import('node:child_process');
  const check = spawnSync(process.execPath, [new URL('../scripts/pin-quickstarts.mjs', import.meta.url).pathname, '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stdout + check.stderr);
});
