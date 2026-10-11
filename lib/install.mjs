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

function validateLock(lock) {
  invariant(object(lock) && lock.schemaVersion === 1 && object(lock.modules) && object(lock.files),
    'INVALID_LOCK', 'Invalid Genlib lock file; inspect it before continuing.');
  invariant(Object.keys(lock.files).length <= 10000 && Object.keys(lock.modules).length <= 1000,
    'INVALID_LOCK', 'Genlib lock file is too large.');
  for (const [id, entry] of Object.entries(lock.modules)) {
    invariant(ID.test(id) && object(entry) && typeof entry.version === 'string' &&
      HASH.test(entry.manifestSha256), 'INVALID_LOCK', 'Invalid installed module record.');
    outputPath(entry.out);
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

async function sourceRecords(context, modules, out) {
  const byTarget = new Map();
  for (const module of modules) {
    for (const file of module.files) {
      const bytes = await readRegular(context.root, file.path);
      invariant(bytes.length === file.bytes && sha256(bytes) === file.sha256,
        'INTEGRITY_MISMATCH', 'Source hash mismatch: ' + file.path);
      const destination = out + '/' + file.target;
      relativePath(destination, 'Installed path');
      const key = destination.toLowerCase();
      const existing = byTarget.get(key);
      invariant(!existing || (existing.target === destination && existing.sha256 === file.sha256),
        'PATH_CONFLICT', 'Modules disagree about target file: ' + destination);
      if (existing) existing.modules.push(module.id);
      else byTarget.set(key, { target: destination, sha256: file.sha256, bytes, modules: [module.id], kind: 'source' });
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
  const records = await sourceRecords(context, modules, out);
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
  return { target, out, modules, compatibility, lock, records, conflicts };
}

function publicPlan(plan) {
  return {
    target: plan.target, out: plan.out,
    modules: plan.modules.map(module => ({ id: module.id, version: module.version })),
    compatibility: plan.compatibility,
    files: plan.records.map(file => ({ path: file.target, action: file.action, bytes: file.bytes.length })),
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

export async function installModule(context, id, options) {
  const initial = await prepare(context, id, options);
  invariant(initial.conflicts.length === 0, 'INSTALL_CONFLICT', initial.conflicts.join(' '));
  const target = initial.target, directories = [], created = [];
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
    const plan = await prepare(context, id, options);
    invariant(plan.conflicts.length === 0, 'INSTALL_CONFLICT', plan.conflicts.join(' '));
    for (const [index, file] of plan.records.entries()) {
      if (file.action !== 'create') continue;
      await ensureDirectory(target, staging, directories);
      const stageRelative = staging + '/' + index;
      const stagePath = await checkedPath(target, stageRelative, true);
      const stageHandle = await fs.open(stagePath, 'wx', 0o644);
      staged.push(stagePath);
      try { await stageHandle.writeFile(file.bytes); await stageHandle.sync(); } finally { await stageHandle.close(); }
      await ensureDirectory(target, path.posix.dirname(file.target), directories);
      const destination = await checkedPath(target, file.target, true);
      // Publish a complete file atomically and refuse all existing names, including symlinks.
      await fs.link(stagePath, destination);
      created.push({ destination, relative: file.target, sha256: file.sha256 });
      await fs.unlink(stagePath);
    }
    const lock = structuredClone(plan.lock);
    const origin = sourceRevision(context.root);
    for (const module of plan.modules) {
      if (!Object.hasOwn(lock.modules, module.id)) lock.modules[module.id] = {
        version: module.version, out: plan.out, manifestSha256: module.manifestSha256,
        repository: context.catalog.repository, source: origin,
      };
    }
    for (const file of plan.records) {
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
    // Receipts record what was selected and copied; `genlib adopted` later adds whether it is used and verified.
    const receipts = [];
    if (created.length) for (const module of plan.modules) {
      if (lock.modules[module.id]?.manifestSha256 !== module.manifestSha256) continue;
      await writeReceipt(target, { module, plan, origin, repository: context.catalog.repository }).then(() => receipts.push(`.genlib/receipts/${module.id}.json`)).catch(() => {});
    }
    return { ...publicPlan(plan), writes: true, status: created.length ? 'installed' : 'unchanged', created: created.length, provenance: LOCK,
      ...(receipts.length ? { receipts, next: [`node "$GENLIB_ROOT"/bin/genlib.mjs adopted ${id} --target "$APP_ROOT" --test "<your test command>"`] } : {}) };
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
    modules: Object.entries(lock.modules).map(([id, record]) => ({ id, version: record.version, out: record.out, source: record.source })),
    note: 'Hashes describe the installed baseline. Deliberate customization is reported as modified. Run the consuming application tests separately.',
  };
}
