#!/usr/bin/env node
// Routing evaluation: how often one `genlib quick` call picks the right capability for a task phrasing.
//   node scripts/routing-eval.mjs [--misses]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findInSources, loadSources } from '../lib/discover.mjs';
import { quickPick } from '../lib/brief.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export async function routingEval(sets = JSON.parse(readFileSync(ROOT + 'tests/fixtures/routing-queries.json', 'utf8'))) {
  const sources = await loadSources(ROOT);
  const profile = { languages: ['python'], frameworks: [] };
  const report = {};
  for (const name of ['tuning', 'heldout']) {
    let top1 = 0, top3 = 0;
    const misses = [];
    for (const [query, want] of sets[name]) {
      const found = findInSources(sources, query, { limit: 4, profile });
      const refs = found.results.map(result => `${result.type}:${result.id}`);
      const best = quickPick(found)?.best ?? refs[0];
      if (best === 'capability:' + want) top1++; else misses.push({ query, want, got: best });
      if (refs.slice(0, 3).includes('capability:' + want)) top3++;
    }
    const total = sets[name].length;
    report[name] = { total, top1: top1 / total, top3: top3 / total, misses };
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await routingEval();
  for (const [name, { total, top1, top3, misses }] of Object.entries(report)) {
    console.log(`${name}: ${total} queries, top-1 ${(top1 * 100).toFixed(1)}%, top-3 ${(top3 * 100).toFixed(1)}%`);
    if (process.argv.includes('--misses')) for (const miss of misses) console.log(`  ${miss.query} -> ${miss.got} (want ${miss.want})`);
  }
}
