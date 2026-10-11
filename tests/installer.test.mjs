import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildArtifacts, inspectModule, loadCatalog, searchCatalog, REPOSITORY_ROOT } from '../lib/catalog.mjs';
import { installModule, planInstall, verifyInstallation } from '../lib/install.mjs';

async function artifacts(root) {
  for (const [relative, bytes] of await buildArtifacts(root)) {
    await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await fs.writeFile(path.join(root, relative), bytes);
  }
}

async function fixture(t, { react = '^19.3.0' } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genlib-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'registry'), target = path.join(directory, 'app');
  await fs.mkdir(root); await fs.mkdir(target);
  await fs.writeFile(path.join(root, 'LICENSE'), 'Fixture license\n');
  await fs.writeFile(path.join(root, 'NOTICE'), 'Fixture attribution\n');
  await fs.mkdir(path.join(root, 'tests'));
  await fs.writeFile(path.join(root, 'tests/feature.test.mjs'), '// Fixture for installer contract testing.\n');
  if (react !== null) await fs.writeFile(path.join(target, 'package.json'), JSON.stringify({ dependencies: { react } }));
  const manifests = {};
  for (const id of ['base-style', 'sample-feature']) {
    const neutral = id === 'base-style';
    const module = {
      schemaVersion: 1, id, version: '0.1.0', title: id,
      description: neutral ? 'Brand style variables' : 'Searchable records component',
      kind: neutral ? 'theme' : 'component', tags: neutral ? ['theme'] : ['table', 'search'],
      license: 'Apache-2.0', source: { type: 'original', repository: 'https://github.com/athompson83/genlib', path: 'modules/' + id },
      compatibility: { frameworks: neutral ? ['any'] : ['react'], languages: ['typescript'], platform: 'web', notes: [],
        ...(neutral ? {} : { reactMajors: [18, 19] }) },
      dependencies: neutral ? [] : [{ id: 'base-style', version: '0.1.0' }],
      files: [{ source: 'files/value.ts', target: id + '/value.ts' }],
      exports: [{ name: 'value', from: id + '/value.ts' }],
      configuration: [], capabilities: [id], limitations: ['Fixture only'],
      verification: { level: 'experimental', testFiles: ['tests/feature.test.mjs'] }, contract: 'CONTRACT.md',
    };
    manifests[id] = module;
    const location = path.join(root, 'modules', id);
    await fs.mkdir(path.join(location, 'files'), { recursive: true });
    await fs.writeFile(path.join(location, 'module.json'), JSON.stringify(module));
    await fs.writeFile(path.join(location, 'CONTRACT.md'), '# ' + id + '\nAccept explicit input data.\n');
    await fs.writeFile(path.join(location, 'files/value.ts'), 'export const value = "private-source-marker-' + id + '";\n');
  }
  await artifacts(root);
  return { root, target, directory, manifests, context: await loadCatalog(root) };
}

async function exists(file) {
  try { await fs.lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

test('search and inspection return useful metadata and contract without implementation source', async t => {
  const { context } = await fixture(t);
  const search = searchCatalog(context.catalog, 'searchable records', { framework: 'react', limit: 1 });
  assert.equal(search[0].id, 'sample-feature');
  const inspection = await inspectModule(context, 'sample-feature');
  assert.match(inspection.contract, /Accept explicit input data/);
  assert.equal(JSON.stringify({ search, inspection }).includes('private-source-marker'), false);
  assert.equal(searchCatalog(context.catalog, 'unmatchedcapability').length, 0);
});

test('plan resolves exact dependencies and creates no files or metadata', async t => {
  const { context, target } = await fixture(t);
  const plan = await planInstall(context, 'sample-feature', { target });
  assert.deepEqual(plan.modules.map(module => module.id), ['base-style', 'sample-feature']);
  assert.equal(plan.writes, false);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.files.length, 4);
  assert.deepEqual(await fs.readdir(target), ['package.json']);
});

test('installation copies verified files, license, and provenance; repeat is idempotent', async t => {
  const { context, target, root } = await fixture(t);
  const first = await installModule(context, 'sample-feature', { target });
  assert.equal(first.status, 'installed');
  assert.equal(first.created, 4);
  const installed = path.join(target, 'src/genlib/sample-feature/value.ts');
  assert.deepEqual(await fs.readFile(installed), await fs.readFile(path.join(root, 'modules/sample-feature/files/value.ts')));
  assert.deepEqual(await fs.readFile(path.join(target, '.genlib/licenses/Apache-2.0.txt')), await fs.readFile(path.join(root, 'LICENSE')));
  const previous = await fs.readFile(path.join(target, '.genlib/lock.json'));
  const mtime = (await fs.stat(installed)).mtimeMs;
  assert.equal((await installModule(context, 'sample-feature', { target })).status, 'unchanged');
  assert.deepEqual(await fs.readFile(path.join(target, '.genlib/lock.json')), previous);
  assert.equal((await fs.stat(installed)).mtimeMs, mtime);
  assert.equal((await verifyInstallation(target)).status, 'unchanged');
  assert.equal(await exists(path.join(target, '.genlib/install.lock')), false);
  assert.equal(await exists(path.join(target, '.genlib/staging')), false);
});

test('untracked conflicts are found before any target mutation', async t => {
  const { context, target } = await fixture(t);
  await fs.mkdir(path.join(target, 'src/genlib/sample-feature'), { recursive: true });
  const userFile = path.join(target, 'src/genlib/sample-feature/value.ts');
  await fs.writeFile(userFile, 'user-owned content');
  const plan = await planInstall(context, 'sample-feature', { target });
  assert.equal(plan.conflicts.length, 1);
  await assert.rejects(installModule(context, 'sample-feature', { target }), { code: 'INSTALL_CONFLICT' });
  assert.equal(await fs.readFile(userFile, 'utf8'), 'user-owned content');
  assert.equal(await exists(path.join(target, '.genlib')), false);
  assert.equal(await exists(path.join(target, 'src/genlib/base-style')), false);
});

test('customized and missing installed files are accurately reported and edits are preserved', async t => {
  const { context, target } = await fixture(t);
  await installModule(context, 'sample-feature', { target });
  const userFile = path.join(target, 'src/genlib/sample-feature/value.ts');
  await fs.writeFile(userFile, 'customized source');
  await fs.unlink(path.join(target, 'src/genlib/base-style/value.ts'));
  const verification = await verifyInstallation(target);
  assert.equal(verification.status, 'drift');
  assert.equal(verification.files.find(file => file.path.endsWith('sample-feature/value.ts')).status, 'modified');
  assert.equal(verification.files.find(file => file.path.endsWith('base-style/value.ts')).status, 'missing');
  await assert.rejects(installModule(context, 'sample-feature', { target }), { code: 'INSTALL_CONFLICT' });
  assert.equal(await fs.readFile(userFile, 'utf8'), 'customized source');
});

test('changed source, contract, authored manifest, and license are rejected by integrity checks', async t => {
  for (const name of ['files/value.ts', 'CONTRACT.md', 'module.json', 'LICENSE']) {
    const { context, target, root } = await fixture(t);
    const relative = name === 'LICENSE' ? name : 'modules/sample-feature/' + name;
    await fs.appendFile(path.join(root, relative), '\nchanged');
    if (name === 'CONTRACT.md') await assert.rejects(inspectModule(context, 'sample-feature'), { code: 'INTEGRITY_MISMATCH' });
    else await assert.rejects(installModule(context, 'sample-feature', { target }), { code: 'INTEGRITY_MISMATCH' });
    assert.equal(await exists(path.join(target, '.genlib')), false);
  }
});

test('unsafe output paths and installation into registry checkout are rejected', async t => {
  const { context, target, root } = await fixture(t);
  for (const out of ['../escape', '/absolute', 'src/../../escape', 'src\\escape', '.github', 'node_modules/genlib', 'src/node_modules', 'NODE_MODULES/genlib', 'src/VENDOR/modules', 'src/.git', 'src/con']) {
    await assert.rejects(planInstall(context, 'sample-feature', { target, out }), { code: 'UNSAFE_PATH' });
  }
  await assert.rejects(installModule(context, 'base-style', { target: root }), { code: 'INVALID_TARGET' });
});

test('authored targets cannot install into nested or case-variant dependency directories', async t => {
  for (const target of ['node_modules/source.ts', 'sample/NODE_MODULES/source.ts', 'sample/Vendor/source.ts']) {
    const { root, manifests } = await fixture(t);
    manifests['sample-feature'].files[0].target = target;
    manifests['sample-feature'].exports[0].from = target;
    await fs.writeFile(path.join(root, 'modules/sample-feature/module.json'), JSON.stringify(manifests['sample-feature']));
    await assert.rejects(buildArtifacts(root), { code: 'UNSAFE_PATH' });
  }
});

test('file and ancestor target collisions are rejected during planning before target mutation', async t => {
  const { root, target, manifests } = await fixture(t);
  manifests['base-style'].files[0].target = 'shared/node';
  manifests['base-style'].exports[0].from = 'shared/node';
  manifests['sample-feature'].files[0].target = 'shared/node/child.ts';
  manifests['sample-feature'].exports[0].from = 'shared/node/child.ts';
  for (const [id, manifest] of Object.entries(manifests)) {
    await fs.writeFile(path.join(root, 'modules', id, 'module.json'), JSON.stringify(manifest));
  }
  await artifacts(root);
  const context = await loadCatalog(root);
  await assert.rejects(planInstall(context, 'sample-feature', { target }), { code: 'PATH_CONFLICT' });
  await assert.rejects(installModule(context, 'sample-feature', { target }), { code: 'PATH_CONFLICT' });
  assert.deepEqual(await fs.readdir(target), ['package.json']);
});

test('empty source files are rejected when building the registry', async t => {
  const { root } = await fixture(t);
  await fs.writeFile(path.join(root, 'modules/sample-feature/files/value.ts'), '');
  await assert.rejects(buildArtifacts(root), { code: 'INVALID_FILE' });
});

test('reinstalling identical modules preserves their original commit provenance', async t => {
  const { context, target, root } = await fixture(t);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '--initial-branch=main');
  git('add', '.');
  git('-c', 'user.name=Genlib Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Initial fixture');
  const firstRevision = git('rev-parse', 'HEAD');
  await installModule(context, 'sample-feature', { target });
  const lockFile = path.join(target, '.genlib/lock.json');
  const firstLock = await fs.readFile(lockFile);
  const firstRecord = JSON.parse(firstLock).modules['sample-feature'];
  assert.equal(firstRecord.source.commit, firstRevision);
  await fs.writeFile(path.join(root, 'README.md'), 'Unrelated documentation change\n');
  git('add', 'README.md');
  git('-c', 'user.name=Genlib Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Documentation');
  assert.notEqual(git('rev-parse', 'HEAD'), firstRevision);
  assert.equal((await installModule(context, 'sample-feature', { target })).status, 'unchanged');
  assert.deepEqual(await fs.readFile(lockFile), firstLock);
});

test('destination symlinks and source symlinks cannot escape the selected roots', async t => {
  const first = await fixture(t);
  const outside = path.join(first.directory, 'outside');
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(first.target, 'src'), 'dir');
  await assert.rejects(installModule(first.context, 'sample-feature', { target: first.target }), { code: 'UNSAFE_PATH' });
  assert.deepEqual(await fs.readdir(outside), []);
  const second = await fixture(t);
  const source = path.join(second.root, 'modules/sample-feature/files/value.ts');
  const saved = path.join(second.directory, 'outside.ts');
  await fs.rename(source, saved);
  await fs.symlink(saved, source);
  await assert.rejects(installModule(second.context, 'sample-feature', { target: second.target }), { code: 'UNSAFE_PATH' });
});

test('metadata symlinks and hard-linked source files are refused', async t => {
  const first = await fixture(t);
  const outside = path.join(first.directory, 'outside');
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(first.target, '.genlib'), 'dir');
  await assert.rejects(installModule(first.context, 'sample-feature', { target: first.target }), { code: 'UNSAFE_PATH' });
  const second = await fixture(t);
  await fs.link(path.join(second.root, 'modules/sample-feature/files/value.ts'), path.join(second.directory, 'alias.ts'));
  await assert.rejects(installModule(second.context, 'sample-feature', { target: second.target }), { code: 'INVALID_FILE' });
});

test('known incompatible React and native targets fail even with unverified acceptance', async t => {
  const first = await fixture(t, { react: '^20.0.0' });
  await assert.rejects(installModule(first.context, 'sample-feature', { target: first.target, allowUnverified: true }), { code: 'INCOMPATIBLE_TARGET' });
  const second = await fixture(t);
  await fs.writeFile(path.join(second.target, 'package.json'), JSON.stringify({ dependencies: { react: '^19.0.0', 'react-native': '0.80.0' } }));
  await assert.rejects(planInstall(second.context, 'sample-feature', { target: second.target, allowUnverified: true }), { code: 'INCOMPATIBLE_TARGET' });
});

test('missing or ambiguous peers require explicit unverified acceptance', async t => {
  for (const react of [null, 'workspace:*']) {
    const { context, target } = await fixture(t, { react });
    await assert.rejects(planInstall(context, 'sample-feature', { target }), { code: 'UNVERIFIED_COMPATIBILITY' });
    const plan = await planInstall(context, 'sample-feature', { target, allowUnverified: true });
    assert.equal(plan.compatibility.status, 'unverified');
    assert.ok(plan.compatibility.warnings.length > 0);
  }
});

test('an active installation lock prevents a second writer and preserves all files', async t => {
  const { context, target } = await fixture(t);
  await fs.mkdir(path.join(target, '.genlib'));
  const lock = path.join(target, '.genlib/install.lock');
  await fs.writeFile(lock, 'another process');
  await assert.rejects(installModule(context, 'sample-feature', { target }), { code: 'INSTALL_BUSY' });
  assert.equal(await fs.readFile(lock, 'utf8'), 'another process');
  assert.equal(await exists(path.join(target, 'src')), false);
});

test('concurrent installers produce one coherent installation', async t => {
  const { context, target } = await fixture(t);
  const results = await Promise.allSettled([
    installModule(context, 'sample-feature', { target }),
    installModule(context, 'sample-feature', { target }),
  ]);
  assert.ok(results.some(result => result.status === 'fulfilled'));
  for (const result of results) if (result.status === 'rejected') assert.equal(result.reason.code, 'INSTALL_BUSY');
  assert.equal((await verifyInstallation(target)).status, 'unchanged');
});

test('different module versions cannot silently update installed source', async t => {
  const { context, target, root, manifests } = await fixture(t);
  await installModule(context, 'sample-feature', { target });
  manifests['sample-feature'].version = '0.2.0';
  await fs.writeFile(path.join(root, 'modules/sample-feature/module.json'), JSON.stringify(manifests['sample-feature']));
  await fs.writeFile(path.join(root, 'modules/sample-feature/files/value.ts'), 'new source');
  await artifacts(root);
  await assert.rejects(installModule(await loadCatalog(root), 'sample-feature', { target }), { code: 'INSTALL_CONFLICT' });
  assert.match(await fs.readFile(path.join(target, 'src/genlib/sample-feature/value.ts'), 'utf8'), /private-source-marker/);
});

test('malformed provenance cannot redirect writes or verification outside a target', async t => {
  const { context, target } = await fixture(t);
  await fs.mkdir(path.join(target, '.genlib'));
  await fs.writeFile(path.join(target, '.genlib/lock.json'), JSON.stringify({
    schemaVersion: 1, modules: {}, files: { '../outside': { sha256: '0'.repeat(64), modules: [] } },
  }));
  await assert.rejects(installModule(context, 'sample-feature', { target }), { code: 'UNSAFE_PATH' });
  await assert.rejects(verifyInstallation(target), { code: 'UNSAFE_PATH' });
});

test('authoring checks reject traversal, wrong dependency versions, and cycles', async t => {
  for (const mode of ['traversal', 'version', 'cycle']) {
    const { root, manifests } = await fixture(t);
    if (mode === 'traversal') manifests['sample-feature'].files[0].source = '../outside.ts';
    if (mode === 'version') manifests['sample-feature'].dependencies[0].version = '9.9.9';
    if (mode === 'cycle') manifests['base-style'].dependencies = [{ id: 'sample-feature', version: '0.1.0' }];
    for (const [id, manifest] of Object.entries(manifests)) await fs.writeFile(path.join(root, 'modules', id, 'module.json'), JSON.stringify(manifest));
    await assert.rejects(buildArtifacts(root), { code: mode === 'traversal' ? 'UNSAFE_PATH' : mode === 'version' ? 'DEPENDENCY_MISMATCH' : 'DEPENDENCY_CYCLE' });
  }
});

test('CLI fails on unknown commands and options with structured error output', () => {
  const cli = path.join(REPOSITORY_ROOT, 'bin/genlib.mjs');
  for (const args of [['destroy'], ['search', 'table', '--force'], ['add', 'table', '--target']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stderr).code, /^INVALID_/);
    assert.equal(result.stdout, '');
  }
});

test('a named pipe in installation metadata fails promptly instead of blocking', { skip: process.platform === 'win32' }, async t => {
  const { target } = await fixture(t);
  await fs.mkdir(path.join(target, '.genlib'));
  const fifo = path.join(target, '.genlib/lock.json');
  const creation = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
  assert.equal(creation.status, 0);
  const result = spawnSync(process.execPath, [path.join(REPOSITORY_ROOT, 'bin/genlib.mjs'), 'verify', '--target', target, '--json'],
    { encoding: 'utf8', timeout: 1500 });
  assert.equal(result.error, undefined, 'Verification must not block on special files.');
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).code, 'INVALID_FILE');
});

test('module evidence: inspect shows verified behaviors and changelog, and malformed evidence is rejected', async () => {
  const { validateModule } = await import('../lib/catalog.mjs');
  const context = await loadCatalog(REPOSITORY_ROOT);
  const invitations = await inspectModule(context, 'org-invitations');
  assert.ok(invitations.verification.behaviors.some(item => /concurrent accepts/.test(item)));
  assert.match(invitations.verification.command, /org-invitations\.test\.mjs/);
  assert.equal(invitations.changelog[0].version, invitations.version);
  const base = JSON.parse(await fs.readFile(path.join(REPOSITORY_ROOT, 'modules/org-invitations/module.json'), 'utf8'));
  const bad = changes => () => validateModule({ ...base, ...changes }, 'org-invitations');
  assert.doesNotThrow(bad({}));
  assert.throws(bad({ changelog: [{ version: '9.9.9', changes: ['x'] }] }), /current version/);
  assert.throws(bad({ verification: { ...base.verification, behaviors: [] } }), /behaviors/);
  assert.throws(bad({ deprecated: { replacement: 'Not An Id' } }), /deprecated/);
});
