#!/usr/bin/env node
// Writes registry/graph.json: a compact navigation graph of Genlib (source types, resource catalogs and
// categories, languages, capabilities and documentation files, with counted edges) in a nodes/links shape
// that graph tools (Graphify-style viewers, Obsidian graph, d3) load directly. Entry-level detail stays in
// registry/search-index.jsonl; follow a node's `query` into genlib find to reach entries. `--check` fails
// when the committed graph is stale.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadSources, searchEntries } from '../lib/discover.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: node scripts/build-graph.mjs [--check]');
const output = root + 'registry/graph.json';

const sources = await loadSources(root);
const entries = searchEntries(sources);
const nodes = new Map();
const links = new Map();
const node = (id, kind, label, extra = {}) => {
  const current = nodes.get(id) ?? { id, kind, label, count: 0, ...extra };
  current.count += 1;
  nodes.set(id, current);
  return id;
};
const link = (source, target, relation) => {
  const key = `${source}|${target}|${relation}`;
  const current = links.get(key) ?? { source, target, relation, weight: 0 };
  current.weight += 1;
  links.set(key, current);
};

node('genlib', 'root', 'Genlib');
const catalogOf = new Map();
for (const item of sources.resources) catalogOf.set(item.id, item.genlib.guide);
for (const entry of entries) {
  const type = node(`type:${entry.type}`, 'type', entry.type, { query: `--type ${entry.type}` });
  link('genlib', type, 'contains');
  for (const language of entry.languages ?? []) {
    if (!/^[a-z]+$/.test(language) || language === 'any' || language === 'css') continue;
    link(type, node(`language:${language}`, 'language', language, { query: language }), 'serves');
  }
  if (entry.type === 'resource') {
    const guide = catalogOf.get(entry.id);
    const catalog = node(`guide:${guide}`, 'guide', guide.replace(/^docs\/resources\//, '').replace(/\.md$/, ''), { file: guide });
    link(type, catalog, 'grouped-by');
    const category = node(`category:${entry.labels[2]}`, 'category', entry.labels[2], { query: entry.labels[2] });
    link(catalog, category, 'has-category');
    for (const language of entry.languages ?? []) link(category, `language:${language}`, 'in-language');
  }
  if (entry.type === 'capability') {
    const capability = node(`capability:${entry.id}`, 'capability', entry.id, { query: entry.id, guide: entry.guide });
    link(type, capability, 'includes');
    for (const language of entry.languages) link(capability, `language:${language}`, 'implemented-in');
    if (entry.guide) link(capability, node(`doc:${entry.guide}`, 'doc', entry.guide, { file: entry.guide }), 'documented-by');
  }
  if (entry.type === 'doc') link(type, node(`doc:${entry.file}`, 'doc', entry.file, { file: entry.file }), 'section-of');
}
// Counts on non-entry nodes are occurrences; drop links whose target never became a node (filtered languages).
const graph = {
  schema: 'genlib.graph/v1',
  note: 'Navigation graph. Node counts are the number of entries that reach the node; follow `query` with genlib find, or `file` to read a guide.',
  nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
  links: [...links.values()].filter(edge => nodes.has(edge.target)).sort((a, b) => `${a.source}|${a.target}|${a.relation}`.localeCompare(`${b.source}|${b.target}|${b.relation}`)),
};
const text = JSON.stringify(graph, null, 1) + '\n';
const stale = (existsSync(output) ? readFileSync(output, 'utf8') : '') !== text;
if (stale && !check) writeFileSync(output, text);
process.stdout.write(JSON.stringify({ mode: check ? 'check' : 'build', nodes: graph.nodes.length, links: graph.links.length, bytes: Buffer.byteLength(text), stale }, null, 2) + '\n');
if (check && stale) process.exitCode = 1;
