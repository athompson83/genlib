#!/usr/bin/env node
// Original Genlib starter, Apache-2.0. No dependencies or network requests.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DOCUMENTS = new Set([
  'README.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md', 'SECURITY.md',
  'CHANGELOG.md', 'CODE_OF_CONDUCT.md', 'SUPPORT.md',
]);
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const validCommit = value => typeof value === 'string' && COMMIT.test(value) && !/^0+$/.test(value);
const full = (reason, fileCount = null) => ({ docsOnly: false, reason, fileCount });

// Deliberately narrow: MDX, configuration, licenses, lockfiles, scripts,
// workflows, unknown files, and an empty/invalid diff require full checks.
export function classifyPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return full('empty-or-invalid-diff');
  for (const relative of paths) {
    if (typeof relative !== 'string' || relative.length === 0 || /[\\\u0000-\u001f\u007f]/.test(relative)) {
      return full('invalid-path', paths.length);
    }
    const segments = relative.split('/');
    if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
      return full('invalid-path', paths.length);
    }
    const markdownInDocs = relative.startsWith('docs/') && relative.endsWith('.md')
      && segments.every(segment => !segment.startsWith('.'));
    if (!ROOT_DOCUMENTS.has(relative) && !markdownInDocs) return full('source-or-unknown-path', paths.length);
  }
  return { docsOnly: true, reason: 'reviewed-document-paths', fileCount: paths.length };
}

export function selectComparison(eventName, event) {
  let base, head, mergeBase = false;
  if (eventName === 'pull_request') {
    base = event?.pull_request?.base?.sha;
    head = event?.pull_request?.head?.sha;
    mergeBase = true;
  } else if (eventName === 'push') {
    base = event?.before;
    head = event?.after;
  } else {
    // Merge queues, manual runs, and new/unknown events run the whole suite.
    return null;
  }
  return validCommit(base) && validCommit(head) ? { base, head, mergeBase } : null;
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
  });
}

export function classifyRepositoryChanges({ eventName, event, cwd = process.cwd(), runGit = git }) {
  const comparison = selectComparison(eventName, event);
  if (!comparison) return full('full-check-event-or-missing-shas');
  try {
    const { head } = comparison;
    let { base } = comparison;
    runGit(['cat-file', '-e', `${base}^{commit}`], cwd);
    runGit(['cat-file', '-e', `${head}^{commit}`], cwd);
    if (comparison.mergeBase) {
      base = runGit(['merge-base', base, head], cwd).trim();
      if (!validCommit(base)) return full('missing-merge-base');
    }
    // Disabling rename detection retains both the removed source path and
    // the added docs path when a source file is renamed into docs/.
    const output = runGit(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', base, head, '--'], cwd);
    if (output !== '' && !output.endsWith('\0')) return full('incomplete-diff');
    const paths = output === '' ? [] : output.slice(0, -1).split('\0');
    return classifyPaths(paths);
  } catch {
    // Shallow/missing history, diff size limits, or git errors cannot skip tests.
    return full('comparison-unavailable');
  }
}

export function main(environment = process.env) {
  let result;
  try {
    const event = JSON.parse(readFileSync(environment.GITHUB_EVENT_PATH, 'utf8'));
    result = classifyRepositoryChanges({ eventName: environment.GITHUB_EVENT_NAME, event });
  } catch {
    result = full('event-unavailable');
  }
  // Only bounded classification values reach the Actions output protocol;
  // filenames and attacker-controlled event text are never interpolated.
  if (environment.GITHUB_OUTPUT) {
    appendFileSync(environment.GITHUB_OUTPUT, `docs_only=${result.docsOnly}\nreason=${result.reason}\n`);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
