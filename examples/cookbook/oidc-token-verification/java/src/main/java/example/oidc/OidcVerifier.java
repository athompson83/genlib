// SPDX-License-Identifier: Apache-2.0
package example.oidc;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.BadJOSEException;
import com.nimbusds.jose.proc.DefaultJOSEObjectTypeVerifier;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import java.net.URL;
import java.text.ParseException;
import java.time.Duration;
import java.util.Objects;
import java.util.Set;

/**
 * Thin wrapper around Nimbus JOSE+JWT. Nimbus does signature verification, the alg
 * allow-list (key selector), JWKS fetching with caching, kid-miss refresh and rate limiting
 * (JWKSourceBuilder), and iss/aud/exp/nbf checks with clock skew (DefaultJWTClaimsVerifier).
 * This class fixes the policy and adds the per-request nonce comparison.
 */
public final class OidcVerifier {
  public static final class InvalidTokenException extends Exception {
    InvalidTokenException(String m, Throwable c) { super(m, c); }
  }

  private final DefaultJWTProcessor<SecurityContext> processor = new DefaultJWTProcessor<>();

  public OidcVerifier(String issuer, String audience, URL jwksUri, Set<JWSAlgorithm> algorithms,
                      Duration clockSkew, Duration jwksMinRefetchInterval) {
    for (JWSAlgorithm a : algorithms) {
      if (JWSAlgorithm.Family.HMAC_SHA.contains(a)) throw new IllegalArgumentException("HMAC not allowed with a public JWKS");
    }
    JWKSource<SecurityContext> jwks = JWKSourceBuilder.<SecurityContext>create(jwksUri)
        .cache(Duration.ofMinutes(10).toMillis(), Duration.ofSeconds(15).toMillis())
        .rateLimited(jwksMinRefetchInterval.toMillis()) // bounds kid-miss refetches
        .retrying(false)
        .build();
    processor.setJWSKeySelector(new JWSVerificationKeySelector<>(algorithms, jwks));
    // Accept "JWT" or no typ (ID tokens); use "at+jwt" for RFC 9068 access tokens.
    processor.setJWSTypeVerifier(new DefaultJOSEObjectTypeVerifier<>(com.nimbusds.jose.JOSEObjectType.JWT, null));
    DefaultJWTClaimsVerifier<SecurityContext> claims = new DefaultJWTClaimsVerifier<>(
        audience,
        new JWTClaimsSet.Builder().issuer(issuer).build(), // exact-match claims
        Set.of("sub", "iat", "exp"));                       // required claims
    claims.setMaxClockSkew((int) clockSkew.toSeconds());
    processor.setJWTClaimsSetVerifier(claims);
  }

  /** @param expectedNonce nonce stored with the authorization request, or null to skip */
  public JWTClaimsSet verify(String token, String expectedNonce) throws InvalidTokenException {
    try {
      JWTClaimsSet c = processor.process(token, null);
      // nonce binds an ID token to the authorization request (OIDC Core 3.1.3.7)
      if (expectedNonce != null && !Objects.equals(expectedNonce, c.getStringClaim("nonce"))) {
        throw new InvalidTokenException("nonce mismatch", null);
      }
      return c;
    } catch (ParseException | BadJOSEException | JOSEException e) {
      throw new InvalidTokenException(e.getMessage(), e);
    }
  }
}
