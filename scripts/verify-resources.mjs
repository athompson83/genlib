#!/usr/bin/env node
// Network check for resource records. Read-only: confirms repositories exist (git ls-remote),
// compares registry-declared licenses with the recorded license, and checks that links resolve.
// It downloads no packages and executes no upstream code. Not part of the offline test suite.
// Also flags deprecated npm packages, inactive or yanked PyPI releases and, with --archived and a reachable
// GitHub API, archived repositories.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { loadResources } from '../lib/resources.mjs';

const run = promisify(execFile);
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const fileFilter = option('--file');
const concurrency = Number(option('--concurrency') ?? 8);
const TIMEOUT = 20000;

async function json(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'genlib-resource-verifier (https://github.com/athompson83/genlib)', accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

// Outdated packages: npm marks deprecated releases; PyPI projects declare "Development Status :: 7 - Inactive"
// or yank the release. Recorded per package so a report lists what to replace.
const deprecation = new Map();
async function registryLicense({ ecosystem, name }) {
  if (ecosystem === 'npm') {
    const data = await json('https://registry.npmjs.org/' + name.replace('/', '%2F') + '/latest');
    if (data.deprecated) deprecation.set(ecosystem + ':' + name, String(data.deprecated).slice(0, 160));
    return typeof data.license === 'string' ? data.license : data.license?.type ?? null;
  }
  if (ecosystem === 'pypi') {
    const { info } = await json('https://pypi.org/pypi/' + encodeURIComponent(name) + '/json');
    if (info.yanked || (info.classifiers ?? []).includes('Development Status :: 7 - Inactive')) deprecation.set(ecosystem + ':' + name, info.yanked ? 'yanked: ' + (info.yanked_reason ?? '') : 'Development Status :: 7 - Inactive');
    if (info.license_expression) return info.license_expression;
    const classifier = (info.classifiers ?? []).filter(item => item.startsWith('License :: OSI Approved :: ')).map(item => item.split(' :: ').at(-1));
    return classifier.join(' OR ') || (info.license && info.license.length < 80 ? info.license : null);
  }
  if (ecosystem === 'crates') {
    const data = await json('https://crates.io/api/v1/crates/' + encodeURIComponent(name));
    return data.versions?.[0]?.license ?? null;
  }
  return undefined; // Ecosystem not checked by this script.
}

// Loose comparison: registries spell licenses differently (e.g. "MIT License", "Apache Software License").
const tokens = value => new Set(String(value).toLowerCase().replace(/\b(software|license|licence|version|the)\b/g, ' ').match(/[a-z]+|\d+(?:\.\d+)?/g) ?? []);
function licenseMatches(recorded, declared) {
  if (!recorded || !declared) return null;
  const a = tokens(recorded), b = tokens(declared);
  // "GNU Affero General Public License v3" and "AGPL-3.0" are the same family.
  const alias = set => { if (set.has('affero')) set.add('agpl'); if (set.has('lesser')) set.add('lgpl'); if (set.has('gnu') && set.has('general') && !set.has('affero') && !set.has('lesser')) set.add('gpl'); return set; };
  alias(a); alias(b);
  const families = ['mit', 'apache', 'bsd', 'isc', 'mpl', 'gpl', 'lgpl', 'agpl', 'unlicense', 'zlib', 'cc', 'epl', 'psf', 'python', 'elastic', 'sspl', 'busl', 'bsl'];
  return families.some(family => a.has(family) && b.has(family)) || [...b].some(token => token.length > 2 && a.has(token));
}

// Archived GitHub repositories, when the GitHub API is reachable (set GITHUB_TOKEN in CI to avoid rate limits).
async function archived(url) {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/#?]+)/.exec(url ?? '');
  if (!match) return undefined;
  try {
    const response = await fetch('https://api.github.com/repos/' + match[1].replace(/\.git$/, ''), { headers: { 'user-agent': 'genlib-resource-verifier', accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}) }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!response.ok) return undefined;
    return Boolean((await response.json()).archived);
  } catch { return undefined; }
}

async function repositoryExists(url) {
  if (!url || !/^https:\/\/(github\.com|gitlab\.com|codeberg\.org|bitbucket\.org)\//.test(url)) return undefined;
  // Monorepo package links (…/tree/<ref>/packages/x, GitLab …/-/tree/…) point inside a repository; check the repository.
  const repository = url.replace(/\/(-\/)?(tree|blob)\/.*$/, '').replace(/\/$/, '');
  try {
    await run('git', ['ls-remote', '--exit-code', repository, 'HEAD'], { timeout: TIMEOUT, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    return true;
  } catch { return false; }
}

async function linkResolves(url) {
  if (!url) return undefined;
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 genlib-resource-verifier' }, signal: AbortSignal.timeout(TIMEOUT) });
    await response.body?.cancel();
    return response.status < 400 || response.status === 403 || response.status === 429; // Bot walls are not missing pages.
  } catch { return false; }
}

async function verify(item) {
  const report = { id: item.id, problems: [] };
  report.repository = await repositoryExists(item.repository);
  if (report.repository === false) report.problems.push('repository-missing');
  if (report.repository && process.argv.includes('--archived') && await archived(item.repository)) report.problems.push('repository-archived');
  for (const field of ['homepage', 'docs']) {
    if (item[field] && item[field] !== item.repository && (await linkResolves(item[field])) === false) report.problems.push(field + '-unreachable');
  }
  // Authored quickstart steps must point at reachable URLs (registry JSON, CDN files, copy sources).
  for (const url of new Set((item.quickstart ?? []).flatMap(step => step.match(/https:\/\/[^\s"'`<>)]+/g) ?? []))) {
    if ((await linkResolves(url.replace(/[.,;]$/, ''))) === false) report.problems.push('quickstart-unreachable:' + url);
  }
  report.packages = [];
  for (const entry of item.packages ?? []) {
    try {
      const declared = await registryLicense(entry);
      const match = declared === undefined ? null : licenseMatches(item.license.id, declared);
      report.packages.push({ ...entry, declared, match });
      const outdated = deprecation.get(entry.ecosystem + ':' + entry.name);
      if (outdated) report.problems.push('package-deprecated:' + entry.name + ':' + outdated);
      if (declared === null) report.problems.push('license-undeclared:' + entry.name);
      else if (match === false) report.problems.push('license-mismatch:' + entry.name + ':' + declared);
    } catch (error) {
      report.packages.push({ ...entry, error: error.message });
      report.problems.push('package-missing:' + entry.name);
    }
  }
  return report;
}

const catalog = await loadResources();
const owner = new Map();
for (const entry of catalog.catalogs) {
  for (const candidate of JSON.parse(readFileSync(new URL('../' + entry.path, import.meta.url), 'utf8')).items) owner.set(candidate.id, entry.path);
}
const selected = catalog.items.filter(item => !fileFilter || owner.get(item.id) === fileFilter);
const reports = [];
let cursor = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < selected.length) reports.push(await verify(selected[cursor++]));
}));
reports.sort((a, b) => a.id.localeCompare(b.id));
const failed = reports.filter(report => report.problems.length);
process.stdout.write(JSON.stringify({ checked: reports.length, failed: failed.length, failures: failed, checkedAt: new Date().toISOString() }, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
