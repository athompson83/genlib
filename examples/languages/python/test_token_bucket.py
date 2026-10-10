# SPDX-License-Identifier: Apache-2.0
import unittest

from token_bucket import BucketState, new_bucket, take

STEPS = [  # now, cost, allowed, tokens_milli, retry_after_ms
    (0, 1, True, 4000, 0), (0, 1, True, 3000, 0), (0, 1, True, 2000, 0), (0, 1, True, 1000, 0),
    (0, 1, True, 0, 0), (0, 1, False, 0, 500), (250, 1, False, 500, 250), (500, 1, True, 0, 0),
    (500, 2, False, 0, 1000), (3000, 5, True, 0, 0),
]


class TokenBucketTests(unittest.TestCase):
    def test_vector(self):
        state = new_bucket(5, 0)
        self.assertEqual(state, BucketState(5000, 0))
        for now, cost, allowed, tokens, retry in STEPS:
            result = take(state, now, cost, 5, 2)
            self.assertEqual((result.allowed, result.state.tokens_milli, result.retry_after_ms),
                             (allowed, tokens, retry), (now, cost))
            state = result.state

    def test_clock_backwards_adds_nothing(self):
        result = take(BucketState(0, 1000), 500, 1, 5, 2)
        self.assertEqual(result.state, BucketState(0, 1000))
        self.assertFalse(result.allowed)

    def test_validation(self):
        with self.assertRaises(ValueError):
            take(new_bucket(5, 0), 0, 6, 5, 2)
        with self.assertRaises(ValueError):
            take(new_bucket(5, 0), 0, 0, 5, 2)
        with self.assertRaises(ValueError):
            new_bucket(0, 0)
        with self.assertRaises(TypeError):
            take(new_bucket(5, 0), 0.5, 1, 5, 2)


if __name__ == "__main__":
    unittest.main()
