#!/usr/bin/env node
// Network check for resource records. Read-only: confirms repositories exist (git ls-remote),
// compares registry-declared licenses with the recorded license, and checks that links resolve.
// It downloads no packages and executes no upstream code. Not part of the offline test suite.
// Also flags deprecated npm packages, inactive or yanked PyPI releases and, with --archived and a reachable
// GitHub API, archived repositories. With --install it confirms that pinned install steps (npm install x@1.2.3,
// npx x@1.2.3, pip install x==1.2.3) name versions the registry actually has.
// --sample N checks a rotating slice of N records chosen by the UTC day, so a daily run covers the whole catalog
// over time (as shadcn's registry health checks do); --day D replays a given day. The report separates evidence
// layers: source (repository exists), links, packages (exists, license), upstream (deprecated or archived) and
// install. None of these establish behavior; tested Genlib code carries its own test evidence.
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
const sample = option('--sample') === undefined ? undefined : Number(option('--sample'));
const day = Number(option('--day') ?? Math.floor(Date.now() / 86_400_000));
const FLAGS = ['--archived', '--install'];
const checkArchived = args.includes('--archived'), checkInstall = args.includes('--install');
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('Concurrency must be 1-32.');
if (sample !== undefined && (!Number.isInteger(sample) || sample < 1 || sample > 5000)) throw new Error('Sample must be 1-5000.');
if (!Number.isInteger(day) || day < 0) throw new Error('Day must be a non-negative integer.');
const valued = args.filter(arg => !FLAGS.includes(arg));
for (let i = 0; i < valued.length; i += 2) if (!['--file', '--ids', '--concurrency', '--sample', '--day'].includes(valued[i]) || !valued[i + 1] || valued[i + 1].startsWith('--') || valued.indexOf(valued[i]) !== i) throw new Error('Usage: node scripts/verify-resources.mjs [--file resources/catalog/name.json] [--ids id,other-id] [--sample N [--day D]] [--archived] [--install] [--concurrency 8]');
const TIMEOUT = 20000;

async function json(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'genlib-resource-verifier (https://github.com/athompson83/genlib)', accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

// Outdated packages: npm marks deprecated releases; PyPI projects declare "Development Status :: 7 - Inactive"
// or yank the release. Recorded per package so a report lists what to replace.
const deprecation = new Map();
async function registryLicense({ ecosystem, name, version }) {
  if (ecosystem === 'npm') {
    const data = await json('https://registry.npmjs.org/' + name.replace('/', '%2F') + '/' + encodeURIComponent(version ?? 'latest'));
    if (data.deprecated) deprecation.set(ecosystem + ':' + name, String(data.deprecated).slice(0, 160));
    return typeof data.license === 'string' ? data.license : data.license?.type ?? null;
  }
  if (ecosystem === 'pypi') {
    const { info } = await json('https://pypi.org/pypi/' + encodeURIComponent(name) + (version ? '/' + encodeURIComponent(version) : '') + '/json');
    if (info.yanked || (info.classifiers ?? []).includes('Development Status :: 7 - Inactive')) deprecation.set(ecosystem + ':' + name, info.yanked ? 'yanked: ' + (info.yanked_reason ?? '') : 'Development Status :: 7 - Inactive');
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

// npm install x@1.2.3 / npx -y x@1.2.3 / pip install x==1.2.3: does the registry have that exact version?
const PINNED_NPM = /(?:npm (?:install|i)|npx(?: -y)?|pnpm add|yarn add|bunx?)\s+((?:@[\w.-]+\/)?[\w.-]+)@(\d+\.\d+\.\d+[\w.+-]*)/g;
const PINNED_PIP = /pip3? install\s+([\w.-]+)==([\w.+-]+)/g;
async function installProblems(item) {
  const problems = [];
  for (const step of item.quickstart ?? []) {
    for (const [, name, version] of step.matchAll(PINNED_NPM)) {
      try { await json('https://registry.npmjs.org/' + name.replace('/', '%2F') + '/' + version); } catch { problems.push(`install-unresolvable:npm:${name}@${version}`); }
    }
    for (const [, name, version] of step.matchAll(PINNED_PIP)) {
      try { await json(`https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`); } catch { problems.push(`install-unresolvable:pypi:${name}==${version}`); }
    }
  }
  return problems;
}

const LAYERS = { source: /^repository-missing/, links: /-unreachable/, packages: /^(package-missing|license-)/, upstream: /^(package-deprecated|repository-archived)/, install: /^install-/ };
const layerOf = problem => Object.keys(LAYERS).find(name => LAYERS[name].test(problem)) ?? 'other';

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
  if (report.repository && checkArchived && await archived(item.repository)) report.problems.push('repository-archived');
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
      const outdated = deprecation.get(entry.ecosystem + ':' + entry.name);
      if (outdated) report.problems.push('package-deprecated:' + entry.name + ':' + outdated);
      if (declared === undefined) report.warnings.push('ecosystem-license-not-checked:' + entry.name);
      else if (match === null) report.warnings.push('license-comparison-unknown:' + entry.name);
      if (declared === null) report.problems.push('license-undeclared:' + entry.name);
      else if (match === false) report.problems.push('license-mismatch:' + entry.name + ':' + declared);
    } catch (error) {
      report.packages.push({ ...entry, error: error.message });
      report.problems.push('package-missing:' + entry.name);
    }
  }
  if (checkInstall) report.problems.push(...await installProblems(item));
  return report;
}

const catalog = await loadResources();
const owner = new Map();
for (const entry of catalog.catalogs) {
  for (const candidate of JSON.parse(readFileSync(new URL('../' + entry.path, import.meta.url), 'utf8')).items) owner.set(candidate.id, entry.path);
}
const filtered = catalog.items.filter(item => (!fileFilter || owner.get(item.id) === fileFilter) && (!ids || ids.includes(item.id))).sort((a, b) => a.id.localeCompare(b.id));
if (filtered.length === 0 || (ids && ids.some(id => !filtered.some(item => item.id === id)))) throw new Error('Selection contains an unknown resource or no records.');
// A rotating, deterministic slice: day d checks records [d*N, d*N+N) modulo the selection size.
const selected = sample === undefined ? filtered
  : Array.from({ length: Math.min(sample, filtered.length) }, (_, index) => filtered[(day * sample + index) % filtered.length]);
const reports = [];
let cursor = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < selected.length) reports.push(await verify(selected[cursor++]));
}));
reports.sort((a, b) => a.id.localeCompare(b.id));
const failed = reports.filter(report => report.problems.length);
const review = reports.filter(report => report.warnings.length);
const layers = {};
for (const name of [...Object.keys(LAYERS), 'other']) layers[name] = new Set();
for (const report of failed) for (const problem of report.problems) layers[layerOf(problem)].add(report.id);
const failedByLayer = Object.fromEntries(Object.entries(layers).filter(([name, set]) => set.size || name !== 'other').map(([name, set]) => [name, set.size]));
process.stdout.write(JSON.stringify({
  checked: reports.length, ...(sample !== undefined ? { sample: { size: sample, day, of: filtered.length } } : {}),
  failed: failed.length, failedByLayer, failures: failed, reviewRequired: review.length, reviews: review, checkedAt: new Date().toISOString(),
  scope: 'Repository/link reachability, available package-license declarations' + (checkArchived ? ', archived repositories' : '') + ', package deprecation' + (checkInstall ? ' and install resolvability' : '') + ' only. Blocked links and unchecked ecosystems remain unverified; this is not runtime or license clearance.',
}, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
