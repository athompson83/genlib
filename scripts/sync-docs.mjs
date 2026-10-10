#!/usr/bin/env node
// Regenerates the marked count and catalog blocks in README.md and docs/resources/README.md
// from the real catalogs, so documentation cannot drift. `--check` fails instead of writing.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadSources, sourceCounts } from '../lib/discover.mjs';
import { loadProjectTypes } from '../lib/resources.mjs';
import { LANGUAGES } from '../lib/capabilities.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: node scripts/sync-docs.mjs [--check]');

const sources = await loadSources(root);
const counts = sourceCounts(sources);
const types = await loadProjectTypes(root);
// Tested implementations behind the capabilities (one per capability and language that has code).
const capabilityImplementations = JSON.parse(readFileSync(root + 'resources/capabilities.json', 'utf8')).capabilities
  .reduce((sum, capability) => sum + Object.values(capability.implementations).filter(item => item.kind !== 'unavailable').length, 0);

// Group resources by the catalog file that holds them.
const catalogs = [];
for (const path of ['resources/attachments.json', 'resources/ui-foundations.json']) catalogs.push(path);
const { readdirSync } = await import('node:fs');
for (const name of readdirSync(root + 'resources/catalog').sort()) catalogs.push('resources/catalog/' + name);
const rows = catalogs.map(path => {
  const items = JSON.parse(readFileSync(root + path, 'utf8')).items;
  const guides = [...new Set(items.map(item => item.genlib.guide))];
  const categories = Object.entries(items.reduce((map, item) => ({ ...map, [item.category]: (map[item.category] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([name]) => name);
  return { path, count: items.length, guide: guides.length === 1 ? guides[0] : null, categories };
});

const link = (target, from) => {
  const depth = from.split('/').length - 1;
  return '../'.repeat(depth) + target;
};
const sourcesBlock = from => [
  '| Source | Count | What it is |',
  '| --- | ---: | --- |',
  `| [Capabilities](#capabilities-one-task-every-language) | ${counts.capability} (${capabilityImplementations} implementations) | SSO, MFA, auth, PDF, documents, forms, CSV, money, IDs, retries, rate limits, semver, cron, geo, webhooks, check digits, signed URLs, map tiles, polylines, geometry, email, durations, safe redirects and more, each with tested code in up to ${LANGUAGES.length} languages (the count in brackets is the total of tested implementations) |`,
  `| [Modules](#modules) | ${counts.module} | Complete components (UI shell, data table, forms, API clients, config, logging, resilience, rate limits, webhooks, health checks, security headers), each versioned, hash-verified and installed with \`plan\` / \`add\` / \`verify\` |`,
  `| [TypeScript recipes](#recipes-language-examples-and-templates) | ${counts.recipe} | Single-file, strictly compiled and tested TypeScript sources copied with one command (the refactoring and workflow recipes are a separate index below) |`,
  `| [Language examples](#recipes-language-examples-and-templates) | ${counts['language-example']} | The same patterns in Python, Go, Rust, Java, Kotlin, C#, Dart and Swift |`,
  `| [Project templates](#recipes-language-examples-and-templates) | ${counts.template} | Project, GitHub, docs, ship/release and UI-selection starters |`,
  `| [Project starters](#install-indexes-skills-mcp-servers-clis-and-apis) | ${counts.starter} | Ranked project templates and boilerplates in every major language (GitHub templates, cookiecutters, create-* CLIs, dotnet new packs, generators), each one pinned command |`,
  `| [Refactoring and workflow recipes](#install-indexes-skills-mcp-servers-clis-and-apis) | ${counts.task} | OpenRewrite migration, upgrade and security recipes with pinned Maven/Gradle commands, plus n8n and Activepieces workflow templates and other runnable recipes |`,
  `| [Code-navigation tools](#find-code-without-reading-the-whole-repository) | ${counts.tool} | Repository map, AST graph, task context and Mermaid diagram |`,
  `| [Agent skills](#install-indexes-skills-mcp-servers-clis-and-apis) | ${counts.skill} | Claude Code and Codex skills, ranked by installs and installable in one commit-pinned command |`,
  `| [MCP servers](#install-indexes-skills-mcp-servers-clis-and-apis) | ${counts.mcp} | Top MCP servers by downloads plus hosted servers, wired with one \`claude mcp add\` / \`codex mcp add\` |`,
  `| [CLIs](#install-indexes-skills-mcp-servers-clis-and-apis) | ${counts.cli} | Top Homebrew CLIs by install requests, one \`brew install\` each |`,
  `| [APIs](#install-indexes-skills-mcp-servers-clis-and-apis) | ${counts.api} | Top OpenAPI-described APIs with official SDK or one-command typed client |`,
  `| [External resources](#resource-catalog) | ${counts.resource} | Link- and license-checked records for open-source libraries, services and apps (including SEO, AI optimization, marketing, social media, dashboards, scheduling/calendar, chat/messaging, popular open-source tools with the products they replace, finance/accounting, business tools, educator tools, AI agent tools and learning references, in 12 languages) across ${types.length} [project types](${link('resources/project-types.json', from)}) |`,
  `| [Documentation sections](#jev-and-the-search-index) | ${counts.doc} | Every README, AGENTS, CONTRIBUTING and docs section, returned with the exact line range to read |`,
].join('\n');
const catalogBlock = from => [
  '| Catalog | Records | Guide | Main categories |',
  '| --- | ---: | --- | --- |',
  ...rows.map(row => `| [\`${row.path.replace('resources/', '')}\`](${link(row.path, from)}) | ${row.count} | ${row.guide ? `[${row.guide.split('/').at(-1)}](${link(row.guide, from)})` : 'several'} | ${row.categories.join(', ')} |`),
  `| **Total** | **${counts.resource}** | | |`,
].join('\n');
const perType = Object.fromEntries(types.map(type => [type.id, 0]));
for (const item of sources.resources) for (const type of item.projectTypes ?? []) perType[type]++;
const typesBlock = [
  '| Project type | Records | Covers |',
  '| --- | ---: | --- |',
  ...types.map(type => `| \`${type.id}\` | ${perType[type.id]} | ${type.summary} |`),
].join('\n');

// Capability x language matrix: "tested" or "lib" when code ships, "-" when the guide documents the gap.
const LABELS = { typescript: 'TS', python: 'Py', go: 'Go', rust: 'Rust', java: 'Java', kotlin: 'Kotlin', csharp: 'C#', dart: 'Dart', swift: 'Swift' };
const capabilitiesBlock = from => [
  `| Capability | Tier | ${LANGUAGES.map(language => LABELS[language]).join(' | ')} | Guide |`,
  `| --- | --- | ${LANGUAGES.map(() => ':---:').join(' | ')} | --- |`,
  ...sources.capabilities.map(capability => `| \`${capability.id}\` ${capability.title} | ${capability.tier} | ${LANGUAGES.map(language => {
    const impl = capability.implementations[language];
    return !impl || impl.kind === 'unavailable' ? '-' : impl.tested ? 'yes' : 'untested';
  }).join(' | ')} | [${capability.guide.split('/').at(-1)}](${link(capability.guide, from)}) |`),
].join('\n');

const files = {
  'README.md': { sources: sourcesBlock('README.md'), catalog: catalogBlock('README.md'), capabilities: capabilitiesBlock('README.md') },
  'docs/capabilities.md': { capabilities: capabilitiesBlock('docs/capabilities.md') },
  'docs/resources/README.md': { catalog: catalogBlock('docs/resources/README.md'), types: typesBlock },
};
const stale = [];
for (const [file, blocks] of Object.entries(files)) {
  const original = readFileSync(root + file, 'utf8');
  let text = original;
  for (const [name, body] of Object.entries(blocks)) {
    const pattern = new RegExp(`(<!-- genlib:${name}:start -->)[\\s\\S]*?(<!-- genlib:${name}:end -->)`);
    if (!pattern.test(text)) throw new Error(`${file} is missing the genlib:${name} markers.`);
    text = text.replace(pattern, `$1\n${body}\n$2`);
  }
  if (text !== original) {
    stale.push(file);
    if (!check) writeFileSync(root + file, text);
  }
}
process.stdout.write(JSON.stringify({ mode: check ? 'check' : 'sync', counts, stale }, null, 2) + '\n');
if (check && stale.length) process.exitCode = 1;
