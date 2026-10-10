import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import mutableFs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildIntegrationArtifacts, loadIntegrationCatalog, inspectIntegration, readIntegrationFile, planIntegration, installIntegration, verifyIntegrations } from '../lib/integrations.mjs';

async function fixture(t, frameworks = ['any']) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genlib-integrations-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'registry'), target = path.join(directory, 'app');
  const pack = path.join(root, 'integrations/sample-pack');
  await fs.mkdir(path.join(pack, 'src'), { recursive: true }); await fs.mkdir(target);
  await fs.writeFile(path.join(root, 'LICENSE'), 'Original Apache-2.0 fixture\n');
  await fs.writeFile(path.join(root, 'NOTICE'), 'Original fixture attribution\n');
  await fs.writeFile(path.join(pack, 'src/feature.mjs'), 'export const fixtureValue = "implementation-marker";\n');
  await fs.writeFile(path.join(pack, 'CONTRACT.md'), '# Sample\nConfigure adapters, then run tests.\n');
  await fs.writeFile(path.join(pack, 'package.json'), JSON.stringify({ type: 'module', scripts: { postinstall: 'touch SHOULD_NEVER_EXIST' } }));
  const manifest = { schemaVersion: 1, id: 'sample-pack', version: '0.1.0', license: 'Apache-2.0', title: 'Sample pack', summary: 'Copy a complete configurable feature.', languages: ['typescript'], frameworks, platforms: ['web'], resources: [], tags: ['fixture'], files: ['src/feature.mjs', 'CONTRACT.md', 'package.json'], entrypoints: ['src/feature.mjs'], verification: { level: 'experimental', commands: ['node --check src/feature.mjs'], notes: ['Fixture only.'] } };
  await fs.writeFile(path.join(pack, 'integration.json'), JSON.stringify(manifest));
  async function build() { for (const [file, bytes] of await buildIntegrationArtifacts(root)) { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), bytes); } return loadIntegrationCatalog(root); }
  const context = await build();
  return { root, target, pack, context, manifest, build };
}

test('integration inspection reads only contract; source reads require declared files', async t => {
  const { context } = await fixture(t);
  const info = await inspectIntegration(context, 'sample-pack');
  assert.match(info.contract, /Configure adapters/);
  assert.equal(JSON.stringify(info).includes('implementation-marker'), false);
  assert.match((await readIntegrationFile(context, 'sample-pack', 'src/feature.mjs')).content, /implementation-marker/);
  await assert.rejects(readIntegrationFile(context, 'sample-pack', '../../LICENSE'), { code: 'UNSAFE_PATH' });
  await assert.rejects(readIntegrationFile(context, 'sample-pack', 'secret.txt'), { code: 'NOT_FOUND' });
});

test('integration plans do not write; installation preserves source, attribution and exact baseline without hooks', async t => {
  const { context, target, pack } = await fixture(t);
  const plan = await planIntegration(context, 'sample-pack', { target });
  assert.equal(plan.writes, false); assert.equal(plan.conflicts.length, 0);
  assert.deepEqual(await fs.readdir(target), []);
  const installed = await installIntegration(context, 'sample-pack', { target });
  assert.equal(installed.status, 'installed'); assert.equal(installed.created, 6);
  const output = path.join(target, 'genlib/integrations/sample-pack');
  assert.deepEqual(await fs.readFile(path.join(output, 'src/feature.mjs')), await fs.readFile(path.join(pack, 'src/feature.mjs')));
  await assert.rejects(fs.stat(path.join(output, 'SHOULD_NEVER_EXIST')), { code: 'ENOENT' });
  const lock = await fs.readFile(path.join(target, '.genlib/integrations-lock.json'));
  assert.equal((await installIntegration(context, 'sample-pack', { target })).status, 'unchanged');
  assert.deepEqual(await fs.readFile(path.join(target, '.genlib/integrations-lock.json')), lock);
  assert.equal((await verifyIntegrations(target)).status, 'unchanged');
});

test('integration installation preserves edits and reports modified or missing files', async t => {
  const { context, target } = await fixture(t);
  await installIntegration(context, 'sample-pack', { target });
  const file = path.join(target, 'genlib/integrations/sample-pack/src/feature.mjs');
  await fs.writeFile(file, 'customized content');
  await fs.unlink(path.join(target, 'genlib/integrations/sample-pack/CONTRACT.md'));
  const checked = await verifyIntegrations(target);
  assert.equal(checked.status, 'drift');
  assert.ok(checked.files.some(item => item.status === 'modified'));
  assert.ok(checked.files.some(item => item.status === 'missing'));
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'INSTALL_CONFLICT' });
  assert.equal(await fs.readFile(file, 'utf8'), 'customized content');
});

test('failed integration commits preserve concurrent edits and remove only untouched new files', async t => {
  const { context, target } = await fixture(t);
  const output = path.join(target, 'genlib/integrations/sample-pack');
  const edited = path.join(output, 'src/feature.mjs');
  const rename = mutableFs.rename;
  t.mock.method(mutableFs, 'rename', async (from, to) => {
    if (to === path.join(target, '.genlib/integrations-lock.json')) {
      await fs.writeFile(edited, 'application formatter changed this file');
      throw Object.assign(new Error('Injected baseline commit failure'), { code: 'EIO' });
    }
    return rename(from, to);
  });
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'EIO' });
  assert.equal(await fs.readFile(edited, 'utf8'), 'application formatter changed this file');
  await assert.rejects(fs.stat(path.join(output, 'CONTRACT.md')), { code: 'ENOENT' });
  for (const file of ['install.lock', 'integrations-lock.json', 'staging']) {
    await assert.rejects(fs.stat(path.join(target, '.genlib', file)), { code: 'ENOENT' });
  }
});

test('untracked files, output escapes, symlinks and registry targets are refused without side effects', async t => {
  const { context, root, target } = await fixture(t);
  for (const out of ['../outside', 'node_modules/pack', 'src/.git', '/absolute', 'src\\bad']) await assert.rejects(planIntegration(context, 'sample-pack', { target, out }), { code: 'UNSAFE_PATH' });
  await assert.rejects(planIntegration(context, 'sample-pack', { target: root }), { code: 'INVALID_TARGET' });
  const outside = path.join(path.dirname(target), 'outside'); await fs.mkdir(outside);
  await fs.symlink(outside, path.join(target, 'genlib'), 'dir');
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'UNSAFE_PATH' });
  assert.deepEqual(await fs.readdir(outside), []);
  await fs.unlink(path.join(target, 'genlib'));
  const output = path.join(target, 'genlib/integrations/sample-pack'); await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'package.json'), 'user owned');
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'INSTALL_CONFLICT' });
  await assert.rejects(fs.stat(path.join(target, '.genlib')), { code: 'ENOENT' });
});

test('integrity checks reject drift in source, contract and manifest', async t => {
  for (const file of ['src/feature.mjs', 'CONTRACT.md', 'integration.json']) {
    const { context, pack, target } = await fixture(t);
    await fs.appendFile(path.join(pack, file), '\nchanged');
    await assert.rejects(planIntegration(context, 'sample-pack', { target }), { code: 'INTEGRITY_MISMATCH' });
    assert.deepEqual(await fs.readdir(target), []);
  }
});

test('source links, file collisions and omitted entrypoints cannot enter the integrity registry', async t => {
  const { pack, manifest, build } = await fixture(t);
  await fs.unlink(path.join(pack, 'src/feature.mjs'));
  await fs.symlink('../CONTRACT.md', path.join(pack, 'src/feature.mjs'));
  await assert.rejects(build(), { code: 'UNSAFE_PATH' });
  await fs.unlink(path.join(pack, 'src/feature.mjs')); await fs.writeFile(path.join(pack, 'src/feature.mjs'), 'source');
  manifest.files.push('src'); await fs.writeFile(path.join(pack, 'integration.json'), JSON.stringify(manifest));
  await assert.rejects(build(), { code: 'PATH_CONFLICT' });
});

test('React peer profiles are enforced and cannot be bypassed by allow-unverified', async t => {
  const { pack, manifest, target, build } = await fixture(t, ['react']);
  manifest.compatibility = { reactMajors: [18] };
  await fs.writeFile(path.join(pack, 'integration.json'), JSON.stringify(manifest));
  const context = await build();
  await fs.writeFile(path.join(target, 'package.json'), JSON.stringify({ dependencies: { react: '^19.3.0' } }));
  await assert.rejects(planIntegration(context, 'sample-pack', { target, allowUnverified: true }), { code: 'INCOMPATIBLE_TARGET' });
  await fs.writeFile(path.join(target, 'package.json'), JSON.stringify({ dependencies: { react: '^18.3.1' } }));
  assert.equal((await planIntegration(context, 'sample-pack', { target })).compatibility.status, 'compatible');
});

test('integration and module installers share a target write lock', async t => {
  const { context, target } = await fixture(t);
  await fs.mkdir(path.join(target, '.genlib'));
  await fs.writeFile(path.join(target, '.genlib/install.lock'), 'another installer');
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'INSTALL_BUSY' });
  assert.equal(await fs.readFile(path.join(target, '.genlib/install.lock'), 'utf8'), 'another installer');
  await assert.rejects(fs.stat(path.join(target, 'genlib')), { code: 'ENOENT' });
});
