// SPDX-License-Identifier: Apache-2.0
package example.saml;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.List;
import org.opensaml.saml.saml2.assertion.SAML2AssertionValidationParameters;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.saml2.core.Saml2X509Credential;
import org.springframework.security.saml2.provider.service.authentication.OpenSaml5AuthenticationProvider;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticationToken;
import org.springframework.security.saml2.provider.service.authentication.Saml2RedirectAuthenticationRequest;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration;
import org.springframework.security.saml2.provider.service.registration.Saml2MessageBinding;
import org.springframework.security.saml2.provider.service.web.authentication.OpenSaml5AuthenticationRequestResolver;

/**
 * Thin SP wrapper around Spring Security SAML2 (OpenSAML 5) usable outside the Spring filter chain.
 * OpenSaml5AuthenticationProvider validates the XML signature against the configured IdP certs,
 * Issuer, Response Destination, InResponseTo against the stored AuthnRequest, Status,
 * Conditions NotBefore/NotOnOrAfter and Audience, and bearer SubjectConfirmationData
 * Recipient/NotOnOrAfter/InResponseTo. In a Spring Boot app prefer {@code http.saml2Login()},
 * which wires the same classes plus request storage.
 */
public final class SamlSp {
  private final RelyingPartyRegistration registration;
  private final OpenSaml5AuthenticationRequestResolver resolver;
  private final OpenSaml5AuthenticationProvider provider = new OpenSaml5AuthenticationProvider();

  public SamlSp(String spEntityId, String acsUrl, String idpEntityId, String idpSsoUrl, List<X509Certificate> idpSigningCerts) {
    if (idpSigningCerts.isEmpty()) throw new IllegalArgumentException("at least one IdP signing certificate is required");
    registration = RelyingPartyRegistration.withRegistrationId("idp")
        .entityId(spEntityId)
        .assertionConsumerServiceLocation(acsUrl)
        .assertionConsumerServiceBinding(Saml2MessageBinding.POST)
        .assertingPartyMetadata(p -> p.entityId(idpEntityId)
            .singleSignOnServiceLocation(idpSsoUrl)
            .singleSignOnServiceBinding(Saml2MessageBinding.REDIRECT)
            .wantAuthnRequestsSigned(false) // set true + add an SP signing credential if the IdP requires it
            .verificationX509Credentials(c -> idpSigningCerts.forEach(x -> c.add(Saml2X509Credential.verification(x)))))
        .build();
    resolver = new OpenSaml5AuthenticationRequestResolver((request, id) -> registration);
    resolver.setRequestMatcher(request -> true); // the caller decides which route starts login
    provider.setAssertionValidator(OpenSaml5AuthenticationProvider.createDefaultAssertionValidatorWithParameters(
        params -> params.put(SAML2AssertionValidationParameters.CLOCK_SKEW, Duration.ofSeconds(60))));
  }

  /** Builds the AuthnRequest. Store the returned object server-side (session) for the ACS step. */
  public Saml2RedirectAuthenticationRequest startLogin(HttpServletRequest request) {
    return resolver.resolve(request);
  }

  /** The browser redirect URL for a request returned by {@link #startLogin}. */
  public static String redirectUrl(Saml2RedirectAuthenticationRequest r) {
    StringBuilder sb = new StringBuilder(r.getAuthenticationRequestUri())
        .append(r.getAuthenticationRequestUri().contains("?") ? '&' : '?')
        .append("SAMLRequest=").append(enc(r.getSamlRequest()));
    if (r.getRelayState() != null) sb.append("&RelayState=").append(enc(r.getRelayState()));
    if (r.getSigAlg() != null) sb.append("&SigAlg=").append(enc(r.getSigAlg())).append("&Signature=").append(enc(r.getSignature()));
    return sb.toString();
  }

  /**
   * Validates the POSTed base64 SAMLResponse. {@code pending} is the request removed from the
   * session (one-time use). Throws AuthenticationException on any validation failure.
   */
  public Authentication validate(String samlResponseB64, Saml2RedirectAuthenticationRequest pending) throws AuthenticationException {
    if (pending == null) {
      throw new org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticationException(
          new org.springframework.security.saml2.core.Saml2Error("invalid_in_response_to", "no pending AuthnRequest (unsolicited or replayed)"));
    }
    // Saml2AuthenticationToken carries the decoded XML (Spring's filter normally decodes it).
    String xml = new String(java.util.Base64.getMimeDecoder().decode(samlResponseB64), StandardCharsets.UTF_8);
    return provider.authenticate(new Saml2AuthenticationToken(registration, xml, pending));
  }

  private static String enc(String s) { return URLEncoder.encode(s, StandardCharsets.UTF_8); }
}
