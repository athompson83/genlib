// SPDX-License-Identifier: Apache-2.0
package example.passkeys

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.yubico.webauthn.AssertionRequest
import com.yubico.webauthn.data.ByteArray
import com.yubico.webauthn.data.PublicKeyCredentialCreationOptions
import com.yubico.webauthn.exception.AssertionFailedException
import com.yubico.webauthn.exception.RegistrationFailedException
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals

class PasskeysTest {
    private val fx: JsonNode = ObjectMapper().readTree(File("../fixtures/passkey-es256-none.json"))
    private val repo = InMemoryCredentialRepository()
    private val passkeys = Passkeys(fx["rpId"].asText(), "Example", setOf(fx["origin"].asText()), repo)
    private val userHandle = ByteArray.fromBase64Url(fx["userId"].asText())

    // The recorded response answers a fixed challenge; swap it into a generated request.
    private fun recordedRegistration(p: Passkeys): PublicKeyCredentialCreationOptions =
        p.registrationOptions(userHandle, "alice@example.com").toBuilder()
            .challenge(ByteArray.fromBase64Url(fx["registrationChallenge"].asText())).build()

    private fun recordedAssertion(): AssertionRequest {
        val req = passkeys.authenticationOptions()
        return req.toBuilder().publicKeyCredentialRequestOptions(
            req.publicKeyCredentialRequestOptions.toBuilder()
                .challenge(ByteArray.fromBase64Url(fx["authenticationChallenge"].asText())).build(),
        ).build()
    }

    @Test
    fun options() {
        val a = passkeys.registrationOptions(userHandle, "alice@example.com")
        val b = passkeys.registrationOptions(userHandle, "alice@example.com")
        val json = ObjectMapper().readTree(a.toCredentialsCreateJson())["publicKey"]
        assertEquals("example.com", json["rp"]["id"].asText())
        assertEquals("required", json["authenticatorSelection"]["userVerification"].asText())
        assertNotEquals(a.challenge, b.challenge)
        assertEquals(a, PublicKeyCredentialCreationOptions.fromJson(a.toJson()))
    }

    @Test
    fun recordedCeremony() {
        val cred = passkeys.verifyRegistration(recordedRegistration(passkeys), fx["registrationResponse"].toString())
        assertEquals(fx["credentialId"].asText(), cred.credentialId.base64Url)
        assertEquals(0L, cred.signatureCount)
        val r = passkeys.verifyAuthentication(recordedAssertion(), fx["authenticationResponse"].toString())
        assertEquals("alice@example.com", r.username)
        assertEquals(fx["expectedSignCountAfterAuthentication"].asLong(), repo.get(cred.credentialId)!!.signatureCount)
    }

    @Test
    fun rejections() {
        assertFailsWith<RegistrationFailedException> {
            passkeys.verifyRegistration(passkeys.registrationOptions(userHandle, "a"), fx["registrationResponse"].toString())
        }
        val evil = Passkeys("example.com", "Example", setOf("https://evil.example"), InMemoryCredentialRepository())
        assertFailsWith<RegistrationFailedException> {
            evil.verifyRegistration(recordedRegistration(evil), fx["registrationResponse"].toString())
        }
        val cred = passkeys.verifyRegistration(recordedRegistration(passkeys), fx["registrationResponse"].toString())
        assertFailsWith<AssertionFailedException> {
            passkeys.verifyAuthentication(passkeys.authenticationOptions(), fx["authenticationResponse"].toString())
        }
        repo.save(cred.toBuilder().signatureCount(5).build())
        assertFailsWith<AssertionFailedException> {
            passkeys.verifyAuthentication(recordedAssertion(), fx["authenticationResponse"].toString())
        }
    }
}
