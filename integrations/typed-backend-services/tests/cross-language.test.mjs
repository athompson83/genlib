// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {inventoryRpcServer, fixtureAuthorization} from '../.test-build/connect/server.js';
import {memoryRepository} from '../.test-build/connect/repository.js';
import {inventoryNodeClient} from '../.test-build/connect/client-node.js';
import {fixture, runConformance} from './conformance.mjs';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const binary = fileURLToPath(new URL('../connect-go/.test-bin/inventory-fixture', import.meta.url));
const fixturePath = fileURLToPath(new URL('./conformance.json', import.meta.url));

async function stop(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise(resolve => child.once('close', resolve));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  try { await closed; } finally { clearTimeout(timer); }
}

async function goServer(t) {
  // This is a binary built from this pack's fixture source, with an argument array
  // and no shell. The fixture binds only an ephemeral 127.0.0.1 listener.
  const child = spawn(binary, ['serve', '--fixture', fixturePath], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  t.after(() => stop(child));
  let output = '';
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8192); });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Go fixture startup timed out')); }, 10_000);
    const fail = error => { clearTimeout(timer); reject(error); };
    child.once('error', fail);
    child.once('exit', code => fail(new Error(`Go fixture exited ${code}: ${stderr}`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 8192) {
        child.kill('SIGKILL');
        fail(new Error('Go fixture startup output exceeded its bound'));
      } else if (output.includes('\n')) {
        clearTimeout(timer);
        try {
          const {baseUrl} = JSON.parse(output.slice(0, output.indexOf('\n')));
          const url = new URL(baseUrl);
          assert.equal(url.protocol, 'http:');
          assert.equal(url.hostname, '127.0.0.1');
          assert.ok(url.port);
          resolve(baseUrl);
        } catch (error) { fail(error); }
      }
    });
  });
}

test('generated Go client passes the shared cases against the TypeScript service', {timeout: 25_000}, async () => {
  const server = inventoryRpcServer({repository: memoryRepository(), authorize: fixtureAuthorization(fixture.token)});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const {stdout} = await execute(binary, ['check', '--base-url', baseUrl, '--fixture', fixturePath], {cwd: root, timeout: 20_000, maxBuffer: 16 * 1024});
    assert.deepEqual(JSON.parse(stdout), {created: fixture.create.length, pages: fixture.pages.length, errors: fixture.errors.length});
    const client = inventoryNodeClient(baseUrl, async () => fixture.token);
    const stored = await client.listItems({pageSize: 100});
    assert.deepEqual(stored.items.map(item => item.title), fixture.create.map(item => item.expectedTitle));
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('generated TypeScript client passes the shared cases against the Go service', {timeout: 25_000}, async t => {
  const baseUrl = await goServer(t);
  const result = await runConformance(token => inventoryNodeClient(baseUrl, async () => token));
  assert.deepEqual(result, {created: fixture.create.length, pages: fixture.pages.length, errors: fixture.errors.length});
});
