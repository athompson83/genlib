// Per-run estimates from a subagent transcript (JSONL).
// Usage: node measure.mjs <agents.tsv> <transcripts-dir>
//        node measure.mjs --summary <results.json>
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const text = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => x.text ?? (typeof x.content === 'string' ? x.content : JSON.stringify(x.content ?? ''))).join('') : JSON.stringify(c ?? '');
const nonnegative = (value, field, run) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${field} for ${run}: expected a finite nonnegative number`);
  return value;
};

export function measureTranscript(run, events) {
  const calls = new Map(); const toolUses = new Map(); let written = 0, read = 0, first = null, last = null;
  const observedCalls = new Set();
  const testRuns = []; const tools = { genlib: 0, ctx7: 0, shadcn: 0, skillRead: 0 };
  for (const e of events) {
    if (e.timestamp) { const t = Date.parse(e.timestamp); first ??= t; last = t; }
    const m = e.message; if (!m || !Array.isArray(m.content)) continue;
    if (e.type === 'assistant') {
      if (!m.id) throw new Error(`Missing model-call id for ${run}`);
      observedCalls.add(m.id);
      if (m.usage) {
        for (const field of ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens']) {
          if (field in m.usage) nonnegative(m.usage[field], field, run);
        }
        const prev = calls.get(m.id);
        calls.set(m.id, { ...prev, ...m.usage, output_tokens: Math.max(prev?.output_tokens ?? 0, m.usage.output_tokens ?? 0) });
      }
      for (const c of m.content) {
        if (c.type === 'text') written += c.text.length;
        if (c.type === 'tool_use') {
          const input = JSON.stringify(c.input); written += input.length; toolUses.set(c.id, c);
          const cmd = c.input?.command ?? ''; const path = c.input?.file_path ?? '';
          if (/genlib\.mjs|tools\/language-modules|\/home\/user\/genlib\/tools/.test(cmd)) tools.genlib++;
          if (/ctx7/.test(cmd)) tools.ctx7++;
          if (/shadcn/.test(cmd)) tools.shadcn++;
          if (/superpowers-tdd-SKILL/.test(cmd + path)) tools.skillRead++;
        }
      }
    } else if (e.type === 'user') {
      for (const c of m.content) if (c.type === 'tool_result') {
        const out = text(c.content); read += out.length;
        const use = toolUses.get(c.tool_use_id); const cmd = use?.input?.command ?? '';
        if (/npm (run )?test|node --test|unittest|pytest/.test(cmd)) {
          const fail = /# fail [1-9]|FAILED \(|^not ok|Error:|Traceback|\bfailures=\d/m.test(out) || c.is_error === true;
          testRuns.push(fail ? 'fail' : 'pass');
        }
      }
    }
  }
  if (!calls.size) throw new Error(`No model-call usage for ${run}; an empty or incomplete trace is not a free run`);
  let input = 0, cacheWrite = 0, cacheRead = 0, output = 0;
  for (const id of observedCalls) {
    const u = calls.get(id);
    if (!u || !Number.isFinite(u.input_tokens)) throw new Error(`Incomplete input usage for ${run}, model call ${id}`);
    input += u.input_tokens; cacheWrite += u.cache_creation_input_tokens ?? 0;
    cacheRead += u.cache_read_input_tokens ?? 0; output += u.output_tokens ?? 0;
  }
  const lastPass = testRuns.lastIndexOf('pass');
  const repairs = testRuns.slice(0, lastPass < 0 ? testRuns.length : lastPass).filter(r => r === 'fail').length;
  const weightedInput = input + 1.25 * cacheWrite + 0.1 * cacheRead;
  const estimatedCostIndex = nonnegative(Math.round(weightedInput + 5 * written / 3.5), 'estimatedCostIndex', run);
  return { run, turns: calls.size, inputTokens: input + cacheWrite + cacheRead,
    estimatedCostIndex, costBasis: 'written-characters/3.5',
    // Provider output counts in these transcripts are incomplete. They cannot
    // establish billed spending or exact total tokens, even if a count is > 0.
    outputTokens: output, outputTokensComplete: false,
    // Preserve these historical fields for existing consumers. costIndex is a
    // deprecated partial-output calculation; cost2 aliases the full-output proxy.
    costIndex: Math.round(weightedInput + 5 * output), cost2: estimatedCostIndex, cacheWrite, cacheRead,
    writtenTok: Math.round(written / 3.5), readTok: Math.round(read / 3.5),
    seconds: first === null || last === null ? null : Math.round((last - first) / 1000),
    testRuns: testRuns.length, repairs, ...tools };
}

function estimatedCost(row) {
  if ('estimatedCostIndex' in row) return nonnegative(row.estimatedCostIndex, 'estimatedCostIndex', row.run);
  if ('cost2' in row) return nonnegative(row.cost2, 'cost2', row.run);
  // Rounds 4–6b stored the written-output estimate under costIndex and named the
  // character estimates explicitly. Later rows use cost2; never fall back from
  // that schema to its known partial-output costIndex.
  if (Number.isFinite(row.writtenTokensEstimate) && row.writtenTokensEstimate >= 0
    && Number.isFinite(row.readTokensEstimate) && row.readTokensEstimate >= 0
    && 'costIndex' in row) return nonnegative(row.costIndex, 'costIndex', row.run);
  throw new Error(`No full-written-output cost estimate for ${row.run ?? 'unnamed run'}`);
}

export function summarizeResults(document) {
  const rows = Array.isArray(document) ? document : document.runs;
  if (!Array.isArray(rows) || !rows.length) throw new Error('Expected a non-empty runs array');
  const groups = new Map();
  for (const row of rows) {
    if (row.missing) throw new Error(`Incomplete measurement for ${row.run}; do not drop unfinished runs`);
    const arm = row.arm ?? row.run?.match(/-(arm\d+|[oh]\d+)[a-z]?$/)?.[1];
    if (!arm) throw new Error(`Missing arm for ${row.run ?? 'unnamed run'}`);
    const model = row.model ?? document.model ?? null;
    const genlibCommit = row.genlibCommit ?? document.genlibCommit ?? null;
    const key = JSON.stringify([arm, model, genlibCommit]);
    if (!groups.has(key)) groups.set(key, { arm, model, genlibCommit, rows: [] });
    groups.get(key).rows.push({ ...row, estimate: estimatedCost(row) });
  }
  return {
    metric: 'estimatedCostIndex',
    unit: 'input-token equivalents; written characters/3.5; weights input=1, cache-write=1.25, cache-read=0.1, written=5',
    notes: [
      'Estimates are not billed spending or exact token counts. Historical result files are unchanged.',
      'Groups keep arms, recorded models and Genlib revisions separate; no automatic cross-model or cross-session comparison.',
      'Elapsed time is reported separately. Zero Genlib calls do not establish a saving from reuse.'
    ],
    groups: [...groups.values()].map(({ rows: group, ...identity }) => {
      const total = group.reduce((sum, row) => sum + row.estimate, 0);
      const allTimed = group.every(row => Number.isFinite(row.seconds));
      const calls = group.map(row => row.genlib ?? row.genlibCalls);
      return { ...identity, runs: group.length, estimatedCostIndexTotal: total,
        estimatedCostIndexMean: total / group.length,
        elapsedSecondsMean: allTimed ? group.reduce((sum, row) => sum + row.seconds, 0) / group.length : null,
        zeroGenlibCallRuns: calls.every(Number.isFinite) ? calls.filter(value => value === 0).length : null };
    })
  };
}

function main(args) {
  if (args[0] === '--summary' && args.length === 2) {
    console.log(JSON.stringify(summarizeResults(JSON.parse(readFileSync(args[1], 'utf8'))), null, 1));
    return;
  }
  if (args.length !== 2 || args[0].startsWith('--')) {
    throw new Error('Usage: node measure.mjs <agents.tsv> <transcripts-dir> | --summary <results.json>');
  }
  const [tsv, dir] = args;
  const rows = readFileSync(tsv, 'utf8').trim().split('\n').map(line => {
    const [run, id] = line.split('\t');
    const file = `${dir}/${id}.output`;
    if (!existsSync(file)) return { run, missing: true };
    const events = readFileSync(file, 'utf8').split('\n').flatMap((line, index) => {
      if (!line.trim()) return [];
      try { return [JSON.parse(line)]; }
      catch { throw new Error(`Malformed transcript for ${run} at line ${index + 1}`); }
    });
    return measureTranscript(run, events);
  });
  console.log(JSON.stringify(rows, null, 1));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
