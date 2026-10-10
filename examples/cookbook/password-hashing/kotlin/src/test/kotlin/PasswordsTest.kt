// SPDX-License-Identifier: Apache-2.0
package example.passwords

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder

class PasswordsTest {
    @Test
    fun hashAndVerify() {
        val h = Passwords.hash("correct horse battery staple")
        assertTrue(h.startsWith("{argon2}\$argon2id\$v=19\$m=19456,t=2,p=1\$"), h)
        assertEquals(Passwords.Verified(true), Passwords.verify(h, "correct horse battery staple"))
        assertFalse(Passwords.verify(h, "wrong").ok)
        assertNotEquals(h, Passwords.hash("correct horse battery staple"))
    }

    @Test
    fun weakerArgon2IsUpgraded() {
        val weak = "{argon2}" + Argon2PasswordEncoder(16, 32, 1, 8192, 1).encode("pw")
        val v = Passwords.verify(weak, "pw")
        assertTrue(v.ok)
        assertTrue(v.rehash!!.startsWith("{argon2}\$argon2id\$v=19\$m=19456,t=2,p=1\$"))
    }

    @Test
    fun referenceHashVerifies() {
        // argon2-cffi 25.1.0 (reference libargon2) output for "pw".
        val cffi = "{argon2}\$argon2id\$v=19\$m=19456,t=2,p=1\$ecqUURt5rXczDOhwQxrhZw\$w2dzt0CPmUdvSjkaj1rGvX6AKzIZ19bg8BnDrVw4KQc"
        assertEquals(Passwords.Verified(true), Passwords.verify(cffi, "pw"))
    }

    @Test
    fun legacyBcryptIsUpgraded() {
        val legacy = Passwords.bcrypt.encode("pw")!!
        val v = Passwords.verify(legacy, "pw")
        assertTrue(v.ok)
        assertTrue(v.rehash!!.startsWith("{argon2}\$argon2id\$"))
        assertFalse(Passwords.verify(legacy, "nope").ok)
        assertFailsWith<IllegalArgumentException> { Passwords.bcrypt.encode("x".repeat(73)) }
    }

    @Test
    fun malformed() {
        assertFalse(Passwords.verify("not-a-hash", "pw").ok)
        assertFalse(Passwords.verify("{argon2}garbage", "pw").ok)
    }
}
