# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 11 shared vector set; do not edit the literals by hand.
import unittest

from password_generate import (
    PassGenError,
    entropy_bits,
    generate_passphrase,
    generate_password,
    random_index,
    system_byte,
)

RANDOM_INDEX = [
    [10, '00ff10a37c55e2019b', [0, 6, 3, 4, 5, 6]],
    [300, 'ffff0102a0b0', [258, 36, 258, 36, 258, 36]],
    [1, '00', [0, 0, 0, 0, 0, 0]],
    [256, 'ab', [171, 171, 171, 171, 171, 171]],
    [62, 'f0f8fc00', [54, 0, 54, 0, 54, 0]],
]
PASSWORD = [
    [16, ['lower', 'upper', 'digits', 'symbols'], False, '00ff10a37c55e2019b', 'jl__j_ad3WbbdqQa'],
    [12, ['lower', 'digits'], True, '0102030405060708090a0b0c0d0e0f', 'hkjibfmdnge4'],
    [4, ['upper', 'lower', 'digits', 'symbols'], False, '7f', 'X7x#'],
    [20, ['symbols'], False, 'ffffffffffffffff00', '!!!!!!!!!!!!!!!!!!!!'],
]
PASSPHRASE = [
    [['apple', 'river', 'stone', 'cloud', 'maple'], 4, '-', '0102030405', 'river-stone-cloud-maple'],
    [['a', 'b'], 3, ' ', 'ff00', 'b a b'],
]
ENTROPY = [
    [76, 16, 99.97],
    [10, 6, 19.93],
    [7776, 5, 64.62],
    [2, 1, 1.0],
]
INVALID_PASSWORD = [
    [3, ['lower', 'upper', 'digits', 'symbols']],
    [8, []],
    [8, ['lower', 'lower']],
    [8, ['emoji']],
    [1025, ['lower']],
]
INVALID_PASSPHRASE = [
    [['a'], 3],
    [['a', 'b'], 0],
    [['a', 'b'], 65],
    [['a', ''], 2],
]


def byte_source(seed_hex):
    """Deterministic test source that cycles through the given bytes."""
    data = bytes.fromhex(seed_hex)
    pos = [0]

    def next_byte():
        v = data[pos[0] % len(data)]
        pos[0] += 1
        return v

    return next_byte


class PasswordGenerateTest(unittest.TestCase):
    def test_random_index(self):
        for n, seed, expected in RANDOM_INDEX:
            src = byte_source(seed)
            self.assertEqual([random_index(n, src) for _ in range(6)], expected, (n, seed))

    def test_password_and_passphrase(self):
        for length, classes, ambiguous, seed, expected in PASSWORD:
            self.assertEqual(generate_password(length, classes, byte_source(seed), ambiguous), expected, seed)
        for words, count, sep, seed, expected in PASSPHRASE:
            self.assertEqual(generate_passphrase(words, count, sep, byte_source(seed)), expected, seed)
        for size, length, expected in ENTROPY:
            self.assertEqual(entropy_bits(size, length), expected)

    def test_invalid(self):
        for length, classes in INVALID_PASSWORD:
            with self.assertRaises(PassGenError, msg=repr((length, classes))):
                generate_password(length, classes, byte_source("00"))
        for words, count in INVALID_PASSPHRASE:
            with self.assertRaises(PassGenError, msg=repr((words, count))):
                generate_passphrase(words, count, "-", byte_source("00"))
        with self.assertRaises(PassGenError):
            random_index(0, byte_source("00"))

    def test_csprng_default(self):
        self.assertTrue(0 <= system_byte() <= 255)
        pw = generate_password()
        self.assertEqual(len(pw), 16)
        self.assertTrue(any(c.islower() for c in pw) and any(c.isupper() for c in pw) and any(c.isdigit() for c in pw))
        self.assertNotRegex(generate_password(64, ["lower", "upper", "digits"], exclude_ambiguous=True), "[Il1O0o]")
        self.assertEqual(len(generate_passphrase(["a", "b", "c"], 4).split("-")), 4)


if __name__ == "__main__":
    unittest.main()
