import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { ZipReader, BlobReader, TextWriter } from '@zip.js/zip.js';
import { createZip, streamZip, safeArchivePath } from '../.build/archive.js';
import { assertFile, assertUploadUrl, resumeFingerprint } from '../.build/policy.js';
import { createTusUpload } from '../.build/tus-upload.js';
import { handleTusdHook, authorizeTusResource } from '../.build/tusd-hooks.server.js';

const policy = { endpoint: 'https://uploads.example.test/files/', scope: 'tenant-a/user-a', maxFileBytes: 100, maxFiles: 2 };

test('upload policies prevent foreign resume URLs, credential URLs, and tenant fingerprint collisions', async () => {
  assert.throws(() => assertUploadUrl('https://elsewhere.test/files/id', policy));
  assert.throws(() => assertUploadUrl('https://uploads.example.test/files/../private', policy));
  assert.throws(() => assertUploadUrl('https://uploads.example.test/files/%2e%2e%2fprivate', policy));
  assert.throws(() => assertUploadUrl('https://x:y@uploads.example.test/files/id', policy));
  assert.throws(() => assertFile({ name: 'big', size: 101, type: 'text/plain' }, policy));
  const file = new File(['report'], 'report.txt', { type: 'text/plain', lastModified: 100 });
  assert.notEqual(await resumeFingerprint(file, policy), await resumeFingerprint(file, { ...policy, scope: 'tenant-b/user-b' }));
});

test('real zip.js round trip and streamed output preserve names and file bytes', async () => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/archive.json', import.meta.url), 'utf8'));
  const files = fixture.map(file => ({ path: file.path, data: new Blob([file.content]) }));
  const blob = await createZip(files);
  const reader = new ZipReader(new BlobReader(blob));
  const entries = await reader.getEntries();
  assert.deepEqual(entries.map(entry => entry.filename), fixture.map(file => file.path));
  for (let index = 0; index < entries.length; index++) assert.equal(await entries[index].getData(new TextWriter()), fixture[index].content);
  await reader.close();
  const chunks = [];
  await streamZip(files, new WritableStream({ write(chunk) { chunks.push(chunk); } }));
  assert.ok(new Blob(chunks).size > 100);
});

test('archive preflight rejects traversal, normalized duplicates, quotas, and cancellation', async () => {
  for (const path of ['../secret', '/etc/file', 'C:/file', 'a\\b', 'a//b', 'a/..', 'bad.', 'CON.txt', 'bad?.txt']) assert.throws(() => safeArchivePath(path));
  await assert.rejects(createZip([{ path: 'A', data: new Blob() }, { path: 'a', data: new Blob() }]), /Duplicate/);
  await assert.rejects(createZip([{ path: 'a', data: new Blob() }, { path: 'a/b', data: new Blob() }]), /collision/);
  await assert.rejects(createZip([{ path: 'a', data: new Blob(['123']) }], { maxInputBytes: 2 }), /limit/);
  await assert.rejects(createZip([{ path: 'a', data: new Blob(['x']) }], { signal: AbortSignal.abort() }));
});

test('real tus client resumes with HEAD offset and fresh authorization per request', { timeout: 10_000 }, async t => {
  let bytes = Buffer.from('abc'), requests = [], port;
  const server = createServer(async (request, response) => {
    requests.push(request.method);
    assert.equal(request.headers.authorization, 'Bearer test-only-token');
    response.setHeader('Tus-Resumable', '1.0.0');
    if (request.method === 'HEAD') {
      response.writeHead(200, { 'Upload-Offset': bytes.length, 'Upload-Length': 6 }); response.end();
    } else if (request.method === 'PATCH') {
      assert.equal(Number(request.headers['upload-offset']), bytes.length);
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      bytes = Buffer.concat([bytes, ...chunks]);
      response.writeHead(204, { 'Upload-Offset': bytes.length }); response.end();
    } else { response.writeHead(400); response.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); port = server.address().port;
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${port}/files/`;
  let authorizations = 0, removed = false;
  const done = new Promise((resolve, reject) => {
    const controller = createTusUpload(new File(['abcdef'], 'fixture.txt'), {
      policy: { ...policy, endpoint, allowLocalHttp: true },
      getHeaders: async () => { authorizations++; return { Authorization: 'Bearer test-only-token' }; },
      choosePrevious: async previous => { assert.equal(previous.length, 1); return 0; },
      transport: {
        chunkSize: 3,
        // Node's tus entrypoint reads Buffers; browsers use its built-in Blob reader.
        fileReader: { async openFile(file) { return {
          size: file.size,
          async slice(start, end) { return { value: Buffer.from(await file.slice(start, end).arrayBuffer()), done: start >= file.size }; },
          close() {},
        }; } },
        urlStorage: {
          findAllUploads: async () => [],
          findUploadsByFingerprint: async () => [
            { size: 6, metadata: {}, creationTime: new Date().toISOString(), urlStorageKey: 'valid', uploadUrl: `${endpoint}id`, parallelUploadUrls: null },
            { size: 6, metadata: {}, creationTime: new Date().toISOString(), urlStorageKey: 'foreign', uploadUrl: 'https://evil.example/files/id', parallelUploadUrls: null },
          ],
          addUpload: async () => 'valid',
          removeUpload: async () => { removed = true; },
        },
      },
      onComplete: resolve,
      onError: reject,
    });
    t.after(() => controller.dispose());
    controller.start().catch(reject);
  });
  assert.equal(await done, `${endpoint}id`);
  assert.equal(bytes.toString(), 'abcdef');
  assert.deepEqual(requests, ['HEAD', 'PATCH']);
  assert.equal(authorizations, 2);
  assert.equal(removed, true);
});

test('tusd pre-create reserves an owned opaque ID and replaces client-controlled ownership metadata', async () => {
  const hook = JSON.parse(await readFile(new URL('../fixtures/tusd-hook.json', import.meta.url), 'utf8'));
  let reservation;
  const adapters = { maxFileBytes: 100, principal: async () => ({ tenantId: 'tenant-a', subjectId: 'user-a' }), reserve: async input => { reservation = input; return { id: 'upload_100' }; }, owns: async () => false, completed: async () => {}, released: async () => {} };
  const response = await handleTusdHook(hook, adapters);
  assert.equal(reservation.principal.tenantId, 'tenant-a'); assert.equal(response.ChangeFileInfo.ID, 'upload_100');
  assert.deepEqual(response.ChangeFileInfo.MetaData, { filename: 'report.txt', filetype: 'text/plain' });
  assert.equal((await handleTusdHook(hook, { ...adapters, principal: async () => null })).RejectUpload, true);
  hook.Event.Upload.Size = 101; assert.equal((await handleTusdHook(hook, adapters)).RejectUpload, true);
});

test('tusd gateway and termination guard deny foreign owners; completion rejects incomplete bytes', async () => {
  const adapters = { maxFileBytes: 100, principal: async () => ({ tenantId: 'tenant-b', subjectId: 'user-b' }), reserve: async () => ({ id: 'upload_100' }),
    owns: async principal => principal.tenantId === 'tenant-a', completed: async () => {}, released: async () => {} };
  assert.equal(await authorizeTusResource({ tenantId: 'tenant-b', subjectId: 'user-b' }, 'upload_100', adapters), false);
  const hook = { Type: 'pre-terminate', Event: { Upload: { ID: 'upload_100', Size: 6, Offset: 6 } } };
  assert.equal((await handleTusdHook(hook, adapters)).RejectTermination, true);
  await assert.rejects(handleTusdHook({ ...hook, Type: 'post-finish', Event: { Upload: { ID: 'upload_100', Size: 6, Offset: 3 } } }, adapters), /mismatch/);
});
