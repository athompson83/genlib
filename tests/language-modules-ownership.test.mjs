// SPDX-License-Identifier: Apache-2.0
// Language examples and recipes use the module installer's ownership rules: an identical shared file that Genlib
// already tracks is reused and records every dependent, while edited or untracked files still conflict, and removing
// one capability keeps a shared file that another installed capability still needs. Pure file copies: no toolchain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const node = (script, ...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const lang = (...args) => node('tools/language-modules.mjs', ...args);
const recipe = (...args) => node('tools/recipe-install.mjs', ...args);
const genlib = (...args) => node('bin/genlib.mjs', ...args);
const ok = result => { assert.equal(result.status, 0, result.stderr); return result.stdout; };
const json = result => JSON.parse(ok(result));
const lockOf = dir => JSON.parse(readFileSync(join(dir, '.genlib/lock.json'), 'utf8'));
const schema = name => JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), 'utf8'));
const ENCODING = 'genlib/swift/Sources/GenlibSwift/Encoding.swift';
const PACKAGE = 'genlib/swift/Package.swift';
function app(t, prefix = 'genlib-own-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('swift-totp then swift-oidc-pkce reuses the identical shared Encoding.swift and records both owners', t => {
  const dir = app(t);
  ok(lang('add', 'swift-totp', '--target', dir));
  // Before the fix this plan failed: "Destination already exists: .../Encoding.swift".
  const plan = json(lang('plan', 'swift-oidc-pkce', '--target', dir, '--json'));
  const action = rel => plan.files.find(file => file.path === rel)?.action;
  assert.equal(action(ENCODING), 'unchanged');
  assert.equal(action(PACKAGE), 'unchanged');
  assert.equal(action('genlib/swift/Sources/GenlibSwift/OidcPkce.swift'), 'create');
  assert.equal(existsSync(join(dir, 'genlib/swift/Sources/GenlibSwift/OidcPkce.swift')), false, 'plan writes nothing');
  const added = json(lang('add', 'swift-oidc-pkce', '--target', dir, '--json'));
  assert.equal(added.status, 'installed');
  const lock = lockOf(dir);
  assert.deepEqual(lock.files[ENCODING].modules, ['swift-oidc-pkce', 'swift-totp']);
  assert.deepEqual(lock.files[PACKAGE].modules, ['swift-oidc-pkce', 'swift-totp']);
  assert.deepEqual(lock.files['genlib/swift/Sources/GenlibSwift/Totp.swift'].modules, ['swift-totp']);
  assert.equal(lock.modules['swift-totp'].kind, 'language');
  assert.equal(lock.modules['swift-totp'].out, 'genlib');
  // genlib verify covers language copies too.
  const verify = json(genlib('verify', '--target', dir, '--json'));
  assert.equal(verify.status, 'unchanged');
  assert.ok(verify.modules.some(entry => entry.id === 'swift-oidc-pkce' && entry.kind === 'language'));
  // Receipts in the module receipt format, marked as language examples.
  const receipt = JSON.parse(readFileSync(join(dir, '.genlib/receipts/swift-oidc-pkce.json'), 'utf8'));
  for (const key of schema('receipt').required) assert.ok(key in receipt, key);
  assert.equal(receipt.kind, 'language');
  assert.ok(schema('receipt').properties.kind.enum.includes(receipt.kind));
  assert.deepEqual(receipt.outcomes, { found: true, copied: true, used: null, verified: null });
  assert.ok(receipt.files.some(file => file.path === ENCODING));
  // Adding the same capability again is idempotent, as for modules.
  assert.equal(json(lang('add', 'swift-oidc-pkce', '--target', dir, '--json')).status, 'unchanged');
});

test('an edited shared file still conflicts and nothing is written', t => {
  const dir = app(t);
  ok(lang('add', 'swift-totp', '--target', dir));
  writeFileSync(join(dir, ENCODING), readFileSync(join(dir, ENCODING), 'utf8') + '\n// local edit\n');
  const plan = lang('plan', 'swift-oidc-pkce', '--target', dir);
  assert.notEqual(plan.status, 0);
  assert.match(plan.stderr, /Encoding\.swift/);
  const add = lang('add', 'swift-oidc-pkce', '--target', dir);
  assert.notEqual(add.status, 0);
  assert.equal(existsSync(join(dir, 'genlib/swift/Sources/GenlibSwift/OidcPkce.swift')), false);
  assert.match(readFileSync(join(dir, ENCODING), 'utf8'), /local edit/);
  assert.equal(lockOf(dir).modules['swift-oidc-pkce'], undefined);
});

test('an untracked file at the same path conflicts even when its bytes are identical', t => {
  const dir = app(t);
  mkdirSync(join(dir, 'genlib/swift/Sources/GenlibSwift'), { recursive: true });
  writeFileSync(join(dir, ENCODING), readFileSync('examples/languages/swift/Sources/GenlibSwift/Encoding.swift'));
  const result = lang('add', 'swift-totp', '--target', dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Encoding\.swift/);
  assert.equal(existsSync(join(dir, 'genlib/swift/Sources/GenlibSwift/Totp.swift')), false);
  assert.equal(existsSync(join(dir, '.genlib/lock.json')), false);
});

test('a symlink at a destination is refused, never followed', t => {
  const dir = app(t);
  mkdirSync(join(dir, 'genlib/swift/Sources/GenlibSwift'), { recursive: true });
  writeFileSync(join(dir, 'outside.swift'), 'x');
  symlinkSync(join(dir, 'outside.swift'), join(dir, ENCODING));
  assert.notEqual(lang('add', 'swift-totp', '--target', dir).status, 0);
  assert.equal(readFileSync(join(dir, 'outside.swift'), 'utf8'), 'x');
});

test('removing one capability keeps a shared file another installed capability still needs', t => {
  const dir = app(t);
  ok(lang('add', 'swift-totp', '--target', dir));
  ok(lang('add', 'swift-oidc-pkce', '--target', dir));
  const removed = json(lang('remove', 'swift-totp', '--target', dir, '--json'));
  assert.equal(removed.files.find(file => file.path === ENCODING).action, 'keep-shared');
  assert.ok(existsSync(join(dir, ENCODING)));
  assert.equal(existsSync(join(dir, 'genlib/swift/Sources/GenlibSwift/Totp.swift')), false);
  let lock = lockOf(dir);
  assert.deepEqual(lock.files[ENCODING].modules, ['swift-oidc-pkce']);
  assert.equal(lock.modules['swift-totp'], undefined);
  // The last owner removes it (through the main CLI, which reads the same lock).
  json(genlib('remove', 'swift-oidc-pkce', '--target', dir, '--json'));
  lock = lockOf(dir);
  assert.equal(existsSync(join(dir, ENCODING)), false);
  assert.deepEqual(Object.keys(lock.files), []);
  assert.deepEqual(Object.keys(lock.modules), []);
});

test('a non-Swift pair: python-ip-cidr and python-url-normalize share python/ip_cidr.py', t => {
  const dir = app(t);
  ok(lang('add', 'python-ip-cidr', '--target', dir, '--with-tests', '--flat'));
  const added = json(lang('add', 'python-url-normalize', '--target', dir, '--with-tests', '--flat', '--json'));
  assert.equal(added.files.find(file => file.path === 'ip_cidr.py').action, 'unchanged');
  assert.deepEqual(lockOf(dir).files['ip_cidr.py'].modules, ['python-ip-cidr', 'python-url-normalize']);
  assert.equal(lockOf(dir).modules['python-url-normalize'].out, '.');
  ok(genlib('remove', 'python-ip-cidr', '--target', dir));
  assert.ok(existsSync(join(dir, 'ip_cidr.py')) && existsSync(join(dir, 'url_normalize.py')));
  assert.equal(existsSync(join(dir, 'test_ip_cidr.py')), false);
});

test('a different location for an installed capability is a conflict, not a second copy', t => {
  const dir = app(t);
  ok(lang('add', 'python-ip-cidr', '--target', dir));
  const again = lang('add', 'python-ip-cidr', '--target', dir, '--into', 'other');
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /python-ip-cidr/);
});

test('recipes are tracked in the same lock: re-add is unchanged, edits conflict, remove rolls back', t => {
  const dir = app(t);
  const first = json(recipe('add', 'csv-safe', '--target', dir));
  assert.equal(first.file, 'create');
  const entry = lockOf(dir).modules['csv-safe'];
  assert.equal(entry.kind, 'recipe');
  assert.deepEqual(lockOf(dir).files['genlib/csv-safe.ts'].modules, ['csv-safe']);
  assert.equal(JSON.parse(readFileSync(join(dir, '.genlib/receipts/csv-safe.json'), 'utf8')).kind, 'recipe');
  assert.equal(json(recipe('add', 'csv-safe', '--target', dir)).file, 'unchanged');
  writeFileSync(join(dir, 'genlib/csv-safe.ts'), '// edited\n');
  assert.notEqual(recipe('plan', 'csv-safe', '--target', dir).status, 0);
  const removed = json(recipe('remove', 'csv-safe', '--target', dir));
  assert.deepEqual(removed.kept, ['genlib/csv-safe.ts']);
  assert.equal(readFileSync(join(dir, 'genlib/csv-safe.ts'), 'utf8'), '// edited\n');
  assert.equal(lockOf(dir).modules['csv-safe'], undefined);
});

test('update refuses language and recipe entries with a clear message', t => {
  const dir = app(t);
  ok(lang('add', 'python-ip-cidr', '--target', dir));
  const result = genlib('update', 'python-ip-cidr', '--target', dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /language example/);
});
