#!/usr/bin/env node
// Adds every skill (a directory holding SKILL.md) of one cloned GitHub repository to resources/skills.json as
// curated, commit-pinned records. It reads only the clone you pass; it never fetches or runs skill code.
//   git clone --depth 1 https://github.com/<owner>/<repo> <dir>
//   node scripts/index-skill-repo.mjs --repo <owner>/<repo> --dir <dir> --license <SPDX> [--prefix <id-prefix>] [--always-prefix] [--dry-run]
// Ids that already exist get the prefix (default: the repository owner). Existing records are never changed.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';

const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const repo = arg('--repo'), dir = arg('--dir'), license = arg('--license');
if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !dir || !license) throw new Error('Usage: --repo owner/name --dir <clone> --license <SPDX> [--prefix p] [--dry-run]');
const prefix = arg('--prefix') ?? repo.split('/')[0].toLowerCase() + '-';
const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const source = `https://github.com/${repo}`;
const file = new URL('../resources/skills.json', import.meta.url);
const raw = readFileSync(file, 'utf8');
const index = JSON.parse(raw);
const ids = new Set(index.skills.map(skill => skill.id));
const urls = new Set(index.skills.map(skill => `${skill.source}/${skill.path}`));

function walk(path, out = []) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = join(path, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(full, out); else if (entry.name === 'SKILL.md') out.push(path);
  }
  return out;
}
const sizeOf = path => readdirSync(path, { withFileTypes: true, recursive: true }).filter(e => e.isFile()).reduce((acc, e) => {
  const full = join(e.parentPath ?? e.path, e.name); return { files: acc.files + 1, bytes: acc.bytes + statSync(full).size };
}, { files: 0, bytes: 0 });
const front = text => {
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const field = name => block.match(new RegExp(`^${name}:\\s*(?:"([^"]*)"|'([^']*)'|(.*))$`, 'm'))?.slice(1).find(v => v !== undefined)?.trim();
  return { name: field('name'), description: field('description') };
};

const added = [];
for (const skillDir of walk(dir).sort()) {
  const path = relative(dir, skillDir);
  if (!path || urls.has(`${source}/${path}`)) continue;
  const meta = front(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'));
  const base = (meta.name ?? path.split('/').pop()).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  let id = ids.has(base) || process.argv.includes('--always-prefix') ? (base.startsWith(prefix) ? base : prefix + base).slice(0, 100) : base;
  for (let n = 2; ids.has(id); n++) id = `${prefix}${base}-${n}`;
  ids.add(id);
  const url = `${source}/tree/${commit}/${path}`;
  added.push({
    id, name: (meta.name ?? base).slice(0, 120), description: (meta.description ?? '').replace(/\s+/g, ' ').slice(0, 600),
    source, commit, path, url, license, licenseUrl: `${source}/blob/${commit}/LICENSE`, redistributable: true,
    rank: null, installs: null, curated: true, ...sizeOf(skillDir), install: `npx skills add ${url}`,
  });
}
if (!process.argv.includes('--dry-run')) {
  index.skills.push(...added);
  writeFileSync(file, JSON.stringify(index, null, raw.match(/^{\n( +)/)?.[1].length ?? 1) + '\n');
}
console.log(JSON.stringify({ repo, commit, added: added.length, ids: added.map(skill => skill.id) }));
