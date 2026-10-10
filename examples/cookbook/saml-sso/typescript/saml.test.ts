// SPDX-License-Identifier: Apache-2.0
// Local-only test: self-signed IdP cert, AuthnRequest from the SP, a signed Response built
// and signed in-process with xml-crypto (dev dependency, acting as a fake IdP).
import "reflect-metadata"; // required by @peculiar/x509 2.x
import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto, randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import * as x509 from "@peculiar/x509";
import { SignedXml } from "xml-crypto";
import { createSamlSp } from "./saml.ts";

x509.cryptoProvider.set(webcrypto as unknown as Crypto);
const ACS = "https://sp.example.test/saml/acs";
const SP = "https://sp.example.test/metadata";
const IDP = "https://idp.example.test/metadata";

async function makeIdpKey() {
  const alg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048 };
  const keys = (await webcrypto.subtle.generateKey(alg, true, ["sign", "verify"])) as unknown as CryptoKeyPair;
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01", name: "CN=Test IdP", notBefore: new Date(Date.now() - 3600e3), notAfter: new Date(Date.now() + 86400e3),
    signingAlgorithm: alg, keys,
  });
  const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", keys.privateKey as never)).toString("base64");
  const keyPem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  return { certPem: cert.toString("pem"), keyPem };
}

function iso(offsetSec: number) { return new Date(Date.now() + offsetSec * 1000).toISOString(); }

function buildResponse(o: { inResponseTo: string; audience?: string; recipient?: string; destination?: string; notOnOrAfter?: string; nameId?: string }) {
  const aid = "_a" + randomUUID();
  return `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r${randomUUID()}" Version="2.0" IssueInstant="${iso(0)}" Destination="${o.destination ?? ACS}" InResponseTo="${o.inResponseTo}">` +
    `<saml:Issuer>${IDP}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
    `<saml:Assertion ID="${aid}" Version="2.0" IssueInstant="${iso(0)}"><saml:Issuer>${IDP}</saml:Issuer>` +
    `<saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${o.nameId ?? "alice@example.test"}</saml:NameID>` +
    `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${o.notOnOrAfter ?? iso(300)}" Recipient="${o.recipient ?? ACS}" InResponseTo="${o.inResponseTo}"/></saml:SubjectConfirmation></saml:Subject>` +
    `<saml:Conditions NotBefore="${iso(-60)}" NotOnOrAfter="${o.notOnOrAfter ?? iso(300)}"><saml:AudienceRestriction><saml:Audience>${o.audience ?? SP}</saml:Audience></saml:AudienceRestriction></saml:Conditions>` +
    `<saml:AuthnStatement AuthnInstant="${iso(0)}" SessionIndex="${aid}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>` +
    `</saml:Assertion></samlp:Response>`;
}

function signAssertion(xml: string, keyPem: string, certPem: string) {
  const sig = new SignedXml({ privateKey: keyPem, publicCert: certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#" });
  sig.addReference({ xpath: "//*[local-name(.)='Assertion']", digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"] });
  sig.computeSignature(xml, { location: { reference: "//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']", action: "after" } });
  return Buffer.from(sig.getSignedXml()).toString("base64");
}

async function requestIdFrom(url: string) {
  const req = new URL(url).searchParams.get("SAMLRequest")!;
  const xml = inflateRawSync(Buffer.from(req, "base64")).toString("utf8");
  assert.match(xml, /<samlp:AuthnRequest/);
  assert.ok(xml.includes(`AssertionConsumerServiceURL="${ACS}"`));
  return /ID="([^"]+)"/.exec(xml)![1];
}

test("AuthnRequest + signed response validation with negative cases", async () => {
  const idp = await makeIdpKey();
  const other = await makeIdpKey();
  const sp = createSamlSp({ spEntityId: SP, acsUrl: ACS, idpSsoUrl: "https://idp.example.test/sso", idpEntityId: IDP, idpCertsPem: [idp.certPem] });
  assert.match(sp.metadata(), /AssertionConsumerService/);

  const url = await sp.loginRedirectUrl("rs-1");
  assert.ok(url.startsWith("https://idp.example.test/sso?"));
  const id1 = await requestIdFrom(url);
  const okResp = signAssertion(buildResponse({ inResponseTo: id1 }), idp.keyPem, idp.certPem);
  const profile = await sp.validatePostedResponse(okResp);
  assert.equal(profile.nameID, "alice@example.test");
  // replay of the same response: request ID was consumed
  await assert.rejects(sp.validatePostedResponse(okResp), /InResponseTo/);
  // unsolicited response (unknown request ID)
  await assert.rejects(sp.validatePostedResponse(signAssertion(buildResponse({ inResponseTo: "_never" }), idp.keyPem, idp.certPem)));

  const cases: [string, (id: string) => string, RegExp][] = [
    ["wrong audience", (id) => signAssertion(buildResponse({ inResponseTo: id, audience: "https://other-sp" }), idp.keyPem, idp.certPem), /audience/i],
    ["expired", (id) => signAssertion(buildResponse({ inResponseTo: id, notOnOrAfter: iso(-600) }), idp.keyPem, idp.certPem), /expired|NotOnOrAfter|subject confirmation/i],
    ["wrong recipient", (id) => signAssertion(buildResponse({ inResponseTo: id, recipient: "https://evil/acs" }), idp.keyPem, idp.certPem), /Recipient/],
    ["wrong destination", (id) => signAssertion(buildResponse({ inResponseTo: id, destination: "https://evil/acs" }), idp.keyPem, idp.certPem), /Destination/],
    ["untrusted signer", (id) => signAssertion(buildResponse({ inResponseTo: id }), other.keyPem, other.certPem), /signature/i],
    ["tampered after signing", (id) => {
      const b64 = signAssertion(buildResponse({ inResponseTo: id }), idp.keyPem, idp.certPem);
      return Buffer.from(Buffer.from(b64, "base64").toString().replace("alice@example.test", "admin@example.test")).toString("base64");
    }, /signature/i],
  ];
  for (const [name, make, re] of cases) {
    const id = await requestIdFrom(await sp.loginRedirectUrl("rs"));
    await assert.rejects(sp.validatePostedResponse(make(id)), re, name);
  }
});
