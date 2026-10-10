// SPDX-License-Identifier: Apache-2.0
package example.saml

import java.io.ByteArrayOutputStream
import java.net.URI
import java.net.URLDecoder
import java.nio.file.Files
import java.nio.file.Path
import java.security.KeyStore
import java.security.PrivateKey
import java.security.cert.X509Certificate
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Base64
import java.util.UUID
import java.util.zip.Inflater
import javax.xml.crypto.dsig.CanonicalizationMethod
import javax.xml.crypto.dsig.DigestMethod
import javax.xml.crypto.dsig.SignatureMethod
import javax.xml.crypto.dsig.Transform
import javax.xml.crypto.dsig.XMLSignatureFactory
import javax.xml.crypto.dsig.dom.DOMSignContext
import javax.xml.crypto.dsig.spec.C14NMethodParameterSpec
import javax.xml.crypto.dsig.spec.TransformParameterSpec
import javax.xml.parsers.DocumentBuilderFactory
import javax.xml.transform.TransformerFactory
import javax.xml.transform.dom.DOMSource
import javax.xml.transform.stream.StreamResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.security.core.AuthenticationException
import org.springframework.security.saml2.provider.service.authentication.Saml2RedirectAuthenticationRequest
import org.w3c.dom.Element

/** Local-only: keytool-generated self-signed IdP cert; Response signed with the JDK XML DSig API. */
class SamlSpTest {
    private val acs = "https://sp.example.test/saml/acs"
    private val sp = "https://sp.example.test/metadata"
    private val idpId = "https://idp.example.test/metadata"
    private val samlNs = "urn:oasis:names:tc:SAML:2.0:assertion"

    data class Idp(val key: PrivateKey, val cert: X509Certificate)

    private fun newIdp(dir: Path, alias: String): Idp {
        val ks = dir.resolve("$alias.p12")
        val p = ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "keytool").toString(),
            "-genkeypair", "-alias", alias, "-keyalg", "RSA", "-keysize", "2048", "-sigalg", "SHA256withRSA",
            "-dname", "CN=Test IdP", "-validity", "1", "-storetype", "PKCS12", "-keystore", ks.toString(),
            "-storepass", "changeit", "-keypass", "changeit").redirectErrorStream(true).start()
        assertEquals(0, p.waitFor(), p.inputStream.readAllBytes().decodeToString())
        val store = KeyStore.getInstance("PKCS12").apply { Files.newInputStream(ks).use { load(it, "changeit".toCharArray()) } }
        return Idp(store.getKey(alias, "changeit".toCharArray()) as PrivateKey, store.getCertificate(alias) as X509Certificate)
    }

    private fun responseXml(irt: String, o: Map<String, String> = emptyMap()): String {
        val now = Instant.now().truncatedTo(ChronoUnit.SECONDS)
        val noa = o["notOnOrAfter"] ?: now.plusSeconds(300).toString()
        return """<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="$samlNs" ID="_r${UUID.randomUUID()}" Version="2.0" IssueInstant="$now" Destination="${o["destination"] ?: acs}" InResponseTo="$irt">""" +
            """<saml:Issuer>$idpId</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>""" +
            """<saml:Assertion ID="_a${UUID.randomUUID()}" Version="2.0" IssueInstant="$now"><saml:Issuer>$idpId</saml:Issuer>""" +
            """<saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">alice@example.test</saml:NameID>""" +
            """<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="$noa" Recipient="${o["recipient"] ?: acs}" InResponseTo="$irt"/></saml:SubjectConfirmation></saml:Subject>""" +
            """<saml:Conditions NotBefore="${now.minusSeconds(60)}" NotOnOrAfter="$noa"><saml:AudienceRestriction><saml:Audience>${o["audience"] ?: sp}</saml:Audience></saml:AudienceRestriction></saml:Conditions>""" +
            """<saml:AuthnStatement AuthnInstant="$now"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>""" +
            """</saml:Assertion></samlp:Response>"""
    }

    private fun signAssertion(xml: String, idp: Idp): String {
        val doc = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }.newDocumentBuilder().parse(xml.byteInputStream())
        val assertion = doc.getElementsByTagNameNS(samlNs, "Assertion").item(0) as Element
        assertion.setIdAttribute("ID", true)
        val f = XMLSignatureFactory.getInstance("DOM")
        val ref = f.newReference("#" + assertion.getAttribute("ID"), f.newDigestMethod(DigestMethod.SHA256, null),
            listOf(f.newTransform(Transform.ENVELOPED, null as TransformParameterSpec?), f.newTransform(CanonicalizationMethod.EXCLUSIVE, null as TransformParameterSpec?)), null, null)
        val si = f.newSignedInfo(f.newCanonicalizationMethod(CanonicalizationMethod.EXCLUSIVE, null as C14NMethodParameterSpec?),
            f.newSignatureMethod(SignatureMethod.RSA_SHA256, null), listOf(ref))
        val kif = f.keyInfoFactory
        val issuer = assertion.getElementsByTagNameNS(samlNs, "Issuer").item(0) as Element
        f.newXMLSignature(si, kif.newKeyInfo(listOf(kif.newX509Data(listOf(idp.cert))))).sign(DOMSignContext(idp.key, assertion, issuer.nextSibling))
        val out = ByteArrayOutputStream()
        TransformerFactory.newInstance().newTransformer().transform(DOMSource(doc), StreamResult(out))
        return Base64.getEncoder().encodeToString(out.toByteArray())
    }

    private fun checkRequest(r: Saml2RedirectAuthenticationRequest) {
        val url = SamlSp.redirectUrl(r)
        assertTrue(url.startsWith("https://idp.example.test/sso?SAMLRequest="), url)
        val req = URLDecoder.decode(URI(url).rawQuery.split("&")[0].removePrefix("SAMLRequest="), Charsets.UTF_8)
        val inf = Inflater(true).apply { setInput(Base64.getDecoder().decode(req)) }
        val buf = ByteArray(65536)
        val xml = String(buf, 0, inf.inflate(buf), Charsets.UTF_8)
        assertTrue("AuthnRequest" in xml && "AssertionConsumerServiceURL=\"$acs\"" in xml && r.id!! in xml, xml)
    }

    @Test
    fun authnRequestAndResponseValidation() {
        val dir = Files.createTempDirectory("saml-test")
        val idp = newIdp(dir, "idp")
        val other = newIdp(dir, "other")
        val samlSp = SamlSp(sp, acs, idpId, "https://idp.example.test/sso", listOf(idp.cert))
        val http = MockHttpServletRequest("GET", "/login")

        val pending = samlSp.startLogin(http).also(::checkRequest)
        assertEquals("alice@example.test", samlSp.validate(signAssertion(responseXml(pending.id!!), idp), pending).name)
        assertFailsWith<AuthenticationException>("unsolicited/replay") { samlSp.validate(signAssertion(responseXml(pending.id!!), idp), null) }

        mapOf(
            "audience" to mapOf("audience" to "https://other-sp"),
            "recipient" to mapOf("recipient" to "https://evil/acs"),
            "destination" to mapOf("destination" to "https://evil/acs"),
            "expired" to mapOf("notOnOrAfter" to Instant.now().minusSeconds(600).truncatedTo(ChronoUnit.SECONDS).toString()),
        ).forEach { (name, o) ->
            val p = samlSp.startLogin(http)
            assertFailsWith<AuthenticationException>(name) { samlSp.validate(signAssertion(responseXml(p.id!!, o), idp), p) }
        }
        samlSp.startLogin(http).let { p -> assertFailsWith<AuthenticationException>("untrusted") { samlSp.validate(signAssertion(responseXml(p.id!!), other), p) } }
        samlSp.startLogin(http).let { p -> assertFailsWith<AuthenticationException>("InResponseTo") { samlSp.validate(signAssertion(responseXml("_other"), idp), p) } }
        samlSp.startLogin(http).let { p ->
            val tampered = Base64.getEncoder().encodeToString(Base64.getDecoder().decode(signAssertion(responseXml(p.id!!), idp)).decodeToString().replace("alice@", "admin@").toByteArray())
            assertFailsWith<AuthenticationException>("tampered") { samlSp.validate(tampered, p) }
        }
    }
}
