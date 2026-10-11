// SPDX-License-Identifier: Apache-2.0
// Provider profiles: an upstream implementation (a BTST plugin, a generator, a framework starter) adopted through
// Genlib's checks instead of its own CLI's defaults. A profile (resources/providers/<id>.json) declares:
//   prerequisites  what the app must already satisfy (package versions, Node, paths that must or must not exist,
//                  JSON settings); checked offline against the app, so an incompatible app is refused up front
//   steps          the exact, pinned commands the harness runs (Genlib runs none of them)
//   stage          how to produce the upstream output in a scratch copy, which Genlib then adopts with
//                  `provider adopt --from <scratch>`: new files only, existing identical files kept, differing files
//                  refused unless listed as merge files (reported for a manual merge, never overwritten)
//   acceptance     the feature contract and requirements the app should verify afterwards
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkedPath, ensureDirectory, GenlibError, invariant, jsonBytes, optionalRegular, relativePath, rootDirectory, sha256 } from './safety.mjs';
import { PROVIDERS_LOCK, readProvidersLock } from './registry-adapter.mjs';

const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const RECEIPTS = '.genlib/receipts';
const WRITE_LOCK = '.genlib/install.lock';
const MAX_FILE = 1024 * 1024;
const MAX_FILES = 500;
const SKIP = new Set(['node_modules', '.git', '.genlib', '.next', 'dist', 'build', '.turbo', 'coverage']);

export function providersDirectory(root) {
  return path.join(root, 'resources', 'providers');
}

export function loadProviders(root) {
  const dir = providersDirectory(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => {
    const profile = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
    validateProvider(profile, name);
    return profile;
  });
}

export function validateProvider(profile, where = 'provider') {
  const fail = message => { throw new GenlibError('INVALID_PROVIDER', `${where}: ${message}`); };
  if (!profile || !ID.test(profile.id ?? '') || (where.endsWith('.json') && `${profile.id}.json` !== where)) fail('id must be kebab-case and match the file name');
  for (const key of ['title', 'summary', 'license', 'status']) if (typeof profile[key] !== 'string' || !profile[key]) fail(`${key} is required`);
  if (!['planned', 'install-supported', 'fixture-verified'].includes(profile.status)) fail('status must be planned, install-supported or fixture-verified');
  if (!profile.upstream?.repository || !profile.upstream?.version) fail('upstream.repository and upstream.version are required');
  if (!Array.isArray(profile.tags) || !profile.tags.length) fail('tags are required');
  if (!Array.isArray(profile.prerequisites) || !profile.prerequisites.length) fail('prerequisites are required');
  for (const item of profile.prerequisites) {
    if (typeof item.id !== 'string' || typeof item.text !== 'string') fail('each prerequisite needs id and text');
    const kinds = ['package', 'node', 'path', 'absent', 'json', 'files'].filter(kind => item[kind] !== undefined);
    if (kinds.length !== 1) fail(`prerequisite ${item.id} needs exactly one of package, node, path, absent, json, files`);
    if (item.files !== undefined) {
      if (!Array.isArray(item.files) || !item.files.length || typeof item.forbid !== 'string') fail(`prerequisite ${item.id}: files needs a list and a forbid pattern`);
      try { new RegExp(item.forbid); } catch { fail(`prerequisite ${item.id}: forbid is not a valid pattern`); }
    }
    for (const key of ['min', 'max', 'exact']) if (item[key] !== undefined && !VERSION.test(item[key])) fail(`prerequisite ${item.id}: ${key} must be x.y.z`);
    for (const relative of [...(item.path ? [item.path] : []), ...(item.absent ?? []), ...(item.json ? [item.json] : []), ...(item.files ?? [])]) relativePath(relative, `prerequisite ${item.id}`);
  }
  if (!Array.isArray(profile.steps) || !profile.steps.length) fail('steps are required');
  for (const step of profile.steps) {
    if (!['install', 'stage', 'adopt', 'edit', 'env', 'migrate', 'verify'].includes(step.kind) || typeof step.purpose !== 'string') fail('each step needs a known kind and a purpose');
    if (step.run !== undefined && (typeof step.run !== 'string' || /@latest\b/.test(step.run))) fail(`step run must be a pinned command: ${step.run}`);
  }
  for (const file of profile.stage?.mergeFiles ?? []) relativePath(file, 'stage.mergeFiles');
  return profile;
}

// --- prerequisite checks ---------------------------------------------------------------------------------------

const parse = version => version.split('.').map(Number);
export function compareVersions(a, b) {
  const [x, y] = [parse(a), parse(b)];
  for (let index = 0; index < 3; index++) if (x[index] !== y[index]) return x[index] - y[index];
  return 0;
}

// The version the app actually has: node_modules first, else the lowest version its declared range allows.
function installedVersion(target, name, declared) {
  const manifest = path.join(target, 'node_modules', ...name.split('/'), 'package.json');
  if (existsSync(manifest)) {
    try { const version = JSON.parse(readFileSync(manifest, 'utf8')).version; if (VERSION.test(version)) return { version, source: 'installed' }; } catch {}
  }
  const spec = declared[name];
  if (typeof spec !== 'string') return null;
  const match = /^(?:\^|~|>=|=)?\s*v?(\d+\.\d+\.\d+)(?:\s|$)/.exec(spec.trim());
  return match ? { version: match[1], source: `declared ${spec}` } : { version: null, source: `declared ${spec}` };
}

function readJsonFile(target, relative) {
  const file = path.join(target, relative);
  if (!existsSync(file)) return undefined;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

const pathValue = (value, dotted) => dotted.split('.').reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), value);

/** Evaluates each prerequisite against the app; required failures make the profile not adoptable. */
export async function checkProvider(profile, targetPath, { nodeVersion = process.versions.node } = {}) {
  const target = await rootDirectory(targetPath);
  const pkg = readJsonFile(target, 'package.json') ?? {};
  const declared = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  const providersLock = await readProvidersLock(target);
  const results = profile.prerequisites.map(item => {
    const severity = item.severity ?? 'required';
    let ok, found;
    if (item.package) {
      const have = installedVersion(target, item.package, declared);
      if (!have) { ok = Boolean(item.ifPresent); found = 'not declared'; }
      else if (!have.version) { ok = false; found = `${have.source} (cannot tell the version)`; }
      else {
        ok = (!item.min || compareVersions(have.version, item.min) >= 0) && (!item.max || compareVersions(have.version, item.max) <= 0) && (!item.exact || have.version === item.exact);
        found = `${have.version} (${have.source})`;
      }
    } else if (item.node) {
      ok = compareVersions(nodeVersion.replace(/^v/, ''), item.node) >= 0;
      found = nodeVersion;
    } else if (item.path) {
      ok = existsSync(path.join(target, item.path));
      found = ok ? 'present' : 'missing';
    } else if (item.files) {
      // A file's content must not match (for example a framework flag the upstream code cannot run with).
      const pattern = new RegExp(item.forbid);
      const hits = item.files.filter(relative => existsSync(path.join(target, relative)) && pattern.test(readFileSync(path.join(target, relative), 'utf8')));
      ok = hits.length === 0;
      found = ok ? 'not found' : `matches in ${hits.join(', ')}`;
    } else if (item.absent) {
      // Paths this provider already adopted (recorded in the providers lock) are its own, not a conflict.
      const mine = new Set(Object.entries(providersLock.files ?? {}).filter(([, record]) => record.artifacts?.includes(`provider--${profile.id}`)).map(([file]) => file));
      const present = item.absent.filter(relative => existsSync(path.join(target, relative)) &&
        ![...mine].some(file => file === relative || file.startsWith(relative + '/')));
      ok = present.length === 0;
      found = ok ? 'none present' : `present: ${present.join(', ')}`;
    } else {
      const value = readJsonFile(target, item.json);
      const actual = value ? pathValue(value, item.key) : undefined;
      ok = value !== undefined && value !== null && JSON.stringify(actual) === JSON.stringify(item.equals);
      found = value === undefined ? `${item.json} missing` : value === null ? `${item.json} is not valid JSON` : `${item.key} = ${JSON.stringify(actual)}`;
    }
    return { id: item.id, text: item.text, severity, ok, found };
  });
  const blocking = results.filter(item => !item.ok && item.severity === 'required');
  return {
    provider: profile.id, target, ready: blocking.length === 0, results,
    blocking: blocking.map(item => item.id), warnings: results.filter(item => !item.ok && item.severity === 'warning').map(item => item.id),
  };
}

// --- staged output adoption --------------------------------------------------------------------------------------

async function listFiles(root, relative = '', out = []) {
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    invariant(!entry.isSymbolicLink(), 'UNSAFE_PATH', `Staged output contains a symlink: ${child}`);
    if (entry.isDirectory()) await listFiles(root, child, out);
    else if (entry.isFile()) out.push(child);
    invariant(out.length <= MAX_FILES, 'STAGE_TOO_LARGE', `Staged output has more than ${MAX_FILES} files.`);
  }
  return out;
}

/**
 * Compares a staged copy (the upstream generator's output in a scratch copy of the app) with the app. Files equal
 * to the app's are `identical`; new files are `create`; differing files are `conflict`, except `mergeFiles`
 * (for example the global stylesheet), which are `merge` and never written. Only files that differ from the
 * pre-scaffold baseline count as generator output when `baseline` (a pristine copy) is given.
 */
export async function planStaged(profile, stagedPath, targetPath, { baseline } = {}) {
  const staged = await rootDirectory(stagedPath);
  const target = await rootDirectory(targetPath);
  invariant(staged !== target, 'INVALID_OPTION', 'Stage into a scratch copy of the app, not the app itself.');
  const base = baseline ? await rootDirectory(baseline) : null;
  const merge = new Set(profile.stage?.mergeFiles ?? []);
  const files = [];
  for (const relative of await listFiles(staged)) {
    relativePath(relative, 'Staged file');
    const bytes = await optionalRegular(staged, relative, MAX_FILE);
    if (base) {
      const before = await optionalRegular(base, relative, MAX_FILE).catch(() => null);
      if (before && sha256(before) === sha256(bytes)) continue; // unchanged by the generator
    }
    const existing = await optionalRegular(target, relative, MAX_FILE).catch(() => null);
    const action = !existing ? 'create' : sha256(existing) === sha256(bytes) ? 'identical' : merge.has(relative) ? 'merge' : 'conflict';
    files.push({ path: relative, action, sha256: sha256(bytes), bytes });
  }
  if (!base) {
    // Without a baseline, unchanged app files show up as identical; keep only generator output in the summary.
    for (const file of files) if (file.action === 'identical') file.note = 'already present (pass --baseline to separate unchanged app files)';
  }
  const conflicts = files.filter(file => file.action === 'conflict').map(file => file.path);
  return {
    provider: profile.id, target, staged, files: files.map(({ bytes, ...rest }) => rest), conflicts,
    merges: files.filter(file => file.action === 'merge').map(file => file.path),
    status: conflicts.length ? 'conflict' : 'ready', _writes: files.filter(file => file.action === 'create'),
  };
}

/** Applies a conflict-free staged plan: creates new files only, records ownership and a receipt. */
export async function adoptStaged(profile, stagedPath, targetPath, options = {}) {
  const plan = await planStaged(profile, stagedPath, targetPath, options);
  invariant(!plan.conflicts.length, 'INSTALL_CONFLICT', `Existing files differ: ${plan.conflicts.join(', ')}. Resolve them in the app or the staged copy first.`);
  const target = plan.target;
  await ensureDirectory(target, '.genlib');
  const lockPath = await checkedPath(target, WRITE_LOCK, true);
  let handle;
  try { handle = await fs.open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new GenlibError('INSTALL_BUSY', 'Another Genlib operation or a stale .genlib/install.lock exists.');
    throw error;
  }
  const created = [];
  const id = `provider--${profile.id}`;
  try {
    for (const file of plan._writes) {
      await ensureDirectory(target, path.posix.dirname(file.path));
      const out = await fs.open(await checkedPath(target, file.path, true), 'wx', 0o644);
      try { await out.writeFile(file.bytes); await out.sync(); } finally { await out.close(); }
      created.push(file);
    }
    const lock = await readProvidersLock(target);
    const owned = plan.files.filter(file => file.action === 'create');
    const at = new Date().toISOString();
    lock.artifacts[id] = { provider: profile.id, name: profile.id, type: 'provider', source: profile.upstream.repository, version: profile.upstream.version,
      itemSha256: sha256(Buffer.from(JSON.stringify(profile))), installedAt: at, files: owned.map(file => file.path), merges: plan.merges };
    for (const file of owned) lock.files[file.path] = { sha256: file.sha256, artifacts: [...new Set([...(lock.files[file.path]?.artifacts ?? []), id])].sort() };
    await writeAtomic(target, PROVIDERS_LOCK, jsonBytes(lock));
    await writeAtomic(target, `${RECEIPTS}/${id}.json`, jsonBytes({
      schemaVersion: 1, module: id, version: profile.upstream.version, manifestSha256: lock.artifacts[id].itemSha256, provider: profile.id,
      source: { repository: profile.upstream.repository }, out: '.', installedAt: at, files: owned.map(file => ({ path: file.path, sha256: file.sha256 })),
      outcomes: { found: true, copied: true, used: null, verified: null }, checks: [],
    }));
  } catch (error) {
    for (const file of created) {
      const bytes = await optionalRegular(target, file.path).catch(() => null);
      if (bytes && sha256(bytes) === file.sha256) await fs.unlink(path.join(target, file.path)).catch(() => {});
    }
    throw error;
  } finally {
    await handle.close();
    await fs.unlink(lockPath).catch(() => {});
  }
  const { _writes, ...visible } = plan;
  return { ...visible, writes: true, created: created.length, artifact: id, provenance: PROVIDERS_LOCK,
    next: [...plan.merges.map(file => `Merge ${file} by hand from the staged copy; Genlib does not overwrite it.`),
      `node "$GENLIB_ROOT"/bin/genlib.mjs adopted ${id} --target "$APP_ROOT" --test "<your acceptance command>"${profile.acceptance ? ` --accepts ${profile.acceptance.requirements.map(requirement => `${profile.acceptance.contract}#${requirement}`).join(',')}` : ''}`] };
}

async function writeAtomic(target, relative, bytes) {
  await ensureDirectory(target, path.posix.dirname(relative));
  const temporary = `${path.posix.dirname(relative)}/.genlib-tmp-${randomUUID()}`;
  const temporaryPath = await checkedPath(target, temporary, true);
  const handle = await fs.open(temporaryPath, 'wx', 0o644);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temporaryPath, await checkedPath(target, relative, true));
}

/** Compact view for agents: what it is, what it needs, and the ordered steps. */
export function providerSummary(profile) {
  const { id, title, summary, license, status, upstream, tags, frameworks, acceptance } = profile;
  return { id, title, summary, license, status, upstream, tags, ...(frameworks ? { frameworks } : {}), ...(acceptance ? { acceptance } : {}) };
}
