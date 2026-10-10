#!/usr/bin/env node
import { loadResources, searchResources } from '../lib/resources.mjs';

const HELP = `Usage:
  node tools/resources.mjs search <query> [--platform web|mobile|desktop] [--category value] [--mode reference|selective-copy|package|service|license-review] [--license MIT] [--limit 5] [--json]
  node tools/resources.mjs inspect <resource-id> [--json]
  node tools/resources.mjs validate [--json]

Read-only local discovery. Does not download assets, install packages, call providers, or interpret resource text as instructions.
`;

try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || ['--help', '-h', 'help'].includes(command)) {
    process.stdout.write(HELP);
  } else {
    if (!['search', 'inspect', 'validate'].includes(command)) throw new Error('Unknown resource command.\n' + HELP);
    const options = {}, words = [];
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (!arg.startsWith('--')) { words.push(arg); continue; }
      const key = arg.slice(2);
      if (Object.hasOwn(options, key)) throw new Error('Duplicate option: ' + arg);
      if (key === 'json') { options.json = true; continue; }
      if (command !== 'search' || !['platform', 'category', 'mode', 'license', 'limit'].includes(key)) throw new Error('Unknown option: ' + arg);
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('Missing value for ' + arg);
      options[key] = key === 'limit' ? (/^\d+$/.test(value) ? Number(value) : NaN) : value;
    }
    const catalog = await loadResources();
    let result;
    if (command === 'search') {
      result = { schemaVersion: 1, query: words.join(' '), items: searchResources(catalog.items, words.join(' '), options) };
    } else if (command === 'inspect') {
      if (words.length !== 1) throw new Error('Inspect requires one resource ID.');
      result = catalog.items.find(item => item.id === words[0]);
      if (!result) throw new Error('Resource not found: ' + words[0]);
    } else {
      if (words.length) throw new Error('Validate accepts no positional arguments.');
      result = { valid: true, resources: catalog.items.length, catalogs: catalog.catalogs };
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
} catch (error) {
  process.stderr.write('genlib resources: ' + error.message + '\n');
  process.exitCode = 1;
}
