import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installFor, loadIndex, searchIndex, validateEntry } from '../lib/indexes.mjs';

const cli = fileURLToPath(new URL('../bin/genlib.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('each install index holds 500 ranked entries in rank order', async () => {
  for (const kind of ['mcp', 'cli', 'api']) {
    const index = await loadIndex(kind);
    const ranked = index.entries.filter(entry => entry.rank !== null);
    assert.equal(ranked.length, 500, kind);
    assert.ok(ranked.every((entry, i) => entry.rank === i + 1), kind + ' ranks are 1..500 in order');
    assert.ok(index.ranking && (index.ranking.source || index.ranking.sources), kind + ' records its ranking source');
  }
});

test('MCP entries give pinned, one-line commands for Claude Code and Codex', async () => {
  const { entries } = await loadIndex('mcp');
  for (const entry of entries.filter(item => item.rank !== null)) {
    assert.match(entry.install.claude[0], /^claude mcp add \S+ .*-- (npx -y \S+@\S+|uvx \S+@\S+|docker run -i --rm .*)/, entry.id);
    assert.match(entry.install.codex[0], /^codex mcp add \S+ .*-- /, entry.id);
    for (const variable of entry.env.filter(item => item.required)) assert.ok(entry.install.claude[0].includes(`-e ${variable.name}=<`), entry.id);
  }
  for (const entry of entries.filter(item => item.rank === null)) {
    assert.match(entry.install.claude[0], /^claude mcp add --transport (http|sse) \S+ https:\/\//, entry.id);
  }
  const top = entries[0];
  assert.deepEqual(installFor('mcp', top, 'both'), [...top.install.claude, ...top.install.codex]);
  assert.throws(() => installFor('mcp', top, 'cursor'), /Client/);
});

test('CLIs install with brew and APIs offer an SDK or a typed client from a pinned generator', async () => {
  const clis = await loadIndex('cli');
  assert.ok(clis.entries.every(entry => entry.install[0] === `brew install ${entry.name}`));
  const apis = await loadIndex('api');
  for (const entry of apis.entries) {
    assert.ok(entry.spec.startsWith('https://'), entry.id);
    assert.ok(entry.install.some(step => step.includes(`npx openapi-typescript@7.13.0 ${entry.spec}`)), entry.id);
    if (entry.sdk) assert.match(entry.install[0], new RegExp(`^npm install ${entry.sdk.npm.replace(/[/@.-]/g, '\\$&')}@`), entry.id);
  }
  assert.ok(apis.entries.filter(entry => entry.provider === 'amazonaws.com').length <= 20);
});

test('validation rejects malformed entries and search prefers whole-word matches', async () => {
  const clis = await loadIndex('cli');
  const sample = clis.entries[0];
  assert.throws(() => validateEntry('cli', { ...sample, install: [] }));
  assert.throws(() => validateEntry('cli', { ...sample, homepage: 'http://insecure.example' }));
  assert.throws(() => validateEntry('cli', { ...sample, id: 'Not Valid' }));
  assert.equal(searchIndex('cli', clis, 'json', { limit: 1 })[0].id, 'jq');
});

test('the CLI exposes mcp, cli and api find/inspect and find searches them', () => {
  const mcp = JSON.parse(run('mcp', 'find', 'filesystem', '--client', 'codex', '--limit', '2', '--json').stdout);
  assert.ok(mcp.servers.length > 0 && mcp.servers.every(item => item.install.every(step => step.startsWith('codex mcp add'))));
  const tool = JSON.parse(run('cli', 'inspect', 'jq', '--json').stdout);
  assert.deepEqual(tool.install, ['brew install jq']);
  const api = JSON.parse(run('api', 'find', 'stripe', '--limit', '1', '--json').stdout);
  assert.equal(api.apis[0].provider, 'stripe.com');
  assert.equal(run('cli', 'inspect', 'no-such-cli').status, 1);
  assert.equal(run('mcp', 'find', 'x', '--client', 'vim').status, 1);
  const unified = JSON.parse(run('find', 'jq', '--type', 'cli', '--limit', '1', '--json').stdout);
  assert.equal(unified.results[0].next[0], 'brew install jq');
});
