# SPDX-License-Identifier: Apache-2.0
import unittest

from webhook_signature import WebhookError, sign_webhook, verify_webhook

SECRET = "whsec_test_secret_0123456789abcd"
T = 1790000000
BODY = "{\"id\":\"evt_1\",\"amount\":1999}"
HEADER = "t=1790000000,v1=ad4e559e93bea390aff65b8c1eaec615bbdf3df1ef1d1c908b03299c20cf44a6"
SIG = HEADER.split("v1=")[1]


class WebhookTests(unittest.TestCase):
    def kind(self, header, body=BODY, secret=SECRET, now=T):
        with self.assertRaises(WebhookError) as caught:
            verify_webhook(header, body, secret, now)
        return caught.exception.kind

    def test_sign_vector(self):
        self.assertEqual(sign_webhook(SECRET, T, BODY), HEADER)
        self.assertEqual(sign_webhook(SECRET.encode(), T, BODY.encode()), HEADER)

    def test_verify_window(self):
        self.assertEqual(verify_webhook(HEADER, BODY, SECRET, T), T)
        self.assertEqual(verify_webhook(HEADER, BODY, SECRET, T + 300), T)
        self.assertEqual(verify_webhook(HEADER, BODY, SECRET, T - 300), T)
        self.assertEqual(self.kind(HEADER, now=T + 301), "expired")
        self.assertEqual(self.kind(HEADER, now=T - 301), "expired")

    def test_bad_signature(self):
        self.assertEqual(self.kind(HEADER, body=BODY.replace("1999", "1998")), "bad signature")
        self.assertEqual(self.kind(HEADER, secret=SECRET + "x"), "bad signature")
        flipped = SIG[:-1] + ("7" if SIG[-1] != "7" else "8")
        self.assertEqual(self.kind(f"t={T},v1={flipped}"), "bad signature")

    def test_multiple_and_whitespace(self):
        self.assertEqual(verify_webhook(f"t={T},v1={'0' * 64},v1={SIG}", BODY, SECRET, T), T)
        self.assertEqual(verify_webhook(f" t = {T} , v0=abc, v1 = {SIG} ", BODY, SECRET, T), T)

    def test_malformed(self):
        self.assertEqual(self.kind(f"v1={SIG}"), "malformed")
        self.assertEqual(self.kind(f"t={T},t={T},v1={SIG}"), "malformed")
        self.assertEqual(self.kind(f"t={T},v1={SIG[:-1]}z"), "malformed")
        self.assertEqual(self.kind(f"t={T},v1={SIG.upper()}"), "malformed")
        self.assertEqual(self.kind(f"t={T}"), "malformed")
        self.assertEqual(self.kind(f"t=abc,v1={SIG}"), "malformed")
        self.assertEqual(self.kind("garbage"), "malformed")

    def test_secret_required(self):
        with self.assertRaises(ValueError):
            sign_webhook("", T, BODY)
        with self.assertRaises(ValueError):
            verify_webhook(HEADER, BODY, b"", T)


if __name__ == "__main__":
    unittest.main()
