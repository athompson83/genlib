import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGES, commandsFor, coverage, loadCapabilities, validateCapability } from '../lib/capabilities.mjs';
import { detectProject, findInSources, loadSources } from '../lib/discover.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(root, 'bin/genlib.mjs');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
const readJson = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));

test('every capability implementation resolves to a registered recipe or language module', async () => {
  const { capabilities } = await loadCapabilities();
  const modules = new Map((await readJson('examples/languages/modules.json')).modules.map(item => [item.id, item]));
  const recipes = new Set((await readJson('resources/agent-recipes.json')).entries.map(item => item.id));
  assert.ok(capabilities.length >= 13);
  for (const capability of capabilities) {
    await fs.access(path.join(root, capability.guide));
    for (const [language, impl] of Object.entries(capability.implementations)) {
      if (impl.kind === 'recipe') assert.ok(recipes.has(impl.id), impl.id);
      if (impl.kind === 'language-example') {
        assert.ok(modules.has(impl.id), impl.id);
        assert.equal(modules.get(impl.id).language, language, impl.id);
      }
    }
  }
});

test('pure capabilities cover all nine languages with tested code', async () => {
  const { capabilities } = await loadCapabilities();
  for (const capability of capabilities.filter(item => item.tier === 'pure')) {
    assert.deepEqual(coverage(capability).missing, [], capability.id);
    assert.ok(Object.values(capability.implementations).every(impl => impl.tested === true), capability.id);
  }
});

test('validation rejects unknown languages, kinds and guides outside docs', () => {
  const base = { id: 'x', title: 'X', tier: 'pure', summary: 's', terms: ['x'], guide: 'docs/x.md', implementations: {} };
  assert.doesNotThrow(() => validateCapability(base));
  assert.throws(() => validateCapability({ ...base, implementations: { cobol: { kind: 'recipe', id: 'a', tested: true } } }), /Invalid capability/);
  assert.throws(() => validateCapability({ ...base, implementations: { go: { kind: 'shell', id: 'a', tested: true } } }), /Invalid capability/);
  assert.throws(() => validateCapability({ ...base, implementations: { go: { kind: 'unavailable' } } }), /Invalid capability/);
  assert.throws(() => validateCapability({ ...base, guide: '../x.md' }), /Invalid capability/);
});

test('commands copy the implementation in one step', () => {
  assert.deepEqual(commandsFor({ kind: 'language-example', id: 'go-totp' }, '/app', ''), ['node tools/language-modules.mjs add go-totp --target /app --with-tests']);
  assert.deepEqual(commandsFor({ kind: 'recipe', id: 'totp-mfa-codes' }, '/app', ''), ['node tools/recipe-install.mjs add totp-mfa-codes --target /app']);
  assert.deepEqual(commandsFor({ kind: 'unavailable', note: 'Use a broker.' }), ['Use a broker.']);
  assert.equal(LANGUAGES.length, 9);
});

test('find selects the detected language and returns its copy command', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genlib-capability-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'go.mod'), 'module example.com/app\n\ngo 1.22\n');
  const profile = await detectProject(directory);
  const result = findInSources(await loadSources(), 'totp two factor', { profile, target: profile.target });
  const hit = result.results.find(item => item.type === 'capability');
  assert.equal(hit.id, 'totp');
  assert.equal(hit.fit, 'compatible');
  assert.equal(hit.selected.id, 'go-totp');
  assert.match(hit.next[0], /language-modules\.mjs add go-totp --target/);
  const copied = spawnSync(process.execPath, [path.join(root, 'tools/language-modules.mjs'), 'add', 'go-totp', '--target', directory, '--with-tests'], { encoding: 'utf8' });
  assert.equal(copied.status, 0, copied.stderr);
  await fs.access(path.join(directory, 'genlib/go/totp/totp_test.go'));
});

test('capability CLI lists coverage and inspects one language', () => {
  const list = JSON.parse(run('capability', 'list', '--json').stdout);
  assert.ok(list.capabilities.some(item => item.id === 'oidc-pkce' && item.missing.length === 0));
  const inspected = run('capability', 'inspect', 'calculator', '--language', 'swift', '--json');
  assert.equal(inspected.status, 0, inspected.stderr);
  const detail = JSON.parse(inspected.stdout);
  assert.deepEqual(Object.keys(detail.implementations), ['swift']);
  assert.match(detail.implementations.swift.commands[0], /add swift-calculator/);
  assert.equal(run('capability', 'inspect', 'calculator', '--language', 'cobol').status, 1);
  assert.equal(run('capability', 'inspect', 'nope').status, 1);
});
