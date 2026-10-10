# SPDX-License-Identifier: Apache-2.0
import unittest

from retry_backoff import backoff_delay, retry_after_ms


class BackoffTests(unittest.TestCase):
    def test_vectors(self):
        self.assertEqual(backoff_delay(0, 100, 10000, 0.5), 50)
        self.assertEqual(backoff_delay(3, 100, 10000, 0.999), 799)
        self.assertEqual(backoff_delay(10, 100, 10000, 0.25), 2500)
        self.assertEqual(backoff_delay(3, 100, 10000, 0.0), 0)

    def test_large_attempt_is_capped(self):
        self.assertEqual(backoff_delay(10**9, 100, 10000, 0.5), 5000)
        self.assertEqual(backoff_delay(63, 1, 2**62, 0.5), 2**61)

    def test_validation(self):
        for args in ((-1, 100, 1000, 0.1), (0, 0, 1000, 0.1), (0, 100, 50, 0.1), (0, 100, 1000, 1.0),
                     (0, 100, 1000, -0.1)):
            with self.assertRaises(ValueError):
                backoff_delay(*args)
        with self.assertRaises(TypeError):
            backoff_delay(1.5, 100, 1000, 0.1)


class RetryAfterTests(unittest.TestCase):
    def test_vectors(self):
        self.assertEqual(retry_after_ms("120", 0), 120000)
        self.assertEqual(retry_after_ms("Wed, 21 Oct 2026 07:28:00 GMT", 1792567650000), 30000)
        self.assertEqual(retry_after_ms("Wed, 21 Oct 2015 07:28:00 GMT", 1792567650000), 0)

    def test_rejects_other_values(self):
        for bad in ("", "-5", "1.5", "soon", "Wed, 21 Oct 2026 07:28:00 UTC", "Thu, 21 Oct 2026 07:28:00 GMT",
                    "Wed, 32 Oct 2026 07:28:00 GMT"):
            with self.assertRaises(ValueError, msg=bad):
                retry_after_ms(bad, 0)


if __name__ == "__main__":
    unittest.main()
