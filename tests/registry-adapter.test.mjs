// SPDX-License-Identifier: Apache-2.0
// shadcn-format registry items adopted through Genlib's plan, lock, receipt and drift checks (offline: fetch is injected).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { addRegistry, itemUrl, planRegistry, removeRegistry, resolveItems, rewriteImports, updateRegistry, verifyRegistry } from '../lib/registry-adapter.mjs';
import { checkAdoption } from '../lib/lifecycle.mjs';

const BASE = 'https://registry.example/r/';
const items = {
  utils: { name: 'utils', type: 'registry:lib', dependencies: ['cn'], files: [{ path: 'registry/x/lib/utils.ts', type: 'registry:lib', content: 'export { cn } from "cn"\n' }] },
  button: { name: 'button', type: 'registry:ui', dependencies: ['radix-ui'], registryDependencies: ['utils'], files: [{ path: 'registry/x/ui/button.tsx', type: 'registry:ui', content: 'import { cva } from "class-variance-authority"\nimport { cn } from "@/registry/x/lib/utils"\nexport const Button = () => cn(cva(""))\n' }] },
  'login-01': { name: 'login-01', type: 'registry:block', registryDependencies: ['button'], cssVars: { light: { brand: '1' } }, envVars: { AUTH_URL: '' },
    files: [
      { path: 'registry/x/blocks/login-01/page.tsx', type: 'registry:page', target: 'app/login/page.tsx', content: 'import { LoginForm } from "@/registry/x/blocks/login-01/components/login-form"\nexport default LoginForm\n' },
      { path: 'registry/x/blocks/login-01/components/login-form.tsx', type: 'registry:component', content: 'import { Button } from "@/registry/x/ui/button"\nexport const LoginForm = Button\n' },
    ] },
  'loop-a': { name: 'loop-a', type: 'registry:ui', registryDependencies: ['loop-b'], files: [{ path: 'a.tsx', type: 'registry:ui', content: '' }] },
  'loop-b': { name: 'loop-b', type: 'registry:ui', registryDependencies: ['loop-a'], files: [{ path: 'b.tsx', type: 'registry:ui', content: '' }] },
  escape: { name: 'escape', type: 'registry:file', files: [{ path: 'x', type: 'registry:file', target: '../outside.ts', content: 'x' }] },
};
const bodies = Object.fromEntries(Object.entries(items).map(([name, item]) => [`${BASE}${name}.json`, Buffer.from(JSON.stringify(item))]));
const fetched = [];
const fakeFetch = async url => {
  fetched.push(url);
  const body = bodies[url];
  return { ok: Boolean(body), status: body ? 200 : 404, url, arrayBuffer: async () => body ?? Buffer.alloc(0) };
};
const resolve = (name, options = {}) => resolveItems(`${BASE}${name}.json`, { fetch: fakeFetch, ...options });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function app(t, { src = true, components } = {}) {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'genlib-registry-'));
  t.after(() => fs.rm(target, { recursive: true, force: true }));
  await fs.writeFile(path.join(target, 'package.json'), JSON.stringify({ name: 'app', dependencies: { react: '19.0.0', cn: '0.4.0' } }));
  if (src) {
    await fs.mkdir(path.join(target, 'src'));
    await fs.writeFile(path.join(target, 'tsconfig.json'), JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }));
  }
  if (components) await fs.writeFile(path.join(target, 'components.json'), JSON.stringify(components));
  return target;
}

test('resolution: dependencies first, https only, cycles, pinned digests and unsafe targets', async () => {
  assert.equal(itemUrl('shadcn:button'), 'https://ui.shadcn.com/r/styles/new-york-v4/button.json');
  assert.equal(itemUrl('shadcn:card', { style: 'new-york' }), 'https://ui.shadcn.com/r/styles/new-york/card.json');
  assert.throws(() => itemUrl('http://insecure.example/item.json'), /shadcn:<name> or an https/);
  const resolved = await resolve('login-01');
  assert.deepEqual(resolved.items.map(entry => entry.item.name), ['utils', 'button', 'login-01']);
  assert.equal(resolved.items[2].sha256, sha(bodies[`${BASE}login-01.json`]));
  await assert.rejects(resolve('loop-a'), /cycle/);
  await assert.rejects(resolve('missing'), /HTTP 404/);
  await assert.rejects(resolve('login-01', { sha256: 'a'.repeat(64) }), { code: 'INTEGRITY_MISMATCH' });
  await resolve('login-01', { sha256: sha(bodies[`${BASE}login-01.json`]) });
  const redirected = async url => ({ ok: true, status: 200, url: 'http://evil.example/x.json', arrayBuffer: async () => bodies[`${BASE}utils.json`] });
  await assert.rejects(resolveItems(`${BASE}utils.json`, { fetch: redirected }), /away from https/);
  const huge = async url => ({ ok: true, status: 200, url, arrayBuffer: async () => Buffer.alloc(2 * 1024 * 1024, 32) });
  await assert.rejects(resolveItems(`${BASE}utils.json`, { fetch: huge }), { code: 'ITEM_TOO_LARGE' });
  assert.equal(rewriteImports('import { x } from "@/registry/new-york-v4/ui/button"', { ui: '@/ui' }), 'import { x } from "@/ui/button"');
});

test('plan maps files to the app aliases, rewrites imports and reports dependencies, CSS and env vars', async t => {
  const target = await app(t);
  await assert.rejects(async () => planRegistry(target, await resolve('escape')), { code: 'UNSAFE_PATH' });
  const plan = await planRegistry(target, await resolve('login-01'));
  assert.deepEqual(plan.files.map(file => [file.path, file.action]), [
    ['src/lib/utils.ts', 'create'], ['src/components/ui/button.tsx', 'create'], ['app/login/page.tsx', 'create'], ['src/components/login-form.tsx', 'create'],
  ]);
  assert.deepEqual(plan.install, ['npm install radix-ui class-variance-authority'], 'cn is already declared; the undeclared import is added');
  assert.deepEqual(plan.undeclaredImports, ['class-variance-authority']);
  assert.match(plan.manual.join(' '), /cssVars\/css of login-01/);
  assert.match(plan.manual.join(' '), /AUTH_URL/);
  // components.json aliases win over the defaults.
  const custom = await app(t, { components: { aliases: { ui: '@/design/primitives', components: '@/components', lib: '@/lib', hooks: '@/hooks' } } });
  const customPlan = await planRegistry(custom, await resolve('button'));
  assert.equal(customPlan.files.find(file => file.item === 'button').path, 'src/design/primitives/button.tsx');
  // No src/ and no tsconfig: root-level directories.
  const flat = await app(t, { src: false });
  assert.equal((await planRegistry(flat, await resolve('utils'))).files[0].path, 'lib/utils.ts');
});

test('add writes only conflict-free plans, records ownership, receipts and originals; re-adding keeps history', async t => {
  const target = await app(t);
  await fs.mkdir(path.join(target, 'src/lib'), { recursive: true });
  await fs.writeFile(path.join(target, 'src/lib/utils.ts'), 'export const cn = () => "mine"\n');
  const resolved = await resolve('login-01');
  const conflicted = await planRegistry(target, resolved);
  assert.deepEqual(conflicted.conflicts, ['src/lib/utils.ts']);
  await assert.rejects(addRegistry(target, resolved), { code: 'INSTALL_CONFLICT' });
  assert.equal(await fs.stat(path.join(target, 'src/components/ui/button.tsx')).catch(() => null), null, 'nothing written on conflict');

  const added = await addRegistry(target, resolved, { keepExisting: true });
  assert.equal(added.created, 3);
  assert.equal(await fs.readFile(path.join(target, 'src/lib/utils.ts'), 'utf8'), 'export const cn = () => "mine"\n', 'kept the app file');
  const form = await fs.readFile(path.join(target, 'src/components/login-form.tsx'), 'utf8');
  assert.match(form, /from "@\/components\/ui\/button"/);
  const lock = JSON.parse(await fs.readFile(path.join(target, '.genlib/providers-lock.json'), 'utf8'));
  assert.deepEqual(Object.keys(lock.artifacts).sort(), ['shadcn--button', 'shadcn--login-01', 'shadcn--utils']);
  assert.deepEqual(lock.artifacts['shadcn--utils'].files, [], 'a kept app file is not owned');
  assert.ok(await fs.stat(path.join(target, '.genlib/providers/shadcn--login-01.json')));

  // Registry files importing each other are not application use; an app import is.
  assert.equal((await checkAdoption(target, 'shadcn--button')).status, 'copied');
  await fs.mkdir(path.join(target, 'src/routes'), { recursive: true });
  await fs.writeFile(path.join(target, 'src/routes/home.tsx'), 'import { Button } from "@/components/ui/button"\nexport default Button\n');
  const used = await checkAdoption(target, 'shadcn--button', { test: 'node -e 0' });
  assert.equal(used.status, 'verified');
  const again = await addRegistry(target, resolved, { keepExisting: true });
  assert.equal(again.created, 0);
  const receipt = JSON.parse(await fs.readFile(path.join(target, '.genlib/receipts/shadcn--button.json'), 'utf8'));
  assert.equal(receipt.outcomes.verified, true, 're-adding identical items keeps the adoption history');
});

test('verify reports drift; remove keeps edited files and refuses while a dependent is installed', async t => {
  const target = await app(t);
  await addRegistry(target, await resolve('login-01'));
  assert.equal((await verifyRegistry(target)).status, 'ok');
  await fs.appendFile(path.join(target, 'src/components/ui/button.tsx'), '// local edit\n');
  const drift = await verifyRegistry(target);
  assert.deepEqual(drift.drift, ['src/components/ui/button.tsx']);
  await assert.rejects(removeRegistry(target, 'shadcn--button'), { code: 'IN_USE' });
  const block = await removeRegistry(target, 'shadcn--login-01');
  assert.deepEqual(block.files.map(file => file.action), ['delete', 'delete']);
  const button = await removeRegistry(target, 'shadcn--button', { dryRun: true });
  assert.deepEqual(button.kept, ['src/components/ui/button.tsx']);
  await removeRegistry(target, 'shadcn--button');
  assert.ok(await fs.stat(path.join(target, 'src/components/ui/button.tsx')), 'edited file kept');
  await assert.rejects(removeRegistry(target, 'shadcn--button'), { code: 'NOT_INSTALLED' });
});

test('update merges the registry\'s new version onto local edits, replaces unedited files and reports conflicts', async t => {
  const target = await app(t);
  const v1 = { name: 'widget', type: 'registry:ui', files: [
    { path: 'registry/x/ui/widget.tsx', type: 'registry:ui', content: 'line 1\nline 2\nline 3\nline 4\nline 5\n' },
    { path: 'registry/x/ui/widget-icon.tsx', type: 'registry:ui', content: 'icon v1\n' },
    { path: 'registry/x/ui/widget-old.tsx', type: 'registry:ui', content: 'old\n' },
  ] };
  let current = Buffer.from(JSON.stringify(v1));
  const url = `${BASE}widget.json`;
  const serve = async requested => ({ ok: requested === url, status: 200, url: requested, arrayBuffer: async () => current });
  await addRegistry(target, await resolveItems(url, { fetch: serve }));
  assert.equal((await updateRegistry(target, 'shadcn--widget', { fetch: serve })).status, 'up-to-date');

  // The app edits line 1; upstream changes line 5, the icon, drops widget-old and adds widget-new.
  const widget = path.join(target, 'src/components/ui/widget.tsx');
  await fs.writeFile(widget, 'line 1 (ours)\nline 2\nline 3\nline 4\nline 5\n');
  current = Buffer.from(JSON.stringify({ ...v1, files: [
    { ...v1.files[0], content: 'line 1\nline 2\nline 3\nline 4\nline 5 (upstream)\n' },
    { ...v1.files[1], content: 'icon v2\n' },
    { path: 'registry/x/ui/widget-new.tsx', type: 'registry:ui', content: 'new\n' },
  ] }));
  const dry = await updateRegistry(target, 'shadcn--widget', { fetch: serve });
  assert.deepEqual(dry.files.map(file => [path.basename(file.path), file.action]), [['widget.tsx', 'merged'], ['widget-icon.tsx', 'replace'], ['widget-new.tsx', 'create'], ['widget-old.tsx', 'delete']]);
  assert.equal(await fs.readFile(widget, 'utf8'), 'line 1 (ours)\nline 2\nline 3\nline 4\nline 5\n', 'dry run writes nothing');
  const applied = await updateRegistry(target, 'shadcn--widget', { fetch: serve, write: true });
  assert.deepEqual(applied.conflicts, []);
  assert.equal(await fs.readFile(widget, 'utf8'), 'line 1 (ours)\nline 2\nline 3\nline 4\nline 5 (upstream)\n');
  assert.equal(await fs.readFile(path.join(target, 'src/components/ui/widget-icon.tsx'), 'utf8'), 'icon v2\n');
  assert.equal(await fs.stat(path.join(target, 'src/components/ui/widget-old.tsx')).catch(() => null), null);
  assert.equal((await updateRegistry(target, 'shadcn--widget', { fetch: serve })).status, 'up-to-date');

  // Both sides change the same line: a conflict file, the app's copy untouched.
  await fs.writeFile(widget, 'line 1 (ours)\nline 2\nline 3\nline 4\nline 5 (ours too)\n');
  current = Buffer.from(JSON.stringify({ ...v1, files: [{ ...v1.files[0], content: 'line 1\nline 2\nline 3\nline 4\nline 5 (upstream again)\n' }] }));
  const clash = await updateRegistry(target, 'shadcn--widget', { fetch: serve, write: true });
  assert.deepEqual(clash.conflicts, ['src/components/ui/widget.tsx']);
  assert.equal(await fs.readFile(widget, 'utf8'), 'line 1 (ours)\nline 2\nline 3\nline 4\nline 5 (ours too)\n');
  assert.match(await fs.readFile(widget + '.genlib-conflict', 'utf8'), /<<<<<<< your edits[\s\S]*>>>>>>> registry version/);
});
