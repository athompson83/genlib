// SPDX-License-Identifier: Apache-2.0
// Adoption receipts (found, copied, used, verified), rollback and three-way updates of installed modules.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadCatalog, REPOSITORY_ROOT } from '../lib/catalog.mjs';
import { installModule } from '../lib/install.mjs';
import { checkAdoption, removeModule, updateModule } from '../lib/lifecycle.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function app(t) {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'genlib-lifecycle-'));
  t.after(() => fs.rm(target, { recursive: true, force: true }));
  await fs.writeFile(path.join(target, 'package.json'), JSON.stringify({ name: 'app', type: 'module', devDependencies: { typescript: '5.9.0' } }));
  return target;
}
const read = (target, relative) => fs.readFile(path.join(target, relative), 'utf8');
const lockOf = async target => JSON.parse(await read(target, '.genlib/lock.json'));

test('install writes a receipt; adopted separates copied, used and verified', async t => {
  const context = await loadCatalog(REPOSITORY_ROOT);
  const target = await app(t);
  const installed = await installModule(context, 'org-invitations', { target });
  assert.deepEqual(installed.receipts, ['.genlib/receipts/org-invitations.json']);
  const receipt = JSON.parse(await read(target, '.genlib/receipts/org-invitations.json'));
  assert.deepEqual(receipt.outcomes, { found: true, copied: true, used: null, verified: null });
  assert.ok(receipt.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256)) && receipt.files.length === 5);

  const copied = await checkAdoption(target, 'org-invitations');
  assert.equal(copied.status, 'copied', 'installed but nothing imports it yet');
  assert.match(copied.next[0], /Import the module/);

  await fs.mkdir(path.join(target, 'src/routes'), { recursive: true });
  await fs.writeFile(path.join(target, 'src/routes/invite.ts'), "import { createInvitations } from '../genlib/org-invitations/core.js';\nexport const x = createInvitations;\n");
  await fs.writeFile(path.join(target, 'src/other.ts'), "import { thing } from '@/genlib/org-invitations/http';\n");
  const used = await checkAdoption(target, 'org-invitations');
  assert.equal(used.status, 'used');
  assert.deepEqual(used.usedBy.map(u => [u.file, u.match]).sort(), [['src/other.ts', 'alias'], ['src/routes/invite.ts', 'resolved']]);

  const failing = await checkAdoption(target, 'org-invitations', { test: 'node -e "process.exit(3)"' });
  assert.equal(failing.status, 'used');
  assert.equal(failing.outcomes.verified, false);
  assert.equal(failing.test.exitCode, 3);
  const verified = await checkAdoption(target, 'org-invitations', { test: 'node -e "console.log(42)"' });
  assert.equal(verified.status, 'verified');
  assert.match(verified.test.tail, /42/);
  const final = JSON.parse(await read(target, '.genlib/receipts/org-invitations.json'));
  assert.deepEqual(final.outcomes, { found: true, copied: true, used: true, verified: true });
  assert.equal(final.checks.length, 4);
  await assert.rejects(checkAdoption(target, 'rate-limit'), { code: 'NOT_INSTALLED' });
});

test('remove deletes unmodified files, keeps edited ones and refuses while a dependent is installed', async t => {
  const context = await loadCatalog(REPOSITORY_ROOT);
  const target = await app(t);
  await fs.writeFile(path.join(target, 'package.json'), JSON.stringify({ name: 'app', type: 'module', dependencies: { react: '19.0.0', 'react-dom': '19.0.0' }, devDependencies: { typescript: '5.9.0', '@types/react': '19.0.0' } }));
  await installModule(context, 'data-table', { target });
  // data-table depends on theme-tokens, so theme-tokens cannot be removed first.
  await assert.rejects(removeModule(context, target, 'theme-tokens'), { code: 'IN_USE' });
  const lock = await lockOf(target);
  const tableFiles = Object.entries(lock.files).filter(([, r]) => r.modules.includes('data-table') && r.modules.length === 1 && r.kind === 'source').map(([p]) => p);
  await fs.appendFile(path.join(target, tableFiles[0]), '\n// my edit\n');
  const plan = await removeModule(context, target, 'data-table', { dryRun: true });
  assert.ok(plan.files.some(f => f.path === tableFiles[0] && f.action === 'keep-modified'));
  assert.ok(await read(target, tableFiles[1]), 'dry run deletes nothing');
  const done = await removeModule(context, target, 'data-table');
  assert.deepEqual(done.kept, [tableFiles[0]]);
  await assert.rejects(fs.access(path.join(target, tableFiles[1])));
  const after = await lockOf(target);
  assert.equal(after.modules['data-table'], undefined);
  assert.ok(after.modules['theme-tokens'], 'the dependency stays installed');
  assert.ok(after.files['.genlib/NOTICE'], 'shared notice stays while modules remain');
  await removeModule(context, target, 'theme-tokens');
  assert.deepEqual((await lockOf(target)).modules, {});
});

test('update replaces unchanged files, merges edits onto upstream changes and reports conflicts', async t => {
  const context = await loadCatalog(REPOSITORY_ROOT);
  const target = await app(t);
  await installModule(context, 'http-resilience', { target });
  const lock = await lockOf(target);
  const out = lock.modules['http-resilience'].out;
  const files = { retry: `${out}/http-resilience/retry.ts`, fetch: `${out}/http-resilience/fetch-retry.ts`, breaker: `${out}/http-resilience/circuit-breaker.ts` };
  const current = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([k, p]) => [k, await read(target, p)])));
  // Pretend the installed copy came from an older release: each file's original differs from today's.
  const older = {
    retry: current.retry.replace('// SPDX-License-Identifier: Apache-2.0', '// SPDX-License-Identifier: Apache-2.0\n// old header line'),
    fetch: current.fetch.replace(/export const RETRYABLE_STATUSES[^\n]*\n/, 'export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 503]);\n'),
    breaker: current.breaker,
  };
  // Local state: retry untouched (older copy), fetch edited far from the upstream change, breaker edited.
  const local = {
    retry: older.retry,
    fetch: older.fetch.replace('// SPDX-License-Identifier: Apache-2.0', '// SPDX-License-Identifier: Apache-2.0\n// local note: tuned for our API'),
    breaker: current.breaker + '\n// local addition\n',
  };
  for (const [k, p] of Object.entries(files)) await fs.writeFile(path.join(target, p), local[k]);
  lock.modules['http-resilience'] = { ...lock.modules['http-resilience'], version: '0.1.0', manifestSha256: '0'.repeat(64) };
  for (const [k, p] of Object.entries(files)) lock.files[p].sha256 = sha(older[k]);
  await fs.writeFile(path.join(target, '.genlib/lock.json'), JSON.stringify(lock));
  const manifest = await fs.readFile(path.join(REPOSITORY_ROOT, 'modules/http-resilience/module.json'));
  const original = file => file.endsWith('module.json') ? manifest
    : Buffer.from(older[{ 'files/retry.ts': 'retry', 'files/fetch-retry.ts': 'fetch', 'files/circuit-breaker.ts': 'breaker' }[file.replace('modules/http-resilience/', '')]] ?? '');

  const plan = await updateModule(context, target, 'http-resilience', { original });
  const byPath = Object.fromEntries(plan.files.map(f => [f.path, f.action]));
  assert.equal(byPath[files.retry], 'replace');
  assert.equal(byPath[files.fetch], 'merged');
  assert.equal(byPath[files.breaker], 'keep-local', 'upstream did not change it, so the local edit stays');
  assert.equal(plan.write, false);
  assert.equal(await read(target, files.retry), local.retry, 'dry run writes nothing');

  const applied = await updateModule(context, target, 'http-resilience', { original, write: true });
  assert.deepEqual(applied.conflicts, []);
  assert.equal(await read(target, files.retry), current.retry);
  const merged = await read(target, files.fetch);
  assert.match(merged, /local note: tuned for our API/, 'the local edit survives');
  assert.match(merged, /RETRYABLE_STATUSES[^\n]*408/, 'and the upstream change arrives');
  assert.match(await read(target, files.breaker), /local addition/);
  const updated = await lockOf(target);
  assert.equal(updated.modules['http-resilience'].version, '0.2.0');

  // A local edit on the same lines as an upstream change is a conflict, written beside the file by default.
  const lock2 = await lockOf(target);
  lock2.modules['http-resilience'].version = '0.1.0';
  lock2.files[files.fetch].sha256 = sha(older.fetch);
  await fs.writeFile(path.join(target, '.genlib/lock.json'), JSON.stringify(lock2));
  await fs.writeFile(path.join(target, files.fetch), older.fetch.replace('new Set([429, 503])', 'new Set([429, 503, 599])'));
  const conflicted = await updateModule(context, target, 'http-resilience', { original, write: true });
  assert.deepEqual(conflicted.conflicts, [files.fetch]);
  assert.match(await read(target, files.fetch), /599/, 'the local file is untouched');
  assert.match(await read(target, files.fetch + '.genlib-conflict'), /<<<<<<< your edits[\s\S]*>>>>>>> new Genlib version/);
  await assert.rejects(updateModule(context, target, 'http-resilience', { conflict: 'merge' }), { code: 'INVALID_OPTION' });
});

test('receipts and update results match their schemas', async t => {
  const { readFileSync } = await import('node:fs');
  const schema = name => JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), 'utf8'));
  const context = await loadCatalog(REPOSITORY_ROOT);
  const target = await app(t);
  await installModule(context, 'entitlements', { target });
  await checkAdoption(target, 'entitlements');
  const receipt = JSON.parse(await read(target, '.genlib/receipts/entitlements.json'));
  for (const key of schema('receipt').required) assert.ok(key in receipt, key);
  assert.ok(schema('receipt').properties.checks.items.properties.status.enum.includes(receipt.checks[0].status));
  const update = await updateModule(context, target, 'entitlements');
  for (const key of schema('update').required) assert.ok(key in update, key);
  assert.ok(update.files.every(file => schema('update').properties.files.items.properties.action.enum.includes(file.action)));
});
