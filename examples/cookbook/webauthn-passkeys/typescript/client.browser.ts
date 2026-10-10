// SPDX-License-Identifier: Apache-2.0
// Browser side: pass server options to navigator.credentials via
// @simplewebauthn/browser, then POST the JSON result back for verification.
// (Without a library, use PublicKeyCredential.parseCreationOptionsFromJSON /
// parseRequestOptionsFromJSON and credential.toJSON() where supported.)
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';

async function postJSON(url: string, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export async function registerPasskey(): Promise<void> {
  if (!browserSupportsWebAuthn()) throw new Error('WebAuthn unavailable');
  const optionsJSON = await postJSON('/webauthn/register/options');
  const attestation = await startRegistration({ optionsJSON }); // navigator.credentials.create
  await postJSON('/webauthn/register/verify', attestation);
}

export async function signInWithPasskey(useAutofill = false): Promise<void> {
  const optionsJSON = await postJSON('/webauthn/login/options');
  // useAutofill requires <input autocomplete="username webauthn"> on the page.
  const assertion = await startAuthentication({ optionsJSON, useBrowserAutofill: useAutofill });
  await postJSON('/webauthn/login/verify', assertion);
}
