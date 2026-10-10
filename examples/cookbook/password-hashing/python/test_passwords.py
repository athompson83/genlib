# SPDX-License-Identifier: Apache-2.0
import unittest

import argon2

import passwords


class PasswordTest(unittest.TestCase):
    def test_hash_and_verify(self):
        h = passwords.hash_password("correct horse battery staple")
        self.assertTrue(h.startswith("$argon2id$v=19$m=19456,t=2,p=1$"))
        self.assertEqual(passwords.verify_password(h, "correct horse battery staple"), (True, None))
        self.assertEqual(passwords.verify_password(h, "wrong"), (False, None))
        self.assertNotEqual(h, passwords.hash_password("correct horse battery staple"))  # random salt

    def test_rehash_weaker_params(self):
        weak = argon2.PasswordHasher(time_cost=1, memory_cost=8192, parallelism=1).hash("pw")
        ok, new = passwords.verify_password(weak, "pw")
        self.assertTrue(ok)
        self.assertTrue(new.startswith("$argon2id$v=19$m=19456,t=2,p=1$"))
        self.assertEqual(passwords.verify_password(weak, "nope"), (False, None))

    def test_bcrypt_legacy_upgrade(self):
        legacy = passwords.bcrypt_hash("pw", cost=10)
        ok, new = passwords.verify_password(legacy, "pw")
        self.assertTrue(ok)
        self.assertTrue(new.startswith("$argon2id$"))
        self.assertEqual(passwords.verify_password(legacy, "nope"), (False, None))
        with self.assertRaises(ValueError):
            passwords.bcrypt_hash("x" * 73)

    def test_node_argon2_parameter_order_is_rejected(self):
        # node-argon2 0.45.1 writes m,p,t; libargon2 (used here) only decodes m,t,p.
        node = "$argon2id$v=19$m=19456,p=1,t=2$yicTHnSW1i8qRUmdNAbUyA$3x14rcRfaMq+Akio0EutaRBea5WF4RsLUtcQfs23CaA"
        self.assertEqual(passwords.verify_password(node, "pw"), (False, None))

    def test_malformed_hash(self):
        self.assertEqual(passwords.verify_password("not-a-hash", "pw"), (False, None))


if __name__ == "__main__":
    unittest.main()
