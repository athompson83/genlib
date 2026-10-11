#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { inspectModule, loadCatalog, searchCatalog } from '../lib/catalog.mjs';
import { installModule, planInstall, verifyInstallation } from '../lib/install.mjs';
import { detectProject, findInSources, loadSources, resolveEntry, sourceCounts } from '../lib/discover.mjs';
import { invariant } from '../lib/safety.mjs';
import { HARNESSES, installCommand, loadSkills, searchSkills, skillSummary } from '../lib/skills.mjs';
import { INDEXES, MCP_CLIENTS, installFor, loadIndex, searchIndex, summarize } from '../lib/indexes.mjs';
import { LANGUAGES, commandsFor, coverage, stepsFor, loadCapabilities } from '../lib/capabilities.mjs';
import { formatJevPrompt, jevPacket } from '../lib/jev.mjs';
import { briefFind, formatBrief, formatIndexHits, formatQuick, quickPick } from '../lib/brief.mjs';
import { integrationSummary, inspectIntegration, installIntegration, loadIntegrationCatalog, planIntegration, verifyIntegrations } from '../lib/integrations.mjs';
import { formatOutline, outline } from '../lib/outline.mjs';
import { formatSource, sourcePlan } from '../lib/source.mjs';

// Languages a task can name: the nine capability languages plus the resource-only ones.
const FIND_LANGUAGES = [...LANGUAGES, 'ruby', 'php', 'elixir'];

const HELP = {
  name: 'genlib', version: '0.2.0', runtime: 'Node.js 22+; no npm install needed for this CLI',
  commands: [
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
    'plan <id> --target <existing-project> [--out src/genlib] [--allow-unverified] [--json]',
    'add <id> --target <existing-project> [--out src/genlib] [--allow-unverified] [--json]',
    'verify --target <existing-project> [--json]',
  ],
  start: 'Run quick (or find) with the task first: it searches every Genlib source and returns the exact next command. Run outline <id> to learn the API without reading source.',
  behavior: 'Search metadata, read one contract, plan, copy reviewed source, then test the consuming app. No overwrite, install hooks, package installation, or network calls.',
  directMcp: 'Read docs/mcp-server.md for Genlib’s own stdio and Streamable HTTP server. It is a separate opt-in package; mcp find searches the external MCP index.',
};

function argumentsFor(argv) {
  const args = { command: argv[0] ?? 'help', positional: [], options: {} };
  const allowed = new Set(['json', 'framework', 'limit', 'target', 'out', 'allow-unverified', 'type', 'project', 'harness', 'client', 'language', 'brief', 'path', 'stdlib-only', 'prompt', 'include-retired', 'license-policy']);
  for (let index = 1; index < argv.length; index++) {
    const value = argv[index];
    if (!value.startsWith('--')) { args.positional.push(value); continue; }
    const name = value.slice(2);
    invariant(allowed.has(name) && !Object.hasOwn(args.options, name), 'INVALID_OPTION', 'Unknown or duplicate option: ' + value);
    if (name === 'json' || name === 'allow-unverified' || name === 'brief' || name === 'stdlib-only' || name === 'prompt' || name === 'include-retired') args.options[name] = true;
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
    help: [], '--help': [], list: ['json'], integration: ['target', 'out', 'allow-unverified', 'json'], capability: ['language', 'json'], jev: ['type', 'target', 'limit', 'json', 'stdlib-only', 'prompt', 'include-retired', 'license-policy'], find: ['type', 'project', 'target', 'limit', 'language', 'brief', 'json', 'include-retired', 'license-policy'], quick: ['type', 'target', 'language', 'json'], outline: ['language', 'json'], source: ['path', 'json'], skill: ['harness', 'limit', 'json'], mcp: ['client', 'limit', 'json'], cli: ['limit', 'json'], api: ['limit', 'language', 'json'], starter: ['limit', 'json'], task: ['limit', 'json'], detect: ['target', 'json'], catalog: ['json'], search: ['framework', 'limit', 'json'],
    inspect: ['json'], plan: ['target', 'out', 'allow-unverified', 'json'],
    add: ['target', 'out', 'allow-unverified', 'json'], verify: ['target', 'json'],
  };
  invariant(Object.hasOwn(supported, command), 'INVALID_COMMAND', 'Unknown command. Run genlib help.');
  invariant(Object.keys(options).every(option => supported[command].includes(option)),
    'INVALID_OPTION', 'An option does not apply to this command.');
  if (command === 'help' || command === '--help') result = HELP;
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
      if (command === 'quick') { result = quickPick(result); text = formatQuick(result); }
      else if (options.brief || !options.json) { result = briefFind(result); text = formatBrief(result); }
    }
  } else if (command === 'verify') {
    invariant(options.target && positional.length === 0, 'INVALID_OPTION', 'verify requires --target and no module ID.');
    result = await verifyInstallation(options.target);
    if (result.status === 'drift') process.exitCode = 1;
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
        });
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
