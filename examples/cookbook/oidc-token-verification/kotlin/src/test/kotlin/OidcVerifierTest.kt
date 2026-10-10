// SPDX-License-Identifier: Apache-2.0
package example.oidc

import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jose.crypto.RSASSASigner
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.URI
import java.time.Duration
import java.util.Date
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Local-only: RSA keys generated here; JWKS served by the JDK HttpServer on 127.0.0.1. */
class OidcVerifierTest {
    private val iss = "https://idp.example.test"
    private val aud = "client-123"

    private fun sign(k: RSAKey, edit: JWTClaimsSet.Builder.() -> Unit = {}): String {
        val now = System.currentTimeMillis()
        val claims = JWTClaimsSet.Builder().issuer(iss).audience(aud).subject("user-1")
            .issueTime(Date(now)).notBeforeTime(Date(now)).expirationTime(Date(now + 300_000)).claim("nonce", "n-1")
            .apply(edit).build()
        val jwt = SignedJWT(JWSHeader.Builder(JWSAlgorithm.RS256).keyID(k.keyID).type(JOSEObjectType.JWT).build(), claims)
        jwt.sign(RSASSASigner(k))
        return jwt.serialize()
    }

    @Test
    fun verifiesAndRejects() {
        val keys = CopyOnWriteArrayList<RSAKey>()
        val fetches = AtomicInteger()
        val k1 = RSAKeyGenerator(2048).keyID("k1").generate().also { keys.add(it) }
        val srv = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        srv.createContext("/jwks") { ex ->
            fetches.incrementAndGet()
            val body = JWKSet(keys.toList<com.nimbusds.jose.jwk.JWK>()).toPublicJWKSet().toString().toByteArray()
            ex.responseHeaders.add("Content-Type", "application/json")
            ex.sendResponseHeaders(200, body.size.toLong())
            ex.responseBody.use { it.write(body) }
        }
        srv.start()
        try {
            val v = OidcVerifier(iss, aud, URI("http://127.0.0.1:${srv.address.port}/jwks").toURL(),
                clockSkew = Duration.ofSeconds(5), jwksMinRefetchInterval = Duration.ofMillis(1))
            assertEquals("user-1", v.verify(sign(k1), "n-1").subject)

            val now = System.currentTimeMillis()
            val good = sign(k1)
            val hs = SignedJWT(JWSHeader.Builder(JWSAlgorithm.HS256).keyID("k1").build(),
                JWTClaimsSet.Builder().issuer(iss).audience(aud).subject("x").issueTime(Date()).expirationTime(Date(now + 60_000)).build())
                .apply { sign(MACSigner("x".repeat(32))) }.serialize()
            mapOf(
                "aud" to sign(k1) { audience("other") },
                "iss" to sign(k1) { issuer("https://evil.test") },
                "exp" to sign(k1) { expirationTime(Date(now - 30_000)); notBeforeTime(Date(now - 60_000)) },
                "nbf" to sign(k1) { notBeforeTime(Date(now + 120_000)) },
                "tampered" to good.dropLast(4) + if (good.endsWith("AAAA")) "BBBB" else "AAAA",
                "hs256" to hs,
            ).forEach { (name, t) -> assertFailsWith<OidcVerifier.InvalidToken>(name) { v.verify(t) } }
            v.verify(sign(k1) { expirationTime(Date(now - 2_000)); notBeforeTime(Date(now - 60_000)) }) // within skew
            assertEquals("nonce mismatch", assertFailsWith<OidcVerifier.InvalidToken> { v.verify(sign(k1), "other") }.message)

            val before = fetches.get()
            Thread.sleep(5)
            val k2 = RSAKeyGenerator(2048).keyID("k2").generate().also { keys.add(it) }
            assertEquals("user-1", v.verify(sign(k2)).subject)
            assertTrue(fetches.get() > before, "JWKS should be refetched on unknown kid")
            assertFailsWith<OidcVerifier.InvalidToken> { v.verify(sign(RSAKeyGenerator(2048).keyID("nope").generate())) }
            assertFailsWith<IllegalArgumentException> { OidcVerifier(iss, aud, URI("https://x").toURL(), setOf(JWSAlgorithm.HS256)) }
        } finally {
            srv.stop(0)
        }
    }
}
