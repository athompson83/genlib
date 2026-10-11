import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ID, resolveModules } from './catalog.mjs';
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
export function transformSource(bytes, relative, { tsImports = false } = {}) {
  if (!tsImports || !/\.tsx?$/.test(relative)) return bytes;
  const text = bytes.toString('utf8');
  const next = text.replace(RELATIVE_JS, (_, lead, quote, stem) => `${lead}${quote}${stem}.ts${quote}`);
  return next === text ? bytes : Buffer.from(next, 'utf8');
}

async function sourceRecords(context, modules, out, { tsImports = false } = {}) {
  const byTarget = new Map();
  for (const module of modules) {
    for (const file of module.files) {
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

async function prepare(context, id, options) {
  const target = await rootDirectory(options.target);
  invariant(target !== context.root && !target.startsWith(context.root + path.sep),
    'INVALID_TARGET', 'Install into a consuming application outside the Genlib checkout.');
  const out = outputPath(options.out ?? 'src/genlib');
  const modules = await resolveModules(context, id);
  const compatibility = await checkCompatibility(target, modules, options.allowUnverified);
  const lock = await readLock(target);
  const tsImports = Boolean(options.tsImports);
  for (const module of modules) {
    const previous = Object.hasOwn(lock.modules, module.id) ? lock.modules[module.id] : null;
    invariant(!previous || Boolean(previous.tsImports) === tsImports, 'INVALID_OPTION',
      `${module.id} was installed ${previous?.tsImports ? 'with' : 'without'} --ts-imports; use the same setting.`);
  }
  const records = await sourceRecords(context, modules, out, { tsImports });
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
  return { target, out, modules, compatibility, lock, records, conflicts, tsImports };
}

function publicPlan(plan) {
  return {
    target: plan.target, out: plan.out,
    modules: plan.modules.map(module => ({ id: module.id, version: module.version })),
    compatibility: plan.compatibility,
    files: plan.records.map(file => ({ path: file.target, action: file.action, bytes: file.bytes.length })),
    ...(plan.tsImports ? { tsImports: true } : {}),
    conflicts: plan.conflicts,
    totalBytes: plan.records.reduce((sum, file) => sum + (file.action === 'create' ? file.bytes.length : 0), 0),
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
      if (!Object.hasOwn(lock.modules, module.id)) lock.modules[module.id] = {
        version: module.version, out: plan.out, manifestSha256: module.manifestSha256,
        repository: context.catalog.repository, source: origin, ...(plan.tsImports ? { tsImports: true } : {}),
      };
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
