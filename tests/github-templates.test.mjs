import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyPaths, classifyRepositoryChanges, selectComparison } from '../templates/github/.github/scripts/classify-changes.mjs';

const classifier = fileURLToPath(new URL('../templates/github/.github/scripts/classify-changes.mjs', import.meta.url));
const shaA = 'a'.repeat(40), shaB = 'b'.repeat(40);
const prEvent = (base, head) => ({ pull_request: { base: { sha: base }, head: { sha: head } } });

function git(cwd, args) {
  return execFileSync('git', [
    '-c', 'user.name=Genlib fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${path.join(cwd, 'no-hooks')}`,
    ...args,
  ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function fixture(t) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'genlib-github-template-'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.mkdir(path.join(cwd, 'docs'));
  await fs.mkdir(path.join(cwd, 'src'));
  await fs.writeFile(path.join(cwd, 'README.md'), '# Fixture\n');
  await fs.writeFile(path.join(cwd, 'docs/guide.md'), '# Original guide\n');
  await fs.writeFile(path.join(cwd, 'src/index.js'), 'export const value = 1;\n');
  git(cwd, ['init', '--quiet', '--initial-branch=main']);
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '--quiet', '-m', 'Initial fixture']);
  return { cwd, initial: git(cwd, ['rev-parse', 'HEAD']) };
}

test('CI classifier permits reviewed plain-document paths and requires full checks elsewhere', () => {
  assert.equal(classifyPaths(['README.md', 'SECURITY.md', 'docs/setup.md', 'docs/runbooks/release notes.md']).docsOnly, true);
  for (const changed of [
    'src/index.ts', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock',
    '.github/workflows/ci.yml', '.github/scripts/classify-changes.mjs', 'LICENSE', 'NOTICE',
    'docs/api/openapi.yaml', 'docs/components/widget.tsx', 'docs/page.mdx', 'docs/.config.md',
    'scripts/release.mjs', 'README.MD', 'new-folder/unknown.md', 'AGENTS.md', 'docs/image.svg',
  ]) {
    assert.equal(classifyPaths(['README.md', changed]).docsOnly, false, changed);
  }
});

test('CI classifier never treats empty, ambiguous, or malformed paths as docs-only', () => {
  for (const input of [undefined, null, [], '', [''], [null], ['docs/../src/code.md'],
    ['/docs/guide.md'], ['docs//guide.md'], ['docs/./guide.md'], ['docs\\guide.md'],
    ['docs/new\nname.md'], ['docs/tab\tname.md'], ['docs/null\0name.md']]) {
    assert.equal(classifyPaths(input).docsOnly, false, JSON.stringify(input));
  }
});

test('CI comparisons use event SHAs and select full checks for unsupported or invalid metadata', () => {
  assert.deepEqual(selectComparison('pull_request', prEvent(shaA, shaB)), { base: shaA, head: shaB, mergeBase: true });
  assert.deepEqual(selectComparison('push', { before: shaA, after: shaB }), { base: shaA, head: shaB, mergeBase: false });
  for (const [eventName, event] of [
    ['push', { before: '0'.repeat(40), after: shaB }],
    ['push', { before: '--output=unsafe', after: shaB }],
    ['pull_request', {}], ['pull_request', prEvent('main', shaB)],
    ['merge_group', { merge_group: { base_sha: shaA, head_sha: shaB } }],
    ['workflow_dispatch', {}], ['unknown', {}],
  ]) {
    assert.equal(selectComparison(eventName, event), null);
    assert.equal(classifyRepositoryChanges({ eventName, event, runGit: () => { throw new Error('should not call Git'); } }).docsOnly, false);
  }
});

test('PR classifier uses the merge base even after unrelated source changes land on base', async t => {
  const { cwd, initial } = await fixture(t);
  git(cwd, ['checkout', '--quiet', '-b', 'docs-update']);
  await fs.writeFile(path.join(cwd, 'docs/guide.md'), '# Updated guide\n');
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '--quiet', '-m', 'Document a workflow']);
  const docsHead = git(cwd, ['rev-parse', 'HEAD']);
  git(cwd, ['checkout', '--quiet', 'main']);
  await fs.writeFile(path.join(cwd, 'src/index.js'), 'export const value = 2;\n');
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '--quiet', '-m', 'Unrelated base source change']);
  const movedBase = git(cwd, ['rev-parse', 'HEAD']);

  const result = classifyRepositoryChanges({ eventName: 'pull_request', event: prEvent(movedBase, docsHead), cwd });
  assert.equal(result.docsOnly, true);
  assert.equal(result.fileCount, 1);
  assert.equal(classifyRepositoryChanges({ eventName: 'push', event: { before: initial, after: movedBase }, cwd }).docsOnly, false);
  assert.equal(classifyRepositoryChanges({ eventName: 'push', event: { before: initial, after: docsHead }, cwd }).docsOnly, true);
});

test('source renames into docs and deleted source files still require full checks', async t => {
  const { cwd, initial } = await fixture(t);
  git(cwd, ['mv', 'src/index.js', 'docs/implementation.md']);
  git(cwd, ['commit', '--quiet', '-m', 'Rename source into docs']);
  const head = git(cwd, ['rev-parse', 'HEAD']);
  const result = classifyRepositoryChanges({ eventName: 'pull_request', event: prEvent(initial, head), cwd });
  assert.equal(result.docsOnly, false);
  assert.equal(result.fileCount, 2);
});

test('missing history, empty diff, truncated output, and failed Git select full checks', async t => {
  const { cwd, initial } = await fixture(t);
  assert.equal(classifyRepositoryChanges({ eventName: 'pull_request', event: prEvent(initial, shaB), cwd }).docsOnly, false);
  assert.equal(classifyRepositoryChanges({ eventName: 'push', event: { before: initial, after: initial }, cwd }).docsOnly, false);
  const failed = classifyRepositoryChanges({ eventName: 'push', event: { before: shaA, after: shaB }, runGit: () => { throw new Error('Git unavailable'); } });
  assert.equal(failed.docsOnly, false);
  const truncated = classifyRepositoryChanges({
    eventName: 'push', event: { before: shaA, after: shaB },
    runGit: args => args[0] === 'diff' ? 'docs/guide.md' : '',
  });
  assert.equal(truncated.docsOnly, false);
});

test('CLI writes bounded Actions outputs for a real docs-only event without echoing event text', async t => {
  const { cwd, initial } = await fixture(t);
  await fs.writeFile(path.join(cwd, 'docs/guide.md'), '# New guide\n');
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '--quiet', '-m', 'Docs-only change']);
  const head = git(cwd, ['rev-parse', 'HEAD']);
  const eventPath = path.join(cwd, 'event.json'), outputPath = path.join(cwd, 'actions-output.txt');
  await fs.writeFile(eventPath, JSON.stringify({ ...prEvent(initial, head), title: 'untrusted\ndocs_only=true\ntext' }));
  const result = spawnSync(process.execPath, [classifier], {
    cwd, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).docsOnly, true);
  assert.doesNotMatch(result.stdout, /untrusted/);
  assert.equal(await fs.readFile(outputPath, 'utf8'), 'docs_only=true\nreason=reviewed-document-paths\n');
});

test('CLI defaults to full verification when its event file is unavailable or malformed', async t => {
  const { cwd } = await fixture(t);
  const eventPath = path.join(cwd, 'event.json');
  for (const malformed of [null, '{broken-json']) {
    if (malformed !== null) await fs.writeFile(eventPath, malformed);
    const outputPath = path.join(cwd, malformed === null ? 'missing.txt' : 'malformed.txt');
    const result = spawnSync(process.execPath, [classifier], {
      cwd, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).docsOnly, false);
    assert.match(await fs.readFile(outputPath, 'utf8'), /^docs_only=false\n/);
  }
});
