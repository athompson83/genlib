#!/usr/bin/env node
// Exports Genlib's searchable index as an Obsidian-compatible Markdown vault folder: a home note,
// one note per source type, resource category, language and capability (maps of content with
// [[wikilinks]]), and one note per entry with YAML properties and its next command.
// Usage: node scripts/export-obsidian.mjs --out <vault>/genlib [--types capability,resource,...]
// It writes only inside the output folder, only replaces files it generated (marked
// `generator: genlib`), and never deletes anything, so other vault notes stay untouched.
import { existsSync, mkdirSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSources, searchEntries } from '../lib/discover.mjs';
// Record text is data: brackets in a description ("[[Demo]](url)") must not become Obsidian wikilinks.
const plain = text => String(text ?? '').replace(/\[\[/g, '[\u200b[').replace(/\]\]/g, ']\u200b]');

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const out = option('--out');
if (!out) throw new Error('Usage: node scripts/export-obsidian.mjs --out <vault>/genlib [--types capability,resource,doc]');
const only = option('--types')?.split(',');
const base = path.resolve(out);
mkdirSync(base, { recursive: true });
if (lstatSync(base).isSymbolicLink()) throw new Error('Output folder must not be a symbolic link.');

const safe = value => String(value).replace(/[\\/:*?"<>|#^[\]]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'untitled';
const yaml = value => JSON.stringify(String(value ?? ''));
let written = 0, skipped = 0;
function write(relative, body) {
  const file = path.join(base, relative);
  if (!file.startsWith(base + path.sep)) throw new Error('Unsafe note path: ' + relative);
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file)) {
    if (lstatSync(file).isSymbolicLink() || !/^generator: "?genlib"?$/m.test(readFileSync(file, 'utf8'))) { skipped++; return; }
  }
  writeFileSync(file, body);
  written++;
}
const note = (properties, text) => '---\n' + Object.entries({ generator: 'genlib', ...properties })
  .map(([key, value]) => Array.isArray(value) ? `${key}:\n${value.map(item => '  - ' + yaml(item)).join('\n')}` : `${key}: ${yaml(value)}`).join('\n') + '\n---\n\n' + text + '\n';

const sources = await loadSources(root);
const entries = searchEntries(sources).filter(entry => !only || only.includes(entry.type));
const groups = { type: new Map(), category: new Map(), language: new Map() };
const add = (map, key, link) => { if (!map.has(key)) map.set(key, []); map.get(key).push(link); };
const entryName = entry => `Entries/${entry.type}/${safe(entry.id)}`;
for (const entry of entries) {
  const link = `[[${entryName(entry)}|${safe(entry.title ?? entry.id)}]]`;
  add(groups.type, entry.type, link);
  if (entry.type === 'resource') add(groups.category, entry.labels[2], link);
  for (const language of entry.languages ?? []) add(groups.language, language, link);
  const props = { type: entry.type, id: entry.id, ...(entry.languages?.length ? { languages: entry.languages } : {}), ...(entry.license ? { license: entry.license } : {}), tags: [`genlib/${entry.type}`] };
  const related = [`Type: [[Types/${entry.type}]]`, ...(entry.type === 'resource' ? [`Category: [[Categories/${safe(entry.labels[2])}]]`] : []),
    ...(entry.languages ?? []).map(language => `Language: [[Languages/${safe(language)}]]`)];
  write(entryName(entry) + '.md', note(props, `# ${entry.title ?? entry.id}\n\n${plain(entry.summary)}\n\n## Next\n\n\`\`\`sh\n${entry.next.join('\n')}\n\`\`\`\n\n${related.join('  \n')}`));
}
const moc = (folder, key, links) => write(`${folder}/${safe(key)}.md`, note({ kind: folder.toLowerCase(), key, count: links.length, tags: [`genlib/${folder.toLowerCase()}`] },
  `# ${key}\n\n${links.length} entries. Back to [[Genlib]].\n\n${links.sort().map(link => '- ' + link).join('\n')}`));
for (const [key, links] of groups.type) moc('Types', key, links);
for (const [key, links] of groups.category) moc('Categories', key, links);
for (const [key, links] of groups.language) moc('Languages', key, links);
const list = (folder, map) => [...map.keys()].sort().map(key => `- [[${folder}/${safe(key)}|${key}]] (${map.get(key).length})`).join('\n');
write('Genlib.md', note({ kind: 'home', tags: ['genlib/home'] }, `# Genlib\n\nGenerated from Genlib's search index. Regenerate with \`node scripts/export-obsidian.mjs --out <vault>/genlib\`; notes marked \`generator: genlib\` are replaced, other notes are never touched.\n\n## By type\n\n${list('Types', groups.type)}\n\n## By language\n\n${list('Languages', groups.language)}\n\n## Resource categories\n\n${list('Categories', groups.category)}`));
process.stdout.write(JSON.stringify({ out: base, entries: entries.length, written, skippedUserNotes: skipped }, null, 2) + '\n');
