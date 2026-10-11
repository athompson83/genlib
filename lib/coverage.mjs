// SPDX-License-Identifier: Apache-2.0
// Feature contracts: what an application feature requires, and which Genlib (or external) implementations
// fulfill which requirements, with evidence. Coverage is credited per requirement, never per search hit:
// a utility that ranks for "account deletion" earns nothing unless it fulfills a listed requirement.
//
// Status ladder for an implementation's claim on a requirement (lowest to highest):
//   cataloged             Genlib knows where the resource is
//   plan-available        Genlib can explain the adoption requirements
//   install-supported     Genlib has a reproducible install path
//   fixture-verified      a named repository test exercises the requirement
//   application-verified  the receiving app recorded a passing acceptance command for the requirement
// The first four live in resources/feature-contracts/*.json; the last is read from the app's receipts.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { GenlibError, invariant } from './safety.mjs';

export const STATUSES = ['cataloged', 'plan-available', 'install-supported', 'fixture-verified', 'application-verified'];
const AUTHORED = STATUSES.slice(0, 4);
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REF = /^(capability|module|integration|provider|recipe|language-example|template|tool|skill|mcp|cli|api|resource|starter|task):[A-Za-z0-9._@/-]+$/;
const rank = status => STATUSES.indexOf(status);

// The id an adopted artifact has in .genlib (its receipt name) → the ref contracts use: modules are module:<id>,
// provider profiles adopted with provider adopt are provider--<id> → provider:<id>.
export function artifactRef(id) {
  return id.startsWith('provider--') ? `provider:${id.slice('provider--'.length)}` : `module:${id}`;
}

export function contractsDirectory(root) {
  return path.join(root, 'resources', 'feature-contracts');
}

/** Loads every contract file; throws on malformed structure (references are checked by validateContracts). */
export function loadContracts(root) {
  const dir = contractsDirectory(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => {
    const contract = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
    invariant(contract && contract.id + '.json' === name, 'INVALID_CONTRACT', `${name}: id must match the file name`);
    return contract;
  });
}

// Test names declared in a test file: test('...'), test("...") or test(`...`), including it()/describe-free forms.
const testNames = new Map();
function declaredTests(root, file) {
  if (!testNames.has(file)) {
    const full = path.join(root, file);
    const text = existsSync(full) ? readFileSync(full, 'utf8') : null;
    testNames.set(file, text === null ? null : [...text.matchAll(/\b(?:test|it)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)].map(match => match[2]));
  }
  return testNames.get(file);
}

/**
 * Structural and evidence validation. `known(ref)` reports whether a reference resolves in the catalogs.
 * Returns a list of problems (empty when valid).
 */
// Evidence must be a test CI actually runs: the repository suite (tests/) or the tests of an integration pack in the
// CI matrix (.github/workflows/integration-profiles.yml, node-packs), which runs `npm test` in that pack.
export function ciPacks(root) {
  const file = path.join(root, '.github/workflows/integration-profiles.yml');
  if (!existsSync(file)) return new Set();
  const workflow = readFileSync(file, 'utf8');
  const block = /node-packs:[\s\S]*?matrix:\s*\n\s*pack:\s*\n((?:\s*- [a-z0-9-]+\s*\n)+)/.exec(workflow);
  return new Set(block ? [...block[1].matchAll(/- ([a-z0-9-]+)/g)].map(match => match[1]) : []);
}

function ciRunsTest(file, packs) {
  if (/^tests\/[\w.-]+\.test\.mjs$/.test(file)) return true;
  const match = /^integrations\/([a-z0-9-]+)\/tests\/[\w.-]+\.test\.mjs$/.exec(file);
  return Boolean(match && packs.has(match[1]));
}

export function validateContracts(root, contracts, { known = () => true, tasks = [], packs = ciPacks(root) } = {}) {
  const problems = [];
  const seenTasks = new Map();
  const ids = new Set();
  for (const contract of contracts) {
    const where = `contract ${contract.id}`;
    const fail = message => problems.push(`${where}: ${message}`);
    if (!ID.test(contract.id ?? '')) fail('id must be kebab-case');
    if (ids.has(contract.id)) fail('duplicate id');
    ids.add(contract.id);
    if (typeof contract.title !== 'string' || !contract.title || contract.title.length > 120) fail('title is required (at most 120 characters)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(contract.reviewed ?? '')) fail('reviewed must be a YYYY-MM-DD date');
    if (!Array.isArray(contract.tasks) || contract.tasks.some(task => typeof task !== 'string' || !task)) fail('tasks must list task phrasings');
    for (const task of contract.tasks ?? []) {
      if (seenTasks.has(task)) fail(`task "${task}" already belongs to ${seenTasks.get(task)}`);
      seenTasks.set(task, contract.id);
    }
    const requirements = new Set();
    if (!Array.isArray(contract.requirements) || contract.requirements.length < 2 || contract.requirements.length > 15) fail('list 2-15 requirements');
    for (const requirement of contract.requirements ?? []) {
      if (!ID.test(requirement.id ?? '') || typeof requirement.text !== 'string' || !requirement.text) fail('each requirement needs a kebab-case id and text');
      else if (requirements.has(requirement.id)) fail(`duplicate requirement ${requirement.id}`);
      requirements.add(requirement.id);
    }
    for (const impl of contract.implementations ?? []) {
      const at = `${impl.ref ?? '?'}`;
      if (!REF.test(impl.ref ?? '')) { fail(`${at}: ref must be type:id`); continue; }
      if (!known(impl.ref)) fail(`${at}: not found in the catalogs`);
      if (!AUTHORED.includes(impl.status)) fail(`${at}: status must be one of ${AUTHORED.join(', ')} (application-verified comes from app receipts)`);
      if (!Array.isArray(impl.fulfills) || !impl.fulfills.length) fail(`${at}: fulfills must list requirement ids`);
      for (const id of impl.fulfills ?? []) if (!requirements.has(id)) fail(`${at}: unknown requirement ${id}`);
      if (impl.status === 'fixture-verified') {
        for (const id of impl.fulfills ?? []) {
          const evidence = (impl.evidence ?? []).filter(item => item.requirement === id);
          if (!evidence.length) { fail(`${at}: fixture-verified requirement ${id} has no evidence`); continue; }
          for (const item of evidence) {
            const names = declaredTests(root, item.test ?? '');
            if (!ciRunsTest(item.test ?? '', packs)) fail(`${at}: evidence ${item.test} is not a test CI runs (tests/*.test.mjs, or integrations/<pack>/tests/*.test.mjs for a pack in the CI matrix)`);
            else if (names === null) fail(`${at}: evidence file ${item.test} does not exist`);
            else if (typeof item.name !== 'string' || item.name.length < 8 || !names.some(name => name.includes(item.name))) fail(`${at}: no test in ${item.test} contains "${item.name}"`);
          }
        }
      }
    }
    for (const [label, list] of [['missing', contract.missing]]) {
      for (const id of list ?? []) if (!requirements.has(id)) fail(`${label} names unknown requirement ${id}`);
    }
  }
  for (const task of tasks) if (!seenTasks.has(task)) problems.push(`gap task "${task}" has no feature contract`);
  return problems;
}

// Receipt acceptance records in a receiving app: .genlib/receipts/<module>.json → acceptance[].
function applicationAcceptance(target) {
  const accepted = new Map(); // `${contract}#${requirement}` → module id
  if (!target) return accepted;
  const dir = path.join(target, '.genlib', 'receipts');
  if (!existsSync(dir)) return accepted;
  for (const name of readdirSync(dir).filter(file => file.endsWith('.json'))) {
    let receipt;
    try { receipt = JSON.parse(readFileSync(path.join(dir, name), 'utf8')); } catch { continue; }
    for (const record of receipt.acceptance ?? []) {
      if (record.exitCode !== 0) continue;
      for (const key of record.requirements ?? []) accepted.set(key, receipt.module);
    }
  }
  return accepted;
}

/** Per-requirement coverage for one contract, optionally upgraded by the receiving app's acceptance records. */
export function contractCoverage(contract, { target } = {}) {
  const accepted = applicationAcceptance(target);
  const requirements = contract.requirements.map(requirement => {
    const claims = (contract.implementations ?? []).filter(impl => impl.fulfills.includes(requirement.id))
      .map(impl => ({ ref: impl.ref, status: impl.status }));
    const appModule = accepted.get(`${contract.id}#${requirement.id}`);
    const appRef = appModule ? artifactRef(appModule) : null;
    if (appRef && claims.some(claim => claim.ref === appRef)) claims.push({ ref: appRef, status: 'application-verified' });
    const best = claims.sort((a, b) => rank(b.status) - rank(a.status))[0] ?? null;
    return { id: requirement.id, text: requirement.text, status: best?.status ?? 'none', by: best?.ref ?? null };
  });
  const verified = requirements.filter(item => rank(item.status) >= rank('fixture-verified')).length;
  const claimed = requirements.filter(item => item.status !== 'none').length;
  const level = verified === requirements.length ? 'full' : verified > 0 ? 'partial' : claimed > 0 ? 'unverified' : 'none';
  return {
    contract: contract.id, title: contract.title, level,
    verified: `${verified}/${requirements.length}`,
    requirements,
    implementations: (contract.implementations ?? []).map(impl => ({ ref: impl.ref, status: impl.status, fulfills: impl.fulfills, ...(impl.notes ? { notes: impl.notes } : {}) })),
    missing: requirements.filter(item => rank(item.status) < rank('fixture-verified')).map(item => item.id),
    ...(contract.notes ? { notes: contract.notes } : {}),
  };
}

const words = text => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Finds the contract for a task phrase: exact task match first, then the best word overlap with title and tasks. */
export function findContract(contracts, query) {
  const exact = contracts.find(contract => contract.id === query || contract.tasks.includes(query));
  if (exact) return exact;
  const wanted = new Set(words(query).filter(word => word.length > 2));
  let best = null, bestScore = 0;
  for (const contract of contracts) {
    const have = new Set(words([contract.title, ...contract.tasks].join(' ')));
    const score = [...wanted].filter(word => have.has(word)).length / Math.max(wanted.size, 1);
    if (score > bestScore) { best = contract; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

export function coverageFor(root, query, { target } = {}) {
  const contracts = loadContracts(root);
  const contract = findContract(contracts, query);
  if (!contract) throw new GenlibError('NO_CONTRACT', `No feature contract matches "${query}". genlib coverage --list shows the contracts.`);
  return contractCoverage(contract, { target });
}

/** Problems with `--accepts` keys for a module: unknown contract or requirement, or a module that does not claim it. */
export function acceptanceProblems(contracts, moduleId, keys) {
  const problems = [];
  for (const key of keys) {
    const [contractId, requirementId] = key.split('#');
    const contract = contracts.find(item => item.id === contractId);
    if (!contract) { problems.push(`Unknown contract in ${key}.`); continue; }
    if (!contract.requirements.some(item => item.id === requirementId)) { problems.push(`Unknown requirement in ${key}.`); continue; }
    const ref = artifactRef(moduleId);
    if (!(contract.implementations ?? []).some(impl => impl.ref === ref && impl.fulfills.includes(requirementId))) {
      problems.push(`${ref} does not claim ${key} in resources/feature-contracts/${contractId}.json.`);
    }
  }
  return problems;
}

const MARK = { 'application-verified': 'app', 'fixture-verified': 'test', 'install-supported': 'install', 'plan-available': 'plan', cataloged: 'catalog', none: '-' };

/** Compact text for agents: one line per requirement with its best status and implementation. */
export function formatCoverage(result) {
  const lines = [`${result.contract}: ${result.level} (${result.verified} requirements verified)`];
  for (const item of result.requirements) lines.push(`  ${MARK[item.status].padEnd(7)} ${item.id}${item.by ? ' <- ' + item.by : ''}`);
  if (result.missing.length) lines.push(`# not verified by Genlib: ${result.missing.join(', ')} (write or adopt this part yourself)`);
  if (result.notes) lines.push('# ' + result.notes);
  return lines.join('\n');
}
