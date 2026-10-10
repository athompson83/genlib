# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 7 shared vector set.
import unittest

from password_policy import FAILURE_ORDER, check_password

# Options use the Python spelling (min_length, max_length) of the shared vectors.
CASES = [['correct horse battery staple', {}, {'failures': [], 'ok': True}],
 ['short', {}, {'failures': ['too-short'], 'ok': False}],
 ['Tr0ub4dor&3', {'min_length': 8}, {'failures': [], 'ok': True}],
 ['password',
  {'blocklist': ['Password', '123456'], 'min_length': 8},
  {'failures': ['blocklisted'], 'ok': False}],
 ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  {'max_length': 64},
  {'failures': ['too-long', 'repetitive'], 'ok': False}],
 ['aaaa-unique-phrase-x', {}, {'failures': ['repetitive'], 'ok': False}],
 ['my-1234-long-passphrase', {}, {'failures': ['repetitive'], 'ok': False}],
 ['zyxw-backwards-phrase!', {}, {'failures': ['repetitive'], 'ok': False}],
 ['alice-secret-passphrase',
  {'context': ['alice', 'example']},
  {'failures': ['contains-context'], 'ok': False}],
 ['tab\tinside-long-enough', {}, {'failures': ['control-characters'], 'ok': False}],
 ['ünïcödé-pässwörd-long', {}, {'failures': [], 'ok': True}],
 ['😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀', {}, {'failures': ['repetitive'], 'ok': False}],
 ['ABCD-upper-sequence-x', {}, {'failures': ['repetitive'], 'ok': False}]]
ORDER = ['too-short', 'too-long', 'control-characters', 'blocklisted', 'contains-context', 'repetitive']


class PasswordPolicyTest(unittest.TestCase):
    def test_cases(self):
        for password, options, expected in CASES:
            self.assertEqual(check_password(password, **options), expected, password)

    def test_failure_order(self):
        self.assertEqual(list(FAILURE_ORDER), ORDER)

    def test_invalid_options(self):
        with self.assertRaises(ValueError):
            check_password("x", min_length=0)
        with self.assertRaises(ValueError):
            check_password("x", min_length=10, max_length=9)


if __name__ == "__main__":
    unittest.main()
