import base64
import hashlib
import hmac
import json
import struct
import unittest
from urllib.parse import parse_qs, unquote, urlparse

from accounts import clock as clock_module
from accounts.app import handle
from accounts.db import reset_db

T0 = 1_800_000_000.0


def hotp(key: bytes, counter: int, digits: int = 6) -> str:
    mac = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    code = (struct.unpack(">I", mac[offset:offset + 4])[0] & 0x7FFFFFFF) % 10 ** digits
    return str(code).zfill(digits)


def totp(secret_b32: str, at: float, digits: int = 6) -> str:
    key = base64.b32decode(secret_b32.upper() + "=" * (-len(secret_b32) % 8))
    return hotp(key, int(at // 30), digits)


class FakeClock:
    def __init__(self):
        self.t = T0

    def now(self):
        return self.t


def call(method, path, body=None, user=None):
    headers = {"authorization": f"Bearer session:{user}"} if user else {}
    return handle(method, path, headers, json.dumps(body).encode() if body is not None else b"")


def login(code=None, password="correct horse"):
    body = {"username": "alice", "password": password}
    if code is not None:
        body["code"] = code
    return call("POST", "/login", body)


class HiddenTotpTest(unittest.TestCase):
    def setUp(self):
        reset_db()
        self.clock = FakeClock()
        self._orig = clock_module.clock.now
        clock_module.clock.now = self.clock.now

    def tearDown(self):
        clock_module.clock.now = self._orig

    def enroll_and_confirm(self):
        status, data = call("POST", "/2fa/enroll", user="alice")
        self.assertEqual(status, 200)
        secret = data["secret"]
        status, _ = call("POST", "/2fa/confirm", {"code": totp(secret, self.clock.t)}, user="alice")
        self.assertEqual(status, 200)
        self.clock.t += 90  # well past the confirmation step and its drift window
        return secret

    def test_oracle_matches_rfc6238(self):
        key = b"12345678901234567890"
        secret = base64.b32encode(key).decode().rstrip("=")
        self.assertEqual(totp(secret, 59, 8), "94287082")
        self.assertEqual(totp(secret, 1111111109, 8), "07081804")
        self.assertEqual(totp(secret, 20000000000, 8), "65353130")

    def test_enroll_returns_base32_secret_and_otpauth_uri(self):
        self.assertEqual(call("POST", "/2fa/enroll")[0], 401)
        status, data = call("POST", "/2fa/enroll", user="alice")
        self.assertEqual(status, 200)
        secret = data["secret"]
        self.assertRegex(secret, r"^[A-Z2-7]+$")
        self.assertGreaterEqual(len(base64.b32decode(secret + "=" * (-len(secret) % 8))), 20, "at least 160 bits")
        uri = urlparse(data["otpauth_uri"])
        self.assertEqual((uri.scheme, uri.netloc), ("otpauth", "totp"))
        self.assertIn("alice", unquote(uri.path))
        query = parse_qs(uri.query)
        self.assertEqual(query["secret"], [secret])
        self.assertEqual(query["issuer"], ["Teamnotes"])
        self.assertNotEqual(call("POST", "/2fa/enroll", user="bob")[1]["secret"], secret)

    def test_confirmation_needs_a_valid_code_and_until_then_login_needs_none(self):
        status, data = call("POST", "/2fa/enroll", user="alice")
        self.assertEqual(login()[0], 200, "not enabled before confirmation")
        self.assertEqual(call("POST", "/2fa/confirm", {"code": "000000"}, user="alice")[0], 400)
        self.assertEqual(login()[0], 200)
        self.assertEqual(call("POST", "/2fa/confirm", {"code": totp(data["secret"], self.clock.t)}, user="alice")[0], 200)

    def test_login_requires_a_valid_code_once_enabled(self):
        secret = self.enroll_and_confirm()
        self.assertEqual(login(), (401, {"error": "code_required"}))
        self.assertEqual(login("123456" if totp(secret, self.clock.t) != "123456" else "654321"), (401, {"error": "invalid_code"}))
        status, data = login(totp(secret, self.clock.t))
        self.assertEqual((status, data.get("session")), (200, "session:alice"))
        self.assertEqual(login(totp(secret, self.clock.t + 30), password="wrong")[0], 401, "password still required")

    def test_one_step_of_clock_drift_is_accepted_two_are_not(self):
        secret = self.enroll_and_confirm()
        self.assertEqual(login(totp(secret, self.clock.t - 30))[0], 200)
        self.clock.t += 90
        self.assertEqual(login(totp(secret, self.clock.t + 30))[0], 200)
        self.clock.t += 90
        self.assertEqual(login(totp(secret, self.clock.t - 60))[0], 401)
        self.assertEqual(login(totp(secret, self.clock.t + 60))[0], 401)

    def test_a_code_cannot_be_replayed(self):
        secret = self.enroll_and_confirm()
        code = totp(secret, self.clock.t)
        self.assertEqual(login(code)[0], 200)
        self.assertEqual(login(code)[0], 401)
        self.clock.t += 10  # same 30-second step
        self.assertEqual(login(code)[0], 401)
        self.clock.t += 30
        self.assertEqual(login(totp(secret, self.clock.t))[0], 200)

    def test_five_failed_codes_lock_login_for_15_minutes(self):
        secret = self.enroll_and_confirm()
        wrong = "000000" if totp(secret, self.clock.t) != "000000" else "111111"
        for _ in range(5):
            self.assertEqual(login(wrong)[0], 401)
        self.assertEqual(login(totp(secret, self.clock.t)), (429, {"error": "locked"}))
        self.clock.t += 15 * 60 - 31
        self.assertEqual(login(totp(secret, self.clock.t))[0], 429)
        self.clock.t += 60
        self.assertEqual(login(totp(secret, self.clock.t))[0], 200)

    def test_success_resets_the_failure_counter(self):
        secret = self.enroll_and_confirm()
        wrong = "000000" if totp(secret, self.clock.t) != "000000" else "111111"
        for _ in range(4):
            login(wrong)
        self.assertEqual(login(totp(secret, self.clock.t))[0], 200)
        self.clock.t += 30
        for _ in range(4):
            self.assertEqual(login(wrong)[0], 401)
        self.assertEqual(login(totp(secret, self.clock.t))[0], 200)

    def test_disable_needs_password_and_code(self):
        secret = self.enroll_and_confirm()
        self.assertNotEqual(call("POST", "/2fa/disable", {"password": "wrong", "code": totp(secret, self.clock.t)}, user="alice")[0], 200)
        self.assertNotEqual(call("POST", "/2fa/disable", {"password": "correct horse", "code": "000000" if totp(secret, self.clock.t) != "000000" else "111111"}, user="alice")[0], 200)
        self.assertEqual(call("POST", "/2fa/disable", {"password": "correct horse", "code": totp(secret, self.clock.t)}, user="alice")[0], 200)
        self.assertEqual(login()[0], 200)

    def test_two_factor_state_is_per_user(self):
        self.enroll_and_confirm()
        self.assertEqual(call("POST", "/login", {"username": "bob", "password": "battery staple"})[0], 200)


if __name__ == "__main__":
    unittest.main()
