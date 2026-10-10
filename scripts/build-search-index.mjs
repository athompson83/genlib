#!/usr/bin/env node
// Writes registry/search-index.jsonl: one compact line per searchable thing in Genlib (capabilities,
// modules, recipes, language examples, templates, tools, skills, MCP servers, CLIs, APIs, resources and
// documentation sections), with the command that uses it. Agents and Jev can grep or load it without
// reading the repository. `--check` fails when the committed index is stale.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadSources, searchEntries, sourceCounts } from '../lib/discover.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: node scripts/build-search-index.mjs [--check]');
const output = root + 'registry/search-index.jsonl';
const clip = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);

const sources = await loadSources(root);
const lines = searchEntries(sources).map(entry => JSON.stringify({
  ref: `${entry.type}:${entry.id}`, type: entry.type, id: entry.id, title: clip(entry.title, 160), summary: clip(entry.summary, 240),
  terms: [...new Set(entry.labels.join(' ').toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) ?? [])].slice(0, 24),
  ...(entry.languages?.length ? { languages: entry.languages } : {}),
  ...(entry.file ? { file: entry.file, lines: entry.lines } : {}),
  next: clip(entry.next[0], 400),
}));
const text = lines.join('\n') + '\n';
const current = existsSync(output) ? readFileSync(output, 'utf8') : '';
const stale = current !== text;
if (stale && !check) writeFileSync(output, text);
process.stdout.write(JSON.stringify({ mode: check ? 'check' : 'build', entries: lines.length, bytes: Buffer.byteLength(text), counts: sourceCounts(sources), stale }, null, 2) + '\n');
if (check && stale) process.exitCode = 1;
