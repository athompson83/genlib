import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import { checkCompatibility } from './install.mjs';
import { checkedPath, ensureDirectory, GenlibError, invariant, jsonBytes, object, optionalRegular, outputPath, parseJson, readRegular, relativePath, rootDirectory, sha256 } from './safety.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const INDEX = 'registry/integrations.json';
const LOCK = '.genlib/integrations-lock.json';
const RECOVERY = '.genlib/integrations-recovery.json';
const WRITE_LOCK = '.genlib/install.lock';
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH = /^[a-f0-9]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const MAX_FILE = 5 * 1024 * 1024;
const MAX_PACK = 25 * 1024 * 1024;
const MAX_RECOVERY = 1024 * 1024;
const MAX_RECOVERY_FILES = 1003;
const RECOVERY_PREVIEW = 32;
const RECOVERY_GUIDANCE = 'Published files are retained. Run integration verify for this target, inspect .genlib/integrations-recovery.json, and reconcile the listed paths with your project history before manually clearing that journal. Genlib will not adopt, overwrite or delete those files during recovery.';
const strings = (values, max = 100) => Array.isArray(values) && values.length <= max && values.every(value => typeof value === 'string' && value.length > 0 && value.length <= 2000);

export function validateIntegration(item) {
  invariant(object(item) && item.schemaVersion === 1 && ID.test(item.id) && VERSION.test(item.version) && item.license === 'Apache-2.0', 'INVALID_INTEGRATION', 'Integration identity, version and original Apache-2.0 license are required.');
  invariant(typeof item.title === 'string' && item.title.length > 0 && item.title.length <= 160 && typeof item.summary === 'string' && item.summary.length > 0 && item.summary.length <= 2000, 'INVALID_INTEGRATION', 'Integration title and summary are required.');
  for (const key of ['languages', 'frameworks', 'platforms', 'resources', 'tags']) invariant(strings(item[key]) && (key === 'resources' || item[key].length > 0), 'INVALID_INTEGRATION', 'Invalid integration ' + key + ': ' + item.id);
  invariant(item.resources.every(value => ID.test(value)), 'INVALID_INTEGRATION', 'Invalid resource reference: ' + item.id);
  invariant(item.compatibility === undefined || (object(item.compatibility) && Array.isArray(item.compatibility.reactMajors) && item.compatibility.reactMajors.length > 0 && item.compatibility.reactMajors.every(value => value === 18 || value === 19)), 'INVALID_INTEGRATION', 'Invalid React compatibility profile.');
  invariant(strings(item.files, 1000) && item.files.length > 0 && item.files.includes('CONTRACT.md') && strings(item.entrypoints) && item.entrypoints.length > 0, 'INVALID_INTEGRATION', 'Integration needs explicit files, entrypoints and CONTRACT.md: ' + item.id);
  const names = new Set();
  for (const file of item.files) {
    relativePath(file, 'Integration file');
    invariant(!file.split('/').some(part => ['node_modules', 'vendor', '.genlib', '.git'].includes(part.toLowerCase())) && file !== 'integration.json', 'UNSAFE_PATH', 'Integration files must not include dependencies, installer state or their manifest.');
    invariant(!names.has(file.toLowerCase()), 'PATH_CONFLICT', 'Duplicate integration file: ' + file);
    names.add(file.toLowerCase());
  }
  for (const file of item.files) {
    const parts = file.toLowerCase().split('/');
    for (let i = 1; i < parts.length; i++) invariant(!names.has(parts.slice(0, i).join('/')), 'PATH_CONFLICT', 'Integration file/directory collision: ' + file);
  }
  invariant(item.entrypoints.every(file => item.files.includes(file)), 'INVALID_INTEGRATION', 'Every entrypoint must be an included file.');
  invariant(object(item.verification) && ['experimental', 'tested'].includes(item.verification.level) && strings(item.verification.commands) && item.verification.commands.length > 0 && strings(item.verification.notes), 'INVALID_INTEGRATION', 'Integration verification commands and notes are required.');
  invariant(item.verification.profiles === undefined || strings(item.verification.profiles, 20), 'INVALID_INTEGRATION', 'Verification profiles must be concise strings.');
  invariant(item.verification.level !== 'tested' || item.verification.profiles?.length > 0, 'INVALID_INTEGRATION', 'Tested integrations must identify the runtime profiles actually exercised.');
  return item;
}

async function record(root, file, target) {
  const bytes = await readRegular(root, file, MAX_FILE);
  invariant(bytes.length > 0, 'INVALID_FILE', 'Empty integration files are not allowed: ' + file);
  return { path: file, target, bytes: bytes.length, sha256: sha256(bytes) };
}

export async function buildIntegrationArtifacts(repositoryRoot = ROOT) {
  const root = await rootDirectory(repositoryRoot);
  const entries = await fs.readdir(path.join(root, 'integrations'), { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const items = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    invariant(entry.isDirectory() && ID.test(entry.name), 'INVALID_INTEGRATION', 'Unexpected integration entry: ' + entry.name);
    const prefix = 'integrations/' + entry.name + '/';
    const manifest = await record(root, prefix + 'integration.json', 'integration.json');
    const item = validateIntegration(parseJson(await readRegular(root, manifest.path, MAX_FILE), manifest.path));
    invariant(item.id === entry.name, 'INVALID_INTEGRATION', 'Integration directory and ID differ.');
    const files = await Promise.all(item.files.map(file => record(root, prefix + file, file)));
    invariant(files.reduce((sum, file) => sum + file.bytes, 0) <= MAX_PACK, 'SIZE_LIMIT', 'Integration exceeds 25 MiB: ' + item.id);
    items.push({ ...item, files, manifest });
  }
  const catalog = { schemaVersion: 1, provenance: 'Original Genlib adapters. Dependencies retain their upstream terms; no package installation or hooks are executed.', license: await record(root, 'LICENSE', 'LICENSE'), notice: await record(root, 'NOTICE', 'NOTICE'), items };
  return new Map([[INDEX, jsonBytes(catalog)]]);
}

export async function loadIntegrationCatalog(repositoryRoot = ROOT) {
  const root = await rootDirectory(repositoryRoot);
  const bytes = await optionalRegular(root, INDEX, 10 * 1024 * 1024);
  if (!bytes) return { root, catalog: { schemaVersion: 1, items: [] }, catalogSha256: null };
  const catalog = parseJson(bytes, INDEX);
  invariant(object(catalog) && catalog.schemaVersion === 1 && Array.isArray(catalog.items) && catalog.items.length <= 500, 'INVALID_INTEGRATION', 'Invalid integration registry.');
  const ids = new Set();
  for (const item of catalog.items) {
    invariant(Array.isArray(item.files), 'INVALID_INTEGRATION', 'Invalid integration files.');
    validateIntegration({ ...item, files: item.files.map(file => file.target) });
    invariant(!ids.has(item.id), 'INVALID_INTEGRATION', 'Duplicate integration ID.');
    ids.add(item.id);
    for (const file of [item.manifest, ...item.files]) {
      invariant(object(file) && typeof file.path === 'string' && file.path.startsWith('integrations/' + item.id + '/') && HASH.test(file.sha256) && Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= MAX_FILE, 'INVALID_INTEGRATION', 'Invalid integration integrity record.');
      relativePath(file.path); relativePath(file.target);
      invariant(file.path === 'integrations/' + item.id + '/' + file.target, 'INVALID_INTEGRATION', 'Integration source and target must agree.');
    }
    invariant(item.manifest.target === 'integration.json' && item.files.reduce((n, file) => n + file.bytes, 0) <= MAX_PACK, 'SIZE_LIMIT', 'Invalid integration manifest or size.');
  }
  for (const [key, expected] of [['license', 'LICENSE'], ['notice', 'NOTICE']]) {
    const file = catalog[key];
    invariant(object(file) && file.path === expected && HASH.test(file.sha256) && Number.isSafeInteger(file.bytes) && file.bytes > 0, 'INVALID_INTEGRATION', 'Invalid integration attribution record.');
  }
  return { root, catalog, catalogSha256: sha256(bytes) };
}

export function integrationSummary(item) {
  const { id, version, title, summary, languages, frameworks, platforms, resources, tags, entrypoints, verification, license, compatibility } = item;
  return { id, version, title, summary, languages, frameworks, platforms, resources, tags, entrypoints, verification, license, ...(compatibility ? { compatibility } : {}), ...(verification.profiles?.length ? { testedProfiles: verification.profiles } : {}), guide: 'integrations/' + id + '/CONTRACT.md', readiness: 'recipe-available' };
}

async function checkedBytes(context, file) {
  const bytes = await readRegular(context.root, file.path, MAX_FILE);
  invariant(bytes.length === file.bytes && sha256(bytes) === file.sha256, 'INTEGRITY_MISMATCH', 'Integration source changed: ' + file.path);
  return bytes;
}

async function selected(context, id) {
  invariant(typeof id === 'string' && ID.test(id), 'INVALID_OPTION', 'Invalid integration ID.');
  const item = context.catalog.items.find(entry => entry.id === id);
  invariant(item, 'NOT_FOUND', 'Unknown integration: ' + id);
  const authored = validateIntegration(parseJson(await checkedBytes(context, item.manifest), item.manifest.path));
  invariant(JSON.stringify(authored.files) === JSON.stringify(item.files.map(file => file.target)), 'INTEGRITY_MISMATCH', 'Integration file list differs from its manifest.');
  for (const key of ['id', 'version', 'license', 'frameworks', 'languages', 'platforms', 'resources', 'entrypoints', 'verification', 'compatibility']) invariant(JSON.stringify(authored[key]) === JSON.stringify(item[key]), 'INTEGRITY_MISMATCH', 'Integration metadata differs: ' + key);
  return item;
}

export async function inspectIntegration(context, id) {
  const item = await selected(context, id);
  const contractFile = item.files.find(file => file.target === 'CONTRACT.md');
  return { ...integrationSummary(item), files: item.files.map(({ target, bytes, sha256 }) => ({ path: target, bytes, sha256 })), contract: (await checkedBytes(context, contractFile)).toString('utf8'), dependencyInstallation: 'Review the pack manifest and run its documented package commands deliberately; Genlib never executes them.' };
}

export async function readIntegrationFile(context, id, file) {
  const item = await selected(context, id);
  relativePath(file);
  const found = item.files.find(entry => entry.target === file);
  invariant(found, 'NOT_FOUND', 'File is not declared by the integration.');
  const bytes = await checkedBytes(context, found);
  invariant(isUtf8(bytes), 'BINARY_FILE', 'Only UTF-8 integration files can be read as text.');
  return { id, path: file, sha256: found.sha256, bytes: found.bytes, content: bytes.toString('utf8') };
}

async function readLock(target) {
  const bytes = await optionalRegular(target, LOCK, 5 * 1024 * 1024);
  if (!bytes) return { lock: { schemaVersion: 1, integrations: {}, files: {} }, sha256: null };
  const lock = parseJson(bytes, LOCK);
  invariant(object(lock) && lock.schemaVersion === 1 && object(lock.integrations) && object(lock.files) && Object.keys(lock.integrations).length <= 500 && Object.keys(lock.files).length <= 25000, 'INVALID_LOCK', 'Invalid integration lock.');
  for (const [id, value] of Object.entries(lock.integrations)) {
    invariant(ID.test(id) && object(value) && VERSION.test(value.version) && HASH.test(value.manifestSha256), 'INVALID_LOCK', 'Invalid installed integration.');
    outputPath(value.out);
  }
  for (const [file, value] of Object.entries(lock.files)) {
    relativePath(file);
    invariant(object(value) && HASH.test(value.sha256) && (value.integration === null || ID.test(value.integration)), 'INVALID_LOCK', 'Invalid integration file baseline.');
  }
  return { lock, sha256: sha256(bytes) };
}

function validateRecovery(journal) {
  invariant(object(journal) && journal.schemaVersion === 1 && typeof journal.transactionId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(journal.transactionId), 'INVALID_RECOVERY', 'Invalid integration recovery transaction.');
  invariant(typeof journal.integration === 'string' && ID.test(journal.integration) && VERSION.test(journal.version) && HASH.test(journal.manifestSha256) && HASH.test(journal.proposedLockSha256) && (journal.previousLockSha256 === null || HASH.test(journal.previousLockSha256)) && (journal.catalogSha256 === null || HASH.test(journal.catalogSha256)), 'INVALID_RECOVERY', 'Invalid integration recovery identity or hashes.');
  outputPath(journal.out);
  invariant(typeof journal.startedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(journal.startedAt) && Number.isFinite(Date.parse(journal.startedAt)), 'INVALID_RECOVERY', 'Invalid integration recovery time.');
  invariant(Array.isArray(journal.files) && journal.files.length > 0 && journal.files.length <= MAX_RECOVERY_FILES, 'INVALID_RECOVERY', 'Invalid integration recovery file count.');
  const names = new Set();
  for (const file of journal.files) {
    invariant(object(file) && HASH.test(file.sha256) && Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= MAX_FILE && ['create', 'unchanged'].includes(file.action), 'INVALID_RECOVERY', 'Invalid integration recovery file record.');
    relativePath(file.path, 'Recovery file');
    const ordinary = file.integration === journal.integration && file.path.startsWith(journal.out + '/') && !file.path.slice(journal.out.length + 1).split('/').some(part => ['node_modules', 'vendor', '.genlib', '.git'].includes(part.toLowerCase()));
    const attribution = file.integration === null && ['.genlib/licenses/Apache-2.0.txt', '.genlib/NOTICE'].includes(file.path);
    invariant(ordinary || attribution, 'INVALID_RECOVERY', 'Recovery file is outside the declared integration and attribution paths.');
    invariant(!names.has(file.path.toLowerCase()), 'INVALID_RECOVERY', 'Duplicate recovery file.');
    names.add(file.path.toLowerCase());
  }
  invariant(journal.files.reduce((sum, file) => sum + file.bytes, 0) <= MAX_PACK + 3 * MAX_FILE, 'INVALID_RECOVERY', 'Recovery file sizes exceed the integration and attribution limit.');
  invariant(journal.files.some(file => file.path === journal.out + '/integration.json') && journal.files.some(file => file.action === 'create'), 'INVALID_RECOVERY', 'Recovery journal must describe a pending integration installation.');
  return journal;
}

async function readRecovery(target) {
  try {
    const bytes = await optionalRegular(target, RECOVERY, MAX_RECOVERY);
    if (!bytes) return null;
    return { state: 'pending', journal: validateRecovery(parseJson(bytes, RECOVERY)) };
  } catch (error) {
    // Invalid, linked or oversized evidence is still an incomplete installation.
    // Do not use any paths from a journal that did not pass validation.
    return { state: 'unreadable', code: typeof error.code === 'string' ? error.code : 'IO_ERROR' };
  }
}

async function syncDirectory(target, relative = '') {
  let handle;
  try {
    handle = await fs.open(relative ? await checkedPath(target, relative) : target, 'r');
    await handle.sync();
  } catch (error) {
    // Windows does not consistently expose directory fsync. File data is still
    // synced, but power-loss guarantees depend on the host filesystem.
    if (process.platform !== 'win32' || !['EISDIR', 'EPERM', 'EINVAL', 'ENOTSUP', 'EBADF'].includes(error.code)) throw error;
  } finally { await handle?.close(); }
}

async function writePrivate(target, relative, bytes, temporary, mode = 0o600) {
  const filename = await checkedPath(target, relative, true);
  const handle = await fs.open(filename, 'wx', mode);
  temporary.add(filename);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  return filename;
}

async function observeRecoveryFile(target, file) {
  try {
    const filename = await checkedPath(target, file.path);
    const info = await fs.lstat(filename);
    invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'INVALID_FILE', 'Recovery target is not an ordinary file.');
    // A different size already proves drift. Bound any content read by the
    // journal's expected sizes rather than reading MAX_FILE for every entry.
    if (info.size !== file.bytes) return { status: 'different' };
    const bytes = await readRegular(target, file.path, file.bytes);
    return { status: sha256(bytes) === file.sha256 ? 'matches-proposed' : 'different' };
  } catch (error) {
    return error.code === 'ENOENT' ? { status: 'missing' } : { status: 'unreadable', code: typeof error.code === 'string' ? error.code : 'IO_ERROR' };
  }
}

async function prepare(context, id, options) {
  invariant(object(options) && typeof options.target === 'string' && options.target.length > 0, 'INVALID_OPTION', 'An existing target directory is required.');
  const target = await rootDirectory(options.target);
  invariant(target !== context.root && !target.startsWith(context.root + path.sep), 'INVALID_TARGET', 'Select a receiving project outside this Genlib checkout.');
  const item = await selected(context, id);
  const out = outputPath(options.out ?? 'genlib/integrations/' + id);
  const compatibility = await checkCompatibility(target, [{ id, compatibility: { frameworks: item.frameworks, reactMajors: item.compatibility?.reactMajors ?? [18, 19] } }], options.allowUnverified === true);
  invariant(await readRecovery(target) === null, 'INSTALL_INCOMPLETE', 'An integration recovery journal requires review. ' + RECOVERY_GUIDANCE);
  const { lock, sha256: lockSha256 } = await readLock(target);
  const records = [];
  for (const file of [item.manifest, ...item.files]) records.push({ target: out + '/' + file.target, bytes: await checkedBytes(context, file), sha256: file.sha256, integration: id });
  for (const [key, dest] of [['license', '.genlib/licenses/Apache-2.0.txt'], ['notice', '.genlib/NOTICE']]) {
    const file = context.catalog[key];
    records.push({ target: dest, bytes: await checkedBytes(context, file), sha256: file.sha256, integration: null });
  }
  const conflicts = [];
  const previous = Object.hasOwn(lock.integrations, id) && lock.integrations[id];
  if (previous && (previous.version !== item.version || previous.out !== out || previous.manifestSha256 !== item.manifest.sha256)) conflicts.push('A different version or location is already installed: ' + id);
  for (const file of records) {
    relativePath(file.target);
    const existing = await optionalRegular(target, file.target, MAX_FILE);
    const baseline = Object.hasOwn(lock.files, file.target) && lock.files[file.target];
    file.action = 'create';
    if (existing) {
      if (sha256(existing) === file.sha256 && (baseline?.sha256 === file.sha256 || file.integration === null)) file.action = 'unchanged';
      else { file.action = 'conflict'; conflicts.push('Existing untracked or modified file: ' + file.target); }
    } else if (baseline && baseline.sha256 !== file.sha256) {
      file.action = 'conflict'; conflicts.push('Recorded baseline differs: ' + file.target);
    }
  }
  return { target, out, item, compatibility, lock, lockSha256, records, conflicts };
}

function publicPlan(plan) {
  return { id: plan.item.id, version: plan.item.version, target: plan.target, out: plan.out, compatibility: plan.compatibility, files: plan.records.map(file => ({ path: file.target, bytes: file.bytes.length, sha256: file.sha256, action: file.action })), conflicts: plan.conflicts, writes: false, verification: plan.item.verification, dependencyInstallation: false };
}

export async function planIntegration(context, id, options) { return publicPlan(await prepare(context, id, options)); }

export async function installIntegration(context, id, options) {
  const initial = await prepare(context, id, options);
  invariant(initial.conflicts.length === 0, 'INSTALL_CONFLICT', initial.conflicts.join(' '));
  const { target } = initial;
  await ensureDirectory(target, '.genlib');
  const lockFile = await checkedPath(target, WRITE_LOCK, true);
  let handle;
  try { handle = await fs.open(lockFile, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new GenlibError('INSTALL_BUSY', 'Another Genlib installation or a stale install lock exists.'); throw error; }
  const transaction = randomUUID();
  const next = '.genlib/integrations-lock.next.' + transaction;
  const recoveryNext = '.genlib/integrations-recovery.next.' + transaction;
  const staging = '.genlib/staging/integration-' + transaction;
  const temporary = new Set();
  let recoveryPublished = false;
  let result, failure;
  try {
    await handle.writeFile(jsonBytes({ pid: process.pid, integration: id, transactionId: transaction }));
    const plan = await prepare(context, id, options);
    invariant(plan.conflicts.length === 0, 'INSTALL_CONFLICT', plan.conflicts.join(' '));
    if (plan.records.every(file => file.action === 'unchanged')) {
      result = { ...publicPlan(plan), status: 'unchanged', created: 0 };
    } else {
      const startedAt = new Date().toISOString();
      const proposedLock = structuredClone(plan.lock);
      for (const file of plan.records) proposedLock.files[file.target] = { sha256: file.sha256, integration: file.integration };
      proposedLock.integrations[id] = { version: plan.item.version, out: plan.out, manifestSha256: plan.item.manifest.sha256, catalogSha256: context.catalogSha256, source: 'https://github.com/athompson83/genlib', installedAt: startedAt };
      const lockBytes = jsonBytes(proposedLock);
      invariant(lockBytes.length <= 5 * 1024 * 1024 && Object.keys(proposedLock.integrations).length <= 500 && Object.keys(proposedLock.files).length <= 25000, 'SIZE_LIMIT', 'The proposed integration baseline exceeds its size limit.');
      const journal = validateRecovery({
        schemaVersion: 1, transactionId: transaction, integration: id, version: plan.item.version, out: plan.out, startedAt,
        manifestSha256: plan.item.manifest.sha256, catalogSha256: context.catalogSha256,
        previousLockSha256: plan.lockSha256, proposedLockSha256: sha256(lockBytes),
        files: plan.records.map(file => ({ path: file.target, bytes: file.bytes.length, sha256: file.sha256, integration: file.integration, action: file.action })),
      });
      const journalBytes = jsonBytes(journal);
      invariant(journalBytes.length <= MAX_RECOVERY, 'SIZE_LIMIT', 'The integration recovery journal exceeds 1 MiB.');
      const creates = plan.records.filter(file => file.action === 'create');
      // Complete private staging before writing the immutable write-ahead journal.
      await ensureDirectory(target, staging);
      for (const [index, file] of creates.entries()) file.stage = await writePrivate(target, staging + '/' + index, file.bytes, temporary, 0o644);
      const recoveryTemporary = await writePrivate(target, recoveryNext, journalBytes, temporary);
      await fs.link(recoveryTemporary, await checkedPath(target, RECOVERY, true));
      recoveryPublished = true;
      await fs.unlink(recoveryTemporary);
      await syncDirectory(target, '.genlib');
      await syncDirectory(target);
      for (const file of creates) {
        await ensureDirectory(target, path.posix.dirname(file.target));
        const destination = await checkedPath(target, file.target, true);
        // A published name becomes application-owned. Never unlink it on failure,
        // even if a hash read appears unchanged: an editor can save after that read.
        await fs.link(file.stage, destination);
        await fs.unlink(file.stage);
        await syncDirectory(target, path.posix.dirname(file.target));
      }
      const nextPath = await writePrivate(target, next, lockBytes, temporary);
      const currentLock = await optionalRegular(target, LOCK, 5 * 1024 * 1024);
      invariant((currentLock ? sha256(currentLock) : null) === plan.lockSha256, 'INSTALL_CONFLICT', 'The integration baseline changed during installation.');
      await fs.rename(nextPath, await checkedPath(target, LOCK, true));
      await syncDirectory(target, '.genlib');
      result = { ...publicPlan(plan), status: 'installed', writes: true, created: creates.length };
    }
  } catch (error) {
    failure = error;
  } finally {
    // These names are private to this transaction. Published source, attribution,
    // the last baseline and the recovery journal are never rollback targets.
    for (const filename of temporary) {
      try { await fs.unlink(filename); } catch (error) { if (error.code !== 'ENOENT') failure ??= error; }
    }
    for (const directory of [staging, '.genlib/staging']) {
      try { await fs.rmdir(path.join(target, directory)); }
      catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) failure ??= error; }
    }
    try { await handle.close(); } catch (error) { failure ??= error; }
    try { await fs.unlink(lockFile); } catch (error) { if (error.code !== 'ENOENT') failure ??= error; }
  }
  // Clearing recovery is the last operation. Until it succeeds, another attempt
  // is blocked even if the baseline rename already committed successfully.
  if (!failure && recoveryPublished) {
    try { await fs.unlink(await checkedPath(target, RECOVERY)); } catch (error) { failure = error; }
  }
  if (failure) {
    if (recoveryPublished || await readRecovery(target) !== null) {
      const error = new GenlibError('INSTALL_INCOMPLETE', 'Integration installation did not finish. ' + RECOVERY_GUIDANCE);
      error.cause = failure;
      throw error;
    }
    throw failure;
  }
  return result;
}

export async function verifyIntegrations(targetDirectory) {
  const target = await rootDirectory(targetDirectory);
  const recovery = await readRecovery(target);
  let lock, lockSha256, lockIssue;
  try { ({ lock, sha256: lockSha256 } = await readLock(target)); }
  catch (error) {
    if (!recovery) throw error;
    lock = { integrations: {}, files: {} };
    lockIssue = typeof error.code === 'string' ? error.code : 'IO_ERROR';
  }
  const files = [];
  for (const [file, baseline] of Object.entries(lock.files)) {
    try {
      const bytes = await optionalRegular(target, file, MAX_FILE);
      files.push({ path: file, integration: baseline.integration, status: !bytes ? 'missing' : sha256(bytes) === baseline.sha256 ? 'unchanged' : 'modified' });
    } catch (error) {
      if (!recovery) throw error;
      files.push({ path: file, integration: baseline.integration, status: 'unreadable', code: typeof error.code === 'string' ? error.code : 'IO_ERROR' });
    }
  }
  const baselineStatus = lockIssue ? 'unreadable' : files.some(file => file.status !== 'unchanged') ? 'drift' : 'unchanged';
  if (!recovery) return { target, status: baselineStatus, integrations: Object.keys(lock.integrations), files };
  const evidence = { path: RECOVERY, state: recovery.state, guidance: RECOVERY_GUIDANCE };
  if (recovery.state === 'pending') {
    const journal = recovery.journal;
    Object.assign(evidence, { transactionId: journal.transactionId, integration: journal.integration, version: journal.version, out: journal.out, startedAt: journal.startedAt,
      previousLockSha256: journal.previousLockSha256, proposedLockSha256: journal.proposedLockSha256,
      baselineState: lockIssue ? 'unreadable' : lockSha256 === journal.proposedLockSha256 ? 'matches-proposed' : lockSha256 === journal.previousLockSha256 ? 'matches-previous' : 'different',
      fileCount: journal.files.length, counts: { 'matches-proposed': 0, different: 0, missing: 0, unreadable: 0 } });
    const observations = [];
    for (const file of journal.files) {
      const observation = await observeRecoveryFile(target, file);
      evidence.counts[observation.status]++;
      observations.push({ path: file.path, action: file.action, ...observation });
    }
    evidence.files = observations.sort((a, b) => Number(a.status === 'matches-proposed') - Number(b.status === 'matches-proposed') || a.path.localeCompare(b.path)).slice(0, RECOVERY_PREVIEW);
    evidence.omittedFiles = journal.files.length - evidence.files.length;
  } else evidence.code = recovery.code;
  return { target, status: 'incomplete', baselineStatus, ...(lockIssue ? { baselineIssue: lockIssue } : {}), integrations: Object.keys(lock.integrations), files, recovery: evidence };
}
