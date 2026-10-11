#!/usr/bin/env node
import { loadSources } from '../lib/discover.mjs';
import { evaluateRetrieval } from '../lib/retrieval-eval.mjs';
import { invariant, parseJson, readRegular } from '../lib/safety.mjs';

invariant(process.argv.slice(2).every((arg, index, all) => ['--check', '--json'].includes(arg) && all.indexOf(arg) === index), 'INVALID_OPTION', 'Usage: node tools/retrieval-eval.mjs [--check] [--json]');
const sources = await loadSources();
const fixture = parseJson(await readRegular(sources.root, 'tests/fixtures/retrieval-tasks.json', 256 * 1024), 'retrieval tasks');
const report = evaluateRetrieval(sources, fixture);
process.stdout.write(JSON.stringify(report, null, process.argv.includes('--json') ? 0 : 2) + '\n');
if (process.argv.includes('--check') && report.failed > 0) process.exitCode = 1;
