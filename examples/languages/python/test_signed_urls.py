# SPDX-License-Identifier: Apache-2.0
import unittest

from signed_urls import SignedUrlError, sign_url, verify_url

SECRET = "url-signing-secret"
CASES = [
    ("/files/report.pdf?user=42", 1790000000,
     "/files/report.pdf?user=42&expires=1790000000&signature=OBOJTlNq3AuDbND_6J4njKkDIXDMxhx0l0PmWaRbfaU"),
    ("/download/a%20b.zip", 1790003600,
     "/download/a%20b.zip?expires=1790003600&signature=SafK5ZH-apLeaJ-c1dhzp-kyiS3doOR7ywgvr8WDJOo"),
]


class SignedUrlTests(unittest.TestCase):
    def kind(self, signed, secret=SECRET, now=1790000000):
        with self.assertRaises(SignedUrlError) as caught:
            verify_url(signed, secret, now)
        return caught.exception.kind

    def test_vectors(self):
        for target, expires, signed in CASES:
            self.assertEqual(sign_url(target, SECRET, expires), signed)
            self.assertEqual(verify_url(signed, SECRET, expires), expires)
            self.assertEqual(verify_url(signed, SECRET.encode(), expires - 100), expires)
            self.assertEqual(self.kind(signed, now=expires + 1), "expired")

    def test_bad_signature(self):
        for target, expires, signed in CASES:
            self.assertEqual(self.kind(signed.replace(target[:3], target[:2] + "X", 1), now=expires), "bad signature")
            self.assertEqual(self.kind(signed, secret=SECRET + "x", now=expires), "bad signature")
            flipped = signed[:-1] + ("A" if signed[-1] != "A" else "B")
            self.assertEqual(self.kind(flipped, now=expires), "bad signature")

    def test_malformed(self):
        signed = CASES[0][2]
        message, sig = signed.split("&signature=")
        self.assertEqual(self.kind(message), "malformed")
        self.assertEqual(self.kind(message + "&expires=1790000000&signature=" + sig), "malformed")
        self.assertEqual(self.kind(message.replace("1790000000", "17900e0000") + "&signature=" + sig), "malformed")
        self.assertEqual(self.kind(signed + "x"), "malformed")
        self.assertEqual(self.kind(signed[:-1]), "malformed")
        self.assertEqual(self.kind("/files/report.pdf?user=42&signature=" + sig), "malformed")

    def test_sign_rejects(self):
        for target in ("files", "/a#b", "/a?expires=1", "/a?x=1&signature=2", "/a?signature"):
            with self.assertRaises(ValueError):
                sign_url(target, SECRET, 1)
        with self.assertRaises(ValueError):
            sign_url("/a", "", 1)
        with self.assertRaises(ValueError):
            sign_url("/a", SECRET, -1)
        with self.assertRaises(ValueError):
            verify_url(CASES[0][2], "", 1)


if __name__ == "__main__":
    unittest.main()
