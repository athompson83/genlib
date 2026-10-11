import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectProject, findInSources, loadSources, queryTerms, sourceCounts } from '../lib/discover.mjs';

const cli = fileURLToPath(new URL('../bin/genlib.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

async function project(t, files) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genlib-discover-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(files)) await fs.writeFile(path.join(directory, name), body);
  return directory;
}

test('loads every source catalog and reports counts', async () => {
  const counts = sourceCounts(await loadSources());
  for (const type of ['module', 'recipe', 'language-example', 'template', 'tool', 'resource']) assert.ok(counts[type] > 0, type);
});

test('query terms stem plurals and add reviewed synonyms without duplicating words', () => {
  const { words, expanded, phrase } = queryTerms('Webhooks webhooks');
  assert.deepEqual({ words, expanded, phrase }, { words: ['webhook'], expanded: ['signature', 'hmac'], phrase: 'webhooks-webhooks' });
  assert.deepEqual(queryTerms('class').words, ['class']);
  // Light suffix stemming joins word forms without merging unrelated words.
  assert.deepEqual(queryTerms('normalizing normalization normalize').words, ['normal']);
  assert.deepEqual(queryTerms('coordinates coordinate addresses address hashes').words, ['coordin', 'address', 'hash']);
  assert.deepEqual(queryTerms('generate general').words, ['gener', 'general']);
  assert.deepEqual(queryTerms('logging').words, queryTerms('logger').words);
  assert.throws(() => queryTerms('x'.repeat(501)), /at most 500/);
});

test('find ranks the matching source first and returns its next commands', async () => {
  const sources = await loadSources();
  const table = findInSources(sources, 'searchable table with pagination');
  assert.equal(table.results[0].id, 'data-table');
  assert.equal(table.results[0].type, 'module');
  assert.match(table.results[0].next.at(-1), /genlib\.mjs add data-table --target "\$APP_ROOT"/);
  const ship = findInSources(sources, 'docker release');
  assert.equal(ship.results[0].id, 'ship-starter');
  assert.match(ship.results[0].next[0], /templates\/ship\/README\.md/);
  const csv = findInSources(sources, 'csv export', { type: 'recipe' });
  assert.ok(csv.results.every(result => result.type === 'recipe'));
  assert.match(csv.results[0].next.at(-1), /recipe-install\.mjs add csv-export/);
});

test('label matching uses whole tokens and versioned-module recipes merge into their module', async () => {
  const sources = await loadSources();
  const results = findInSources(sources, 'table', { limit: 25 }).results;
  assert.ok(!results.some(result => result.id === 'tabler-icons'));
  assert.equal(results.filter(result => result.id === 'data-table').length, 1);
});

test('find validates its options and rejects empty queries', async () => {
  const sources = await loadSources();
  assert.throws(() => findInSources(sources, '  '), /Provide task words/);
  assert.throws(() => findInSources(sources, 'table', { limit: 0 }), /Limit/);
  assert.throws(() => findInSources(sources, 'table', { type: 'everything' }), /Type must be/);
});

test('detect reads manifests without executing project code', async t => {
  const directory = await project(t, {
    'package.json': JSON.stringify({ dependencies: { react: '^18.3.1', next: '15.0.0' }, devDependencies: { typescript: '5.9.3' }, engines: { node: '>=22' } }),
    'pnpm-lock.yaml': '', 'go.mod': 'module example\n',
  });
  const profile = await detectProject(directory);
  assert.deepEqual(profile.languages, ['go', 'typescript']);
  assert.deepEqual(profile.frameworks, ['next.js', 'react']);
  assert.equal(profile.reactMajor, 18);
  assert.equal(profile.packageManager, 'pnpm');
  assert.equal(profile.nodeEngine, '>=22');
});

test('detect rejects missing targets and symlinked roots', async t => {
  await assert.rejects(detectProject(path.join(os.tmpdir(), 'genlib-missing-' + process.pid)), /does not exist/);
  const directory = await project(t, {});
  const link = directory + '-link';
  await fs.symlink(directory, link);
  t.after(() => fs.rm(link, { force: true }));
  await assert.rejects(detectProject(link), /real directory/);
});

test('a detected project hides known mismatches and labels the remaining fit', async t => {
  const sources = await loadSources();
  const vue = await detectProject(await project(t, { 'package.json': JSON.stringify({ dependencies: { vue: '3' }, devDependencies: { typescript: '5' } }) }));
  const result = findInSources(sources, 'table pagination', { profile: vue, target: vue.target, limit: 25 });
  assert.ok(!result.results.some(item => item.id === 'data-table'));
  assert.ok(result.hiddenIncompatible >= 1);
  const python = await detectProject(await project(t, { 'pyproject.toml': '[project]\nname = "x"\n' }));
  const pagination = findInSources(sources, 'pagination', { profile: python, target: python.target, type: 'language-example' });
  assert.equal(pagination.results.find(item => item.id === 'python-pagination').fit, 'compatible');
  assert.equal(pagination.results.find(item => item.id === 'go-pagination').fit, 'incompatible');
});

test('CLI exposes find, detect and catalog with strict options', async t => {
  const found = run('find', 'dark', 'theme', '--limit', '3', '--json');
  assert.equal(found.status, 0, found.stderr);
  const body = JSON.parse(found.stdout);
  assert.equal(body.results[0].id, 'theme-tokens');
  assert.ok(body.results.length <= 3);
  const directory = await project(t, { 'package.json': '{"dependencies":{"react":"19.0.0"}}' });
  const detected = JSON.parse(run('detect', '--target', directory, '--json').stdout);
  assert.deepEqual(detected.frameworks, ['react']);
  const catalog = JSON.parse(run('catalog', '--json').stdout);
  assert.ok(catalog.counts.module >= 6 && catalog.templates.some(item => item.id === 'ship-starter'));
  assert.equal(run('find', '--json').status, 1);
  assert.equal(run('find', 'table', '--framework', 'react').status, 1);
  assert.equal(run('find', 'table', '--limit', 'many').status, 1);
});

test('code-location tasks reach the repository map, AST graph and diagram tools', async () => {
  const sources = await loadSources();
  const located = findInSources(sources, 'where is the code for this task in the codebase');
  assert.equal(located.results[0].type, 'tool');
  assert.equal(located.results[0].id, 'repo-context');
  assert.ok(located.results[0].next.some(command => command.includes('tools/repo-context.mjs')));
  const diagram = findInSources(sources, 'architecture diagram', { type: 'tool' });
  assert.equal(diagram.results[0].id, 'repo-diagram');
});

test('module results list installed files, exports and module dependencies', async () => {
  const sources = await loadSources();
  const webhook = findInSources(sources, 'webhook signature', { type: 'module' }).results[0];
  assert.equal(webhook.id, 'webhook-verification');
  assert.ok(webhook.installs.includes('webhook-verification/providers.ts'));
  assert.ok(webhook.exports.includes('verifyStripeWebhook'));
  const table = findInSources(sources, 'data table', { type: 'module' }).results[0];
  assert.deepEqual(table.dependencies, ['theme-tokens']);
});

test('resource results lead with install steps and flag license review first', async () => {
  const sources = await loadSources();
  const queue = findInSources(sources, 'bullmq', { type: 'resource' }).results[0];
  assert.equal(queue.id, 'bullmq');
  assert.equal(queue.next[0], 'npm install bullmq');
  assert.match(queue.next.at(-1), /resources\.mjs inspect bullmq/);
  const restricted = sources.resources.find(item => item.integrationMode === 'license-review');
  const hit = findInSources(sources, restricted.id, { type: 'resource', limit: 25 }).results.find(item => item.id === restricted.id);
  assert.match(hit.next[0], /^License review required/);
});

test('a multi-word query naming a whole entry outranks partial and stemmed matches', async () => {
  // "canvas" stems to "canva"; the whole phrase still picks Canvas LMS over Canva.
  assert.equal(queryTerms('canvas lms').phrase, 'canvas-lms');
  const sources = await loadSources();
  for (const [query, id] of [['canvas lms', 'canvas-lms'], ['firefly iii', 'firefly-iii'], ['financial freedom', 'financial-freedom'], ['open edx', 'open-edx'], ['kubernetes', 'kubernetes'], ['browser-use', 'browser-use']]) {
    assert.equal(findInSources(sources, query, { type: 'resource', limit: 3 }).results[0].id, id, query);
  }
});

// Regressions from the 2026-10-10 adoption audit: wrong-stack first recommendations.
test('receiving-project fit steers framework, SDK language, MCP vendor and dependency-free selection', async () => {
  const sources = await loadSources();
  const { jevPacket } = await import('../lib/jev.mjs');
  const svelte = { languages: ['typescript'], frameworks: ['svelte'] };
  const table = findInSources(sources, 'data table', { profile: svelte, limit: 5 }).results;
  assert.ok(!table.some(result => result.id === 'react-table-craft'), 'a React-only table is hidden in a Svelte project');
  assert.equal(table[0].id, 'tanstack-table');
  const go = { languages: ['go'], frameworks: [] };
  const stripe = findInSources(sources, 'stripe api', { profile: go, limit: 4 }).results;
  const api = stripe.find(result => result.id === 'stripe-com');
  assert.ok(api.next.every(step => !/^(npm|uvx) /.test(step)), 'no npm or Python generator steps for a Go project');
  assert.ok(api.next.includes('# go SDK in the catalog: resource:stripe-go-go (Stripe Go SDK)'));
  assert.ok(stripe.some(result => result.id === 'stripe-go-go' && result.fit === 'compatible'));
  const mcp = findInSources(sources, 'github mcp', { profile: { languages: ['python'], frameworks: [] }, limit: 3 }).results;
  assert.equal(mcp[0].id, 'io-github-github-github-mcp-server');
  // A deployed application's implementation language is not the app's: it stays reviewable, not hidden.
  const elixirApp = sources.resources.find(resource => resource.kind === 'application' && resource.integrationMode === 'service' && resource.languages?.length && !resource.languages.includes('python'));
  if (elixirApp) assert.notEqual(findInSources(sources, elixirApp.name, { profile: { languages: ['python'], frameworks: [] }, type: 'resource', limit: 25 }).results.find(result => result.id === elixirApp.id)?.fit, 'incompatible');
  const packet = jevPacket(sources, 'password hashing', { profile: { languages: ['python'], frameworks: [] }, stdlibOnly: true });
  assert.ok(!packet.state.candidates.some(candidate => candidate.id === 'password-hashing'), 'the pip-installed cookbook is not offered under a no-dependency constraint');
  assert.ok(jevPacket(sources, 'password hashing', { profile: { languages: ['python'], frameworks: [] } }).state.candidates.some(candidate => candidate.id === 'password-hashing'));
});

test('a package listed by several records surfaces once, under its strictest record', async () => {
  const sources = await loadSources();
  const aliases = sources.resourceAliases;
  assert.ok(aliases.size >= 80);
  // Every alias names a package record that still exists and is not itself an alias.
  const ids = new Set(sources.resources.map(resource => resource.id));
  for (const [alias, canonical] of aliases) { assert.ok(ids.has(alias) && ids.has(canonical) && !aliases.has(canonical), alias); }
  const results = findInSources(sources, 'discord js', { limit: 8 }).results;
  assert.equal(results.filter(result => ['discord-js', 'discord-js-npm'].includes(result.id)).length, 1);
  // A license-review flag is never lost to a duplicate without it.
  assert.equal(aliases.get('knocklabs-node'), 'knocklabs-node-npm');
});

test('sign-up-only services point at the vendor SDK or CLI, and every mapped id exists', async () => {
  const sources = await loadSources();
  const resources = new Set(sources.resources.map(resource => resource.id));
  const clis = new Set(sources.cli.map(entry => entry.name));
  for (const [service, refs] of Object.entries(sources.serviceSdks)) {
    assert.ok(resources.has(service), service);
    for (const ref of refs) { const [type, id] = ref.split(':'); assert.ok(type === 'resource' ? resources.has(id) : clis.has(id), ref); }
  }
  const mailchimp = findInSources(sources, 'mailchimp', { type: 'resource', limit: 3 }).results.find(result => result.id === 'mailchimp');
  assert.ok(mailchimp.next.includes('# vendor SDK: resource:mailchimp-mailchimp-marketing'));
  assert.ok(mailchimp.next.some(step => step.startsWith('npm install @mailchimp/mailchimp_marketing')));
  // A link-only record with a repository gets a pinned clone step instead of nothing to run.
  const kinetics = findInSources(sources, 'kinetics', { type: 'resource', limit: 3 }).results.find(result => result.id === 'kinetics');
  assert.ok(kinetics.next.some(step => step.includes('genlib.mjs source kinetics')));
});
