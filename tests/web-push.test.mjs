// SPDX-License-Identifier: Apache-2.0
// web-push: RFC 8291 test vector, encrypt/decrypt round trip, VAPID JWT (RFC 8292), send option validation,
// payload limit, push service status handling with a fake fetch, subscription validation and dedupe, the HTTP
// routes and the service worker snippet's same-origin rule. No network.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_PAYLOAD_BYTES, base64UrlDecode, base64UrlEncode, concat, createVapidJwt, encryptPushPayload, generateVapidKeys,
  importVapidSigningKey, pointToJwk,
} from '../.build/modules/web-push/files/crypto.js';
import { createWebPush, WebPushError } from '../.build/modules/web-push/files/push.js';
import { MemoryPushSubscriptionStore } from '../.build/modules/web-push/files/memory-store.js';
import { createWebPushHandler } from '../.build/modules/web-push/files/http.js';
import { serviceWorkerSnippet } from '../.build/modules/web-push/files/sw-snippet.js';

const b64 = value => base64UrlDecode(value.replace(/\s+/g, ''));
const enc = new TextEncoder();

// RFC 8291 Section 5 and Appendix A, copied from https://www.rfc-editor.org/rfc/rfc8291.txt (whitespace removed).
const RFC = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  header: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z 9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz AC8wEqKK6PBru3jl7A8',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs bI_0LpXMuGvnzQ',
  body: `DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml
         mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT
         pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN`,
};

const importEcdhPrivate = (d, publicKey) =>
  crypto.subtle.importKey('jwk', { ...pointToJwk(b64(publicKey)), d }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// Independent receiver-side decryptor (the user agent's half of RFC 8291 / RFC 8188).
async function decrypt(body, uaPrivateKey, uaPublic, auth) {
  const salt = body.subarray(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  assert.equal(rs, 4096);
  assert.equal(idlen, 65);
  assert.ok(ciphertext.length <= rs, 'one record');
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPrivateKey, 256));
  const ikm = await hkdf(auth, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt.slice(), ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt.slice(), ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end -= 1;
  assert.equal(padded[end], 2, 'last-record padding delimiter');
  return padded.slice(0, end);
}

async function browserKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { privateKey: pair.privateKey, publicKey, auth, json: { p256dh: base64UrlEncode(publicKey), auth: base64UrlEncode(auth) } };
}

test('RFC 8291 Section 5 / Appendix A example: exact header, ciphertext and body bytes', async () => {
  const privateKey = await importEcdhPrivate(RFC.asPrivate, RFC.asPublic);
  const body = await encryptPushPayload(b64(RFC.plaintext), b64(RFC.uaPublic), b64(RFC.auth), {
    salt: b64(RFC.salt), serverKeys: { privateKey, publicKey: b64(RFC.asPublic) },
  });
  // 86 header + 41 plaintext + 1 delimiter + 16 tag. The example's "Content-Length: 145" line disagrees with its
  // own 192-character base64url body (144 octets); the body bytes below are what this test checks.
  assert.equal(body.length, 144);
  assert.deepEqual(body.subarray(0, 86), b64(RFC.header));
  assert.deepEqual(body.subarray(86), b64(RFC.ciphertext));
  assert.deepEqual(body, b64(RFC.body));
  assert.equal(new TextDecoder().decode(b64(RFC.plaintext)), 'When I grow up, I want to be a watermelon');
  // The receiver's private key from the RFC decrypts it with the independent decryptor.
  const uaPrivate = await importEcdhPrivate(RFC.uaPrivate, RFC.uaPublic);
  assert.deepEqual(await decrypt(body, uaPrivate, b64(RFC.uaPublic), b64(RFC.auth)), b64(RFC.plaintext));
});

test('encrypt -> decrypt round trip with fresh keys, random salt each time, and the payload limit', async () => {
  const ua = await browserKeys();
  const message = enc.encode(JSON.stringify({ title: 'Hi', body: 'é ✓' }));
  const one = await encryptPushPayload(message, ua.publicKey, ua.auth);
  const two = await encryptPushPayload(message, ua.publicKey, ua.auth);
  assert.notDeepEqual(one.subarray(0, 86), two.subarray(0, 86), 'fresh salt and ephemeral key per message');
  assert.deepEqual(await decrypt(one, ua.privateKey, ua.publicKey, ua.auth), message);
  const largest = new Uint8Array(MAX_PAYLOAD_BYTES).fill(7);
  const body = await encryptPushPayload(largest, ua.publicKey, ua.auth);
  assert.equal(MAX_PAYLOAD_BYTES, 3993);
  assert.equal(body.length, 4096, 'the largest payload fills exactly 4096 octets');
  assert.deepEqual(await decrypt(body, ua.privateKey, ua.publicKey, ua.auth), largest);
  await assert.rejects(encryptPushPayload(new Uint8Array(MAX_PAYLOAD_BYTES + 1), ua.publicKey, ua.auth), RangeError);
  await assert.rejects(encryptPushPayload(message, ua.publicKey, new Uint8Array(15)), TypeError);
  await assert.rejects(encryptPushPayload(message, new Uint8Array(65).fill(4), ua.auth), 'a point off the curve is refused');
});

function decodeJwt(jwt) {
  const [header, payload, signature] = jwt.split('.');
  const json = part => JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));
  return { header: json(header), payload: json(payload), signature: base64UrlDecode(signature), signingInput: `${header}.${payload}` };
}

async function verifyJwt(jwt, publicKey) {
  const key = await crypto.subtle.importKey('raw', base64UrlDecode(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const { signature, signingInput } = decodeJwt(jwt);
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, enc.encode(signingInput));
}

test('VAPID: key generation, ES256 JWT structure, raw r||s signature verifies, expiry bounded to 24 hours', async () => {
  const keys = await generateVapidKeys();
  assert.equal(base64UrlDecode(keys.publicKey).length, 65);
  assert.equal(base64UrlDecode(keys.privateKey).length, 32);
  const signingKey = await importVapidSigningKey(keys);
  const now = 1_700_000_000_000;
  const jwt = await createVapidJwt(signingKey, { audience: 'https://fcm.googleapis.com/fcm/send/abc', subject: 'mailto:ops@example.com', now });
  const { header, payload, signature } = decodeJwt(jwt);
  assert.deepEqual(header, { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(payload, { aud: 'https://fcm.googleapis.com', exp: 1_700_000_000 + 43_200, sub: 'mailto:ops@example.com' });
  assert.equal(signature.length, 64, 'JOSE raw r||s, not DER');
  assert.equal(await verifyJwt(jwt, keys.publicKey), true);
  const other = await generateVapidKeys();
  assert.equal(await verifyJwt(jwt, other.publicKey), false);
  const max = decodeJwt(await createVapidJwt(signingKey, { audience: 'https://x.example', subject: 'https://example.com/contact', now, ttlSeconds: 86_400 }));
  assert.equal(max.payload.exp - now / 1000, 86_400);
  await assert.rejects(createVapidJwt(signingKey, { audience: 'https://x.example', subject: 'mailto:a@b.c', now, ttlSeconds: 86_401 }), RangeError);
  await assert.rejects(createVapidJwt(signingKey, { audience: 'https://x.example', subject: 'http://example.com', now }), TypeError);
  await assert.rejects(importVapidSigningKey({ publicKey: keys.publicKey, privateKey: other.privateKey }), 'mismatched key pair is refused');
});

const ENDPOINT = id => `https://fcm.googleapis.com/fcm/send/${id}`;

async function setup({ responses = {}, ...extra } = {}) {
  const vapid = { ...(await generateVapidKeys()), subject: 'mailto:ops@example.com' };
  const store = new MemoryPushSubscriptionStore();
  const calls = [];
  let now = 1_700_000_000_000;
  let inFlight = 0;
  let peak = 0;
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise(resolve => setTimeout(resolve, 2));
    inFlight -= 1;
    const reply = responses[url] ?? { status: 201 };
    if (reply.throws) throw new TypeError('fetch failed');
    return new Response(reply.body ?? null, { status: reply.status, headers: reply.headers ?? {} });
  };
  const webPush = createWebPush({ vapid, store, fetch: fakeFetch, now: () => now, ...extra });
  return { vapid, store, calls, webPush, peak: () => peak, advance: ms => { now += ms; } };
}

test('subscription validation, endpoint allow-list and dedupe on endpoint', async () => {
  const { webPush, store } = await setup();
  const ua = await browserKeys();
  const sub = { endpoint: ENDPOINT('a'), keys: ua.json, expirationTime: null };
  const first = await webPush.subscribe('u1', sub);
  assert.equal(first.failureCount, 0);
  await webPush.subscribe('u1', sub);
  assert.equal((await store.listByUser('u1')).length, 1, 'same endpoint is one row');
  await webPush.subscribe('u2', sub);
  assert.equal((await store.listByUser('u1')).length, 0, 'the endpoint moves to the newly signed-in user');
  assert.equal((await store.listByUser('u2'))[0].createdAt, first.createdAt);
  await webPush.subscribe('u1', { endpoint: 'https://web.push.apple.com/QGx', keys: ua.json });
  await webPush.subscribe('u1', { endpoint: 'https://wns2-par02p.notify.windows.com/w/?token=x', keys: ua.json });

  const bad = async (value, code) => assert.rejects(webPush.subscribe('u1', value), error => error instanceof WebPushError && error.code === code);
  await bad(null, 'invalid-subscription');
  await bad({ endpoint: 'http://fcm.googleapis.com/x', keys: ua.json }, 'invalid-endpoint');
  await bad({ endpoint: 'https://user:pw@fcm.googleapis.com/x', keys: ua.json }, 'invalid-endpoint');
  await bad({ endpoint: 'not a url', keys: ua.json }, 'invalid-endpoint');
  await bad({ endpoint: 'https://evil.example/push', keys: ua.json }, 'endpoint-not-allowed');
  await bad({ endpoint: 'https://notify.windows.com.evil.example/x', keys: ua.json }, 'endpoint-not-allowed');
  await bad({ endpoint: ENDPOINT('b') }, 'invalid-keys');
  await bad({ endpoint: ENDPOINT('b'), keys: { p256dh: ua.json.p256dh, auth: 'AAAA' } }, 'invalid-keys');
  await bad({ endpoint: ENDPOINT('b'), keys: { p256dh: base64UrlEncode(new Uint8Array(65).fill(4)), auth: ua.json.auth } }, 'invalid-keys');
  await bad({ endpoint: ENDPOINT('b'), keys: { p256dh: 'not*base64', auth: ua.json.auth } }, 'invalid-keys');
  await assert.rejects(webPush.subscribe('', sub), { code: 'invalid-user' });

  const open = (await setup({ allowAnyHttpsEndpoint: true })).webPush;
  await open.subscribe('u1', { endpoint: 'https://push.self-hosted.example/x', keys: ua.json });
  const custom = (await setup({ allowedHosts: ['.push.example'] })).webPush;
  await custom.subscribe('u1', { endpoint: 'https://eu.push.example/x', keys: ua.json });
  await assert.rejects(custom.subscribe('u1', sub), { code: 'endpoint-not-allowed' });

  assert.equal(await webPush.unsubscribe(ENDPOINT('a'), 'u1'), false, 'only the owner removes it');
  assert.equal(await webPush.unsubscribe(ENDPOINT('a'), 'u2'), true);
  assert.equal(await webPush.unsubscribe(ENDPOINT('a')), false);
  assert.throws(() => createWebPush({ vapid: { publicKey: 'x', privateKey: 'y', subject: 'ops@example.com' }, store, fetch }), { code: 'invalid-vapid' });
});

test('send: headers, VAPID authorization, encrypted body the browser can decrypt', async () => {
  const { webPush, calls, vapid } = await setup();
  const ua = await browserKeys();
  await webPush.subscribe('u1', { endpoint: ENDPOINT('a'), keys: ua.json });
  const results = await webPush.send('u1', { title: 'Hello', url: '/inbox' }, { ttl: 60, urgency: 'high', topic: 'inbox-update' });
  assert.deepEqual(results, [{ userId: 'u1', endpoint: ENDPOINT('a'), ok: true, outcome: 'sent', status: 201, removed: false }]);
  const { url, init } = calls[0];
  assert.equal(url, ENDPOINT('a'));
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.ttl, '60');
  assert.equal(init.headers.urgency, 'high');
  assert.equal(init.headers.topic, 'inbox-update');
  assert.equal(init.headers['content-encoding'], 'aes128gcm');
  const match = /^vapid t=([^,]+), k=(.+)$/.exec(init.headers.authorization);
  assert.ok(match);
  assert.equal(match[2], vapid.publicKey);
  assert.equal(await verifyJwt(match[1], vapid.publicKey), true);
  assert.equal(decodeJwt(match[1]).payload.aud, 'https://fcm.googleapis.com');
  const plain = await decrypt(init.body, ua.privateKey, ua.publicKey, ua.auth);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(plain)), { title: 'Hello', url: '/inbox' });
  await webPush.send('u1', 'plain', { ttl: 0 });
  assert.equal(calls[1].init.headers.urgency, 'normal');
  assert.equal('topic' in calls[1].init.headers, false);
});

test('topic, urgency, ttl and payload size are validated before anything is sent', async () => {
  const { webPush, calls } = await setup();
  const ua = await browserKeys();
  await webPush.subscribe('u1', { endpoint: ENDPOINT('a'), keys: ua.json });
  const code = c => error => error instanceof WebPushError && error.code === c;
  await assert.rejects(webPush.send('u1', 'x', { ttl: 60, topic: 'a'.repeat(33) }), code('invalid-topic'));
  await assert.rejects(webPush.send('u1', 'x', { ttl: 60, topic: 'has space' }), code('invalid-topic'));
  await assert.rejects(webPush.send('u1', 'x', { ttl: 60, topic: 'a+b/c=' }), code('invalid-topic'));
  await assert.rejects(webPush.send('u1', 'x', { ttl: 60, topic: '' }), code('invalid-topic'));
  await assert.rejects(webPush.send('u1', 'x', { ttl: 60, urgency: 'urgent' }), code('invalid-urgency'));
  await assert.rejects(webPush.send('u1', 'x', { ttl: -1 }), code('invalid-ttl'));
  await assert.rejects(webPush.send('u1', 'x', { ttl: 1.5 }), code('invalid-ttl'));
  await assert.rejects(webPush.send('u1', 'x', { ttl: 2_419_201 }), code('invalid-ttl'));
  await assert.rejects(webPush.send('u1', 'x'.repeat(3994), { ttl: 60 }), code('payload-too-large'));
  await assert.rejects(webPush.send('u1', 'é'.repeat(1997), { ttl: 60 }), code('payload-too-large'), 'limit counts UTF-8 bytes');
  assert.equal(calls.length, 0);
  for (const urgency of ['very-low', 'low', 'normal', 'high']) await webPush.send('u1', 'x', { ttl: 60, urgency, topic: 'A-z_09'.repeat(5) + 'ab' });
  await webPush.send('u1', 'x'.repeat(3993), { ttl: 60 });
  assert.equal(calls.length, 5);
});

test('push service statuses: 404/410 delete the subscription, 413, 429 retry-after, VAPID errors, 5xx and network', async () => {
  const responses = {
    [ENDPOINT('ok')]: { status: 202 },
    [ENDPOINT('gone')]: { status: 410 },
    [ENDPOINT('missing')]: { status: 404 },
    [ENDPOINT('big')]: { status: 413 },
    [ENDPOINT('slow')]: { status: 429, headers: { 'retry-after': '120' } },
    [ENDPOINT('slowdate')]: { status: 429, headers: { 'retry-after': new Date(1_700_000_030_000).toUTCString() } },
    [ENDPOINT('vapid400')]: { status: 400, body: 'bad jwt' },
    [ENDPOINT('vapid403')]: { status: 403 },
    [ENDPOINT('down')]: { status: 503 },
    [ENDPOINT('net')]: { throws: true },
  };
  const { webPush, store } = await setup({ responses });
  const ua = await browserKeys();
  for (const id of Object.keys(responses)) await webPush.subscribe('u1', { endpoint: id, keys: ua.json });
  const results = await webPush.send('u1', 'hi', { ttl: 60 });
  const by = Object.fromEntries(results.map(r => [r.endpoint.split('/').pop(), r]));
  assert.equal(by.ok.outcome, 'sent');
  assert.deepEqual([by.gone.outcome, by.gone.removed, by.missing.outcome, by.missing.removed], ['gone', true, 'gone', true]);
  assert.equal(by.big.outcome, 'too-large');
  assert.deepEqual([by.slow.outcome, by.slow.retryAfterSeconds], ['rate-limited', 120]);
  assert.equal(by.slowdate.retryAfterSeconds, 30);
  assert.deepEqual([by.vapid400.outcome, by.vapid403.outcome], ['vapid-error', 'vapid-error']);
  assert.equal(by.down.outcome, 'server-error');
  assert.equal(by.net.outcome, 'network-error');
  assert.equal(by.net.status, undefined);
  const left = new Map((await store.listByUser('u1')).map(s => [s.endpoint.split('/').pop(), s]));
  assert.equal(left.has('gone') || left.has('missing'), false, '404 and 410 subscriptions are deleted');
  assert.equal(left.size, 8);
  assert.equal(left.get('ok').lastSuccessAt, 1_700_000_000_000);
  assert.equal(left.get('ok').failureCount, 0);
  assert.equal(left.get('net').failureCount, 1);
  assert.equal(left.get('slow').failureCount, 1);
});

test('sendMany delivers to every user with bounded concurrency', async () => {
  const { webPush, calls, peak } = await setup({ concurrency: 3 });
  const ua = await browserKeys();
  for (let i = 0; i < 12; i += 1) await webPush.subscribe(`u${i % 4}`, { endpoint: ENDPOINT(`e${i}`), keys: ua.json });
  const results = await webPush.sendMany(['u0', 'u1', 'u2', 'u3', 'u0'], 'news', { ttl: 3600, urgency: 'low' });
  assert.equal(results.length, 12, 'duplicate user ids are sent once');
  assert.ok(results.every(r => r.ok));
  assert.equal(calls.length, 12);
  assert.ok(peak() <= 3 && peak() >= 2, `peak concurrency ${peak()}`);
  assert.deepEqual(await webPush.send('nobody', 'x', { ttl: 1 }), []);
  assert.throws(() => createWebPush({ vapid: { publicKey: 'x', privateKey: 'y', subject: 'mailto:a@b.c' }, store: null, fetch, concurrency: 0 }), { code: 'invalid-concurrency' });
});

test('HTTP routes: public key, subscribe, unsubscribe, origin check, auth, no-store', async () => {
  const { webPush, store, vapid } = await setup();
  const ua = await browserKeys();
  const handler = createWebPushHandler({
    webPush, prefix: '/api/push/', allowedOrigins: ['https://app.example'],
    authenticate: async request => (request.headers.get('x-user') ? { userId: request.headers.get('x-user') } : null),
  });
  const call = (method, path, { body, user = 'u1', origin = 'https://app.example', type = 'application/json' } = {}) =>
    handler(new Request(`https://app.example/api/push${path}`, {
      method, headers: { ...(user ? { 'x-user': user } : {}), ...(origin ? { origin } : {}), 'content-type': type },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }));
  const key = await call('GET', '/vapid-public-key', { user: null, origin: null });
  assert.equal(key.status, 200);
  assert.equal(key.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await key.json(), { publicKey: vapid.publicKey });

  const sub = { endpoint: ENDPOINT('h'), keys: ua.json, expirationTime: null };
  const created = await call('POST', '/subscriptions', { body: sub });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await created.json(), { subscription: { endpoint: ENDPOINT('h'), createdAt: 1_700_000_000_000 } });
  assert.equal((await store.listByUser('u1')).length, 1);

  assert.equal((await call('POST', '/subscriptions', { body: sub, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('POST', '/subscriptions', { body: sub, origin: null })).status, 403);
  assert.equal((await call('POST', '/subscriptions', { body: sub, user: null })).status, 401);
  assert.equal((await call('POST', '/subscriptions', { body: '{', })).status, 400);
  assert.equal((await call('POST', '/subscriptions', { body: sub, type: 'text/plain' })).status, 400);
  assert.equal((await call('POST', '/subscriptions', { body: { ...sub, pad: 'x'.repeat(9000) } })).status, 400);
  const notAllowed = await call('POST', '/subscriptions', { body: { ...sub, endpoint: 'https://evil.example/p' } });
  assert.deepEqual([notAllowed.status, (await notAllowed.json()).error], [422, 'endpoint-not-allowed']);
  assert.equal((await call('POST', '/subscriptions', { body: { endpoint: ENDPOINT('k') } })).status, 400);
  assert.equal((await call('GET', '/subscriptions')).status, 405);
  assert.equal((await call('POST', '/vapid-public-key')).status, 405);
  assert.equal((await call('GET', '/other')).status, 404);

  const otherUser = await call('DELETE', '/subscriptions', { body: { endpoint: ENDPOINT('h') }, user: 'u2' });
  assert.deepEqual(await otherUser.json(), { removed: false });
  const removed = await call('DELETE', '/subscriptions', { body: { endpoint: ENDPOINT('h') } });
  assert.equal(removed.status, 200);
  assert.deepEqual(await removed.json(), { removed: true });
  assert.equal((await store.listByUser('u1')).length, 0);
});

function loadServiceWorker(origin = 'https://app.example') {
  const listeners = {};
  const shown = [];
  const opened = [];
  const focused = [];
  const windows = [];
  const self = {
    location: { origin },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    registration: { showNotification: async (title, options) => { shown.push({ title, options }); } },
    clients: {
      matchAll: async () => windows,
      openWindow: async url => { opened.push(url); },
    },
  };
  new Function('self', serviceWorkerSnippet)(self);
  const fire = async (type, event) => {
    let pending = Promise.resolve();
    listeners[type]({ ...event, waitUntil: p => { pending = p; } });
    await pending;
  };
  return {
    shown, opened, focused, windows,
    push: data => fire('push', { data: data === undefined ? null : { json: () => JSON.parse(data), text: () => data } }),
    click: url => fire('notificationclick', { notification: { data: { url }, close() {} } }),
  };
}

test('service worker snippet: shows notifications and only opens same-origin URLs', async () => {
  const sw = loadServiceWorker();
  await sw.push(JSON.stringify({ title: 'New reply', body: 'Bob answered', url: '/threads/9?x=1', icon: 'https://cdn.evil.example/i.png' }));
  assert.equal(sw.shown[0].title, 'New reply');
  assert.deepEqual(sw.shown[0].options, { body: 'Bob answered', data: { url: 'https://app.example/threads/9?x=1' } });
  await sw.push(JSON.stringify({ title: 'Phish', url: 'https://evil.example/login' }));
  assert.equal(sw.shown[1].options.data.url, null, 'cross-origin url is dropped when shown');
  await sw.push('not json');
  assert.deepEqual([sw.shown[2].title, sw.shown[2].options.body], ['Notification', 'not json']);
  await sw.push(undefined);
  assert.equal(sw.shown[3].options.data.url, 'https://app.example/');

  for (const url of ['https://evil.example/', '//evil.example/x', 'javascript:alert(1)', 'data:text/html,hi', 'http://app.example/', 'https://app.example.evil.example/', 42]) {
    await sw.click(url);
  }
  assert.deepEqual(sw.opened, [], 'cross-origin, scheme-changing and non-string URLs open nothing');
  await sw.click('/inbox');
  assert.deepEqual(sw.opened, ['https://app.example/inbox']);
  sw.windows.push({ url: 'https://app.example/inbox', focus: async () => { sw.focused.push('inbox'); } });
  await sw.click('https://app.example/inbox');
  assert.deepEqual(sw.focused, ['inbox']);
  assert.equal(sw.opened.length, 1, 'an open window is focused instead of opening another');
});
