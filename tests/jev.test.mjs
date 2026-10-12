import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findInSources, loadSources, queryLanguage, queryTerms } from '../lib/discover.mjs';
import { JEV_LIMITS, jevPacket } from '../lib/jev.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [root + 'bin/genlib.mjs', ...args], { encoding: 'utf8' });
const sources = await loadSources();

test('packet asks one independent yes/no question per candidate inside the decision envelope', () => {
  const packet = jevPacket(sources, 'add passkey login to a Go API');
  assert.equal(packet.schema, 'genlib.jev/v1');
  assert.ok(packet.state.candidates.length >= 1 && packet.state.candidates.length <= JEV_LIMITS.candidates);
  assert.equal(packet.questions.length, packet.state.candidates.length);
  assert.ok(packet.questions.every(question => question.kind === 'yes_no' && packet.next[question.ref]?.length > 0));
  assert.ok(packet.limits.characters <= JEV_LIMITS.stateChars);
  assert.equal(packet.decision.type, 'independent-membership');
  assert.equal(packet.decision.threshold, 0.8);
  // The named language selects the Go implementation of the passkey capability.
  const passkeys = packet.state.candidates.find(candidate => candidate.id === 'webauthn-passkeys');
  assert.ok(passkeys, JSON.stringify(packet.state.candidates.map(candidate => candidate.id)));
  assert.match(packet.next[passkeys.ref][0], /language-modules\.mjs add go-webauthn-passkeys/);
});

test('oversized tasks are clipped and limits are enforced', () => {
  const packet = jevPacket(sources, 'pdf form '.repeat(600), { limit: 3 });
  assert.ok(packet.state.task.length <= JEV_LIMITS.taskChars);
  assert.ok(packet.state.candidates.length <= 3);
  assert.throws(() => jevPacket(sources, 'pdf', { limit: 9 }), /Limit must be/);
  assert.throws(() => jevPacket(sources, '   '), /Provide the task/);
});

test('an unmatched task returns no candidates and a discovery escape path', () => {
  const packet = jevPacket(sources, 'qqqzzz xxyyzz');
  assert.equal(packet.state.candidates.length, 0);
  assert.match(packet.escape, /catalog/);
});

test('stopwords, short substrings and language words do not distort search', () => {
  assert.deepEqual(queryTerms('how to add a capability').words, ['capability']);
  assert.equal(queryLanguage('saml login in C#'), 'csharp');
  assert.equal(queryLanguage('flutter push notifications'), 'dart');
  assert.equal(findInSources(sources, 'nonexistent zz').results.length, 0);
  assert.equal(findInSources(sources, 'how to add a capability').results[0].id, 'docs/capabilities.md#adding-a-capability');
});

test('documentation sections are searchable with an exact line range to read', () => {
  const hit = findInSources(sources, 'adding a capability', { type: 'doc' }).results[0];
  assert.equal(hit.file, 'docs/capabilities.md');
  assert.ok(hit.lines[0] <= hit.lines[1]);
  assert.match(hit.next[0], new RegExp(`^sed -n '${hit.lines[0]},${hit.lines[1]}p'`));
  const text = readFileSync(root + hit.file, 'utf8').split('\n');
  assert.match(text[hit.lines[0] - 1], /^#+ Adding a capability/);
});

test('jev CLI returns the packet and rejects bad options', () => {
  const ok = run('jev', 'verify', 'stripe', 'webhook', '--limit', '4', '--json');
  assert.equal(ok.status, 0, ok.stderr);
  const packet = JSON.parse(ok.stdout);
  assert.ok(packet.state.candidates.some(candidate => candidate.id === 'webhook-verification'));
  assert.equal(run('jev', '--json').status, 1);
  assert.equal(run('jev', 'pdf', '--limit', '20').status, 1);
});

test('the committed search index is current and covers every source type', () => {
  const check = spawnSync(process.execPath, [root + 'scripts/build-search-index.mjs', '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, 'Run npm run index:build: ' + check.stdout);
  const lines = readFileSync(root + 'registry/search-index.jsonl', 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const types = new Set(lines.map(line => line.type));
  for (const type of ['capability', 'module', 'integration', 'recipe', 'language-example', 'template', 'tool', 'skill', 'mcp', 'cli', 'api', 'resource', 'doc']) assert.ok(types.has(type), type);
  assert.ok(lines.every(line => line.ref === `${line.type}:${line.id}` && line.next && line.title));
  for (const recipe of sources.recipes.filter(entry => entry.caveat)) {
    const indexed = lines.find(entry => entry.ref === `recipe:${recipe.id}`);
    assert.equal(indexed.title, recipe.title ?? recipe.id);
    assert.equal(indexed.caveat, recipe.caveat.slice(0, 200));
  }
});

test('a no-dependency constraint keeps only candidates that need no install and is stated in the packet', () => {
  const plain = jevPacket(sources, 'expand rrule recurrence rules like dateutil');
  assert.ok(plain.state.candidates.some(candidate => candidate.type === 'resource'), 'baseline packet should include external resources');
  assert.equal(plain.state.constraints, undefined);
  for (const task of ['expand rrule recurrence rules like dateutil, standard library only', 'expand rrule recurrence rules; no third-party dependencies', 'expand rrule recurrence rules; do not install packages']) {
    const packet = jevPacket(sources, task);
    assert.ok(packet.state.constraints?.length, task);
    assert.ok(packet.state.candidates.length > 0 && packet.state.candidates.every(candidate => ['capability', 'module', 'recipe', 'language-example', 'template', 'tool', 'doc'].includes(candidate.type)), task);
    assert.match(packet.questions[0].question, /dependency the task forbids/);
  }
  assert.equal(jevPacket(sources, 'expand rrule recurrence rules', { stdlibOnly: true }).state.candidates.every(candidate => candidate.type !== 'resource'), true);
  assert.equal(jevPacket(sources, 'expand rrule recurrence rules, standard library only', { stdlibOnly: false }).state.constraints, undefined);
});

test('a capability caveat travels with the candidate and the question asks to weigh it', () => {
  const packet = jevPacket(sources, 'unified diff byte-identical to GNU diff -u', { limit: 3 });
  const diff = packet.state.candidates.find(candidate => candidate.id === 'line-diff');
  assert.match(diff.caveat, /not byte-identical to GNU diff/);
  assert.match(packet.questions.find(question => question.ref === diff.ref).question, /caveat conflicts/);
  const plain = packet.state.candidates.find(candidate => !candidate.caveat);
  if (plain) assert.doesNotMatch(packet.questions.find(question => question.ref === plain.ref).question, /caveat/);
});

test('the CLI honours --stdlib-only and --prompt prints a compact direct-call prompt', () => {
  const run = (...args) => spawnSync(process.execPath, [new URL('../bin/genlib.mjs', import.meta.url).pathname, 'jev', ...args], { encoding: 'utf8' });
  const strict = run('expand', 'recurring', 'events', '--stdlib-only', '--json');
  assert.equal(strict.status, 0, strict.stderr);
  assert.ok(JSON.parse(strict.stdout).state.constraints.length === 1);
  const prompt = run('unified', 'diff', 'identical', 'to', 'GNU', 'diff', '-u', '--prompt');
  assert.equal(prompt.status, 0, prompt.stderr);
  assert.match(prompt.stdout, /^Task: unified diff/);
  assert.match(prompt.stdout, /caveat: .*GNU diff.* If the task needs what this caveat rules out, answer below 0.3 for /);
  assert.match(prompt.stdout, /Reply with only JSON: \{"q-c1": p/);
  const json = run('unified', 'diff', 'identical', 'to', 'GNU', 'diff', '-u', '--json');
  assert.ok(prompt.stdout.length < json.stdout.length / 2, `prompt ${prompt.stdout.length} vs packet ${json.stdout.length}`);
});

test('candidates far below the best match are left out of the packet', () => {
  const packet = jevPacket(sources, 'sign and verify webhook signatures');
  const scores = findInSources(sources, 'sign and verify webhook signatures', { limit: 8 }).results.map(result => result.score);
  assert.ok(packet.state.candidates.length <= scores.filter(score => score >= scores[0] * 0.4).length);
  assert.equal(packet.state.candidates[0].id, findInSources(sources, 'sign and verify webhook signatures', { limit: 1 }).results[0].id);
});

test('a no-dependency Go packet leaves out language examples that wrap a library', () => {
  const packet = jevPacket(sources, 'password hashing in go, no dependencies');
  assert.ok(packet.state.constraints?.length);
  assert.ok(!packet.state.candidates.some(candidate => candidate.id === 'go-password-hashing'), JSON.stringify(packet.state.candidates.map(candidate => candidate.id)));
});
