import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import mutableFs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
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

test('failed commits retain every published file, including a save in the former hash-read/unlink window', async t => {
  const { context, target } = await fixture(t);
  const output = path.join(target, 'genlib/integrations/sample-pack');
  const edited = path.join(output, 'src/feature.mjs');
  const planned = await planIntegration(context, 'sample-pack', { target });
  const publishedPaths = new Set(planned.files.map(file => path.join(target, file.path)));
  const unlinkedPublished = [];
  const rename = mutableFs.rename;
  const unlink = mutableFs.unlink;
  let commitFailed = false, editorSaved = false;
  t.mock.method(mutableFs, 'rename', async (from, to) => {
    if (to === path.join(target, '.genlib/integrations-lock.json')) {
      commitFailed = true;
      throw Object.assign(new Error('Injected baseline commit failure'), { code: 'EIO' });
    }
    return rename(from, to);
  });
  t.mock.method(mutableFs, 'unlink', async filename => {
    if (publishedPaths.has(filename)) unlinkedPublished.push(filename);
    // The old implementation saves immediately after its hash read and before
    // its destructive unlink. The new implementation reaches only private
    // cleanup, where the same ordinary editor save must remain intact.
    if (commitFailed && !editorSaved && (filename === edited || path.basename(filename).startsWith('integrations-lock.next.'))) {
      await fs.writeFile(edited, 'editor saved during failure cleanup');
      editorSaved = true;
    }
    return unlink(filename);
  });
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), error => error.code === 'INSTALL_INCOMPLETE' && error.cause?.code === 'EIO');
  assert.equal(editorSaved, true);
  assert.deepEqual(unlinkedPublished, []);
  assert.equal(await fs.readFile(edited, 'utf8'), 'editor saved during failure cleanup');
  for (const file of planned.files) assert.equal((await fs.stat(path.join(target, file.path))).isFile(), true);
  for (const file of ['install.lock', 'integrations-lock.json', 'staging']) {
    await assert.rejects(fs.stat(path.join(target, '.genlib', file)), { code: 'ENOENT' });
  }
  const recoveryPath = path.join(target, '.genlib/integrations-recovery.json');
  const recoveryBytes = await fs.readFile(recoveryPath);
  assert.ok(recoveryBytes.length < 1024 * 1024);
  const journal = JSON.parse(recoveryBytes);
  assert.equal(journal.previousLockSha256, null);
  assert.equal(journal.files.length, planned.files.length);
  const checked = await verifyIntegrations(target);
  assert.equal(checked.status, 'incomplete');
  assert.equal(checked.recovery.baselineState, 'matches-previous');
  assert.ok(checked.recovery.files.some(file => file.path.endsWith('/src/feature.mjs') && file.status === 'different'));
  assert.match(checked.recovery.guidance, /will not adopt, overwrite or delete/);
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'INSTALL_INCOMPLETE' });
  await assert.rejects(planIntegration(context, 'sample-pack', { target }), { code: 'INSTALL_INCOMPLETE' });
  assert.deepEqual(await fs.readFile(recoveryPath), recoveryBytes);
  await assert.rejects(fs.stat(path.join(output, 'SHOULD_NEVER_EXIST')), { code: 'ENOENT' });

  const cli = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/genlib.mjs', import.meta.url)), 'integration', 'verify', '--target', target, '--json'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(cli.status, 1, cli.stderr || cli.stdout);
  assert.equal(JSON.parse(cli.stdout).status, 'incomplete');
  await unlink(recoveryPath);
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'INSTALL_CONFLICT' });
  assert.equal(await fs.readFile(edited, 'utf8'), 'editor saved during failure cleanup');
  await assert.rejects(fs.stat(path.join(target, '.genlib/integrations-lock.json')), { code: 'ENOENT' });
});

test('the durable journal precedes publication and describes files left by a partial install', async t => {
  const { context, target } = await fixture(t);
  const output = path.join(target, 'genlib/integrations/sample-pack');
  const link = mutableFs.link;
  let journalObserved = false;
  t.mock.method(mutableFs, 'link', async (from, to) => {
    if (to === path.join(output, 'integration.json')) {
      const bytes = await fs.readFile(path.join(target, '.genlib/integrations-recovery.json'));
      const journal = JSON.parse(bytes);
      assert.equal(journal.integration, 'sample-pack');
      assert.equal(journal.files.length, 6);
      journalObserved = true;
    }
    if (to === path.join(output, 'src/feature.mjs')) throw Object.assign(new Error('Injected publication failure'), { code: 'EIO' });
    return link(from, to);
  });
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'INSTALL_INCOMPLETE' });
  assert.equal(journalObserved, true);
  assert.equal((await fs.stat(path.join(output, 'integration.json'))).isFile(), true);
  await assert.rejects(fs.stat(path.join(output, 'src/feature.mjs')), { code: 'ENOENT' });
  const checked = await verifyIntegrations(target);
  assert.equal(checked.status, 'incomplete');
  assert.equal(checked.recovery.files.filter(file => file.status === 'matches-proposed').length, 1);
  assert.equal(checked.recovery.files.filter(file => file.status === 'missing').length, 5);
  await assert.rejects(fs.stat(path.join(target, '.genlib/staging')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(target, '.genlib/install.lock')), { code: 'ENOENT' });
});

test('a failed repair preserves the exact original baseline and already installed files', async t => {
  const { context, target } = await fixture(t);
  await installIntegration(context, 'sample-pack', { target });
  const baselinePath = path.join(target, '.genlib/integrations-lock.json');
  const baseline = JSON.parse(await fs.readFile(baselinePath));
  baseline.integrations['sample-pack'].installedAt = '2000-01-01T00:00:00.000Z';
  await fs.writeFile(baselinePath, JSON.stringify(baseline) + '\n');
  const previousBytes = await fs.readFile(baselinePath);
  const output = path.join(target, 'genlib/integrations/sample-pack');
  const contract = await fs.readFile(path.join(output, 'CONTRACT.md'));
  await fs.writeFile(path.join(target, 'application-owned.txt'), 'keep this file');
  await fs.unlink(path.join(output, 'src/feature.mjs'));
  const rename = mutableFs.rename;
  t.mock.method(mutableFs, 'rename', async (from, to) => {
    if (to === baselinePath) throw Object.assign(new Error('Injected baseline replacement failure'), { code: 'EIO' });
    return rename(from, to);
  });
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'INSTALL_INCOMPLETE' });
  assert.deepEqual(await fs.readFile(baselinePath), previousBytes);
  assert.deepEqual(await fs.readFile(path.join(output, 'CONTRACT.md')), contract);
  assert.equal(await fs.readFile(path.join(target, 'application-owned.txt'), 'utf8'), 'keep this file');
  const journal = JSON.parse(await fs.readFile(path.join(target, '.genlib/integrations-recovery.json')));
  assert.equal(journal.previousLockSha256, createHash('sha256').update(previousBytes).digest('hex'));
  assert.equal(journal.files.filter(file => file.action === 'create').length, 1);
  const checked = await verifyIntegrations(target);
  assert.equal(checked.status, 'incomplete');
  assert.equal(checked.baselineStatus, 'unchanged');
  assert.equal(checked.recovery.baselineState, 'matches-previous');
});

test('journal cleanup failure after a baseline commit stays incomplete without undoing the commit', async t => {
  const { context, target } = await fixture(t);
  const recoveryPath = path.join(target, '.genlib/integrations-recovery.json');
  const unlink = mutableFs.unlink;
  t.mock.method(mutableFs, 'unlink', async filename => {
    if (filename === recoveryPath) throw Object.assign(new Error('Injected recovery cleanup failure'), { code: 'EACCES' });
    return unlink(filename);
  });
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), error => error.code === 'INSTALL_INCOMPLETE' && error.cause?.code === 'EACCES');
  const baselineBytes = await fs.readFile(path.join(target, '.genlib/integrations-lock.json'));
  const journalBytes = await fs.readFile(recoveryPath);
  const checked = await verifyIntegrations(target);
  assert.equal(checked.status, 'incomplete');
  assert.equal(checked.baselineStatus, 'unchanged');
  assert.equal(checked.recovery.baselineState, 'matches-proposed');
  assert.ok(checked.recovery.files.every(file => file.status === 'matches-proposed'));
  assert.deepEqual(checked.integrations, ['sample-pack']);
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'INSTALL_INCOMPLETE' });
  assert.deepEqual(await fs.readFile(recoveryPath), journalBytes);
  assert.deepEqual(await fs.readFile(path.join(target, '.genlib/integrations-lock.json')), baselineBytes);
  await assert.rejects(fs.stat(path.join(target, '.genlib/install.lock')), { code: 'ENOENT' });

  // Explicit application-owner reconciliation may clear a reviewed journal.
  // Clearing it alone never causes the installer to adopt untracked source.
  await unlink(recoveryPath);
  assert.equal((await installIntegration(context, 'sample-pack', { target })).status, 'unchanged');
  assert.deepEqual(await fs.readFile(path.join(target, '.genlib/integrations-lock.json')), baselineBytes);
});

test('failure before journal publication cleans only private staging and publishes no source', async t => {
  const { context, target } = await fixture(t);
  const link = mutableFs.link;
  t.mock.method(mutableFs, 'link', async (from, to) => {
    if (to === path.join(target, '.genlib/integrations-recovery.json')) throw Object.assign(new Error('Injected journal publication failure'), { code: 'EIO' });
    return link(from, to);
  });
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'EIO' });
  await assert.rejects(fs.stat(path.join(target, 'genlib')), { code: 'ENOENT' });
  assert.deepEqual(await fs.readdir(path.join(target, '.genlib')), []);
  assert.equal((await verifyIntegrations(target)).status, 'unchanged');
});

test('invalid and oversized recovery evidence fails closed without following journal paths', async t => {
  const { context, target } = await fixture(t);
  const rename = mutableFs.rename;
  t.mock.method(mutableFs, 'rename', async (from, to) => {
    if (to === path.join(target, '.genlib/integrations-lock.json')) throw Object.assign(new Error('Injected commit failure'), { code: 'EIO' });
    return rename(from, to);
  });
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'INSTALL_INCOMPLETE' });
  const recoveryPath = path.join(target, '.genlib/integrations-recovery.json');
  const original = JSON.parse(await fs.readFile(recoveryPath));
  const outside = path.join(path.dirname(target), 'outside.txt');
  await fs.writeFile(outside, 'application data outside the target');
  const open = mutableFs.open;
  t.mock.method(mutableFs, 'open', async (filename, ...args) => {
    assert.notEqual(filename, outside, 'invalid recovery paths must not be read');
    return open(filename, ...args);
  });
  const traversal = structuredClone(original);
  traversal.files[0].path = '../outside.txt';
  const excessive = structuredClone(original);
  excessive.files = Array.from({ length: 1004 }, () => excessive.files[0]);
  for (const bytes of [JSON.stringify(traversal), JSON.stringify(excessive), 'x'.repeat(1024 * 1024 + 1)]) {
    await fs.writeFile(recoveryPath, bytes);
    const checked = await verifyIntegrations(target);
    assert.equal(checked.status, 'incomplete');
    assert.equal(checked.recovery.state, 'unreadable');
    assert.equal(checked.recovery.files, undefined);
    await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'INSTALL_INCOMPLETE' });
  }
  await fs.unlink(recoveryPath);
  await fs.symlink(outside, recoveryPath);
  const checked = await verifyIntegrations(target);
  assert.equal(checked.status, 'incomplete');
  assert.equal(checked.recovery.state, 'unreadable');
  assert.equal(checked.recovery.code, 'UNSAFE_PATH');
});

test('recovery verification returns bounded observations with complete counts and immutable evidence', async t => {
  const { context, target } = await fixture(t);
  const rename = mutableFs.rename;
  t.mock.method(mutableFs, 'rename', async (from, to) => {
    if (to === path.join(target, '.genlib/integrations-lock.json')) throw Object.assign(new Error('Injected baseline failure'), { code: 'EIO' });
    return rename(from, to);
  });
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'INSTALL_INCOMPLETE' });
  const recoveryPath = path.join(target, '.genlib/integrations-recovery.json');
  const journal = JSON.parse(await fs.readFile(recoveryPath));
  for (let index = 0; index < 40; index++) journal.files.push({ ...journal.files[0], path: journal.out + '/not-published/' + index + '.txt' });
  await fs.writeFile(recoveryPath, JSON.stringify(journal));
  const evidence = await fs.readFile(recoveryPath);
  const checked = await verifyIntegrations(target);
  assert.equal(checked.status, 'incomplete');
  assert.equal(checked.recovery.fileCount, 46);
  assert.deepEqual(checked.recovery.counts, { 'matches-proposed': 6, different: 0, missing: 40, unreadable: 0 });
  assert.equal(checked.recovery.files.length, 32);
  assert.ok(checked.recovery.files.every(file => file.status === 'missing'));
  assert.equal(checked.recovery.omittedFiles, 14);
  assert.deepEqual(await fs.readFile(recoveryPath), evidence);
  await assert.rejects(installIntegration(context, 'sample-pack', { target }), { code: 'INSTALL_INCOMPLETE' });
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
