import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSources } from '../lib/discover.mjs';
import { evaluateRetrieval } from '../lib/retrieval-eval.mjs';
import { readRegular, parseJson } from '../lib/safety.mjs';

test('realistic application tasks find reusable code and preserve negative policy cases', async () => {
  const sources = await loadSources();
  const fixture = parseJson(await readRegular(sources.root, 'tests/fixtures/retrieval-tasks.json'), 'retrieval tasks');
  const report = evaluateRetrieval(sources, fixture);
  assert.equal(report.failed, 0, JSON.stringify(report.results.filter(item => !item.passed), null, 2));
  assert.ok(report.tasks >= 20);
  assert.ok(report.maxDecisionCharacters <= 20000);
  assert.ok(report.medianSearchBytes > 0);
  assert.match(report.measurement, /No model calls/);
});
