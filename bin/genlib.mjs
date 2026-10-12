#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectModule, loadCatalog, searchCatalog } from '../lib/catalog.mjs';
import { formatInstall, installModule, planInstall, verifyInstallation } from '../lib/install.mjs';
import { detectProject, findInSources, loadSources, resolveEntry, sourceCounts } from '../lib/discover.mjs';
import { invariant } from '../lib/safety.mjs';
import { HARNESSES, installCommand, loadSkills, searchSkills, skillSummary } from '../lib/skills.mjs';
import { INDEXES, MCP_CLIENTS, installFor, loadIndex, searchIndex, summarize } from '../lib/indexes.mjs';
import { LANGUAGES, commandsFor, coverage, stepsFor, loadCapabilities } from '../lib/capabilities.mjs';
import { formatJevPrompt, jevPacket } from '../lib/jev.mjs';
import { briefFind, formatBrief, formatIndexHits, formatQuick, quickPick, withDetails } from '../lib/brief.mjs';
import { integrationSummary, inspectIntegration, installIntegration, loadIntegrationCatalog, planIntegration, verifyIntegrations } from '../lib/integrations.mjs';
import { checkAdoption, removeModule, updateModule } from '../lib/lifecycle.mjs';
import { adoptStaged, checkProvider, loadProviders, planStaged, providerSummary } from '../lib/providers.mjs';
import { addRegistry, planRegistry, removeRegistry, resolveItems, updateRegistry, verifyRegistry } from '../lib/registry-adapter.mjs';
import { acceptanceProblems, contractCoverage, coverageFor, formatCoverage, loadContracts } from '../lib/coverage.mjs';
import { formatOutline, outline } from '../lib/outline.mjs';
import { connectAgents, connectSummary } from '../lib/connect.mjs';
import { formatSource, sourcePlan } from '../lib/source.mjs';
import { harnessConfiguration, listHarnesses } from '../lib/harnesses.mjs';
import { installSkills } from '../scripts/install-skills.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));

// Languages a task can name: the nine capability languages plus the resource-only ones.
const FIND_LANGUAGES = [...LANGUAGES, 'ruby', 'php', 'elixir'];

const HELP = {
  name: 'genlib', version: '0.2.0', runtime: 'Node.js 22+; no npm install needed for this CLI',
  commands: [
    'harness list [--json]   # documented skill/MCP profiles, including Ollama through an MCP host',
    'harness config <name> [--target <absolute-project>] [--mode sdk|discovery] [--transport stdio|http --url <endpoint>] [--allow-install] [--raw|--json]   # emit native MCP configuration; never rewrites settings',
    'harness install <name|both|all> --target <absolute-directory> [--scope project|user] [--json]   # copy the portable skill; user scope target is the home directory',
    'harness doctor [--target <absolute-project>] [--mode sdk|discovery] [--json]   # read-only local MCP connection and tool-call check',
    'quick <task words> [--language <name>] [--target <project>] [--type <source type>] [--json]   # best match: only its commands (cheapest)',
    'find <task words> [--type capability|module|integration|recipe|language-example|template|starter|task|tool|skill|mcp|cli|api|resource|doc] [--language <name>] [--project <project-type>] [--target <project>] [--license-policy any|permissive] [--include-retired] [--limit 8] [--json [--brief]]   # text output is compact; --json gives full records',
    'outline <id|type:id> [--language <name>] [--json]   # signatures and doc lines only: call the code without reading its source',
    'source <id|type:id> [--path <dir>] [--json]   # pinned sparse checkout or one raw file of an external project, its license, and Genlib equivalents',
    'jev <task words> [--type <source type>] [--target <project>] [--license-policy any|permissive] [--include-retired] [--limit 8] [--stdlib-only] [--prompt|--json]   # bounded yes/no decision packet for Jev; --prompt prints it as a compact direct-call prompt',
    'integration list [--json] | integration inspect <id> [--json]',
    'integration plan <id> --target <project> [--out genlib/integrations/<id>] [--allow-unverified] [--json]',
    'integration add <id> --target <project> [--out genlib/integrations/<id>] [--allow-unverified] [--json]',
    'integration verify --target <project> [--json]',
    'capability list [--json] | capability inspect <id> [--language typescript|python|go|rust|java|kotlin|csharp|dart|swift] [--json]',
    'detect --target <existing-project> [--json]',
    'skill find <words> [--harness claude|codex|both] [--limit 8] [--json]',
    'skill inspect <id> [--harness claude|codex|both] [--json]',
    'mcp find <words> | mcp inspect <id> [--client claude|codex|both] [--limit 8] [--json]',
    'cli find <words> | cli inspect <id> [--limit 8] [--json]',
    'starter find <words> | starter inspect <id> [--limit 8] [--json]   # project templates and boilerplates, commit-pinned',
    'task find <words> | task inspect <id> [--limit 8] [--json]   # refactoring recipes (OpenRewrite) and workflow templates (n8n)',
    'api find <words> | api inspect <id> [--limit 8] [--json]',
    'catalog [--json]',
    'list [--json]',
    'search <words> [--framework react] [--limit 5] [--json]',
    'inspect <id> [--json]',
    'plan <id> --target <existing-project> [--profile core,http] [--out src/genlib] [--allow-unverified] [--ts-imports] [--json]   # files, then the wiring example with app import paths',
    'add <id> --target <existing-project> [--profile core,http] [--out src/genlib] [--allow-unverified] [--ts-imports] [--json]   # --profile copies only those file groups (plus what they import); repeat with another profile to add it',
    'verify --target <existing-project> [--json]',
    'adopted <id> --target <existing-project> [--test "<command>"] [--accepts contract#req,...] [--json]   # copied, used and verified; --accepts records requirement-level acceptance',
    'registry plan|add shadcn:<name>|<https item URL> --target <existing-project> [--style new-york-v4] [--sha256 <hex>] [--keep-existing] [--json]   # adopt a shadcn-format registry item with conflict checks, a lock and a receipt (fetches over https)',
    'registry verify --target <existing-project> | registry remove <shadcn--name> --target <existing-project> [--dry-run]',
    'registry update <shadcn--name> --target <existing-project> [--write] [--conflict rej|inline]   # three-way merge of the registry\'s current version onto your edits; dry run unless --write',
    'connect --target <app> [--agent claude,cursor,vscode,opencode,codex|all] [--write] [--remove] [--json]   # MCP entry + usage guidance for the app\'s coding agents; app files only, dry run unless --write',
    'provider list | provider inspect <id> | provider check <id> --target <existing-project> [--json]   # upstream feature profiles (BTST Kanban): prerequisites the app must meet, pinned steps, acceptance',
    'provider plan|adopt <id> --from <scratch-copy> [--baseline <pristine-copy>] --target <existing-project> [--json]   # adopt a scaffolder\'s output from a scratch copy: new files only, merges reported, never overwrites',
    'coverage <task words> | coverage --list [--target <existing-project>] [--json]   # which requirements of a feature Genlib code fulfills, with evidence status',
    'update <id> --target <existing-project> [--write] [--conflict rej|inline] [--json]   # three-way merge onto your edits; dry run unless --write',
    'schema [quick|steps|plan|receipt|update|module|harness-config|harness-doctor]   # JSON Schema of an agent-facing output',
    'remove <id> --target <existing-project> [--dry-run] [--json]   # roll back: delete unmodified files, keep edited ones, drop the lock record',
  ],
  start: 'Run quick (or find) with the task first: it searches every Genlib source and returns the exact next command. Run outline <id> to learn the API without reading source.',
  behavior: 'Search metadata, read one contract, plan, copy reviewed source, then test the consuming app. No overwrite, install hooks, package installation, or network calls.',
  directMcp: 'Read docs/mcp-server.md for Genlib’s own stdio and Streamable HTTP server. It is a separate opt-in package; mcp find searches the external MCP index.',
};

function argumentsFor(argv) {
  const args = { command: argv[0] ?? 'help', positional: [], options: {} };
  const allowed = new Set(['json', 'framework', 'limit', 'target', 'out', 'allow-unverified', 'type', 'project', 'harness', 'client', 'language', 'brief', 'path', 'stdlib-only', 'prompt', 'include-retired', 'license-policy', 'test', 'write', 'conflict', 'dry-run', 'accepts', 'list', 'style', 'sha256', 'keep-existing', 'from', 'baseline', 'ts-imports', 'agent', 'remove', 'all-tools', 'mode', 'transport', 'url', 'allow-install', 'raw', 'scope', 'profile']);
  for (let index = 1; index < argv.length; index++) {
    const value = argv[index];
    if (!value.startsWith('--')) { args.positional.push(value); continue; }
    const name = value.slice(2);
    invariant(allowed.has(name) && !Object.hasOwn(args.options, name), 'INVALID_OPTION', 'Unknown or duplicate option: ' + value);
    if (['json', 'allow-unverified', 'brief', 'stdlib-only', 'prompt', 'include-retired', 'write', 'dry-run', 'list', 'keep-existing', 'ts-imports', 'remove', 'all-tools', 'allow-install', 'raw'].includes(name)) args.options[name] = true;
    else {
      const next = argv[++index];
      invariant(next && !next.startsWith('--'), 'INVALID_OPTION', 'Missing value for ' + value);
      args.options[name] = next;
    }
  }
  return args;
}

try {
  const { command, positional, options } = argumentsFor(process.argv.slice(2));
  let result, text;
  const supported = {
    harness: ['target', 'mode', 'transport', 'url', 'allow-install', 'raw', 'scope', 'json'],
    help: [], '--help': [], list: ['json'], integration: ['target', 'out', 'allow-unverified', 'json'], capability: ['language', 'json'], jev: ['type', 'target', 'limit', 'json', 'stdlib-only', 'prompt', 'include-retired', 'license-policy'], find: ['type', 'project', 'target', 'limit', 'language', 'brief', 'json', 'include-retired', 'license-policy'], quick: ['type', 'target', 'language', 'json'], outline: ['language', 'json'], source: ['path', 'json'], skill: ['harness', 'limit', 'json'], mcp: ['client', 'limit', 'json'], cli: ['limit', 'json'], api: ['limit', 'language', 'json'], starter: ['limit', 'json'], task: ['limit', 'json'], detect: ['target', 'json'], catalog: ['json'], search: ['framework', 'limit', 'json'],
    inspect: ['json'], plan: ['target', 'out', 'allow-unverified', 'ts-imports', 'profile', 'json'],
    add: ['target', 'out', 'allow-unverified', 'ts-imports', 'profile', 'json'], verify: ['target', 'json'],
    schema: ['json'], adopted: ['target', 'test', 'accepts', 'json'], coverage: ['target', 'list', 'json'], provider: ['target', 'from', 'baseline', 'json'], connect: ['target', 'agent', 'all-tools', 'write', 'remove', 'json'], registry: ['target', 'style', 'sha256', 'keep-existing', 'dry-run', 'write', 'conflict', 'json'], update: ['target', 'write', 'conflict', 'json'], remove: ['target', 'dry-run', 'json'],
  };
  invariant(Object.hasOwn(supported, command), 'INVALID_COMMAND', 'Unknown command. Run genlib help.');
  invariant(Object.keys(options).every(option => supported[command].includes(option)),
    'INVALID_OPTION', 'An option does not apply to this command.');
  if (command === 'help' || command === '--help') result = HELP;
  else if (command === 'harness') {
    const [action, ...names] = positional;
    const actions = {
      list: ['json'],
      config: ['target', 'mode', 'transport', 'url', 'allow-install', 'raw', 'json'],
      install: ['target', 'scope', 'json'],
      doctor: ['target', 'mode', 'json'],
    };
    invariant(Object.hasOwn(actions, action), 'INVALID_OPTION', 'Use harness list|config|install|doctor.');
    invariant(Object.keys(options).every(option => actions[action].includes(option)), 'INVALID_OPTION', 'An option does not apply to this harness action.');
    invariant(names.length === (['config', 'install'].includes(action) ? 1 : 0), 'INVALID_OPTION', 'config/install take exactly one harness name; list/doctor take none.');
    invariant(!(options.raw && options.json), 'INVALID_OPTION', 'Choose --raw native config or --json metadata, not both.');
    if (action === 'list') result = { harnesses: listHarnesses() };
    else if (action === 'config') {
      result = await harnessConfiguration({ harness: names[0], target: options.target, mode: options.mode, transport: options.transport, url: options.url, allowInstall: options['allow-install'] === true });
      if (options.raw) text = result.content.trimEnd();
    } else if (action === 'install') {
      result = installSkills({ harness: names[0], target: options.target, scope: options.scope });
    } else {
      const { doctorHarness } = await import('../lib/harness-doctor.mjs');
      result = await doctorHarness({ target: options.target, mode: options.mode });
    }
  }
  else if (command === 'integration') {
    const [action, ...ids] = positional;
    const context = await loadIntegrationCatalog();
    if (action === 'list') {
      invariant(ids.length === 0 && Object.keys(options).every(key => key === 'json'), 'INVALID_OPTION', 'integration list takes no arguments.');
      result = { integrations: context.catalog.items.map(integrationSummary) };
    } else if (action === 'inspect') {
      invariant(ids.length === 1 && Object.keys(options).every(key => key === 'json'), 'INVALID_OPTION', 'integration inspect takes one ID.');
      result = await inspectIntegration(context, ids[0]);
    } else if (action === 'verify') {
      invariant(ids.length === 0 && options.target && Object.keys(options).every(key => ['target', 'json'].includes(key)), 'INVALID_OPTION', 'integration verify requires --target only.');
      result = await verifyIntegrations(options.target);
      if (result.status !== 'unchanged') process.exitCode = 1;
    } else {
      invariant(['plan', 'add'].includes(action) && ids.length === 1 && options.target, 'INVALID_OPTION', 'Use integration plan|add <id> --target <existing-project>.');
      result = await (action === 'plan' ? planIntegration : installIntegration)(context, ids[0], { target: options.target, out: options.out, allowUnverified: options['allow-unverified'] === true });
      if (result.conflicts.length > 0) process.exitCode = 1;
    }
  }
  else if (Object.hasOwn(INDEXES, command)) {
    const [action, ...words] = positional;
    const client = options.client ?? 'both';
    invariant(MCP_CLIENTS.includes(client), 'INVALID_OPTION', 'Client must be claude, codex or both.');
    const index = await loadIndex(command);
    if (action === 'find') {
      invariant(words.length > 0, 'INVALID_OPTION', `Provide words, for example: ${command} find github.`);
      invariant(options.limit === undefined || /^\d+$/.test(options.limit), 'INVALID_OPTION', 'Limit must be a whole number.');
      result = { [INDEXES[command].key]: searchIndex(command, index, words.join(' '), { limit: Number(options.limit ?? 8), client, ...(options.language ? { languages: [options.language] } : {}) }), ranking: index.ranking };
      text = formatIndexHits(command, result[INDEXES[command].key]);
    } else if (action === 'inspect') {
      invariant(words.length === 1, 'INVALID_OPTION', `Provide exactly one ${INDEXES[command].label} ID.`);
      const entry = index.entries.find(item => item.id === words[0]);
      invariant(entry, 'NOT_FOUND', `No ${INDEXES[command].label} named ${words[0]}. Run ${command} find first.`);
      // With a receiving language, API steps come from the same resolver as find (vendor SDKs, lifecycle).
      const resolved = command === 'api' && options.language ? resolveEntry(await loadSources(), 'api', entry.id, { languages: [options.language], frameworks: [] }) : null;
      result = { ...entry, install: resolved ? resolved.next.filter(step => !step.includes(' inspect ')) : installFor(command, entry, client, options.language ? [options.language] : undefined) };
    } else {
      invariant(false, 'INVALID_OPTION', `Use ${command} find <words> or ${command} inspect <id>.`);
    }
  } else if (command === 'capability') {
    const [action, ...words] = positional;
    const index = await loadCapabilities();
    const language = options.language;
    invariant(language === undefined || LANGUAGES.includes(language), 'INVALID_OPTION', 'Language must be one of: ' + LANGUAGES.join(', '));
    if (action === 'list') {
      invariant(words.length === 0 && !language, 'INVALID_OPTION', 'capability list takes no arguments.');
      result = { capabilities: index.capabilities.map(item => ({ id: item.id, title: item.title, tier: item.tier, ...coverage(item), guide: item.guide })), languages: LANGUAGES, review: index.review };
    } else if (action === 'inspect') {
      invariant(words.length === 1, 'INVALID_OPTION', 'Provide exactly one capability ID.');
      const item = index.capabilities.find(entry => entry.id === words[0]);
      invariant(item, 'NOT_FOUND', 'No capability named ' + words[0] + '. Run capability list first.');
      const languages = language ? [language] : LANGUAGES;
      const implementations = Object.fromEntries(languages.map(name => {
        const impl = item.implementations[name] ?? { kind: 'unavailable', note: 'Not indexed.' };
        // Structured, checkable steps only for the one language being adopted, to keep the all-languages view small.
        return [name, { ...impl, commands: commandsFor(impl), ...(language && impl.kind !== 'unavailable' ? stepsFor(impl) : {}) }];
      }));
      result = { ...item, ...coverage(item), implementations, review: index.review };
    } else {
      invariant(false, 'INVALID_OPTION', 'Use capability list or capability inspect <id> [--language <name>].');
    }
  } else if (command === 'skill') {
    const [action, ...words] = positional;
    const harness = options.harness ?? 'both';
    invariant(Object.hasOwn(HARNESSES, harness), 'INVALID_OPTION', 'Harness must be claude, codex or both.');
    const index = await loadSkills();
    if (action === 'find') {
      invariant(words.length > 0, 'INVALID_OPTION', 'Provide words, for example: skill find code review.');
      invariant(options.limit === undefined || /^\d+$/.test(options.limit), 'INVALID_OPTION', 'Limit must be a whole number.');
      result = { skills: searchSkills(index, words.join(' '), { limit: Number(options.limit ?? 8), harness }), review: index.review };
      text = formatIndexHits('skill', result.skills);
    } else if (action === 'inspect') {
      invariant(words.length === 1, 'INVALID_OPTION', 'Provide exactly one skill ID.');
      const skill = index.skills.find(item => item.id === words[0]);
      invariant(skill, 'NOT_FOUND', 'No skill named ' + words[0] + '. Run skill find first.');
      result = { ...skill, install: installCommand(skill, harness), review: index.review };
    } else {
      invariant(false, 'INVALID_OPTION', 'Use skill find <words> or skill inspect <id>.');
    }
  } else if (command === 'detect') {
    invariant(options.target && positional.length === 0, 'INVALID_OPTION', 'detect requires --target and no positional arguments.');
    result = await detectProject(options.target);
  } else if (command === 'jev') {
    invariant(positional.length > 0, 'INVALID_OPTION', 'Provide the task, for example: jev add passkey login to a Go API.');
    invariant(options.limit === undefined || /^\d+$/.test(options.limit), 'INVALID_OPTION', 'Limit must be a whole number.');
    const profile = options.target ? await detectProject(options.target) : undefined;
    result = jevPacket(await loadSources(), positional.join(' '), { type: options.type, target: profile?.target, profile, limit: Number(options.limit ?? 8), ...(options['stdlib-only'] ? { stdlibOnly: true } : {}), includeRetired: options['include-retired'] === true, licensePolicy: options['license-policy'] ?? 'any' });
    if (options.prompt) text = formatJevPrompt(result);
  } else if (command === 'outline') {
    invariant(positional.length === 1, 'INVALID_OPTION', 'Provide exactly one reference, for example: outline totp --language go.');
    result = await outline(undefined, positional[0], { language: options.language });
    text = formatOutline(result);
  } else if (command === 'source') {
    invariant(positional.length === 1, 'INVALID_OPTION', 'Provide exactly one reference, for example: source resource:pocketbase --path apis.');
    result = await sourcePlan(await loadSources(), positional[0], { path: options.path });
    text = formatSource(result);
  } else if (command === 'find' || command === 'quick' || command === 'catalog') {
    const sources = await loadSources();
    if (command === 'catalog') {
      invariant(positional.length === 0, 'INVALID_OPTION', 'catalog takes no positional arguments.');
      result = {
        counts: sourceCounts(sources),
        modules: sources.context.catalog.items.map(item => ({ id: item.id, kind: item.kind, frameworks: item.frameworks, description: item.description })),
        integrations: sources.integrations.map(integrationSummary),
        templates: sources.templates.map(({ id, phase, title, guide }) => ({ id, phase, title, guide })),
        next: 'Run find <task words> to rank all sources for a task.',
      };
    } else {
      invariant(positional.length > 0, 'INVALID_OPTION', 'Provide task words, for example: find verify stripe webhook.');
      invariant(options.limit === undefined || /^\d+$/.test(options.limit), 'INVALID_OPTION', 'Limit must be a whole number.');
      invariant(options.language === undefined || FIND_LANGUAGES.includes(options.language), 'INVALID_OPTION', 'Language must be one of: ' + FIND_LANGUAGES.join(', '));
      invariant(!options.brief || options.json, 'INVALID_OPTION', '--brief applies to --json output; text output is already brief.');
      const detected = options.target ? await detectProject(options.target) : undefined;
      // A named language acts like a detected project of that language.
      const profile = detected ?? (options.language ? { languages: [options.language], frameworks: [] } : undefined);
      result = findInSources(sources, positional.join(' '), {
        type: options.type, project: options.project, limit: command === 'quick' ? 4 : Number(options.limit ?? 8), target: detected?.target, profile,
        includeRetired: options['include-retired'] === true, licensePolicy: options['license-policy'] ?? 'any',
      });
      if (detected) result.project = { languages: detected.languages, frameworks: detected.frameworks, reactMajor: detected.reactMajor };
      if (command === 'quick') { result = await withDetails(quickPick(result, { contracts: loadContracts(REPOSITORY_ROOT) }), { outlineFn: (ref, language) => outline(REPOSITORY_ROOT, ref, { language }), moduleFn: id => JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, 'modules', id, 'module.json'), 'utf8')) }); text = formatQuick(result); }
      else if (options.brief || !options.json) { result = briefFind(result); text = formatBrief(result); }
    }
  } else if (command === 'verify') {
    invariant(options.target && positional.length === 0, 'INVALID_OPTION', 'verify requires --target and no module ID.');
    result = await verifyInstallation(options.target);
    if (result.status === 'drift') process.exitCode = 1;
  } else if (command === 'schema') {
    const names = ['quick', 'steps', 'plan', 'receipt', 'update', 'module', 'harness-config', 'harness-doctor'];
    invariant(positional.length <= 1 && (!positional[0] || names.includes(positional[0])), 'INVALID_OPTION', 'schema takes one of: ' + names.join(', '));
    result = positional[0]
      ? JSON.parse(readFileSync(new URL(`../schemas/${positional[0]}.schema.json`, import.meta.url), 'utf8'))
      : { schemas: names.map(name => ({ name, path: `schemas/${name}.schema.json` })) };
  } else if (command === 'adopted') {
    invariant(positional.length === 1 && options.target, 'INVALID_OPTION', 'Use adopted <id> --target <existing-project> [--test "<command>"].');
    const accepts = options.accepts ? options.accepts.split(',').map(key => key.trim()).filter(Boolean) : [];
    if (accepts.length) {
      const problems = acceptanceProblems(loadContracts(REPOSITORY_ROOT), positional[0], accepts);
      invariant(!problems.length, 'INVALID_OPTION', problems.join(' '));
    }
    result = await checkAdoption(options.target, positional[0], { test: options.test, accepts });
    if (!['used', 'verified'].includes(result.status) || result.outcomes.verified === false) process.exitCode = 1;
  } else if (command === 'registry') {
    const [action, spec, ...rest] = positional;
    invariant(['plan', 'add', 'verify', 'remove', 'update'].includes(action) && rest.length === 0 && options.target, 'INVALID_OPTION', 'Use registry plan|add <item> --target <app>, registry verify --target <app> or registry remove <id> --target <app>.');
    if (action === 'verify') {
      invariant(!spec, 'INVALID_OPTION', 'registry verify takes no item.');
      result = await verifyRegistry(options.target);
      if (result.status !== 'ok') process.exitCode = 1;
    } else if (action === 'update') {
      invariant(spec, 'INVALID_OPTION', 'registry update needs the artifact id, for example shadcn--button.');
      result = await updateRegistry(options.target, spec, { write: options.write === true, conflict: options.conflict ?? 'rej' });
      if (result.conflicts.length) process.exitCode = 1;
    } else if (action === 'remove') {
      invariant(spec, 'INVALID_OPTION', 'registry remove needs the artifact id, for example shadcn--button.');
      result = await removeRegistry(options.target, spec, { dryRun: options['dry-run'] === true });
    } else {
      invariant(spec && options['dry-run'] === undefined, 'INVALID_OPTION', `registry ${action} needs one item: shadcn:<name> or an https URL.`);
      const resolved = await resolveItems(spec, { style: options.style, sha256: options.sha256 });
      if (action === 'plan') {
        const { _writes, ...plan } = await planRegistry(options.target, resolved, { keepExisting: options['keep-existing'] === true });
        result = { ...plan, writes: false };
        if (plan.conflicts.length) process.exitCode = 1;
      } else result = await addRegistry(options.target, resolved, { keepExisting: options['keep-existing'] === true });
    }
  } else if (command === 'connect') {
    invariant(positional.length === 0 && options.target, 'INVALID_OPTION', 'Use connect --target <app> [--agent claude,cursor,...|all] [--all-tools] [--write] [--remove].');
    const agents = String(options.agent ?? 'claude').split(',').map(item => item.trim()).filter(Boolean);
    result = await connectAgents(path.resolve(REPOSITORY_ROOT), options.target, { targets: agents, write: options.write === true, remove: options.remove === true, allTools: options['all-tools'] === true });
    text = connectSummary(result);
    if (result.conflicts.length) process.exitCode = 1;
  } else if (command === 'provider') {
    const [action, id, ...rest] = positional;
    invariant(['list', 'inspect', 'check', 'plan', 'adopt'].includes(action) && rest.length === 0, 'INVALID_OPTION', 'Use provider list|inspect|check|plan|adopt.');
    const profiles = loadProviders(REPOSITORY_ROOT);
    if (action === 'list') result = { providers: profiles.map(providerSummary) };
    else {
      const profile = profiles.find(item => item.id === id);
      invariant(profile, 'NOT_FOUND', `No provider named ${id}. Run genlib provider list.`);
      if (action === 'inspect') result = profile;
      else if (action === 'check') {
        invariant(options.target, 'INVALID_OPTION', 'provider check needs --target <existing-project>.');
        result = await checkProvider(profile, options.target);
        text = [`${profile.id}: ${result.ready ? 'ready' : 'not ready'} (${options.target})`,
          ...result.results.map(item => `  ${item.ok ? 'ok  ' : item.severity === 'warning' ? 'warn' : 'FAIL'} ${item.id}: ${item.text} (${item.found})`),
          ...(result.ready ? [`# next: node "$GENLIB_ROOT"/bin/genlib.mjs provider inspect ${profile.id} --json, then run its steps in order`] : ['# fix the FAIL lines before adopting'])].join('\n');
        if (!result.ready) process.exitCode = 1;
      } else {
        invariant(options.target && options.from, 'INVALID_OPTION', `provider ${action} needs --from <scratch-copy> and --target <existing-project>.`);
        if (action === 'plan') {
          const { _writes, ...plan } = await planStaged(profile, options.from, options.target, { baseline: options.baseline });
          result = { ...plan, writes: false };
          if (plan.conflicts.length) process.exitCode = 1;
        } else result = await adoptStaged(profile, options.from, options.target, { baseline: options.baseline });
      }
    }
  } else if (command === 'coverage') {
    if (options.list) {
      invariant(positional.length === 0, 'INVALID_OPTION', 'coverage --list takes no task words.');
      const rows = loadContracts(REPOSITORY_ROOT).map(contract => contractCoverage(contract, { target: options.target }));
      result = { contracts: rows.map(({ contract, title, level, verified }) => ({ contract, title, level, verified })) };
      text = rows.map(row => `${row.level.padEnd(10)} ${row.verified.padStart(5)}  ${row.contract}`).join('\n');
    } else {
      invariant(positional.length > 0, 'INVALID_OPTION', 'Use coverage <task words> or coverage --list.');
      result = coverageFor(REPOSITORY_ROOT, positional.join(' '), { target: options.target });
      text = formatCoverage(result);
    }
  } else if (command === 'update' || command === 'remove') {
    invariant(positional.length === 1 && options.target, 'INVALID_OPTION', `Use ${command} <id> --target <existing-project>.`);
    const context = await loadCatalog();
    result = command === 'update'
      ? await updateModule(context, options.target, positional[0], { write: options.write === true, conflict: options.conflict ?? 'rej' })
      : await removeModule(context, options.target, positional[0], { dryRun: options['dry-run'] === true });
    if (command === 'update' && result.conflicts.length) process.exitCode = 1;
  } else {
    const context = await loadCatalog();
    if (command === 'list') {
      invariant(positional.length === 0, 'INVALID_OPTION', 'list takes no positional arguments.');
      result = { modules: context.catalog.items.map(item => ({ id: item.id, version: item.version, description: item.description, frameworks: item.frameworks, verification: item.verification })) };
    } else if (command === 'search') {
      invariant(positional.length > 0, 'INVALID_OPTION', 'Provide a search query.');
      result = { matches: searchCatalog(context.catalog, positional.join(' '), { framework: options.framework, limit: Number(options.limit ?? 5) }) };
    } else {
      invariant(positional.length === 1, 'INVALID_OPTION', 'Provide exactly one module ID.');
      if (command === 'inspect') result = await inspectModule(context, positional[0]);
      else {
        invariant(options.target, 'INVALID_OPTION', command + ' requires --target <existing-project>.');
        const operation = command === 'plan' ? planInstall : installModule;
        result = await operation(context, positional[0], {
          target: options.target, out: options.out, allowUnverified: options['allow-unverified'] === true,
          tsImports: options['ts-imports'] === true,
          ...(options.profile !== undefined ? { profiles: options.profile.split(',').map(name => name.trim()).filter(Boolean) } : {}),
        });
        text = formatInstall(result);
        if (result.conflicts.length > 0) process.exitCode = 1;
      }
    }
  }
  // Text output names this checkout's real path so commands run as printed; set GENLIB_ROOT to keep the placeholder.
  const shown = text !== undefined && !options.json && !process.env.GENLIB_ROOT ? text.replaceAll('"$GENLIB_ROOT"', JSON.stringify(fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, ''))) : text;
  process.stdout.write((shown !== undefined && !options.json ? shown : JSON.stringify(result, null, options.json ? 0 : 2)) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ error: error.message, code: error.code || 'ERROR' }) + '\n');
  process.exitCode = 1;
}
