#!/usr/bin/env node
// Validates resources/feature-contracts/*.json: structure, that every referenced implementation exists in the
// catalogs, that fixture-verified claims name a real test in a real test file, and (with --gaps) that every
// task in tests/fixtures/gap-tasks.json has a contract. Offline; exits 1 on any problem.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadContracts, validateContracts } from '../lib/coverage.mjs';
import { loadSources, searchEntries } from '../lib/discover.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const contracts = loadContracts(root);
const refs = new Set(searchEntries(await loadSources(root)).map(entry => `${entry.type}:${entry.id}`));
const tasks = process.argv.includes('--gaps') ? JSON.parse(readFileSync(new URL('../tests/fixtures/gap-tasks.json', import.meta.url), 'utf8')).tasks : [];
const problems = validateContracts(root, contracts, { known: ref => refs.has(ref), tasks });
if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(JSON.stringify({ valid: true, contracts: contracts.length, implementations: contracts.reduce((sum, c) => sum + (c.implementations ?? []).length, 0) }));
