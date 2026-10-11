// SPDX-License-Identifier: Apache-2.0
// Provider profiles: offline prerequisite checks and conflict-free adoption of a scaffolder's staged output.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { REPOSITORY_ROOT } from '../lib/catalog.mjs';
import { adoptStaged, checkProvider, compareVersions, loadProviders, planStaged, validateProvider } from '../lib/providers.mjs';
import { checkAdoption } from '../lib/lifecycle.mjs';
import { relativePath } from '../lib/safety.mjs';

const CLI = path.join(REPOSITORY_ROOT, 'bin/genlib.mjs');
const kanban = loadProviders(REPOSITORY_ROOT).find(profile => profile.id === 'btst-kanban');

async function tmp(t, prefix) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
async function write(root, relative, content) {
  await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await fs.writeFile(path.join(root, relative), content);
}
async function nextApp(t, deps = {}) {
  const app = await tmp(t, 'genlib-provider-app-');
  await write(app, 'package.json', JSON.stringify({ name: 'app', dependencies: { next: '15.3.0', react: '19.2.7', 'react-dom': '19.2.7', tailwindcss: '^4.3.2', ...deps } }));
  await write(app, 'components.json', JSON.stringify({ tailwind: { cssVariables: true } }));
  await write(app, 'app/layout.tsx', 'export default function Layout({ children }) { return children }\n');
  await write(app, 'app/globals.css', '@import "tailwindcss";\n');
  return app;
}

test('the committed profiles validate, and the validator refuses unpinned or malformed steps', () => {
  assert.ok(kanban, 'btst-kanban profile present');
  assert.equal(kanban.status, 'planned', 'not credited beyond planned until run end to end');
  const bad = structuredClone(kanban);
  bad.steps[0].run = 'npx @btst/codegen@latest init';
  assert.throws(() => validateProvider(bad), /pinned command/);
  const twoKinds = structuredClone(kanban);
  twoKinds.prerequisites[0] = { id: 'x', text: 'x', node: '22.0.0', path: 'app' };
  assert.throws(() => validateProvider(twoKinds), /exactly one of/);
  const escape = structuredClone(kanban);
  escape.stage.mergeFiles = ['../outside.css'];
  assert.throws(() => validateProvider(escape), { code: 'UNSAFE_PATH' });
  assert.ok(compareVersions('19.2.10', '19.2.6') > 0 && compareVersions('5.102.0', '5.104.1') < 0 && compareVersions('1.0.0', '1.0.0') === 0);
});

test('prerequisites: versions from node_modules win over declared ranges; mismatches, conflicts and missing settings fail', async t => {
  const ready = await nextApp(t);
  const ok = await checkProvider(kanban, ready, { nodeVersion: '22.22.0' });
  assert.equal(ok.ready, true);
  assert.deepEqual(ok.warnings, ['sonner']);

  const old = await nextApp(t, { react: '^18.3.1', '@tanstack/react-query': '5.104.1', 'better-auth': '1.7.7' });
  await write(old, 'lib/stack.ts', 'export {}\n');
  await fs.rm(path.join(old, 'components.json'));
  const result = await checkProvider(kanban, old, { nodeVersion: '20.11.0' });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blocking.sort(), ['better-auth', 'free-paths', 'node', 'react', 'react-query', 'shadcn-css-variables']);
  assert.match(result.results.find(item => item.id === 'free-paths').found, /lib\/stack.ts/);

  // A declared range is the floor; the installed package.json is the truth.
  const installed = await nextApp(t, { react: '^19.0.0' });
  assert.equal((await checkProvider(kanban, installed)).results.find(item => item.id === 'react').ok, false, '^19.0.0 allows 19.0.0');
  await write(installed, 'node_modules/react/package.json', JSON.stringify({ name: 'react', version: '19.2.7' }));
  assert.match((await checkProvider(kanban, installed)).results.find(item => item.id === 'react').found, /19.2.7 \(installed\)/);
});

test('Next.js route segments are valid paths; traversal still is not', () => {
  for (const ok of ['app/api/data/[[...all]]/route.ts', 'app/(request)/pages/[[...all]]/page.tsx', 'src/routes/+page.svelte']) assert.equal(relativePath(ok), ok);
  for (const bad of ['../x', 'a/../b', 'a/./b', '.git/config', 'a/con', 'a\\b', 'a/b.', '/etc/passwd']) assert.throws(() => relativePath(bad), { code: 'UNSAFE_PATH' }, bad);
});

test('staged output: only generator changes are adopted, merges are reported, conflicts and symlinks stop it', async t => {
  const app = await nextApp(t);
  const baseline = await tmp(t, 'genlib-baseline-');
  const staged = await tmp(t, 'genlib-staged-');
  await fs.cp(app, baseline, { recursive: true });
  await fs.cp(app, staged, { recursive: true });
  // What a scaffolder writes into the scratch copy:
  await write(staged, 'app/api/data/[[...all]]/route.ts', 'export const GET = () => new Response()\n');
  await write(staged, 'app/(request)/pages/[[...all]]/page.tsx', 'export default function Page() { return null }\n');
  await write(staged, 'lib/stack.ts', 'export const stack = {}\n');
  await write(staged, 'app/globals.css', '@import "tailwindcss";\n@import "@btst/stack/plugins/kanban/css";\n');

  await assert.rejects(planStaged(kanban, app, app), /scratch copy/);
  const plan = await planStaged(kanban, staged, app, { baseline });
  assert.deepEqual(plan.files.map(file => [file.path, file.action]).sort(), [
    ['app/(request)/pages/[[...all]]/page.tsx', 'create'], ['app/api/data/[[...all]]/route.ts', 'create'], ['app/globals.css', 'merge'], ['lib/stack.ts', 'create'],
  ]);
  assert.deepEqual(plan.merges, ['app/globals.css']);

  // A differing file outside the merge list is a conflict, and nothing is written.
  await write(app, 'lib/stack.ts', 'export const mine = true\n');
  const blocked = await planStaged(kanban, staged, app, { baseline });
  assert.deepEqual(blocked.conflicts, ['lib/stack.ts']);
  await assert.rejects(adoptStaged(kanban, staged, app, { baseline }), { code: 'INSTALL_CONFLICT' });
  assert.equal(await fs.stat(path.join(app, 'app/api/data/[[...all]]/route.ts')).catch(() => null), null);
  await fs.rm(path.join(app, 'lib/stack.ts'));

  const adopted = await adoptStaged(kanban, staged, app, { baseline });
  assert.equal(adopted.created, 3);
  assert.equal(await fs.readFile(path.join(app, 'app/globals.css'), 'utf8'), '@import "tailwindcss";\n', 'merge files are never written');
  assert.match(adopted.next[0], /Merge app\/globals.css/);
  assert.match(adopted.next.at(-1), /--accepts kanban-board#boards,/);
  const lock = JSON.parse(await fs.readFile(path.join(app, '.genlib/providers-lock.json'), 'utf8'));
  assert.deepEqual(lock.artifacts['provider--btst-kanban'].files.sort(), ['app/(request)/pages/[[...all]]/page.tsx', 'app/api/data/[[...all]]/route.ts', 'lib/stack.ts']);
  assert.equal((await checkAdoption(app, 'provider--btst-kanban')).status, 'used', 'adopted route files are used by file-system routing');

  await fs.symlink('/etc/passwd', path.join(staged, 'app/evil.ts'));
  await assert.rejects(planStaged(kanban, staged, app, { baseline }), /symlink/);
});

test('CLI: provider check exits 1 when not ready; list and inspect work; find reaches the provider', async t => {
  const list = JSON.parse(execFileSync(process.execPath, [CLI, 'provider', 'list', '--json'], { encoding: 'utf8' }));
  assert.ok(list.providers.some(item => item.id === 'btst-kanban'));
  const app = await nextApp(t, { react: '18.3.1' });
  assert.throws(() => execFileSync(process.execPath, [CLI, 'provider', 'check', 'btst-kanban', '--target', app], { stdio: 'pipe' }), error => /FAIL react/.test(error.stdout.toString()));
  const found = JSON.parse(execFileSync(process.execPath, [CLI, 'find', 'kanban', 'board', 'with', 'columns', '--json', '--brief', '--limit', '3'], { encoding: 'utf8' }));
  assert.equal(found.results[0].type + ':' + found.results[0].id, 'provider:btst-kanban');
});

test('fixes from the end-to-end run: next.config flags, own adopted paths, route usage and provider acceptance', async t => {
  const { acceptanceProblems, loadContracts } = await import('../lib/coverage.mjs');
  const app = await nextApp(t);
  await write(app, 'next.config.ts', 'const config = { cacheComponents: true, partialPrefetching: true }\nexport default config\n');
  const flagged = await checkProvider(kanban, app, { nodeVersion: '22.22.0' });
  assert.deepEqual(flagged.blocking, ['next-cache-components']);
  await write(app, 'next.config.ts', 'const config = { cacheComponents: false, partialPrefetching: false }\nexport default config\n');
  assert.equal((await checkProvider(kanban, app, { nodeVersion: '22.22.0' })).ready, true);

  // Adopt route files from a staged copy; check then treats them as the provider's own, and adopted counts them as used.
  const baseline = await tmp(t, 'genlib-baseline-');
  const staged = await tmp(t, 'genlib-staged-');
  await fs.cp(app, baseline, { recursive: true });
  await fs.cp(app, staged, { recursive: true });
  await write(staged, 'app/(request)/pages/[[...all]]/page.tsx', 'export default function Page() { return null }\n');
  await write(staged, 'app/sitemap.ts', 'export default function sitemap() { return [] }\n');
  await write(staged, 'lib/stack.ts', 'export const stack = {}\n');
  await adoptStaged(kanban, staged, app, { baseline });
  assert.equal((await checkProvider(kanban, app, { nodeVersion: '22.22.0' })).results.find(item => item.id === 'free-paths').ok, true, 'own adopted paths are not a conflict');
  const adoption = await checkAdoption(app, 'provider--btst-kanban', { test: 'node -e 0', accepts: ['kanban-board#routes-ui'] });
  assert.equal(adoption.status, 'verified', 'route files are used by file-system routing');
  assert.deepEqual(adoption.usedBy.map(use => use.match).sort(), ['route', 'route']);
  assert.deepEqual(adoption.accepted, ['kanban-board#routes-ui']);

  // Contract checks map provider--<id> receipts to provider:<id> refs.
  const contracts = loadContracts(REPOSITORY_ROOT);
  assert.deepEqual(acceptanceProblems(contracts, 'provider--btst-kanban', ['kanban-board#boards']), []);
  assert.match(acceptanceProblems(contracts, 'provider--btst-kanban', ['rbac#route-guard']).join(), /provider:btst-kanban does not claim/);
  const coverage = JSON.parse(execFileSync(process.execPath, [CLI, 'coverage', 'kanban board with columns and tasks', '--target', app, '--json'], { encoding: 'utf8' }));
  assert.equal(coverage.requirements.find(item => item.id === 'routes-ui').status, 'application-verified');
});
