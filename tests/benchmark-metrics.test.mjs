import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { measureTranscript, summarizeResults } from '../benchmarks/feature-tasks/measure.mjs';

const measurePath = fileURLToPath(new URL('../benchmarks/feature-tasks/measure.mjs', import.meta.url));
const assistant = (id, content, usage, timestamp) => ({
  type: 'assistant', timestamp, message: { id, content, usage }
});

test('full-written-output proxy includes generation despite partial usage and counts cached input once per call', () => {
  const usage = { input_tokens: 100, cache_creation_input_tokens: 200, cache_read_input_tokens: 300, output_tokens: 5 };
  const row = measureTranscript('fixture-arm1', [
    assistant('call-1', [{ type: 'text', text: 'x'.repeat(3500) }], usage, '2026-10-12T10:00:00Z'),
    // A later partial usage record for the same call must not duplicate input.
    assistant('call-1', [], { output_tokens: 9 }, '2026-10-12T10:00:07Z')
  ]);
  assert.equal(row.turns, 1);
  assert.equal(row.inputTokens, 600);
  assert.equal(row.writtenTok, 1000);
  assert.equal(row.estimatedCostIndex, 100 + 1.25 * 200 + 0.1 * 300 + 5 * 1000);
  assert.equal(row.cost2, row.estimatedCostIndex);
  assert.equal(row.costIndex, 100 + 1.25 * 200 + 0.1 * 300 + 5 * 9);
  assert.equal(row.outputTokens, 9);
  assert.equal(row.outputTokensComplete, false);
  assert.equal(row.costBasis, 'written-characters/3.5');
  assert.equal(row.seconds, 7);
});

test('tool inputs are written output, tool results are read estimates, and time may be unavailable', () => {
  const input = { command: 'node bin/genlib.mjs quick table' };
  const row = measureTranscript('fixture-arm3', [
    assistant('call-1', [{ type: 'tool_use', id: 'tool-1', input }], { input_tokens: 2, output_tokens: 1 }),
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'x'.repeat(350) }] } }
  ]);
  assert.equal(row.estimatedCostIndex, Math.round(2 + 5 * JSON.stringify(input).length / 3.5));
  assert.equal(row.writtenTok, Math.round(JSON.stringify(input).length / 3.5));
  assert.equal(row.readTok, 100);
  assert.equal(row.genlib, 1);
  assert.equal(row.seconds, null);
});

test('empty traces and model calls without recorded input usage cannot become free measurements', () => {
  assert.throws(() => measureTranscript('empty-arm1', []), /No model-call usage/);
  assert.throws(() => measureTranscript('missing-arm1', [
    assistant('call-1', [{ type: 'text', text: 'unfinished output' }])
  ]), /No model-call usage/);
  assert.throws(() => measureTranscript('partial-arm1', [
    assistant('call-1', [{ type: 'text', text: 'partial output' }], { output_tokens: 3 })
  ]), /Incomplete input usage/);
  assert.throws(() => measureTranscript('mixed-arm1', [
    assistant('call-1', [{ type: 'text', text: 'known call' }], { input_tokens: 100 }),
    assistant('call-2', [{ type: 'text', text: 'unaccounted call' }])
  ]), /Incomplete input usage/);
});

test('summary prefers canonical estimates, accepts historical schemas, and keeps failed attempts and zero-call counts', () => {
  const result = summarizeResults({ runs: [
    { run: 'first-arm1', estimatedCostIndex: 100, cost2: 90, costIndex: 1, seconds: 9, genlib: 0 },
    { run: 'second-arm1', cost2: 200, costIndex: 2, writtenTok: 20, seconds: 11, genlib: 1 },
    { run: 'third-arm1', accepted: false, costIndex: 300, writtenTokensEstimate: 10, readTokensEstimate: 20, seconds: 10, genlibCalls: 0 }
  ] });
  assert.equal(result.metric, 'estimatedCostIndex');
  assert.equal(result.groups.length, 1);
  assert.deepEqual(result.groups[0], {
    arm: 'arm1', model: null, genlibCommit: null, runs: 3,
    estimatedCostIndexTotal: 600, estimatedCostIndexMean: 200,
    elapsedSecondsMean: 10, zeroGenlibCallRuns: 2
  });
});

test('same arm at different revisions or models is not pooled with an original guidance run', () => {
  const result = summarizeResults({ model: 'Opus', genlibCommit: 'original', runs: [
    { run: 'recurring-o3a', arm: 'o3', cost2: 100, seconds: 1, genlib: 2 },
    { run: 'recurring-o3b', arm: 'o3', cost2: 200, seconds: 3, genlib: 2 },
    { run: 'recurring-o3c', arm: 'o3', genlibCommit: 'skip-rule', cost2: 50, seconds: 1, genlib: 0 },
    { run: 'recurring-o3d', arm: 'o3', model: 'Haiku', cost2: 400, seconds: 4, genlib: 1 }
  ] });
  assert.equal(result.groups.length, 3);
  assert.deepEqual(result.groups.map(group => [group.model, group.genlibCommit, group.runs, group.estimatedCostIndexMean]), [
    ['Opus', 'original', 2, 150], ['Opus', 'skip-rule', 1, 50], ['Haiku', 'original', 1, 400]
  ]);
});

test('missing measurements and partial-output-only rows cannot silently enter a cost summary', () => {
  assert.throws(() => summarizeResults({ runs: [{ run: 'fixture-arm1', missing: true }] }), /Incomplete measurement/);
  assert.throws(() => summarizeResults({ runs: [{ run: 'fixture-arm1', costIndex: 200, writtenTok: 300 }] }), /No full-written-output cost estimate/);
  assert.throws(() => summarizeResults({ runs: [] }), /non-empty runs array/);
  const result = summarizeResults([{ run: 'fixture-arm1', cost2: 100 }]);
  assert.equal(result.groups[0].elapsedSecondsMean, null);
  assert.equal(result.groups[0].zeroGenlibCallRuns, null);
});

test('invalid usage and cost estimates are rejected instead of falling back to a cheaper field', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => measureTranscript('invalid-arm1', [
      assistant('call-1', [], { input_tokens: value })
    ]), /Invalid input_tokens/);
    assert.throws(() => measureTranscript('invalid-arm1', [
      assistant('call-1', [], { input_tokens: 10, cache_read_input_tokens: value })
    ]), /Invalid cache_read_input_tokens/);
    assert.throws(() => summarizeResults([{ run: 'invalid-arm1', estimatedCostIndex: value, cost2: 100 }]), /Invalid estimatedCostIndex/);
    assert.throws(() => summarizeResults([{ run: 'invalid-arm1', cost2: value, costIndex: 100, writtenTokensEstimate: 20, readTokensEstimate: 10 }]), /Invalid cost2/);
  }
  assert.throws(() => summarizeResults([{ run: 'invalid-arm1', costIndex: -1, writtenTokensEstimate: 20, readTokensEstimate: 10 }]), /Invalid costIndex/);
});

test('round-12 corrected means retain original and revised guidance groups without changing archived rows', () => {
  const document = JSON.parse(readFileSync(new URL('../benchmarks/feature-tasks/results-round12.json', import.meta.url), 'utf8'));
  const before = JSON.stringify(document);
  const result = summarizeResults(document);
  assert.equal(JSON.stringify(document), before);
  assert.equal(result.groups.length, 8);
  const mean = (arm, commit = 'eea8c8e') => result.groups.find(group => group.arm === arm && group.genlibCommit === commit).estimatedCostIndexMean;
  assert.equal(mean('o1'), 340941.5);
  assert.equal(mean('o2'), 384199);
  assert.equal(mean('h1'), 644889.5);
  assert.equal(mean('h2'), 828450.5);
  assert.equal(mean('o3', 'bd52765'), 294407);
  assert.equal(mean('h3', 'bd52765'), 692964.5);
  assert.equal(((mean('o2') / mean('o1') - 1) * 100).toFixed(2), '12.69');
  assert.equal(((mean('h2') / mean('h1') - 1) * 100).toFixed(2), '28.46');
  assert.equal(result.groups.find(group => group.arm === 'o3' && group.genlibCommit === 'bd52765').zeroGenlibCallRuns, 2);
});

test('CLI keeps the existing transcript invocation and adds an offline summary without model calls', () => {
  const directory = mkdtempSync(join(tmpdir(), 'genlib-benchmark-'));
  try {
    writeFileSync(join(directory, 'agents.tsv'), 'fixture-arm1\tagent-1\n');
    writeFileSync(join(directory, 'agent-1.output'), JSON.stringify(assistant('call-1', [{ type: 'text', text: 'example' }], { input_tokens: 10, output_tokens: 1 })) + '\n');
    const output = execFileSync(process.execPath, [measurePath, join(directory, 'agents.tsv'), directory], { encoding: 'utf8' });
    const rows = JSON.parse(output);
    assert.equal(rows[0].estimatedCostIndex, 20);
    assert.equal(rows[0].costIndex, 15);
    assert.equal(rows[0].outputTokensComplete, false);
    writeFileSync(join(directory, 'results.json'), output);
    const summary = JSON.parse(execFileSync(process.execPath, [measurePath, '--summary', join(directory, 'results.json')], { encoding: 'utf8' }));
    assert.equal(summary.groups[0].estimatedCostIndexMean, 20);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI rejects empty, malformed and partial-only transcripts without emitting a zero-cost row', () => {
  const directory = mkdtempSync(join(tmpdir(), 'genlib-benchmark-incomplete-'));
  try {
    writeFileSync(join(directory, 'agents.tsv'), 'fixture-arm1\tagent-1\n');
    const cases = [
      ['', /No model-call usage/],
      ['not-json\n', /Malformed transcript/],
      [JSON.stringify(assistant('call-1', [], { input_tokens: 100 })) + '\n{truncated', /Malformed transcript/],
      [JSON.stringify(assistant('call-1', [], { output_tokens: 3 })), /Incomplete input usage/]
    ];
    for (const [contents, expected] of cases) {
      writeFileSync(join(directory, 'agent-1.output'), contents);
      assert.throws(() => execFileSync(process.execPath, [measurePath, join(directory, 'agents.tsv'), directory], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
      }), error => {
        assert.equal(error.status, 1);
        assert.equal(error.stdout, '');
        assert.match(error.stderr, expected);
        return true;
      });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
