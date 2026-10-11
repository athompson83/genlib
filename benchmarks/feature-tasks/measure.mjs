// Per-run measures from a subagent transcript (JSONL). Usage: node measure.mjs <agents.tsv> <tasksDir>
import { readFileSync, existsSync } from 'node:fs';
const [tsv, dir] = process.argv.slice(2);
const text = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => x.text ?? (typeof x.content === 'string' ? x.content : JSON.stringify(x.content ?? ''))).join('') : JSON.stringify(c ?? '');
const rows = [];
for (const line of readFileSync(tsv, 'utf8').trim().split('\n')) {
  const [run, id] = line.split('\t');
  const file = `${dir}/${id}.output`;
  if (!existsSync(file)) { rows.push({ run, missing: true }); continue; }
  const events = readFileSync(file, 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const calls = new Map(); const toolUses = new Map(); let written = 0, read = 0, first = null, last = null;
  const testRuns = []; const tools = { genlib: 0, ctx7: 0, shadcn: 0, skillRead: 0 };
  for (const e of events) {
    if (e.timestamp) { const t = Date.parse(e.timestamp); first ??= t; last = t; }
    const m = e.message; if (!m || !Array.isArray(m.content)) continue;
    if (e.type === 'assistant') {
      if (m.id && m.usage) { const prev = calls.get(m.id); calls.set(m.id, { ...m.usage, output_tokens: Math.max(prev?.output_tokens ?? 0, m.usage.output_tokens ?? 0) }); }
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
  let input = 0, cacheWrite = 0, cacheRead = 0, output = 0;
  for (const u of calls.values()) { input += u.input_tokens ?? 0; cacheWrite += u.cache_creation_input_tokens ?? 0; cacheRead += u.cache_read_input_tokens ?? 0; output += u.output_tokens ?? 0; }
  const lastPass = testRuns.lastIndexOf('pass');
  const repairs = testRuns.slice(0, lastPass < 0 ? testRuns.length : lastPass).filter(r => r === 'fail').length;
  rows.push({ run, turns: calls.size, inputTokens: input + cacheWrite + cacheRead, outputTokens: output,
    costIndex: Math.round(input + 1.25 * cacheWrite + 0.1 * cacheRead + 5 * output), cost2: Math.round(input + 1.25 * cacheWrite + 0.1 * cacheRead + 5 * written / 3.5), cacheWrite, cacheRead,
    writtenTok: Math.round(written / 3.5), readTok: Math.round(read / 3.5), seconds: Math.round((last - first) / 1000),
    testRuns: testRuns.length, repairs, ...tools });
}
console.log(JSON.stringify(rows, null, 1));
