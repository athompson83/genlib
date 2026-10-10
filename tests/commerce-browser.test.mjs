import assert from 'node:assert/strict';
import test from 'node:test';
import { createSaleorClient } from '../.build/modules/common-api-clients/files/saleor.js';
import { createSteelBrowserClient, SteelCleanupError } from '../.build/modules/common-api-clients/files/steel-browser.js';

const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const sampleSession = { id: 'session-1', status: 'live', websocketUrl: 'wss://connect.steel.dev/session-1' };

test('Saleor sends bounded variable-based catalog queries and validates pages', async () => {
  const calls = [];
  const client = createSaleorClient({ endpoint: 'https://shop.example.com/graphql/', token: () => 'test-token', fetch: async (url, init) => {
    calls.push({ url: String(url), init });
    return json({ data: { products: { edges: [{ node: { id: 'p1', name: 'Lamp', slug: 'lamp' } }], pageInfo: { hasNextPage: true, endCursor: 'cursor-2' } } } });
  } });
  const result = await client.listProducts({ channel: 'web', first: 10 });
  assert.equal(result.products[0].name, 'Lamp');
  assert.equal(result.pageInfo.endCursor, 'cursor-2');
  assert.equal(calls[0].url, 'https://shop.example.com/graphql/');
  assert.equal(calls[0].init.headers.get('authorization'), 'Bearer test-token');
  assert.deepEqual(JSON.parse(calls[0].init.body).variables, { channel: 'web', first: 10, after: null });
  await assert.rejects(client.listProducts({ channel: 'web', first: 101 }), { code: 'INVALID_INPUT' });
  assert.equal(calls.length, 1);
});

test('Saleor rejects GraphQL errors within HTTP success without leaking their messages', async () => {
  const client = createSaleorClient({ endpoint: 'https://shop.example.com/graphql', fetch: async () => json({ data: { product: null }, errors: [{ message: 'secret-token' }] }) });
  await assert.rejects(client.getProduct({ id: 'p1', channel: 'web' }), error => error.code === 'INVALID_RESPONSE' && !error.message.includes('secret-token'));
  const empty = createSaleorClient({ endpoint: 'https://shop.example.com/graphql', fetch: async () => json({ data: { product: null } }) });
  assert.equal(await empty.getProduct({ id: 'missing', channel: 'web' }), null);
  assert.throws(() => createSaleorClient({ endpoint: 'https://user:secret@shop.example.com/graphql/' }));
  assert.throws(() => createSaleorClient({ endpoint: 'https://shop.example.com/graphql/?key=secret' }));
});

test('Steel creates one bounded session and releases it after successful work', async () => {
  const operations = [], calls = [];
  const client = createSteelBrowserClient({ apiKey: () => 'test-steel-key', authorize: request => { operations.push(request); return true; }, fetch: async (url, init) => {
    calls.push({ url: String(url), init });
    return json(String(url).endsWith('/release') ? { success: true, message: 'done' } : sampleSession);
  } });
  assert.equal(await client.withSession({ timeoutMs: 60000 }, async value => value.id), 'session-1');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers.get('steel-api-key'), 'test-steel-key');
  assert.deepEqual(JSON.parse(calls[0].init.body), { timeout: 60000, dimensions: { width: 1280, height: 800 } });
  assert.equal(calls[1].url, 'https://api.steel.dev/v1/sessions/session-1/release');
  assert.deepEqual(operations, [{ operation: 'create', sessionId: null }, { operation: 'release', sessionId: 'session-1' }]);
});

test('Steel still cleans up after task error or caller cancellation', async () => {
  const signal = new AbortController();
  let released = false;
  const client = createSteelBrowserClient({ apiKey: () => 'test-key', authorize: () => true, fetch: async (url, init) => {
    if (String(url).endsWith('/release')) { released = true; assert.equal(init.signal.aborted, false); return json({ success: true }); }
    return json(sampleSession);
  } });
  const failure = new Error('Task failed');
  await assert.rejects(client.withSession({ timeoutMs: 60000, signal: signal.signal }, async () => { signal.abort(); throw failure; }), error => error === failure);
  assert.equal(released, true);
});

test('Steel retains the actual created ID when callback code attempts to change it', async () => {
  const urls = [];
  const client = createSteelBrowserClient({ apiKey: () => 'test-key', authorize: () => true, fetch: async url => {
    urls.push(String(url));
    return json(String(url).endsWith('/release') ? { success: true } : sampleSession);
  } });
  await client.withSession({ timeoutMs: 60000 }, async value => {
    assert.equal(Object.isFrozen(value), true);
    assert.equal(Reflect.set(value, 'id', 'another-session'), false);
  });
  assert.equal(urls[1], 'https://api.steel.dev/v1/sessions/session-1/release');
});

test('Steel releases a known session when creation response validation fails', async () => {
  const operations = [], urls = [];
  let worked = false;
  const client = createSteelBrowserClient({ apiKey: () => 'test-key', authorize: request => { operations.push(request); return true; }, fetch: async url => {
    urls.push(String(url));
    return json(String(url).endsWith('/release') ? { success: true } : { ...sampleSession, websocketUrl: 'invalid' });
  } });
  await assert.rejects(client.withSession({ timeoutMs: 60000 }, async () => { worked = true; }), { code: 'INVALID_RESPONSE' });
  assert.equal(worked, false);
  assert.equal(urls[1], 'https://api.steel.dev/v1/sessions/session-1/release');
  assert.deepEqual(operations, [{ operation: 'create', sessionId: null }, { operation: 'release', sessionId: 'session-1' }]);
});

test('Steel retains the known ID when cleanup of an invalid creation response fails', async () => {
  const client = createSteelBrowserClient({ apiKey: () => 'test-key', authorize: () => true, fetch: async url =>
    json(String(url).endsWith('/release') ? { success: false } : { ...sampleSession, websocketUrl: 'invalid-secret-value' }) });
  await assert.rejects(client.createSession({ timeoutMs: 60000 }), error =>
    error instanceof SteelCleanupError && error.sessionId === 'session-1' && error.phase === 'creation' &&
    error.taskFailed === false && !error.message.includes('invalid-secret-value'));
});

test('Steel rejects an unsafe ID in a creation response without targeting it for cleanup', async () => {
  let calls = 0;
  const client = createSteelBrowserClient({ apiKey: () => 'test-key', authorize: () => true, fetch: async () => {
    calls++; return json({ ...sampleSession, id: '../another-session' });
  } });
  await assert.rejects(client.createSession({ timeoutMs: 60000 }), { code: 'INVALID_RESPONSE' });
  assert.equal(calls, 1);
});

test('Steel reports uncertain cleanup and does not hide a failed task', async () => {
  const client = createSteelBrowserClient({ apiKey: () => 'test-key', authorize: () => true, fetch: async url => json(String(url).endsWith('/release') ? { success: false, message: 'secret' } : sampleSession) });
  await assert.rejects(client.withSession({ timeoutMs: 60000 }, async () => { throw new Error('failed'); }), error =>
    error instanceof SteelCleanupError && error.sessionId === 'session-1' && error.taskFailed === true && !error.message.includes('secret'));
});

test('Steel denies unauthorized operations before credentials or HTTP and rejects unsafe session IDs', async () => {
  let calls = 0;
  const client = createSteelBrowserClient({ apiKey: () => { calls++; return 'test-key'; }, authorize: () => false, fetch: async () => { calls++; return json(sampleSession); } });
  await assert.rejects(client.createSession({ timeoutMs: 60000 }), { code: 'DENIED' });
  await assert.rejects(client.releaseSession('../other'), { code: 'INVALID_INPUT' });
  assert.equal(calls, 0);
});
