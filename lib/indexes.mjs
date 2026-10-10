import { fileURLToPath } from 'node:url';
import { invariant, object, parseJson, readRegular, rootDirectory } from './safety.mjs';

// Ranked install indexes for MCP servers, CLIs and APIs. Each record carries the exact
// commands that install or wire it up in one step; Genlib never runs them itself.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = (value, limit) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const steps = value => Array.isArray(value) && value.length > 0 && value.length <= 8 && value.every(step => text(step, 600));

export const INDEXES = {
  mcp: { file: 'resources/mcp-servers.json', key: 'servers', label: 'MCP server' },
  cli: { file: 'resources/clis.json', key: 'clis', label: 'CLI' },
  api: { file: 'resources/apis.json', key: 'apis', label: 'API' },
  starter: { file: 'resources/starters.json', key: 'starters', label: 'project starter' },
  task: { file: 'resources/task-recipes.json', key: 'tasks', label: 'task recipe' },
};
export const MCP_CLIENTS = ['claude', 'codex', 'both'];

export function validateEntry(kind, entry) {
  invariant(object(entry) && text(entry.id, 120) && ID.test(entry.id) && text(entry.name, 200), 'INVALID_INDEX', `Invalid ${kind} identity.`);
  const fail = `Invalid ${kind} record: ${entry.id}`;
  invariant(typeof entry.description === 'string' && entry.description.length <= 1000, 'INVALID_INDEX', fail);
  invariant(entry.rank === null || (Number.isSafeInteger(entry.rank) && entry.rank > 0), 'INVALID_INDEX', fail);
  if (kind === 'mcp') invariant(object(entry.install) && steps(entry.install.claude) && steps(entry.install.codex), 'INVALID_INDEX', fail);
  else invariant(steps(entry.install), 'INVALID_INDEX', fail);
  invariant(entry.languages === undefined || (Array.isArray(entry.languages) && entry.languages.every(language => text(language, 40))), 'INVALID_INDEX', fail);
  if (kind === 'starter' && entry.commit !== undefined && entry.commit !== null) invariant(/^[0-9a-f]{40}$/.test(entry.commit), 'INVALID_INDEX', fail);
  for (const url of [entry.homepage, entry.repository, entry.docs, entry.spec].filter(Boolean)) {
    invariant(typeof url === 'string' && url.startsWith('https://'), 'INVALID_INDEX', fail);
  }
  return entry;
}

export async function loadIndex(kind, repositoryRoot = ROOT) {
  const config = INDEXES[kind];
  invariant(config, 'INVALID_OPTION', 'Index must be one of: ' + Object.keys(INDEXES).join(', '));
  const root = await rootDirectory(repositoryRoot);
  const data = parseJson(await readRegular(root, config.file, 8 * 1024 * 1024), config.file);
  invariant(object(data) && data.schemaVersion === 1 && Array.isArray(data[config.key]), 'INVALID_INDEX', 'Invalid index file: ' + config.file);
  const ids = new Set();
  for (const entry of data[config.key]) {
    validateEntry(kind, entry);
    invariant(!ids.has(entry.id), 'INVALID_INDEX', `Duplicate ${kind}: ${entry.id}`);
    ids.add(entry.id);
  }
  return { ...data, entries: data[config.key] };
}

// The commands an agent runs: MCP servers per client, CLIs and APIs as ordered steps.
export function installFor(kind, entry, client = 'both') {
  if (kind !== 'mcp') return entry.install;
  invariant(MCP_CLIENTS.includes(client), 'INVALID_OPTION', 'Client must be claude, codex or both.');
  return client === 'both' ? [...entry.install.claude, ...entry.install.codex] : entry.install[client];
}

export function summarize(kind, entry, client) {
  const { install, ...rest } = entry;
  const keep = ['id', 'name', 'title', 'description', 'rank', 'monthlyDownloads', 'installs365d', 'stars', 'popularity', 'provider', 'source', 'kind', 'languages', 'frameworks', 'recipe', 'license', 'license-review', 'homepage', 'docs', 'spec', 'repository', 'commit', 'env', 'transport'];
  return { ...Object.fromEntries(keep.filter(key => rest[key] !== undefined).map(key => [key, rest[key]])), install: installFor(kind, entry, client) };
}

export function searchIndex(kind, index, query, { limit = 8, client = 'both' } = {}) {
  invariant(typeof query === 'string' && query.length <= 500, 'INVALID_OPTION', 'Query must have at most 500 characters.');
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= 50, 'INVALID_OPTION', 'Limit must be 1–50.');
  const words = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return index.entries
    .map(entry => {
      // Whole-word label matches (so "json" does not prefer "jsonnet"), substring matches in descriptions.
      // MCP names are reverse-DNS ("io.github.owner/server"): the shared namespace would match every
      // query for "github", so only the server part, its title and its repository count as labels.
      const naming = kind === 'mcp'
        ? [entry.name.split('/').pop(), entry.title ?? '', (entry.repository ?? '').replace(/^https:\/\/[^/]+\//, '')]
        : [entry.id, entry.name, entry.title ?? '', entry.provider ?? ''];
      const label = new Set(naming.join(' ').toLowerCase().match(/[a-z0-9]+/g) ?? []);
      const body = entry.description.toLowerCase();
      // A query that spells the whole id, its last segment or the name ("s3", "stripe") outranks partial matches.
      const phrase = words.join('-');
      const slug = value => (String(value ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []).join('-');
      const exact = phrase && (entry.id === phrase || entry.id.endsWith('-' + phrase) || slug(entry.name) === phrase || slug(entry.title) === phrase) ? 4 : 0;
      // Prefer what the vendor publishes: the repository owner is the thing searched for (github/github-mcp-server).
      const vendor = phrase && entry.repository && slug(entry.repository.replace(/^https:\/\/[^/]+\//, '').split('/')[0]) === phrase ? 2 : 0;
      return { entry, score: exact + vendor + words.reduce((sum, word) => sum + (label.has(word) ? 3 : 0) + (body.includes(word) ? 1 : 0), 0) };
    })
    .filter(hit => words.length === 0 || hit.score > 0)
    .sort((a, b) => b.score - a.score || (a.entry.rank ?? 1e9) - (b.entry.rank ?? 1e9) || a.entry.id.localeCompare(b.entry.id))
    .slice(0, limit)
    .map(({ entry, score }) => ({ ...summarize(kind, entry, client), score }));
}
