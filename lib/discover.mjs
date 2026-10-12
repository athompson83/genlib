import * as fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { loadCatalog, loadModule } from './catalog.mjs';
import { loadResources, quickstartFor } from './resources.mjs';
import { installCommand, loadSkills } from './skills.mjs';
import { RETIRED_WEIGHT, installFor, loadIndex } from './indexes.mjs';
import { apiInstallFor } from './api-install.mjs';
const FIT_WEIGHT = 1.25, VENDOR_WEIGHT = 1.5;
// UI frameworks whose component libraries do not carry over to one another.
const UI_FRAMEWORKS = ['react', 'vue', 'svelte', 'angular', 'solid', 'preact', 'react-native'];
import { LANGUAGES, commandsFor, coverage, loadCapabilities } from './capabilities.mjs';
import { loadDocSections } from './docs-index.mjs';
import { integrationSummary, loadIntegrationCatalog } from './integrations.mjs';
import { loadProviders } from './providers.mjs';
import { eligibleResource, lifecycleOf, readinessOf, isPermissive, LICENSE_POLICIES } from './resource-policy.mjs';
import { invariant, object, parseJson, readRegular, rootDirectory } from './safety.mjs';

// One read-only entry point over every Genlib source: versioned modules, task recipes,
// cross-language examples, capabilities (one task, every language), project templates,
// code-navigation tools and reviewed external resources.
// Order breaks score ties: authored code first, external indexes after docs (they are large and match generic words).
export const SOURCE_TYPES = ['capability', 'module', 'integration', 'provider', 'recipe', 'language-example', 'template', 'tool', 'skill', 'mcp', 'cli', 'api', 'resource', 'doc', 'starter', 'task'];

// Genlib's own tested code saves the most tokens, and the large external indexes match generic words
// by sheer size, so a match needs a little more evidence to outrank authored code.
const PRIOR = process.env.GENLIB_PRIOR ? JSON.parse(process.env.GENLIB_PRIOR) : { capability: 1.3, module: 1.3, integration: 1.3, recipe: 1.2, task: 0.8 };

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
  readme: ['docs'], alternative: ['replaces'], replacement: ['replaces'], replace: ['replaces'], slide: ['presentation', 'deck'], deck: ['presentation', 'slide'], lms: ['learning', 'course'], course: ['lms', 'learning'],
  accounting: ['ledger', 'bookkeeping'], bookkeeping: ['accounting', 'ledger'], budget: ['budgeting', 'finance'], page: ['pagination'], paging: ['pagination'], upload: ['file'],
};
// Function words carry no task meaning and only add noise to lexical matches.
const STOPWORDS = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'with', 'how', 'do', 'does', 'i', 'we', 'my', 'our', 'is', 'are', 'be', 'can', 'it', 'this', 'that', 'what', 'which', 'need', 'want', 'use', 'using', 'from', 'into', 'add', 'make', 'get', 'me', 'please', 'sure', 'really', 'every', 'its', 'their', 'them', 'they', 'should', 'would']);
// A light suffix stemmer: "normalizing", "normalization" and "normalize" all become "normal", and
// "coordinates" matches "coordinate". At most two suffixes go, and at least four letters stay.
const SUFFIXES = [['izations', ''], ['ization', ''], ['ations', ''], ['ation', ''], ['ating', ''], ['ated', ''], ['ates', ''], ['ate', ''],
  ['izing', ''], ['ized', ''], ['izes', ''], ['ize', ''], ['iz', ''], ['ings', ''], ['ing', ''], ['ions', ''], ['ion', ''], ['ies', 'y'],
  ['ers', ''], ['er', ''], ['ed', ''], ['es', ''], ['ly', ''], ['s', ''], ['e', '']];
const stemCache = new Map();
function stem(word) {
  let out = stemCache.get(word);
  if (out !== undefined) return out;
  out = word;
  for (let pass = 0; pass < 2; pass++) {
    const rule = SUFFIXES.find(([suffix, add]) => out.endsWith(suffix) && out.length - suffix.length + add.length >= (suffix === 's' && pass === 0 ? 3 : 4) &&
      !(suffix === 's' && out.endsWith('ss')) && (suffix !== 'es' || /(?:ch|sh|x|z|ss)es$/.test(out)));
    if (!rule) break;
    out = out.slice(0, out.length - rule[0].length) + rule[1];
  }
  stemCache.set(word, out);
  return out;
}

export function queryTerms(query) {
  invariant(typeof query === 'string' && query.length <= 500, 'INVALID_OPTION', 'Search query must have at most 500 characters.');
  const raw = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  // Keep stopwords only when the query is made of nothing else (for example "make").
  const meaningful = raw.filter(word => !STOPWORDS.has(word));
  const kept = [...new Set(meaningful.length ? meaningful : raw)];
  const words = [...new Set(kept.map(stem))];
  const expanded = new Set();
  // Per query word, its reviewed synonyms (stemmed), so coverage can credit a word an entry matches through one.
  const synonyms = {};
  for (const word of kept) for (const extra of [...(SYNONYMS[word] ?? []), ...(SYNONYMS[stem(word)] ?? [])]) {
    if (!words.includes(stem(extra))) expanded.add(extra);
    (synonyms[stem(word)] ??= []).push(...(extra.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(stem));
  }
  // The unstemmed query as a slug, so "canvas lms" can match the entry named Canvas LMS exactly.
  const phrase = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).join('-');
  return { words, raw: kept, expanded: [...expanded], synonyms, phrase };
}

const labelTokens = labels => new Set(labels.join(' ').toLowerCase().match(/[a-z0-9]+/g)?.map(stem) ?? []);

// Share of the task's words an entry matches (labels or body). quick uses it to answer "no match" instead of
// presenting a single incidental word hit as the best implementation.
export function coverageOf(terms, entry) {
  if (!terms.words.length) return 0;
  const tokens = entry.tokens ??= labelTokens(entry.labels);
  const text = entry.text ??= entry.body.join(' ').toLowerCase();
  const covered = terms.words.filter(word => entry.id === word || tokens.has(word) || (word.length >= 3 && text.includes(word)) || (terms.synonyms?.[word] ?? []).some(extra => tokens.has(extra))).length;
  return Math.round(covered / terms.words.length * 100) / 100;
}

function score(terms, entry, weight) {
  // Labels match whole (stemmed) tokens so "table" does not match "tabler"; body text matches substrings.
  // Each word is weighted by its rarity, so a distinctive word ("passkey") outranks a common one ("api").
  const tokens = entry.tokens ??= labelTokens(entry.labels);
  const text = entry.text ??= entry.body.join(' ').toLowerCase();
  let covered = 0;
  const direct = terms.words.reduce((sum, word) => {
    const hit = (entry.id === word || terms.raw?.includes(entry.id) && stem(entry.id) === word ? 6 : 0) + (tokens.has(word) ? 3 : 0) + (word.length >= 3 && text.includes(word) ? 1 : 0);
    if (hit) covered++;
    return sum + weight(word) * hit;
  }, 0);
  // Results that cover more of the task's words rank above ones that match a single word strongly.
  const coverage = terms.words.length > 1 ? 0.5 + 0.5 * covered / terms.words.length : 1;
  const related = terms.expanded.reduce((sum, word) => sum + (tokens.has(stem(word)) ? weight(word) : 0), 0);
  // A multi-word query that spells an entry's whole ID or title outranks partial matches ("canvas lms" is not Canva).
  const slugOf = value => (String(value ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []).join('-');
  // Titles are compared without parenthetical notes, so "LangChain (Python)" is the LangChain entry.
  const title = slugOf(String(entry.title ?? '').replace(/\([^)]*\)/g, ' '));
  const whole = terms.phrase
    ? (entry.id === terms.phrase ? 2 : title === terms.phrase ? 1.5 : 0) * terms.words.reduce((sum, word) => sum + weight(word), 0) * 3
    : 0;
  return Math.round((direct * coverage + related + whole) * 100) / 100;
}

// Language words in a query ("go", "python", "c#") act as a language preference rather than a search term.
const LANGUAGE_WORDS = {
  go: 'go', golang: 'go', python: 'python', py: 'python', typescript: 'typescript', ts: 'typescript', javascript: 'typescript',
  js: 'typescript', node: 'typescript', nodej: 'typescript', rust: 'rust', java: 'java', kotlin: 'kotlin', csharp: 'csharp',
  dotnet: 'csharp', net: 'csharp', dart: 'dart', flutter: 'dart', swift: 'swift', ruby: 'ruby', rail: 'ruby', php: 'php',
  laravel: 'php', elixir: 'elixir', phoenix: 'elixir',
};
const LANGUAGE_BY_STEM = new Map(Object.entries(LANGUAGE_WORDS).flatMap(([word, language]) => [[word, language], [stem(word), language]]));
export function queryLanguage(query) {
  const words = (query.toLowerCase().replace(/c#/g, ' csharp ').replace(/\.net\b/g, ' dotnet ').match(/[a-z0-9]+/g) ?? []).map(stem);
  return words.map(word => LANGUAGE_BY_STEM.get(word)).find(Boolean);
}

// Inverse document frequency over label tokens, computed once per loaded source set.
const weights = new WeakMap();
function rarity(sources, all) {
  if (!weights.has(sources)) {
    const frequency = new Map();
    for (const entry of all) for (const token of entry.tokens ??= labelTokens(entry.labels)) frequency.set(token, (frequency.get(token) ?? 0) + 1);
    weights.set(sources, { frequency, total: all.length });
  }
  const { frequency, total } = weights.get(sources);
  return word => Math.max(0.25, Math.log((total + 1) / ((frequency.get(word) ?? 0) + 1)) / Math.log(total + 1) * 2);
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
  // Integrity-checked manifests give each module result its exact files and exports.
  const manifests = new Map();
  for (const item of context.catalog.items) manifests.set(item.id, await loadModule(context, item.id));
  const tools = await readJson(root, 'tools/index.json');
  const resources = await loadResources(root);
  const skills = await loadSkills(root);
  const [mcp, cli, api, starter, task] = await Promise.all(['mcp', 'cli', 'api', 'starter', 'task'].map(kind => loadIndex(kind, root)));
  const capabilities = await loadCapabilities(root);
  const docs = await loadDocSections(root);
  const equivalents = (await readJson(root, 'resources/equivalents.json')).equivalents ?? {};
  // Packages that only wrap a retired service (resources/api-lifecycle.json) carry the same notice.
  const serviceSdks = (await readJson(root, 'resources/service-sdks.json')).services ?? {};
  const apiSdks = await readJson(root, 'resources/api-sdks.json');
  // Canonical package records keep what their aliases add: project types, platforms, tags and cautions, so dropping
  // a duplicate never removes a valid search classification (Phoenix stays findable for api-backend).
  const resourceAliases = canonicalPackages(resources.items);
  const extra = new Map();
  for (const [alias, canonical] of resourceAliases) extra.set(canonical, [...(extra.get(canonical) ?? []), resources.items.find(item => item.id === alias)]);
  const union = (a = [], b = []) => [...new Set([...a, ...b])];
  const mergedResources = resources.items.map(item => {
    const others = extra.get(item.id);
    if (!others) return item;
    return { ...item, projectTypes: others.reduce((all, other) => union(all, other.projectTypes), item.projectTypes ?? []),
      platforms: others.reduce((all, other) => union(all, other.platforms), item.platforms ?? []),
      tags: others.reduce((all, other) => union(all, other.tags), item.tags ?? []),
      cautions: others.reduce((all, other) => union(all, other.cautions), item.cautions ?? []), aliases: others.map(other => other.id) };
  });
  const retiredResources = new Map((await readJson(root, 'resources/api-lifecycle.json')).groups
    .flatMap(({ ids, resourceIds = [], ...notice }) => resourceIds.map(id => [id, notice])));
  const integrations = await loadIntegrationCatalog(root);
  const providers = loadProviders(root);
  invariant(object(recipes) && Array.isArray(recipes.entries), 'INVALID_CATALOG', 'Invalid recipe catalog.');
  invariant(object(languages) && Array.isArray(languages.modules), 'INVALID_CATALOG', 'Invalid language example catalog.');
  invariant(object(templates) && templates.schemaVersion === 1 && Array.isArray(templates.templates), 'INVALID_CATALOG', 'Invalid template index.');
  invariant(object(tools) && tools.schemaVersion === 1 && Array.isArray(tools.tools), 'INVALID_CATALOG', 'Invalid tool index.');
  for (const tool of tools.tools) {
    invariant(object(tool) && typeof tool.id === 'string' && typeof tool.guide === 'string' && tool.guide.startsWith('docs/') &&
      Array.isArray(tool.terms) && Array.isArray(tool.commands), 'INVALID_CATALOG', 'Invalid tool entry.');
    await readRegular(root, tool.guide, 256 * 1024);
  }
  for (const template of templates.templates) {
    invariant(object(template) && typeof template.id === 'string' && typeof template.path === 'string' &&
      template.path.startsWith('templates/') && Array.isArray(template.terms), 'INVALID_CATALOG', 'Invalid template entry.');
  }
  return { root, context, manifests, integrationContext: integrations, integrations: integrations.catalog.items, providers, recipes: recipes.entries, languages: languages.modules, templates: templates.templates, tools: tools.tools, skills: skills.skills, mcp: mcp.entries, cli: cli.entries, api: api.entries, starter: starter.entries, task: task.entries, resources: mergedResources, resourceAliases, capabilities: capabilities.capabilities, docs, equivalents, retiredResources, serviceSdks, apiSdks };
}

// Several catalogs can list the same package (discord.js as discord-js and discord-js-npm), so different
// discovery routes could hand agents different records for one thing. Package records that name exactly one
// package share one canonical record: the stricter integration mode wins (a license-review flag is never
// dropped), then the more complete record, then the shorter id. The others become aliases, hidden from search
// but still inspectable by id.
const MODE_ORDER = ['license-review', 'selective-copy', 'service', 'reference', 'package'];
export function canonicalPackages(resources) {
  const groups = new Map();
  for (const resource of resources) {
    if (resource.kind !== 'package' || resource.packages?.length !== 1) continue;
    const key = `${resource.packages[0].ecosystem}:${resource.packages[0].name}`;
    groups.set(key, [...(groups.get(key) ?? []), resource]);
  }
  const completeness = r => (r.quickstart?.length ? 2 : 0) + (r.languages?.length ? 1 : 0) + (r.popularity ? 1 : 0) + (r.license?.id ? 1 : 0) + Math.min((r.summary ?? '').length, 300) / 300;
  const aliases = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [canonical, ...rest] = [...group].sort((a, b) => MODE_ORDER.indexOf(a.integrationMode) - MODE_ORDER.indexOf(b.integrationMode) ||
      completeness(b) - completeness(a) || a.id.length - b.id.length || a.id.localeCompare(b.id));
    for (const alias of rest) aliases.set(alias.id, canonical.id);
  }
  return aliases;
}

export function sourceCounts(sources) {
  return {
    capability: sources.capabilities.length, module: sources.context.catalog.items.length, integration: (sources.integrations ?? []).length, provider: (sources.providers ?? []).length, recipe: sources.recipes.length,
    'language-example': sources.languages.length, template: sources.templates.length, tool: sources.tools.length, skill: sources.skills.length, mcp: sources.mcp.length, cli: sources.cli.length, api: sources.api.length, starter: sources.starter.length, task: sources.task.length, resource: sources.resources.length, doc: sources.docs.length,
  };
}

// Compatibility is advisory here; plan/add remain the enforcing checks for modules.
function fit(entry, profile) {
  if (!profile) return undefined;
  const has = (list, value) => list.includes(value);
  const web = has(profile.languages, 'typescript') || has(profile.languages, 'javascript');
  if (entry.type === 'provider') {
    if (!web) return profile.languages.length ? 'incompatible' : 'review';
    return entry.frameworks.includes('next-app-router') && !has(profile.frameworks, 'next') ? 'review' : 'compatible';
  }
  if (entry.type === 'integration') {
    if (entry.frameworks.includes('react')) {
      if (has(profile.frameworks, 'react-native')) return 'incompatible';
      if (has(profile.frameworks, 'react')) return profile.reactMajor && !(entry.compatibility?.reactMajors ?? [18, 19]).includes(profile.reactMajor) ? 'incompatible' : 'compatible';
      if (profile.frameworks.some(name => ['vue', 'svelte', 'angular', 'solid'].includes(name))) return 'incompatible';
    }
    const languages = profile.languages.map(name => name === 'javascript' ? 'typescript' : name);
    return languages.length === 0 ? 'review' : entry.languages.some(name => languages.includes(name)) ? 'compatible' : 'incompatible';
  }
  if (entry.type === 'module' || entry.type === 'recipe') {
    if (entry.frameworks.includes('react')) {
      // React code needs a JavaScript or TypeScript project: a Python or Go app cannot install it.
      if (profile.languages.length && !web) return 'incompatible';
      if (has(profile.frameworks, 'react-native')) return 'incompatible';
      if (has(profile.frameworks, 'react')) return profile.reactMajor && ![18, 19].includes(profile.reactMajor) ? 'incompatible' : 'compatible';
      return profile.frameworks.some(name => ['vue', 'svelte', 'angular', 'solid'].includes(name)) ? 'incompatible' : 'review';
    }
    if (entry.languages.every(language => language === 'css')) return web || profile.languages.length === 0 ? 'compatible' : 'review';
    return web ? (has(profile.languages, 'typescript') ? 'compatible' : 'review') : 'incompatible';
  }
  if (entry.type === 'language-example') return has(profile.languages, entry.languages[0]) ? 'compatible' : 'incompatible';
  if (entry.type === 'resource') {
    // A UI library for another framework does not fit (TableCraft is React; a Svelte app cannot use it).
    const ui = profile.frameworks.filter(name => UI_FRAMEWORKS.includes(name));
    if (ui.length && !entry.frameworks.includes('any') && !entry.frameworks.some(name => ui.includes(name))) return 'incompatible';
    if (!entry.languages.length) return 'review';
    const languages = profile.languages.map(language => language === 'javascript' ? 'typescript' : language);
    if (languages.length === 0) return 'review';
    if (entry.languages.some(language => languages.includes(language))) return 'compatible';
    // An application or service runs beside the app, so its implementation language is not the app's;
    // only code linked or copied into the app (packages, source libraries, selective copies) must match.
    return entry.resourceKind === 'package' || entry.resourceKind === 'source-library' || entry.kind === 'selective-copy' ? 'incompatible' : 'review';
  }
  // An API without a client for the project's language falls back to the spec: usable, but not a first choice.
  if (entry.type === 'api') return entry.record.lifecycle?.status === 'retired' ? 'review' : entry.sdk || !apiInstallFor(entry.record, profile.languages).every(step => step.startsWith('#')) ? 'compatible' : 'review';
  if (entry.type === 'capability') return entry.selected ? 'compatible' : capabilityLanguage(profile) ? 'incompatible' : 'review';
  return 'review';
}

// Older resource records carry no languages; their package registries imply them (docker and actions imply none).
const ECOSYSTEM_LANGUAGE = { npm: 'typescript', pypi: 'python', crates: 'rust', go: 'go', maven: 'java', nuget: 'csharp', gem: 'ruby', packagist: 'php', pub: 'dart', swift: 'swift', hex: 'elixir' };
function packageLanguages(resource) {
  const languages = [...new Set((resource.packages ?? []).map(entry => ECOSYSTEM_LANGUAGE[entry.ecosystem]).filter(Boolean))];
  // Maven packages also serve Kotlin.
  if (languages.includes('java')) languages.push('kotlin');
  return languages;
}

// The capability language for a detected project: TypeScript also serves JavaScript projects.
export function capabilityLanguage(profile) {
  const languages = (profile?.languages ?? []).map(language => language === 'javascript' ? 'typescript' : language);
  return LANGUAGES.find(language => languages.includes(language));
}

function entries(sources, target, profile) {
  const app = target ? quote(target) : '"$APP_ROOT"';
  const cli = '"$GENLIB_ROOT"/';
  const out = [];
  const language = capabilityLanguage(profile);
  for (const capability of sources.capabilities) {
    const { available, missing } = coverage(capability);
    const chosen = language && capability.implementations[language];
    const selected = chosen && chosen.kind !== 'unavailable' ? { language, ...chosen } : undefined;
    out.push({
      type: 'capability', id: capability.id, title: capability.title, summary: capability.summary, kind: capability.tier,
      ...(capability.caveat ? { caveat: capability.caveat } : {}),
      license: 'Apache-2.0',
      frameworks: ['any'], languages: available, verification: capability.tier === 'pure' ? 'tested-vectors' : 'library-wrapper',
      missingLanguages: missing, guide: capability.guide, selected,
      labels: [capability.id, capability.title, ...capability.terms], body: [capability.title, capability.summary, capability.terms.join(' ')],
      // With a detected language: the one copy command. Without: inspect lists every language's command.
      next: selected
        ? [...commandsFor(selected, app, cli), `Read ${capability.guide}`]
        : [`node ${cli}bin/genlib.mjs capability inspect ${capability.id} --language <${available.join('|')}> --json`, `Read ${capability.guide}`],
    });
  }
  // Recipes that point at a versioned module enrich that module instead of duplicating it.
  const moduleTerms = new Map();
  for (const recipe of sources.recipes) {
    if (recipe.kind === 'versioned-module') moduleTerms.set(recipe.path.replace(/^modules\//, ''), [...recipe.taskTerms, ...(recipe.variants ?? [])]);
  }
  for (const item of sources.context.catalog.items) {
    out.push({
      type: 'module', id: item.id, title: item.title, summary: item.description, kind: item.kind,
      frameworks: item.frameworks, languages: item.languages ?? ['typescript'], verification: item.verification,
      license: 'Apache-2.0', readiness: 'recipe-available', lifecycle: 'active',
      // Export names describe what a module does ("verifyStripeWebhook" -> verify stripe webhook).
      labels: [item.id, item.title, item.kind, ...item.tags, ...(moduleTerms.get(item.id) ?? []),
        ...(sources.manifests.get(item.id)?.exports ?? []).map(name => String(name.name ?? name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase())],
      body: [item.description],
      // Installed paths are relative to the default src/genlib output; read the contract, then only these files.
      installs: sources.manifests.get(item.id)?.files.map(file => file.target) ?? [],
      exports: sources.manifests.get(item.id)?.exports.map(entry => entry.name) ?? [],
      dependencies: sources.manifests.get(item.id)?.dependencies.map(entry => entry.id) ?? [],
      next: [
        `node ${cli}bin/genlib.mjs inspect ${item.id} --json`,
        `node ${cli}bin/genlib.mjs plan ${item.id} --target ${app} --json`,
        `node ${cli}bin/genlib.mjs add ${item.id} --target ${app} --json`,
      ],
    });
  }
  for (const profile of sources.providers ?? []) {
    out.push({
      type: 'provider', id: profile.id, title: profile.title, summary: profile.summary, kind: 'provider-profile',
      lifecycle: 'active', license: profile.license, languages: ['typescript'], frameworks: profile.frameworks ?? [],
      verification: profile.status, readiness: profile.status === 'planned' ? 'source-reviewed' : 'recipe-available',
      labels: [profile.id, profile.title, ...profile.tags], body: [profile.summary],
      next: [
        `node ${cli}bin/genlib.mjs provider inspect ${profile.id} --json`,
        `node ${cli}bin/genlib.mjs provider check ${profile.id} --target ${app}`,
      ],
    });
  }
  for (const item of sources.integrations ?? []) {
    out.push({
      type: 'integration', ...integrationSummary(item), kind: 'integration-pack',
      lifecycle: 'active', license: item.license,
      labels: [item.id, item.title, ...item.tags, ...item.resources], body: [item.summary],
      next: [
        `node ${cli}bin/genlib.mjs integration inspect ${item.id} --json`,
        `node ${cli}bin/genlib.mjs integration plan ${item.id} --target ${app} --json`,
        `node ${cli}bin/genlib.mjs integration add ${item.id} --target ${app} --json`,
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
      type: 'recipe', id: recipe.id, title: recipe.title ?? recipe.id, summary: `${recipe.kind} at ${recipe.path}; variants: ${(recipe.variants ?? []).join(', ')}`,
      ...(recipe.caveat ? { caveat: recipe.caveat } : {}),
      license: 'Apache-2.0',
      kind: recipe.kind, frameworks, languages, verification: recipe.kind,
      labels: [recipe.id, ...recipe.taskTerms, ...(recipe.variants ?? [])], body: [recipe.path, ...recipe.checks],
      requiredChecks: recipe.checks,
      next: [`node ${cli}tools/agent-recipes.mjs inspect ${recipe.id}`, ...copy],
    });
  }
  for (const example of sources.languages) {
    out.push({
      type: 'language-example', id: example.id, title: example.id, summary: `${example.language} example (${example.runtime}); ${example.verification}`,
      license: 'Apache-2.0',
      kind: 'example', frameworks: ['any'], languages: [example.language], verification: example.status,
      ...(example.dependencies?.length ? { dependencies: example.dependencies } : {}),
      // Cookbook modules wrap a pinned library even when no install command is recorded (go-password-hashing uses
      // golang.org/x/crypto); Jev's no-dependency filter reads this.
      ...(example.library ? { library: example.library } : {}),
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
      license: 'Apache-2.0',
      frameworks: ['any'], languages: [], verification: 'template',
      labels: [template.id, template.title, template.phase, ...template.terms], body: [template.summary],
      next: [`Read ${template.guide}, then merge only the selected files from ${template.path} into the target.`],
    });
  }
  for (const tool of sources.tools) {
    out.push({
      type: 'tool', id: tool.id, title: tool.title, summary: tool.summary, kind: tool.kind ?? 'navigation',
      license: 'Apache-2.0',
      frameworks: ['any'], languages: [], verification: 'tool',
      labels: [tool.id, tool.title, ...tool.terms], body: [tool.summary],
      next: [`Read ${tool.guide}. ${tool.kind ? 'Run from the trusted Genlib checkout:' : 'Run inside the repository being indexed (a clean, committed checkout):'}`, ...tool.commands.map(command => command.replace(/^node tools\//, `node ${cli}tools/`))],
    });
  }
  for (const skill of sources.skills) {
    out.push({
      type: 'skill', id: skill.id, title: skill.name, summary: skill.description, kind: 'agent-skill',
      frameworks: ['any'], languages: [], verification: skill.redistributable ? 'indexed' : 'indexed-license-unclear',
      rank: skill.rank, license: skill.license,
      labels: [skill.id, skill.name, 'skill'], body: [skill.description],
      // One step: install the commit-pinned skill into .claude/skills and .agents/skills.
      next: [installCommand(skill), `Review first: ${skill.url}`],
    });
  }
  const LABEL = { mcp: 'mcp server', cli: 'cli', api: 'api', starter: 'starter template boilerplate', task: 'task recipe' };
  // A sign-up-only service points at the vendor's own SDK or CLI from the catalogs (resources/service-sdks.json).
  const resourceById = new Map(sources.resources.map(resource => [resource.id, resource]));
  const cliByName = new Map(sources.cli.map(entry => [entry.name, entry]));
  const vendorTools = resource => (sources.serviceSdks?.[resource.id] ?? []).flatMap(ref => {
    const [type, id] = ref.split(':');
    const target = type === 'resource' ? resourceById.get(id) : cliByName.get(id);
    if (!target) return [];
    const step = type === 'resource' ? quickstartFor(target).find(line => !/^(Open|Docs|Sign up)/.test(line)) : target.install[0];
    return [`# vendor ${type === 'cli' ? 'CLI' : 'SDK'}: ${ref}`, ...(step ? [step] : [])];
  });
  const retiredNotice = resource => {
    const notice = sources.retiredResources?.get(resource.id);
    return notice ? `# wraps a service retired ${notice.date}: ${notice.replacement}. Do not install; see ${notice.source}` : '';
  };
  // An API without a client for the project's language points at the vendor SDK named for that exact API and
  // language in resources/api-sdks.json (stripe-com + go -> stripe-go-go). Nothing is inferred from names, and a
  // retired API never gets an install step.
  const sdkLanguage = capabilityLanguage(profile);
  // The API steps an agent sees: the language's generator steps, or the mapped vendor SDK instead of the
  // "no client recorded" fallback line.
  const apiSteps = api => {
    const sdk = sdkFor(api), steps = installFor('api', api, 'both', profile?.languages);
    return sdk.length ? [...steps.filter(step => !step.startsWith('# no ')), ...sdk] : steps;
  };
  const sdkFor = api => {
    if (!sdkLanguage || ['typescript', 'python'].includes(sdkLanguage) || api.lifecycle?.status === 'retired') return [];
    const id = sources.apiSdks?.apis?.[api.id]?.[sdkLanguage] ?? sources.apiSdks?.providers?.[api.provider]?.[sdkLanguage];
    const resource = id && resourceById.get(id);
    return resource ? [`# ${sdkLanguage} SDK for this API: resource:${resource.id} (${resource.name})`, ...quickstartFor(resource).slice(0, 1)] : [];
  };
  for (const kind of ['mcp', 'cli', 'api', 'starter', 'task']) {
    for (const entry of sources[kind]) {
      out.push({
        type: kind, id: entry.id, title: entry.title ?? entry.name, summary: entry.description, kind,
        ...(kind === 'api' ? { record: entry, ...(sdkFor(entry).length ? { sdk: true } : {}), ...(entry.lifecycle?.status === 'retired' ? { retired: entry.lifecycle.date } : {}) } : {}),
        frameworks: entry.frameworks ?? ['any'], languages: entry.languages ?? [], verification: 'indexed', rank: entry.rank,
        ...(entry['license-review'] ? { integrationMode: 'license-review' } : {}),
        // MCP names are reverse-DNS ("io.github.owner/server"): the shared namespace would match every query for
        // "github", so only the server part, title and repository path label them, as in genlib mcp find.
        labels: [...(kind === 'mcp'
          ? [entry.name.split('/').pop(), entry.title ?? '', (entry.repository ?? '').replace(/^https:\/\/[^/]+\//, '')]
          : [entry.id, entry.name, entry.provider ?? '']), LABEL[kind], ...(entry.frameworks ?? []), ...(entry.apps ?? []), entry.category ?? ''], body: [entry.description],
        ...(kind === 'mcp' && entry.repository ? { vendor: entry.repository.replace(/^https:\/\/[^/]+\//, '').split('/')[0].toLowerCase() } : {}),
        next: [...(kind === 'api' ? apiSteps(entry) : installFor(kind, entry, 'both', profile?.languages)), `node ${cli}bin/genlib.mjs ${kind} inspect ${entry.id} --json`],
      });
    }
  }
  const aliasesOf = new Map();
  for (const [alias, canonical] of sources.resourceAliases ?? []) aliasesOf.set(canonical, [...(aliasesOf.get(canonical) ?? []), alias]);
  for (const resource of sources.resources) {
    if (sources.resourceAliases?.has(resource.id)) continue;
    // The frameworks a resource serves come from what it installs: per-framework adapters (frameworkPackages,
    // e.g. @tanstack/vue-table), else framework names in its package names (@tanstack/react-table is React-only),
    // else its UI framework tags; with none of these it serves any framework.
    const adapters = resource.frameworkPackages ?? {};
    const fromPackages = [...new Set((resource.packages ?? []).flatMap(entry => UI_FRAMEWORKS.filter(name => new RegExp(`(^|[/@-])${name === 'solid' ? 'solid(js)?' : name}($|[-/])`).test(entry.name))))];
    const uiFrameworks = Object.keys(adapters).length ? Object.keys(adapters) : fromPackages.length ? fromPackages : (resource.tags ?? []).filter(tag => UI_FRAMEWORKS.includes(tag));
    const projectUi = (profile?.frameworks ?? []).find(name => adapters[name]);
    const retired = sources.retiredResources?.get(resource.id);
    out.push({
      type: 'resource', id: resource.id, title: resource.name, summary: resource.summary, kind: resource.integrationMode, resourceKind: resource.kind,
      ...(retired ? { retired: retired.date } : {}),
      ...(aliasesOf.has(resource.id) ? { aliases: aliasesOf.get(resource.id) } : {}),
      frameworks: uiFrameworks.length ? uiFrameworks : ['any'], languages: resource.languages ?? packageLanguages(resource), verification: resource.verification, platforms: resource.platforms,
      license: resource.license.id, ...(resource.popularity ? { popularity: resource.popularity } : {}),
      lifecycle: lifecycleOf(resource), readiness: readinessOf(resource),
      ...(resource.readiness?.profiles ? { testedProfiles: resource.readiness.profiles } : {}),
      ...(resource.genlib?.integrations?.length ? { integrations: resource.genlib.integrations } : {}),
      ...(resource.genlib?.module ? { module: resource.genlib.module } : {}),
      integrationMode: resource.integrationMode,
      licenseScope: resource.license.scope,
      projectTypes: resource.projectTypes ?? [],
      labels: [resource.id, resource.name, resource.category, ...resource.tags], body: [resource.summary, resource.useWhen],
      // Prefer the available Genlib contract, then preserve exact upstream setup steps.
      next: [
        ...(retiredNotice(resource) ? [retiredNotice(resource)] : []),
        ...(resource.integrationMode === 'license-review' ? ['License review required before copying or embedding: ' + resource.license.scope] : []),
        ...(resource.genlib?.module ? [`node ${cli}bin/genlib.mjs inspect ${resource.genlib.module} --json`] : []),
        // A bound pack is offered only when it can run in the project's UI framework (a React pack is not a Svelte answer).
        ...(resource.genlib?.integrations ?? []).filter(id => packFits(sources, id, projectUi)).map(id => `node ${cli}bin/genlib.mjs integration inspect ${id} --json`),
        ...(retired ? [] : projectUi
          ? [`npm install ${adapters[projectUi]}   # ${projectUi} adapter`, ...quickstartFor(resource).filter(step => !/^(npm|pnpm|yarn|bun) (install|add|i)\b/.test(step))]
          : quickstartFor(resource)),
        ...vendorTools(resource),
        `node ${cli}tools/resources.mjs inspect ${resource.id} --json`,
      ],
    });
  }
  for (const section of sources.docs) {
    out.push({
      type: 'doc', id: `${section.file}#${section.anchor}`, title: section.title, summary: section.summary, kind: 'documentation',
      frameworks: ['any'], languages: [], verification: 'doc', file: section.file, lines: [section.start, section.end],
      labels: [section.heading, section.file.replace(/[/.]/g, ' ')], body: [section.title, section.summary],
      // Read only this section: the exact line range is cheaper than opening the file.
      next: [`sed -n '${section.start},${section.end}p' "$GENLIB_ROOT"/${section.file}`],
    });
  }
  // Final check on the assembled steps: after a retirement notice ("Do not install"), no install command may follow,
  // whichever projection added it.
  const INSTALLS = /^(npm|pnpm|yarn|bun) (install|add|i)\b|^npx |^pip3? install|^uvx? |^go (get|install)\b|^cargo (add|install)\b|^dotnet add\b|^bundle add\b|^gem install\b|^composer require\b|^(dart|flutter) pub add\b|^docker (pull|run)\b|^brew install\b|^mvn |^gradle /;
  for (const entry of out) {
    const stop = entry.next.findIndex(step => /Do not install/.test(step));
    if (stop >= 0) entry.next = entry.next.filter((step, index) => index <= stop || !INSTALLS.test(step));
  }
  // Point at Genlib's own tested code first when it already covers what an external project does.
  for (const entry of out) {
    const same = sources.equivalents?.[`${entry.type}:${entry.id}`];
    if (same?.length) entry.next = [`Genlib already has tested code for this: ${same.join(' ')} (genlib outline <ref>)`, ...entry.next];
  }
  return out;
}

// The resource record an inspect returns: an alias resolves to its canonical record (keeping the stricter mode and
// license notes), and a package that only wraps a retired service carries the notice instead of install steps.
// After selection, version-specific library documentation comes from Context7 (optional, no key needed for low
// volume). The first command resolves the library id, which Genlib never guesses; pass the installed version.
export const CONTEXT7_CLI = 'ctx7@0.6.0';
// TanStack Intent loads agent skills that npm packages ship in skills/<name>/SKILL.md, for the installed version.
export const INTENT_CLI = '@tanstack/intent@0.5.5';

// The installed version of a resource's npm package in the receiving project (node_modules/<name>/package.json),
// and any Intent skills it ships. Read-only; returns undefined when the package is not installed.
const resourceIndex = new WeakMap();
function resourceById(sources, id) {
  if (!resourceIndex.has(sources)) resourceIndex.set(sources, new Map(sources.resources.map(item => [item.id, item])));
  return resourceIndex.get(sources).get(id);
}

export function installedPackage(target, record) {
  const name = record?.packages?.find(item => item.ecosystem === 'npm')?.name;
  if (!name || !/^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name)) return undefined;
  const root = path.join(target, 'node_modules', ...name.split('/'));
  try {
    const manifest = path.join(root, 'package.json');
    if (statSync(manifest).size > 512 * 1024) return undefined;
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    if (pkg.name !== name || typeof pkg.version !== 'string') return undefined;
    let skills = [];
    try {
      skills = readdirSync(path.join(root, 'skills'), { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && /^[\w.-]{1,80}$/.test(dirent.name) && existsSync(path.join(root, 'skills', dirent.name, 'SKILL.md')))
        .map(dirent => dirent.name).sort().slice(0, 20);
    } catch {}
    return { name, version: pkg.version, ...(skills.length ? { skills } : {}),
      docs: `npx -y ${CONTEXT7_CLI} docs <library id>/${pkg.version} "<task>"` };
  } catch { return undefined; }
}
export function docsLookup(record) {
  const name = record.packages?.find(item => ['npm', 'pypi', 'crates', 'go', 'nuget', 'maven', 'pub', 'gem', 'composer'].includes(item.ecosystem))?.name;
  if (!name) return undefined;
  return { context7: [`npx -y ${CONTEXT7_CLI} library ${name} "<task>"`, `npx -y ${CONTEXT7_CLI} docs <library id from step 1>[/<installed version>] "<task>"`] };
}

function packFits(sources, id, framework) {
  if (!framework) return true;
  const pack = (sources.integrations ?? []).find(item => item.id === id);
  return !pack?.frameworks?.length || pack.frameworks.includes('any') || pack.frameworks.includes(framework);
}

export function resolveResource(sources, id) {
  const canonicalId = sources.resourceAliases?.get(id) ?? id;
  const record = sources.resources.find(item => item.id === canonicalId);
  if (!record) return undefined;
  const notice = sources.retiredResources?.get(id) ?? sources.retiredResources?.get(canonicalId);
  return {
    ...record, ...(canonicalId !== id ? { requested: id, canonical: canonicalId } : {}),
    ...(notice ? { lifecycle: { status: 'retired', ...notice }, quickstart: [`# wraps a service retired ${notice.date}: ${notice.replacement}. Do not install; see ${notice.source}`] } : { quickstart: quickstartFor(record) }),
    ...(!notice && docsLookup(record) ? { docsLookup: docsLookup(record) } : {}),
  };
}

// One resolver for a single record, shared by find, inspect (CLI and MCP) and quick, so every entry point returns
// the same steps: lifecycle, aliases, vendor SDKs and language selection applied once.
export function resolveEntry(sources, type, id, profile) {
  const entry = entries(sources, undefined, profile).find(item => item.type === type && item.id === id);
  if (!entry) return undefined;
  const { labels, body, tokens, text, record, vendor, resourceKind, sdk, ...visible } = entry;
  return { ...visible, ...(profile ? { fit: fit(entry, profile) } : {}) };
}

// Every searchable entry with labels, for the generated search index.
export function searchEntries(sources) {
  return entries(sources);
}

export function findInSources(sources, query, { type, project, limit = 8, target, profile, includeRetired = false, licensePolicy = 'any' } = {}) {
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= 25, 'INVALID_OPTION', 'Limit must be between 1 and 25.');
  invariant(!type || SOURCE_TYPES.includes(type), 'INVALID_OPTION', 'Type must be one of: ' + SOURCE_TYPES.join(', '));
  invariant(typeof includeRetired === 'boolean' && LICENSE_POLICIES.includes(licensePolicy), 'INVALID_OPTION', 'Use a boolean includeRetired and license policy any or permissive.');
  const terms = queryTerms(query);
  invariant(terms.words.length > 0, 'INVALID_OPTION', 'Provide task words to search, for example: find webhook signature.');
  const language = queryLanguage(query);
  if (language) {
    // The language steers selection; it stays a search word only when nothing else was asked.
    const rest = terms.words.filter(word => LANGUAGE_BY_STEM.get(word) !== language);
    if (rest.length) terms.words = rest;
  }
  // A language named in the query behaves like a detected project language when no project was given.
  const effective = profile ?? (language ? { languages: [language], frameworks: [] } : undefined);
  const rank = { compatible: 2, review: 1, incompatible: 0 };
  const all = entries(sources, target, effective);
  const allowedResources = new Set(sources.resources.filter(item => eligibleResource(item, { includeRetired, licensePolicy })).map(item => item.id));
  const readinessRank = entry => {
    if (entry.readiness?.level === 'integration-verified') return 4;
    if ((entry.verification?.level ?? entry.verification) === 'tested') return 3;
    if ((entry.readiness?.level ?? entry.readiness) === 'recipe-available') return 2;
    if ((entry.readiness?.level ?? entry.readiness) === 'source-reviewed') return 1;
    return 0;
  };
  const weight = rarity(sources, all);
  const matches = all
    .filter(entry => !type || entry.type === type)
    .filter(entry => entry.type !== 'resource' || allowedResources.has(entry.id))
    // The permissive policy is conservative: unknown and mixed licenses need review.
    .filter(entry => licensePolicy !== 'permissive' || entry.type === 'doc' || isPermissive(entry.license))
    .filter(entry => licensePolicy !== 'permissive' || entry.type !== 'integration' || entry.resources.every(id => allowedResources.has(id)))
    // A project filter narrows resources to that project type; other source types carry no project tags.
    .filter(entry => !project || entry.type !== 'resource' || entry.projectTypes.includes(project))
    .map(entry => {
      const suitability = fit(entry, effective);
      // A known fit for the receiving project outranks a close lexical match that needs review (Stripe's Go SDK
      // before the Stripe API spec in a Go project), and an MCP server published by the named vendor
      // (github/github-mcp-server for "github mcp") outranks third-party servers that mention it.
      const boost = (suitability === 'compatible' ? FIT_WEIGHT : 1) * (entry.vendor && terms.words.includes(entry.vendor) ? VENDOR_WEIGHT : 1) * (entry.retired ? RETIRED_WEIGHT : 1);
      return { entry, score: Math.round(score(terms, entry, weight) * (PRIOR[entry.type] ?? 1) * boost * 100) / 100, fit: suitability, coverage: coverageOf(terms, entry) };
    })
    .filter(hit => hit.score > 0);
  // Drop weak incidental substring hits once a strong match exists.
  const floor = Math.max(...matches.map(hit => hit.score), 0) / 4;
  matches.splice(0, matches.length, ...matches.filter(hit => hit.score >= floor));
  // A matched capability already selects the right language's example, so its per-language entries
  // would only repeat it; they stay reachable through capability inspect or --type language-example.
  const capabilities = new Set(matches.filter(hit => hit.entry.type === 'capability').map(hit => hit.entry.id));
  if (capabilities.size && type !== 'language-example') {
    matches.splice(0, matches.length, ...matches.filter(hit => hit.entry.type !== 'language-example' ||
      ![...capabilities].some(id => hit.entry.id.endsWith('-' + id))));
  }
  // The same holds for the TypeScript recipe a matched capability already points to.
  const capabilityRecipes = new Set(sources.capabilities.filter(item => capabilities.has(item.id))
    .map(item => item.implementations.typescript?.kind === 'recipe' ? item.implementations.typescript.id : null).filter(Boolean));
  if (capabilityRecipes.size && type !== 'recipe') {
    matches.splice(0, matches.length, ...matches.filter(hit => hit.entry.type !== 'recipe' || !capabilityRecipes.has(hit.entry.id)));
  }
  // With a detected project, known mismatches are counted rather than shown unless asked for by type.
  const hidden = effective && !type ? matches.filter(hit => hit.fit === 'incompatible').length : 0;
  const results = matches.filter(hit => !hidden || hit.fit !== 'incompatible')
    .sort((a, b) => b.score - a.score || (rank[b.fit] ?? 0) - (rank[a.fit] ?? 0) ||
      readinessRank(b.entry) - readinessRank(a.entry) ||
      (b.entry.popularity?.value ?? -1) - (a.entry.popularity?.value ?? -1) ||
      SOURCE_TYPES.indexOf(a.entry.type) - SOURCE_TYPES.indexOf(b.entry.type) || a.entry.id.localeCompare(b.entry.id))
    // At most two sections from any one document, so docs do not crowd out code and tools.
    .filter((hit, index, sorted) => hit.entry.type !== 'doc' || sorted.slice(0, index).filter(other => other.entry.file === hit.entry.file).length < 2)
    .slice(0, limit)
    .map(({ entry, score: value, fit: suitability, coverage }) => {
      const { labels, body, tokens, text, record, vendor, resourceKind, sdk, ...visible } = entry;
      // In a receiving project, an already installed package pins the version its docs and skills must match.
      const installed = target && entry.type === 'resource' ? installedPackage(target, record ?? resourceById(sources, entry.id)) : undefined;
      const next = installed?.skills?.length
        ? [...visible.next, ...installed.skills.slice(0, 3).map(skill => `npx -y ${INTENT_CLI} load ${installed.name}#${skill}   # guidance shipped with ${installed.name}@${installed.version}`)]
        : visible.next;
      return { ...visible, next, score: value, coverage, ...(suitability ? { fit: suitability } : {}), ...(installed ? { installed } : {}) };
    });
  return {
    query, terms: terms.words, relatedTerms: terms.expanded, results,
    ...(hidden ? { hiddenIncompatible: hidden } : {}),
    policy: { includeRetired, licensePolicy },
    guidance: 'Lexical ranking over local metadata. Inspect the selected contract or record, then plan before copying. "fit" is advisory; plan enforces declared module and integration compatibility. Retired resources are hidden by default; verification describes only its stated profile.',
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
