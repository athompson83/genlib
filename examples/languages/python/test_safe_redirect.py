# SPDX-License-Identifier: Apache-2.0
import unittest

from safe_redirect import safe_redirect

ALLOWED = ["https://app.example.com", "https://accounts.example.com:8443"]
CASES = [
    ("/dashboard?tab=1#top", "/dashboard?tab=1#top"), ("//evil.com/x", "/"), ("/\\evil.com", "/"),
    ("https://app.example.com/settings", "https://app.example.com/settings"),
    ("HTTPS://APP.EXAMPLE.COM:443/a", "HTTPS://APP.EXAMPLE.COM:443/a"), ("https://app.example.com.evil.com/", "/"),
    ("https://user@app.example.com/", "/"), ("http://app.example.com/", "/"),
    ("https://accounts.example.com:8443/login", "https://accounts.example.com:8443/login"),
    ("https://accounts.example.com/login", "/"), ("javascript:alert(1)", "/"), ("/ok path", "/"),
    ("dashboard", "/"), ("", "/"), ("/\t/evil.com", "/"), ("https://app.example.com:99999/", "/"),
]


class SafeRedirectTests(unittest.TestCase):
    def test_vectors(self):
        for target, expected in CASES:
            self.assertEqual(safe_redirect(target, ALLOWED), expected, target)
            self.assertEqual(safe_redirect(target, ALLOWED, "/home"), expected if expected != "/" else "/home")

    def test_extra(self):
        self.assertEqual(safe_redirect("/" + "a" * 2048, ALLOWED), "/")
        self.assertEqual(safe_redirect("/x\x7f", ALLOWED), "/")
        self.assertEqual(safe_redirect("https://app..example.com/", ALLOWED), "/")
        self.assertEqual(safe_redirect("https://app.example.com", ["HTTPS://App.Example.com:443"]), "https://app.example.com")
        self.assertEqual(safe_redirect(None, ALLOWED), "/")


if __name__ == "__main__":
    unittest.main()
