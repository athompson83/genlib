import * as fs from 'node:fs/promises';
import path from 'node:path';
import { readRegular } from './safety.mjs';

// Splits the repository's Markdown documentation into sections (H1-H3) so search can return
// one section and the exact line range to read, instead of a whole file.
const TOP_LEVEL = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md'];
const SKIP = new Set(['node_modules', '.git', 'registry']);

async function markdownFiles(root, directory) {
  const out = [];
  for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
    const relative = directory + '/' + entry.name;
    if (entry.isDirectory()) out.push(...await markdownFiles(root, relative));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(relative);
  }
  return out;
}

const anchor = heading => heading.toLowerCase().replace(/[`*_~[\]()]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
const plain = text => text.replace(/`([^`]*)`/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_>#|]/g, ' ').replace(/\s+/g, ' ').trim();

export function sectionsOf(file, text) {
  const lines = text.split('\n');
  const sections = [];
  let fence = false;
  const stack = [];
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const match = !fence && /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return;
    const level = match[1].length, heading = plain(match[2]);
    while (stack.length && stack.at(-1).level >= level) stack.pop();
    stack.push({ level, heading });
    sections.push({ level, heading, start: index + 1, title: stack.map(item => item.heading).join(' > ') });
  });
  return sections.map((section, index) => {
    const end = (sections.slice(index + 1).find(next => next.level <= section.level)?.start ?? lines.length + 1) - 1;
    // The first prose line after the heading is the summary; tables, code and blank lines are skipped.
    let summary = '';
    for (let line = section.start; line < Math.min(end, section.start + 40) && !summary; line++) {
      const value = lines[line];
      if (value === undefined || /^\s*(```|~~~|\||<!--|#)/.test(value) || !value.trim()) continue;
      summary = plain(value).slice(0, 240);
    }
    return { file, anchor: anchor(section.heading), heading: section.heading, title: section.title, summary, start: section.start, end, level: section.level };
  });
}

export async function loadDocSections(root) {
  const files = [...TOP_LEVEL, ...(await markdownFiles(root, 'docs')).sort()];
  const out = [];
  for (const file of files) out.push(...sectionsOf(file, (await readRegular(root, file, 512 * 1024)).toString('utf8')));
  return out;
}
