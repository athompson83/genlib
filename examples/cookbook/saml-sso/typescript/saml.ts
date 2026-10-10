// SPDX-License-Identifier: Apache-2.0
// Thin service-provider wrapper around @node-saml/node-saml.
// node-saml does: AuthnRequest + redirect URL, XML signature verification (xml-crypto),
// Issuer, Audience, NotBefore/NotOnOrAfter, InResponseTo (cache-backed, one-time).
// This wrapper adds: Response@Destination and SubjectConfirmationData@Recipient checks,
// which node-saml 5.x does not perform.
import { SAML, ValidateInResponseTo, type Profile, type CacheProvider } from "@node-saml/node-saml";
import { DOMParser } from "@xmldom/xmldom";

const SAMLP = "urn:oasis:names:tc:SAML:2.0:protocol";
const SAML_NS = "urn:oasis:names:tc:SAML:2.0:assertion";

export interface SpConfig {
  spEntityId: string;          // our SP entityID; also used as the expected Audience
  acsUrl: string;              // Assertion Consumer Service URL (HTTP-POST binding)
  idpSsoUrl: string;           // IdP SingleSignOnService (HTTP-Redirect binding)
  idpEntityId: string;         // expected Issuer
  idpCertsPem: string[];       // IdP signing certificate(s); several during rollover
  clockSkewMs?: number;        // default 60 s
  requestIdCache?: CacheProvider; // must be shared (e.g. Redis) when running >1 instance
}

export function createSamlSp(cfg: SpConfig) {
  const saml = new SAML({
    issuer: cfg.spEntityId,
    audience: cfg.spEntityId,
    callbackUrl: cfg.acsUrl,
    entryPoint: cfg.idpSsoUrl,
    idpIssuer: cfg.idpEntityId,
    idpCert: cfg.idpCertsPem,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false, // many IdPs sign only the assertion; set true if yours signs both
    signatureAlgorithm: "sha256",
    acceptedClockSkewMs: cfg.clockSkewMs ?? 60_000,
    validateInResponseTo: ValidateInResponseTo.always, // reject IdP-initiated / unsolicited responses
    requestIdExpirationPeriodMs: 5 * 60_000,
    cacheProvider: cfg.requestIdCache,
    disableRequestedAuthnContext: true,
  });

  return {
    /** Redirect the browser here. RelayState should be an opaque, server-side-mapped value. */
    loginRedirectUrl(relayState: string): Promise<string> {
      return saml.getAuthorizeUrlAsync(relayState, undefined, {});
    },

    /** Validate the POSTed SAMLResponse (base64). Throws on any failure. */
    async validatePostedResponse(samlResponseB64: string): Promise<Profile> {
      const { profile } = await saml.validatePostResponseAsync({ SAMLResponse: samlResponseB64 });
      if (!profile) throw new Error("not a login response");
      // Destination is on the outer Response. If present it must equal our ACS.
      const outer = new DOMParser().parseFromString(Buffer.from(samlResponseB64, "base64").toString("utf8"), "text/xml");
      const resp = outer.documentElement;
      if (!resp || resp.namespaceURI !== SAMLP || resp.localName !== "Response") throw new Error("not a samlp:Response");
      const dest = resp.getAttribute("Destination");
      if (dest && dest !== cfg.acsUrl) throw new Error(`Destination mismatch: ${dest}`);
      // Recipient is read from the assertion that node-saml verified (not from the raw document)
      // to avoid XML signature-wrapping confusion.
      const assertion = new DOMParser().parseFromString(profile.getAssertionXml?.() ?? "", "text/xml");
      const scd = Array.from(assertion.getElementsByTagNameNS(SAML_NS, "SubjectConfirmationData"));
      if (scd.length === 0 || !scd.some((n) => n.getAttribute("Recipient") === cfg.acsUrl)) {
        throw new Error("SubjectConfirmationData Recipient missing or mismatched");
      }
      return profile;
    },

    /** SP metadata XML to hand to the IdP. */
    metadata(): string {
      return saml.generateServiceProviderMetadata(null, null);
    },
  };
}
