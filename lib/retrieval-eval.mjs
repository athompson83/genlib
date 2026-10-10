import { performance } from 'node:perf_hooks';
import { findInSources } from './discover.mjs';
import { JEV_LIMITS, jevPacket } from './jev.mjs';
import { isPermissive } from './resource-policy.mjs';
import { invariant, object } from './safety.mjs';

// Measures deterministic retrieval and serialized context only, never model tokens.
export function evaluateRetrieval(sources, fixture) {
  invariant(object(fixture) && fixture.schemaVersion === 1 && Array.isArray(fixture.tasks) && fixture.tasks.length > 0 && fixture.tasks.length <= 200, 'INVALID_FIXTURE', 'Expected 1-200 retrieval tasks.');
  const results = [], ids = new Set();
  for (const task of fixture.tasks) {
    invariant(object(task) && typeof task.id === 'string' && !ids.has(task.id) && typeof task.query === 'string' && Array.isArray(task.expectedAny) && task.expectedAny.length > 0 && Number.isInteger(task.maxRank) && task.maxRank >= 1 && task.maxRank <= 8, 'INVALID_FIXTURE', 'Invalid retrieval task.');
    ids.add(task.id);
    const options = { type: task.type, profile: task.profile, includeRetired: task.includeRetired ?? false, licensePolicy: task.licensePolicy ?? 'any', limit: 8 };
    const start = performance.now();
    const found = findInSources(sources, task.query, options);
    const elapsedMs = Math.round((performance.now() - start) * 100) / 100;
    const refs = found.results.map(item => `${item.type}:${item.id}`);
    const rank = refs.findIndex(ref => task.expectedAny.includes(ref));
    const violations = [];
    for (const entry of found.results) {
      const lifecycle = typeof entry.lifecycle === 'string' ? entry.lifecycle : entry.lifecycle?.status;
      if (task.forbiddenLifecycle?.includes(lifecycle)) violations.push(`forbidden-lifecycle:${entry.type}:${entry.id}`);
      if (task.requirePermissive && !isPermissive(entry.license)) violations.push(`license-policy:${entry.type}:${entry.id}`);
    }
    const packet = jevPacket(sources, task.query, options);
    if (packet.limits.characters > JEV_LIMITS.stateChars || packet.questions.length > JEV_LIMITS.candidates) violations.push('decision-envelope');
    const packetHit = packet.state.candidates.some(item => task.expectedAny.includes(`${item.type}:${item.id}`));
    results.push({ id: task.id, query: task.query, passed: rank >= 0 && rank < task.maxRank && packetHit && violations.length === 0, rank: rank < 0 ? null : rank + 1, maxRank: task.maxRank, refs, violations, jevHit: packetHit, searchBytes: Buffer.byteLength(JSON.stringify(found)), packetBytes: Buffer.byteLength(JSON.stringify(packet)), decisionCharacters: packet.limits.characters, elapsedMs });
  }
  const passed = results.filter(item => item.passed).length;
  const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * fraction) - 1)];
  return { schemaVersion: 1, tasks: results.length, passed, failed: results.length - passed, recall: passed / results.length, maxPacketBytes: Math.max(...results.map(item => item.packetBytes)), maxDecisionCharacters: Math.max(...results.map(item => item.decisionCharacters)), medianSearchBytes: percentile(results.map(item => item.searchBytes), 0.5), p95SearchMs: percentile(results.map(item => item.elapsedMs), 0.95), measurement: 'Offline lexical retrieval, serialized bytes and local elapsed time. No model calls, token counts, cost savings or application acceptance are measured.', results };
}
