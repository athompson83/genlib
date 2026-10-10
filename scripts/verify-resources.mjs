#!/usr/bin/env node
// Network check for resource records. Read-only: confirms repositories exist (git ls-remote),
// compares registry-declared licenses with the recorded license, and checks that links resolve.
// It downloads no packages and executes no upstream code. Not part of the offline test suite.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { loadResources } from '../lib/resources.mjs';
import { licenseMatches } from '../lib/resource-policy.mjs';

const run = promisify(execFile);
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const fileFilter = option('--file');
const ids = option('--ids')?.split(',');
const concurrency = Number(option('--concurrency') ?? 8);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('Concurrency must be 1-32.');
for (let i = 0; i < args.length; i += 2) if (!['--file', '--ids', '--concurrency'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || args.indexOf(args[i]) !== i) throw new Error('Usage: node scripts/verify-resources.mjs [--file resources/catalog/name.json] [--ids id,other-id] [--concurrency 8]');
const TIMEOUT = 20000;

async function json(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'genlib-resource-verifier (https://github.com/athompson83/genlib)', accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

async function registryLicense({ ecosystem, name, version }) {
  if (ecosystem === 'npm') {
    const data = await json('https://registry.npmjs.org/' + name.replace('/', '%2F') + '/' + encodeURIComponent(version ?? 'latest'));
    return typeof data.license === 'string' ? data.license : data.license?.type ?? null;
  }
  if (ecosystem === 'pypi') {
    const { info } = await json('https://pypi.org/pypi/' + encodeURIComponent(name) + (version ? '/' + encodeURIComponent(version) : '') + '/json');
    if (info.license_expression) return info.license_expression;
    const classifier = (info.classifiers ?? []).filter(item => item.startsWith('License :: OSI Approved :: ')).map(item => item.split(' :: ').at(-1));
    return classifier.join(' OR ') || (info.license && info.license.length < 80 ? info.license : null);
  }
  if (ecosystem === 'crates') {
    const data = await json('https://crates.io/api/v1/crates/' + encodeURIComponent(name));
    return (version ? data.versions?.find(item => item.num === version) : data.versions?.[0])?.license ?? null;
  }
  return undefined; // Ecosystem not checked by this script.
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

async function checkLink(url) {
  if (!url) return undefined;
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 genlib-resource-verifier' }, signal: AbortSignal.timeout(TIMEOUT) });
    await response.body?.cancel();
    return { status: response.status, outcome: response.status < 400 ? 'reachable' : [401, 403, 429].includes(response.status) ? 'blocked' : 'unreachable' };
  } catch { return { status: null, outcome: 'unreachable' }; }
}

async function verify(item) {
  const report = { id: item.id, problems: [], links: [], warnings: [] };
  const link = async (url, field) => {
    const result = await checkLink(url);
    report.links.push({ field, url, ...result });
    if (result.outcome === 'unreachable') report.problems.push(field + '-unreachable:' + url);
    if (result.outcome === 'blocked') report.warnings.push(field + '-blocked:' + result.status);
  };
  report.repository = await repositoryExists(item.repository);
  if (report.repository === false) report.problems.push('repository-missing');
  for (const field of ['homepage', 'docs']) {
    if (item[field] && item[field] !== item.repository) await link(item[field], field);
  }
  // Authored quickstart steps must point at reachable URLs (registry JSON, CDN files, copy sources).
  for (const url of new Set((item.quickstart ?? []).flatMap(step => step.match(/https:\/\/[^\s"'`<>)]+/g) ?? []))) {
    await link(url.replace(/[.,;]$/, ''), 'quickstart');
  }
  report.packages = [];
  for (const entry of item.packages ?? []) {
    try {
      const declared = await registryLicense(entry);
      const match = declared === undefined ? null : licenseMatches(item.license.id, declared);
      report.packages.push({ ...entry, checkedVersion: entry.version ?? 'registry-current', declared, match });
      if (declared === undefined) report.warnings.push('ecosystem-license-not-checked:' + entry.name);
      else if (match === null) report.warnings.push('license-comparison-unknown:' + entry.name);
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
const selected = catalog.items.filter(item => (!fileFilter || owner.get(item.id) === fileFilter) && (!ids || ids.includes(item.id)));
if (selected.length === 0 || (ids && ids.some(id => !selected.some(item => item.id === id)))) throw new Error('Selection contains an unknown resource or no records.');
const reports = [];
let cursor = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < selected.length) reports.push(await verify(selected[cursor++]));
}));
reports.sort((a, b) => a.id.localeCompare(b.id));
const failed = reports.filter(report => report.problems.length);
const review = reports.filter(report => report.warnings.length);
process.stdout.write(JSON.stringify({ checked: reports.length, failed: failed.length, failures: failed, reviewRequired: review.length, reviews: review, checkedAt: new Date().toISOString(), scope: 'Repository/link reachability and available package-license declarations only. Blocked links and unchecked ecosystems remain unverified; this is not runtime or license clearance.' }, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
