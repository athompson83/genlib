// SPDX-License-Identifier: Apache-2.0
// webhook-delivery: Standard Webhooks signing (checked with the webhook-verification module's verifier), secret
// rotation, retries with exponential backoff and jitter, dead-lettering and replay, stable webhook-id, per-attempt
// AbortSignal timeouts, capped response reads, the SSRF guard (URL syntax, non-canonical IPv4, resolved private
// addresses at registration and send time, manual redirects), tenant-scoped authorization, lease reclaim and the
// Fetch endpoint-management adapter. Fake fetch, fake resolver and a fake clock: no network, no real timers.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWebhookDelivery, WebhookDeliveryError, exponentialJitterBackoff,
} from '../.build/modules/webhook-delivery/files/core.js';
import { MemoryWebhookStore } from '../.build/modules/webhook-delivery/files/memory-store.js';
import { signWebhook, generateWebhookSecret } from '../.build/modules/webhook-delivery/files/signing.js';
import { checkWebhookUrl, isPublicIp, parseIp, guardWebhookUrl } from '../.build/modules/webhook-delivery/files/ssrf.js';
import { createWebhookEndpointsHandler } from '../.build/modules/webhook-delivery/files/http.js';
import { verifyStandardWebhook } from '../.build/modules/webhook-verification/files/providers.js';

const ADMIN = { id: 'u-admin', tenants: ['acme'] };
const OTHER = { id: 'u-other', tenants: ['globex'] };
const VIEWER = { id: 'u-viewer', tenants: ['acme'], readOnly: true };

function setup(extra = {}) {
  let now = 1_700_000_000_000;
  let ids = 0;
  const calls = [];
  const responses = [];
  const dns = {
    'hooks.example.com': ['93.184.216.34'],
    'other.example.com': ['93.184.216.35', '2606:2800:220:1:248:1893:25c8:1946'],
    'private.example.com': ['10.0.0.5'],
    'mixed.example.com': ['93.184.216.34', '127.0.0.1'],
  };
  const fetch = async (url, init, context) => {
    calls.push({ url, init, context });
    const next = responses.length ? responses.shift() : new Response('ok', { status: 200 });
    if (typeof next === 'function') return next(url, init, context);
    if (next instanceof Error) throw next;
    return next;
  };
  const authorizeCalls = [];
  const authorize = (actor, tenantId, action) => {
    authorizeCalls.push([actor?.id, tenantId, action]);
    return Boolean(actor?.tenants?.includes(tenantId) && (!actor.readOnly || action.endsWith(':read')));
  };
  const store = new MemoryWebhookStore();
  const delivery = createWebhookDelivery({
    store, fetch, resolveHost: async host => dns[host] ?? [], authorize,
    now: () => now, random: () => 0.5, newId: () => 'id' + ++ids,
    backoff: { baseMs: 1000, maxMs: 60_000 }, ...extra,
  });
  return { delivery, store, calls, responses, dns, authorizeCalls, advance: ms => { now += ms; }, at: () => now };
}

async function endpointAndEvent(env, input = {}) {
  const created = await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://hooks.example.com/in', ...input });
  const [queued] = await env.delivery.enqueue({ tenantId: 'acme', eventId: 'evt-1', type: 'order.paid', data: { order: 7 } });
  return { created, queued };
}

// ---------- signing ----------

test('signWebhook produces Standard Webhooks headers that the webhook-verification module accepts', async () => {
  const secret = generateWebhookSecret();
  assert.match(secret, /^whsec_[A-Za-z0-9+/]{43}=$/);
  const body = '{"type":"order.paid","data":{"x":1}}';
  const headers = await signWebhook({ id: 'msg_1', timestamp: 1_700_000_000, body, secrets: [secret] });
  assert.equal(headers['webhook-id'], 'msg_1');
  assert.equal(headers['webhook-timestamp'], '1700000000');
  assert.match(headers['webhook-signature'], /^v1,[A-Za-z0-9+/]{43}=$/);
  const clock = () => 1_700_000_000_000;
  assert.deepEqual(await verifyStandardWebhook({ secret, payload: body, headers, clock }), { ok: true });
  assert.deepEqual(await verifyStandardWebhook({ secret, payload: body + ' ', headers, clock }), { ok: false, reason: 'mismatch' });
  assert.deepEqual(await verifyStandardWebhook({ secret: generateWebhookSecret(), payload: body, headers, clock }), { ok: false, reason: 'mismatch' });
  await assert.rejects(signWebhook({ id: 'msg_1', timestamp: 1, body, secrets: [] }), TypeError);
  await assert.rejects(signWebhook({ id: 'msg_1', timestamp: 1, body, secrets: ['whsec_###'] }), TypeError);
  await assert.rejects(signWebhook({ id: 'bad id', timestamp: 1, body, secrets: [secret] }), TypeError);
});

test('worker delivers the exact stored body with a signature verified by the webhook-verification module', async () => {
  const env = setup();
  const { created, queued } = await endpointAndEvent(env);
  assert.equal(queued.status, 'pending');
  const summary = await env.delivery.runOnce({ workerId: 'w1' });
  assert.deepEqual(summary, { claimed: 1, succeeded: 1, retried: 0, dead: 0, lostLease: 0 });
  assert.equal(env.calls.length, 1);
  const { url, init, context } = env.calls[0];
  assert.equal(url, 'https://hooks.example.com/in');
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'manual');
  assert.ok(init.signal instanceof AbortSignal);
  assert.deepEqual(context.addresses, ['93.184.216.34']);
  assert.equal(init.headers['content-type'], 'application/json');
  assert.equal(init.headers['webhook-id'], queued.id);
  assert.deepEqual(JSON.parse(init.body), { type: 'order.paid', timestamp: new Date(env.at()).toISOString(), data: { order: 7 } });
  const verified = await verifyStandardWebhook({ secret: created.secret, payload: init.body, headers: new Headers(init.headers), clock: env.at });
  assert.deepEqual(verified, { ok: true });
  const stored = await env.delivery.getDelivery(ADMIN, 'acme', queued.id);
  assert.equal(stored.status, 'succeeded');
  assert.equal(stored.attempts, 1);
  assert.equal(stored.lastStatusCode, 200);
});

test('secret rotation signs with every active secret until the old one expires', async () => {
  const env = setup();
  const { created } = await endpointAndEvent(env);
  const rotated = await env.delivery.rotateSecret(ADMIN, 'acme', created.endpoint.id, { graceMs: 3_600_000 });
  assert.notEqual(rotated.secret, created.secret);
  assert.equal(rotated.endpoint.secrets.length, 2);
  assert.equal(JSON.stringify(rotated.endpoint).includes('whsec_'), false, 'endpoint views never contain secret values');

  await env.delivery.runOnce({ workerId: 'w1' });
  let { init } = env.calls[0];
  const headers = new Headers(init.headers);
  assert.equal(init.headers['webhook-signature'].split(' ').length, 2);
  assert.deepEqual(await verifyStandardWebhook({ secret: created.secret, payload: init.body, headers, clock: env.at }), { ok: true });
  assert.deepEqual(await verifyStandardWebhook({ secret: rotated.secret, payload: init.body, headers, clock: env.at }), { ok: true });

  env.advance(3_600_001);
  await env.delivery.enqueue({ tenantId: 'acme', eventId: 'evt-2', type: 'order.paid', data: {} });
  await env.delivery.runOnce({ workerId: 'w1' });
  ({ init } = env.calls[1]);
  const later = new Headers(init.headers);
  assert.equal(init.headers['webhook-signature'].split(' ').length, 1);
  assert.deepEqual(await verifyStandardWebhook({ secret: created.secret, payload: init.body, headers: later, clock: env.at }), { ok: false, reason: 'mismatch' });
  assert.deepEqual(await verifyStandardWebhook({ secret: rotated.secret, payload: init.body, headers: later, clock: env.at }), { ok: true });
});

test('a secretBox seals stored secrets and opens them only to sign', async () => {
  const sealed = [];
  const secretBox = {
    seal: async plain => { sealed.push(plain); return 'sealed:' + Buffer.from(plain).toString('hex'); },
    open: async value => Buffer.from(value.slice(7), 'hex').toString(),
  };
  const env = setup({ secretBox });
  const { created } = await endpointAndEvent(env);
  const raw = await env.store.getEndpoint('acme', created.endpoint.id);
  assert.match(raw.secrets[0].value, /^sealed:/);
  assert.deepEqual(sealed, [created.secret]);
  await env.delivery.runOnce({ workerId: 'w1' });
  const { init } = env.calls[0];
  assert.deepEqual(await verifyStandardWebhook({ secret: created.secret, payload: init.body, headers: new Headers(init.headers), clock: env.at }), { ok: true });
});

// ---------- retries, backoff, dead, replay, stable id ----------

test('exponentialJitterBackoff doubles per attempt, caps at maxMs and jitters between half and full delay', () => {
  const at = (attempt, r) => exponentialJitterBackoff(attempt, { baseMs: 1000, maxMs: 10_000, random: () => r });
  assert.deepEqual([1, 2, 3, 4].map(a => at(a, 0)), [500, 1000, 2000, 4000]);
  assert.deepEqual([1, 2, 3, 4].map(a => at(a, 0.999999)), [1000, 2000, 4000, 8000].map(v => Math.floor(v * (0.5 + 0.999999 / 2))));
  assert.equal(at(10, 0), 5000);
  assert.equal(at(50, 0.5), 7500);
});

test('network errors, timeouts and non-2xx responses are retried with backoff and the same webhook-id, then dead', async () => {
  const env = setup({ maxAttempts: 4 });
  const { queued } = await endpointAndEvent(env);
  env.responses.push(new TypeError('fetch failed'), new Response('nope', { status: 500 }), new Response('', { status: 404 }), new Response('', { status: 503 }));
  const delays = [];
  for (let i = 0; i < 4; i++) {
    const before = env.at();
    const summary = await env.delivery.runOnce({ workerId: 'w1' });
    const row = await env.store.getDelivery('acme', queued.id);
    if (i < 3) {
      assert.equal(summary.retried, 1);
      assert.equal(row.status, 'pending');
      delays.push(row.nextAttemptAt - before);
      // Not due yet: nothing is claimed until the backoff passes.
      assert.equal((await env.delivery.runOnce({ workerId: 'w1' })).claimed, 0);
      env.advance(row.nextAttemptAt - before);
    } else {
      assert.equal(summary.dead, 1);
      assert.equal(row.status, 'dead');
      assert.equal(row.lastError, 'http 503');
    }
  }
  // random 0.5 -> 75% of 1s, 2s, 4s.
  assert.deepEqual(delays, [750, 1500, 3000]);
  assert.equal(env.calls.length, 4);
  assert.equal(new Set(env.calls.map(c => c.init.headers['webhook-id'])).size, 1);
  assert.equal(env.calls[0].init.headers['webhook-id'], queued.id);
  const attempts = await env.delivery.listAttempts(ADMIN, 'acme', queued.id);
  assert.deepEqual(attempts.map(a => [a.attempt, a.outcome, a.statusCode]), [
    [1, 'network-error', null], [2, 'http-error', 500], [3, 'http-error', 404], [4, 'http-error', 503],
  ]);
  assert.equal(attempts[1].responseBody, 'nope');
  assert.equal(attempts[0].error, 'fetch failed');
});

test('manual replay of a dead delivery requeues it with the same webhook-id and a fresh attempt budget', async () => {
  const env = setup({ maxAttempts: 1 });
  const { queued } = await endpointAndEvent(env);
  env.responses.push(new Response('', { status: 500 }));
  assert.equal((await env.delivery.runOnce({ workerId: 'w1' })).dead, 1);
  await assert.rejects(env.delivery.replay(VIEWER, 'acme', queued.id), { code: 'forbidden' });
  await assert.rejects(env.delivery.replay(OTHER, 'globex', queued.id), { code: 'not-found' });
  const replayed = await env.delivery.replay(ADMIN, 'acme', queued.id);
  assert.equal(replayed.id, queued.id);
  assert.equal(replayed.status, 'pending');
  assert.equal(replayed.attempts, 0);
  assert.equal((await env.delivery.runOnce({ workerId: 'w1' })).succeeded, 1);
  assert.equal(env.calls[1].init.headers['webhook-id'], queued.id);
  // A pending delivery cannot be replayed again while it is in flight.
  await env.delivery.enqueue({ tenantId: 'acme', eventId: 'evt-9', type: 'order.paid', data: {} });
  const [pending] = await env.delivery.listDeliveries(ADMIN, 'acme', { status: 'pending' });
  await assert.rejects(env.delivery.replay(ADMIN, 'acme', pending.id), { code: 'not-replayable' });
  // Replaying a succeeded delivery resends the same id.
  assert.equal((await env.delivery.replay(ADMIN, 'acme', queued.id)).status, 'pending');
});

test('enqueue creates one delivery per (event, endpoint), idempotent on the event id, filtered by event type', async () => {
  const env = setup();
  const a = await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://hooks.example.com/a' });
  const b = await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://other.example.com/b', eventTypes: ['order.paid'] });
  await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://other.example.com/c', eventTypes: ['user.created'] });
  await env.delivery.createEndpoint(OTHER, 'globex', { url: 'https://hooks.example.com/g' });
  const first = await env.delivery.enqueue({ tenantId: 'acme', eventId: 'evt-1', type: 'order.paid', data: { n: 1 } });
  assert.deepEqual(first.map(d => d.endpointId).sort(), [a.endpoint.id, b.endpoint.id].sort());
  const again = await env.delivery.enqueue({ tenantId: 'acme', eventId: 'evt-1', type: 'order.paid', data: { n: 1 } });
  assert.deepEqual(again.map(d => d.id).sort(), first.map(d => d.id).sort());
  assert.equal((await env.delivery.listDeliveries(ADMIN, 'acme')).length, 2);
  assert.notEqual(first[0].id, first[1].id);
  for (const d of first) assert.match(d.id, /^msg_[\x21-\x7e]+$/);
  await assert.rejects(env.delivery.enqueue({ tenantId: 'acme', eventId: 'has space', type: 'x', data: {} }), { code: 'bad-request' });
  await assert.rejects(env.delivery.enqueue({ tenantId: 'acme', eventId: 'e', type: 'x', data: 'y'.repeat(300_000) }), { code: 'payload-too-large' });
});

// ---------- timeout and capped reads ----------

test('each attempt gets its own AbortSignal timeout; a hung endpoint is aborted and retried', async () => {
  const controllers = [];
  const env = setup({ timeoutMs: 5000, timeoutSignal: ms => { const c = new AbortController(); controllers.push({ c, ms }); return c.signal; } });
  const { queued } = await endpointAndEvent(env);
  // A fetch that ignores the signal entirely: the worker must still be released.
  env.responses.push(() => new Promise(() => {}));
  const run = env.delivery.runOnce({ workerId: 'w1' });
  // Web Crypto signing completes off the main thread; yield until the fetch has started.
  for (let i = 0; i < 1000 && env.calls.length === 0; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(controllers.length, 1);
  assert.equal(controllers[0].ms, 5000);
  assert.equal(env.calls[0].init.signal, controllers[0].c.signal);
  controllers[0].c.abort(new DOMException('The operation timed out.', 'TimeoutError'));
  const summary = await run;
  assert.equal(summary.retried, 1);
  const [attempt] = await env.delivery.listAttempts(ADMIN, 'acme', queued.id);
  assert.equal(attempt.outcome, 'timeout');
  assert.equal((await env.store.getDelivery('acme', queued.id)).lastError, 'timeout');
});

test('the default timeout signal is AbortSignal.timeout per attempt: it aborts with TimeoutError and each attempt gets a new one', async () => {
  // A real 100 ms AbortSignal.timeout (long enough for signing to finish first): the only real timer in this file,
  // needed to prove the default actually fires.
  const env = setup({ timeoutMs: 100, maxAttempts: 2 });
  const { queued } = await endpointAndEvent(env);
  const hang = (url, init) => new Promise((_, reject) => {
    if (init.signal.aborted) reject(init.signal.reason);
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  });
  env.responses.push(hang, hang);
  // AbortSignal.timeout timers do not keep the process alive; hold the event loop open (at most 3 s) while they fire.
  // A default that never aborts leaves runOnce pending and the test fails when this hold ends.
  const keepAlive = setTimeout(() => {}, 3000);
  try {
    assert.equal((await env.delivery.runOnce({ workerId: 'w1', limit: 1, concurrency: 1, leaseMs: 5000 })).retried, 1);
    env.advance(60_000);
    assert.equal((await env.delivery.runOnce({ workerId: 'w1', limit: 1, concurrency: 1, leaseMs: 5000 })).dead, 1);
  } finally {
    clearTimeout(keepAlive);
  }
  const [first, second] = env.calls.map(c => c.init.signal);
  assert.ok(first instanceof AbortSignal && second instanceof AbortSignal);
  assert.notEqual(first, second, 'each attempt gets its own signal');
  for (const signal of [first, second]) {
    assert.equal(signal.aborted, true);
    assert.equal(signal.reason.name, 'TimeoutError');
  }
  const attempts = await env.delivery.listAttempts(ADMIN, 'acme', queued.id);
  assert.deepEqual(attempts.map(a => a.outcome), ['timeout', 'timeout']);
});

test('response bodies are read only up to maxResponseBytes and the stream is cancelled', async () => {
  let pulled = 0;
  let cancelled = false;
  const env = setup({ maxResponseBytes: 10 });
  const { queued } = await endpointAndEvent(env);
  const stream = new ReadableStream({
    pull(controller) { pulled++; controller.enqueue(new TextEncoder().encode('abcdefgh')); },
    cancel() { cancelled = true; },
  });
  env.responses.push(new Response(stream, { status: 500 }));
  await env.delivery.runOnce({ workerId: 'w1' });
  const [attempt] = await env.delivery.listAttempts(ADMIN, 'acme', queued.id);
  assert.equal(attempt.responseBody, 'abcdefghab');
  assert.ok(pulled < 5);
  assert.equal(cancelled, true);
});

// ---------- SSRF guard ----------

test('isPublicIp and parseIp reject private, loopback, link-local, CGNAT, multicast, ULA, mapped and metadata ranges', () => {
  for (const ip of ['93.184.216.34', '8.8.8.8', '1.1.1.1', '2606:2800:220:1:248:1893:25c8:1946', '2001:4860:4860::8888']) {
    assert.equal(isPublicIp(ip), true, ip);
  }
  for (const ip of [
    '0.0.0.0', '10.1.2.3', '100.64.0.1', '100.127.255.254', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '192.0.0.170', '192.0.2.1', '198.18.0.1', '198.51.100.1', '203.0.113.9', '224.0.0.1', '239.255.255.250',
    '240.0.0.1', '255.255.255.255',
    '::', '::1', 'fe80::1', 'fc00::1', 'fd00:ec2::254', 'ff02::1', 'fec0::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:93.184.216.34', '::127.0.0.1', '64:ff9b::a00:1', '64:ff9b:1::1',
    '2002:a00:1::', '2001:db8::1', '2001::1', '100::1',
  ]) {
    assert.equal(isPublicIp(ip), false, ip);
  }
  for (const bad of ['127.1', '0x7f.0.0.1', '0177.0.0.1', '2130706433', '1.2.3.04', '1.2.3', '256.1.1.1', 'fe80::1%eth0', '1::2::3', ':::', 'example.com', '']) {
    assert.equal(parseIp(bad), null, bad);
    assert.equal(isPublicIp(bad), false, bad);
  }
  assert.deepEqual(parseIp('::ffff:1.2.3.4').version, 6);
});

test('checkWebhookUrl requires https, refuses credentials, localhost names and non-canonical IPv4 forms', () => {
  assert.equal(checkWebhookUrl('https://hooks.example.com/in?x=1').ok, true);
  const reasons = url => checkWebhookUrl(url).reason;
  assert.equal(reasons('http://hooks.example.com/'), 'https-required');
  assert.equal(checkWebhookUrl('http://hooks.example.com/', { allowHttp: true }).ok, true);
  assert.equal(reasons('ftp://hooks.example.com/'), 'https-required');
  assert.equal(reasons('https://user:pass@hooks.example.com/'), 'credentials');
  assert.equal(reasons('https://user@hooks.example.com/'), 'credentials');
  assert.equal(reasons('not a url'), 'invalid-url');
  assert.equal(reasons('https://hooks.example.com/\n'), 'invalid-url');
  assert.equal(reasons('https://localhost/'), 'blocked-host');
  assert.equal(reasons('https://api.localhost/'), 'blocked-host');
  assert.equal(reasons('https://metadata.google.internal/'), 'blocked-host');
  for (const host of ['2130706433', '0x7f000001', '0177.0.0.1', '0x7f.0.0.1', '127.1', '127.0.1', '%31%32%37.0.0.1', '1.2.3.04']) {
    assert.equal(reasons(`https://${host}/`), 'non-canonical-ip', host);
  }
  assert.equal(reasons('https://127.0.0.1/'), 'private-address');
  assert.equal(reasons('https://[::1]/'), 'private-address');
  assert.equal(reasons('https://[::ffff:7f00:1]/'), 'private-address');
  assert.equal(reasons('https://169.254.169.254/latest/meta-data'), 'private-address');
  assert.equal(checkWebhookUrl('https://93.184.216.34/').ok, true);
  assert.equal(checkWebhookUrl('https://[2606:2800:220:1:248:1893:25c8:1946]/').ok, true);
});

test('guardWebhookUrl checks every resolved address with the injected resolver', async () => {
  const dns = { 'a.example.com': ['93.184.216.34'], 'b.example.com': ['93.184.216.34', '10.0.0.1'], 'c.example.com': [], 'd.example.com': ['not-an-ip'] };
  const resolveHost = async host => dns[host];
  assert.deepEqual(await guardWebhookUrl('https://a.example.com/x', { resolveHost }), { ok: true, url: 'https://a.example.com/x', hostname: 'a.example.com', addresses: ['93.184.216.34'] });
  assert.equal((await guardWebhookUrl('https://b.example.com/', { resolveHost })).reason, 'private-address');
  assert.equal((await guardWebhookUrl('https://c.example.com/', { resolveHost })).reason, 'unresolvable');
  assert.equal((await guardWebhookUrl('https://d.example.com/', { resolveHost })).reason, 'private-address');
  assert.equal((await guardWebhookUrl('https://e.example.com/', { resolveHost: async () => { throw new Error('ENOTFOUND'); } })).reason, 'unresolvable');
  // IP literals are not sent to the resolver.
  let asked = 0;
  assert.equal((await guardWebhookUrl('https://93.184.216.34/', { resolveHost: async () => { asked++; return []; } })).ok, true);
  assert.equal(asked, 0);
});

test('registration refuses URLs that fail the SSRF guard, including hostnames resolving to private addresses', async () => {
  const env = setup();
  for (const [url, reason] of [
    ['http://hooks.example.com/', 'https-required'],
    ['https://u:p@hooks.example.com/', 'credentials'],
    ['https://private.example.com/', 'private-address'],
    ['https://mixed.example.com/', 'private-address'],
    ['https://nowhere.example.com/', 'unresolvable'],
    ['https://0x7f.0.0.1/', 'non-canonical-ip'],
  ]) {
    await assert.rejects(env.delivery.createEndpoint(ADMIN, 'acme', { url }), err => err instanceof WebhookDeliveryError && err.code === 'invalid-url' && err.message.includes(reason), url);
  }
  const { endpoint } = await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://hooks.example.com/' });
  await assert.rejects(env.delivery.updateEndpoint(ADMIN, 'acme', endpoint.id, { url: 'https://private.example.com/' }), { code: 'invalid-url' });
  assert.equal((await env.delivery.listEndpoints(ADMIN, 'acme')).length, 1);
});

test('send time re-resolves the host: a hostname rebound to a private address is blocked and not fetched', async () => {
  const env = setup({ maxAttempts: 2 });
  const { queued } = await endpointAndEvent(env);
  env.dns['hooks.example.com'] = ['169.254.169.254'];
  const summary = await env.delivery.runOnce({ workerId: 'w1' });
  assert.equal(summary.retried, 1);
  assert.equal(env.calls.length, 0);
  const [attempt] = await env.delivery.listAttempts(ADMIN, 'acme', queued.id);
  assert.equal(attempt.outcome, 'blocked');
  assert.match(attempt.error, /private-address/);
});

test('redirects are not followed: fetch uses redirect manual and a 3xx is a failed attempt', async () => {
  const env = setup({ maxAttempts: 1 });
  const { queued } = await endpointAndEvent(env);
  env.responses.push(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }));
  const summary = await env.delivery.runOnce({ workerId: 'w1' });
  assert.equal(summary.dead, 1);
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].init.redirect, 'manual');
  const [attempt] = await env.delivery.listAttempts(ADMIN, 'acme', queued.id);
  assert.deepEqual([attempt.outcome, attempt.statusCode], ['redirect', 302]);
  assert.equal((await env.store.getDelivery('acme', queued.id)).lastError, 'redirect 302 not followed');
});

test('allowHttp permits http endpoints for tests while the address checks still apply', async () => {
  const env = setup({ allowHttp: true });
  await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'http://hooks.example.com/in' });
  await assert.rejects(env.delivery.createEndpoint(ADMIN, 'acme', { url: 'http://private.example.com/' }), { code: 'invalid-url' });
});

// ---------- authorization and tenancy ----------

test('endpoint CRUD and secret rotation call authorize(actor, tenantId, action) and refuse unauthorized actors', async () => {
  const env = setup();
  await assert.rejects(env.delivery.createEndpoint(VIEWER, 'acme', { url: 'https://hooks.example.com/' }), { code: 'forbidden' });
  await assert.rejects(env.delivery.createEndpoint(null, 'acme', { url: 'https://hooks.example.com/' }), { code: 'forbidden' });
  const { endpoint, secret } = await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://hooks.example.com/', description: 'Orders' });
  assert.match(secret, /^whsec_/);
  assert.deepEqual(env.authorizeCalls.at(-1), ['u-admin', 'acme', 'endpoint:create']);
  // Viewers can read; reads never include secret values.
  const listed = await env.delivery.listEndpoints(VIEWER, 'acme');
  assert.equal(listed.length, 1);
  assert.equal(JSON.stringify(listed).includes(secret), false);
  assert.equal(JSON.stringify(await env.delivery.getEndpoint(VIEWER, 'acme', endpoint.id)).includes('whsec_'), false);
  await assert.rejects(env.delivery.updateEndpoint(VIEWER, 'acme', endpoint.id, { enabled: false }), { code: 'forbidden' });
  await assert.rejects(env.delivery.rotateSecret(VIEWER, 'acme', endpoint.id), { code: 'forbidden' });
  await assert.rejects(env.delivery.deleteEndpoint(VIEWER, 'acme', endpoint.id), { code: 'forbidden' });
  assert.deepEqual(env.authorizeCalls.slice(-3).map(c => c[2]), ['endpoint:update', 'endpoint:rotate-secret', 'endpoint:delete']);
  const updated = await env.delivery.updateEndpoint(ADMIN, 'acme', endpoint.id, { description: 'Orders v2', eventTypes: ['order.paid'] });
  assert.deepEqual([updated.description, updated.eventTypes], ['Orders v2', ['order.paid']]);
  await env.delivery.deleteEndpoint(ADMIN, 'acme', endpoint.id);
  assert.deepEqual(await env.delivery.listEndpoints(ADMIN, 'acme'), []);
  await assert.rejects(env.delivery.getEndpoint(ADMIN, 'acme', endpoint.id), { code: 'not-found' });
  // authorize must return exactly true: truthy values are refused.
  const loose = setup({ authorize: () => 'yes' });
  await assert.rejects(loose.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://hooks.example.com/' }), { code: 'forbidden' });
});

test('tenants cannot read, change, rotate, replay or receive another tenant\'s endpoints and deliveries', async () => {
  const env = setup();
  const { created, queued } = await endpointAndEvent(env);
  const id = created.endpoint.id;
  // OTHER is authorized for globex only; asking globex for an acme id finds nothing.
  await assert.rejects(env.delivery.getEndpoint(OTHER, 'globex', id), { code: 'not-found' });
  await assert.rejects(env.delivery.updateEndpoint(OTHER, 'globex', id, { url: 'https://other.example.com/steal' }), { code: 'not-found' });
  await assert.rejects(env.delivery.rotateSecret(OTHER, 'globex', id), { code: 'not-found' });
  await assert.rejects(env.delivery.deleteEndpoint(OTHER, 'globex', id), { code: 'not-found' });
  await assert.rejects(env.delivery.getDelivery(OTHER, 'globex', queued.id), { code: 'not-found' });
  await assert.rejects(env.delivery.listAttempts(OTHER, 'globex', queued.id), { code: 'not-found' });
  // Asking acme directly is refused by authorize.
  await assert.rejects(env.delivery.getEndpoint(OTHER, 'acme', id), { code: 'forbidden' });
  assert.deepEqual(await env.delivery.listDeliveries(OTHER, 'globex'), []);
  // A globex event never reaches the acme endpoint.
  assert.deepEqual(await env.delivery.enqueue({ tenantId: 'globex', eventId: 'evt-g', type: 'order.paid', data: {} }), []);
  // A delivery row whose endpoint belongs to another tenant (corrupted or forged) is not sent.
  await env.store.insertDeliveries([{ ...(await env.store.getDelivery('acme', queued.id)), id: 'msg_forged', tenantId: 'globex', eventId: 'forged' }]);
  await env.delivery.runOnce({ workerId: 'w1', limit: 10 });
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].init.headers['webhook-id'], queued.id);
  assert.equal((await env.store.getDelivery('globex', 'msg_forged')).status, 'dead');
});

test('disabled or deleted endpoints stop delivery; the row becomes dead and can be replayed after re-enabling', async () => {
  const env = setup();
  const { created, queued } = await endpointAndEvent(env);
  await env.delivery.updateEndpoint(ADMIN, 'acme', created.endpoint.id, { enabled: false });
  assert.equal((await env.delivery.runOnce({ workerId: 'w1' })).dead, 1);
  assert.equal(env.calls.length, 0);
  assert.equal((await env.store.getDelivery('acme', queued.id)).lastError, 'endpoint disabled');
  assert.deepEqual(await env.delivery.enqueue({ tenantId: 'acme', eventId: 'evt-2', type: 'order.paid', data: {} }), []);
  await env.delivery.updateEndpoint(ADMIN, 'acme', created.endpoint.id, { enabled: true });
  await env.delivery.replay(ADMIN, 'acme', queued.id);
  assert.equal((await env.delivery.runOnce({ workerId: 'w1' })).succeeded, 1);
});

// ---------- leases and worker ----------

test('a crashed worker\'s claim holds until the lease expires, then another worker reclaims it; the stale worker cannot complete', async () => {
  const env = setup();
  const { queued } = await endpointAndEvent(env);
  const [claimed] = await env.store.claim({ now: env.at(), limit: 5, workerId: 'crashed', leaseMs: 30_000 });
  assert.equal(claimed.id, queued.id);
  assert.equal((await env.delivery.runOnce({ workerId: 'w2', leaseMs: 30_000 })).claimed, 0);
  env.advance(30_001);
  // While w2's attempt is in flight (its lease live, status delivering), the stale worker tries to complete.
  let stale;
  env.responses.push(async () => {
    const during = await env.store.getDelivery('acme', queued.id);
    assert.deepEqual([during.status, during.leaseOwner], ['delivering', 'w2']);
    stale = await env.store.complete(queued.id, 'crashed', { status: 'dead', lastError: 'stale' });
    return new Response('ok', { status: 200 });
  });
  assert.equal((await env.delivery.runOnce({ workerId: 'w2', leaseMs: 30_000 })).succeeded, 1);
  assert.equal(stale, false, 'complete must be fenced by the lease owner');
  const row = await env.store.getDelivery('acme', queued.id);
  assert.deepEqual([row.status, row.attempts, row.lastError], ['succeeded', 2, null]);
});

test('the lease is renewed when each attempt starts, so a slow lane never lets another worker resend its last item', async () => {
  // Review repro: timeoutMs 1000, limit 2, concurrency 1, leaseMs 2000 (the allowed minimum) and 5 ms store latency.
  const env = setup({ timeoutMs: 1000, timeoutSignal: () => new AbortController().signal });
  const getEndpoint = env.store.getEndpoint.bind(env.store);
  env.store.getEndpoint = async (...args) => { env.advance(5); return getEndpoint(...args); };
  await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://hooks.example.com/in' });
  await env.delivery.enqueue({ tenantId: 'acme', eventId: 'a', type: 't', data: 1 });
  await env.delivery.enqueue({ tenantId: 'acme', eventId: 'b', type: 't', data: 1 });
  let competitor;
  const slow = async () => {
    env.advance(1000); // each receiver takes the full timeout
    if (env.calls.length === 2) competitor = await env.delivery.runOnce({ workerId: 'w2', limit: 1, concurrency: 1, leaseMs: 2000 });
    return new Response('ok', { status: 200 });
  };
  env.responses.push(slow, slow);
  const summary = await env.delivery.runOnce({ workerId: 'w1', limit: 2, concurrency: 1, leaseMs: 2000 });
  assert.equal(competitor.claimed, 0);
  assert.deepEqual([summary.succeeded, summary.lostLease], [2, 0]);
  const ids = env.calls.map(c => c.init.headers['webhook-id']);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2, 'each delivery is sent once');
});

test('an item whose claim lease expired and was reclaimed before its turn is skipped, not sent twice', async () => {
  const env = setup({ timeoutMs: 1000, timeoutSignal: () => new AbortController().signal });
  await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://hooks.example.com/in' });
  await env.delivery.enqueue({ tenantId: 'acme', eventId: 'a', type: 't', data: 1 });
  await env.delivery.enqueue({ tenantId: 'acme', eventId: 'b', type: 't', data: 1 });
  // A store stall before w1's second item: its claim lease expires and w2 reclaims and delivers it meanwhile.
  let competitor;
  let lookups = 0;
  const getEndpoint = env.store.getEndpoint.bind(env.store);
  env.store.getEndpoint = async (...args) => {
    if (++lookups === 2) {
      env.advance(5000);
      competitor = await env.delivery.runOnce({ workerId: 'w2', limit: 5, concurrency: 1, leaseMs: 5000 });
    }
    return getEndpoint(...args);
  };
  const summary = await env.delivery.runOnce({ workerId: 'w1', limit: 2, concurrency: 1, leaseMs: 2000 });
  assert.deepEqual([competitor.claimed, competitor.succeeded], [1, 1]);
  assert.deepEqual([summary.succeeded, summary.lostLease], [1, 1]);
  const ids = env.calls.map(c => c.init.headers['webhook-id']);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2, 'each delivery is sent once');
});

test('a delivery reclaimed after crashes beyond maxAttempts becomes dead without another send', async () => {
  const env = setup({ maxAttempts: 2 });
  const { queued } = await endpointAndEvent(env);
  for (let i = 0; i < 2; i++) {
    await env.store.claim({ now: env.at(), limit: 5, workerId: 'crash-' + i, leaseMs: 1000 });
    env.advance(1001);
  }
  assert.equal((await env.delivery.runOnce({ workerId: 'w1' })).dead, 1);
  assert.equal(env.calls.length, 0);
  assert.equal((await env.store.getDelivery('acme', queued.id)).status, 'dead');
});

test('runOnce honours limit and concurrency and refuses a lease shorter than the batch can take', async () => {
  const env = setup({ timeoutMs: 1000 });
  await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://hooks.example.com/' });
  for (let i = 0; i < 7; i++) await env.delivery.enqueue({ tenantId: 'acme', eventId: 'e' + i, type: 'x', data: { i } });
  let inFlight = 0;
  let peak = 0;
  const gate = () => async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise(r => setImmediate(r)); inFlight--; return new Response(null, { status: 204 }); };
  for (let i = 0; i < 7; i++) env.responses.push(gate());
  const first = await env.delivery.runOnce({ workerId: 'w1', limit: 5, concurrency: 2, leaseMs: 10_000 });
  assert.deepEqual([first.claimed, first.succeeded], [5, 5]);
  assert.equal(peak, 2);
  assert.equal((await env.delivery.runOnce({ workerId: 'w1', limit: 5, concurrency: 2, leaseMs: 10_000 })).succeeded, 2);
  await assert.rejects(env.delivery.runOnce({ workerId: 'w1', limit: 10, concurrency: 1, leaseMs: 5000 }), RangeError);
  await assert.rejects(env.delivery.runOnce({ workerId: '' }), RangeError);
});

// ---------- HTTP adapter ----------

function httpSetup() {
  const env = setup();
  const handler = createWebhookEndpointsHandler({
    delivery: env.delivery, prefix: '/api/webhooks', allowedOrigins: ['https://app.example.com'],
    authenticate: request => ({ admin: ADMIN, viewer: VIEWER, other: OTHER })[request.headers.get('x-test-user') ?? ''] ?? null,
  });
  const call = (method, path, { user = 'admin', body, origin = 'https://app.example.com' } = {}) => handler(new Request('https://app.example.com/api/webhooks' + path, {
    method, headers: { 'x-test-user': user, origin, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  return { env, handler, call };
}

test('HTTP adapter: create shows the secret once, list and get never do, rotate shows the new secret once', async () => {
  const { call } = httpSetup();
  const created = await call('POST', '/acme/endpoints', { body: { url: 'https://hooks.example.com/in', eventTypes: ['order.paid'] } });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  const { endpoint, secret } = await created.json();
  assert.match(secret, /^whsec_/);
  const list = await call('GET', '/acme/endpoints');
  assert.equal(list.status, 200);
  const listText = await list.text();
  assert.equal(listText.includes('whsec_'), false);
  assert.equal((await call('GET', `/acme/endpoints/${endpoint.id}`)).status, 200);
  const rotated = await call('POST', `/acme/endpoints/${endpoint.id}/rotate-secret`);
  assert.equal(rotated.status, 200);
  const rotatedBody = await rotated.json();
  assert.notEqual(rotatedBody.secret, secret);
  const patched = await call('PATCH', `/acme/endpoints/${endpoint.id}`, { body: { description: 'x' } });
  assert.equal((await patched.json()).description, 'x');
  assert.equal((await call('DELETE', `/acme/endpoints/${endpoint.id}`)).status, 204);
  assert.equal((await call('GET', `/acme/endpoints/${endpoint.id}`)).status, 404);
});

test('HTTP adapter: 401 without a user, 403 for unauthorized or bad origin, 404 across tenants, 400 for blocked URLs', async () => {
  const { call, env } = httpSetup();
  assert.equal((await call('GET', '/acme/endpoints', { user: 'nobody' })).status, 401);
  assert.equal((await call('POST', '/acme/endpoints', { user: 'viewer', body: { url: 'https://hooks.example.com/' } })).status, 403);
  assert.equal((await call('POST', '/acme/endpoints', { origin: 'https://evil.example', body: { url: 'https://hooks.example.com/' } })).status, 403);
  const bad = await call('POST', '/acme/endpoints', { body: { url: 'https://private.example.com/' } });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'invalid-url');
  const { endpoint } = await (await call('POST', '/acme/endpoints', { body: { url: 'https://hooks.example.com/' } })).json();
  assert.equal((await call('GET', `/globex/endpoints/${endpoint.id}`, { user: 'other' })).status, 404);
  assert.equal((await call('GET', `/acme/endpoints/${endpoint.id}`, { user: 'other' })).status, 403);
  const malformed = await call('POST', '/acme/endpoints', { body: undefined });
  assert.equal(malformed.status, 400);
  assert.equal((await call('PUT', '/acme/endpoints')).status, 405);
  assert.equal((await call('GET', '/acme/unknown')).status, 404);

  // Deliveries: list, attempts and replay.
  env.responses.push(new Response('', { status: 500 }));
  const [queued] = await env.delivery.enqueue({ tenantId: 'acme', eventId: 'evt-h', type: 'x', data: {} });
  await env.delivery.runOnce({ workerId: 'w1' });
  const deliveries = await (await call('GET', '/acme/deliveries?status=pending')).json();
  assert.deepEqual(deliveries.deliveries.map(d => d.id), [queued.id]);
  assert.equal(JSON.stringify(deliveries).includes('"body"'), false);
  const attempts = await (await call('GET', `/acme/deliveries/${queued.id}/attempts`)).json();
  assert.equal(attempts.attempts.length, 1);
  assert.equal((await call('POST', `/acme/deliveries/${queued.id}/replay`)).status, 409);
});
