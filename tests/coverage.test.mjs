// SPDX-License-Identifier: Apache-2.0
// Feature contracts: requirement-level coverage, evidence validation, and application acceptance records.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadCatalog, REPOSITORY_ROOT } from '../lib/catalog.mjs';
import { installModule } from '../lib/install.mjs';
import { checkAdoption } from '../lib/lifecycle.mjs';
import { acceptanceProblems, ciPacks, contractCoverage, findContract, formatCoverage, loadContracts, validateContracts } from '../lib/coverage.mjs';
import { loadSources, searchEntries } from '../lib/discover.mjs';

const contracts = loadContracts(REPOSITORY_ROOT);
const base = () => structuredClone(contracts.find(contract => contract.id === 'rbac'));
const CLI = path.join(REPOSITORY_ROOT, 'bin/genlib.mjs');

test('every committed contract is valid, resolves in the catalogs and cites real tests', async () => {
  const refs = new Set(searchEntries(await loadSources(REPOSITORY_ROOT)).map(entry => `${entry.type}:${entry.id}`));
  const { tasks } = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, 'tests/fixtures/gap-tasks.json'), 'utf8'));
  assert.deepEqual(validateContracts(REPOSITORY_ROOT, contracts, { known: ref => refs.has(ref), tasks }), []);
});

test('validation rejects invented evidence, unknown requirements and unsupported statuses', () => {
  const problems = contract => validateContracts(REPOSITORY_ROOT, [contract]);
  const fakeName = base();
  fakeName.implementations[0].evidence[0].name = 'a test that does not exist anywhere';
  assert.match(problems(fakeName).join('\n'), /no test in tests\/rbac.test.mjs contains/);
  const missingFile = base();
  missingFile.implementations[0].evidence[0].test = 'tests/nope.test.mjs';
  assert.match(problems(missingFile).join('\n'), /does not exist/);
  const noEvidence = base();
  noEvidence.implementations[0].evidence = noEvidence.implementations[0].evidence.filter(item => item.requirement !== 'last-owner');
  assert.match(problems(noEvidence).join('\n'), /fixture-verified requirement last-owner has no evidence/);
  const unknown = base();
  unknown.implementations[0].fulfills.push('teleportation');
  assert.match(problems(unknown).join('\n'), /unknown requirement teleportation/);
  const selfVerified = base();
  selfVerified.implementations[0].status = 'application-verified';
  assert.match(problems(selfVerified).join('\n'), /application-verified comes from app receipts/);
  const notRunByCi = base();
  notRunByCi.implementations[0].evidence[0].test = 'examples/recipes/utilities/slugify.ts';
  assert.match(problems(notRunByCi).join('\n'), /is not a test CI runs/);
  const packEvidence = base();
  packEvidence.implementations[0].evidence[0] = { requirement: 'role-definitions', test: 'integrations/durable-jobs/tests/inbox.test.mjs', name: 'a title that is not there' };
  assert.match(problems(packEvidence).join('\n'), /no test in integrations\/durable-jobs\/tests\/inbox.test.mjs contains/, 'pack tests in the CI matrix are accepted as evidence files');
  assert.match(validateContracts(REPOSITORY_ROOT, [packEvidence], { packs: new Set() }).join('\n'), /is not a test CI runs/, 'a pack outside the CI matrix is not');
  const notInCatalog = base();
  assert.match(validateContracts(REPOSITORY_ROOT, [notInCatalog], { known: () => false }).join('\n'), /not found in the catalogs/);
  const duplicateTask = [base(), { ...base(), id: 'rbac-copy' }];
  assert.match(validateContracts(REPOSITORY_ROOT, duplicateTask).join('\n'), /already belongs to rbac/);
  assert.match(validateContracts(REPOSITORY_ROOT, [base()], { tasks: ['an unlisted task'] }).join('\n'), /has no feature contract/);
});

test('coverage credits requirements, not search hits: full, partial, unverified and none', () => {
  assert.equal(contractCoverage(base()).level, 'full');
  const partial = base();
  partial.implementations[0].status = 'install-supported';
  partial.implementations.push({ ref: 'module:rbac', status: 'fixture-verified', fulfills: ['tenant-scope'], evidence: [] });
  assert.equal(contractCoverage(partial).level, 'partial');
  assert.equal(contractCoverage(partial).verified, '1/6');
  const unverified = base();
  unverified.implementations.forEach(impl => { impl.status = 'cataloged'; });
  assert.equal(contractCoverage(unverified).level, 'unverified');
  const none = { ...base(), implementations: [] };
  const result = contractCoverage(none);
  assert.equal(result.level, 'none');
  assert.equal(result.missing.length, 6);
  assert.match(formatCoverage(result), /not verified by Genlib: role-definitions/);
  assert.equal(findContract(contracts, 'role-based access control checks')?.id, 'rbac');
  assert.equal(findContract(contracts, 'quantum teleportation pipeline'), null);
});

test('acceptance keys must name a requirement the module claims', () => {
  assert.deepEqual(acceptanceProblems(contracts, 'rbac', ['rbac#route-guard']), []);
  assert.match(acceptanceProblems(contracts, 'rbac', ['nope#x']).join(), /Unknown contract/);
  assert.match(acceptanceProblems(contracts, 'rbac', ['rbac#nope']).join(), /Unknown requirement/);
  assert.match(acceptanceProblems(contracts, 'comments', ['rbac#route-guard']).join(), /does not claim/);
});

test('adopted --accepts records requirement-level acceptance that coverage --target reads as application-verified', async t => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'genlib-coverage-'));
  t.after(() => fs.rm(target, { recursive: true, force: true }));
  await fs.writeFile(path.join(target, 'package.json'), JSON.stringify({ name: 'app', type: 'module', devDependencies: { typescript: '5.9.0' } }));
  await installModule(await loadCatalog(REPOSITORY_ROOT), 'rbac', { target });
  await assert.rejects(checkAdoption(target, 'rbac', { accepts: ['rbac#route-guard'] }), /needs --test/);

  // Not imported yet: a passing command is not acceptance.
  const unused = await checkAdoption(target, 'rbac', { test: 'node -e "0"', accepts: ['rbac#route-guard'] });
  assert.deepEqual(unused.accepted, []);
  await fs.mkdir(path.join(target, 'src/routes'), { recursive: true });
  await fs.writeFile(path.join(target, 'src/routes/admin.ts'), "import { requirePermission } from '../genlib/rbac/http.js';\nexport const guard = requirePermission;\n");

  const coverage = () => JSON.parse(execFileSync(process.execPath, [CLI, 'coverage', 'role-based access control checks', '--target', target, '--json'], { encoding: 'utf8' }));
  const failed = await checkAdoption(target, 'rbac', { test: 'node -e "process.exit(1)"', accepts: ['rbac#route-guard'] });
  assert.deepEqual(failed.accepted, []);
  assert.equal(coverage().requirements.find(item => item.id === 'route-guard').status, 'fixture-verified');

  const passed = await checkAdoption(target, 'rbac', { test: 'node -e "0"', accepts: ['rbac#route-guard', 'rbac#tenant-scope'] });
  assert.deepEqual(passed.accepted, ['rbac#route-guard', 'rbac#tenant-scope']);
  const after = coverage();
  assert.equal(after.requirements.find(item => item.id === 'route-guard').status, 'application-verified');
  assert.equal(after.requirements.find(item => item.id === 'last-owner').status, 'fixture-verified');

  // A later failing run for the same requirements withdraws acceptance.
  await checkAdoption(target, 'rbac', { test: 'node -e "process.exit(2)"', accepts: ['rbac#route-guard', 'rbac#tenant-scope'] });
  assert.equal(coverage().requirements.find(item => item.id === 'route-guard').status, 'fixture-verified');

  // The CLI refuses keys the module does not claim.
  assert.throws(() => execFileSync(process.execPath, [CLI, 'adopted', 'rbac', '--target', target, '--test', 'node -e 0', '--accepts', 'stripe-checkout#fulfillment', '--json'], { stdio: 'pipe' }), /does not claim/);
});

test('the CI pack list is read from the workflow matrix', () => {
  const packs = ciPacks(REPOSITORY_ROOT);
  assert.ok(packs.has('durable-jobs') && packs.has('commerce-storefront'));
  assert.ok(!packs.has('native-persistence'), 'non-Node packs run in other jobs and are not node:test evidence');
});
