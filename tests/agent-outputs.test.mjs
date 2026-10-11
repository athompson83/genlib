// SPDX-License-Identifier: Apache-2.0
// Agent-facing outputs match their published JSON Schemas; quick answers "no match" instead of an incidental hit;
// find --target reports installed package versions and the guidance those packages ship.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findInSources, loadSources } from '../lib/discover.mjs';
import { quickPick } from '../lib/brief.mjs';
import { stepsFor } from '../lib/capabilities.mjs';
import { loadCatalog, REPOSITORY_ROOT } from '../lib/catalog.mjs';
import { planInstall } from '../lib/install.mjs';

const schema = name => JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), 'utf8'));
// The JSON Schema subset the schemas use: type (incl. arrays of types), required, properties, items, enum, const, pattern, minItems.
function validate(value, s, at = '$') {
  const errors = [];
  const types = s.type === undefined ? null : [].concat(s.type);
  const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
  if (types && !types.some(t => t === typeOf(value) || (t === 'number' && typeof value === 'number'))) return [`${at}: ${typeOf(value)} is not ${types}`];
  if (s.enum && !s.enum.includes(value)) errors.push(`${at}: ${JSON.stringify(value)} not in enum`);
  if ('const' in s && value !== s.const) errors.push(`${at}: not ${s.const}`);
  if (s.pattern && typeof value === 'string' && !new RegExp(s.pattern).test(value)) errors.push(`${at}: pattern`);
  if (s.required) for (const key of s.required) if (!(key in value)) errors.push(`${at}: missing ${key}`);
  if (s.properties && value && typeof value === 'object' && !Array.isArray(value)) for (const [key, sub] of Object.entries(s.properties)) if (key in value) errors.push(...validate(value[key], sub, `${at}.${key}`));
  if (s.items && Array.isArray(value)) value.forEach((item, i) => errors.push(...validate(item, s.items, `${at}[${i}]`)));
  if (s.minItems && Array.isArray(value) && value.length < s.minItems) errors.push(`${at}: too few items`);
  return errors;
}
const sources = await loadSources();

test('quick results, including no-match, match schemas/quick.schema.json', () => {
  for (const query of ['verify stripe webhook', 'totp in go', 'quantum teleportation flux capacitor zzqx', 'blockchain nft minting']) {
    const pick = quickPick(findInSources(sources, query, { limit: 4 }));
    assert.deepEqual(validate(pick, schema('quick')), [], query);
  }
});

test('quick answers no-match for incidental word hits but keeps real and synonym-routed matches', () => {
  const nonsense = quickPick(findInSources(sources, 'quantum teleportation flux capacitor zzqx', { limit: 4 }));
  assert.equal(nonsense.best, null);
  assert.equal(nonsense.status, 'no-match');
  assert.ok(nonsense.weak.includes('cli:teleport'));
  assert.ok(nonsense.fallback.some(command => command.startsWith('gh search repos') && command.includes('--license mit')));
  assert.equal(quickPick(findInSources(sources, 'verify stripe webhook', { limit: 4 })).best, 'capability:webhook-signature');
  // Filler words ("make sure", "really") are not search terms, so a resource named "sure" no longer wins, and
  // a synonym-routed paraphrase reaches Genlib's own capability even with low word coverage.
  assert.equal(quickPick(findInSources(sources, 'make sure text is readable against its background for accessibility', { limit: 4 })).best, 'capability:wcag-contrast');
  assert.equal(quickPick(findInSources(sources, 'blockchain nft minting', { limit: 4 })).status, 'no-match');
  assert.equal(quickPick(findInSources(sources, 'zod', { limit: 4 })).best?.endsWith('zod'), true, 'single-word queries are never no-match');
});

test('adoption steps and install plans match their schemas', async () => {
  for (const impl of [{ kind: 'language-example', id: 'python-roman-numerals' }, { kind: 'language-example', id: 'rust-punycode' }, { kind: 'recipe', id: 'punycode' }, { kind: 'module', id: 'entitlements' }]) {
    assert.deepEqual(validate(stepsFor(impl), schema('steps')), [], impl.id);
  }
  const target = mkdtempSync(path.join(tmpdir(), 'genlib-schema-'));
  try {
    writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: 'app', devDependencies: { typescript: '5.9.0' } }));
    const plan = await planInstall(await loadCatalog(REPOSITORY_ROOT), 'entitlements', { target });
    assert.deepEqual(validate(plan, schema('plan')), []);
  } finally { rmSync(target, { recursive: true, force: true }); }
});

test('find --target reports the installed version of a resource package and the skills it ships', () => {
  const target = mkdtempSync(path.join(tmpdir(), 'genlib-installed-'));
  try {
    writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: 'app', dependencies: { zod: '4.1.0' } }));
    mkdirSync(path.join(target, 'node_modules/zod/skills/schemas'), { recursive: true });
    writeFileSync(path.join(target, 'node_modules/zod/package.json'), JSON.stringify({ name: 'zod', version: '4.1.0' }));
    writeFileSync(path.join(target, 'node_modules/zod/skills/schemas/SKILL.md'), '---\nname: schemas\n---\n');
    const zod = findInSources(sources, 'zod schema validation', { target, type: 'resource', limit: 5 }).results.find(result => result.id === 'zod');
    assert.deepEqual(zod.installed.skills, ['schemas']);
    assert.equal(zod.installed.version, '4.1.0');
    assert.match(zod.installed.docs, /ctx7@0\.6\.0 docs <library id>\/4\.1\.0/);
    assert.ok(zod.next.includes('npx -y @tanstack/intent@0.5.5 load zod#schemas   # guidance shipped with zod@4.1.0'));
    // Without the package installed there is no installed field.
    rmSync(path.join(target, 'node_modules'), { recursive: true });
    assert.equal(findInSources(sources, 'zod schema validation', { target, type: 'resource', limit: 5 }).results.find(result => result.id === 'zod').installed, undefined);
  } finally { rmSync(target, { recursive: true, force: true }); }
});
