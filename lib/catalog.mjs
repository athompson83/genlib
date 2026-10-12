import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkedPath, invariant, jsonBytes, object, outputPath, parseJson, readRegular, relativePath, rootDirectory, sha256 } from './safety.mjs';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const VERSION = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/;
export const PROFILE = /^[a-z][a-z0-9-]*$/;
export const MAX_PROFILES = 8;
const arrayOfStrings = (value, max = 40) => Array.isArray(value) && value.length <= max &&
  value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 3000);

export function validateModule(module, expectedId) {
  invariant(object(module) && module.schemaVersion === 1 && ID.test(module.id) &&
    module.id === expectedId && VERSION.test(module.version), 'INVALID_MANIFEST', 'Invalid module identity: ' + expectedId);
  invariant(typeof module.title === 'string' && module.title.length > 0 && module.title.length <= 120 &&
    typeof module.description === 'string' && module.description.length > 0 && module.description.length <= 500,
  'INVALID_MANIFEST', 'Module title or description is invalid: ' + expectedId);
  invariant(['style', 'theme', 'component', 'feature', 'utility'].includes(module.kind) &&
    arrayOfStrings(module.tags, 20), 'INVALID_MANIFEST', 'Module kind or tags are invalid: ' + expectedId);
  invariant(module.license === 'Apache-2.0' && object(module.source) && module.source.type === 'original' &&
    module.source.repository === 'https://github.com/athompson83/genlib' &&
    module.source.path === 'modules/' + module.id,
  'INVALID_MANIFEST', 'Version 1 accepts original Apache-2.0 modules with accurate Genlib provenance only.');
  invariant(object(module.compatibility) && arrayOfStrings(module.compatibility.frameworks, 8) &&
    module.compatibility.frameworks.length > 0 && arrayOfStrings(module.compatibility.languages, 8) &&
    typeof module.compatibility.platform === 'string' && arrayOfStrings(module.compatibility.notes),
  'INVALID_MANIFEST', 'Invalid compatibility contract: ' + expectedId);
  if (module.compatibility.frameworks.includes('react')) {
    invariant(Array.isArray(module.compatibility.reactMajors) && module.compatibility.reactMajors.length > 0 &&
      module.compatibility.reactMajors.every(major => Number.isSafeInteger(major) && major >= 18 && major <= 19),
    'INVALID_MANIFEST', 'React compatibility must explicitly list supported majors 18 and/or 19.');
  }
  invariant(Array.isArray(module.dependencies) && module.dependencies.length <= 20 &&
    module.dependencies.every(item => object(item) && ID.test(item.id) && VERSION.test(item.version)),
  'INVALID_MANIFEST', 'Invalid local dependencies: ' + expectedId);
  invariant(Array.isArray(module.files) && module.files.length > 0 && module.files.length <= 100,
    'INVALID_MANIFEST', 'Module needs between 1 and 100 files: ' + expectedId);
  const targets = new Set();
  for (const file of module.files) {
    invariant(object(file), 'INVALID_MANIFEST', 'Invalid file entry.');
    relativePath(file.source, 'Module source');
    outputPath(file.target);
    invariant(file.source.startsWith('files/') && !file.target.split('/').some(segment => segment.startsWith('.')),
      'INVALID_MANIFEST', 'Source files must be in files/ and targets must be ordinary source files.');
    invariant(!targets.has(file.target.toLowerCase()), 'INVALID_MANIFEST', 'Duplicate target: ' + file.target);
    targets.add(file.target.toLowerCase());
  }
  // Optional install profiles: named groups of the module's own sources (`genlib add <id> --profile core,http`).
  // Together they must cover every file, so each file is reachable through some profile.
  if (module.profiles !== undefined) {
    const sources = new Set(module.files.map(file => file.source));
    const names = object(module.profiles) ? Object.keys(module.profiles) : [];
    invariant(object(module.profiles) && names.length > 0 && names.length <= MAX_PROFILES &&
      names.every(name => PROFILE.test(name) && Array.isArray(module.profiles[name]) && module.profiles[name].length > 0 &&
        module.profiles[name].every(source => typeof source === 'string' && sources.has(source))),
    'INVALID_MANIFEST', `profiles must map 1 to ${MAX_PROFILES} names ([a-z][a-z0-9-]*) to lists of this module's files sources: ${expectedId}`);
    const covered = new Set(Object.values(module.profiles).flat());
    const missing = [...sources].filter(source => !covered.has(source));
    invariant(missing.length === 0, 'INVALID_MANIFEST', `profiles must cover every file (${missing.join(', ')} is in none): ${expectedId}`);
  }
  invariant(Array.isArray(module.exports) && module.exports.every(item => object(item) &&
    typeof item.name === 'string' && typeof item.from === 'string' && targets.has(item.from.toLowerCase())),
  'INVALID_MANIFEST', 'Export paths must refer to an included target file.');
  invariant(arrayOfStrings(module.configuration) && arrayOfStrings(module.capabilities) &&
    arrayOfStrings(module.limitations), 'INVALID_MANIFEST', 'Missing integration metadata: ' + expectedId);
  invariant(object(module.verification) && ['experimental', 'tested'].includes(module.verification.level) &&
    arrayOfStrings(module.verification.testFiles, 20) && module.verification.testFiles.length > 0,
  'INVALID_MANIFEST', 'Module verification must refer to meaningful repository tests.');
  // Optional: the behavior the module fixes that a task spec may contradict (routes, status codes, storage,
  // email handling). `quick` prints these so an agent can decide use, adapt or write in one call.
  invariant(module.decisions === undefined || (arrayOfStrings(module.decisions, 4) && module.decisions.length > 0 && module.decisions.every(item => item.length <= 120)),
    'INVALID_MANIFEST', 'decisions must list 1 to 4 short strings (at most 120 characters each): ' + expectedId);
  invariant(module.options === undefined || (arrayOfStrings(module.options, 4) && module.options.length > 0 && module.options.every(item => item.length <= 120)),
    'INVALID_MANIFEST', 'options must list 1 to 4 short strings (at most 120 characters each): ' + expectedId);
  // Standalone parts: an install profile usable without the rest of the module, with what it is for and its key
  // signatures, so `quick` can offer it without the agent reading the module's source.
  invariant(module.parts === undefined || (Array.isArray(module.parts) && module.parts.length > 0 && module.parts.length <= 3 &&
    module.parts.every(part => object(part) && typeof part.profile === 'string' && Object.hasOwn(module.profiles ?? {}, part.profile) &&
      typeof part.use === 'string' && part.use.length > 0 && part.use.length <= 120 &&
      arrayOfStrings(part.api, 4) && part.api.length > 0 && part.api.every(item => item.length <= 80))),
  'INVALID_MANIFEST', 'parts must list 1 to 3 {profile (an existing profile), use (at most 120 characters), api (1 to 4 signatures of at most 80)}: ' + expectedId);
  // Optional maintenance evidence: what was verified, how, where, what changed and whether it is retired.
  const evidence = module.verification;
  invariant(evidence.behaviors === undefined || (arrayOfStrings(evidence.behaviors, 40) && evidence.behaviors.length > 0),
    'INVALID_MANIFEST', 'verification.behaviors must list verified behaviors: ' + expectedId);
  invariant(evidence.command === undefined || (typeof evidence.command === 'string' && evidence.command.length <= 300),
    'INVALID_MANIFEST', 'verification.command must be one command: ' + expectedId);
  invariant(evidence.environment === undefined || (object(evidence.environment) &&
    Object.values(evidence.environment).every(value => typeof value === 'string' && value.length <= 80)),
  'INVALID_MANIFEST', 'verification.environment maps tool names to versions: ' + expectedId);
  invariant(module.changelog === undefined || (Array.isArray(module.changelog) && module.changelog.length <= 50 &&
    module.changelog.every(entry => object(entry) && VERSION.test(entry.version) && arrayOfStrings(entry.changes, 20) && entry.changes.length > 0)),
  'INVALID_MANIFEST', 'changelog entries need a version and changes: ' + expectedId);
  invariant(module.changelog === undefined || module.changelog[0]?.version === module.version,
    'INVALID_MANIFEST', 'The first changelog entry must describe the current version: ' + expectedId);
  invariant(module.deprecated === undefined || (object(module.deprecated) && typeof module.deprecated.reason === 'string' &&
    (module.deprecated.replacement === undefined || ID.test(module.deprecated.replacement))),
  'INVALID_MANIFEST', 'deprecated needs a reason and an optional replacement module id: ' + expectedId);
  invariant(module.contract === 'CONTRACT.md', 'INVALID_MANIFEST', 'Module contract must be CONTRACT.md.');
  return module;
}

export async function buildArtifacts(repositoryRoot = REPOSITORY_ROOT) {
  const root = await rootDirectory(repositoryRoot);
  await checkedPath(root, 'modules');
  const directories = (await fs.readdir(path.join(root, 'modules'), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  const artifacts = new Map();
  const items = [];
  const modules = new Map();
  for (const entry of directories) {
    invariant(entry.isDirectory() && !entry.isSymbolicLink() && ID.test(entry.name),
      'INVALID_MANIFEST', 'Only module directories belong in modules/: ' + entry.name);
    const prefix = 'modules/' + entry.name + '/';
    const authoredBytes = await readRegular(root, prefix + 'module.json', 128 * 1024);
    const module = validateModule(parseJson(authoredBytes, prefix + 'module.json'), entry.name);
    const files = [];
    for (const file of module.files) {
      const source = prefix + file.source;
      const bytes = await readRegular(root, source);
      invariant(bytes.length > 0, 'INVALID_FILE', 'Empty module source files are not supported: ' + source);
      files.push({ ...file, path: source, sha256: sha256(bytes), bytes: bytes.length });
    }
    for (const testFile of module.verification.testFiles) {
      relativePath(testFile, 'Test path');
      invariant(testFile.startsWith('tests/'), 'INVALID_MANIFEST', 'Test paths must belong to tests/.');
      await readRegular(root, testFile);
    }
    const contractBytes = await readRegular(root, prefix + module.contract, 64 * 1024);
    const manifest = {
      ...module,
      authoredManifest: { path: prefix + 'module.json', sha256: sha256(authoredBytes) },
      files,
      contractFile: { path: prefix + module.contract, sha256: sha256(contractBytes), bytes: contractBytes.length },
    };
    const manifestPath = 'registry/manifests/' + module.id + '@' + module.version + '.json';
    const bytes = jsonBytes(manifest);
    artifacts.set(manifestPath, bytes);
    modules.set(module.id, module);
    items.push({
      id: module.id, version: module.version, title: module.title, description: module.description,
      kind: module.kind, tags: module.tags, frameworks: module.compatibility.frameworks,
      languages: module.compatibility.languages, platform: module.compatibility.platform,
      verification: module.verification.level, manifest: manifestPath, sha256: sha256(bytes),
    });
  }
  for (const module of modules.values()) {
    for (const dependency of module.dependencies) {
      invariant(modules.get(dependency.id)?.version === dependency.version,
        'DEPENDENCY_MISMATCH', module.id + ' needs unavailable module ' + dependency.id + '@' + dependency.version);
    }
  }
  const active = new Set(), visited = new Set();
  const visit = id => {
    invariant(!active.has(id), 'DEPENDENCY_CYCLE', 'Cyclic module dependency: ' + id);
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of modules.get(id).dependencies) visit(dependency.id);
    active.delete(id); visited.add(id);
  };
  for (const id of modules.keys()) visit(id);
  const license = await readRegular(root, 'LICENSE');
  const notice = await readRegular(root, 'NOTICE');
  artifacts.set('registry/catalog.json', jsonBytes({
    schemaVersion: 1, name: 'genlib', version: '0.2.0',
    repository: 'https://github.com/athompson83/genlib',
    license: { id: 'Apache-2.0', path: 'LICENSE', sha256: sha256(license), bytes: license.length },
    notice: { path: 'NOTICE', sha256: sha256(notice), bytes: notice.length },
    items,
  }));
  return artifacts;
}

export async function loadCatalog(repositoryRoot = REPOSITORY_ROOT) {
  const root = await rootDirectory(repositoryRoot);
  const catalog = parseJson(await readRegular(root, 'registry/catalog.json', 2 * 1024 * 1024), 'catalog');
  invariant(object(catalog) && catalog.schemaVersion === 1 && catalog.name === 'genlib' &&
    Array.isArray(catalog.items) && catalog.items.length <= 1000, 'INVALID_CATALOG', 'Invalid catalog.');
  const ids = new Set();
  for (const item of catalog.items) {
    invariant(object(item) && ID.test(item.id) && VERSION.test(item.version) &&
      typeof item.title === 'string' && typeof item.description === 'string' &&
      arrayOfStrings(item.tags, 20) && arrayOfStrings(item.frameworks, 8) &&
      HASH.test(item.sha256) && item.manifest === 'registry/manifests/' + item.id + '@' + item.version + '.json' &&
      !ids.has(item.id), 'INVALID_CATALOG', 'Invalid or duplicate catalog item.');
    ids.add(item.id);
  }
  for (const [field, expectedPath] of [['license', 'LICENSE'], ['notice', 'NOTICE']]) {
    const record = catalog[field];
    invariant(object(record) && record.path === expectedPath && HASH.test(record.sha256),
      'INVALID_CATALOG', 'Invalid license/notice record.');
  }
  return { root, catalog };
}

export async function loadModule(context, id) {
  invariant(typeof id === 'string' && ID.test(id), 'INVALID_ID', 'Use a module ID such as data-table.');
  const item = context.catalog.items.find(entry => entry.id === id);
  invariant(item, 'NOT_FOUND', 'No module named ' + id + '. Search the catalog first.');
  const bytes = await readRegular(context.root, item.manifest, 512 * 1024);
  invariant(sha256(bytes) === item.sha256, 'INTEGRITY_MISMATCH', 'Manifest hash mismatch: ' + id);
  const module = validateModule(parseJson(bytes, item.manifest), id);
  invariant(module.version === item.version && object(module.authoredManifest) &&
    module.authoredManifest.path === 'modules/' + id + '/module.json' && HASH.test(module.authoredManifest.sha256),
  'INVALID_MANIFEST', 'Invalid authored manifest record.');
  const sourceManifest = await readRegular(context.root, module.authoredManifest.path, 128 * 1024);
  invariant(sha256(sourceManifest) === module.authoredManifest.sha256,
    'INTEGRITY_MISMATCH', 'Module metadata changed; rebuild and review the registry: ' + id);
  for (const file of module.files) {
    invariant(file.path === 'modules/' + id + '/' + file.source && HASH.test(file.sha256) &&
      Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= 1024 * 1024,
    'INVALID_MANIFEST', 'Invalid file integrity record: ' + id);
  }
  invariant(object(module.contractFile) && module.contractFile.path === 'modules/' + id + '/CONTRACT.md' &&
    HASH.test(module.contractFile.sha256), 'INVALID_MANIFEST', 'Invalid contract integrity record.');
  return { ...module, manifestSha256: item.sha256 };
}

export async function inspectModule(context, id) {
  const module = await loadModule(context, id);
  const contract = await readRegular(context.root, module.contractFile.path, 64 * 1024);
  invariant(sha256(contract) === module.contractFile.sha256, 'INTEGRITY_MISMATCH', 'Contract hash mismatch: ' + id);
  return {
    id: module.id, version: module.version, description: module.description,
    compatibility: module.compatibility, dependencies: module.dependencies,
    exports: module.exports, configuration: module.configuration, limitations: module.limitations,
    verification: module.verification, files: module.files.map(file => ({ target: file.target, bytes: file.bytes })),
    ...(module.profiles ? { profiles: module.profiles } : {}),
    ...(module.changelog ? { changelog: module.changelog } : {}), ...(module.deprecated ? { deprecated: module.deprecated } : {}),
    contract: contract.toString('utf8'),
  };
}

export function searchCatalog(catalog, query = '', { framework, limit = 5 } = {}) {
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= 20, 'INVALID_OPTION', 'Limit must be between 1 and 20.');
  invariant(typeof query === 'string' && query.length <= 500, 'INVALID_OPTION', 'Search query is too long.');
  const words = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return catalog.items.filter(item => !framework || item.frameworks.includes('any') || item.frameworks.includes(framework))
    .map(item => {
      const labels = (item.id + ' ' + item.title + ' ' + item.tags.join(' ')).toLowerCase();
      const description = item.description.toLowerCase();
      return { item, score: words.reduce((sum, word) => sum + (labels.includes(word) ? 3 : 0) + (description.includes(word) ? 1 : 0), 0) };
    }).filter(hit => words.length === 0 || hit.score > 0)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, limit)
    .map(({ item, score }) => ({
      id: item.id, version: item.version, description: item.description, kind: item.kind,
      frameworks: item.frameworks, verification: item.verification, score,
    }));
}

export async function resolveModules(context, id) {
  const modules = [], active = new Set(), visited = new Set();
  const visit = async (moduleId, requiredVersion) => {
    invariant(!active.has(moduleId), 'DEPENDENCY_CYCLE', 'Cyclic module dependency: ' + moduleId);
    const module = await loadModule(context, moduleId);
    invariant(!requiredVersion || module.version === requiredVersion, 'DEPENDENCY_MISMATCH', 'Dependency version mismatch: ' + moduleId);
    if (visited.has(moduleId)) return;
    active.add(moduleId);
    for (const dependency of module.dependencies) await visit(dependency.id, dependency.version);
    active.delete(moduleId); visited.add(moduleId); modules.push(module);
  };
  await visit(id);
  return modules;
}
