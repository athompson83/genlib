# SPDX-License-Identifier: Apache-2.0
"""Local-only test: RSA keys generated here, JWKS served from 127.0.0.1."""
import json
import os
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

from oidc_verify import OidcVerifier, TokenInvalid

os.environ["NO_PROXY"] = os.environ["no_proxy"] = "127.0.0.1,localhost"
ISS, AUD = "https://idp.example.test", "client-123"
KEYS: dict[str, rsa.RSAPrivateKey] = {}
FETCHES = [0]


def add_key(kid: str) -> rsa.RSAPrivateKey:
    KEYS[kid] = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return KEYS[kid]


class JwksHandler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        FETCHES[0] += 1
        keys = []
        for kid, k in KEYS.items():
            jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(k.public_key()))
            keys.append({**jwk, "kid": kid, "alg": "RS256", "use": "sig"})
        body = json.dumps({"keys": keys}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def sign(key, kid, **over):
    now = int(time.time())
    claims = {"iss": ISS, "aud": AUD, "sub": "user-1", "iat": now, "nbf": now, "exp": now + 300, "nonce": "n-1"}
    claims.update(over)
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid})


class OidcTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        add_key("k1")
        cls.srv = HTTPServer(("127.0.0.1", 0), JwksHandler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.v = OidcVerifier(ISS, AUD, f"http://127.0.0.1:{cls.srv.server_port}/jwks", leeway_seconds=5)

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def test_valid(self):
        self.assertEqual(self.v.verify(sign(KEYS["k1"], "k1"), nonce="n-1")["sub"], "user-1")

    def test_rejections(self):
        now = int(time.time())
        k = KEYS["k1"]
        bad = [
            sign(k, "k1", aud="other"),
            sign(k, "k1", iss="https://evil.test"),
            sign(k, "k1", exp=now - 30, nbf=now - 60),
            sign(k, "k1", nbf=now + 120),
            jwt.encode({"iss": ISS, "aud": AUD, "sub": "x", "iat": now, "exp": now + 60}, "x" * 32, algorithm="HS256", headers={"kid": "k1"}),
        ]
        for t in bad:
            with self.assertRaises(TokenInvalid):
                self.v.verify(t)
        tok = sign(k, "k1")
        with self.assertRaises(TokenInvalid):
            self.v.verify(tok[:-4] + ("AAAA" if not tok.endswith("AAAA") else "BBBB"))
        with self.assertRaises(TokenInvalid):
            self.v.verify(tok, nonce="other")
        # within leeway
        self.v.verify(sign(k, "k1", exp=now - 2, nbf=now - 60))

    def test_kid_rotation(self):
        before = FETCHES[0]
        k2 = add_key("k2")
        self.assertEqual(self.v.verify(sign(k2, "k2"))["sub"], "user-1")
        self.assertGreater(FETCHES[0], before)
        stranger = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        with self.assertRaises(TokenInvalid):
            self.v.verify(sign(stranger, "unknown"))

    def test_forbidden_alg_config(self):
        with self.assertRaises(ValueError):
            OidcVerifier(ISS, AUD, "https://x", algorithms=("HS256",))


if __name__ == "__main__":
    unittest.main()
