// SPDX-License-Identifier: Apache-2.0
package example.passwords

import org.springframework.security.crypto.argon2.Argon2PasswordEncoder
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.DelegatingPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder

/**
 * Argon2id via Spring Security crypto + Bouncy Castle (JVM / Android with BC).
 * OWASP minimum: m=19456 KiB, t=2, p=1. Stored as "{argon2}$argon2id$...";
 * unprefixed legacy bcrypt rows are accepted and upgraded.
 */
object Passwords {
    val argon2 = Argon2PasswordEncoder(16, 32, 1, 19456, 2)

    /** Fallback where Argon2 is unavailable. OWASP: cost >= 10; rejects inputs over 72 bytes. */
    val bcrypt = BCryptPasswordEncoder(12)

    private val encoder = DelegatingPasswordEncoder(
        "argon2", mapOf<String, PasswordEncoder>("argon2" to argon2, "bcrypt" to bcrypt),
    ).apply { setDefaultPasswordEncoderForMatches(bcrypt) }

    fun hash(password: String): String = encoder.encode(password)!!

    /** Persist [rehash] when it is not null. */
    data class Verified(val ok: Boolean, val rehash: String? = null)

    fun verify(stored: String, password: String): Verified {
        val ok = try {
            encoder.matches(password, stored)
        } catch (e: IllegalArgumentException) {
            false // malformed hash or over-long bcrypt input
        }
        if (!ok) return Verified(false)
        return Verified(true, if (encoder.upgradeEncoding(stored)) hash(password) else null)
    }
}
