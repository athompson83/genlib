import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ID, MAX_PROFILES, PROFILE, resolveModules } from './catalog.mjs';
import { writeReceipt } from './lifecycle.mjs';
import {
  checkedPath, ensureDirectory, GenlibError, invariant, jsonBytes, object, optionalRegular,
  outputPath, parseJson, readRegular, relativePath, rootDirectory, sha256,
} from './safety.mjs';

const LOCK = '.genlib/lock.json';
const WRITE_LOCK = '.genlib/install.lock';
const HASH = /^[a-f0-9]{64}$/;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
// Lock entries without a kind are registry modules; these kinds are copied by tools/language-modules.mjs and
// tools/recipe-install.mjs through planCopy/installCopy below.
export const COPY_KINDS = ['language', 'recipe'];

function validateLock(lock) {
  invariant(object(lock) && lock.schemaVersion === 1 && object(lock.modules) && object(lock.files),
    'INVALID_LOCK', 'Invalid Genlib lock file; inspect it before continuing.');
  invariant(Object.keys(lock.files).length <= 10000 && Object.keys(lock.modules).length <= 1000,
    'INVALID_LOCK', 'Genlib lock file is too large.');
  for (const [id, entry] of Object.entries(lock.modules)) {
    invariant(ID.test(id) && object(entry) && typeof entry.version === 'string' &&
      HASH.test(entry.manifestSha256) && (entry.kind === undefined || COPY_KINDS.includes(entry.kind)),
    'INVALID_LOCK', 'Invalid installed module record.');
    // Language examples and recipes may be copied straight into the app root (--flat) or a folder of its choosing.
    invariant(entry.profiles === undefined || (Array.isArray(entry.profiles) && entry.profiles.length > 0 &&
      entry.profiles.length <= MAX_PROFILES && entry.profiles.every(name => typeof name === 'string' && PROFILE.test(name))),
    'INVALID_LOCK', 'Invalid installed profiles record.');
    if (entry.kind && entry.out === '.') continue;
    if (entry.kind) relativePath(entry.out, 'Installed folder'); else outputPath(entry.out);
  }
  for (const [relative, record] of Object.entries(lock.files)) {
    relativePath(relative, 'Installed file');
    invariant(object(record) && HASH.test(record.sha256) && Array.isArray(record.modules) &&
      record.modules.every(id => ID.test(id)), 'INVALID_LOCK', 'Invalid installed file record.');
  }
  return lock;
}

export async function readLock(target) {
  const bytes = await optionalRegular(target, LOCK, 2 * 1024 * 1024);
  return bytes ? validateLock(parseJson(bytes, LOCK)) : { schemaVersion: 1, modules: {}, files: {} };
}

function declaredMajors(specification) {
  if (typeof specification !== 'string' || specification.length > 200) return null;
  const ranges = specification.trim().split(/\s*\|\|\s*/);
  const majors = [];
  for (const range of ranges) {
    const match = /^[~^]?(\d+)(?:\.(?:\d+|x|\*)){0,2}$/.exec(range);
    if (!match) return null;
    majors.push(Number(match[1]));
  }
  return majors;
}

export async function checkCompatibility(target, modules, allowUnverified = false) {
  const required = modules.filter(module => module.compatibility.frameworks.includes('react'));
  if (required.length === 0) return { status: 'compatible', warnings: [] };
  const packageBytes = await optionalRegular(target, 'package.json', 512 * 1024);
  let reason = 'No package.json was found to establish React compatibility.';
  if (packageBytes) {
    const pkg = parseJson(packageBytes, 'target package.json');
    invariant(object(pkg), 'INVALID_PROJECT', 'Target package.json must contain an object.');
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
      invariant(pkg[field] === undefined || object(pkg[field]), 'INVALID_PROJECT', 'Invalid target dependency declarations.');
    }
    const dependencies = { ...pkg.peerDependencies, ...pkg.devDependencies, ...pkg.dependencies };
    invariant(!Object.hasOwn(dependencies, 'react-native'), 'INCOMPATIBLE_TARGET',
      'These modules use browser DOM elements and cannot be installed as native React Native components.');
    const specification = dependencies.react;
    if (specification === undefined) {
      invariant(!['vue', 'svelte', '@angular/core'].some(name => Object.hasOwn(dependencies, name)),
        'INCOMPATIBLE_TARGET', 'The target declares a different UI framework without React.');
      reason = 'The target does not declare React.';
    } else {
      const majors = declaredMajors(specification);
      if (majors) {
        for (const module of required) {
          invariant(majors.every(major => module.compatibility.reactMajors.includes(major)),
            'INCOMPATIBLE_TARGET', module.id + ' does not support target React declaration ' + specification);
        }
        return { status: 'compatible', warnings: ['Static peer compatibility passed. Verify the target TSX build and application behavior after integration.'] };
      }
      reason = 'React declaration cannot be conservatively resolved: ' + String(specification);
    }
  }
  invariant(allowUnverified, 'UNVERIFIED_COMPATIBILITY',
    reason + ' Review the target and use --allow-unverified only when you will validate compatibility yourself.');
  return { status: 'unverified', warnings: [reason, 'Explicit unverified installation requires project-specific build and behavior checks.'] };
}

// Relative imports in module sources use the `.js` extension that a TypeScript build (NodeNext) emits. Apps that run
// .ts files without a build (Node's type stripping, Deno, Bun scripts) need `.ts` instead: with `tsImports` the copy
// rewrites relative `./x.js` specifiers in .ts/.tsx files to `./x.ts`. The installed bytes are hashed after the
// rewrite, so verification stays exact, and the lock records the choice so updates apply the same rewrite.
const RELATIVE_JS = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"'\n]*?)\.js\2/g;
// An app runs TypeScript without a build when it has no tsconfig.json and a package.json script hands a .ts path to
// node, deno or bun (Node type stripping); copied relative imports then need `.ts`.
const DIRECT_TS = /(?:^|[\s;&|(])(?:node|deno(?:\s+(?:run|test))?|bun(?:\s+(?:run|test))?)\b[^;&|]*?["']?[\w./*{}-]+\.tsx?["']?(?=\s|$|;|&|\|)/;
export async function runsTypeScriptDirectly(target) {
  if (await optionalRegular(target, 'tsconfig.json')) return false;
  const bytes = await optionalRegular(target, 'package.json');
  if (!bytes) return false;
  let scripts;
  try { scripts = JSON.parse(bytes.toString('utf8')).scripts; } catch { return false; }
  return Boolean(scripts) && typeof scripts === 'object' && Object.values(scripts).some(script => typeof script === 'string' && DIRECT_TS.test(script));
}

export function transformSource(bytes, relative, { tsImports = false } = {}) {
  if (!tsImports || !/\.tsx?$/.test(relative)) return bytes;
  const text = bytes.toString('utf8');
  const next = text.replace(RELATIVE_JS, (_, lead, quote, stem) => `${lead}${quote}${stem}.ts${quote}`);
  return next === text ? bytes : Buffer.from(next, 'utf8');
}

async function sourceRecords(context, modules, out, { tsImports = false, selection = new Map() } = {}) {
  const byTarget = new Map();
  for (const module of modules) {
    for (const file of selection.get(module.id)?.files ?? module.files) {
      const source = await readRegular(context.root, file.path);
      invariant(source.length === file.bytes && sha256(source) === file.sha256,
        'INTEGRITY_MISMATCH', 'Source hash mismatch: ' + file.path);
      const destination = out + '/' + file.target;
      relativePath(destination, 'Installed path');
      const bytes = transformSource(source, destination, { tsImports });
      const digest = bytes === source ? file.sha256 : sha256(bytes);
      const key = destination.toLowerCase();
      const existing = byTarget.get(key);
      invariant(!existing || (existing.target === destination && existing.sha256 === digest),
        'PATH_CONFLICT', 'Modules disagree about target file: ' + destination);
      if (existing) existing.modules.push(module.id);
      else byTarget.set(key, { target: destination, sha256: digest, bytes, modules: [module.id], kind: 'source' });
    }
  }
  for (const [name, destination] of [['license', '.genlib/licenses/Apache-2.0.txt'], ['notice', '.genlib/NOTICE']]) {
    const source = context.catalog[name];
    const bytes = await readRegular(context.root, source.path);
    invariant(sha256(bytes) === source.sha256 && bytes.length === source.bytes,
      'INTEGRITY_MISMATCH', 'License or notice integrity mismatch.');
    byTarget.set(destination.toLowerCase(), {
      target: destination, sha256: source.sha256, bytes, modules: modules.map(module => module.id), kind: name,
    });
  }
  const records = [...byTarget.values()];
  const destinations = new Set(records.map(file => file.target.toLowerCase()));
  for (const file of records) {
    const segments = file.target.toLowerCase().split('/');
    for (let index = 1; index < segments.length; index++) {
      invariant(!destinations.has(segments.slice(0, index).join('/')), 'PATH_CONFLICT',
        'A module file is also used as a directory: ' + file.target);
    }
  }
  invariant(records.reduce((total, file) => total + file.bytes.length, 0) <= MAX_TOTAL_BYTES,
    'SIZE_LIMIT', 'Installation exceeds the total size limit.');
  return records;
}


// Install profiles: `profiles` in module.json names groups of the module's own sources. A selection installs the union
// of the named groups plus every module file those import (followed transitively), so a profile can never miss a
// dependency. An import that resolves neither to a module file nor to a dependency module's file is refused.
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"'\n]*)\1/g;
const stripCode = file => file.replace(CODE_FILE, '');

function importCandidates(fromTarget, specifier) {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromTarget), specifier));
  const stem = resolved.replace(/\.(?:[cm]?js|jsx)$/, '');
  return [resolved, stem + '.ts', stem + '.tsx', stem + '.mts', resolved + '.ts', resolved + '.tsx', resolved + '/index.ts', resolved + '/index.tsx'].map(item => item.toLowerCase());
}

/**
 * The files of `module` to install for `profiles` (null: every file). `otherTargets` holds the lower-cased targets of
 * modules installed alongside (its dependencies), which imports may also reach.
 */
export async function selectProfileFiles(context, module, profiles, otherTargets = new Set()) {
  if (profiles == null) return { files: module.files, profiles: null };
  invariant(module.profiles, 'INVALID_OPTION', `${module.id} has no install profiles; omit --profile to install all of its files.`);
  const names = Object.keys(module.profiles);
  const unknown = profiles.filter(name => !names.includes(name));
  invariant(profiles.length > 0 && unknown.length === 0, 'INVALID_OPTION',
    `${module.id} has no profile ${unknown.join(', ') || '(empty)'}; choose from: ${names.join(', ')}.`);
  const bySource = new Map(module.files.map(file => [file.source, file]));
  const byTarget = new Map(module.files.map(file => [file.target.toLowerCase(), file]));
  const selected = new Set(names.filter(name => profiles.includes(name)).flatMap(name => module.profiles[name]));
  const queue = [...selected];
  const unresolved = [];
  while (queue.length) {
    const file = bySource.get(queue.shift());
    if (!file || !CODE_FILE.test(file.target)) continue;
    const text = (await readRegular(context.root, file.path)).toString('utf8');
    for (const match of text.matchAll(RELATIVE_IMPORT)) {
      const candidates = importCandidates(file.target, match[2]);
      const own = candidates.map(candidate => byTarget.get(candidate)).find(Boolean);
      if (own) { if (!selected.has(own.source)) { selected.add(own.source); queue.push(own.source); } continue; }
      if (!candidates.some(candidate => otherTargets.has(candidate))) unresolved.push(`${file.target} imports ${match[2]}`);
    }
  }
  invariant(unresolved.length === 0, 'UNRESOLVED_IMPORT',
    `Profile selection ${profiles.join(',')} leaves imports unresolved (${[...new Set(unresolved)].join('; ')}). Install without --profile or report the module.`);
  return { files: module.files.filter(file => selected.has(file.source)), profiles: names.filter(name => profiles.includes(name)) };
}

// The first ```ts block under "## Integration points" in the module's CONTRACT.md, with import specifiers of module
// files rewritten to the installed app path, and imports of files the selection did not install omitted together
// with the statements built on them. Bounded to WIRING_LINES lines; null when the contract has no such block.
const WIRING_LINES = 40;
function importedNames(statement) {
  const clause = /^\s*import\s+(?:type\s+)?([\s\S]*?)\s+from\s/.exec(statement)?.[1] ?? '';
  const names = [];
  const braces = /\{([\s\S]*)\}/.exec(clause);
  if (braces) for (const part of braces[1].split(',')) { const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop().trim(); if (name) names.push(name); }
  const rest = clause.replace(/\{[\s\S]*\}/, '').split(',').map(item => item.trim()).filter(Boolean);
  for (const item of rest) names.push(item.replace(/^\*\s+as\s+/, ''));
  return names.filter(name => /^[\w$]+$/.test(name));
}

export async function wiringFor(context, module, { out, installed, tsImports = false }) {
  const bytes = await readRegular(context.root, module.contractFile.path, 64 * 1024);
  invariant(sha256(bytes) === module.contractFile.sha256, 'INTEGRITY_MISMATCH', 'Contract hash mismatch: ' + module.id);
  const lines = bytes.toString('utf8').split('\n');
  const heading = lines.findIndex(line => /^##\s+Integration points\s*$/i.test(line));
  if (heading < 0) return null;
  let start = -1, end = -1;
  for (let index = heading + 1; index < lines.length && !/^##\s/.test(lines[index]); index++) {
    if (start < 0 && /^```(?:ts|typescript|tsx)\s*$/.test(lines[index])) start = index;
    else if (start >= 0 && /^```\s*$/.test(lines[index])) { end = index; break; }
  }
  if (start < 0 || end < 0) return null;
  // Group the block into top-level statements: a statement starts on an unindented line that is not a closing bracket.
  const chunks = [];
  for (const line of lines.slice(start + 1, end)) {
    const current = chunks.at(-1);
    // Only an import, or an export of names from another file, can continue unindented until its `from "..."`.
    const openImport = current && /^(?:import\b|export\s*(?:type\s*)?[{*])/.test(current.text) && !/\bfrom\s*["'][^"']+["']|^import\s*["']/.test(current.text);
    if (current && (openImport || (line.trim() && (/^\s/.test(line) || /^[}\])]/.test(line))))) current.text += '\n' + line;
    else chunks.push({ text: line });
  }
  const targets = module.files.map(file => file.target);
  const appPath = target => './' + out + '/' + (CODE_FILE.test(target) ? stripCode(target) + (tsImports ? (target.endsWith('.tsx') ? '.tsx' : '.ts') : '.js') : target);
  const dropped = [], droppedVariables = [], mentioned = new Set();
  const kept = [];
  for (const chunk of chunks) {
    const spec = /^(?:import|export)\b[\s\S]*?(?:\bfrom\s*|^import\s*)(["'])([^"'\n]+)\1/.exec(chunk.text);
    if (spec) {
      const bare = stripCode(spec[2].replace(/^(?:\.{1,2}\/)+/, '').replace(/^[@~#]\//, ''));
      const target = targets.find(item => bare === stripCode(item) || bare.endsWith('/' + stripCode(item)));
      if (target && !installed.has(target)) { dropped.push({ target, names: importedNames(chunk.text) }); continue; }
      if (target) { mentioned.add(target); kept.push(chunk.text.replace(spec[1] + spec[2] + spec[1], spec[1] + appPath(target) + spec[1])); continue; }
      kept.push(chunk.text); continue;
    }
    // A statement built on an omitted import (`export const handler = createHandler({...})`) goes too; one that only
    // mentions it inside (a store argument) stays, and the "not installed" note below names what to add.
    // A statement that declares a variable from an omitted one is dropped too, and so is any later statement that starts
    // with that variable (`await events.createSeries(...)` after `const events = createRecurringEvents(...)`).
    const names = [...dropped.flatMap(item => item.names), ...droppedVariables].map(name => name.replace(/\$/g, '\\$'));
    if (names.some(name => new RegExp(`^(?:export\\s+)?(?:(?:const|let|var)\\s+[^=]+=\\s*)?(?:await\\s+)?(?:new\\s+)?${name}\\b`).test(chunk.text))) {
      const declared = /^(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=/.exec(chunk.text)?.[1];
      if (declared) droppedVariables.push(declared);
      continue;
    }
    kept.push(chunk.text);
  }
  const body = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim().split('\n');
  const lastImport = body.findLastIndex(line => /^import\b|from\s*["'][^"']+["'];?\s*$/.test(line));
  const also = targets.filter(target => installed.has(target) && !mentioned.has(target)).map(target => {
    const names = module.exports.filter(item => item.from === target).map(item => item.name);
    return names.length ? `// also: import { ${names.join(', ')} } from "${appPath(target)}";` : null;
  }).filter(Boolean);
  body.splice(lastImport + 1, 0, ...also);
  for (const item of dropped) {
    const source = module.files.find(file => file.target === item.target)?.source;
    const profile = Object.entries(module.profiles ?? {}).find(([, sources]) => sources.includes(source))?.[0];
    body.push(`// not installed: ${item.names.join(', ') || item.target}${profile ? ` (add --profile ${profile})` : ''}`);
  }
  return (body.length > WIRING_LINES ? [...body.slice(0, WIRING_LINES - 1), '// … truncated; read the Integration points section of CONTRACT.md'] : body).join('\n');
}

async function prepare(context, id, options) {
  const target = await rootDirectory(options.target);
  invariant(target !== context.root && !target.startsWith(context.root + path.sep),
    'INVALID_TARGET', 'Install into a consuming application outside the Genlib checkout.');
  const out = outputPath(options.out ?? 'src/genlib');
  const modules = await resolveModules(context, id);
  const compatibility = await checkCompatibility(target, modules, options.allowUnverified);
  const lock = await readLock(target);
  // Omitted --ts-imports follows an earlier install of the module, else what the app's own scripts show.
  const recorded = modules.map(module => Object.hasOwn(lock.modules, module.id) ? lock.modules[module.id] : null).find(Boolean);
  const tsImportsDetected = options.tsImports == null && !recorded && await runsTypeScriptDirectly(target);
  const tsImports = options.tsImports == null ? (recorded ? Boolean(recorded.tsImports) : tsImportsDetected) : Boolean(options.tsImports);
  for (const module of modules) {
    const previous = Object.hasOwn(lock.modules, module.id) ? lock.modules[module.id] : null;
    invariant(!previous || Boolean(previous.tsImports) === tsImports, 'INVALID_OPTION',
      `${module.id} was installed ${previous?.tsImports ? 'with' : 'without'} --ts-imports; use the same setting.`);
  }
  // Only the requested module takes a profile selection; its dependencies install fully. A selection adds to the
  // profiles already recorded for it (no --profile, or an earlier full install, means every file).
  const selection = new Map();
  const requested = options.profiles == null ? null : [...new Set(options.profiles)];
  for (const module of modules) {
    const previous = Object.hasOwn(lock.modules, module.id) ? lock.modules[module.id] : null;
    const others = new Set(modules.filter(other => other !== module).flatMap(other => other.files.map(file => file.target.toLowerCase())));
    const profiles = module.id !== id || requested === null || (previous && !previous.profiles) ? null
      : [...new Set([...(previous?.profiles ?? []), ...requested])];
    if (module.id === id && requested !== null) {
      invariant(module.profiles, 'INVALID_OPTION', `${id} has no install profiles; omit --profile to install all of its files.`);
      const unknown = requested.filter(name => !Object.hasOwn(module.profiles, name));
      invariant(requested.length > 0 && unknown.length === 0, 'INVALID_OPTION', `${id} has no profile ${unknown.join(', ') || '(empty)'}; choose from: ${Object.keys(module.profiles).join(', ')}.`);
    }
    selection.set(module.id, await selectProfileFiles(context, module, profiles, others));
  }
  const records = await sourceRecords(context, modules, out, { tsImports, selection });
  if (!tsImports && records.some(file => /\.tsx?$/.test(file.target)) && !(await optionalRegular(target, 'tsconfig.json'))) {
    compatibility.warnings = [...compatibility.warnings, 'The target has no tsconfig.json. If it runs .ts files without a build (Node type stripping, Deno, Bun), add --ts-imports so relative imports use .ts.'];
  }
  const conflicts = [];
  for (const module of modules) {
    const previous = Object.hasOwn(lock.modules, module.id) ? lock.modules[module.id] : null;
    if (previous && (previous.version !== module.version || previous.out !== out || previous.manifestSha256 !== module.manifestSha256)) {
      conflicts.push(module.id + ': a different version, location, or reviewed manifest is already recorded; review an update explicitly.');
    }
  }
  for (const file of records) {
    const previous = Object.hasOwn(lock.files, file.target) ? lock.files[file.target] : null;
    const bytes = await optionalRegular(target, file.target);
    if (bytes) {
      if (previous && previous.sha256 === file.sha256 && sha256(bytes) === file.sha256) file.action = 'unchanged';
      else if (file.kind !== 'source' && sha256(bytes) === file.sha256) file.action = 'unchanged';
      else {
        file.action = 'conflict';
        conflicts.push(file.target + ': an untracked, changed, or different file already exists.');
      }
    } else {
      file.action = 'create';
      if (previous && previous.sha256 !== file.sha256) {
        file.action = 'conflict';
        conflicts.push(file.target + ': recorded baseline differs from the requested source.');
      }
    }
  }
  const root = modules.at(-1);
  const installedTargets = new Set(selection.get(root.id).files.map(file => file.target));
  const wiring = await wiringFor(context, root, { out, installed: installedTargets, tsImports });
  return { target, out, modules, compatibility, lock, records, conflicts, tsImports, ...(tsImportsDetected ? { tsImportsDetected: true } : {}), selection, profiles: selection.get(root.id).profiles, wiring };
}

function publicPlan(plan) {
  return {
    target: plan.target, out: plan.out,
    modules: plan.modules.map(module => ({ id: module.id, version: module.version })),
    compatibility: plan.compatibility,
    files: plan.records.map(file => ({ path: file.target, action: file.action, bytes: file.bytes.length })),
    ...(plan.tsImports ? { tsImports: true } : {}),
    ...(plan.tsImportsDetected ? { tsImportsDetected: true } : {}),
    ...(plan.profiles ? { profiles: plan.profiles } : {}),
    conflicts: plan.conflicts,
    totalBytes: plan.records.reduce((sum, file) => sum + (file.action === 'create' ? file.bytes.length : 0), 0),
    ...(plan.wiring ? { wiring: plan.wiring } : {}),
    writes: false,
  };
}

export async function planInstall(context, id, options) {
  return publicPlan(await prepare(context, id, options));
}

function sourceRevision(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] });
  const revision = result.status === 0 ? result.stdout.trim() : '';
  const dirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
    cwd: root, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'],
  });
  return { commit: /^[a-f0-9]{40,64}$/.test(revision) ? revision : null, checkoutModified: dirty.status === 0 ? dirty.stdout.trim().length > 0 : null };
}

// One locked, staged write: re-plan under .genlib/install.lock, publish each new file by hard link (never over an
// existing name or symlink), commit the lock atomically, then run `afterCommit`. Files created by a failed attempt are
// removed only while they still hold the bytes this attempt wrote.
async function transaction(target, replan, nextLock, afterCommit) {
  const directories = [], created = [];
  await ensureDirectory(target, '.genlib', directories);
  const writeLockPath = await checkedPath(target, WRITE_LOCK, true);
  let writeLock;
  try { writeLock = await fs.open(writeLockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new GenlibError('INSTALL_BUSY', 'Another installation or a stale .genlib/install.lock exists. Confirm no installation is running before removing a stale lock.');
    throw error;
  }
  const transactionId = randomUUID();
  const next = '.genlib/lock.next.' + transactionId;
  const staging = '.genlib/staging/' + transactionId;
  const staged = [];
  let committed = false;
  try {
    await writeLock.writeFile(jsonBytes({ transactionId, pid: process.pid }));
    const plan = await replan();
    invariant(plan.conflicts.length === 0, 'INSTALL_CONFLICT', plan.conflicts.join(' '));
    for (const [index, file] of plan.records.entries()) {
      if (file.action !== 'create') continue;
      await ensureDirectory(target, staging, directories);
      const stageRelative = staging + '/' + index;
      const stagePath = await checkedPath(target, stageRelative, true);
      const stageHandle = await fs.open(stagePath, 'wx', 0o644);
      staged.push(stagePath);
      try { await stageHandle.writeFile(file.bytes); await stageHandle.sync(); } finally { await stageHandle.close(); }
      const parent = path.posix.dirname(file.target);
      if (parent !== '.') await ensureDirectory(target, parent, directories);
      const destination = await checkedPath(target, file.target, true);
      // Publish a complete file atomically and refuse all existing names, including symlinks.
      await fs.link(stagePath, destination);
      created.push({ destination, relative: file.target, sha256: file.sha256 });
      await fs.unlink(stagePath);
    }
    const origin = sourceRevision(plan.root);
    const lock = nextLock(structuredClone(plan.lock), plan, origin);
    for (const file of plan.records) {
      if (file.action === 'kept') continue;
      const existingModules = Object.hasOwn(lock.files, file.target) ? lock.files[file.target].modules : [];
      lock.files[file.target] = { sha256: file.sha256, modules: [...new Set([...existingModules, ...file.modules])].sort(), kind: file.kind };
    }
    if (created.length > 0 || !jsonBytes(lock).equals(jsonBytes(plan.lock))) {
      const nextPath = await checkedPath(target, next, true);
      const handle = await fs.open(nextPath, 'wx', 0o600);
      try { await handle.writeFile(jsonBytes(lock)); await handle.sync(); } finally { await handle.close(); }
      await checkedPath(target, LOCK, true);
      await fs.rename(nextPath, path.join(target, LOCK));
    }
    committed = true;
    return await afterCommit({ plan, lock, origin, created: created.length });
  } finally {
    if (!committed) {
      for (const file of created.reverse()) {
        // Remove only files created by this invocation. Never remove a concurrently modified file.
        const bytes = await optionalRegular(target, file.relative).catch(() => null);
        if (bytes && sha256(bytes) === file.sha256) await fs.unlink(file.destination).catch(() => {});
      }
    }
    await fs.unlink(path.join(target, next)).catch(() => {});
    for (const temporary of staged) await fs.unlink(temporary).catch(() => {});
    await fs.rmdir(path.join(target, staging)).catch(() => {});
    await fs.rmdir(path.join(target, '.genlib/staging')).catch(() => {});
    await writeLock.close();
    await fs.unlink(writeLockPath);
    if (!committed) for (const directory of directories.reverse()) await fs.rmdir(directory).catch(() => {});
  }
}

export async function installModule(context, id, options) {
  const initial = await prepare(context, id, options);
  invariant(initial.conflicts.length === 0, 'INSTALL_CONFLICT', initial.conflicts.join(' '));
  const replan = async () => ({ ...(await prepare(context, id, options)), root: context.root });
  const nextLock = (lock, plan, origin) => {
    for (const module of plan.modules) {
      const profiles = plan.selection.get(module.id)?.profiles;
      if (!Object.hasOwn(lock.modules, module.id)) lock.modules[module.id] = {
        version: module.version, out: plan.out, manifestSha256: module.manifestSha256,
        repository: context.catalog.repository, source: origin, ...(plan.tsImports ? { tsImports: true } : {}),
        ...(profiles ? { profiles } : {}),
      };
      else if (profiles) lock.modules[module.id].profiles = profiles;
      else delete lock.modules[module.id].profiles;
    }
    return lock;
  };
  return transaction(initial.target, replan, nextLock, async ({ plan, lock, origin, created }) => {
    // Receipts record what was selected and copied; `genlib adopted` later adds whether it is used and verified.
    const receipts = [];
    if (created) for (const module of plan.modules) {
      if (lock.modules[module.id]?.manifestSha256 !== module.manifestSha256) continue;
      await writeReceipt(plan.target, { module, plan, origin, repository: context.catalog.repository }).then(() => receipts.push(`.genlib/receipts/${module.id}.json`)).catch(() => {});
    }
    return { ...publicPlan(plan), writes: true, status: created ? 'installed' : 'unchanged', created, provenance: LOCK,
      ...(receipts.length ? { receipts, next: [`node "$GENLIB_ROOT"/bin/genlib.mjs adopted ${id} --target "$APP_ROOT" --test "<your test command>"`] } : {}) };
  });
}

// Language examples (tools/language-modules.mjs) and TypeScript recipes (tools/recipe-install.mjs) are plain file
// copies, but they share the module installer's ownership rules, so overlapping capabilities can coexist:
//   - a file Genlib already tracks in .genlib/lock.json and that still has the requested bytes is reused, and the lock
//     records every capability that depends on it (removal keeps it while one remains);
//   - an existing file that is untracked, edited, or recorded with different bytes is a conflict (never overwritten);
//   - a `mergeable` file (a dependency manifest the app may already own) is kept instead and reported for merging.
// `spec`: { kind: 'language'|'recipe', id, manifestSha256 (reviewed record + source hashes), out ('.' or a relative
// folder), root (the Genlib checkout), files: [{ target, bytes, mergeable? }] }. Paths are relative to the app root.
async function prepareCopy(targetPath, spec) {
  const target = await rootDirectory(targetPath);
  invariant(COPY_KINDS.includes(spec.kind) && ID.test(spec.id) && HASH.test(spec.manifestSha256), 'INVALID_OPTION', 'Invalid copy request.');
  invariant(spec.out === '.' || relativePath(spec.out, 'Destination folder'), 'UNSAFE_PATH', 'Invalid destination folder.');
  const lock = await readLock(target);
  const conflicts = [];
  const previous = Object.hasOwn(lock.modules, spec.id) ? lock.modules[spec.id] : null;
  if (previous && ((previous.kind ?? 'module') !== spec.kind || previous.out !== spec.out || previous.manifestSha256 !== spec.manifestSha256)) {
    conflicts.push(`${spec.id}: already recorded ${(previous.kind ?? 'module') !== spec.kind ? 'as a ' + (previous.kind ?? 'module') : previous.out !== spec.out ? 'in ' + previous.out + '/' : 'from a different reviewed version'}; remove it first (genlib remove ${spec.id}).`);
  }
  const lockKeys = new Map(Object.keys(lock.files).map(key => [key.toLowerCase(), key]));
  const seen = new Set();
  const records = [];
  for (const file of spec.files) {
    relativePath(file.target, 'Installed path');
    invariant(!seen.has(file.target.toLowerCase()), 'PATH_CONFLICT', 'Two files share a destination: ' + file.target);
    seen.add(file.target.toLowerCase());
    const digest = sha256(file.bytes);
    const record = { target: file.target, sha256: digest, bytes: file.bytes, modules: [spec.id], kind: 'source' };
    records.push(record);
    const tracked = Object.hasOwn(lock.files, file.target) ? lock.files[file.target] : null;
    const caseTwin = lockKeys.get(file.target.toLowerCase());
    // Parents and the file itself are checked without following symlinks; a symlink anywhere is an error.
    const existing = await optionalRegular(target, file.target, 4 * 1024 * 1024);
    if (caseTwin && caseTwin !== file.target) { record.action = 'conflict'; conflicts.push(file.target + ': differs only in case from tracked ' + caseTwin + '.'); }
    else if (existing) {
      if (tracked && tracked.sha256 === digest && sha256(existing) === digest) record.action = 'unchanged';
      else if (file.mergeable) { record.action = 'kept'; record.reason = tracked ? 'tracked with different bytes' : 'exists'; }
      else {
        record.action = 'conflict';
        conflicts.push(file.target + (tracked ? (tracked.sha256 === digest ? ': edited after Genlib installed it.' : ': Genlib tracks different bytes at this path.') : ': an untracked file already exists.'));
      }
    } else if (tracked && tracked.sha256 !== digest) {
      record.action = 'conflict';
      conflicts.push(file.target + ': recorded baseline differs from the requested source.');
    } else record.action = 'create';
  }
  const destinations = new Set(records.map(file => file.target.toLowerCase()));
  for (const file of records) {
    const segments = file.target.toLowerCase().split('/');
    for (let index = 1; index < segments.length; index++) {
      invariant(!destinations.has(segments.slice(0, index).join('/')), 'PATH_CONFLICT', 'A copied file is also used as a directory: ' + file.target);
    }
  }
  invariant(records.reduce((total, file) => total + file.bytes.length, 0) <= MAX_TOTAL_BYTES, 'SIZE_LIMIT', 'Installation exceeds the total size limit.');
  const version = spec.manifestSha256.slice(0, 12);
  return {
    target, root: spec.root, out: spec.out, lock, records, conflicts, kind: spec.kind, id: spec.id, previous,
    modules: [{ id: spec.id, version, manifestSha256: spec.manifestSha256 }],
    compatibility: { status: 'not-checked', warnings: ['Copied source is not compatibility-checked; run its tests in the receiving project.'] },
  };
}

function publicCopy(plan) {
  return {
    kind: plan.kind, id: plan.id, target: plan.target, out: plan.out,
    files: plan.records.map(file => ({ path: file.target, action: file.action, bytes: file.bytes.length, sha256: file.sha256, ...(file.reason ? { reason: file.reason } : {}) })),
    conflicts: plan.conflicts, writes: false, lock: LOCK,
  };
}

export async function planCopy(targetPath, spec) {
  return publicCopy(await prepareCopy(targetPath, spec));
}

async function repositoryOf(root) {
  try { return parseJson(await readRegular(root, 'registry/catalog.json', 8 * 1024 * 1024), 'registry/catalog.json').repository ?? null; } catch { return null; }
}

export async function installCopy(targetPath, spec) {
  const initial = await prepareCopy(targetPath, spec);
  invariant(initial.conflicts.length === 0, 'INSTALL_CONFLICT', initial.conflicts.join(' '));
  const repository = await repositoryOf(spec.root);
  const nextLock = (lock, plan, origin) => {
    if (!Object.hasOwn(lock.modules, plan.id)) lock.modules[plan.id] = {
      kind: plan.kind, version: plan.modules[0].version, out: plan.out, manifestSha256: plan.modules[0].manifestSha256, repository, source: origin,
    };
    return lock;
  };
  return transaction(initial.target, () => prepareCopy(targetPath, spec), nextLock, async ({ plan, origin, created }) => {
    const receipt = `.genlib/receipts/${plan.id}.json`;
    let wrote = false;
    if (created || !plan.previous) {
      await writeReceipt(plan.target, { module: plan.modules[0], plan, origin, repository, kind: plan.kind }).then(() => { wrote = true; }).catch(() => {});
    }
    return { ...publicCopy(plan), writes: true, status: created ? 'installed' : 'unchanged', created, ...(wrote ? { receipt } : {}) };
  });
}

export async function verifyInstallation(targetPath) {
  const target = await rootDirectory(targetPath);
  const lockBytes = await optionalRegular(target, LOCK, 2 * 1024 * 1024);
  invariant(lockBytes, 'NOT_INSTALLED', 'This project has no .genlib/lock.json.');
  const lock = validateLock(parseJson(lockBytes, LOCK));
  const files = [];
  for (const [relative, record] of Object.entries(lock.files)) {
    const bytes = await optionalRegular(target, relative);
    files.push({ path: relative, status: !bytes ? 'missing' : sha256(bytes) === record.sha256 ? 'unchanged' : 'modified' });
  }
  return {
    status: files.every(file => file.status === 'unchanged') ? 'unchanged' : 'drift',
    files,
    modules: Object.entries(lock.modules).map(([id, record]) => ({ id, ...(record.kind ? { kind: record.kind } : {}), version: record.version, out: record.out, source: record.source })),
    note: 'Hashes describe the installed baseline. Deliberate customization is reported as modified. Run the consuming application tests separately.',
  };
}

// Text view of plan/add for agents: what lands where, then the wiring to paste, then the next step. --json keeps the
// full record (same fields, `wiring` as one string).
export function formatInstall(result) {
  const root = result.modules.at(-1);
  const head = `${result.writes ? result.status : 'plan'} ${root.id}@${root.version} -> ${result.out}${result.profiles ? ` (profiles: ${result.profiles.join(', ')})` : ''}${result.tsImportsDetected ? ' (.ts imports: the app runs TypeScript directly)' : ''}${result.modules.length > 1 ? `  with ${result.modules.slice(0, -1).map(module => module.id).join(', ')}` : ''}`;
  return [head, ...result.files.map(file => `  ${file.action.padEnd(9)} ${file.path}`),
    ...result.conflicts.map(conflict => '# conflict: ' + conflict),
    ...(result.compatibility?.warnings ?? []).map(warning => '# note: ' + warning),
    ...(result.wiring ? ['# wiring (import paths are relative to the app root):', result.wiring] : []),
    ...(result.next ?? []).map(command => '# next: ' + command),
    ...(!result.writes && !result.conflicts.length ? ['# dry run: run add with the same options to copy these files'] : [])].join('\n');
}
