#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const canonicalRoot = path.join(repositoryRoot, 'skills', 'genlib-use');
const locations = { codex: '.agents', claude: '.claude' };
const noFollow = fs.constants.O_NOFOLLOW ?? 0;

function statOrMissing(filename) {
  try { return fs.lstatSync(filename); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function absolutePath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) {
    throw new Error('Use an absolute path to an existing target project directory.');
  }
  if (value.split(/[\\/]/).some((part) => part === '.' || part === '..')) {
    throw new Error('Path traversal segments are not allowed.');
  }
  return path.normalize(value);
}

// Inspect every existing ancestor; realpath alone would silently follow symlinks.
function safeDirectory(directory, mustExist = false) {
  const absolute = absolutePath(directory);
  const root = path.parse(absolute).root;
  const parts = absolute.slice(root.length).split(path.sep).filter(Boolean);
  let current = root;
  for (const part of ['', ...parts]) {
    if (part) current = path.join(current, part);
    const entry = statOrMissing(current);
    if (!entry) {
      if (mustExist) throw new Error(`Directory does not exist: ${current}`);
      continue;
    }
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${current}`);
    if (!entry.isDirectory()) throw new Error(`Expected a directory: ${current}`);
  }
  return absolute;
}

function safeName(name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name) || name.endsWith('.') ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error(`Unsafe skill entry name: ${name}`);
  }
}

function regularFile(filename) {
  safeDirectory(path.dirname(filename), true);
  const entry = fs.lstatSync(filename);
  if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${filename}`);
  if (!entry.isFile() || entry.nlink !== 1) {
    throw new Error(`Expected a regular, unlinked skill file: ${filename}`);
  }
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | noFollow);
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== entry.dev || opened.ino !== entry.ino) {
      throw new Error(`Skill file changed while reading: ${filename}`);
    }
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}

function readTree(directory) {
  safeDirectory(directory, true);
  const files = new Map();
  const directories = new Set();
  function visit(relative = '') {
    const current = path.join(directory, relative);
    safeDirectory(current, true);
    for (const name of fs.readdirSync(current).sort()) {
      safeName(name);
      const child = relative ? `${relative}/${name}` : name;
      const filename = path.join(directory, ...child.split('/'));
      const entry = fs.lstatSync(filename);
      if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${filename}`);
      if (entry.isDirectory()) { directories.add(child); visit(child); }
      else files.set(child, regularFile(filename));
    }
  }
  visit();
  return { files, directories };
}

function targetsFor(target, harness) {
  const selected = harness === 'both' ? ['codex', 'claude'] : [harness];
  if (selected.some((item) => !Object.hasOwn(locations, item))) {
    throw new Error('Harness must be codex, claude, or both.');
  }
  return selected.map((item) => ({
    harness: item,
    directory: path.join(target, locations[item], 'skills', 'genlib-use'),
  }));
}

function planCopy(destination, source, allowGeneratedChanges) {
  safeDirectory(destination);
  const existing = statOrMissing(destination) ? readTree(destination) : { files: new Map(), directories: new Set() };
  for (const relative of existing.directories) {
    if (!source.directories.has(relative)) throw new Error(`Refusing unexpected skill directory: ${destination}/${relative}`);
  }
  for (const relative of existing.files.keys()) {
    if (!source.files.has(relative)) throw new Error(`Refusing unexpected skill file: ${destination}/${relative}`);
  }
  const changes = [];
  for (const [relative, bytes] of source.files) {
    const previous = existing.files.get(relative);
    if (previous?.equals(bytes)) continue;
    if (previous && !allowGeneratedChanges) throw new Error(`Refusing modified skill file: ${destination}/${relative}`);
    // A directory at an expected file, or a file at an expected directory, is a conflict.
    if (existing.directories.has(relative)) throw new Error(`Conflicting skill path: ${destination}/${relative}`);
    changes.push({ relative, bytes, previous });
  }
  for (const relative of source.directories) {
    if (existing.files.has(relative)) throw new Error(`Conflicting skill path: ${destination}/${relative}`);
  }
  return { destination, changes, missingDirectories: [...source.directories].filter((item) => !existing.directories.has(item)) };
}

function ensureDirectory(directory, created) {
  safeDirectory(directory);
  if (statOrMissing(directory)) return;
  ensureDirectory(path.dirname(directory), created);
  try {
    fs.mkdirSync(directory);
    const entry = fs.lstatSync(directory);
    created.push({ filename: directory, directory: true, dev: entry.dev, ino: entry.ino });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    safeDirectory(directory, true);
  }
}

function createFile(filename, bytes, created) {
  safeDirectory(path.dirname(filename), true);
  const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow, 0o644);
  try {
    const entry = fs.fstatSync(fd);
    const owned = { filename, directory: false, dev: entry.dev, ino: entry.ino, bytes, written: false };
    created.push(owned);
    fs.writeFileSync(fd, bytes);
    owned.written = true;
  } finally { fs.closeSync(fd); }
}

function rollbackCreated(created) {
  for (const item of [...created].reverse()) {
    try {
      safeDirectory(path.dirname(item.filename), true);
      const current = statOrMissing(item.filename);
      if (!current || current.isSymbolicLink() || current.dev !== item.dev || current.ino !== item.ino) continue;
      if (item.directory) fs.rmdirSync(item.filename); // Never recursively remove project content.
      else if (item.written && regularFile(item.filename).equals(item.bytes)) fs.unlinkSync(item.filename);
    } catch { /* Preserve files we cannot safely identify or empty directories now in use. */ }
  }
}

function applyPlans(plans, source) {
  const created = [];
  try {
    for (const plan of plans) {
      ensureDirectory(plan.destination, created);
      for (const relative of source.directories) ensureDirectory(path.join(plan.destination, ...relative.split('/')), created);
      for (const change of plan.changes) {
        const filename = path.join(plan.destination, ...change.relative.split('/'));
        if (!change.previous) createFile(filename, change.bytes, created);
        else {
          // Only the repository's generated mirrors reach this branch. Consumer installs never replace a file.
          if (!regularFile(filename).equals(change.previous)) throw new Error(`Skill changed during sync: ${filename}`);
          const temporary = path.join(path.dirname(filename), `genlib-sync-${randomUUID()}.tmp`);
          createFile(temporary, change.bytes, created);
          if (!regularFile(filename).equals(change.previous)) throw new Error(`Skill changed during sync: ${filename}`);
          fs.renameSync(temporary, filename);
        }
      }
    }
  } catch (error) { rollbackCreated(created); throw error; }
}

export function installSkills({ target, harness = 'both' }) {
  target = safeDirectory(absolutePath(target), true);
  const source = readTree(canonicalRoot);
  if (!source.files.has('SKILL.md')) throw new Error('Canonical skill is missing SKILL.md.');
  const targets = targetsFor(target, harness);
  // Preflight both harnesses before creating anything in the receiving application.
  const plans = targets.map((item) => planCopy(item.directory, source, false));
  applyPlans(plans, source);
  return { targets, filesWritten: plans.reduce((sum, item) => sum + item.changes.length, 0) };
}

export function syncSkillMirrors({ check = false } = {}) {
  const source = readTree(canonicalRoot);
  if (!source.files.has('SKILL.md')) throw new Error('Canonical skill is missing SKILL.md.');
  const targets = targetsFor(repositoryRoot, 'both');
  const plans = targets.map((item) => planCopy(item.directory, source, true));
  const differences = plans.flatMap((item) => [
    ...item.changes.map((change) => path.relative(repositoryRoot, path.join(item.destination, change.relative))),
    ...item.missingDirectories.map((relative) => path.relative(repositoryRoot, path.join(item.destination, relative))),
  ]);
  if (!check) applyPlans(plans, source);
  return { matches: differences.length === 0, differences };
}

function run(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write('Usage: node scripts/install-skills.mjs --target <absolute-project-directory> [--harness codex|claude|both]\n');
    return;
  }
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!['--target', '--harness'].includes(flag) || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error(`Unknown or incomplete option: ${flag}`);
    }
    const key = flag.slice(2);
    if (Object.hasOwn(options, key)) throw new Error(`Duplicate option: ${flag}`);
    options[key] = args[index + 1];
  }
  process.stdout.write(`${JSON.stringify(installSkills(options), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`genlib skills: ${error.message}\n`); process.exitCode = 1; }
}
