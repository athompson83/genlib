// SPDX-License-Identifier: Apache-2.0
// Adopts shadcn-format registry items (ui.shadcn.com or any registry serving registry-item JSON) through
// Genlib's protections instead of copying them blind:
//   resolve   fetch the item and its registryDependencies (https only, size-capped), record each item's SHA-256,
//             and verify an expected digest when one is pinned
//   plan      map each file to the app's aliases (components.json, else src/ or root defaults), rewrite
//             @/registry/<style>/... imports to those aliases, and report create / identical / conflict per file,
//             plus the npm dependencies to install, CSS variables and env vars the app must add itself
//   add       write only after a conflict-free plan, atomically, with ownership recorded in
//             .genlib/providers-lock.json, the original item JSON kept in .genlib/providers/ for later updates,
//             and an adoption receipt so `genlib adopted` can check use and acceptance
// Genlib never runs the package manager: dependency installation is returned as one exact command.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkedPath, ensureDirectory, GenlibError, invariant, jsonBytes, optionalRegular, parseJson, relativePath, rootDirectory, sha256 } from './safety.mjs';

export const PROVIDERS_LOCK = '.genlib/providers-lock.json';
const ORIGINALS = '.genlib/providers';
const RECEIPTS = '.genlib/receipts';
const WRITE_LOCK = '.genlib/install.lock';
const MAX_ITEM_BYTES = 1024 * 1024;
const MAX_ITEMS = 40;
const SHADCN_BASE = 'https://ui.shadcn.com/r/styles/';
const NAME = /^[a-z0-9][a-z0-9-]{0,80}$/;
const DEFAULT_ALIASES = { components: '@/components', ui: '@/components/ui', lib: '@/lib', hooks: '@/hooks', utils: '@/lib/utils' };
const TYPE_ALIAS = { 'registry:ui': 'ui', 'registry:lib': 'lib', 'registry:hook': 'hooks', 'registry:component': 'components', 'registry:block': 'components' };

/** `shadcn:<name>` → the default registry URL; https URLs pass through. */
export function itemUrl(spec, { style = 'new-york-v4' } = {}) {
  if (spec.startsWith('https://')) return new URL(spec).href;
  const match = /^shadcn:([a-z0-9-]+)$/.exec(spec);
  invariant(match && /^[a-z0-9-]{1,40}$/.test(style), 'INVALID_OPTION', 'Use shadcn:<name> or an https:// registry item URL.');
  return `${SHADCN_BASE}${style}/${match[1]}.json`;
}

export const artifactId = item => `shadcn--${item.name}`;

async function fetchItem(url, fetchImpl) {
  invariant(url.startsWith('https://'), 'UNSAFE_SOURCE', 'Registry items are fetched over https only: ' + url);
  let response;
  try { response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { accept: 'application/json' } }); }
  catch (error) { throw new GenlibError('FETCH_FAILED', `Could not fetch ${url}: ${error.message}`); }
  invariant(!response.url || response.url.startsWith('https://'), 'UNSAFE_SOURCE', 'Registry redirected away from https: ' + response.url);
  invariant(response.ok, 'FETCH_FAILED', `${url} returned HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  invariant(bytes.length <= MAX_ITEM_BYTES, 'ITEM_TOO_LARGE', `${url} is larger than ${MAX_ITEM_BYTES} bytes.`);
  const item = parseJson(bytes, url);
  validateItem(item, url);
  return { url, item, bytes, sha256: sha256(bytes) };
}

export function validateItem(item, where = 'item') {
  invariant(item && typeof item === 'object' && NAME.test(item.name ?? ''), 'INVALID_ITEM', `${where}: name is missing or unsafe.`);
  invariant(Array.isArray(item.files) && item.files.length > 0 && item.files.length <= 50, 'INVALID_ITEM', `${where}: files must list 1-50 files.`);
  for (const file of item.files) {
    invariant(typeof file.path === 'string' && typeof file.content === 'string', 'INVALID_ITEM', `${where}: each file needs path and inline content.`);
    invariant(file.content.length <= MAX_ITEM_BYTES, 'INVALID_ITEM', `${where}: ${file.path} is too large.`);
  }
  for (const key of ['dependencies', 'devDependencies', 'registryDependencies']) {
    invariant(item[key] === undefined || (Array.isArray(item[key]) && item[key].every(value => typeof value === 'string' && value.length <= 300)), 'INVALID_ITEM', `${where}: ${key} must be a string list.`);
  }
  for (const spec of [...(item.dependencies ?? []), ...(item.devDependencies ?? [])]) {
    invariant(/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.^~<>=*| -]+)?$/i.test(spec), 'INVALID_ITEM', `${where}: unsafe package spec ${spec}.`);
  }
}

/** Fetches the item and its registryDependencies (names resolve next to the parent URL). Dependencies come first. */
export async function resolveItems(spec, { style, sha256: expected, fetch: fetchImpl = globalThis.fetch } = {}) {
  const rootUrl = itemUrl(spec, { style });
  const order = [], seen = new Map(), visiting = new Set();
  async function visit(url, depth) {
    if (seen.has(url)) return;
    invariant(!visiting.has(url), 'INVALID_ITEM', 'registryDependencies form a cycle at ' + url);
    invariant(depth <= 10 && seen.size < MAX_ITEMS, 'INVALID_ITEM', 'Too many or too deeply nested registry dependencies.');
    visiting.add(url);
    const fetched = await fetchItem(url, fetchImpl);
    for (const dependency of fetched.item.registryDependencies ?? []) {
      const next = dependency.startsWith('https://') ? dependency
        : NAME.test(dependency) ? new URL(`${dependency}.json`, url).href
          : null;
      invariant(next, 'INVALID_ITEM', `Unsupported registry dependency "${dependency}" in ${url}; use a name or an https URL.`);
      await visit(next, depth + 1);
    }
    visiting.delete(url);
    seen.set(url, fetched);
    order.push(fetched);
  }
  await visit(rootUrl, 0);
  const root = seen.get(rootUrl);
  if (expected) invariant(root.sha256 === expected, 'INTEGRITY_MISMATCH', `${rootUrl} has SHA-256 ${root.sha256}, expected ${expected}. The registry content changed; review it before adopting.`);
  return { root: root.item.name, items: order };
}

async function readJson(target, relative) {
  const bytes = await optionalRegular(target, relative, 512 * 1024);
  if (!bytes) return null;
  try { return JSON.parse(bytes.toString('utf8').replace(/^\s*\/\/.*$/gm, '')); } catch { return null; }
}

// Alias → directory: tsconfig paths ("@/*": ["./src/*"]) when present, else src/ when it exists, else the root.
async function aliasResolver(target) {
  const components = await readJson(target, 'components.json');
  const aliases = { ...DEFAULT_ALIASES, ...(components?.aliases ?? {}) };
  const tsconfig = (await readJson(target, 'tsconfig.json')) ?? (await readJson(target, 'jsconfig.json'));
  const paths = tsconfig?.compilerOptions?.paths ?? {};
  const hasSrc = await fs.stat(path.join(target, 'src')).then(stat => stat.isDirectory(), () => false);
  const toDirectory = alias => {
    for (const [pattern, [first] = []] of Object.entries(paths)) {
      const prefix = pattern.replace(/\*$/, '');
      if (pattern.endsWith('*') && first && alias.startsWith(prefix)) return path.posix.normalize(first.replace(/^\.\//, '').replace(/\*$/, '') + alias.slice(prefix.length)).replace(/\/$/, '');
    }
    invariant(/^[@~#]\//.test(alias), 'INVALID_OPTION', `Cannot map alias ${alias} to a directory; add it to tsconfig paths.`);
    return (hasSrc ? 'src/' : '') + alias.slice(2);
  };
  return { aliases, toDirectory, hasComponentsJson: Boolean(components) };
}

// shadcn source imports the registry's own layout; the CLI rewrites those to the app's aliases. So do we.
export function rewriteImports(content, aliases) {
  return content.replace(/(["'])@\/registry\/[a-z0-9-]+\/(ui|lib|hooks|components|blocks\/[a-z0-9-]+\/components)\/([^"']+)\1/g, (whole, quote, kind, rest) => {
    const alias = kind === 'ui' ? aliases.ui : kind === 'lib' ? aliases.lib : kind === 'hooks' ? aliases.hooks : aliases.components;
    return `${quote}${alias}/${rest}${quote}`;
  });
}

function targetFor(file, item, resolver) {
  if (file.target) return relativePath(file.target.replace(/^~\//, ''), 'Registry target');
  const kind = TYPE_ALIAS[file.type ?? item.type];
  invariant(kind, 'INVALID_ITEM', `${item.name}: file ${file.path} of type ${file.type} needs an explicit target.`);
  const directory = resolver.toDirectory(resolver.aliases[kind]);
  // Blocks keep their sub-path below components/ (login-01/components/login-form.tsx → login-form.tsx).
  return relativePath(`${directory}/${path.posix.basename(file.path)}`, 'Registry target');
}

async function packageManager(target) {
  for (const [file, manager] of [['pnpm-lock.yaml', 'pnpm add'], ['yarn.lock', 'yarn add'], ['bun.lockb', 'bun add'], ['bun.lock', 'bun add']]) {
    if (await optionalRegular(target, file, 1).catch(() => null) !== null) return manager;
  }
  return 'npm install';
}

export async function readProvidersLock(target) {
  const bytes = await optionalRegular(target, PROVIDERS_LOCK, 2 * 1024 * 1024);
  return bytes ? parseJson(bytes, PROVIDERS_LOCK) : { schemaVersion: 1, artifacts: {}, files: {} };
}

/** Plans adoption of a resolved item set into the target; writes nothing. `keepExisting` keeps differing files. */
export async function planRegistry(targetPath, resolved, { keepExisting = false } = {}) {
  const target = await rootDirectory(targetPath);
  const resolver = await aliasResolver(target);
  const providers = await readProvidersLock(target);
  const moduleLock = (await readJson(target, '.genlib/lock.json')) ?? { files: {} };
  const files = [], seenTargets = new Map();
  const pkg = (await readJson(target, 'package.json')) ?? {};
  const declared = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  for (const { url, item, sha256: itemSha } of resolved.items) {
    for (const file of item.files) {
      const relative = targetFor(file, item, resolver);
      const prior = seenTargets.get(relative);
      invariant(!prior || prior === item.name, 'INSTALL_CONFLICT', `${item.name} and ${prior} both write ${relative}.`);
      seenTargets.set(relative, item.name);
      const bytes = Buffer.from(rewriteImports(file.content, resolver.aliases), 'utf8');
      const existing = await optionalRegular(target, relative, MAX_ITEM_BYTES).catch(error => {
        throw error.code === 'UNSAFE_PATH' ? error : new GenlibError('UNSAFE_PATH', `${relative} is not a regular file.`);
      });
      const owner = providers.files[relative]?.artifacts ?? moduleLock.files?.[relative]?.modules ?? null;
      const action = !existing ? 'create'
        : sha256(existing) === sha256(bytes) ? 'identical'
          : keepExisting ? 'keep-existing' : 'conflict';
      files.push({ path: relative, item: item.name, source: url, itemSha256: itemSha, action, sha256: sha256(bytes), bytes, ...(owner ? { owner } : {}) });
    }
  }
  const items = resolved.items.map(({ url, item, sha256: itemSha }) => ({ name: item.name, type: item.type, url, sha256: itemSha }));
  const dependencies = [...new Set(resolved.items.flatMap(({ item }) => item.dependencies ?? []))].sort();
  const devDependencies = [...new Set(resolved.items.flatMap(({ item }) => item.devDependencies ?? []))].sort();
  const bare = spec => spec.replace(/(.)@.*$/, '$1');
  // Registry metadata can omit packages its files import (button imports class-variance-authority but does not
  // declare it). Compare the bare imports in the written files with what the items and the app declare.
  const itemDeclared = new Set([...dependencies, ...devDependencies].map(bare));
  const imported = new Set();
  for (const { item } of resolved.items) for (const file of item.files) {
    for (const match of file.content.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)(['"])([^'"\n]{1,200})\1/gm)) {
      const specifier = match[2];
      if (/^(?:\.|\/|[@~#]\/|node:|bun:)/.test(specifier)) continue;
      imported.add(specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);
    }
  }
  const undeclared = [...imported].filter(name => !itemDeclared.has(name) && !declared[name]).sort();
  const missing = dependencies.filter(spec => !declared[bare(spec)]);
  const missingDev = devDependencies.filter(spec => !declared[bare(spec)]);
  const manager = await packageManager(target);
  const conflicts = files.filter(file => file.action === 'conflict').map(file => file.path);
  const css = resolved.items.filter(({ item }) => item.cssVars || item.css).map(({ item }) => item.name);
  const env = [...new Set(resolved.items.flatMap(({ item }) => Object.keys(item.envVars ?? {})))];
  const react = declared.react ? null : 'This app does not declare react; shadcn items are React components.';
  return {
    target, provider: 'shadcn', root: resolved.root, items,
    files: files.map(({ bytes, ...rest }) => rest), conflicts,
    install: [
      ...(missing.length || undeclared.length ? [`${manager} ${[...missing, ...undeclared].join(' ')}`] : []),
      ...(missingDev.length ? [`${manager} ${manager === 'npm install' ? '--save-dev' : '-D'} ${missingDev.join(' ')}`] : []),
    ],
    manual: [
      ...(css.length ? [`Merge the cssVars/css of ${css.join(', ')} into your global stylesheet (see the item JSON in ${ORIGINALS}/).`] : []),
      ...(env.length ? [`Add environment variables: ${env.join(', ')}.`] : []),
      ...(!resolver.hasComponentsJson ? ['No components.json: files use the default aliases (@/components/ui, @/lib, @/hooks). Check that tsconfig paths resolve them.'] : []),
    ],
    warnings: [
      ...(react ? [react] : []),
      ...(undeclared.length ? [`The items import ${undeclared.join(', ')} without declaring ${undeclared.length > 1 ? 'them' : 'it'}; added to the install command.`] : []),
    ],
    undeclaredImports: undeclared,
    status: conflicts.length ? 'conflict' : 'ready',
    // kept internally for add; stripped by the CLI
    _writes: files.filter(file => file.action === 'create'),
  };
}

async function writeAtomic(target, relative, bytes) {
  await ensureDirectory(target, path.posix.dirname(relative));
  const temporary = `${path.posix.dirname(relative)}/.genlib-tmp-${randomUUID()}`;
  const temporaryPath = await checkedPath(target, temporary, true);
  const handle = await fs.open(temporaryPath, 'wx', 0o644);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temporaryPath, await checkedPath(target, relative, true));
}

/** Writes a conflict-free plan: new files (never overwriting), the providers lock, originals and a receipt. */
export async function addRegistry(targetPath, resolved, options = {}) {
  const plan = await planRegistry(targetPath, resolved, options);
  invariant(!plan.conflicts.length, 'INSTALL_CONFLICT', `Existing files differ: ${plan.conflicts.join(', ')}. Review them, or pass --keep-existing to keep yours.`);
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
  try {
    for (const file of plan._writes) {
      await ensureDirectory(target, path.posix.dirname(file.path));
      const destination = await checkedPath(target, file.path, true);
      const out = await fs.open(destination, 'wx', 0o644); // refuses any file that appeared since planning
      try { await out.writeFile(file.bytes); await out.sync(); } finally { await out.close(); }
      created.push(file);
    }
    const lock = await readProvidersLock(target);
    const at = new Date().toISOString();
    for (const { url, item, bytes, sha256: itemSha } of resolved.items) {
      const id = artifactId(item);
      const owned = plan.files.filter(file => file.item === item.name && file.action !== 'keep-existing');
      lock.artifacts[id] = { provider: 'shadcn', name: item.name, type: item.type, source: url, itemSha256: itemSha, installedAt: lock.artifacts[id]?.installedAt ?? at,
        dependencies: item.dependencies ?? [], files: owned.map(file => file.path) };
      for (const file of owned) lock.files[file.path] = { sha256: file.sha256, artifacts: [...new Set([...(lock.files[file.path]?.artifacts ?? []), id])].sort() };
      await writeAtomic(target, `${ORIGINALS}/${id}.json`, bytes);
      const previous = await optionalRegular(target, `${RECEIPTS}/${id}.json`, 512 * 1024).then(found => found && JSON.parse(found.toString('utf8')), () => null);
      if (previous?.manifestSha256 === itemSha) continue; // same item bytes: keep its adoption history
      const receipt = {
        schemaVersion: 1, module: id, version: itemSha.slice(0, 12), manifestSha256: itemSha, provider: 'shadcn',
        source: { url }, out: path.posix.dirname(owned[0]?.path ?? '.'), installedAt: at,
        files: owned.map(file => ({ path: file.path, sha256: file.sha256 })),
        outcomes: { found: true, copied: true, used: null, verified: null }, checks: [],
      };
      await writeAtomic(target, `${RECEIPTS}/${id}.json`, jsonBytes(receipt));
    }
    await writeAtomic(target, PROVIDERS_LOCK, jsonBytes(lock));
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
  return { ...visible, writes: true, created: created.length, provenance: PROVIDERS_LOCK,
    next: [...plan.install, `node "$GENLIB_ROOT"/bin/genlib.mjs adopted ${artifactId({ name: plan.root })} --target "$APP_ROOT" --test "<your test command>"`] };
}

/** Offline drift check of provider-installed files against their recorded hashes. */
export async function verifyRegistry(targetPath) {
  const target = await rootDirectory(targetPath);
  const lock = await readProvidersLock(target);
  const files = [];
  for (const [relative, record] of Object.entries(lock.files)) {
    const bytes = await optionalRegular(target, relative, MAX_ITEM_BYTES).catch(() => null);
    files.push({ path: relative, artifacts: record.artifacts, status: !bytes ? 'missing' : sha256(bytes) === record.sha256 ? 'unchanged' : 'modified' });
  }
  const drift = files.filter(file => file.status !== 'unchanged');
  return { status: drift.length ? 'drift' : 'ok', artifacts: Object.keys(lock.artifacts).length, files, drift: drift.map(file => file.path) };
}

/** Removes an artifact's unedited files; keeps edited ones; refuses while another artifact depends on it. */
export async function removeRegistry(targetPath, id, { dryRun = false } = {}) {
  const target = await rootDirectory(targetPath);
  const lock = await readProvidersLock(target);
  const entry = lock.artifacts[id];
  invariant(entry, 'NOT_INSTALLED', `${id} is not recorded in ${PROVIDERS_LOCK}.`);
  const dependents = [];
  for (const [other] of Object.entries(lock.artifacts)) {
    if (other === id) continue;
    const original = await optionalRegular(target, `${ORIGINALS}/${other}.json`, MAX_ITEM_BYTES).catch(() => null);
    const item = original ? JSON.parse(original.toString('utf8')) : null;
    if ((item?.registryDependencies ?? []).some(dependency => dependency === entry.name || dependency.endsWith(`/${entry.name}.json`))) dependents.push(other);
  }
  invariant(!dependents.length, 'IN_USE', `${id} is required by ${dependents.join(', ')}; remove those first.`);
  const actions = [];
  for (const relative of entry.files) {
    const record = lock.files[relative];
    const others = (record?.artifacts ?? []).filter(other => other !== id);
    if (others.length) { actions.push({ path: relative, action: 'keep-shared', artifacts: others }); continue; }
    const bytes = await optionalRegular(target, relative, MAX_ITEM_BYTES).catch(() => null);
    actions.push({ path: relative, action: !bytes ? 'already-missing' : sha256(bytes) === record.sha256 ? 'delete' : 'keep-modified' });
  }
  if (!dryRun) {
    for (const item of actions) {
      if (item.action === 'delete') await fs.unlink(await checkedPath(target, item.path));
      if (item.action === 'keep-shared') lock.files[item.path].artifacts = item.artifacts;
      else delete lock.files[item.path];
    }
    delete lock.artifacts[id];
    await writeAtomic(target, PROVIDERS_LOCK, jsonBytes(lock));
    await fs.unlink(path.join(target, ORIGINALS, `${id}.json`)).catch(() => {});
  }
  return { artifact: id, dryRun, files: actions, kept: actions.filter(item => item.action === 'keep-modified').map(item => item.path),
    note: 'Edited files are kept. Package dependencies are not uninstalled.' };
}
