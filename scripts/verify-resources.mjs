#!/usr/bin/env node
// Network check for resource records. Read-only: confirms repositories exist (git ls-remote),
// compares registry-declared licenses with the recorded license, and checks that links resolve.
// It downloads no packages and executes no upstream code. Not part of the offline test suite.
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

async function registryLicense({ ecosystem, name }) {
  if (ecosystem === 'npm') {
    const data = await json('https://registry.npmjs.org/' + name.replace('/', '%2F') + '/latest');
    return typeof data.license === 'string' ? data.license : data.license?.type ?? null;
  }
  if (ecosystem === 'pypi') {
    const { info } = await json('https://pypi.org/pypi/' + encodeURIComponent(name) + '/json');
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
  const families = ['mit', 'apache', 'bsd', 'isc', 'mpl', 'gpl', 'lgpl', 'agpl', 'unlicense', 'zlib', 'cc', 'epl', 'psf', 'python', 'elastic', 'sspl', 'busl', 'bsl'];
  return families.some(family => a.has(family) && b.has(family)) || [...b].some(token => token.length > 2 && a.has(token));
}

async function repositoryExists(url) {
  if (!url || !/^https:\/\/(github\.com|gitlab\.com|codeberg\.org|bitbucket\.org)\//.test(url)) return undefined;
  try {
    await run('git', ['ls-remote', '--exit-code', url, 'HEAD'], { timeout: TIMEOUT, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
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
  for (const field of ['homepage', 'docs']) {
    if (item[field] && item[field] !== item.repository && (await linkResolves(item[field])) === false) report.problems.push(field + '-unreachable');
  }
  report.packages = [];
  for (const entry of item.packages ?? []) {
    try {
      const declared = await registryLicense(entry);
      const match = declared === undefined ? null : licenseMatches(item.license.id, declared);
      report.packages.push({ ...entry, declared, match });
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
