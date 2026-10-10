import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invariant, object, parseJson, readRegular, relativePath, rootDirectory } from './safety.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FILES = ['resources/attachments.json', 'resources/ui-foundations.json'];
// Domain catalogs live in resources/catalog/*.json and are loaded in name order.
const CATALOG_DIRECTORY = 'resources/catalog';
const ECOSYSTEMS = ['npm', 'pypi', 'crates', 'go', 'maven', 'nuget', 'gem', 'packagist', 'pub', 'swift', 'hex', 'github-action', 'docker'];
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESOURCE_MODES = ['reference', 'selective-copy', 'package', 'service', 'license-review'];
const KINDS = ['reference', 'source-library', 'package', 'service', 'application', 'asset-library'];
const LEVELS = ['verified', 'partial', 'unresolved'];
const text = (value, limit = 3000) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const texts = (values, limit = 60) => Array.isArray(values) && values.length <= limit && values.every(value => text(value));

function url(value, nullable = false) {
  if (nullable && value === null) return true;
  if (!text(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch { return false; }
}

export function validateResource(resource) {
  invariant(object(resource) && text(resource.id, 100) && ID.test(resource.id), 'INVALID_RESOURCE', 'Invalid resource ID.');
  const fail = 'Invalid metadata for resource ' + resource.id;
  invariant(text(resource.name, 160) && text(resource.category, 80) && text(resource.summary) && text(resource.useWhen), 'INVALID_RESOURCE', fail);
  invariant(KINDS.includes(resource.kind) && RESOURCE_MODES.includes(resource.integrationMode) && LEVELS.includes(resource.verification), 'INVALID_RESOURCE', fail);
  invariant(texts(resource.platforms, 10) && resource.platforms.length > 0 && texts(resource.tags, 30) && texts(resource.cautions) && texts(resource.install), 'INVALID_RESOURCE', fail);
  invariant(texts(resource.attachments, 10) && resource.attachments.every(name => /^IMG_\d{4}\.jpeg$/.test(name)), 'INVALID_RESOURCE', fail);
  invariant(url(resource.homepage, true) && url(resource.repository, true) && url(resource.docs, true) &&
    [resource.homepage, resource.repository, resource.docs].some(Boolean), 'INVALID_RESOURCE', fail);
  invariant(object(resource.license) && (resource.license.id === null || text(resource.license.id, 200)) &&
    url(resource.license.url, true) && text(resource.license.scope), 'INVALID_RESOURCE', fail);
  invariant(Array.isArray(resource.sources) && resource.sources.length > 0 && resource.sources.length <= 20 &&
    resource.sources.every(source => object(source) && url(source.url) && text(source.title, 300)), 'INVALID_RESOURCE', fail);
  invariant(object(resource.genlib) && (resource.genlib.module === null ||
    (text(resource.genlib.module, 100) && ID.test(resource.genlib.module))) &&
    text(resource.genlib.guide, 300), 'INVALID_RESOURCE', fail);
  relativePath(resource.genlib.guide, 'Resource guide');
  invariant(resource.genlib.guide.startsWith('docs/') && resource.genlib.guide.endsWith('.md'), 'INVALID_RESOURCE', fail);
  invariant(resource.projectTypes === undefined || (texts(resource.projectTypes, 21) && resource.projectTypes.length > 0 &&
    resource.projectTypes.every(type => ID.test(type))), 'INVALID_RESOURCE', fail);
  invariant(resource.packages === undefined || (Array.isArray(resource.packages) && resource.packages.length <= 10 &&
    resource.packages.every(entry => object(entry) && ECOSYSTEMS.includes(entry.ecosystem) && text(entry.name, 214))), 'INVALID_RESOURCE', fail);
  // An unresolved source never becomes an automatically selected code dependency.
  invariant(resource.verification !== 'unresolved' || ['reference', 'license-review'].includes(resource.integrationMode),
    'INVALID_RESOURCE', 'Unresolved resources must remain references or require review.');
  return resource;
}

export async function loadProjectTypes(root) {
  const data = parseJson(await readRegular(root, 'resources/project-types.json', 256 * 1024), 'project-types');
  invariant(object(data) && data.schemaVersion === 1 && Array.isArray(data.types), 'INVALID_RESOURCE', 'Invalid project type list.');
  for (const type of data.types) invariant(object(type) && ID.test(type.id) && text(type.title, 120) && text(type.summary), 'INVALID_RESOURCE', 'Invalid project type.');
  return data.types;
}

async function catalogFiles(root) {
  const entries = await fs.readdir(path.join(root, CATALOG_DIRECTORY), { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of entries) invariant(entry.isFile() && /^[a-z0-9-]+\.json$/.test(entry.name), 'INVALID_RESOURCE', 'Unexpected catalog entry: ' + entry.name);
  return entries.map(entry => CATALOG_DIRECTORY + '/' + entry.name).sort();
}

export async function loadResources(repositoryRoot = ROOT) {
  const root = await rootDirectory(repositoryRoot);
  const items = [], catalogs = [], ids = new Set();
  const projectTypes = new Set((await loadProjectTypes(root)).map(type => type.id));
  for (const filename of [...FILES, ...await catalogFiles(root)]) {
    const catalog = parseJson(await readRegular(root, filename, 2 * 1024 * 1024), filename);
    invariant(object(catalog) && catalog.schemaVersion === 1 && /^\d{4}-\d{2}-\d{2}$/.test(catalog.reviewedAt) &&
      Array.isArray(catalog.items) && catalog.items.length <= 1000, 'INVALID_RESOURCE', 'Invalid resource catalog: ' + filename);
    for (const value of catalog.items) {
      const resource = validateResource(value);
      invariant((resource.projectTypes ?? []).every(type => projectTypes.has(type)), 'INVALID_RESOURCE', 'Unknown project type in ' + resource.id);
      invariant(!ids.has(resource.id), 'INVALID_RESOURCE', 'Duplicate resource: ' + resource.id);
      ids.add(resource.id);
      await readRegular(root, resource.genlib.guide, 256 * 1024);
      if (resource.genlib.module) await readRegular(root, 'modules/' + resource.genlib.module + '/module.json', 128 * 1024);
      items.push({ ...resource, reviewedAt: catalog.reviewedAt });
    }
    catalogs.push({ path: filename, reviewedAt: catalog.reviewedAt, count: catalog.items.length });
  }
  return { schemaVersion: 1, catalogs, items };
}

export function searchResources(items, query = '', { platform, category, mode, license, project, limit = 5 } = {}) {
  invariant(typeof query === 'string' && query.length <= 500, 'INVALID_OPTION', 'Query must contain at most 500 characters.');
  invariant(Number.isInteger(limit) && limit >= 1 && limit <= 50, 'INVALID_OPTION', 'Limit must be 1–50.');
  invariant(!mode || RESOURCE_MODES.includes(mode), 'INVALID_OPTION', 'Unknown resource mode.');
  const words = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const chosenPlatform = platform === 'pc' ? 'desktop' : platform;
  return items.filter(item => (!chosenPlatform || item.platforms.includes(chosenPlatform)) &&
      (!category || item.category === category) && (!mode || item.integrationMode === mode) &&
      (!license || item.license.id?.toLowerCase() === license.toLowerCase()) &&
      (!project || (item.projectTypes ?? []).includes(project)))
    .map(item => {
      const labels = [item.id, item.name, item.category, ...item.tags].join(' ').toLowerCase();
      const body = [item.summary, item.useWhen].join(' ').toLowerCase();
      return { item, score: words.reduce((sum, word) => sum + (labels.includes(word) ? 3 : 0) + (body.includes(word) ? 1 : 0), 0) };
    })
    .filter(hit => words.length === 0 || hit.score > 0)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, limit)
    .map(({ item, score }) => ({
      id: item.id, name: item.name, summary: item.summary, category: item.category,
      platforms: item.platforms, integrationMode: item.integrationMode, verification: item.verification,
      license: item.license, genlib: item.genlib, reviewedAt: item.reviewedAt,
      ...(item.projectTypes ? { projectTypes: item.projectTypes } : {}), score,
    }));
}
