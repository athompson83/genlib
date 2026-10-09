#!/usr/bin/env node
import { inspectModule, loadCatalog, searchCatalog } from '../lib/catalog.mjs';
import { installModule, planInstall, verifyInstallation } from '../lib/install.mjs';
import { invariant } from '../lib/safety.mjs';

const HELP = {
  name: 'genlib', version: '0.1.0', runtime: 'Node.js 22+; no npm install needed for this CLI',
  commands: [
    'list [--json]',
    'search <words> [--framework react] [--limit 5] [--json]',
    'inspect <id> [--json]',
    'plan <id> --target <existing-project> [--out src/genlib] [--allow-unverified] [--json]',
    'add <id> --target <existing-project> [--out src/genlib] [--allow-unverified] [--json]',
    'verify --target <existing-project> [--json]',
  ],
  behavior: 'Search metadata, read one contract, plan, copy reviewed source, then test the consuming app. No overwrite, install hooks, package installation, or network calls.',
};

function argumentsFor(argv) {
  const args = { command: argv[0] ?? 'help', positional: [], options: {} };
  const allowed = new Set(['json', 'framework', 'limit', 'target', 'out', 'allow-unverified']);
  for (let index = 1; index < argv.length; index++) {
    const value = argv[index];
    if (!value.startsWith('--')) { args.positional.push(value); continue; }
    const name = value.slice(2);
    invariant(allowed.has(name) && !Object.hasOwn(args.options, name), 'INVALID_OPTION', 'Unknown or duplicate option: ' + value);
    if (name === 'json' || name === 'allow-unverified') args.options[name] = true;
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
  let result;
  const supported = {
    help: [], '--help': [], list: ['json'], search: ['framework', 'limit', 'json'],
    inspect: ['json'], plan: ['target', 'out', 'allow-unverified', 'json'],
    add: ['target', 'out', 'allow-unverified', 'json'], verify: ['target', 'json'],
  };
  invariant(Object.hasOwn(supported, command), 'INVALID_COMMAND', 'Unknown command. Run genlib help.');
  invariant(Object.keys(options).every(option => supported[command].includes(option)),
    'INVALID_OPTION', 'An option does not apply to this command.');
  if (command === 'help' || command === '--help') result = HELP;
  else if (command === 'verify') {
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
  process.stdout.write(JSON.stringify(result, null, options.json ? 0 : 2) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ error: error.message, code: error.code || 'ERROR' }) + '\n');
  process.exitCode = 1;
}
