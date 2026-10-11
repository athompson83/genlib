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
  for (const api of swagger2) for (const step of apiSteps(api).filter(step => step.kind === 'generated')) {
    assert.match(step.command, /npx swagger2openapi@7\.0\.8 \S+ -o openapi\//, api.id);
    assert.ok(!step.command.includes(`openapi-typescript@7.13.0 ${shellUrl(api.spec)}`) && !step.command.includes('--url '), api.id);
  }
});

test('OpenAPI 3.x records generate straight from the spec', () => {
  for (const api of apis.filter(api => api.openapiVersion.startsWith('3.'))) for (const step of apiSteps(api)) assert.doesNotMatch(step.command, /swagger2openapi/, api.id);
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
  for (const api of apis) for (const step of apiSteps(api)) {
    const code = step.command.split('   # ')[0];
    assert.doesNotMatch(code, /[()'"]/, api.id);
    if (step.kind === 'generated') assert.ok(code.includes(shellUrl(api.spec)), api.id);
  }
  assert.equal(shellUrl('https://x.test/v4 (Hunt Valley)/a.json'), 'https://x.test/v4%20%28Hunt%20Valley%29/a.json');
});
