import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { apiSteps, apiInstallFor, shellUrl } from '../lib/api-install.mjs';

const apis = JSON.parse(readFileSync('resources/apis.json', 'utf8')).apis;
const swagger2 = apis.filter(api => api.openapiVersion === '2.0');

// openapi-typescript 7 and openapi-python-client read OpenAPI 3.x only; both fail on a Swagger 2.0 URL
// (reproduced on microsoft-com-cognitiveservices-websearch and instagram-com).
test('Swagger 2.0 records convert the spec before generating a client', () => {
  assert.ok(swagger2.length > 900);
  for (const api of swagger2.filter(api => !api.lifecycle)) for (const step of apiSteps(api).filter(step => step.kind === 'generated')) {
    assert.match(step.command, /npx swagger2openapi@7\.0\.8 \S+ -o openapi\//, api.id);
    assert.ok(!step.command.includes(`openapi-typescript@7.13.0 ${shellUrl(api.spec)}`) && !step.command.includes('--url '), api.id);
  }
});

test('OpenAPI 3.x records generate straight from the spec', () => {
  for (const api of apis.filter(api => api.openapiVersion.startsWith('3.') && !api.lifecycle)) for (const step of apiSteps(api)) assert.doesNotMatch(step.command, /swagger2openapi/, api.id);
});

test('stored install steps match the derived ones', () => {
  assert.equal(spawnSync(process.execPath, ['scripts/api-install.mjs', '--check']).status, 0);
});

test('install steps follow the receiving language', () => {
  const stripe = apis.find(api => api.id === 'stripe-com');
  assert.deepEqual(apiInstallFor(stripe, ['python']).map(step => step.split(' ')[0]), ['uvx']);
  assert.ok(apiInstallFor(stripe, ['typescript']).every(step => step.startsWith('npm install')));
  const go = apiInstallFor(stripe, ['go']);
  assert.equal(go.length, 1);
  assert.match(go[0], /^# no go client recorded for stripe-com/);
  assert.equal(apiInstallFor(stripe).length, apiSteps(stripe).length);
  const cli = JSON.parse(execFileSync(process.execPath, ['bin/genlib.mjs', 'api', 'inspect', 'instagram-com', '--language', 'python', '--json'], { encoding: 'utf8' }));
  assert.deepEqual(cli.install.length, 1);
  assert.match(cli.install[0], /swagger2openapi.*openapi-python-client@0\.29\.1 generate --path openapi\/instagram-com\.json/);
});

test('every install command keeps spec URLs as single shell words', () => {
  for (const api of apis.filter(api => !api.lifecycle)) for (const step of apiSteps(api)) {
    const code = step.command.split('   # ')[0];
    assert.doesNotMatch(code, /[()'"]/, api.id);
    if (step.kind === 'generated') assert.ok(code.includes(shellUrl(api.spec)), api.id);
  }
  assert.equal(shellUrl('https://x.test/v4 (Hunt Valley)/a.json'), 'https://x.test/v4%20%28Hunt%20Valley%29/a.json');
});

test('retired services get a migration pointer, rank below live ones and name only known records', async () => {
  const lifecycle = JSON.parse(readFileSync('resources/api-lifecycle.json', 'utf8'));
  const { loadSources, findInSources } = await import('../lib/discover.mjs');
  const sources = await loadSources();
  const resourceIds = new Set(sources.resources.map(resource => resource.id));
  for (const group of lifecycle.groups) {
    assert.match(group.source, /^https:\/\//);
    assert.match(group.date, /^\d{4}-\d{2}-\d{2}$/);
    for (const id of group.ids) {
      const api = apis.find(entry => entry.id === id);
      assert.ok(api, id);
      assert.equal(api.lifecycle.date, group.date);
      assert.deepEqual(api.install, [`# retired ${group.date}: ${group.replacement}. Do not install; see ${group.source}`]);
      assert.deepEqual(apiInstallFor(api, ['typescript']), api.install);
    }
    for (const id of group.resourceIds ?? []) assert.ok(resourceIds.has(id), id);
  }
  // The audit's queries: each returned the retired service first with ordinary install steps.
  const bing = JSON.parse(execFileSync(process.execPath, ['bin/genlib.mjs', 'api', 'find', 'web', 'search', '--json'], { encoding: 'utf8' })).apis;
  assert.notEqual(bing[0].id, 'microsoft-com-cognitiveservices-websearch');
  const links = findInSources(sources, 'firebase dynamic links', { limit: 5 }).results;
  for (const result of links.filter(result => sources.retiredResources.has(result.id))) {
    assert.match(result.next[0], /^# wraps a service retired 2025-08-25/);
    assert.ok(!result.next.some(step => /^npm install|^bundle add|^dotnet add|^composer require/.test(step)), result.id);
  }
});

// 2026-10-11 audit R2-01: SDKs were inferred from name prefixes (Gmail/Rust -> an Ads Manager crate,
// StackExchange/C# -> StackExchange.Redis, Regulations.gov/Dart -> a table widget).
test('API SDK fallbacks come only from explicit same-API mappings, and retired APIs get none', async () => {
  const { loadSources, findInSources } = await import('../lib/discover.mjs');
  const sources = await loadSources();
  const resources = new Map(sources.resources.map(resource => [resource.id, resource]));
  const apiIds = new Set(sources.api.map(api => api.id));
  const lang = resource => resource.languages ?? [];
  for (const [api, byLanguage] of Object.entries(sources.apiSdks.apis)) {
    assert.ok(apiIds.has(api), api);
    for (const [language, id] of Object.entries(byLanguage)) {
      assert.ok(resources.has(id), `${api}/${language}: ${id}`);
      assert.ok(lang(resources.get(id)).includes(language) || (language === 'kotlin' && lang(resources.get(id)).includes('java')), `${api}/${language}: ${id}`);
    }
  }
  const steps = (query, language, id) => findInSources(sources, query, { type: 'api', profile: { languages: [language], frameworks: [] }, limit: 5 }).results.find(result => result.id === id).next;
  const installs = /^(go get|cargo add|dotnet add|dart pub add|npm install)/;
  assert.ok(!steps('gmail api', 'rust', 'googleapis-com-gmail').some(step => installs.test(step) || /admanager/i.test(step)));
  assert.ok(!steps('stackexchange api', 'csharp', 'stackexchange-com').some(step => installs.test(step) || /redis/i.test(step)));
  assert.ok(!steps('regulations.gov api', 'dart', 'data-gov').some(step => installs.test(step) || /data_table/i.test(step)));
  const firebase = steps('firebase dynamic links api', 'rust', 'googleapis-com-firebasedynamiclinks');
  assert.match(firebase[0], /^# retired 2025-08-25/);
  assert.ok(!firebase.some(step => installs.test(step)));
  const stripe = steps('stripe api', 'go', 'stripe-com');
  assert.ok(stripe.includes('go get github.com/stripe/stripe-go/v87@v87.0.0'));
  assert.ok(!stripe.some(step => step.startsWith('# no go client')));
  assert.ok(steps('gmail api', 'go', 'googleapis-com-gmail').some(step => step.startsWith('go get google.golang.org/api@')));
  // The same answer through inspect with a language.
  const cli = JSON.parse(execFileSync(process.execPath, ['bin/genlib.mjs', 'api', 'inspect', 'googleapis-com-gmail', '--language', 'rust', '--json'], { encoding: 'utf8' }));
  assert.ok(!cli.install.some(step => installs.test(step)));
});
