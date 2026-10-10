import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findInSources, loadSources } from '../lib/discover.mjs';
import { jevPacket } from '../lib/jev.mjs';
import { eligibleResource, isPermissive, licenseMatches, lifecycleOf, readinessOf } from '../lib/resource-policy.mjs';
import { searchResources, validateResource } from '../lib/resources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sources = await loadSources();

test('license comparisons preserve expressions and do not confuse copyleft families or restrictions', () => {
  for (const [left, right, expected] of [
    ['MIT', 'MIT License', true], ['Apache-2.0', 'Apache License, Version 2.0', true],
    ['MIT', 'MIT AND Commons-Clause', false], ['GPL-3.0', 'LGPL-3.0', false],
    ['AGPL-3.0', 'GPL-3.0', false], ['Apache-2.0', 'Apache-1.1', false],
    ['MIT OR Apache-2.0', 'MIT', false], ['GPL-3.0-only', 'GPL-3.0-or-later', false],
    [null, 'MIT', null], ['MIT', 'UNKNOWN', null],
  ]) assert.equal(licenseMatches(left, right), expected, `${left} / ${right}`);
  assert.equal(isPermissive('MIT'), true);
  assert.equal(isPermissive('MIT OR Commons-Clause'), false);
  assert.equal(isPermissive(null), false);
  assert.equal(eligibleResource({ license: { id: 'MIT' }, integrationMode: 'license-review' }, { licensePolicy: 'permissive' }), false);
});

test('source review, lifecycle and adoption readiness stay independent', () => {
  assert.equal(lifecycleOf({ verification: 'verified' }).status, 'unknown');
  assert.equal(readinessOf({ verification: 'verified' }).level, 'source-reviewed');
  assert.equal(readinessOf({ verification: 'partial', genlib: { integrations: ['sample'] } }).level, 'recipe-available');
  const original = sources.resources[0];
  assert.throws(() => validateResource({ ...original, readiness: { level: 'integration-verified' } }), /profiles and evidence/);
  assert.throws(() => validateResource({ ...original, lifecycle: { status: 'active' } }), /lifecycle/);
  assert.doesNotThrow(() => validateResource({ ...original, readiness: { level: 'integration-verified', profiles: ['Node 24 fixture'], evidence: ['tests/fixture.test.mjs'] } }));
});

test('resource discovery and bounded decisions lead to the available Genlib integration', () => {
  const result = findInSources(sources, 'uppy', { type: 'resource' }).results.find(item => item.id === 'uppy');
  assert.deepEqual(result.integrations, ['resumable-files']);
  assert.equal(result.readiness.level, 'recipe-available');
  assert.match(result.next[0], /integration inspect resumable-files --json$/);
  const packet = jevPacket(sources, 'uppy', { type: 'resource' });
  const candidate = packet.state.candidates.find(item => item.id === 'uppy');
  assert.deepEqual(candidate.integrations, ['resumable-files']);
  assert.equal(candidate.readiness, 'recipe-available');
  assert.ok(packet.limits.characters <= 20000);
  const resource = sources.resources.find(item => item.genlib.module === 'public-data-clients');
  const api = findInSources(sources, resource.id, { type: 'resource' }).results.find(item => item.id === resource.id);
  assert.equal(api.module, 'public-data-clients');
  assert.match(api.next[0], /inspect public-data-clients --json$/);
});

test('every retired service is excluded before ordinary resource and Jev selection', () => {
  const retired = sources.resources.filter(item => item.lifecycle?.status === 'retired');
  assert.ok(retired.length >= 10);
  for (const item of retired) {
    assert.ok(item.lifecycle.source.startsWith('https://'));
    assert.equal(searchResources(sources.resources, item.id, { limit: 50 }).some(hit => hit.id === item.id), false);
    assert.equal(findInSources(sources, item.id, { type: 'resource', limit: 25 }).results.some(hit => hit.id === item.id), false);
  }
  const packet = jevPacket(sources, 'firebase dynamic links', { type: 'resource' });
  assert.equal(packet.state.candidates.some(item => item.lifecycle === 'retired'), false);
  const migration = jevPacket(sources, 'firebase dynamic links migration', { type: 'resource', includeRetired: true });
  assert.ok(migration.state.candidates.some(item => item.lifecycle === 'retired'));
  assert.ok(migration.state.candidates.filter(item => item.type === 'resource').every(item => item.installationMode && item.readiness && item.licenseScope));
  assert.ok(migration.limits.characters <= 20000);
});

test('permissive filtering removes unknown/restricted records while preserving original source and precise scopes', () => {
  for (const result of findInSources(sources, 'data grid', { type: 'resource', licensePolicy: 'permissive', limit: 25 }).results) {
    assert.equal(isPermissive(result.license), true);
    assert.notEqual(result.integrationMode, 'license-review');
  }
  assert.ok(findInSources(sources, 'webhook verification', { type: 'module', licensePolicy: 'permissive' }).results.some(item => item.id === 'webhook-verification'));
  const packet = jevPacket(sources, 'Open Food Facts', { type: 'resource', licensePolicy: 'permissive' });
  assert.equal(packet.state.candidates.some(item => item.id === 'open-food-facts'), false);
  assert.throws(() => findInSources(sources, 'grid', { licensePolicy: 'license-anything' }), /license policy/);
});

test('CLI selection flags reject duplicates and expose deliberate migration lookup', () => {
  const run = (...args) => spawnSync(process.execPath, ['tools/resources.mjs', ...args], { cwd: root, encoding: 'utf8' });
  const migration = run('search', 'firebase', '--include-retired', '--limit', '50');
  assert.equal(migration.status, 0, migration.stderr);
  assert.ok(JSON.parse(migration.stdout).items.some(item => item.lifecycle.status === 'retired'));
  assert.equal(run('search', 'grid', '--include-retired', '--include-retired').status, 1);
  assert.equal(run('search', 'grid', '--license-policy', 'any', '--license-policy', 'permissive').status, 1);
  assert.equal(run('search', 'grid', '--license-policy', '--json').status, 1);
});
