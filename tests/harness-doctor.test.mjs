import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { doctorHarness } from '../lib/harness-doctor.mjs';

async function directory(t) {
  // macOS /var may itself be a symlink; fixtures deliberately use the real path.
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'genlib-doctor-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function fixture(t, source, mode = 'discovery') {
  const root = await directory(t);
  const entry = path.join(root, mode === 'sdk' ? 'packages/genlib-mcp/server.mjs' : 'bin/genlib-mcp.mjs');
  const pidFile = path.join(root, 'server.pid');
  await fs.mkdir(path.dirname(entry), { recursive: true });
  await fs.writeFile(entry, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(pidFile)}, String(process.pid));\n${source}`);
  return { root, entry, pidFile };
}

async function assertStopped(pidFile) {
  const pid = Number(await fs.readFile(pidFile, 'utf8'));
  assert.ok(Number.isInteger(pid) && pid > 0);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
}

const rpcFixture = behavior => `
import { createInterface } from 'node:readline';
const input = createInterface({ input: process.stdin });
input.on('line', line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  const reply = result => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');
  if (request.method === 'initialize') return reply({ protocolVersion: '2025-06-18', serverInfo: { name: 'genlib', version: '1' }, capabilities: { tools: {} } });
  ${behavior}
});
`;

test('doctor performs real dependency-free discovery calls and reports their limited scope', { timeout: 30000 }, async t => {
  const target = await directory(t);
  await fs.writeFile(path.join(target, 'package.json'), '{"name":"doctor-target","private":true}\n');
  const before = await fs.readFile(path.join(target, 'package.json'), 'utf8');
  const result = await doctorHarness({ mode: 'discovery', target });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.schema, 'genlib.harness-doctor/v1');
  assert.equal(result.status, 'verified');
  assert.equal(result.mode, 'discovery');
  assert.equal(result.transport, 'stdio');
  assert.equal(result.protocolVersion, '2025-06-18');
  assert.equal(result.readOnly, true);
  assert.equal(result.toolCount, result.toolNames.length);
  assert.ok(result.toolNames.includes('genlib_quick'));
  assert.ok(result.toolNames.includes('genlib_catalog'));
  assert.ok(!result.toolNames.includes('genlib_install'));
  assert.equal(result.sample.best, 'module:webhook-verification');
  assert.ok(result.counts.module > 0 && result.counts.resource > 0);
  assert.deepEqual(result.projectOperations, { supported: false, configured: false, status: 'unsupported' });
  assert.match(result.projectNote, /no scoped project detection tool/);
  assert.match(result.limitation, /no named harness client UI/);
  assert.ok(Number.isInteger(result.elapsedMs) && result.elapsedMs >= 0);
  assert.ok(JSON.stringify(result).length < 5000);
  assert.deepEqual(await fs.readdir(target), ['package.json']);
  assert.equal(await fs.readFile(path.join(target, 'package.json'), 'utf8'), before);
});

test('doctor rejects invalid options, missing paths, non-directories and symlink ancestors before launching', async t => {
  const root = await directory(t);
  const target = path.join(root, 'app');
  await fs.mkdir(target);
  const plainFile = path.join(root, 'file');
  await fs.writeFile(plainFile, 'unchanged');
  const link = path.join(root, 'linked');
  await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  await fs.mkdir(path.join(target, 'nested'));
  for (const value of ['relative', plainFile, link, path.join(link, 'nested'), root + '/app/../app']) {
    await assert.rejects(doctorHarness({ target: value, mode: 'discovery' }), { code: 'UNSAFE_PATH' });
  }
  await assert.rejects(doctorHarness({ target: path.join(root, 'missing') }), { code: 'TARGET_MISSING' });
  for (const mode of ['http', ['sdk'], null, 1]) await assert.rejects(doctorHarness({ mode }), { code: 'INVALID_OPTION' });
  for (const timeoutMs of [0, -1, 1.5, NaN, Infinity, 60001]) await assert.rejects(doctorHarness({ timeoutMs }), { code: 'INVALID_OPTION' });
  await assert.rejects(doctorHarness({ root, mode: 'discovery' }), { code: 'MCP_ENTRY_MISSING' });
  await fs.mkdir(path.join(root, 'bin'));
  await fs.symlink(plainFile, path.join(root, 'bin/genlib-mcp.mjs'));
  await assert.rejects(doctorHarness({ root, mode: 'discovery' }), { code: 'UNSAFE_PATH' });
  assert.equal(await fs.readFile(plainFile, 'utf8'), 'unchanged');
});

test('startup failures and missing SDK dependencies return actionable errors without stderr contents', async t => {
  const secret = 'DOCTOR_TEST_SECRET_DO_NOT_RETURN';
  const crashing = await fixture(t, `process.stderr.write(${JSON.stringify(secret)}); process.exitCode = 7;`);
  await assert.rejects(doctorHarness({ root: crashing.root, mode: 'discovery' }), error => {
    assert.equal(error.code, 'MCP_STARTUP_FAILED');
    assert.equal(error.details.exitCode, 7);
    assert.ok(error.details.stderrBytes > 0);
    assert.doesNotMatch(JSON.stringify(error), new RegExp(secret));
    assert.doesNotMatch(error.message, new RegExp(secret));
    return true;
  });
  await assertStopped(crashing.pidFile);
  const missing = await fixture(t, `await import('genlib-doctor-uninstalled-${secret.toLowerCase()}');`, 'sdk');
  await assert.rejects(doctorHarness({ root: missing.root }), error => {
    assert.equal(error.code, 'MCP_DEPENDENCIES_MISSING');
    assert.match(error.message, /pinned dependencies in packages\/genlib-mcp/);
    assert.ok(error.details.stderrBytes > 0);
    assert.doesNotMatch(JSON.stringify(error), new RegExp(secret.toLowerCase()));
    return true;
  });
  await assertStopped(missing.pidFile);
});

test('malformed and excessive responses stop and close the child without exposing process output', async t => {
  for (const [source, code] of [
    ['process.stdout.write("SECRET_NOT_JSON\\n"); setInterval(() => {}, 1000);', 'MCP_PROTOCOL_ERROR'],
    ['process.stdout.write("x".repeat(300 * 1024)); setInterval(() => {}, 1000);', 'MCP_OUTPUT_LIMIT'],
    ['process.stderr.write("x".repeat(70 * 1024)); setInterval(() => {}, 1000);', 'MCP_OUTPUT_LIMIT'],
  ]) {
    const { root, pidFile } = await fixture(t, source);
    await assert.rejects(doctorHarness({ root, mode: 'discovery' }), error => {
      assert.equal(error.code, code);
      assert.doesNotMatch(JSON.stringify(error), /SECRET_NOT_JSON/);
      return true;
    });
    await assertStopped(pidFile);
  }
});

test('doctor refuses exposed install tools and redacts JSON-RPC error messages', async t => {
  const writable = await fixture(t, rpcFixture(`
    if (request.method === 'tools/list') return reply({ tools: ['genlib_quick', 'genlib_catalog', 'genlib_install'].map(name => ({ name, inputSchema: { type: 'object' } })) });
  `));
  await assert.rejects(doctorHarness({ root: writable.root, mode: 'discovery' }), { code: 'MCP_WRITE_ENABLED' });
  await assertStopped(writable.pidFile);
  const rejected = await fixture(t, rpcFixture(`
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32603, message: 'PRIVATE_RPC_ERROR_TEXT' } }) + '\\n');
  `));
  await assert.rejects(doctorHarness({ root: rejected.root, mode: 'discovery' }), error => {
    assert.equal(error.code, 'MCP_RPC_ERROR');
    assert.equal(error.details.rpcCode, -32603);
    assert.doesNotMatch(JSON.stringify(error), /PRIVATE_RPC_ERROR_TEXT/);
    return true;
  });
  await assertStopped(rejected.pidFile);
});

test('timeout terminates even a child that ignores EOF and SIGTERM', { timeout: 10000 }, async t => {
  const { root, pidFile } = await fixture(t, `
    process.on('SIGTERM', () => {});
    process.stdin.resume();
    setInterval(() => {}, 1000);
  `);
  const started = Date.now();
  await assert.rejects(doctorHarness({ root, mode: 'discovery', timeoutMs: 500 }), error => {
    assert.equal(error.code, 'MCP_TIMEOUT');
    assert.equal(error.details.timeoutMs, 500);
    return true;
  });
  await assertStopped(pidFile);
  assert.ok(Date.now() - started < 5000);
});
