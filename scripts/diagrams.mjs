#!/usr/bin/env node
// Keeps the rendered diagram SVGs in docs/diagrams/ in step with the Mermaid blocks in README.md
// and docs/architecture.md. The Mermaid text stays the source of truth (GitHub renders it and agents
// read it cheaply); the SVGs are polished light/dark copies drawn by Agentic Mermaid with a
// deterministic layout. `--check` (part of npm run check) compares hashes only and needs no network;
// `--render` (maintainers) runs the pinned renderer through npx, so Genlib gains no dependency.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const RENDERER = 'agentic-mermaid@0.4.1';
const STYLES = { light: 'github-light', dark: 'github-dark' };
const DIAGRAMS = [
  { name: 'readme-flow', source: 'README.md' },
  { name: 'architecture', source: 'docs/architecture.md' },
];
const mode = process.argv[2];
if (!['--check', '--render'].includes(mode) || process.argv.length > 3) throw new Error('Usage: node scripts/diagrams.mjs --check|--render');

// The first ```mermaid block of a Markdown file.
function mermaidBlock(markdown, file) {
  const match = /```mermaid\n([\s\S]*?)\n```/.exec(markdown);
  if (!match) throw new Error(`${file} has no mermaid block`);
  return match[1] + '\n';
}
const sha256 = text => createHash('sha256').update(text).digest('hex');
const stamp = (hash, style) => `<!-- genlib-diagram source-sha256=${hash} renderer=${RENDERER} style=${style} -->\n`;

const stale = [];
for (const diagram of DIAGRAMS) {
  const source = mermaidBlock(readFileSync(root + diagram.source, 'utf8'), diagram.source);
  const hash = sha256(source);
  const base = `docs/diagrams/${diagram.name}`;
  if (mode === '--render') {
    mkdirSync(root + 'docs/diagrams', { recursive: true });
    writeFileSync(root + base + '.mmd', source);
    // verify exits non-zero on parse errors; warnings (for example long labels) are printed.
    const report = JSON.parse(execFileSync('npx', ['-y', RENDERER, 'verify', base + '.mmd', '--json'], { cwd: root, encoding: 'utf8' }));
    if (!report.ok || report.warnings.length) throw new Error(`${diagram.source}: ${JSON.stringify(report.warnings)}`);
    for (const [variant, style] of Object.entries(STYLES)) {
      const out = `${base}-${variant}.svg`;
      execFileSync('npx', ['-y', RENDERER, 'render', base + '.mmd', '--format', 'svg', '--style', style, '--output', out], { cwd: root, stdio: 'inherit' });
      writeFileSync(root + out, stamp(hash, style) + readFileSync(root + out, 'utf8'));
    }
    continue;
  }
  if (!existsSync(root + base + '.mmd') || readFileSync(root + base + '.mmd', 'utf8') !== source) stale.push(base + '.mmd');
  for (const [variant, style] of Object.entries(STYLES)) {
    const out = `${base}-${variant}.svg`;
    if (!existsSync(root + out) || !readFileSync(root + out, 'utf8').startsWith(stamp(hash, style))) stale.push(out);
  }
}
if (mode === '--check' && stale.length) {
  console.error(`Diagrams are stale (run npm run diagrams:render): ${stale.join(', ')}`);
  process.exit(1);
}
console.log(JSON.stringify({ mode: mode.slice(2), diagrams: DIAGRAMS.map(diagram => diagram.name), stale }));
