# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 9 shared vector set; do not edit the literals by hand.
import unittest

from circuit_breaker import CircuitBreaker

SCRIPTS = [[[2, 1000, 1],
  [['allow', 0, True],
   ['failure', 0, None],
   ['state', 0, 'closed'],
   ['failure', 10, None],
   ['state', 10, 'open'],
   ['allow', 500, False],
   ['retry_after', 500, 510],
   ['state', 1010, 'half_open'],
   ['allow', 1010, True],
   ['allow', 1011, False],
   ['success', 1020, None],
   ['state', 1020, 'closed'],
   ['allow', 1021, True]]],
 [[3, 500, 2],
  [['failure', 0, None],
   ['success', 1, None],
   ['failure', 2, None],
   ['failure', 3, None],
   ['state', 3, 'closed'],
   ['failure', 4, None],
   ['state', 4, 'open'],
   ['state', 503, 'open'],
   ['allow', 504, True],
   ['allow', 505, True],
   ['allow', 506, False],
   ['failure', 507, None],
   ['state', 507, 'open'],
   ['retry_after', 600, 407],
   ['state', 1007, 'half_open'],
   ['allow', 1008, True],
   ['success', 1009, None],
   ['state', 1009, 'closed']]],
 [[1, 0, 1],
  [['failure', 5, None],
   ['state', 5, 'half_open'],
   ['allow', 5, True],
   ['allow', 5, False],
   ['failure', 6, None],
   ['state', 6, 'half_open'],
   ['allow', 6, True]]]]
INVALID = [[0, 1000, 1], [1, -1, 1], [1, 1000, 0]]


class CircuitBreakerTest(unittest.TestCase):
    def test_scripts(self):
        for config, steps in SCRIPTS:
            breaker = CircuitBreaker(*config)
            for op, now, expected in steps:
                if op == "allow":
                    got = breaker.allow(now)
                elif op == "success":
                    got = breaker.record_success(now)
                elif op == "failure":
                    got = breaker.record_failure(now)
                elif op == "state":
                    got = breaker.state(now)
                else:
                    got = breaker.retry_after_ms(now)
                self.assertEqual(got, expected, (config, op, now))

    def test_invalid(self):
        for config in INVALID:
            with self.assertRaises(ValueError):
                CircuitBreaker(*config)

    def test_defaults(self):
        breaker = CircuitBreaker()
        for t in range(4):
            breaker.record_failure(t)
        self.assertEqual(breaker.state(4), "closed")
        breaker.record_failure(4)
        self.assertEqual(breaker.retry_after_ms(4), 30000)


if __name__ == "__main__":
    unittest.main()
