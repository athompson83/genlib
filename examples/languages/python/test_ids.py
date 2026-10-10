# SPDX-License-Identifier: Apache-2.0
import re
import unittest

from ids import new_ulid, new_uuid_v7, ulid, ulid_time, uuid_v7, uuid_v7_time

R = bytes(range(1, 11))
MS = 1790000000123


class IdsTests(unittest.TestCase):
    def test_vectors(self):
        self.assertEqual(uuid_v7(MS, R), "01a0c450-6c7b-7102-8304-05060708090a")
        self.assertEqual(ulid(MS, R), "01M3250V3V041061050R3GG28A")
        self.assertEqual(uuid_v7(0, bytes(10)), "00000000-0000-7000-8000-000000000000")
        self.assertEqual(ulid((1 << 48) - 1, b"\xff" * 10), "7ZZZZZZZZZZZZZZZZZZZZZZZZZ")

    def test_round_trip(self):
        self.assertEqual(uuid_v7_time("01a0c450-6c7b-7102-8304-05060708090a"), MS)
        self.assertEqual(uuid_v7_time("01A0C450-6C7B-7102-8304-05060708090A"), MS)
        self.assertEqual(ulid_time("01M3250V3V041061050R3GG28A"), MS)
        self.assertEqual(ulid_time("01m3250v3v041061050r3gg28a"), MS)
        self.assertEqual(uuid_v7_time("00000000-0000-7000-8000-000000000000"), 0)
        self.assertEqual(ulid_time("7ZZZZZZZZZZZZZZZZZZZZZZZZZ"), (1 << 48) - 1)

    def test_validation(self):
        for bad_ms in (-1, 1 << 48, 1.5, True):
            with self.assertRaises(ValueError):
                uuid_v7(bad_ms, R)
        for bad_r in (bytes(9), bytes(11), "0123456789"):
            with self.assertRaises(ValueError):
                ulid(MS, bad_r)
        for bad in ("01a0c450-6c7b-6102-8304-05060708090a", "01a0c450-6c7b-7102-c304-05060708090a",
                    "01a0c450-6c7b-7102-8304-05060708090", "01a0c450x6c7b-7102-8304-05060708090a",
                    "01a0c450-6c7b-7102-8304-05060708090g"):
            with self.assertRaises(ValueError):
                uuid_v7_time(bad)
        for bad in ("81M3250V3V041061050R3GG28A", "01M3250V3V041061050R3GG28", "01M3250V3V041061050R3GG28U"):
            with self.assertRaises(ValueError):
                ulid_time(bad)

    def test_random(self):
        a, b = new_uuid_v7(), new_uuid_v7()
        self.assertRegex(a, r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
        self.assertNotEqual(a, b)
        c, d = new_ulid(), new_ulid()
        self.assertTrue(re.fullmatch(r"[0-7][0-9A-HJKMNP-TV-Z]{25}", c))
        self.assertNotEqual(c, d)


if __name__ == "__main__":
    unittest.main()
