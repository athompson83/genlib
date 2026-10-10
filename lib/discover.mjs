import * as fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog, loadModule } from './catalog.mjs';
import { loadResources, quickstartFor } from './resources.mjs';
import { installCommand, loadSkills } from './skills.mjs';
import { installFor, loadIndex } from './indexes.mjs';
import { LANGUAGES, commandsFor, coverage, loadCapabilities } from './capabilities.mjs';
import { loadDocSections } from './docs-index.mjs';
import { invariant, object, parseJson, readRegular, rootDirectory } from './safety.mjs';

// One read-only entry point over every Genlib source: versioned modules, task recipes,
// cross-language examples, capabilities (one task, every language), project templates,
// code-navigation tools and reviewed external resources.
// Order breaks score ties: authored code first, external indexes after docs (they are large and match generic words).
export const SOURCE_TYPES = ['capability', 'module', 'recipe', 'language-example', 'template', 'tool', 'skill', 'mcp', 'cli', 'api', 'resource', 'doc', 'starter', 'task'];

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
const STOPWORDS = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'with', 'how', 'do', 'does', 'i', 'we', 'my', 'our', 'is', 'are', 'be', 'can', 'it', 'this', 'that', 'what', 'which', 'need', 'want', 'use', 'using', 'from', 'into', 'add', 'make', 'get', 'me', 'please']);
const stem = word => word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;

export function queryTerms(query) {
  invariant(typeof query === 'string' && query.length <= 500, 'INVALID_OPTION', 'Search query must have at most 500 characters.');
  const all = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(stem);
  // Keep stopwords only when the query is made of nothing else (for example "make").
  const meaningful = all.filter(word => !STOPWORDS.has(word));
  const words = [...new Set(meaningful.length ? meaningful : all)];
  const expanded = new Set();
  for (const word of words) for (const extra of SYNONYMS[word] ?? []) if (!words.includes(extra)) expanded.add(extra);
  // The unstemmed query as a slug, so "canvas lms" can match the entry named Canvas LMS exactly.
  const phrase = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).join('-');
  return { words, expanded: [...expanded], phrase };
}

const labelTokens = labels => new Set(labels.join(' ').toLowerCase().match(/[a-z0-9]+/g)?.map(stem) ?? []);

function score(terms, entry, weight) {
  // Labels match whole (stemmed) tokens so "table" does not match "tabler"; body text matches substrings.
  // Each word is weighted by its rarity, so a distinctive word ("passkey") outranks a common one ("api").
  const tokens = entry.tokens ??= labelTokens(entry.labels);
  const text = entry.text ??= entry.body.join(' ').toLowerCase();
  let covered = 0;
  const direct = terms.words.reduce((sum, word) => {
    const hit = (entry.id === word ? 6 : 0) + (tokens.has(word) ? 3 : 0) + (word.length >= 3 && text.includes(word) ? 1 : 0);
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
export function queryLanguage(query) {
  const words = (query.toLowerCase().replace(/c#/g, ' csharp ').replace(/\.net\b/g, ' dotnet ').match(/[a-z0-9]+/g) ?? []).map(stem);
  return words.map(word => LANGUAGE_WORDS[word]).find(Boolean);
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
  return { root, context, manifests, recipes: recipes.entries, languages: languages.modules, templates: templates.templates, tools: tools.tools, skills: skills.skills, mcp: mcp.entries, cli: cli.entries, api: api.entries, starter: starter.entries, task: task.entries, resources: resources.items, capabilities: capabilities.capabilities, docs, equivalents };
}

export function sourceCounts(sources) {
  return {
    capability: sources.capabilities.length, module: sources.context.catalog.items.length, recipe: sources.recipes.length,
    'language-example': sources.languages.length, template: sources.templates.length, tool: sources.tools.length, skill: sources.skills.length, mcp: sources.mcp.length, cli: sources.cli.length, api: sources.api.length, starter: sources.starter.length, task: sources.task.length, resource: sources.resources.length, doc: sources.docs.length,
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
  if (entry.type === 'resource' && entry.languages.length) {
    const languages = profile.languages.map(language => language === 'javascript' ? 'typescript' : language);
    if (languages.length === 0) return 'review';
    return entry.languages.some(language => languages.includes(language)) ? 'compatible' : 'incompatible';
  }
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
  for (const tool of sources.tools) {
    out.push({
      type: 'tool', id: tool.id, title: tool.title, summary: tool.summary, kind: 'navigation',
      frameworks: ['any'], languages: [], verification: 'tool',
      labels: [tool.id, tool.title, ...tool.terms], body: [tool.summary],
      next: [`Read ${tool.guide}. Run inside the repository being indexed (a clean, committed checkout):`, ...tool.commands.map(command => command.replace(/^node tools\//, `node ${cli}tools/`))],
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
  for (const kind of ['mcp', 'cli', 'api', 'starter', 'task']) {
    for (const entry of sources[kind]) {
      out.push({
        type: kind, id: entry.id, title: entry.title ?? entry.name, summary: entry.description, kind,
        frameworks: entry.frameworks ?? ['any'], languages: entry.languages ?? [], verification: 'indexed', rank: entry.rank,
        ...(entry['license-review'] ? { integrationMode: 'license-review' } : {}),
        labels: [entry.id, entry.name, entry.provider ?? '', LABEL[kind], ...(entry.frameworks ?? []), ...(entry.apps ?? []), entry.category ?? ''], body: [entry.description],
        next: [...installFor(kind, entry), `node ${cli}bin/genlib.mjs ${kind} inspect ${entry.id} --json`],
      });
    }
  }
  for (const resource of sources.resources) {
    out.push({
      type: 'resource', id: resource.id, title: resource.name, summary: resource.summary, kind: resource.integrationMode,
      frameworks: ['any'], languages: resource.languages ?? packageLanguages(resource), verification: resource.verification, platforms: resource.platforms,
      license: resource.license.id, ...(resource.popularity ? { popularity: resource.popularity } : {}),
      projectTypes: resource.projectTypes ?? [],
      labels: [resource.id, resource.name, resource.category, ...resource.tags], body: [resource.summary, resource.useWhen],
      // Shortest path first: the exact install/copy steps, then the record for license and cautions.
      next: [
        ...(resource.integrationMode === 'license-review' ? ['License review required before copying or embedding: ' + resource.license.scope] : []),
        ...quickstartFor(resource),
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
  // Point at Genlib's own tested code first when it already covers what an external project does.
  for (const entry of out) {
    const same = sources.equivalents?.[`${entry.type}:${entry.id}`];
    if (same?.length) entry.next = [`Genlib already has tested code for this: ${same.join(' ')} (genlib outline <ref>)`, ...entry.next];
  }
  return out;
}

// Every searchable entry with labels, for the generated search index.
export function searchEntries(sources) {
  return entries(sources);
}

export function findInSources(sources, query, { type, project, limit = 8, target, profile } = {}) {
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= 25, 'INVALID_OPTION', 'Limit must be between 1 and 25.');
  invariant(!type || SOURCE_TYPES.includes(type), 'INVALID_OPTION', 'Type must be one of: ' + SOURCE_TYPES.join(', '));
  const terms = queryTerms(query);
  invariant(terms.words.length > 0, 'INVALID_OPTION', 'Provide task words to search, for example: find webhook signature.');
  const language = queryLanguage(query);
  if (language) {
    // The language steers selection; it stays a search word only when nothing else was asked.
    const rest = terms.words.filter(word => LANGUAGE_WORDS[word] !== language);
    if (rest.length) terms.words = rest;
  }
  // A language named in the query behaves like a detected project language when no project was given.
  const effective = profile ?? (language ? { languages: [language], frameworks: [] } : undefined);
  const rank = { compatible: 2, review: 1, incompatible: 0 };
  const all = entries(sources, target, effective);
  const weight = rarity(sources, all);
  const matches = all
    .filter(entry => !type || entry.type === type)
    // A project filter narrows resources to that project type; other source types carry no project tags.
    .filter(entry => !project || entry.type !== 'resource' || entry.projectTypes.includes(project))
    .map(entry => ({ entry, score: score(terms, entry, weight), fit: fit(entry, effective) }))
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
      (b.entry.popularity?.value ?? -1) - (a.entry.popularity?.value ?? -1) ||
      SOURCE_TYPES.indexOf(a.entry.type) - SOURCE_TYPES.indexOf(b.entry.type) || a.entry.id.localeCompare(b.entry.id))
    // At most two sections from any one document, so docs do not crowd out code and tools.
    .filter((hit, index, sorted) => hit.entry.type !== 'doc' || sorted.slice(0, index).filter(other => other.entry.file === hit.entry.file).length < 2)
    .slice(0, limit)
    .map(({ entry, score: value, fit: suitability }) => {
      const { labels, body, tokens, text, ...visible } = entry;
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
