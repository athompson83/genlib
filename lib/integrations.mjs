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
const WRITE_LOCK = '.genlib/install.lock';
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH = /^[a-f0-9]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const MAX_FILE = 5 * 1024 * 1024;
const MAX_PACK = 25 * 1024 * 1024;
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
  if (!bytes) return { schemaVersion: 1, integrations: {}, files: {} };
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
  return lock;
}

async function prepare(context, id, options) {
  invariant(object(options) && typeof options.target === 'string' && options.target.length > 0, 'INVALID_OPTION', 'An existing target directory is required.');
  const target = await rootDirectory(options.target);
  invariant(target !== context.root && !target.startsWith(context.root + path.sep), 'INVALID_TARGET', 'Select a receiving project outside this Genlib checkout.');
  const item = await selected(context, id);
  const out = outputPath(options.out ?? 'genlib/integrations/' + id);
  const compatibility = await checkCompatibility(target, [{ id, compatibility: { frameworks: item.frameworks, reactMajors: item.compatibility?.reactMajors ?? [18, 19] } }], options.allowUnverified === true);
  const lock = await readLock(target);
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
  return { target, out, item, compatibility, lock, records, conflicts };
}

function publicPlan(plan) {
  return { id: plan.item.id, version: plan.item.version, target: plan.target, out: plan.out, compatibility: plan.compatibility, files: plan.records.map(file => ({ path: file.target, bytes: file.bytes.length, sha256: file.sha256, action: file.action })), conflicts: plan.conflicts, writes: false, verification: plan.item.verification, dependencyInstallation: false };
}

export async function planIntegration(context, id, options) { return publicPlan(await prepare(context, id, options)); }

export async function installIntegration(context, id, options) {
  const initial = await prepare(context, id, options);
  invariant(initial.conflicts.length === 0, 'INSTALL_CONFLICT', initial.conflicts.join(' '));
  const { target } = initial;
  const directories = [], created = [];
  await ensureDirectory(target, '.genlib', directories);
  const lockFile = await checkedPath(target, WRITE_LOCK, true);
  let handle;
  try { handle = await fs.open(lockFile, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new GenlibError('INSTALL_BUSY', 'Another Genlib installation or a stale install lock exists.'); throw error; }
  const transaction = randomUUID();
  const next = '.genlib/integrations-lock.next.' + transaction;
  const staging = '.genlib/staging/integration-' + transaction;
  const staged = [];
  let committed = false;
  try {
    await handle.writeFile(jsonBytes({ pid: process.pid, integration: id }));
    const plan = await prepare(context, id, options);
    invariant(plan.conflicts.length === 0, 'INSTALL_CONFLICT', plan.conflicts.join(' '));
    if (plan.records.every(file => file.action === 'unchanged')) return { ...publicPlan(plan), status: 'unchanged', created: 0 };
    for (const file of plan.records.filter(file => file.action === 'create')) {
      await ensureDirectory(target, staging, directories);
      const stageFile = await checkedPath(target, staging + '/' + staged.length, true);
      const output = await fs.open(stageFile, 'wx', 0o644);
      staged.push(stageFile);
      try { await output.writeFile(file.bytes); await output.sync(); } finally { await output.close(); }
      await ensureDirectory(target, path.posix.dirname(file.target), directories);
      const destination = await checkedPath(target, file.target, true);
      // Publish complete bytes atomically without replacing an existing name.
      await fs.link(stageFile, destination);
      created.push({ destination, relative: file.target, sha256: file.sha256 });
      await fs.unlink(stageFile);
    }
    for (const file of plan.records) plan.lock.files[file.target] = { sha256: file.sha256, integration: file.integration };
    plan.lock.integrations[id] = { version: plan.item.version, out: plan.out, manifestSha256: plan.item.manifest.sha256, catalogSha256: context.catalogSha256, source: 'https://github.com/athompson83/genlib', installedAt: new Date().toISOString() };
    await fs.writeFile(await checkedPath(target, next, true), jsonBytes(plan.lock), { flag: 'wx', mode: 0o600 });
    await fs.rename(await checkedPath(target, next), await checkedPath(target, LOCK, true));
    committed = true;
    return { ...publicPlan(plan), status: 'installed', writes: true, created: created.length };
  } finally {
    if (!committed) for (const file of created.reverse()) {
      // A formatter or editor can change a published file without taking our lock.
      const bytes = await optionalRegular(target, file.relative, MAX_FILE).catch(() => null);
      if (bytes && sha256(bytes) === file.sha256) await fs.unlink(file.destination).catch(() => {});
    }
    await fs.unlink(path.join(target, next)).catch(() => {});
    for (const temporary of staged) await fs.unlink(temporary).catch(() => {});
    await fs.rmdir(path.join(target, staging)).catch(() => {});
    await fs.rmdir(path.join(target, '.genlib/staging')).catch(() => {});
    await handle.close();
    await fs.unlink(lockFile);
    for (const dir of directories.reverse()) await fs.rmdir(dir).catch(() => {});
  }
}

export async function verifyIntegrations(targetDirectory) {
  const target = await rootDirectory(targetDirectory);
  const lock = await readLock(target);
  const files = [];
  for (const [file, baseline] of Object.entries(lock.files)) {
    const bytes = await optionalRegular(target, file, MAX_FILE);
    files.push({ path: file, integration: baseline.integration, status: !bytes ? 'missing' : sha256(bytes) === baseline.sha256 ? 'unchanged' : 'modified' });
  }
  return { target, status: files.some(file => file.status !== 'unchanged') ? 'drift' : 'unchanged', integrations: Object.keys(lock.integrations), files };
}
