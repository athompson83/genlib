// SPDX-License-Identifier: Apache-2.0
// Run: node --test passkeys.test.ts   (Node 22.18+ strips TypeScript types)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  authenticationOptions,
  registrationOptions,
  verifyAuthentication,
  verifyRegistration,
  type RelyingParty,
} from './passkeys.ts';

const fx = JSON.parse(readFileSync(new URL('../fixtures/passkey-es256-none.json', import.meta.url), 'utf8'));
const rp: RelyingParty = { rpId: fx.rpId, rpName: 'Example', origins: [fx.origin] };
const userId = Buffer.from(fx.userId, 'base64url');

test('registration options', async () => {
  const a = await registrationOptions(rp, userId, 'alice@example.com');
  const b = await registrationOptions(rp, userId, 'alice@example.com');
  assert.equal(a.rp.id, 'example.com');
  assert.equal(a.user.id, fx.userId);
  assert.equal(a.authenticatorSelection?.residentKey, 'required');
  assert.equal(a.authenticatorSelection?.userVerification, 'required');
  assert.ok(Buffer.from(a.challenge, 'base64url').length >= 16);
  assert.notEqual(a.challenge, b.challenge);
});

test('authentication options', async () => {
  const o = await authenticationOptions(rp);
  assert.equal(o.rpId, 'example.com');
  assert.equal(o.userVerification, 'required');
  assert.deepEqual(o.allowCredentials ?? [], []);
});

test('recorded ceremony verifies and updates sign count', async () => {
  const cred = await verifyRegistration(rp, fx.registrationResponse, fx.registrationChallenge, fx.userId);
  assert.equal(cred.credentialId, fx.credentialId);
  assert.equal(Buffer.from(cred.publicKey).toString('base64url'), fx.credentialPublicKeyCose);
  assert.equal(cred.signCount, 0);
  assert.deepEqual(cred.transports, ['internal', 'hybrid']);
  const after = await verifyAuthentication(rp, fx.authenticationResponse, fx.authenticationChallenge, cred);
  assert.equal(after.signCount, fx.expectedSignCountAfterAuthentication);
});

test('rejects wrong challenge, origin and counter regression', async () => {
  await assert.rejects(verifyRegistration(rp, fx.registrationResponse, 'AAAA', fx.userId));
  await assert.rejects(
    verifyRegistration({ ...rp, origins: ['https://evil.example'] }, fx.registrationResponse, fx.registrationChallenge, fx.userId),
  );
  const cred = await verifyRegistration(rp, fx.registrationResponse, fx.registrationChallenge, fx.userId);
  await assert.rejects(verifyAuthentication(rp, fx.authenticationResponse, 'AAAA', cred));
  await assert.rejects(verifyAuthentication(rp, fx.authenticationResponse, fx.authenticationChallenge, { ...cred, signCount: 5 }));
  await assert.rejects(verifyAuthentication(rp, fx.authenticationResponse, fx.authenticationChallenge, { ...cred, userId: 'b3RoZXI' }));
});
