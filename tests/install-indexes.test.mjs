import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installFor, loadIndex, searchIndex, validateEntry } from '../lib/indexes.mjs';

const cli = fileURLToPath(new URL('../bin/genlib.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

// Minimum ranked sizes; the indexes grow when their ranking sources are refreshed.
const MINIMUM = { mcp: 500, cli: 500, api: 2500 };
test('each install index holds its ranked entries in rank order', async () => {
  for (const kind of ['mcp', 'cli', 'api']) {
    const index = await loadIndex(kind);
    const ranked = index.entries.filter(entry => entry.rank !== null);
    assert.ok(ranked.length >= MINIMUM[kind], `${kind}: ${ranked.length}`);
    assert.ok(ranked.every((entry, i) => entry.rank === i + 1), kind + ' ranks are 1..n in order');
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
    if (entry.lifecycle?.status === 'retired') { assert.match(entry.install[0], /^# retired /, entry.id); continue; }
    assert.ok(entry.install.some(step => /npx openapi-typescript@7\.13\.0 \S+ -o src\/api\//.test(step)), entry.id);
    if (entry.sdk) assert.match(entry.install[0], new RegExp(`^npm install ${entry.sdk.npm.replace(/[/@.-]/g, '\\$&')}@`), entry.id);
  }
  // Every directory service is listed once; the first 500 keep the original per-provider cap.
  assert.ok(apis.entries.slice(0, 500).filter(entry => entry.provider === 'amazonaws.com').length <= 20);
  assert.equal(new Set(apis.entries.map(entry => entry.spec)).size, apis.entries.length);
});

test('validation rejects malformed entries and search prefers whole-word matches', async () => {
  const clis = await loadIndex('cli');
  const sample = clis.entries[0];
  assert.throws(() => validateEntry('cli', { ...sample, install: [] }));
  assert.throws(() => validateEntry('cli', { ...sample, homepage: 'http://insecure.example' }));
  assert.throws(() => validateEntry('cli', { ...sample, id: 'Not Valid' }));
  assert.equal(searchIndex('cli', clis, 'json', { limit: 1 })[0].id, 'jq');
  // A query naming a service exactly beats services that merely contain the word.
  assert.equal(searchIndex('api', await loadIndex('api'), 's3', { limit: 1 })[0].id, 'amazonaws-com-s3');
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

test('starter and task indexes give pinned one-command installs and are searchable', async () => {
  const starters = await loadIndex('starter');
  assert.ok(starters.entries.length >= 2000, String(starters.entries.length));
  for (const entry of starters.entries) {
    if (['github-template', 'cookiecutter', 'cargo-generate'].includes(entry.kind)) {
      assert.match(entry.commit, /^[0-9a-f]{40}$/, entry.id);
      assert.ok(entry.install.some(step => step.includes(entry.commit)), entry.id + ' installs the pinned commit');
    }
  }
  const tasks = await loadIndex('task');
  assert.ok(tasks.entries.length >= 2000, String(tasks.entries.length));
  const rewrite = tasks.entries.filter(entry => entry.source === 'openrewrite' && entry.install[0].startsWith('mvn '));
  assert.ok(rewrite.length > 1000 && rewrite.every(entry => /rewrite-maven-plugin:\d+\.\d+\.\d+:run .*-Drewrite\.activeRecipes=/.test(entry.install[0])), 'OpenRewrite recipes pin the plugin and name the recipe');
  assert.ok(tasks.entries.filter(entry => entry.source === 'n8n').every(entry => entry['license-review'] === true), 'community workflows are license-review');
  assert.equal(searchIndex('starter', starters, 'create t3 app', { limit: 1 })[0].kind, 'create-cli');
  // The registry namespace (io.github.*) is not a match; the vendor's own server wins.
  assert.equal(searchIndex('mcp', await loadIndex('mcp'), 'github', { limit: 1 })[0].id, 'io-github-github-github-mcp-server');
  const text = run('starter', 'find', 'django', '--limit', '2').stdout;
  assert.match(text, /^1\. starter:/);
  assert.ok(text.length < 1500, 'index find text output stays compact');
});
