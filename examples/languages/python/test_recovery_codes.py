# SPDX-License-Identifier: Apache-2.0
import unittest

from recovery_codes import (find_recovery_code, generate_recovery_codes, hash_recovery_code,
                            normalize_recovery_code)

KEY = b"pepper"
# python3 -c "import hmac,hashlib;print(hmac.new(b'pepper',b'7K3QX9MNP2',hashlib.sha256).hexdigest())"
EXPECTED_HEX = "b6a0f9ca8ffdc4e8e3268b490bb8beeda45f367550751b8cb151636dad869138"
CODE_RE = r"^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$"


class RecoveryCodeTests(unittest.TestCase):
    def test_normalize(self):
        self.assertEqual(normalize_recovery_code(" 7k3qx-9mnp2 "), "7K3QX9MNP2")
        self.assertEqual(normalize_recovery_code("ABCDE-FGHIO"), "ABCDEFGH10")
        with self.assertRaisesRegex(ValueError, "character"):
            normalize_recovery_code("ABCDE-FGHIU")
        with self.assertRaisesRegex(ValueError, "10 characters"):
            normalize_recovery_code("ABC")

    def test_hash(self):
        self.assertEqual(hash_recovery_code("7K3QX-9MNP2", KEY), EXPECTED_HEX)

    def test_generate_and_find(self):
        codes = generate_recovery_codes()
        self.assertEqual(len(codes), 10)
        self.assertEqual(len(set(codes)), 10)
        for code in codes:
            self.assertRegex(code, CODE_RE)
        hashes = [hash_recovery_code(c, KEY) for c in codes[:3]]
        self.assertEqual(find_recovery_code(codes[2].lower(), hashes, KEY), 2)
        self.assertIsNone(find_recovery_code(codes[5], hashes, KEY))
        self.assertIsNone(find_recovery_code("not a code", hashes, KEY))
        self.assertRegex(generate_recovery_codes(3, groups=3, group_length=4)[0], r"^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$")


if __name__ == "__main__":
    unittest.main()
