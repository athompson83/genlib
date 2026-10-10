// SPDX-License-Identifier: Apache-2.0
package example.oidc

import com.nimbusds.jose.JOSEException
import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.jwk.source.JWKSourceBuilder
import com.nimbusds.jose.proc.BadJOSEException
import com.nimbusds.jose.proc.DefaultJOSEObjectTypeVerifier
import com.nimbusds.jose.proc.JWSVerificationKeySelector
import com.nimbusds.jose.proc.SecurityContext
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier
import com.nimbusds.jwt.proc.DefaultJWTProcessor
import java.net.URL
import java.text.ParseException
import java.time.Duration

/**
 * Thin Kotlin wrapper around Nimbus JOSE+JWT: signature + alg allow-list, cached JWKS with
 * rate-limited kid-miss refresh, iss/aud/exp/nbf with clock skew. Adds the nonce check.
 */
class OidcVerifier(
    issuer: String,
    audience: String,
    jwksUri: URL,
    algorithms: Set<JWSAlgorithm> = setOf(JWSAlgorithm.RS256, JWSAlgorithm.ES256),
    clockSkew: Duration = Duration.ofSeconds(60),
    jwksMinRefetchInterval: Duration = Duration.ofSeconds(30),
) {
    class InvalidToken(message: String, cause: Throwable? = null) : Exception(message, cause)

    private val processor = DefaultJWTProcessor<SecurityContext>()

    init {
        require(algorithms.none { it in JWSAlgorithm.Family.HMAC_SHA }) { "HMAC not allowed with a public JWKS" }
        val jwks = JWKSourceBuilder.create<SecurityContext>(jwksUri)
            .cache(Duration.ofMinutes(10).toMillis(), Duration.ofSeconds(15).toMillis())
            .rateLimited(jwksMinRefetchInterval.toMillis())
            .retrying(false)
            .build()
        processor.jwsKeySelector = JWSVerificationKeySelector(algorithms, jwks)
        processor.jwsTypeVerifier = DefaultJOSEObjectTypeVerifier(JOSEObjectType.JWT, null)
        processor.jwtClaimsSetVerifier = DefaultJWTClaimsVerifier<SecurityContext>(
            audience,
            JWTClaimsSet.Builder().issuer(issuer).build(),
            setOf("sub", "iat", "exp"),
        ).apply { maxClockSkew = clockSkew.toSeconds().toInt() }
    }

    /** [expectedNonce]: nonce stored with the authorization request, or null to skip. */
    fun verify(token: String, expectedNonce: String? = null): JWTClaimsSet {
        val claims = try {
            processor.process(token, null)
        } catch (e: ParseException) {
            throw InvalidToken(e.message ?: "parse error", e)
        } catch (e: BadJOSEException) {
            throw InvalidToken(e.message ?: "invalid token", e)
        } catch (e: JOSEException) {
            throw InvalidToken(e.message ?: "jose error", e)
        }
        if (expectedNonce != null && claims.getStringClaim("nonce") != expectedNonce) throw InvalidToken("nonce mismatch")
        return claims
    }
}
