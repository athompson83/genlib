// SPDX-License-Identifier: Apache-2.0
package example.saml;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.function.UnaryOperator;
import java.util.zip.Inflater;
import javax.xml.crypto.dsig.*;
import javax.xml.crypto.dsig.dom.DOMSignContext;
import javax.xml.crypto.dsig.keyinfo.KeyInfoFactory;
import javax.xml.crypto.dsig.spec.C14NMethodParameterSpec;
import javax.xml.crypto.dsig.spec.TransformParameterSpec;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.saml2.provider.service.authentication.Saml2RedirectAuthenticationRequest;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

/**
 * Local-only test. The IdP key + self-signed cert come from the JDK keytool; the Response is
 * signed with the JDK's built-in XML Digital Signature API (independent of the SP library).
 */
class SamlSpTest {
  static final String ACS = "https://sp.example.test/saml/acs", SP = "https://sp.example.test/metadata", IDP = "https://idp.example.test/metadata";
  static final String SAML = "urn:oasis:names:tc:SAML:2.0:assertion";

  record Idp(PrivateKey key, X509Certificate cert) {}

  static Idp newIdp(Path dir, String alias) throws Exception {
    Path ks = dir.resolve(alias + ".p12");
    Process p = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "keytool").toString(),
        "-genkeypair", "-alias", alias, "-keyalg", "RSA", "-keysize", "2048", "-sigalg", "SHA256withRSA",
        "-dname", "CN=Test IdP", "-validity", "1", "-storetype", "PKCS12", "-keystore", ks.toString(),
        "-storepass", "changeit", "-keypass", "changeit").redirectErrorStream(true).start();
    assertEquals(0, p.waitFor(), new String(p.getInputStream().readAllBytes()));
    KeyStore store = KeyStore.getInstance("PKCS12");
    try (var in = new FileInputStream(ks.toFile())) { store.load(in, "changeit".toCharArray()); }
    return new Idp((PrivateKey) store.getKey(alias, "changeit".toCharArray()), (X509Certificate) store.getCertificate(alias));
  }

  static String responseXml(String irt, Map<String, String> o) {
    Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
    String noa = o.getOrDefault("notOnOrAfter", now.plusSeconds(300).toString());
    return "<samlp:Response xmlns:samlp=\"urn:oasis:names:tc:SAML:2.0:protocol\" xmlns:saml=\"" + SAML + "\" ID=\"_r" + UUID.randomUUID() + "\" Version=\"2.0\" IssueInstant=\"" + now + "\" Destination=\"" + o.getOrDefault("destination", ACS) + "\" InResponseTo=\"" + irt + "\">"
        + "<saml:Issuer>" + IDP + "</saml:Issuer><samlp:Status><samlp:StatusCode Value=\"urn:oasis:names:tc:SAML:2.0:status:Success\"/></samlp:Status>"
        + "<saml:Assertion ID=\"_a" + UUID.randomUUID() + "\" Version=\"2.0\" IssueInstant=\"" + now + "\"><saml:Issuer>" + IDP + "</saml:Issuer>"
        + "<saml:Subject><saml:NameID Format=\"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress\">alice@example.test</saml:NameID>"
        + "<saml:SubjectConfirmation Method=\"urn:oasis:names:tc:SAML:2.0:cm:bearer\"><saml:SubjectConfirmationData NotOnOrAfter=\"" + noa + "\" Recipient=\"" + o.getOrDefault("recipient", ACS) + "\" InResponseTo=\"" + irt + "\"/></saml:SubjectConfirmation></saml:Subject>"
        + "<saml:Conditions NotBefore=\"" + now.minusSeconds(60) + "\" NotOnOrAfter=\"" + noa + "\"><saml:AudienceRestriction><saml:Audience>" + o.getOrDefault("audience", SP) + "</saml:Audience></saml:AudienceRestriction></saml:Conditions>"
        + "<saml:AuthnStatement AuthnInstant=\"" + now + "\"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>"
        + "</saml:Assertion></samlp:Response>";
  }

  /** Signs the Assertion (enveloped, exc-c14n, RSA-SHA256) and inserts the Signature after its Issuer. */
  static String signAssertion(String xml, Idp idp) throws Exception {
    var dbf = DocumentBuilderFactory.newInstance();
    dbf.setNamespaceAware(true);
    Document doc = dbf.newDocumentBuilder().parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
    Element assertion = (Element) doc.getElementsByTagNameNS(SAML, "Assertion").item(0);
    assertion.setIdAttribute("ID", true);
    XMLSignatureFactory f = XMLSignatureFactory.getInstance("DOM");
    Reference ref = f.newReference("#" + assertion.getAttribute("ID"), f.newDigestMethod(DigestMethod.SHA256, null),
        List.of(f.newTransform(Transform.ENVELOPED, (TransformParameterSpec) null),
            f.newTransform(CanonicalizationMethod.EXCLUSIVE, (TransformParameterSpec) null)), null, null);
    SignedInfo si = f.newSignedInfo(f.newCanonicalizationMethod(CanonicalizationMethod.EXCLUSIVE, (C14NMethodParameterSpec) null),
        f.newSignatureMethod(SignatureMethod.RSA_SHA256, null), List.of(ref));
    KeyInfoFactory kif = f.getKeyInfoFactory();
    var ki = kif.newKeyInfo(List.of(kif.newX509Data(List.of(idp.cert()))));
    Element issuer = (Element) assertion.getElementsByTagNameNS(SAML, "Issuer").item(0);
    f.newXMLSignature(si, ki).sign(new DOMSignContext(idp.key(), assertion, issuer.getNextSibling()));
    var out = new ByteArrayOutputStream();
    TransformerFactory.newInstance().newTransformer().transform(new DOMSource(doc), new StreamResult(out));
    return Base64.getEncoder().encodeToString(out.toByteArray());
  }

  static String inflate(String b64) throws Exception {
    Inflater inf = new Inflater(true);
    inf.setInput(Base64.getDecoder().decode(b64));
    byte[] buf = new byte[65536];
    int n = inf.inflate(buf);
    return new String(buf, 0, n, StandardCharsets.UTF_8);
  }

  @Test
  void authnRequestAndResponseValidation() throws Exception {
    Path dir = Files.createTempDirectory("saml-test");
    Idp idp = newIdp(dir, "idp"), other = newIdp(dir, "other");
    SamlSp sp = new SamlSp(SP, ACS, IDP, "https://idp.example.test/sso", List.of(idp.cert()));

    UnaryOperator<Saml2RedirectAuthenticationRequest> check = r -> {
      try {
        String url = SamlSp.redirectUrl(r);
        assertTrue(url.startsWith("https://idp.example.test/sso?SAMLRequest="), url);
        String q = URI.create(url).getRawQuery();
        String req = URLDecoder.decode(q.split("&")[0].substring("SAMLRequest=".length()), StandardCharsets.UTF_8);
        String xml = inflate(req);
        assertTrue(xml.contains("AuthnRequest") && xml.contains("AssertionConsumerServiceURL=\"" + ACS + "\"") && xml.contains(r.getId()), xml);
        return r;
      } catch (Exception e) { throw new RuntimeException(e); }
    };
    var http = new MockHttpServletRequest("GET", "/login");

    var pending = check.apply(sp.startLogin(http));
    var auth = sp.validate(signAssertion(responseXml(pending.getId(), Map.of()), idp), pending);
    assertEquals("alice@example.test", auth.getName());
    assertThrows(AuthenticationException.class, () -> sp.validate(signAssertion(responseXml(pending.getId(), Map.of()), idp), null), "unsolicited/replay");

    Map<String, Map<String, String>> cases = new LinkedHashMap<>();
    cases.put("audience", Map.of("audience", "https://other-sp"));
    cases.put("recipient", Map.of("recipient", "https://evil/acs"));
    cases.put("destination", Map.of("destination", "https://evil/acs"));
    cases.put("expired", Map.of("notOnOrAfter", Instant.now().minusSeconds(600).truncatedTo(ChronoUnit.SECONDS).toString()));
    for (var e : cases.entrySet()) {
      var p = sp.startLogin(http);
      var ex = assertThrows(AuthenticationException.class, () -> sp.validate(signAssertion(responseXml(p.getId(), e.getValue()), idp), p), e.getKey());
      System.out.println(e.getKey() + ": " + ex.getMessage());
    }
    var p1 = sp.startLogin(http);
    assertThrows(AuthenticationException.class, () -> sp.validate(signAssertion(responseXml(p1.getId(), Map.of()), other), p1), "untrusted signer");
    var p2 = sp.startLogin(http);
    assertThrows(AuthenticationException.class, () -> sp.validate(signAssertion(responseXml("_other", Map.of()), idp), p2), "InResponseTo");
    var p3 = sp.startLogin(http);
    String tampered = Base64.getEncoder().encodeToString(new String(Base64.getDecoder().decode(signAssertion(responseXml(p3.getId(), Map.of()), idp)), StandardCharsets.UTF_8)
        .replace("alice@", "admin@").getBytes(StandardCharsets.UTF_8));
    assertThrows(AuthenticationException.class, () -> sp.validate(tampered, p3), "tampered");
  }
}
