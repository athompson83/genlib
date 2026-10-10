// SPDX-License-Identifier: Apache-2.0
package example.saml

import jakarta.servlet.http.HttpServletRequest
import java.net.URLEncoder
import java.security.cert.X509Certificate
import java.time.Duration
import java.util.Base64
import org.opensaml.saml.saml2.assertion.SAML2AssertionValidationParameters
import org.springframework.security.core.Authentication
import org.springframework.security.saml2.core.Saml2Error
import org.springframework.security.saml2.core.Saml2X509Credential
import org.springframework.security.saml2.provider.service.authentication.OpenSaml5AuthenticationProvider
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticationException
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticationToken
import org.springframework.security.saml2.provider.service.authentication.Saml2RedirectAuthenticationRequest
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration
import org.springframework.security.saml2.provider.service.registration.Saml2MessageBinding
import org.springframework.security.saml2.provider.service.web.authentication.OpenSaml5AuthenticationRequestResolver

/**
 * Thin Kotlin SP wrapper around Spring Security SAML2 (OpenSAML 5), usable outside the filter chain.
 * The provider validates signature, Issuer, Destination, InResponseTo, Status, Conditions/Audience
 * and bearer SubjectConfirmationData Recipient/NotOnOrAfter. In Spring Boot prefer `saml2Login()`.
 */
class SamlSp(
    spEntityId: String,
    acsUrl: String,
    idpEntityId: String,
    idpSsoUrl: String,
    idpSigningCerts: List<X509Certificate>,
    clockSkew: Duration = Duration.ofSeconds(60),
) {
    private val registration: RelyingPartyRegistration
    private val resolver: OpenSaml5AuthenticationRequestResolver
    private val provider = OpenSaml5AuthenticationProvider()

    init {
        require(idpSigningCerts.isNotEmpty()) { "at least one IdP signing certificate is required" }
        registration = RelyingPartyRegistration.withRegistrationId("idp")
            .entityId(spEntityId)
            .assertionConsumerServiceLocation(acsUrl)
            .assertionConsumerServiceBinding(Saml2MessageBinding.POST)
            .assertingPartyMetadata { p ->
                p.entityId(idpEntityId)
                    .singleSignOnServiceLocation(idpSsoUrl)
                    .singleSignOnServiceBinding(Saml2MessageBinding.REDIRECT)
                    .wantAuthnRequestsSigned(false) // set true + SP signing credential if the IdP requires it
                    .verificationX509Credentials { c -> idpSigningCerts.forEach { c.add(Saml2X509Credential.verification(it)) } }
            }
            .build()
        resolver = OpenSaml5AuthenticationRequestResolver { _, _ -> registration }
        resolver.setRequestMatcher { true }
        provider.setAssertionValidator(
            OpenSaml5AuthenticationProvider.createDefaultAssertionValidatorWithParameters { params ->
                params[SAML2AssertionValidationParameters.CLOCK_SKEW] = clockSkew
            },
        )
    }

    /** Builds the AuthnRequest; store the result server-side for the ACS step. */
    fun startLogin(request: HttpServletRequest): Saml2RedirectAuthenticationRequest =
        checkNotNull(resolver.resolve<Saml2RedirectAuthenticationRequest>(request)) { "request did not resolve" }

    /** Validates the POSTed base64 SAMLResponse against the pending (one-time) request. */
    fun validate(samlResponseB64: String, pending: Saml2RedirectAuthenticationRequest?): Authentication {
        if (pending == null) {
            throw Saml2AuthenticationException(Saml2Error("invalid_in_response_to", "no pending AuthnRequest (unsolicited or replayed)"))
        }
        val xml = String(Base64.getMimeDecoder().decode(samlResponseB64), Charsets.UTF_8)
        return provider.authenticate(Saml2AuthenticationToken(registration, xml, pending))
    }

    companion object {
        fun redirectUrl(r: Saml2RedirectAuthenticationRequest): String = buildString {
            fun enc(s: String) = URLEncoder.encode(s, Charsets.UTF_8)
            append(r.authenticationRequestUri).append(if ('?' in r.authenticationRequestUri) '&' else '?')
            append("SAMLRequest=").append(enc(r.samlRequest))
            r.relayState?.let { append("&RelayState=").append(enc(it)) }
            r.sigAlg?.let { append("&SigAlg=").append(enc(it)).append("&Signature=").append(enc(r.signature ?: "")) }
        }
    }
}
