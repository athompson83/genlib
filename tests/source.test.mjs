import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSources } from '../lib/discover.mjs';
import { parseRepository, sourceCommands, sourcePlan } from '../lib/source.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [root + 'bin/genlib.mjs', ...args], { encoding: 'utf8' });

test('repository URLs split into clone URL, ref and path', () => {
  assert.deepEqual(parseRepository('https://github.com/o/r/tree/main/packages/x'), { host: 'github', owner: 'o', repo: 'r', clone: 'https://github.com/o/r', ref: 'main', path: 'packages/x' });
  assert.equal(parseRepository('https://github.com/o/r.git').clone, 'https://github.com/o/r');
  assert.equal(parseRepository('https://gitlab.com/g/sub/proj/-/tree/v1/src').path, 'src');
  assert.throws(() => parseRepository('git@github.com:o/r'), /https/);
});

test('pinned plans fetch one commit without blobs and check out only the path', () => {
  const sha = 'a'.repeat(40);
  const plan = sourceCommands({ repository: 'https://github.com/o/r', commit: sha, path: 'skills/x' });
  assert.match(plan.fetch[0], new RegExp(`fetch -q --depth 1 --filter=blob:none origin ${sha}$`));
  assert.match(plan.fetch[1], /sparse-checkout set --no-cone/);
  assert.equal(plan.raw, `https://raw.githubusercontent.com/o/r/${sha}/skills/x/<file>`);
  const unpinned = sourceCommands({ repository: 'https://github.com/o/r' });
  assert.equal(unpinned.commit, null);
  assert.match(unpinned.fetch[0], /^git ls-remote https:\/\/github\.com\/o\/r HEAD/);
  assert.throws(() => sourceCommands({ repository: 'https://github.com/o/r', path: '../etc' }), /inside the repository/);
});

test('source resolves any external record and names Genlib equivalents', async () => {
  const sources = await loadSources();
  const skill = await sourcePlan(sources, 'skill:find-skills');
  assert.match(skill.commit, /^[0-9a-f]{40}$/);
  assert.equal(skill.path, 'skills/find-skills');
  const svix = await sourcePlan(sources, 'svix');
  assert.equal(svix.ref, 'resource:svix');
  assert.deepEqual(svix.equivalents, ['capability:webhook-signature', 'module:webhook-verification']);
  await assert.rejects(sourcePlan(sources, 'no-such-record'), /No external record/);
  await assert.rejects(sourcePlan(sources, 'module:data-table'), /source supports/);
  // Equivalents appear first in ordinary search results too.
  const quick = cli('quick', 'svix', 'webhooks').stdout;
  assert.match(quick, /Genlib already has tested code for this: capability:webhook-signature/);
});

test('every equivalent points at an existing capability, module or template', async () => {
  const sources = await loadSources();
  const known = new Set([...sources.capabilities.map(c => 'capability:' + c.id), ...sources.context.catalog.items.map(m => 'module:' + m.id), ...sources.templates.map(t => 'template:' + t.id)]);
  const records = new Set([...sources.resources.map(r => 'resource:' + r.id), ...sources.starter.map(r => 'starter:' + r.id), ...sources.task.map(r => 'task:' + r.id)]);
  for (const [ref, targets] of Object.entries(sources.equivalents)) {
    assert.ok(records.has(ref), 'equivalent key exists: ' + ref);
    for (const target of targets) assert.ok(known.has(target), `${ref} -> ${target}`);
  }
});

test('CLI and MCP expose source with compact text', () => {
  const text = cli('source', 'resource:pocketbase', '--path', 'apis').stdout;
  assert.match(text, /sparse-checkout set apis/);
  assert.ok(text.length < 900, 'source output stays compact');
  assert.equal(cli('source', 'a', 'b').status, 1);
  const list = execFileSync(process.execPath, [root + 'bin/genlib-mcp.mjs'], { input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n', encoding: 'utf8' });
  assert.ok(JSON.parse(list).result.tools.some(tool => tool.name === 'genlib_source'));
});
