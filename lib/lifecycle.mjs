// After installation: adoption receipts, the "is it actually used" check, rollback and updates.
// A receipt keeps four outcomes apart, because each needs different evidence:
//   found    the module was selected (its id, version and manifest digest)
//   copied   its files were installed with recorded hashes
//   used     application code outside the installed folder imports those files
//   verified the project's own test command passed with the module in place
// Updates follow Copier's model: unchanged files are replaced, locally edited files are three-way merged
// against the original they were copied from (read from the Genlib checkout at the recorded commit), and
// conflicts are written for review instead of overwriting anyone's edits.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { loadModule, resolveModules } from './catalog.mjs';
import { readLock } from './install.mjs';
import { PROVIDERS_LOCK, readProvidersLock } from './registry-adapter.mjs';
import { checkedPath, ensureDirectory, GenlibError, invariant, jsonBytes, optionalRegular, parseJson, readRegular, rootDirectory, sha256 } from './safety.mjs';

const LOCK = '.genlib/lock.json';
const WRITE_LOCK = '.genlib/install.lock';
const RECEIPTS = '.genlib/receipts';
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', '.genlib', 'dist', 'build', '.next', '.nuxt', '.svelte-kit', 'coverage', 'out', '.turbo', '.vercel']);
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(['"])([^'"\n]{1,300})\1/gm;

async function withWriteLock(target, work) {
  const directories = [];
  await ensureDirectory(target, '.genlib', directories);
  const lockPath = await checkedPath(target, WRITE_LOCK, true);
  let handle;
  try { handle = await fs.open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new GenlibError('INSTALL_BUSY', 'Another Genlib operation or a stale .genlib/install.lock exists.');
    throw error;
  }
  try { return await work(); } finally { await handle.close(); await fs.unlink(lockPath).catch(() => {}); }
}

async function writeAtomic(target, relative, bytes) {
  await ensureDirectory(target, path.posix.dirname(relative));
  const temporary = path.posix.dirname(relative) + '/.genlib-tmp-' + randomUUID();
  const temporaryPath = await checkedPath(target, temporary, true);
  const handle = await fs.open(temporaryPath, 'wx', 0o644);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await checkedPath(target, relative, true);
  await fs.rename(temporaryPath, path.join(target, relative));
}

const receiptPath = id => `${RECEIPTS}/${id}.json`;
async function readReceipt(target, id) {
  const bytes = await optionalRegular(target, receiptPath(id), 512 * 1024);
  return bytes ? parseJson(bytes, receiptPath(id)) : null;
}

/** Records what was selected and copied. Called by installModule after it commits. */
export async function writeReceipt(target, { module, plan, origin, repository }) {
  const files = plan.records.filter(file => file.modules.includes(module.id) && file.kind === 'source').map(file => ({ path: file.target, sha256: file.sha256 }));
  const previous = await readReceipt(target, module.id);
  const receipt = {
    schemaVersion: 1, module: module.id, version: module.version, manifestSha256: module.manifestSha256,
    source: { repository, ...origin }, out: plan.out, installedAt: new Date().toISOString(),
    compatibility: plan.compatibility, files,
    outcomes: { found: true, copied: true, used: null, verified: null },
    checks: previous?.module === module.id ? previous.checks ?? [] : [],
  };
  await writeAtomic(target, receiptPath(module.id), jsonBytes(receipt));
  return receipt;
}

async function walk(target, relative, out, limit) {
  if (out.length >= limit) return;
  let entries;
  try { entries = await fs.readdir(path.join(target, relative), { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (out.length >= limit) return;
    const child = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) await walk(target, child, out, limit); }
    else if (entry.isFile() && SOURCE_EXT.test(entry.name)) out.push(child);
  }
}

const stripExtension = file => file.replace(/\.(?:[cm]?[jt]sx?)$/, '');

/**
 * Finds application files that import the installed files. Relative specifiers are resolved exactly; bare or
 * alias specifiers (@/genlib/x, ~/genlib/x) count when they end with the installed path.
 */
export async function findUsage(target, installed, installedRoot, exclude = new Set()) {
  const sources = [];
  await walk(target, '', sources, 20000);
  const wanted = new Map(installed.map(file => [stripExtension(file), file]));
  const usedBy = [];
  for (const file of sources) {
    if (installedRoot && (file === installedRoot || file.startsWith(installedRoot + '/'))) continue;
    if (exclude.has(file)) continue;
    const bytes = await optionalRegular(target, file, 512 * 1024).catch(() => null);
    if (!bytes) continue;
    for (const match of bytes.toString('utf8').matchAll(SPECIFIER)) {
      const specifier = match[2];
      let hit;
      if (specifier.startsWith('.')) {
        const resolved = stripExtension(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
        hit = wanted.get(resolved) ?? wanted.get(resolved + '/index');
        if (hit) usedBy.push({ file, specifier, installed: hit, match: 'resolved' });
      } else {
        const bare = stripExtension(specifier.replace(/^[@~#]\//, ''));
        for (const [key, value] of wanted) if (key === bare || key.endsWith('/' + bare)) { usedBy.push({ file, specifier, installed: value, match: 'alias' }); break; }
      }
    }
  }
  return { scanned: sources.length, usedBy };
}

/**
 * Checks adoption of an installed module: files present (copied), imported by application code (used) and,
 * with `test`, the project's own command passing (verified). Appends the check to the receipt.
 */
// `accepts` (requires `test`): feature-contract requirement keys (`<contract>#<requirement>`) that the test command
// exercises. A passing run records them in the receipt's `acceptance` list, which genlib coverage --target reads as
// application-verified. Callers validate the keys against resources/feature-contracts (see lib/coverage.mjs).
export async function checkAdoption(targetPath, id, { test, accepts = [], timeoutMs = 600_000 } = {}) {
  invariant(Array.isArray(accepts) && accepts.every(key => /^[a-z0-9-]+#[a-z0-9-]+$/.test(key)), 'INVALID_OPTION', 'accepts takes contract#requirement keys.');
  invariant(!accepts.length || test !== undefined, 'INVALID_OPTION', '--accepts needs --test: acceptance is recorded only from a test command you run.');
  const target = await rootDirectory(targetPath);
  const lock = await readLock(target);
  let entry = lock.modules[id];
  let owned, excluded = new Set();
  if (entry) owned = Object.entries(lock.files).filter(([, record]) => record.modules.includes(id) && (record.kind ?? 'source') === 'source');
  else {
    // Provider artifacts (registry items adopted with genlib registry add) are recorded in their own lock.
    const providers = await readProvidersLock(target);
    const artifact = providers.artifacts[id];
    invariant(artifact, 'NOT_INSTALLED', `${id} is not recorded in .genlib/lock.json or ${PROVIDERS_LOCK}.`);
    owned = artifact.files.map(file => [file, providers.files[file]]).filter(([, record]) => record);
    const directories = artifact.files.map(file => path.posix.dirname(file));
    entry = { out: directories.length === 1 ? path.posix.dirname(directories[0]) : '.', version: artifact.itemSha256.slice(0, 12), manifestSha256: artifact.itemSha256, provider: artifact.provider };
    // Registry files importing each other (a block importing its button) are not application use.
    excluded = new Set(Object.keys(providers.files));
  }
  const files = [];
  for (const [relative, record] of owned) {
    const bytes = await optionalRegular(target, relative);
    files.push({ path: relative, status: !bytes ? 'missing' : sha256(bytes) === record.sha256 ? 'unchanged' : 'modified' });
  }
  const copied = files.length > 0 && files.every(file => file.status !== 'missing');
  const installedRoot = entry.provider ? null : `${entry.out}/${id}`;
  const usage = await findUsage(target, owned.map(([relative]) => relative), installedRoot, excluded);
  const used = usage.usedBy.length > 0;
  let testResult = null;
  if (test !== undefined) {
    invariant(typeof test === 'string' && test.trim().length > 0 && test.length <= 500, 'INVALID_OPTION', 'Provide one test command of at most 500 characters.');
    const started = Date.now();
    const run = spawnSync(test, { cwd: target, shell: true, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split('\n');
    testResult = { command: test, exitCode: run.status, timedOut: run.error?.code === 'ETIMEDOUT', durationMs: Date.now() - started, tail: output.slice(-15).join('\n').slice(-2000) };
  }
  const verified = testResult ? used && testResult.exitCode === 0 : null;
  const status = verified ? 'verified' : used ? 'used' : copied ? 'copied' : 'incomplete';
  const check = { at: new Date().toISOString(), status, files, usedBy: usage.usedBy.slice(0, 20), scannedFiles: usage.scanned, ...(testResult ? { test: testResult } : {}) };
  const receipt = (await readReceipt(target, id)) ?? { schemaVersion: 1, module: id, version: entry.version, manifestSha256: entry.manifestSha256, out: entry.out, files: owned.map(([p, r]) => ({ path: p, sha256: r.sha256 })), checks: [] };
  receipt.outcomes = { found: true, copied, used, verified };
  receipt.checks = [...(receipt.checks ?? []), check].slice(-20);
  if (accepts.length && testResult) {
    const record = { at: check.at, requirements: [...new Set(accepts)].sort(), command: testResult.command, exitCode: testResult.exitCode, used };
    // A newer run for the same requirement set replaces the older one, so a later failure withdraws acceptance.
    receipt.acceptance = [...(receipt.acceptance ?? []).filter(item => item.requirements.join() !== record.requirements.join()), { ...record, exitCode: used ? record.exitCode : null }].slice(-50);
  }
  await withWriteLock(target, () => writeAtomic(target, receiptPath(id), jsonBytes(receipt)));
  return {
    module: id, status, outcomes: receipt.outcomes, ...(accepts.length ? { accepted: testResult?.exitCode === 0 && used ? [...new Set(accepts)].sort() : [] } : {}), files, usedBy: usage.usedBy.slice(0, 20), scannedFiles: usage.scanned, ...(testResult ? { test: testResult } : {}),
    next: !copied ? ['Files are missing: reinstall with genlib add, or remove the record with genlib remove.']
      : !used ? [`Import it from application code (${installedRoot ? installedRoot + '/' : owned.map(([relative]) => relative).slice(0, 3).join(', ')}), then run this check again.`]
        : verified === null ? ['Run this check again with --test "<your test command>" to record verification.']
          : verified ? [] : ['The test command failed; read test.tail, fix the integration, and run the check again.'],
    receipt: receiptPath(id),
  };
}

async function writeLockFile(target, lock) {
  await writeAtomic(target, LOCK, jsonBytes(lock));
}

/**
 * Rolls back an installed module: deletes its files that still match their installed hash, keeps edited
 * files (reported), and removes the lock record. Refuses when another installed module depends on it.
 */
export async function removeModule(context, targetPath, id, { dryRun = false } = {}) {
  const target = await rootDirectory(targetPath);
  const lock = await readLock(target);
  invariant(lock.modules[id], 'NOT_INSTALLED', `${id} is not recorded in .genlib/lock.json.`);
  const dependents = [];
  for (const other of Object.keys(lock.modules)) {
    if (other === id) continue;
    const chain = await resolveModules(context, other).catch(() => []);
    if (chain.some(module => module.id === id)) dependents.push(other);
  }
  invariant(dependents.length === 0, 'IN_USE', `${id} is required by ${dependents.join(', ')}; remove those first.`);
  const remaining = Object.keys(lock.modules).filter(other => other !== id);
  const actions = [];
  for (const [relative, record] of Object.entries(lock.files)) {
    if (!record.modules.includes(id)) continue;
    const others = record.modules.filter(other => other !== id);
    if (others.length) { actions.push({ path: relative, action: 'keep-shared', modules: others }); continue; }
    if ((record.kind === 'license' || record.kind === 'notice') && remaining.length) { actions.push({ path: relative, action: 'keep-shared' }); continue; }
    const bytes = await optionalRegular(target, relative);
    actions.push({ path: relative, action: !bytes ? 'already-missing' : sha256(bytes) === record.sha256 ? 'delete' : 'keep-modified' });
  }
  if (!dryRun) {
    await withWriteLock(target, async () => {
      const next = structuredClone(lock);
      for (const item of actions) {
        if (item.action === 'delete') await fs.unlink(await checkedPath(target, item.path));
        if (item.action === 'keep-shared' && next.files[item.path]) next.files[item.path].modules = next.files[item.path].modules.filter(other => other !== id);
        else delete next.files[item.path];
      }
      delete next.modules[id];
      await writeLockFile(target, next);
      const receipt = await readReceipt(target, id);
      if (receipt) {
        receipt.outcomes = { ...receipt.outcomes, removed: true };
        receipt.checks = [...(receipt.checks ?? []), { at: new Date().toISOString(), status: 'removed', kept: actions.filter(item => item.action === 'keep-modified').map(item => item.path) }].slice(-20);
        await writeAtomic(target, receiptPath(id), jsonBytes(receipt));
      }
      // Remove directories left empty by the deletion (never a directory that still holds anything).
      for (const item of actions.filter(entry => entry.action === 'delete')) {
        let directory = path.posix.dirname(item.path);
        while (directory && directory !== '.') { try { await fs.rmdir(path.join(target, directory)); } catch { break; } directory = path.posix.dirname(directory); }
      }
    });
  }
  return { module: id, dryRun, files: actions, kept: actions.filter(item => item.action === 'keep-modified').map(item => item.path),
    note: 'Edited files are kept and reported; delete them yourself once nothing imports them. Package dependencies the module asked you to add are not removed.' };
}

// The file a module shipped at a past commit, read from the Genlib checkout (null when unavailable).
function gitShow(root, commit, file) {
  if (!commit || !/^[a-f0-9]{40,64}$/.test(commit)) return null;
  const result = spawnSync('git', ['show', `${commit}:${file}`], { cwd: root, timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

function mergeThreeWay(ours, base, theirs) {
  const dir = path.join(process.env.TMPDIR ?? '/tmp', 'genlib-merge-' + randomUUID());
  return fs.mkdir(dir, { mode: 0o700 }).then(async () => {
    try {
      await Promise.all([fs.writeFile(path.join(dir, 'ours'), ours), fs.writeFile(path.join(dir, 'base'), base), fs.writeFile(path.join(dir, 'theirs'), theirs)]);
      const run = spawnSync('git', ['merge-file', '-p', '-L', 'your edits', '-L', 'installed version', '-L', 'new Genlib version', 'ours', 'base', 'theirs'], { cwd: dir, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
      invariant(run.status !== null && run.status >= 0 && run.status < 128, 'MERGE_FAILED', 'git merge-file failed: ' + (run.stderr?.toString() ?? ''));
      return { merged: run.stdout, conflicts: run.status };
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
}

/**
 * Updates an installed module to the version in this checkout. Unchanged files are replaced; edited files are
 * three-way merged against the copy installed earlier; conflicts are left for review as <file>.genlib-conflict
 * (default) or inline markers (conflict: 'inline'). Dry run by default: pass write to apply.
 */
export async function updateModule(context, targetPath, id, { write = false, conflict = 'rej', original } = {}) {
  invariant(['rej', 'inline'].includes(conflict), 'INVALID_OPTION', 'conflict must be rej or inline.');
  const target = await rootDirectory(targetPath);
  const lock = await readLock(target);
  const entry = lock.modules[id];
  invariant(entry, 'NOT_INSTALLED', `${id} is not recorded in .genlib/lock.json; use genlib add.`);
  const module = await loadModule(context, id);
  const commit = entry.source?.commit ?? null;
  // `original(path)` returns a file as it was at the installed commit; the default reads the Genlib git history.
  const readOriginal = original ?? (file => gitShow(context.root, commit, file));
  const oldManifestBytes = readOriginal(`modules/${id}/module.json`);
  const oldManifest = oldManifestBytes ? parseJson(oldManifestBytes, 'installed module.json') : null;
  const oldSource = new Map((oldManifest?.files ?? []).map(file => [`${entry.out}/${file.target}`, `modules/${id}/${file.source}`]));
  const newFiles = new Map(module.files.map(file => [`${entry.out}/${file.target}`, file]));
  const actions = [];
  for (const [relative, file] of newFiles) {
    const upstream = await readRegular(context.root, file.path);
    invariant(sha256(upstream) === file.sha256, 'INTEGRITY_MISMATCH', 'Source hash mismatch: ' + file.path);
    const record = lock.files[relative];
    const local = await optionalRegular(target, relative);
    if (!local) { actions.push({ path: relative, action: record ? 'restore' : 'create', bytes: upstream, sha256: file.sha256 }); continue; }
    const localHash = sha256(local);
    if (localHash === file.sha256) { actions.push({ path: relative, action: 'unchanged', sha256: file.sha256 }); continue; }
    if (record && localHash === record.sha256) { actions.push({ path: relative, action: 'replace', bytes: upstream, sha256: file.sha256 }); continue; }
    if (record && record.sha256 === file.sha256) { actions.push({ path: relative, action: 'keep-local', sha256: file.sha256 }); continue; }
    // Edited locally and changed upstream: merge against the installed original.
    const base = oldSource.has(relative) ? readOriginal(oldSource.get(relative)) : null;
    if (!record || !base || sha256(base) !== record.sha256) {
      actions.push({ path: relative, action: 'conflict', reason: !record ? 'untracked local file' : 'installed original unavailable', bytes: upstream, sha256: file.sha256 });
      continue;
    }
    const { merged, conflicts } = await mergeThreeWay(local, base, upstream);
    actions.push(conflicts === 0 ? { path: relative, action: 'merged', bytes: merged, sha256: file.sha256 } : { path: relative, action: 'conflict', conflicts, bytes: merged, markers: true, sha256: file.sha256 });
  }
  for (const [relative, record] of Object.entries(lock.files)) {
    if (!record.modules.includes(id) || newFiles.has(relative) || (record.kind ?? 'source') !== 'source' || record.modules.length > 1) continue;
    const local = await optionalRegular(target, relative);
    actions.push({ path: relative, action: !local ? 'already-missing' : sha256(local) === record.sha256 ? 'delete' : 'keep-removed-upstream' });
  }
  const summary = actions.map(({ bytes, ...rest }) => rest);
  const dependencyChanges = module.dependencies.filter(dep => lock.modules[dep.id] && lock.modules[dep.id].version !== dep.version).map(dep => `${dep.id}@${dep.version}`);
  if (write) {
    await withWriteLock(target, async () => {
      const next = structuredClone(lock);
      for (const item of actions) {
        if (['create', 'restore', 'replace', 'merged'].includes(item.action) || (item.action === 'conflict' && conflict === 'inline' && item.markers)) await writeAtomic(target, item.path, item.bytes);
        else if (item.action === 'conflict') await writeAtomic(target, item.path + '.genlib-conflict', item.bytes);
        if (item.action === 'delete') { await fs.unlink(await checkedPath(target, item.path)); delete next.files[item.path]; continue; }
        if (['already-missing', 'keep-removed-upstream'].includes(item.action)) { delete next.files[item.path]; continue; }
        next.files[item.path] = { sha256: item.sha256, modules: [...new Set([...(next.files[item.path]?.modules ?? []), id])].sort(), kind: 'source' };
      }
      next.modules[id] = { ...entry, version: module.version, manifestSha256: module.manifestSha256, source: { ...(entry.source ?? {}), ...currentRevision(context.root) } };
      await writeLockFile(target, next);
    });
  }
  return {
    module: id, from: entry.version, to: module.version, write, conflictMode: conflict, files: summary,
    conflicts: summary.filter(item => item.action === 'conflict').map(item => item.path),
    ...(dependencyChanges.length ? { updateDependenciesFirst: dependencyChanges } : {}),
    changelog: (module.changelog ?? []).filter(change => change.version !== entry.version).slice(0, 10),
    note: write ? 'Resolve each conflict (the .genlib-conflict file holds the merge with markers, or the new version when no original was available), then run genlib adopted with your tests.'
      : 'Dry run: nothing was written. Pass --write to apply.',
  };
}

function currentRevision(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] });
  const commit = result.status === 0 && /^[a-f0-9]{40,64}$/.test(result.stdout.trim()) ? result.stdout.trim() : null;
  return { commit };
}

export const RECEIPT_DIRECTORY = RECEIPTS;
