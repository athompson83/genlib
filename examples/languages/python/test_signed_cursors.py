# SPDX-License-Identifier: Apache-2.0
import unittest

from signed_cursors import CursorError, decode_cursor, encode_cursor

SECRET = b"0123456789abcdef0123456789abcdef"
VALUES = ["2026-10-01T12:00:00Z", "42"]
TOKEN = "djEKMTc5MDAwMDAwMAoyMDI2LTEwLTAxVDEyOjAwOjAwWgo0Mg.T2z74zcZhdSIFHTOhu4Wc0MNbTN2t71UXXeQpcLoUUc"


class CursorTests(unittest.TestCase):
    def kind(self, token, secret=SECRET, now=1789999999):
        with self.assertRaises(CursorError) as ctx:
            decode_cursor(token, secret, now)
        self.assertTrue(str(ctx.exception).startswith(ctx.exception.kind))
        return ctx.exception.kind

    def test_vector_round_trip(self):
        self.assertEqual(encode_cursor(VALUES, SECRET, 1790000000), TOKEN)
        self.assertEqual(decode_cursor(TOKEN, SECRET, 1789999999), VALUES)

    def test_failures(self):
        self.assertEqual(self.kind(TOKEN, now=1790000000), "expired")
        last = "A" if TOKEN[-1] != "A" else "B"
        self.assertEqual(self.kind(TOKEN[:-1] + last), "bad signature")
        self.assertEqual(self.kind(TOKEN[:-1] + "d"), "bad signature")  # only unused bits differ
        self.assertEqual(self.kind(TOKEN.replace(".", "")), "malformed")
        self.assertEqual(self.kind(TOKEN, secret=b"x" * 32), "bad signature")
        self.assertEqual(self.kind(TOKEN + "="), "malformed")
        self.assertEqual(self.kind("." + TOKEN.split(".")[1]), "malformed")
        self.assertEqual(self.kind(TOKEN.replace("d", "+", 1)), "malformed")

    def test_input_validation(self):
        with self.assertRaises(ValueError):
            encode_cursor(VALUES, SECRET[:31], 1790000000)
        with self.assertRaises(ValueError):
            decode_cursor(TOKEN, SECRET[:31], 0)
        for values in ([], ["a\nb"], ["x"] * 17):
            with self.subTest(values=values), self.assertRaises(ValueError):
                encode_cursor(values, SECRET, 1)
        with self.assertRaises(ValueError):
            encode_cursor(VALUES, SECRET, 0)


if __name__ == "__main__":
    unittest.main()
