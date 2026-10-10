// SPDX-License-Identifier: Apache-2.0
// Thin passkey (WebAuthn) relying-party wrapper over @simplewebauthn/server.
// The library performs every protocol check. This file fixes RP settings,
// requests discoverable credentials with user verification, and returns the
// record to persist. Store each challenge server-side and consume it once.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

export interface RelyingParty {
  rpId: string; // registrable domain, e.g. "example.com"
  rpName: string;
  origins: string[]; // exact origins, e.g. ["https://example.com"]
}

export interface StoredCredential {
  credentialId: string; // base64url
  publicKey: Uint8Array; // COSE_Key bytes
  signCount: number;
  userId: string; // base64url user handle
  transports: string[];
  backedUp: boolean;
}

export async function registrationOptions(
  rp: RelyingParty,
  userId: Uint8Array,
  userName: string,
  existing: StoredCredential[] = [],
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  // Persist options.challenge in the session; send the whole object to the browser.
  return generateRegistrationOptions({
    rpID: rp.rpId,
    rpName: rp.rpName,
    userID: userId as Uint8Array<ArrayBuffer>,
    userName,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports })),
  });
}

export async function verifyRegistration(
  rp: RelyingParty,
  response: RegistrationResponseJSON,
  expectedChallenge: string,
  userId: string,
): Promise<StoredCredential> {
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rp.origins,
    expectedRPID: rp.rpId,
    requireUserVerification: true,
  });
  if (!result.verified) throw new Error('registration not verified');
  const info = result.registrationInfo;
  return {
    credentialId: info.credential.id,
    publicKey: info.credential.publicKey,
    signCount: info.credential.counter,
    userId,
    transports: response.response.transports ?? [],
    backedUp: info.credentialBackedUp,
  };
}

export async function authenticationOptions(
  rp: RelyingParty,
  allowed: StoredCredential[] = [], // empty = usernameless (discoverable) sign-in
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: rp.rpId,
    userVerification: 'required',
    allowCredentials: allowed.map((c) => ({ id: c.credentialId, transports: c.transports })),
  });
}

/**
 * Look `stored` up by response.id first and, when response.response.userHandle
 * is present, check it equals stored.userId. Persist the returned record.
 */
export async function verifyAuthentication(
  rp: RelyingParty,
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  stored: StoredCredential,
): Promise<StoredCredential> {
  if (response.id !== stored.credentialId) throw new Error('credential id mismatch');
  const handle = response.response.userHandle;
  if (handle !== undefined && handle !== stored.userId) throw new Error('user handle mismatch');
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rp.origins,
    expectedRPID: rp.rpId,
    requireUserVerification: true,
    credential: {
      id: stored.credentialId,
      publicKey: stored.publicKey as Uint8Array<ArrayBuffer>,
      counter: stored.signCount,
      transports: stored.transports,
    },
  });
  if (!result.verified) throw new Error('authentication not verified');
  return {
    ...stored,
    signCount: result.authenticationInfo.newCounter,
    backedUp: result.authenticationInfo.credentialBackedUp,
  };
}
