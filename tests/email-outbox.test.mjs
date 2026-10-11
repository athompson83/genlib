// SPDX-License-Identifier: Apache-2.0
// email-outbox: idempotent enqueue, header injection, suppression, retry classification and full-jitter backoff,
// dead-lettering, lease reclaim, delivery events and replay, cancel, the Resend/Postmark/console transports against a
// fake fetch, and the webhook adapter. No network.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmailOutbox, fullJitterBackoff, isValidAddress } from '../.build/modules/email-outbox/files/core.js';
import { MemoryEmailOutboxStore } from '../.build/modules/email-outbox/files/memory-store.js';
import { createResendTransport, createPostmarkTransport, createConsoleTransport, RESEND_URL, POSTMARK_URL } from '../.build/modules/email-outbox/files/transports.js';
import { createEmailEventsHandler } from '../.build/modules/email-outbox/files/http.js';

const templates = {
  welcome: data => ({ subject: `Welcome, ${data.name}`, text: `Hi ${data.name}`, html: `<p>Hi ${data.name}</p>` }),
  raw: data => ({ subject: data.subject, text: 'body' }),
};

function setup(results = [], extra = {}) {
  let now = 1_000_000;
  let ids = 0;
  const sent = [];
  const transport = {
    async send(message, context) {
      sent.push({ message, context });
      const next = results.length ? results.shift() : { status: 'sent', providerId: 'p-' + sent.length };
      if (next instanceof Error) throw next;
      return next;
    },
  };
  const store = new MemoryEmailOutboxStore();
  const outbox = createEmailOutbox({
    store, transport, templates, from: 'Acme <no-reply@acme.example>', now: () => now, newId: () => 'm' + ++ids,
    backoff: { baseMs: 1000, maxMs: 60_000, random: () => 0.5 }, ...extra,
  });
  return { outbox, store, sent, advance: ms => { now += ms; }, at: () => now };
}

test('enqueue renders, stores and is idempotent per key; a different payload is key-reused', async () => {
  const { outbox, store } = setup();
  const first = await outbox.enqueue({ key: 'welcome:u1', to: 'a@example.com', template: 'welcome', data: { name: 'Ann' }, tags: { kind: 'welcome' } });
  assert.equal(first.status, 'queued');
  assert.equal(first.subject, 'Welcome, Ann');
  assert.equal(first.html, '<p>Hi Ann</p>');
  assert.equal(first.fingerprint.length, 64);
  const again = await outbox.enqueue({ key: 'welcome:u1', to: 'a@example.com', template: 'welcome', data: { name: 'Ann' }, tags: { kind: 'welcome' } });
  assert.equal(again.id, first.id);
  assert.equal(store.all().length, 1);
  await assert.rejects(outbox.enqueue({ key: 'welcome:u1', to: 'a@example.com', template: 'welcome', data: { name: 'Bob' } }), { code: 'key-reused' });
  await assert.rejects(outbox.enqueue({ key: 'welcome:u1', to: 'b@example.com', template: 'welcome', data: { name: 'Ann' } }), { code: 'key-reused' });
  // Key order in data does not change the fingerprint.
  await outbox.enqueue({ key: 'k2', to: 'a@example.com', template: 'raw', data: { subject: 's', x: 1 } });
  assert.equal((await outbox.enqueue({ key: 'k2', to: 'a@example.com', template: 'raw', data: { x: 1, subject: 's' } })).id, 'm2');
  assert.equal((await outbox.get('welcome:u1')).id, first.id);
  assert.equal(await outbox.get('missing'), null);
});

test('validation: addresses, header injection, keys, templates and tags', async () => {
  const { outbox } = setup();
  for (const to of ['no-at', 'a@b@c', 'a@example.com\r\nBcc: x@evil.example', 'a b@example.com', '@example.com', 'a@', 'x'.repeat(250) + '@e.co']) {
    await assert.rejects(outbox.enqueue({ key: 'k', to, template: 'welcome', data: { name: 'x' } }), { code: 'invalid-address' }, to);
  }
  assert.equal(isValidAddress('first.last+tag@sub.example.co'), true);
  await assert.rejects(outbox.enqueue({ key: 'k', to: 'a@example.com', template: 'raw', data: { subject: 'Hi\r\nBcc: x@evil.example' } }), { code: 'invalid-header' });
  await assert.rejects(outbox.enqueue({ key: 'k', to: 'a@example.com', template: 'raw', data: { subject: 'Hi\nthere' } }), { code: 'invalid-header' });
  await assert.rejects(outbox.enqueue({ key: 'k', to: 'a@example.com', template: 'welcome', data: { name: 'x' }, tags: { kind: 'a\r\nX: y' } }), { code: 'invalid-header' });
  await assert.rejects(outbox.enqueue({ key: 'k', to: 'a@example.com', template: 'welcome', data: { name: 'x' }, tags: { 'bad name': 'v' } }), { code: 'invalid-tags' });
  await assert.rejects(outbox.enqueue({ key: 'has space', to: 'a@example.com', template: 'welcome' }), { code: 'invalid-key' });
  await assert.rejects(outbox.enqueue({ key: 'k', to: 'a@example.com', template: 'nope' }), { code: 'invalid-template' });
  await assert.rejects(outbox.enqueue({ key: 'k', to: 'a@example.com', template: 'toString' }), { code: 'invalid-template' });
  await assert.rejects(outbox.enqueue({ key: 'k', to: 'a@example.com', template: 'raw', data: { subject: '' } }), { code: 'invalid-render' });
  await assert.rejects(outbox.enqueue({ key: 'k', to: 'a@example.com', template: 'welcome', data: null }), { code: 'render-failed' });
  assert.throws(() => createEmailOutbox({ store: new MemoryEmailOutboxStore(), transport: {}, templates, from: 'a@b.c\r\nBcc: x' }), { code: 'invalid-header' });
});

test('dispatch sends with the key as idempotency key and records the provider id; sendAt delays', async () => {
  const { outbox, sent, advance } = setup();
  await outbox.enqueue({ key: 'k1', to: 'a@example.com', template: 'welcome', data: { name: 'A' }, tags: { kind: 'w' } });
  await outbox.enqueue({ key: 'later', to: 'b@example.com', template: 'welcome', data: { name: 'B' }, sendAt: 1_000_000 + 60_000 });
  const summary = await outbox.dispatch({ workerId: 'w1' });
  assert.deepEqual(summary, { claimed: 1, sent: 1, retried: 0, failed: 0, dead: 0, suppressed: 0, lostLease: 0 });
  assert.equal(sent[0].context.idempotencyKey, 'k1');
  assert.equal(sent[0].message.from, 'Acme <no-reply@acme.example>');
  assert.deepEqual(sent[0].message.tags, { kind: 'w' });
  const message = await outbox.get('k1');
  assert.equal(message.status, 'sent');
  assert.equal(message.providerId, 'p-1');
  assert.equal(message.attempts, 1);
  assert.equal(message.leaseOwner, null);
  assert.equal((await outbox.dispatch({ workerId: 'w1' })).claimed, 0);
  advance(60_000);
  assert.equal((await outbox.dispatch({ workerId: 'w1' })).sent, 1);
});

test('retry classification, full-jitter backoff with injected random, and dead after maxAttempts', async () => {
  const results = [
    { status: 'retryable', error: 'http 429' },
    new Error('ECONNRESET'),
    { status: 'retryable', error: 'http 503', retryAfterMs: 90_000 },
  ];
  const { outbox, sent, advance, at } = setup(results, { maxAttempts: 3 });
  await outbox.enqueue({ key: 'r', to: 'a@example.com', template: 'welcome', data: { name: 'A' } });
  assert.equal((await outbox.dispatch({ workerId: 'w' })).retried, 1);
  let m = await outbox.get('r');
  assert.equal(m.status, 'queued');
  assert.equal(m.nextAttemptAt, at() + 500, 'attempt 1: 0.5 x 1000');
  assert.equal(m.lastError, 'http 429');
  assert.equal((await outbox.dispatch({ workerId: 'w' })).claimed, 0, 'not due yet');
  advance(500);
  assert.equal((await outbox.dispatch({ workerId: 'w' })).retried, 1);
  m = await outbox.get('r');
  assert.equal(m.nextAttemptAt, at() + 1000, 'attempt 2: 0.5 x 2000');
  assert.match(m.lastError, /^network: ECONNRESET/);
  advance(1000);
  assert.equal((await outbox.dispatch({ workerId: 'w' })).dead, 1, 'third failure is the last attempt');
  m = await outbox.get('r');
  assert.equal(m.status, 'dead');
  assert.equal(m.attempts, 3);
  assert.ok(sent.every(s => s.context.idempotencyKey === 'r'), 'every retry reuses the same idempotency key');

  // Retry-After wins over a shorter backoff; permanent failures fail at once.
  const second = setup([{ status: 'retryable', error: 'http 503', retryAfterMs: 90_000 }, { status: 'permanent', error: 'http 422' }]);
  await second.outbox.enqueue({ key: 'x', to: 'a@example.com', template: 'welcome', data: { name: 'A' } });
  await second.outbox.dispatch({ workerId: 'w' });
  assert.equal((await second.outbox.get('x')).nextAttemptAt, second.at() + 90_000);
  second.advance(90_000);
  assert.equal((await second.outbox.dispatch({ workerId: 'w' })).failed, 1);
  assert.equal((await second.outbox.get('x')).status, 'failed');

  const jitter = fullJitterBackoff({ baseMs: 1000, maxMs: 5000, random: () => 0.999 });
  assert.deepEqual([1, 2, 3, 4, 10].map(jitter), [999, 1998, 3996, 4995, 4995]);
  assert.equal(fullJitterBackoff({ random: () => 0 })(5), 0);
});

test('a crashed worker\'s lease is reclaimed after expiry; the stale worker cannot complete', async () => {
  const { outbox, store, advance } = setup();
  await outbox.enqueue({ key: 'c', to: 'a@example.com', template: 'welcome', data: { name: 'A' } });
  // Worker w1 claims and "crashes" (never completes).
  const [claimed] = await store.claim({ now: 1_000_000, limit: 1, workerId: 'w1', leaseMs: 30_000 });
  assert.equal(claimed.status, 'sending');
  assert.equal((await outbox.dispatch({ workerId: 'w2' })).claimed, 0, 'lease still held');
  advance(30_001);
  const summary = await outbox.dispatch({ workerId: 'w2' });
  assert.equal(summary.sent, 1);
  const message = await outbox.get('c');
  assert.equal(message.status, 'sent');
  assert.equal(message.attempts, 2);
  assert.equal(await store.complete(message.id, 'w1', { status: 'failed', lastError: 'late' }), false, 'stale worker loses');
  assert.equal((await outbox.get('c')).status, 'sent');

  // Crash loops stop: a reclaimed message beyond maxAttempts is dead without another send.
  const loop = setup([], { maxAttempts: 2 });
  await loop.outbox.enqueue({ key: 'z', to: 'a@example.com', template: 'welcome', data: { name: 'A' } });
  await loop.store.claim({ now: loop.at(), limit: 1, workerId: 'w1', leaseMs: 1000 });
  loop.advance(1001);
  await loop.store.claim({ now: loop.at(), limit: 1, workerId: 'w1', leaseMs: 1000 });
  loop.advance(1001);
  assert.equal((await loop.outbox.dispatch({ workerId: 'w2' })).dead, 1);
  assert.equal(loop.sent.length, 0);
});

test('suppression list: checked at enqueue and again at send; hard bounces and complaints add to it', async () => {
  const extraList = new Set(['unsub@example.com']);
  const { outbox, store, sent } = setup([], { suppress: address => extraList.has(address) });
  await assert.rejects(outbox.enqueue({ key: 'u', to: 'Unsub@Example.com', template: 'welcome', data: { name: 'U' } }), { code: 'suppressed' });
  await outbox.enqueue({ key: 'b1', to: 'Bounce@example.com', template: 'welcome', data: { name: 'B' } });
  await outbox.enqueue({ key: 'b2', to: 'bounce@example.com', template: 'welcome', data: { name: 'B2' }, sendAt: 2_000_000 });
  await outbox.dispatch({ workerId: 'w' });
  const providerId = (await outbox.get('b1')).providerId;
  const result = await outbox.handleEvent({ type: 'bounced', providerId, at: 1_000_500, hard: true });
  assert.equal(result.applied, true);
  assert.equal(result.message.status, 'bounced');
  assert.deepEqual(store.suppressions().map(s => [s.address, s.reason]), [['bounce@example.com', 'hard-bounce']]);
  await assert.rejects(outbox.enqueue({ key: 'b3', to: 'BOUNCE@example.com', template: 'welcome', data: { name: 'B3' } }), { code: 'suppressed' });
  // b2 was queued before the bounce: it is suppressed at send time, not sent.
  const before = sent.length;
  const outboxLater = createEmailOutbox({ store, transport: { send: async () => { throw new Error('must not send'); } }, templates, from: 'a@acme.example', now: () => 2_000_000 });
  const summary = await outboxLater.dispatch({ workerId: 'w' });
  assert.equal(summary.suppressed, 1);
  assert.equal((await outbox.get('b2')).status, 'suppressed');
  assert.equal(sent.length, before);
});

test('events: delivered, soft bounce, complaint, unknown ids and idempotent replay', async () => {
  const { outbox, store } = setup();
  await outbox.enqueue({ key: 'e', to: 'c@example.com', template: 'welcome', data: { name: 'C' } });
  await outbox.dispatch({ workerId: 'w' });
  const providerId = (await outbox.get('e')).providerId;
  assert.equal((await outbox.handleEvent({ type: 'delivered', providerId, at: 1 })).applied, true);
  assert.equal((await outbox.handleEvent({ type: 'delivered', providerId, at: 1 })).applied, false, 'replay is a no-op');
  assert.equal((await outbox.get('e')).status, 'delivered');
  assert.equal((await outbox.handleEvent({ type: 'bounced', providerId, at: 2, hard: false })).applied, false, 'soft bounce changes nothing');
  assert.equal(store.suppressions().length, 0);
  assert.equal((await outbox.handleEvent({ type: 'complained', providerId, at: 3 })).applied, true);
  assert.equal((await outbox.handleEvent({ type: 'complained', providerId, at: 3 })).applied, false);
  assert.equal((await outbox.handleEvent({ type: 'delivered', providerId, at: 4 })).applied, false, 'a late delivered never overwrites a complaint');
  assert.equal((await outbox.get('e')).status, 'complained');
  assert.deepEqual(store.suppressions().map(s => s.reason), ['complaint']);
  assert.deepEqual(await outbox.handleEvent({ type: 'delivered', providerId: 'unknown', at: 5 }), { applied: false, message: null });
  await assert.rejects(outbox.handleEvent({ type: 'opened', providerId, at: 1 }), { code: 'invalid-event' });
});

test('cancel works only while queued', async () => {
  const { outbox } = setup();
  await outbox.enqueue({ key: 'q', to: 'a@example.com', template: 'welcome', data: { name: 'A' } });
  assert.equal((await outbox.cancel('q')).status, 'cancelled');
  assert.equal((await outbox.dispatch({ workerId: 'w' })).claimed, 0, 'a cancelled message is never sent');
  await assert.rejects(outbox.cancel('q'), { code: 'not-cancellable' });
  await assert.rejects(outbox.cancel('nope'), { code: 'not-found' });
  await outbox.enqueue({ key: 's', to: 'a@example.com', template: 'welcome', data: { name: 'A' } });
  await outbox.dispatch({ workerId: 'w' });
  await assert.rejects(outbox.cancel('s'), { code: 'not-cancellable' });
});

const outgoing = { from: 'Acme <no-reply@acme.example>', to: 'a@example.com', subject: 'Hi', text: 'Body', html: '<p>Body</p>', tags: { kind: 'welcome' }, key: 'k-1', id: 'm1' };
const reply = (status, body, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });

test('Resend transport: request shape, Idempotency-Key header and status classification', async () => {
  const calls = [];
  let next;
  const transport = createResendTransport({ apiKey: 're_test', fetch: async (url, init) => { calls.push({ url, init }); return next(); } });
  next = () => reply(200, { id: 'resend-1' });
  assert.deepEqual(await transport.send(outgoing, { idempotencyKey: 'k-1' }), { status: 'sent', providerId: 'resend-1' });
  assert.equal(calls[0].url, RESEND_URL);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['idempotency-key'], 'k-1');
  assert.equal(calls[0].init.headers.authorization, 'Bearer re_test');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(calls[0].init.body), { from: outgoing.from, to: ['a@example.com'], subject: 'Hi', text: 'Body', html: '<p>Body</p>', tags: [{ name: 'kind', value: 'welcome' }] });
  next = () => reply(429, { message: 'slow down' }, { 'retry-after': '7' });
  assert.deepEqual(await transport.send(outgoing, { idempotencyKey: 'k-1' }), { status: 'retryable', error: 'http 429: slow down', retryAfterMs: 7000 });
  next = () => reply(502, 'bad gateway');
  assert.equal((await transport.send(outgoing, { idempotencyKey: 'k-1' })).status, 'retryable');
  next = () => reply(409, { message: 'concurrent idempotent request' });
  assert.equal((await transport.send(outgoing, { idempotencyKey: 'k-1' })).status, 'retryable');
  next = () => reply(422, { message: 'Invalid `to` field' });
  assert.deepEqual(await transport.send(outgoing, { idempotencyKey: 'k-1' }), { status: 'permanent', error: 'http 422: Invalid `to` field' });
  next = () => reply(200, {});
  assert.equal((await transport.send(outgoing, { idempotencyKey: 'k-1' })).status, 'retryable', 'accepted without an id is uncertain');
  next = () => { throw new TypeError('fetch failed'); };
  assert.deepEqual(await transport.send(outgoing, { idempotencyKey: 'k-1' }), { status: 'retryable', error: 'network: fetch failed' });
  assert.ok(calls.every(call => call.init.headers['idempotency-key'] === 'k-1'));
  assert.throws(() => createResendTransport({ apiKey: '' }), TypeError);
});

test('transport timeout aborts through AbortSignal and is retryable', async () => {
  // AbortSignal.timeout's timer does not keep Node alive, so the fake holds a ref'd timer until it is aborted.
  const hang = (url, init) => new Promise((resolve, reject) => {
    const keepAlive = setTimeout(() => reject(new Error('timeout signal never fired')), 5000);
    init.signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(init.signal.reason); }, { once: true });
  });
  const resend = createResendTransport({ apiKey: 're_test', fetch: hang, timeoutMs: 20 });
  assert.deepEqual(await resend.send(outgoing, { idempotencyKey: 'k-1' }), { status: 'retryable', error: 'timeout' });
  const postmark = createPostmarkTransport({ apiKey: 'pm', fetch: hang, timeoutMs: 20 });
  assert.deepEqual(await postmark.send(outgoing, { idempotencyKey: 'k-1' }), { status: 'retryable', error: 'timeout' });
});

test('Postmark transport: request shape, metadata key and classification; console transport', async () => {
  const calls = [];
  let next;
  const transport = createPostmarkTransport({ apiKey: 'pm-token', messageStream: 'outbound', fetch: async (url, init) => { calls.push({ url, init }); return next(); } });
  next = () => reply(200, { MessageID: 'pm-1', ErrorCode: 0 });
  assert.deepEqual(await transport.send(outgoing, { idempotencyKey: 'k-1' }), { status: 'sent', providerId: 'pm-1' });
  assert.equal(calls[0].url, POSTMARK_URL);
  assert.equal(calls[0].init.headers['x-postmark-server-token'], 'pm-token');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    From: outgoing.from, To: 'a@example.com', Subject: 'Hi', TextBody: 'Body', HtmlBody: '<p>Body</p>', Tag: 'welcome',
    Metadata: { kind: 'welcome', idempotency_key: 'k-1' }, MessageStream: 'outbound',
  });
  next = () => reply(422, { ErrorCode: 406, Message: 'Inactive recipient' });
  assert.deepEqual(await transport.send(outgoing, { idempotencyKey: 'k-1' }), { status: 'permanent', error: 'http 422: Inactive recipient' });
  next = () => reply(500, { Message: 'oops' });
  assert.equal((await transport.send(outgoing, { idempotencyKey: 'k-1' })).status, 'retryable');

  const lines = [];
  const console = createConsoleTransport({ log: line => lines.push(line), newId: () => 'x' });
  assert.deepEqual(await console.send(outgoing, { idempotencyKey: 'k-1' }), { status: 'sent', providerId: 'console-x' });
  assert.match(lines[0], /key=k-1 to=a@example.com/);
});

test('outbox + Resend transport end to end against a fake fetch', async () => {
  const keys = [];
  let attempt = 0;
  const transport = createResendTransport({ apiKey: 're_test', fetch: async (url, init) => {
    keys.push(init.headers['idempotency-key']);
    attempt++;
    if (attempt === 1) throw new TypeError('socket hang up');
    return reply(200, { id: 'resend-42' });
  } });
  let now = 0;
  const outbox = createEmailOutbox({ store: new MemoryEmailOutboxStore(), transport, templates, from: 'a@acme.example', now: () => now, backoff: () => 10 });
  await outbox.enqueue({ key: 'order:9', to: 'a@example.com', template: 'welcome', data: { name: 'A' } });
  assert.equal((await outbox.dispatch({ workerId: 'w' })).retried, 1);
  now = 10;
  assert.equal((await outbox.dispatch({ workerId: 'w' })).sent, 1);
  assert.deepEqual(keys, ['order:9', 'order:9']);
  assert.equal((await outbox.get('order:9')).providerId, 'resend-42');
});

test('webhook adapter: signature before parsing, event mapping, replay and errors', async () => {
  const { outbox } = setup();
  await outbox.enqueue({ key: 'h', to: 'h@example.com', template: 'welcome', data: { name: 'H' } });
  await outbox.dispatch({ workerId: 'w' });
  const providerId = (await outbox.get('h')).providerId;
  const seen = [];
  const handler = createEmailEventsHandler({ outbox, maxRequestBytes: 2048, verify: async (request, raw) => { seen.push(raw); return request.headers.get('x-sig') === 'ok'; } });
  const post = (body, sig = 'ok') => handler(new Request('https://app.example/webhooks/email', { method: 'POST', headers: { 'x-sig': sig, 'content-type': 'application/json' }, body }));
  const delivered = JSON.stringify({ type: 'email.delivered', created_at: '2026-10-11T00:00:00.000Z', data: { email_id: providerId, created_at: '2026-10-11T00:00:00.000Z' } });

  let response = await post(delivered, 'bad');
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid-signature' });
  assert.equal((await outbox.get('h')).status, 'sent');
  response = await post(delivered);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { applied: true, known: true });
  assert.equal(seen.at(-1), delivered, 'verify receives the exact raw body');
  assert.deepEqual(await (await post(delivered)).json(), { applied: false, known: true }, 'replay');
  const bounced = { type: 'email.bounced', created_at: '2026-10-11T00:00:01.000Z', data: { email_id: providerId, bounce: { type: 'Permanent' } } };
  assert.deepEqual(await (await post(JSON.stringify(bounced))).json(), { applied: true, known: true });
  await assert.rejects(outbox.enqueue({ key: 'h2', to: 'h@example.com', template: 'welcome', data: { name: 'H' } }), { code: 'suppressed' });

  assert.deepEqual(await (await post('{not json')).json(), { error: 'invalid-json' });
  assert.equal((await post('{"type":"email.delivered","data":{}}')).status, 400);
  assert.deepEqual(await (await post('{"type":"email.opened","data":{}}')).json(), { ignored: true });
  assert.equal((await post('x'.repeat(4096))).status, 413);
  assert.equal((await handler(new Request('https://app.example/webhooks/email'))).status, 405);
});
