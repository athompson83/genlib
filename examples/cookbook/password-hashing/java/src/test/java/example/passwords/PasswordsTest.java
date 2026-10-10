// SPDX-License-Identifier: Apache-2.0
package example.passwords;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;

class PasswordsTest {
  @Test
  void hashAndVerify() {
    String h = Passwords.hash("correct horse battery staple");
    assertTrue(h.startsWith("{argon2}$argon2id$v=19$m=19456,t=2,p=1$"), h);
    assertEquals(new Passwords.Verified(true, Optional.empty()), Passwords.verify(h, "correct horse battery staple"));
    assertFalse(Passwords.verify(h, "wrong").ok());
    assertNotEquals(h, Passwords.hash("correct horse battery staple"));
  }

  @Test
  void weakerArgon2IsUpgraded() {
    String weak = "{argon2}" + new Argon2PasswordEncoder(16, 32, 1, 8192, 1).encode("pw");
    Passwords.Verified v = Passwords.verify(weak, "pw");
    assertTrue(v.ok());
    assertTrue(v.rehash().orElseThrow().startsWith("{argon2}$argon2id$v=19$m=19456,t=2,p=1$"));
  }

  @Test
  void interoperatesWithOtherLibraries() {
    // argon2-cffi 25.1.0 (reference libargon2) output for "pw".
    String cffi = "{argon2}$argon2id$v=19$m=19456,t=2,p=1$ecqUURt5rXczDOhwQxrhZw$w2dzt0CPmUdvSjkaj1rGvX6AKzIZ19bg8BnDrVw4KQc";
    assertEquals(new Passwords.Verified(true, Optional.empty()), Passwords.verify(cffi, "pw"));
    // node-argon2 0.45.1 writes m,p,t; Spring (like libargon2) only parses m,t,p.
    String node = "{argon2}$argon2id$v=19$m=19456,p=1,t=2$yicTHnSW1i8qRUmdNAbUyA$3x14rcRfaMq+Akio0EutaRBea5WF4RsLUtcQfs23CaA";
    assertFalse(Passwords.verify(node, "pw").ok());
  }

  @Test
  void legacyBcryptIsUpgraded() {
    String legacy = Passwords.BCRYPT.encode("pw"); // unprefixed "$2a$12$..."
    Passwords.Verified v = Passwords.verify(legacy, "pw");
    assertTrue(v.ok());
    assertTrue(v.rehash().orElseThrow().startsWith("{argon2}$argon2id$"));
    assertFalse(Passwords.verify(legacy, "nope").ok());
    assertThrows(IllegalArgumentException.class, () -> Passwords.BCRYPT.encode("x".repeat(73)));
  }

  @Test
  void malformed() {
    assertFalse(Passwords.verify("not-a-hash", "pw").ok());
    assertFalse(Passwords.verify("{argon2}garbage", "pw").ok());
  }
}
