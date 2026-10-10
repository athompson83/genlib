# SPDX-License-Identifier: Apache-2.0
import re
import unittest

from oidc_pkce import (OAuthCallbackError, build_authorization_url, code_challenge_s256,
                       generate_code_verifier, parse_callback, random_token, token_request_body)

CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
BASE = dict(client_id="app 1", redirect_uri="https://app.example.com/cb", scope=["openid", "email"],
            state="s1", nonce="n1", code_challenge=CHALLENGE)


class OidcPkceTests(unittest.TestCase):
    def test_rfc7636_challenge(self):
        self.assertEqual(code_challenge_s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), CHALLENGE)

    def test_verifier_and_tokens(self):
        verifier = generate_code_verifier()
        self.assertEqual(len(verifier), 64)
        self.assertRegex(verifier, r"^[A-Za-z0-9._~-]+$")
        self.assertEqual(len(generate_code_verifier(43)), 43)
        self.assertEqual(len(generate_code_verifier(128)), 128)
        for bad in (42, 129):
            with self.assertRaises(ValueError):
                generate_code_verifier(bad)
        token = random_token()
        self.assertRegex(token, r"^[A-Za-z0-9_-]{43}$")
        self.assertNotEqual(random_token(), token)

    def test_authorization_url(self):
        self.assertEqual(
            build_authorization_url(authorization_endpoint="https://id.example.com/authorize", **BASE),
            "https://id.example.com/authorize?response_type=code&client_id=app%201"
            "&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&scope=openid%20email&state=s1&nonce=n1"
            f"&code_challenge={CHALLENGE}&code_challenge_method=S256")
        with self.assertRaises(ValueError):
            build_authorization_url(authorization_endpoint="http://id.example.com/authorize", **BASE)
        url = build_authorization_url(authorization_endpoint="http://localhost:8080/authorize", **BASE)
        self.assertTrue(url.startswith("http://localhost:8080/authorize?response_type=code&"))
        url = build_authorization_url(**{**BASE, "scope": "openid profile"},
                                      authorization_endpoint="https://id.example.com/authorize?tenant=a",
                                      extra_params=[("prompt", "login"), ("ui_locales", "en fr")])
        self.assertTrue(url.startswith("https://id.example.com/authorize?tenant=a&response_type=code&"))
        self.assertIn("scope=openid%20profile&", url)
        self.assertTrue(url.endswith("code_challenge_method=S256&prompt=login&ui_locales=en%20fr"))
        with self.assertRaisesRegex(ValueError, "openid"):
            build_authorization_url(**{**BASE, "scope": ["email"]}, authorization_endpoint="https://id.example.com/a")
        with self.assertRaisesRegex(ValueError, "override"):
            build_authorization_url(**BASE, authorization_endpoint="https://id.example.com/a", extra_params={"state": "x"})

    def test_parse_callback(self):
        self.assertEqual(parse_callback("https://app.example.com/cb?code=abc&state=s1", "s1"), {"code": "abc"})
        cases = [
            ("https://app.example.com/cb?code=abc&state=s1", "s2", "state_mismatch", None),
            ("https://app.example.com/cb?error=access_denied&error_description=User%20denied&state=s1", "s1",
             "access_denied", "User denied"),
            ("https://app.example.com/cb?state=s1", "s1", "missing_code", None),
            ("https://app.example.com/cb?code=a&code=b&state=s1", "s1", "invalid_callback", "Duplicate code parameter"),
        ]
        for url, state, error, description in cases:
            with self.assertRaises(OAuthCallbackError) as ctx:
                parse_callback(url, state)
            self.assertEqual(ctx.exception.error, error)
            self.assertEqual(ctx.exception.error_description, description)

    def test_token_request_body(self):
        self.assertEqual(
            token_request_body(code="c d", redirect_uri="https://app.example.com/cb", client_id="app", code_verifier="v"),
            "grant_type=authorization_code&code=c+d&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb"
            "&client_id=app&code_verifier=v")
        self.assertIsNone(re.search(r"\s", token_request_body(code="a b c", redirect_uri="x", client_id="y", code_verifier="z")))


if __name__ == "__main__":
    unittest.main()
