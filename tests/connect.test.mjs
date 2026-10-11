// SPDX-License-Identifier: Apache-2.0
// genlib connect: project-scoped MCP entries and guidance blocks for coding agents; dry run by default, conflicts
// never overwritten, removal limited to what Genlib wrote.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { REPOSITORY_ROOT } from '../lib/catalog.mjs';
import { connectAgents, GUIDANCE } from '../lib/connect.mjs';

const GENLIB = path.resolve(REPOSITORY_ROOT);
async function app(t) {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'genlib-connect-'));
  t.after(() => fs.rm(target, { recursive: true, force: true }));
  await fs.writeFile(path.join(target, 'package.json'), '{"name":"app"}\n');
  return target;
}
const read = (target, file) => fs.readFile(path.join(target, file), 'utf8');
const exists = (target, file) => fs.stat(path.join(target, file)).then(() => true, () => false);

test('dry run writes nothing; --write adds entries and blocks next to existing settings and text', async t => {
  const target = await app(t);
  await fs.writeFile(path.join(target, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } }, extra: 1 }));
  await fs.writeFile(path.join(target, 'AGENTS.md'), '# Rules\n\nUse pnpm.\n');
  const plan = await connectAgents(GENLIB, target, { targets: ['all'] });
  assert.equal(plan.write, false);
  assert.deepEqual(plan.conflicts, []);
  assert.equal(await exists(target, 'CLAUDE.md'), false, 'dry run writes nothing');
  assert.match(plan.commands[0], /^codex mcp add genlib -- node ".*bin\/genlib-mcp\.mjs" --tools quick,outline$/, 'Codex is given a command, its user config is never edited');

  const done = await connectAgents(GENLIB, target, { targets: ['all'], write: true });
  assert.equal(done.write, true);
  const mcp = JSON.parse(await read(target, '.mcp.json'));
  assert.deepEqual(mcp.mcpServers.other, { command: 'x' });
  assert.equal(mcp.extra, 1);
  assert.deepEqual(mcp.mcpServers.genlib, { type: 'stdio', command: 'node', args: [path.join(GENLIB, 'bin/genlib-mcp.mjs'), '--tools', 'quick,outline'] });
  assert.equal(JSON.parse(await read(target, '.vscode/mcp.json')).servers.genlib.type, 'stdio');
  assert.deepEqual(JSON.parse(await read(target, 'opencode.json')).mcp.genlib.command, ['node', path.join(GENLIB, 'bin/genlib-mcp.mjs'), '--tools', 'quick,outline']);
  const agents = await read(target, 'AGENTS.md');
  assert.ok(agents.startsWith('# Rules\n\nUse pnpm.\n'));
  assert.ok(agents.includes(GUIDANCE));
  assert.match(await read(target, '.cursor/rules/genlib.mdc'), /^---\ndescription: /);
  assert.ok((await read(target, 'CLAUDE.md')).includes('Skip Genlib when the task fully specifies a small app feature'), 'guidance says when not to use Genlib');

  const again = await connectAgents(GENLIB, target, { targets: ['all'] });
  assert.equal(again.changed, 0, 'a second run changes nothing');
  assert.ok(again.files.every(file => file.action === 'unchanged'));
});

test('an existing unmanaged genlib entry, JSONC, invalid JSON and broken markers are conflicts, and nothing is written', async t => {
  const target = await app(t);
  await fs.writeFile(path.join(target, '.mcp.json'), JSON.stringify({ mcpServers: { genlib: { command: 'node', args: ['/elsewhere/genlib-mcp.mjs'] } } }));
  await fs.writeFile(path.join(target, 'opencode.jsonc'), '{ // comment\n}\n');
  await fs.mkdir(path.join(target, '.cursor'));
  await fs.writeFile(path.join(target, '.cursor/mcp.json'), '{ not json');
  await fs.writeFile(path.join(target, 'CLAUDE.md'), 'x\n<!-- GENLIB_START -->\nno end\n');
  const result = await connectAgents(GENLIB, target, { targets: ['claude', 'cursor', 'opencode'], write: true });
  assert.equal(result.write, false);
  assert.equal(result.conflicts.length, 4, result.conflicts.join('\n'));
  assert.match(result.conflicts.join('\n'), /\.mcp\.json: an existing genlib entry differs/);
  assert.match(result.conflicts.join('\n'), /opencode\.jsonc: JSONC is not edited/);
  assert.match(result.conflicts.join('\n'), /\.cursor\/mcp\.json: not valid JSON/);
  assert.match(result.conflicts.join('\n'), /CLAUDE\.md: .*unbalanced/);
  assert.equal(await exists(target, 'AGENTS.md'), false, 'no partial writes');
  assert.equal(JSON.parse(await read(target, '.mcp.json')).mcpServers.genlib.args[0], '/elsewhere/genlib-mcp.mjs');
  await assert.rejects(connectAgents(GENLIB, target, { targets: ['windsurf'] }), /Unknown target windsurf/);
  await assert.rejects(connectAgents(GENLIB, GENLIB, { targets: ['claude'] }), /outside the Genlib checkout/);
});

test('remove deletes only what Genlib wrote and keeps edited entries and other text', async t => {
  const target = await app(t);
  await fs.writeFile(path.join(target, 'AGENTS.md'), '# Rules\n');
  await connectAgents(GENLIB, target, { targets: ['claude', 'cursor', 'codex'], write: true });
  // The user edits the Cursor entry; Genlib must not remove it.
  const cursor = JSON.parse(await read(target, '.cursor/mcp.json'));
  cursor.mcpServers.genlib.args.push('--extra');
  await fs.writeFile(path.join(target, '.cursor/mcp.json'), JSON.stringify(cursor));
  const blocked = await connectAgents(GENLIB, target, { targets: ['claude', 'cursor', 'codex'], remove: true, write: true });
  assert.match(blocked.conflicts.join('\n'), /\.cursor\/mcp\.json: the genlib entry was not written by Genlib or was edited/);
  assert.equal(await exists(target, '.mcp.json'), true, 'a conflict stops the whole removal');

  const removed = await connectAgents(GENLIB, target, { targets: ['claude', 'codex'], remove: true, write: true });
  assert.deepEqual(removed.conflicts, []);
  assert.equal(await exists(target, '.mcp.json'), false, 'a file Genlib created and emptied is deleted');
  assert.equal(await exists(target, 'CLAUDE.md'), false);
  assert.equal(await read(target, 'AGENTS.md'), '# Rules\n', 'the block is removed and the rest kept');
  assert.deepEqual(removed.commands, ['codex mcp remove genlib']);
  const record = JSON.parse(await read(target, '.genlib/connections.json'));
  assert.deepEqual(Object.keys(record.entries).sort(), ['.cursor/mcp.json#genlib', '.cursor/rules/genlib.mdc#block']);
});

test('the written .mcp.json starts a working Genlib MCP server', async t => {
  const target = await app(t);
  await connectAgents(GENLIB, target, { targets: ['claude'], write: true });
  const entry = JSON.parse(await read(target, '.mcp.json')).mcpServers.genlib;
  const child = spawn(entry.command, entry.args, { cwd: target, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', chunk => { out += chunk; });
  for (const request of [
    { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
    { method: 'notifications/initialized' }, { id: 2, method: 'tools/list' },
  ]) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...request }) + '\n');
  child.stdin.end();
  await new Promise(resolve => child.on('close', resolve));
  const replies = out.trim().split('\n').map(line => JSON.parse(line));
  const tools = replies.find(reply => reply.id === 2).result.tools.map(tool => tool.name);
  assert.deepEqual(tools, ['genlib_quick', 'genlib_outline'], 'the lean default registers only quick and outline');
});

test('--all-tools registers every tool and replaces an entry Genlib wrote earlier', async t => {
  const target = await app(t);
  await connectAgents(GENLIB, target, { targets: ['claude'], write: true });
  const full = await connectAgents(GENLIB, target, { targets: ['claude', 'codex'], write: true, allTools: true });
  assert.deepEqual(full.conflicts, []);
  assert.deepEqual(JSON.parse(await read(target, '.mcp.json')).mcpServers.genlib.args, [path.join(GENLIB, 'bin/genlib-mcp.mjs')]);
  assert.match(full.commands[0], /genlib-mcp\.mjs"$/);
});
