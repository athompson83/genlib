// SPDX-License-Identifier: Apache-2.0
// Local-only test: generates RSA keys, serves a JWKS from 127.0.0.1, signs tokens and verifies them.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { generateKeyPair, exportJWK, SignJWT, type JWK } from "jose";
import { createOidcVerifier } from "./oidc.ts";

const ISS = "https://idp.example.test";
const AUD = "client-123";
let server: Server;
let jwksUrl: string;
let keys: { kid: string; priv: CryptoKey; jwk: JWK }[] = [];
let fetches = 0;

async function addKey(kid: string) {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" };
  keys.push({ kid, priv: privateKey, jwk });
  return privateKey;
}

function sign(priv: CryptoKey, kid: string, claims: Record<string, unknown> = {}, alg = "RS256") {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ nonce: "n-1", ...claims })
    .setProtectedHeader({ alg, kid, typ: "JWT" })
    .setIssuer((claims.iss as string) ?? ISS)
    .setAudience((claims.aud as string) ?? AUD)
    .setSubject("user-1")
    .setIssuedAt(now)
    .setNotBefore((claims.nbf as number) ?? now)
    .setExpirationTime((claims.exp as number) ?? now + 300)
    .sign(priv);
}

before(async () => {
  await addKey("k1");
  server = createServer((_req, res) => {
    fetches++;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: keys.map((k) => k.jwk) }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  jwksUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks`;
});
after(() => server.close());

test("verifies a valid token, rejects bad iss/aud/exp/nonce/alg, handles kid rotation", async () => {
  const verify = createOidcVerifier({ issuer: ISS, audience: AUD, jwksUri: jwksUrl, clockToleranceSec: 5, cooldownMs: 0 });
  const k1 = keys[0];

  const ok = await verify(await sign(k1.priv, "k1"), { nonce: "n-1" });
  assert.equal(ok.ok, true);

  const now = Math.floor(Date.now() / 1000);
  assert.deepEqual((await verify(await sign(k1.priv, "k1", { aud: "other" }))).ok, false);
  assert.deepEqual((await verify(await sign(k1.priv, "k1", { iss: "https://evil.test" }))).ok, false);
  const expired = await verify(await sign(k1.priv, "k1", { exp: now - 30, nbf: now - 60 }));
  assert.equal(expired.ok === false && expired.code, "ERR_JWT_EXPIRED");
  // within leeway: expired 2s ago, tolerance 5s
  assert.equal((await verify(await sign(k1.priv, "k1", { exp: now - 2, nbf: now - 60 }))).ok, true);
  const future = await verify(await sign(k1.priv, "k1", { nbf: now + 120 }));
  assert.equal(future.ok, false);
  const nonce = await verify(await sign(k1.priv, "k1"), { nonce: "other" });
  assert.equal(nonce.ok === false && nonce.code, "ERR_NONCE_MISMATCH");

  // alg not in allow-list (HS256 with a guessed secret) must fail
  const hs = await new SignJWT({}).setProtectedHeader({ alg: "HS256", kid: "k1" }).setIssuer(ISS).setAudience(AUD)
    .setSubject("x").setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode("x".repeat(32)));
  assert.equal((await verify(hs)).ok, false);
  // tampered signature
  const good = await sign(k1.priv, "k1");
  const tampered = good.slice(0, -4) + (good.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.equal((await verify(tampered)).ok, false);

  // rotation: a new kid appears at the IdP; verifier refetches JWKS once
  const before = fetches;
  const k2 = await addKey("k2");
  assert.equal((await verify(await sign(k2, "k2"))).ok, true);
  assert.ok(fetches > before, "JWKS should be refetched on unknown kid");
  // unknown kid that never appears fails closed
  const stranger = (await generateKeyPair("RS256")).privateKey;
  const nokey = await verify(await sign(stranger, "k-unknown"));
  assert.equal(nokey.ok === false && nokey.code, "ERR_JWKS_NO_MATCHING_KEY");

  assert.throws(() => createOidcVerifier({ issuer: ISS, audience: AUD, jwksUri: jwksUrl, algorithms: ["HS256"] }));
});
