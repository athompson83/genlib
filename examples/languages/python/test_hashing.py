# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 7 shared vector set.
import unittest

from hashing import crc32, fnv1a32, fnv1a64, jump_hash, murmur3_32

# [utf8 string, crc32, fnv1a32, fnv1a64 hex, murmur3_32 seed 0, murmur3_32 seed 42]
STRINGS = [['', 0, 2166136261, 'cbf29ce484222325', 0, 142593372],
 ['a', 3904355907, 3826002220, 'af63dc4c8601ec8c', 1009084850, 3001393763],
 ['foobar', 2666930069, 3214735720, '85944171f73967e8', 2764362941, 1018276128],
 ['123456789', 3421780262, 3146166556, '06d5573923c6cdfc', 3036607362, 3059026825],
 ['hello', 907060870, 1335831723, 'a430d84680aabd0b', 613153351, 3806057185],
 ['The quick brown fox jumps over the lazy dog',
  1095738169,
  76545936,
  'f3f9b7f5e7e47110',
  776992547,
  880582914],
 ['héllo wörld', 354246585, 3558752674, '11824ab841812022', 2549609076, 857211688]]
# [unsigned 64-bit key, buckets, expected bucket]
JUMP = [[0, 1, 0],
 [1, 10, 6],
 [256, 1024, 520],
 [3735928559, 100, 87],
 [18446744073709551615, 1000, 313],
 [12345678901234567, 7, 5],
 [42, 2147483647, 1603940301]]


class HashingTest(unittest.TestCase):
    def test_strings(self):
        for text, crc, f32, f64, m0, m42 in STRINGS:
            data = text.encode("utf-8")
            self.assertEqual(crc32(data), crc, text)
            self.assertEqual(fnv1a32(data), f32, text)
            self.assertEqual(format(fnv1a64(data), "016x"), f64, text)
            self.assertEqual(murmur3_32(data), m0, text)
            self.assertEqual(murmur3_32(data, 42), m42, text)

    def test_known_answers(self):
        self.assertEqual(crc32(b"123456789"), 0xCBF43926)
        self.assertEqual(murmur3_32(b"", 1), 0x514E28B7)

    def test_jump(self):
        for key, buckets, expected in JUMP:
            self.assertEqual(jump_hash(key, buckets), expected, (key, buckets))
        for bad in [(1, 0), (1, 2**31), (-1, 10), (2**64, 10)]:
            with self.assertRaises(ValueError):
                jump_hash(*bad)


if __name__ == "__main__":
    unittest.main()
