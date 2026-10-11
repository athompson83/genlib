# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 11 shared vector set; do not edit the literals by hand.
import unittest

from base58 import (
    Base58Error,
    base58_decode,
    base58_encode,
    base58check_decode,
    base58check_encode,
)

ENCODE = [
    ['', ''],
    ['00', '1'],
    ['000001', '112'],
    ['68656c6c6f20776f726c64', 'StV1DL6CwTryKyV'],
    ['00010203040506070809', '1kA3B2yGe2z4'],
    ['ffffffffffffffff', 'jpXCZedGfVQ'],
    ['000068656c6c6f', '11Cn8eVZg'],
]
CHECK = [
    ['00f54a5851e9372b87810a8e60cdd2e7cfd80b6e31', '1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs'],
    ['801111111111111111111111111111111111111111111111111111111111111111', '5HwoXVkHoRM8sL2KmNRS217n1g8mPPBomrY7yehCuXC1115WWsh'],
    ['', '3QJmnh'],
]
INVALID_DECODE = [
    '0OIl',
    'abc+',
]
INVALID_CHECK = [
    '1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAt',
    '1',
    '',
]


class Base58Test(unittest.TestCase):
    def test_encode_decode(self):
        for hex_in, text in ENCODE:
            self.assertEqual(base58_encode(bytes.fromhex(hex_in)), text, hex_in)
            self.assertEqual(base58_decode(text).hex(), hex_in, text)

    def test_check(self):
        for hex_in, text in CHECK:
            self.assertEqual(base58check_encode(bytes.fromhex(hex_in)), text, hex_in)
            self.assertEqual(base58check_decode(text).hex(), hex_in, text)

    def test_invalid(self):
        for text in INVALID_DECODE:
            with self.assertRaises(Base58Error, msg=text):
                base58_decode(text)
        for text in INVALID_CHECK:
            with self.assertRaises(Base58Error, msg=text):
                base58check_decode(text)


if __name__ == "__main__":
    unittest.main()
