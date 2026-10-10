import * as fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './catalog.mjs';
import { loadResources, searchResources } from './resources.mjs';
import { invariant, object, parseJson, readRegular, rootDirectory } from './safety.mjs';

// One read-only entry point over every Genlib source: versioned modules, task recipes,
// cross-language examples, project templates and reviewed external resources.
export const SOURCE_TYPES = ['module', 'recipe', 'language-example', 'template', 'resource'];

// Small, reviewed synonym table. It widens recall for common task wording without
// pretending to be semantic search; results still require contract inspection.
const SYNONYMS = {
  env: ['config', 'configuration', 'environment'], environment: ['config', 'env'], config: ['env', 'configuration'],
  settings: ['config'], log: ['logger', 'logging'], logs: ['logger', 'logging'], logging: ['logger'],
  retry: ['resilience', 'backoff'], backoff: ['retry'], timeout: ['resilience'], circuit: ['breaker', 'resilience'],
  throttle: ['rate', 'limit'], throttling: ['rate', 'limit'], ratelimit: ['rate', 'limit'],
  webhook: ['signature', 'hmac'], webhooks: ['webhook', 'signature'], signature: ['hmac', 'webhook'],
  health: ['healthz', 'readiness', 'liveness'], healthcheck: ['health'], readiness: ['health'], liveness: ['health'],
  csp: ['security', 'headers'], hsts: ['security', 'headers'], headers: ['security'],
  grid: ['table'], datagrid: ['table'], spreadsheet: ['csv', 'export'], modal: ['dialog', 'popup'],
  dialog: ['modal'], navbar: ['navigation', 'shell', 'header'], nav: ['navigation', 'shell'], layout: ['shell'],
  form: ['validated', 'validation'], validation: ['validate', 'form'], theme: ['tokens', 'dark'],
  payment: ['stripe', 'checkout'], payments: ['stripe', 'checkout'], email: ['resend'], mail: ['resend', 'email'],
  ai: ['openai', 'anthropic', 'llm'], llm: ['openai', 'anthropic', 'ai'], shop: ['storefront', 'cart', 'catalog'],
  ecommerce: ['storefront', 'cart', 'catalog'], deploy: ['ship', 'release', 'docker'], docker: ['container', 'ship'],
  ship: ['release', 'deploy'], publish: ['release'], ci: ['github', 'workflow'], scaffold: ['project', 'starter'],
  readme: ['docs'], page: ['pagination'], paging: ['pagination'], upload: ['file'],
};
const stem = word => word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;

export function queryTerms(query) {
  invariant(typeof query === 'string' && query.length <= 500, 'INVALID_OPTION', 'Search query must have at most 500 characters.');
  const words = [...new Set((query.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(stem))];
  const expanded = new Set();
  for (const word of words) for (const extra of SYNONYMS[word] ?? []) if (!words.includes(extra)) expanded.add(extra);
  return { words, expanded: [...expanded] };
}

function score(terms, id, labels, body) {
  // Labels match whole (stemmed) tokens so "table" does not match "tabler"; body text matches substrings.
  const tokens = new Set(labels.join(' ').toLowerCase().match(/[a-z0-9]+/g)?.map(stem) ?? []);
  const text = body.join(' ').toLowerCase();
  const direct = terms.words.reduce((sum, word) =>
    sum + (id === word ? 6 : 0) + (tokens.has(word) ? 3 : 0) + (text.includes(word) ? 1 : 0), 0);
  const related = terms.expanded.reduce((sum, word) => sum + (tokens.has(stem(word)) ? 1 : 0), 0);
  return direct + related;
}

async function readJson(root, file, limit = 2 * 1024 * 1024) {
  return parseJson(await readRegular(root, file, limit), file);
}

const quote = value => /^[\w@%+=:,./$-]+$/.test(value) ? value : "'" + value.replaceAll("'", "'\\''") + "'";

export async function loadSources(repositoryRoot) {
  const context = await loadCatalog(repositoryRoot);
  const root = context.root;
  const recipes = await readJson(root, 'resources/agent-recipes.json');
  const languages = await readJson(root, 'examples/languages/modules.json');
  const templates = await readJson(root, 'templates/index.json');
  const resources = await loadResources(root);
  invariant(object(recipes) && Array.isArray(recipes.entries), 'INVALID_CATALOG', 'Invalid recipe catalog.');
  invariant(object(languages) && Array.isArray(languages.modules), 'INVALID_CATALOG', 'Invalid language example catalog.');
  invariant(object(templates) && templates.schemaVersion === 1 && Array.isArray(templates.templates), 'INVALID_CATALOG', 'Invalid template index.');
  for (const template of templates.templates) {
    invariant(object(template) && typeof template.id === 'string' && typeof template.path === 'string' &&
      template.path.startsWith('templates/') && Array.isArray(template.terms), 'INVALID_CATALOG', 'Invalid template entry.');
  }
  return { root, context, recipes: recipes.entries, languages: languages.modules, templates: templates.templates, resources: resources.items };
}

export function sourceCounts(sources) {
  return {
    module: sources.context.catalog.items.length, recipe: sources.recipes.length,
    'language-example': sources.languages.length, template: sources.templates.length, resource: sources.resources.length,
  };
}

// Compatibility is advisory here; plan/add remain the enforcing checks for modules.
function fit(entry, profile) {
  if (!profile) return undefined;
  const has = (list, value) => list.includes(value);
  const web = has(profile.languages, 'typescript') || has(profile.languages, 'javascript');
  if (entry.type === 'module' || entry.type === 'recipe') {
    if (entry.frameworks.includes('react')) {
      if (has(profile.frameworks, 'react-native')) return 'incompatible';
      if (has(profile.frameworks, 'react')) return profile.reactMajor && ![18, 19].includes(profile.reactMajor) ? 'incompatible' : 'compatible';
      return profile.frameworks.some(name => ['vue', 'svelte', 'angular', 'solid'].includes(name)) ? 'incompatible' : 'review';
    }
    if (entry.languages.every(language => language === 'css')) return web || profile.languages.length === 0 ? 'compatible' : 'review';
    return web ? (has(profile.languages, 'typescript') ? 'compatible' : 'review') : 'incompatible';
  }
  if (entry.type === 'language-example') return has(profile.languages, entry.languages[0]) ? 'compatible' : 'incompatible';
  return 'review';
}

function entries(sources, target) {
  const app = target ? quote(target) : '"$APP_ROOT"';
  const cli = '"$GENLIB_ROOT"/';
  const out = [];
  // Recipes that point at a versioned module enrich that module instead of duplicating it.
  const moduleTerms = new Map();
  for (const recipe of sources.recipes) {
    if (recipe.kind === 'versioned-module') moduleTerms.set(recipe.path.replace(/^modules\//, ''), [...recipe.taskTerms, ...(recipe.variants ?? [])]);
  }
  for (const item of sources.context.catalog.items) {
    out.push({
      type: 'module', id: item.id, title: item.title, summary: item.description, kind: item.kind,
      frameworks: item.frameworks, languages: item.languages ?? ['typescript'], verification: item.verification,
      labels: [item.id, item.title, item.kind, ...item.tags, ...(moduleTerms.get(item.id) ?? [])], body: [item.description],
      next: [
        `node ${cli}bin/genlib.mjs inspect ${item.id} --json`,
        `node ${cli}bin/genlib.mjs plan ${item.id} --target ${app} --json`,
        `node ${cli}bin/genlib.mjs add ${item.id} --target ${app} --json`,
      ],
    });
  }
  for (const recipe of sources.recipes) {
    if (recipe.kind === 'versioned-module' && sources.context.catalog.items.some(item => 'modules/' + item.id === recipe.path)) continue;
    const frameworks = recipe.platform === 'react' ? ['react'] : ['any'];
    const languages = recipe.platform === 'css' ? ['css'] : ['typescript'];
    const copy = recipe.kind === 'source-example'
      ? [`node ${cli}tools/recipe-install.mjs plan ${recipe.id} --target ${app}`, `node ${cli}tools/recipe-install.mjs add ${recipe.id} --target ${app}`]
      : [`Read ${recipe.path} and implement the production version; structural examples are not copied.`];
    out.push({
      type: 'recipe', id: recipe.id, title: recipe.id, summary: `${recipe.kind} at ${recipe.path}; variants: ${(recipe.variants ?? []).join(', ')}`,
      kind: recipe.kind, frameworks, languages, verification: recipe.kind,
      labels: [recipe.id, ...recipe.taskTerms, ...(recipe.variants ?? [])], body: [recipe.path, ...recipe.checks],
      requiredChecks: recipe.checks,
      next: [`node ${cli}tools/agent-recipes.mjs inspect ${recipe.id}`, ...copy],
    });
  }
  for (const example of sources.languages) {
    out.push({
      type: 'language-example', id: example.id, title: example.id, summary: `${example.language} example (${example.runtime}); ${example.verification}`,
      kind: 'example', frameworks: ['any'], languages: [example.language], verification: example.status,
      labels: [example.id, example.language, ...example.id.split('-')], body: [example.runtime, ...example.files],
      next: [
        `node ${cli}tools/language-modules.mjs inspect ${example.id}`,
        `node ${cli}tools/language-modules.mjs plan ${example.id} --target ${app} --with-tests`,
      ],
    });
  }
  for (const template of sources.templates) {
    out.push({
      type: 'template', id: template.id, title: template.title, summary: template.summary, kind: template.phase,
      frameworks: ['any'], languages: [], verification: 'template',
      labels: [template.id, template.title, template.phase, ...template.terms], body: [template.summary],
      next: [`Read ${template.guide}, then merge only the selected files from ${template.path} into the target.`],
    });
  }
  for (const resource of sources.resources) {
    out.push({
      type: 'resource', id: resource.id, title: resource.name, summary: resource.summary, kind: resource.integrationMode,
      frameworks: ['any'], languages: [], verification: resource.verification, platforms: resource.platforms,
      license: resource.license.id,
      labels: [resource.id, resource.name, resource.category, ...resource.tags], body: [resource.summary, resource.useWhen],
      next: [`node ${cli}tools/resources.mjs inspect ${resource.id} --json`],
    });
  }
  return out;
}

export function findInSources(sources, query, { type, limit = 8, target, profile } = {}) {
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= 25, 'INVALID_OPTION', 'Limit must be between 1 and 25.');
  invariant(!type || SOURCE_TYPES.includes(type), 'INVALID_OPTION', 'Type must be one of: ' + SOURCE_TYPES.join(', '));
  const terms = queryTerms(query);
  invariant(terms.words.length > 0, 'INVALID_OPTION', 'Provide task words to search, for example: find webhook signature.');
  const rank = { compatible: 2, review: 1, incompatible: 0 };
  const matches = entries(sources, target)
    .filter(entry => !type || entry.type === type)
    .map(entry => ({ entry, score: score(terms, entry.id, entry.labels, entry.body), fit: fit(entry, profile) }))
    .filter(hit => hit.score > 0);
  // Drop weak incidental substring hits once a strong match exists.
  const floor = Math.max(1, Math.ceil(Math.max(0, ...matches.map(hit => hit.score)) / 4));
  matches.splice(0, matches.length, ...matches.filter(hit => hit.score >= floor));
  // With a detected project, known mismatches are counted rather than shown unless asked for by type.
  const hidden = profile && !type ? matches.filter(hit => hit.fit === 'incompatible').length : 0;
  const results = matches.filter(hit => !hidden || hit.fit !== 'incompatible')
    .sort((a, b) => b.score - a.score || (rank[b.fit] ?? 0) - (rank[a.fit] ?? 0) ||
      SOURCE_TYPES.indexOf(a.entry.type) - SOURCE_TYPES.indexOf(b.entry.type) || a.entry.id.localeCompare(b.entry.id))
    .slice(0, limit)
    .map(({ entry, score: value, fit: suitability }) => {
      const { labels, body, ...visible } = entry;
      return { ...visible, score: value, ...(suitability ? { fit: suitability } : {}) };
    });
  return {
    query, terms: terms.words, relatedTerms: terms.expanded, results,
    ...(hidden ? { hiddenIncompatible: hidden } : {}),
    guidance: 'Lexical ranking over local metadata. Inspect the selected contract or record, then plan before copying. "fit" is advisory; plan enforces module compatibility.',
  };
}

const MANIFESTS = {
  'go.mod': 'go', 'Cargo.toml': 'rust', 'pyproject.toml': 'python', 'requirements.txt': 'python', 'setup.py': 'python',
  'pom.xml': 'java', 'build.gradle': 'java', 'build.gradle.kts': 'kotlin', 'pubspec.yaml': 'dart', 'Package.swift': 'swift',
  'Gemfile': 'ruby', 'composer.json': 'php', 'mix.exs': 'elixir', 'deno.json': 'typescript', 'deno.jsonc': 'typescript',
};
const FRAMEWORKS = [
  ['next', 'next.js'], ['react-native', 'react-native'], ['expo', 'react-native'], ['react', 'react'], ['vue', 'vue'],
  ['nuxt', 'vue'], ['svelte', 'svelte'], ['@sveltejs/kit', 'svelte'], ['@angular/core', 'angular'], ['solid-js', 'solid'],
  ['preact', 'preact'], ['astro', 'astro'], ['@remix-run/react', 'remix'], ['@react-router/dev', 'react-router'],
  ['express', 'express'], ['fastify', 'fastify'], ['hono', 'hono'], ['@nestjs/core', 'nestjs'], ['koa', 'koa'],
  ['electron', 'electron'], ['@tauri-apps/api', 'tauri'], ['vite', 'vite'],
];
const LOCKFILES = [['package-lock.json', 'npm'], ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lock', 'bun'], ['bun.lockb', 'bun']];

async function regularFile(directory, name) {
  try { return (await fs.lstat(path.join(directory, name))).isFile(); } catch { return false; }
}

// Reads only top-level manifest names and package.json; never executes project code.
export async function detectProject(target) {
  invariant(typeof target === 'string' && target.length > 0, 'INVALID_OPTION', 'detect requires --target <existing-project>.');
  const directory = await rootDirectory(path.resolve(target));
  const languages = new Set(), frameworks = new Set(), evidence = [];
  let packageManager = null, reactMajor = null, nodeEngine = null;
  for (const [file, language] of Object.entries(MANIFESTS)) {
    if (await regularFile(directory, file)) { languages.add(language); evidence.push(file); }
  }
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && /\.(csproj|sln|fsproj)$/.test(entry.name)) { languages.add('csharp'); evidence.push(entry.name); }
  }
  if (await regularFile(directory, 'package.json')) {
    evidence.push('package.json');
    const pkg = parseJson(await readRegular(directory, 'package.json', 1024 * 1024), 'package.json');
    invariant(object(pkg), 'INVALID_TARGET', 'package.json must contain an object.');
    const deps = { ...pkg.peerDependencies, ...pkg.devDependencies, ...pkg.dependencies };
    languages.add(Object.hasOwn(deps, 'typescript') || await regularFile(directory, 'tsconfig.json') ? 'typescript' : 'javascript');
    for (const [name, framework] of FRAMEWORKS) if (Object.hasOwn(deps, name)) frameworks.add(framework);
    if (frameworks.has('next.js') || frameworks.has('remix') || frameworks.has('react-router')) frameworks.add('react');
    const range = typeof deps.react === 'string' ? deps.react.match(/(\d+)/) : null;
    if (range) reactMajor = Number(range[1]);
    if (typeof pkg.engines?.node === 'string') nodeEngine = pkg.engines.node;
    if (typeof pkg.packageManager === 'string') packageManager = pkg.packageManager.split('@')[0];
  }
  if (await regularFile(directory, 'tsconfig.json')) { languages.add('typescript'); languages.delete('javascript'); }
  for (const [file, manager] of LOCKFILES) {
    if (await regularFile(directory, file)) { packageManager ??= manager; evidence.push(file); }
  }
  const runtimes = [];
  if (evidence.includes('package.json')) runtimes.push(packageManager === 'bun' ? 'bun' : 'node');
  if (evidence.includes('deno.json') || evidence.includes('deno.jsonc')) runtimes.push('deno');
  return {
    target: directory, languages: [...languages].sort(), frameworks: [...frameworks].sort(), runtimes,
    packageManager, reactMajor, nodeEngine, evidence: [...new Set(evidence)].sort(),
    limits: 'Top-level manifest detection only. Workspaces/monorepos need the specific package directory.',
  };
}
