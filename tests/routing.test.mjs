import test from 'node:test';
import assert from 'node:assert/strict';
import { routingEval } from '../scripts/routing-eval.mjs';

// One `genlib quick` call should land on the right tested code; a wrong first pick costs the agent turns.
// Thresholds sit a little below the measured scores (tuning 98%, held-out 81% top-1, 88% top-3) so catalog growth
// that buries Genlib's own code fails here instead of silently costing tokens.
test('quick routes task phrasings to the right capability', async () => {
  const report = await routingEval();
  assert.ok(report.tuning.top1 >= 0.95, 'tuning top-1 ' + report.tuning.top1);
  assert.ok(report.heldout.top1 >= 0.78, 'held-out top-1 ' + report.heldout.top1);
  assert.ok(report.heldout.top3 >= 0.85, 'held-out top-3 ' + report.heldout.top3);
});
