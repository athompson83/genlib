# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 7 shared vector set.
import unittest

from feature_flags import evaluate_flag

# Flags use the shared JSON keys (rolloutPercent, allow, deny, variants).
CASES = [[{'key': 'new-checkout', 'rolloutPercent': 25},
  'user-1',
  {'bucket': 4063, 'on': False, 'reason': 'excluded', 'variant': None}],
 [{'key': 'new-checkout', 'rolloutPercent': 25},
  'user-2',
  {'bucket': 1682, 'on': True, 'reason': 'rollout', 'variant': None}],
 [{'key': 'new-checkout', 'rolloutPercent': 25},
  'user-3',
  {'bucket': 9301, 'on': False, 'reason': 'excluded', 'variant': None}],
 [{'key': 'new-checkout', 'rolloutPercent': 25},
  'user-42',
  {'bucket': 9926, 'on': False, 'reason': 'excluded', 'variant': None}],
 [{'key': 'new-checkout', 'rolloutPercent': 25},
  'alice@example.com',
  {'bucket': 2919, 'on': False, 'reason': 'excluded', 'variant': None}],
 [{'allow': ['user-2'], 'deny': ['user-1'], 'key': 'new-checkout', 'rolloutPercent': 25},
  'user-1',
  {'bucket': 4063, 'on': False, 'reason': 'deny', 'variant': None}],
 [{'allow': ['user-2'], 'deny': ['user-1'], 'key': 'new-checkout', 'rolloutPercent': 25},
  'user-2',
  {'bucket': 1682, 'on': True, 'reason': 'allow', 'variant': None}],
 [{'allow': ['vip'], 'enabled': False, 'key': 'beta'},
  'vip',
  {'bucket': 3546, 'on': False, 'reason': 'disabled', 'variant': None}],
 [{'key': 'banner', 'rolloutPercent': 0},
  'user-1',
  {'bucket': 6646, 'on': False, 'reason': 'excluded', 'variant': None}],
 [{'key': 'banner', 'rolloutPercent': 100},
  'user-1',
  {'bucket': 6646, 'on': True, 'reason': 'rollout', 'variant': None}],
 [{'key': 'banner', 'rolloutPercent': 12.34},
  'user-9',
  {'bucket': 7598, 'on': False, 'reason': 'excluded', 'variant': None}],
 [{'key': 'pricing-test',
   'variants': [{'name': 'control', 'weight': 50},
                {'name': 'annual-first', 'weight': 30},
                {'name': 'monthly-first', 'weight': 20}]},
  'u1',
  {'bucket': 4196, 'on': True, 'reason': 'rollout', 'variant': 'monthly-first'}],
 [{'key': 'pricing-test',
   'variants': [{'name': 'control', 'weight': 50},
                {'name': 'annual-first', 'weight': 30},
                {'name': 'monthly-first', 'weight': 20}]},
  'u2',
  {'bucket': 7053, 'on': True, 'reason': 'rollout', 'variant': 'control'}],
 [{'key': 'pricing-test',
   'variants': [{'name': 'control', 'weight': 50},
                {'name': 'annual-first', 'weight': 30},
                {'name': 'monthly-first', 'weight': 20}]},
  'u3',
  {'bucket': 9434, 'on': True, 'reason': 'rollout', 'variant': 'annual-first'}],
 [{'key': 'pricing-test',
   'variants': [{'name': 'control', 'weight': 50},
                {'name': 'annual-first', 'weight': 30},
                {'name': 'monthly-first', 'weight': 20}]},
  'u4',
  {'bucket': 1339, 'on': True, 'reason': 'rollout', 'variant': 'annual-first'}],
 [{'key': 'pricing-test',
   'variants': [{'name': 'control', 'weight': 50},
                {'name': 'annual-first', 'weight': 30},
                {'name': 'monthly-first', 'weight': 20}]},
  'u5',
  {'bucket': 3720, 'on': True, 'reason': 'rollout', 'variant': 'annual-first'}],
 [{'key': 'pricing-test',
   'variants': [{'name': 'control', 'weight': 50},
                {'name': 'annual-first', 'weight': 30},
                {'name': 'monthly-first', 'weight': 20}]},
  'ünïcode',
  {'bucket': 9874, 'on': True, 'reason': 'rollout', 'variant': 'control'}]]
INVALID = [{'key': 'bad key'},
 {'key': 'k', 'rolloutPercent': 101},
 {'key': 'k', 'rolloutPercent': 12.345},
 {'key': 'k', 'variants': [{'name': 'a', 'weight': 0}]},
 {'key': ''}]


class FeatureFlagsTest(unittest.TestCase):
    def test_cases(self):
        for flag, user_id, expected in CASES:
            self.assertEqual(evaluate_flag(flag, user_id), expected, (flag, user_id))

    def test_raising_percentage_only_adds_users(self):
        users = [f"user-{i}" for i in range(200)]
        on_at = lambda pct: {u for u in users if evaluate_flag({"key": "grow", "rolloutPercent": pct}, u)["on"]}
        self.assertLessEqual(on_at(10), on_at(30))
        self.assertLessEqual(on_at(30), on_at(75))

    def test_invalid(self):
        for flag in INVALID:
            with self.assertRaises(ValueError, msg=repr(flag)):
                evaluate_flag(flag, "u")


if __name__ == "__main__":
    unittest.main()
