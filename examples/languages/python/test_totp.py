# SPDX-License-Identifier: Apache-2.0
import unittest

from totp import base32_decode, base32_encode, generate_secret, hotp, otpauth_uri, totp, verify_totp

SHA1 = b"12345678901234567890"
SHA256 = b"12345678901234567890123456789012"
SHA512 = b"1234567890123456789012345678901234567890123456789012345678901234"


class TotpTests(unittest.TestCase):
    def test_rfc4226_hotp(self):
        expected = ["755224", "287082", "359152", "969429", "338314",
                    "254676", "287922", "162583", "399871", "520489"]
        self.assertEqual([hotp(SHA1, c) for c in range(10)], expected)
        with self.assertRaises(ValueError):
            hotp(SHA1, -1)
        with self.assertRaises(ValueError):
            hotp(SHA1, 0, digits=5)

    def test_rfc6238_totp(self):
        table = [
            (59, "94287082", "46119246", "90693936"),
            (1111111109, "07081804", "68084774", "25091201"),
            (1111111111, "14050471", "67062674", "99943326"),
            (1234567890, "89005924", "91819424", "93441116"),
            (2000000000, "69279037", "90698825", "38618901"),
            (20000000000, "65353130", "77737706", "47863826"),
        ]
        for t, sha1, sha256, sha512 in table:
            self.assertEqual(totp(SHA1, t, digits=8, algorithm="SHA1"), sha1)
            self.assertEqual(totp(SHA256, t, digits=8, algorithm="SHA256"), sha256)
            self.assertEqual(totp(SHA512, t, digits=8, algorithm="SHA512"), sha512)

    def test_verify(self):
        code = totp(SHA1, 59, digits=8)
        self.assertTrue(verify_totp(code, SHA1, 59, digits=8))
        self.assertTrue(verify_totp(code, SHA1, 89, digits=8))
        self.assertFalse(verify_totp(code, SHA1, 150, digits=8))
        self.assertFalse(verify_totp(code, SHA1, 89, digits=8, window=0))
        self.assertFalse(verify_totp("abc", SHA1, 59, digits=8))
        self.assertFalse(verify_totp("1234567", SHA1, 59, digits=8))

    def test_base32(self):
        self.assertEqual(base32_encode(b"foobar"), "MZXW6YTBOI")
        self.assertEqual(base32_decode("mzxw 6ytb-oi=="), b"foobar")
        with self.assertRaises(ValueError):
            base32_decode("MZ1")

    def test_uri_and_secret(self):
        self.assertEqual(
            otpauth_uri("Acme Co", "alice@example.com", "JBSWY3DPEHPK3PXP"),
            "otpauth://totp/Acme%20Co:alice%40example.com?secret=JBSWY3DPEHPK3PXP"
            "&issuer=Acme%20Co&algorithm=SHA1&digits=6&period=30")
        secret = generate_secret()
        self.assertEqual(len(secret), 20)
        self.assertEqual(base32_decode(base32_encode(secret)), secret)
        with self.assertRaises(ValueError):
            generate_secret(8)


if __name__ == "__main__":
    unittest.main()
