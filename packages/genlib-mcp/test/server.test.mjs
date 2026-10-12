import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { configuration, startHttp, LIMITS } from '../server.mjs';

const entry = fileURLToPath(new URL('../server.mjs', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const payload = result => result.structuredContent ?? JSON.parse(result.content[0].text);
const clientFor = mode => new Client({ name: 'genlib-integration-test', version: '1.0.0' }, { versionNegotiation: { mode } });

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genlib-mcp-'));
  const app = path.join(directory, 'app'), outside = path.join(directory, 'outside');
  await fs.mkdir(app); await fs.mkdir(outside);
  await fs.writeFile(path.join(app, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module', devDependencies: { typescript: '7.0.2' } }));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, app, outside };
}

async function stdio(t, args = [], mode = 'legacy') {
  const client = clientFor(mode);
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry, ...args], stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', data => { stderr += data.toString(); });
  t.after(async () => { await client.close(); assert.equal(stderr, '', 'stdout transport must not require diagnostic recovery'); });
  await client.connect(transport, { timeout: 15000 });
  return client;
}

for (const mode of ['legacy', { pin: '2026-07-28' }]) {
  const label = typeof mode === 'string' ? mode : mode.pin;
  test(`stdio ${label}: SDK client discovers tools/resources and receives bounded real results`, { timeout: 45000 }, async t => {
    const client = await stdio(t, [], mode);
    const tools = (await client.listTools()).tools;
    assert.ok(tools.some(item => item.name === 'genlib_search'));
    assert.ok(tools.every(item => item.name !== 'genlib_install'));
    assert.ok(tools.every(item => item.annotations.readOnlyHint === true));
    const resources = await client.listResources();
    assert.ok(resources.resources.some(item => item.uri === 'genlib://catalog'));
    assert.match((await client.readResource({ uri: 'genlib://guide/mcp' })).contents[0].text, /Connect directly to Genlib/);
    const catalog = payload(await client.callTool({ name: 'genlib_catalog', arguments: {} }));
    assert.ok(catalog.counts.resource > 4700);
    assert.equal(catalog.access.installEnabled, false);
    const result = await client.callTool({ name: 'genlib_search', arguments: { query: 'webhook verification', type: 'module', limit: 2 } });
    assert.notEqual(result.isError, true, JSON.stringify(payload(result)));
    assert.ok(payload(result).results.some(item => item.id === 'webhook-verification'));
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < LIMITS.responseBytes);
    const info = payload(await client.callTool({ name: 'genlib_inspect', arguments: { type: 'module', id: 'env-config' } }));
    assert.ok(info.contract.length > 0);
    const file = info.files[0].target;
    const page = payload(await client.callTool({ name: 'genlib_read_file', arguments: { kind: 'module', id: 'env-config', file, limit: 25 } }));
    assert.equal(page.content.length, 25); assert.equal(page.nextOffset, 25);
    const next = payload(await client.callTool({ name: 'genlib_read_file', arguments: { kind: 'module', id: 'env-config', file, offset: 25, limit: 25 } }));
    assert.equal(next.offset, 25); assert.equal(next.sha256, page.sha256);
    const denied = await client.callTool({ name: 'genlib_read_file', arguments: { kind: 'module', id: 'env-config', file: '../../.env' } });
    assert.equal(denied.isError, true); assert.equal(payload(denied).code, 'NOT_FOUND');
    const jev = payload(await client.callTool({ name: 'genlib_jev', arguments: { task: 'add passkey login in Go', limit: 3 } }));
    assert.equal(jev.schema, 'genlib.jev/v1'); assert.ok(jev.questions.length <= 3);
    const missingRoot = await client.callTool({ name: 'genlib_detect_project', arguments: {} });
    assert.equal(payload(missingRoot).code, 'PROJECT_ROOT_REQUIRED');
  });
}

test('write opt-in uses the existing installer, confines project access and preserves customized source', { timeout: 45000 }, async t => {
  const { app, outside } = await fixture(t);
  await fs.symlink(outside, path.join(app, 'escape'), 'dir');
  const client = await stdio(t, ['--project-root', app, '--allow-install']);
  const writable = (await client.listTools()).tools.find(item => item.name === 'genlib_install');
  assert.equal(writable.annotations.readOnlyHint, false);
  for (const project of ['../outside', outside, 'escape']) {
    const denied = await client.callTool({ name: 'genlib_detect_project', arguments: { project } });
    assert.equal(denied.isError, true); assert.equal(payload(denied).code, 'UNSAFE_PATH');
  }
  const args = { kind: 'module', id: 'env-config', project: '.' };
  const plan = payload(await client.callTool({ name: 'genlib_plan_install', arguments: args }));
  assert.equal(plan.conflicts.length, 0);
  await assert.rejects(fs.stat(path.join(app, '.genlib')), { code: 'ENOENT' });
  const installed = payload(await client.callTool({ name: 'genlib_install', arguments: args }));
  assert.equal(installed.status, 'installed');
  assert.equal(payload(await client.callTool({ name: 'genlib_install', arguments: args })).status, 'unchanged');
  const file = plan.files.find(item => !item.path.startsWith('.genlib/')).path;
  await fs.writeFile(path.join(app, file), 'application customization\n');
  const verified = payload(await client.callTool({ name: 'genlib_verify_installation', arguments: { kind: 'module', project: '.' } }));
  assert.equal(verified.status, 'drift');
  const failed = await client.callTool({ name: 'genlib_install', arguments: args });
  assert.equal(failed.isError, true);
  assert.equal(await fs.readFile(path.join(app, file), 'utf8'), 'application customization\n');
  assert.deepEqual(await fs.readdir(outside), []);
});

test('install plans honor module profiles and refuse unknown ones', { timeout: 30000 }, async t => {
  const { app } = await fixture(t);
  const client = await stdio(t, ['--project-root', app]);
  const plan = payload(await client.callTool({ name: 'genlib_plan_install', arguments: { kind: 'module', id: 'email-signup', project: '.', profiles: ['core', 'memory'] } }));
  assert.deepEqual(plan.profiles, ['core', 'memory']);
  const paths = plan.files.map(item => item.path);
  assert.ok(paths.some(item => item.endsWith('email-signup/memory-store.ts')));
  assert.ok(!paths.some(item => item.endsWith('email-signup/http.ts') || item.endsWith('email-signup/sql-store.ts')));
  const unknown = await client.callTool({ name: 'genlib_plan_install', arguments: { kind: 'module', id: 'email-signup', project: '.', profiles: ['nope'] } });
  assert.equal(unknown.isError, true);
});

for (const mode of ['legacy', { pin: '2026-07-28' }]) {
  const label = typeof mode === 'string' ? mode : mode.pin;
  test(`HTTP ${label}: real SDK requests require authentication and honor host/origin/body bounds`, { timeout: 30000 }, async t => {
    const token = 'test-only-bearer-token-with-at-least-32-characters';
    const running = await startHttp(await configuration(), { port: 0, token });
    const url = new URL(`http://127.0.0.1:${running.address.port}/mcp`);
    const client = clientFor(mode);
    t.after(async () => { await client.close(); await running.close(); });
    await client.connect(new StreamableHTTPClientTransport(url, { authProvider: { token: async () => token } }));
    assert.ok((await client.listTools()).tools.some(item => item.name === 'genlib_search'));
    const data = payload(await client.callTool({ name: 'genlib_search', arguments: { query: 'env config', type: 'module', limit: 1 } }));
    assert.equal(data.results[0].id, 'env-config');
    const post = (headers = {}, body = '{}') => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body });
    assert.equal((await post()).status, 401);
    assert.equal((await post({ authorization: 'Bearer wrong' })).status, 401);
    // Node fetch can normalize Host; use the native client to test the actual wire header.
    const rejectedHost = await new Promise((resolve, reject) => {
      const req = request(url, { method: 'POST', headers: { host: 'attacker.example', authorization: `Bearer ${token}`, 'content-type': 'application/json' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); req.end('{}');
    });
    assert.equal(rejectedHost, 403);
    assert.equal((await post({ authorization: `Bearer ${token}`, origin: 'https://attacker.example' })).status, 403);
    assert.equal((await post({ authorization: `Bearer ${token}` }, ' '.repeat(LIMITS.requestBytes + 1))).status, 413);
    assert.equal((await fetch(new URL('/other', url), { headers: { authorization: `Bearer ${token}` } })).status, 404);
  });
}

test('HTTP exposure requires an explicit host and strong token; installation requires a project root', async () => {
  const options = await configuration();
  await assert.rejects(startHttp(options, { host: '0.0.0.0', port: 0 }), { code: 'HTTP_AUTH_REQUIRED' });
  await assert.rejects(startHttp(options, { host: '0.0.0.0', port: 0, token: 'a'.repeat(40) }), { code: 'HTTP_AUTH_REQUIRED' });
  await assert.rejects(startHttp(options, { token: 'short' }), { code: 'INVALID_OPTION' });
  await assert.rejects(startHttp(options, { allowedHosts: ['*.example.com'] }), { code: 'INVALID_OPTION' });
  await assert.rejects(startHttp(options, { allowedOrigins: ['https://example.com/path'] }), { code: 'INVALID_OPTION' });
  await assert.rejects(configuration({ allowInstall: true }), { code: 'PROJECT_ROOT_REQUIRED' });
});

test('MCP integration plans, reads and verifies the generated pack registry', { timeout: 30000 }, async t => {
  const { app } = await fixture(t);
  const client = await stdio(t, ['--project-root', app, '--allow-install']);
  const id = 'resumable-files';
  const info = payload(await client.callTool({ name: 'genlib_inspect', arguments: { type: 'integration', id } }));
  assert.ok(info.files.length > 2, 'the integration registry must be generated before MCP tests');
  const contract = payload(await client.callTool({ name: 'genlib_read_file', arguments: { kind: 'integration', id, file: 'CONTRACT.md' } }));
  assert.match(contract.content, /[Rr]esum/);
  const args = { kind: 'integration', id, project: '.' };
  const plan = payload(await client.callTool({ name: 'genlib_plan_install', arguments: args }));
  assert.equal(plan.writes, false); assert.equal(plan.conflicts.length, 0);
  assert.equal(payload(await client.callTool({ name: 'genlib_install', arguments: args })).status, 'installed');
  assert.equal(payload(await client.callTool({ name: 'genlib_verify_installation', arguments: { kind: 'integration', project: '.' } })).status, 'unchanged');
});
