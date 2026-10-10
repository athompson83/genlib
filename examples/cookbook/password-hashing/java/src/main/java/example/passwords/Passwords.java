// SPDX-License-Identifier: Apache-2.0
package example.passwords;

import java.util.Map;
import java.util.Optional;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Argon2id password hashing via Spring Security crypto + Bouncy Castle.
 * OWASP Password Storage Cheat Sheet minimum: m=19456 KiB, t=2, p=1.
 * Stored values are "{argon2}$argon2id$v=19$m=19456,t=2,p=1$salt$hash";
 * unprefixed legacy bcrypt values ("$2a$...") are still accepted and upgraded.
 */
public final class Passwords {
  /** saltLength=16, hashLength=32, parallelism=1, memory=19456 KiB, iterations=2. */
  public static final Argon2PasswordEncoder ARGON2 = new Argon2PasswordEncoder(16, 32, 1, 19456, 2);

  /** Fallback where Argon2 is unavailable. OWASP: cost >= 10. Rejects inputs over 72 bytes. */
  public static final BCryptPasswordEncoder BCRYPT = new BCryptPasswordEncoder(12);

  private static final DelegatingPasswordEncoder ENCODER;

  static {
    ENCODER = new DelegatingPasswordEncoder("argon2", Map.<String, PasswordEncoder>of("argon2", ARGON2, "bcrypt", BCRYPT));
    ENCODER.setDefaultPasswordEncoderForMatches(BCRYPT); // unprefixed legacy rows
  }

  private Passwords() {}

  public static String hash(String password) {
    return ENCODER.encode(password);
  }

  /** Result of a check; persist {@code rehash} when present. */
  public record Verified(boolean ok, Optional<String> rehash) {}

  public static Verified verify(String stored, String password) {
    boolean ok;
    try {
      ok = ENCODER.matches(password, stored);
    } catch (IllegalArgumentException e) {
      return new Verified(false, Optional.empty()); // malformed hash or over-long bcrypt input
    }
    if (!ok) return new Verified(false, Optional.empty());
    return new Verified(true, ENCODER.upgradeEncoding(stored) ? Optional.of(hash(password)) : Optional.empty());
  }
}
