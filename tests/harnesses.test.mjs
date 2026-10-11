import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { harnessConfiguration, listHarnesses, skillTargets } from '../lib/harnesses.mjs';
import { installSkills } from '../scripts/install-skills.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'genlib-harness-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
const config = (harness, options = {}) => harnessConfiguration({ harness, root, ...options });

test('requested harnesses have documented profiles and Ollama is explicitly a runtime', () => {
  const profiles = listHarnesses();
  for (const id of ['openclaw', 'hermes', 'antigravity', 'vscode', 'cursor', 'opencode', 'ollama', 'claude', 'codex', 'generic']) {
    const profile = profiles.find(item => item.id === id);
    assert.ok(profile, id);
    assert.ok(profile.sources.every(url => url.startsWith('https://')));
    assert.equal(profile.validation.harnessAcceptance, 'not-run');
  }
  assert.equal(profiles.find(item => item.id === 'ollama').kind, 'model-runtime');
});

test('stdio profiles use each host schema and absolute executable/entry paths', async (t) => {
  const target = temporary(t);
  const entry = path.join(root, 'packages/genlib-mcp/server.mjs');
  const expected = [entry, '--project-root', target];
  const cursor = await config('cursor', { target });
  assert.deepEqual(cursor.config.mcpServers.genlib, { type: 'stdio', command: process.execPath, args: expected });
  assert.equal(cursor.locations.project, path.join(target, '.cursor/mcp.json'));
  const vscode = await config('vs-code', { target });
  assert.deepEqual(vscode.config.servers.genlib, cursor.config.mcpServers.genlib);
  const antigravity = await config('antigravity', { target });
  assert.deepEqual(antigravity.config.mcpServers.genlib, { command: process.execPath, args: expected });
  assert.equal(antigravity.locations.project, path.join(target, '.agents/mcp_config.json'));
  assert.equal(antigravity.locations.user, '~/.gemini/config/mcp_config.json');
  const openclaw = await config('openclaw', { target });
  assert.deepEqual(openclaw.config.mcp.servers.genlib, { command: process.execPath, args: expected });
  const opencode = await config('opencode', { target });
  assert.deepEqual(opencode.config.mcp.genlib, { type: 'local', command: [process.execPath, ...expected], enabled: true });
  assert.equal(opencode.config.$schema, 'https://opencode.ai/config.json');
  assert.deepEqual(fs.readdirSync(target), [], 'config generation writes no project or host settings');
});

test('native TOML and YAML fragments retain argument boundaries including spaces and quotes', async (t) => {
  const base = temporary(t);
  const target = path.join(base, process.platform === 'win32' ? 'application with spaces' : 'application with spaces and "quotes"');
  fs.mkdirSync(target);
  const codex = await config('codex', { target });
  assert.equal(codex.format, 'toml');
  assert.match(codex.content, /^\[mcp_servers\.genlib\]\n/);
  assert.deepEqual(JSON.parse(codex.content.match(/^args = (.+)$/m)[1]), [path.join(root, 'packages/genlib-mcp/server.mjs'), '--project-root', target]);
  const hermes = await config('hermes', { target });
  assert.equal(hermes.format, 'yaml');
  assert.match(hermes.content, /^mcp_servers:\n  genlib:\n/);
  assert.deepEqual(JSON.parse(hermes.content.match(/^    args: (.+)$/m)[1]), codex.config.mcp_servers.genlib.args);
});

test('HTTP profiles name Streamable HTTP correctly and never imply a client grants remote writes', async () => {
  const url = 'https://genlib.example/mcp';
  const options = { transport: 'http', url };
  assert.deepEqual((await config('openclaw', options)).config.mcp.servers.genlib, { url, transport: 'streamable-http' });
  assert.deepEqual((await config('antigravity', options)).config.mcpServers.genlib, { serverUrl: url });
  assert.deepEqual((await config('vscode', options)).config.servers.genlib, { type: 'http', url });
  assert.deepEqual((await config('roo', options)).config.mcpServers.genlib, { type: 'streamable-http', url });
  assert.deepEqual((await config('opencode', options)).config.mcp.genlib, { type: 'remote', url, enabled: true });
  assert.deepEqual((await config('hermes', options)).config.mcp_servers.genlib, { url });
  assert.deepEqual((await config('codex', options)).config.mcp_servers.genlib, { url });
  for (const bad of [undefined, 'file:///tmp/mcp', 'http://public.example/mcp', 'https://user:secret@example.com/mcp', 'https://example.com/mcp?token=secret', 'https://example.com/mcp#fragment']) {
    await assert.rejects(config('cursor', { transport: 'http', url: bad }), /URL|endpoint|HTTPS/);
  }
  await assert.doesNotReject(config('cursor', { transport: 'http', url: 'http://127.0.0.1:7331/mcp' }));
  await assert.rejects(config('cursor', { ...options, allowInstall: true }), /startup|remote|stdio/);
});

test('discovery and write opt-in are explicit, with no invented npm package', async (t) => {
  const target = temporary(t);
  const discovery = await config('cursor', { target, mode: 'discovery' });
  assert.deepEqual(discovery.config.mcpServers.genlib.args, [path.join(root, 'bin/genlib-mcp.mjs')]);
  assert.deepEqual(discovery.setup, []);
  assert.equal(discovery.access.projectOperations, 'unscoped-read-only');
  assert.ok(discovery.notes.some(note => /target.*does not.*scope/i.test(note)));
  const write = await config('cursor', { target, allowInstall: true });
  assert.ok(write.config.mcpServers.genlib.args.includes('--allow-install'));
  assert.equal(write.access.installEnabled, true);
  assert.equal((await config('cursor', { target })).access.installEnabled, false);
  await assert.rejects(config('cursor', { allowInstall: true }), /project|target/);
  await assert.rejects(config('cursor', { target, mode: 'discovery', allowInstall: true }), /discovery|SDK/);
  await assert.rejects(config('cursor', { mode: 'discovery', transport: 'http', url: 'https://example.com/mcp' }), /discovery|SDK/);
  await assert.rejects(config('cursor', { url: 'https://example.com/mcp' }), /http|transport/);
});

test('configuration rejects host interpolation and native-format control characters before emission', async (t) => {
  const base = temporary(t);
  const unsafe = ['${GENLIB_CONFIG_ROOT}', '{env:PROJECT_ROOT}', '{file:project-root.txt}', 'bad\u007fpath', 'bad\u0085path', 'bad\u009fpath'];
  for (const name of unsafe) {
    const target = path.join(base, name);
    if (process.platform !== 'win32') fs.mkdirSync(target);
    for (const harness of ['codex', 'hermes', 'opencode', 'ollama']) {
      await assert.rejects(config(harness, { target }), /absolute|interpolation|control/, harness + ': ' + name);
    }
  }
});

test('configuration rejects symlinked server entry ancestors', { skip: process.platform === 'win32' }, async (t) => {
  for (const relative of ['bin', 'packages', 'packages/genlib-mcp']) {
    const checkout = temporary(t);
    const destination = path.join(checkout, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.symlinkSync(path.join(root, relative), destination, 'dir');
    await assert.rejects(config('cursor', { root: checkout, mode: relative === 'bin' ? 'discovery' : 'sdk' }), /symlink|Symbolic|unsafe/i);
  }
});

test('Ollama is configured through its documented OpenCode host and generic MCP has no invented settings path', async (t) => {
  const target = temporary(t);
  const ollama = await config('ollama', { target });
  assert.equal(ollama.harness, 'opencode');
  assert.equal(ollama.requestedHarness, 'ollama');
  assert.equal(ollama.runtime, 'ollama');
  assert.deepEqual(ollama.launch, { command: 'ollama', args: ['launch', 'opencode'] });
  assert.equal(ollama.locations.project, path.join(target, 'opencode.json'));
  assert.equal(JSON.stringify(ollama).includes('.ollama/mcp'), false);
  const generic = await config('generic', { target });
  assert.deepEqual(generic.locations, { project: null, user: null });
  assert.equal(generic.config.command, process.execPath);
});

test('installer supports portable project and explicit personal scope without duplicating shared directories', (t) => {
  const target = temporary(t);
  fs.writeFileSync(path.join(target, 'AGENTS.md'), 'Keep project rules');
  const all = installSkills({ target, harness: 'all' });
  assert.deepEqual(all.targets.map(item => path.relative(target, item.directory)).sort(), ['.agents/skills/genlib-use', '.claude/skills/genlib-use', '.cline/skills/genlib-use']);
  assert.equal(new Set(all.targets.map(item => item.directory)).size, all.targets.length);
  for (const harness of ['openclaw', 'hermes', 'antigravity', 'vscode', 'cursor', 'opencode', 'roo', 'generic', 'ollama']) {
    assert.equal(installSkills({ target, harness }).filesWritten, 0, harness);
  }
  assert.equal(fs.readFileSync(path.join(target, 'AGENTS.md'), 'utf8'), 'Keep project rules');
  assert.equal(fs.existsSync(path.join(target, '.cursor/mcp.json')), false);
  const home = temporary(t);
  for (const [harness, relative] of [['hermes', '.hermes/skills/genlib-use'], ['antigravity', '.gemini/config/skills/genlib-use'], ['openclaw', '.openclaw/skills/genlib-use']]) {
    const result = installSkills({ target: home, harness, scope: 'user' });
    assert.equal(result.targets[0].directory, path.join(home, relative));
    assert.ok(fs.existsSync(path.join(home, relative, 'SKILL.md')));
  }
});

test('profile/skill selection rejects invalid options before writes and all preflights conflicts', (t) => {
  const target = temporary(t);
  for (const harness of ['unknown', '__proto__', '../cursor']) assert.throws(() => skillTargets(target, harness), /harness/i);
  assert.throws(() => installSkills({ target, harness: 'cursor', scope: '../home' }), /scope/i);
  installSkills({ target, harness: 'cline' });
  const modified = path.join(target, '.cline/skills/genlib-use/SKILL.md');
  fs.writeFileSync(modified, 'Custom instructions');
  assert.throws(() => installSkills({ target, harness: 'all' }), /modified skill/);
  assert.equal(fs.existsSync(path.join(target, '.agents')), false);
  assert.equal(fs.existsSync(path.join(target, '.claude')), false);
  assert.equal(fs.readFileSync(modified, 'utf8'), 'Custom instructions');
});

test('public harness CLI produces raw native config, installs skill, and rejects inapplicable arguments', (t) => {
  const target = temporary(t);
  const run = args => spawnSync(process.execPath, [path.join(root, 'bin/genlib.mjs'), 'harness', ...args], { encoding: 'utf8' });
  const configured = run(['config', 'cursor', '--target', target, '--raw']);
  assert.equal(configured.status, 0, configured.stderr);
  assert.equal(JSON.parse(configured.stdout).mcpServers.genlib.command, process.execPath);
  const installed = run(['install', 'hermes', '--target', target]);
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(JSON.parse(installed.stdout).targets[0].directory, path.join(target, '.agents/skills/genlib-use'));
  for (const args of [['list', '--allow-install'], ['install', 'cursor', '--target', target, '--mode', 'sdk'], ['config', 'cursor', '--scope', 'user'], ['config', 'cursor', '--raw', '--json'], ['config', 'cursor', '--target', 'relative'], ['config', 'cursor', 'extra']]) {
    assert.equal(run(args).status, 1, JSON.stringify(args));
  }
});
