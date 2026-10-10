// SPDX-License-Identifier: Apache-2.0
package example.oidc;

import static org.junit.jupiter.api.Assertions.*;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;

/** Local-only: RSA keys generated here; JWKS served by the JDK HttpServer on 127.0.0.1. */
class OidcVerifierTest {
  static final String ISS = "https://idp.example.test", AUD = "client-123";

  static String sign(RSAKey k, Consumer<JWTClaimsSet.Builder> edit) throws Exception {
    long now = System.currentTimeMillis();
    JWTClaimsSet.Builder b = new JWTClaimsSet.Builder().issuer(ISS).audience(AUD).subject("user-1")
        .issueTime(new Date(now)).notBeforeTime(new Date(now)).expirationTime(new Date(now + 300_000)).claim("nonce", "n-1");
    edit.accept(b);
    SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(k.getKeyID()).type(JOSEObjectType.JWT).build(), b.build());
    jwt.sign(new RSASSASigner(k));
    return jwt.serialize();
  }

  @Test
  void verifiesAndRejects() throws Exception {
    List<RSAKey> keys = new CopyOnWriteArrayList<>();
    AtomicInteger fetches = new AtomicInteger();
    RSAKey k1 = new RSAKeyGenerator(2048).keyID("k1").generate();
    keys.add(k1);
    HttpServer srv = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    srv.createContext("/jwks", ex -> {
      fetches.incrementAndGet();
      byte[] body = new JWKSet(new ArrayList<>(keys)).toPublicJWKSet().toString().getBytes(StandardCharsets.UTF_8);
      ex.getResponseHeaders().add("Content-Type", "application/json");
      ex.sendResponseHeaders(200, body.length);
      ex.getResponseBody().write(body);
      ex.close();
    });
    srv.start();
    try {
      var v = new OidcVerifier(ISS, AUD, URI.create("http://127.0.0.1:" + srv.getAddress().getPort() + "/jwks").toURL(),
          Set.of(JWSAlgorithm.RS256, JWSAlgorithm.ES256), Duration.ofSeconds(5), Duration.ofMillis(1));

      assertEquals("user-1", v.verify(sign(k1, b -> {}), "n-1").getSubject());
      long now = System.currentTimeMillis();
      Map<String, String> bad = new LinkedHashMap<>();
      bad.put("aud", sign(k1, b -> b.audience("other")));
      bad.put("iss", sign(k1, b -> b.issuer("https://evil.test")));
      bad.put("exp", sign(k1, b -> b.expirationTime(new Date(now - 30_000)).notBeforeTime(new Date(now - 60_000))));
      bad.put("nbf", sign(k1, b -> b.notBeforeTime(new Date(now + 120_000))));
      String good = sign(k1, b -> {});
      bad.put("tampered", good.substring(0, good.length() - 4) + (good.endsWith("AAAA") ? "BBBB" : "AAAA"));
      SignedJWT hs = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS256).keyID("k1").build(),
          new JWTClaimsSet.Builder().issuer(ISS).audience(AUD).subject("x").issueTime(new Date()).expirationTime(new Date(now + 60_000)).build());
      hs.sign(new MACSigner("x".repeat(32)));
      bad.put("hs256", hs.serialize());
      for (var e : bad.entrySet()) {
        assertThrows(OidcVerifier.InvalidTokenException.class, () -> v.verify(e.getValue(), null), e.getKey());
      }
      assertDoesNotThrow(() -> v.verify(sign(k1, b -> b.expirationTime(new Date(now - 2_000)).notBeforeTime(new Date(now - 60_000))), null));
      var nonce = assertThrows(OidcVerifier.InvalidTokenException.class, () -> v.verify(sign(k1, b -> {}), "other"));
      assertEquals("nonce mismatch", nonce.getMessage());

      int before = fetches.get();
      Thread.sleep(5);
      RSAKey k2 = new RSAKeyGenerator(2048).keyID("k2").generate();
      keys.add(k2);
      assertEquals("user-1", v.verify(sign(k2, b -> {}), null).getSubject());
      assertTrue(fetches.get() > before, "JWKS should be refetched on unknown kid");
      RSAKey stranger = new RSAKeyGenerator(2048).keyID("nope").generate();
      assertThrows(OidcVerifier.InvalidTokenException.class, () -> v.verify(sign(stranger, b -> {}), null));

      assertThrows(IllegalArgumentException.class, () -> new OidcVerifier(ISS, AUD, URI.create("https://x").toURL(),
          Set.of(JWSAlgorithm.HS256), Duration.ofSeconds(5), Duration.ofSeconds(30)));
    } finally {
      srv.stop(0);
    }
  }
}
