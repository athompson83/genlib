# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 7 shared vector set (FNV-1a + fmix32 buckets).
import unittest

from feature_flags import evaluate_flag

# Flags use the shared JSON keys (rolloutPercent, allow, deny, variants).
CASES = [[{'key': 'new-checkout', 'rolloutPercent': 25},
  'user-1',
  {'bucket': 849, 'on': True, 'reason': 'rollout', 'variant': None}],
 [{'key': 'new-checkout', 'rolloutPercent': 25},
  'user-2',
  {'bucket': 5308, 'on': False, 'reason': 'excluded', 'variant': None}],
 [{'key': 'new-checkout', 'rolloutPercent': 25},
  'user-3',
  {'bucket': 5247, 'on': False, 'reason': 'excluded', 'variant': None}],
 [{'key': 'new-checkout', 'rolloutPercent': 25},
  'user-42',
  {'bucket': 9209, 'on': False, 'reason': 'excluded', 'variant': None}],
 [{'key': 'new-checkout', 'rolloutPercent': 25},
  'alice@example.com',
  {'bucket': 9060, 'on': False, 'reason': 'excluded', 'variant': None}],
 [{'allow': ['user-2'], 'deny': ['user-1'], 'key': 'new-checkout', 'rolloutPercent': 25},
  'user-1',
  {'bucket': 849, 'on': False, 'reason': 'deny', 'variant': None}],
 [{'allow': ['user-2'], 'deny': ['user-1'], 'key': 'new-checkout', 'rolloutPercent': 25},
  'user-2',
  {'bucket': 5308, 'on': True, 'reason': 'allow', 'variant': None}],
 [{'allow': ['vip'], 'enabled': False, 'key': 'beta'},
  'vip',
  {'bucket': 8844, 'on': False, 'reason': 'disabled', 'variant': None}],
 [{'key': 'banner', 'rolloutPercent': 0},
  'user-1',
  {'bucket': 6875, 'on': False, 'reason': 'excluded', 'variant': None}],
 [{'key': 'banner', 'rolloutPercent': 100},
  'user-1',
  {'bucket': 6875, 'on': True, 'reason': 'rollout', 'variant': None}],
 [{'key': 'banner', 'rolloutPercent': 12.34},
  'user-9',
  {'bucket': 8197, 'on': False, 'reason': 'excluded', 'variant': None}],
 [{'key': 'pricing-test',
   'variants': [{'name': 'control', 'weight': 50},
                {'name': 'annual-first', 'weight': 30},
                {'name': 'monthly-first', 'weight': 20}]},
  'u1',
  {'bucket': 6435, 'on': True, 'reason': 'rollout', 'variant': 'control'}],
 [{'key': 'pricing-test',
   'variants': [{'name': 'control', 'weight': 50},
                {'name': 'annual-first', 'weight': 30},
                {'name': 'monthly-first', 'weight': 20}]},
  'u2',
  {'bucket': 401, 'on': True, 'reason': 'rollout', 'variant': 'annual-first'}],
 [{'key': 'pricing-test',
   'variants': [{'name': 'control', 'weight': 50},
                {'name': 'annual-first', 'weight': 30},
                {'name': 'monthly-first', 'weight': 20}]},
  'u3',
  {'bucket': 9955, 'on': True, 'reason': 'rollout', 'variant': 'monthly-first'}],
 [{'key': 'pricing-test',
   'variants': [{'name': 'control', 'weight': 50},
                {'name': 'annual-first', 'weight': 30},
                {'name': 'monthly-first', 'weight': 20}]},
  'u4',
  {'bucket': 8249, 'on': True, 'reason': 'rollout', 'variant': 'annual-first'}],
 [{'key': 'pricing-test',
   'variants': [{'name': 'control', 'weight': 50},
                {'name': 'annual-first', 'weight': 30},
                {'name': 'monthly-first', 'weight': 20}]},
  'u5',
  {'bucket': 6254, 'on': True, 'reason': 'rollout', 'variant': 'control'}],
 [{'key': 'pricing-test',
   'variants': [{'name': 'control', 'weight': 50},
                {'name': 'annual-first', 'weight': 30},
                {'name': 'monthly-first', 'weight': 20}]},
  'ünïcode',
  {'bucket': 7068, 'on': True, 'reason': 'rollout', 'variant': 'control'}]]
INVALID = [{'key': 'bad key'},
 {'key': 'k', 'rolloutPercent': 101},
 {'key': 'k', 'rolloutPercent': 12.345},
 {'key': 'k', 'variants': [{'name': 'a', 'weight': 0}]},
 {'key': ''}]



def _chi_square_2x2(pairs):
    """Chi-square statistic of the 2x2 contingency table of (0/1, 0/1) pairs."""
    table = [[0, 0], [0, 0]]
    for x, y in pairs:
        table[x][y] += 1
    n = len(pairs)
    chi = 0.0
    for i in (0, 1):
        for j in (0, 1):
            expected = (table[i][0] + table[i][1]) * (table[0][j] + table[1][j]) / n
            chi += (table[i][j] - expected) ** 2 / expected
    return chi


class FeatureFlagsTest(unittest.TestCase):
    def test_cases(self):
        for flag, user_id, expected in CASES:
            self.assertEqual(evaluate_flag(flag, user_id), expected, (flag, user_id))

    def test_raising_percentage_only_adds_users(self):
        users = [f"user-{i}" for i in range(200)]
        on_at = lambda pct: {u for u in users if evaluate_flag({"key": "grow", "rolloutPercent": pct}, u)["on"]}
        self.assertLessEqual(on_at(10), on_at(30))
        self.assertLessEqual(on_at(30), on_at(75))

    def test_experiments_are_independent(self):
        # Plain FNV-1a's low bit is the parity of the input bytes, so two 50/50 experiments with similar keys
        # put every subject in the same half of both. The fmix32 finalizer must keep them independent.
        subjects = [f"u{i}" for i in range(10000)]
        ab = [{"name": "a", "weight": 1}, {"name": "b", "weight": 1}]
        for k1, k2 in [("checkout-a", "checkout-b"), ("exp1", "exp2")]:
            parity = _chi_square_2x2([(evaluate_flag({"key": k1}, u)["bucket"] % 2,
                                       evaluate_flag({"key": k2}, u)["bucket"] % 2) for u in subjects])
            self.assertLess(parity, 10.83, f"bucket parity {k1}/{k2}")
            arms = _chi_square_2x2([(int(evaluate_flag({"key": k1, "variants": ab}, u)["variant"] == "b"),
                                     int(evaluate_flag({"key": k2, "variants": ab}, u)["variant"] == "b")) for u in subjects])
            self.assertLess(arms, 10.83, f"50/50 variants {k1}/{k2}")

    def test_buckets_are_uniform(self):
        counts = [0] * 100
        for i in range(10000):
            counts[evaluate_flag({"key": "checkout-a"}, f"u{i}")["bucket"] % 100] += 1
        self.assertTrue(all(abs(n - 100) <= 40 for n in counts), (min(counts), max(counts)))

    def test_invalid(self):
        for flag in INVALID:
            with self.assertRaises(ValueError, msg=repr(flag)):
                evaluate_flag(flag, "u")


if __name__ == "__main__":
    unittest.main()
