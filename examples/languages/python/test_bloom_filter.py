# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 12 shared vector set; do not edit the literals by hand.
import unittest
from bloom_filter import BloomError, BloomFilter, bloom_size_for, fnv1a64

FNV = [
    ['apple', 'f74a62a458befdbf'],
    ['banana', 'b4d3b6b1c372c890'],
    ['', 'cbf29ce484222325'],
    ['café', '48e8823acfa40d89'],
    ['😀', 'feff073875020288'],
    ['user:42', '6c151ea4dcd221c2'],
    ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '060324515a7b4e27'],
]

SIZE_FOR = [
    [1, 0.5, 8, 6],
    [10, 0.01, 96, 7],
    [100, 0.01, 959, 7],
    [1000, 0.001, 14378, 10],
    [5000, 0.05, 31177, 4],
    [3, 0.3, 8, 2],
]

INVALID_SIZE = [
    [0, 0.1],
    [10, 0],
    [10, 1],
    [10, 1.5],
]

M = 256

K = 5

POSITIONS = [
    ['apple', [191, 99, 7, 171, 79]],
    ['banana', [144, 65, 242, 163, 84]],
    ['', [37, 9, 237, 209, 181]],
    ['café', [137, 195, 253, 55, 113]],
    ['😀', [136, 192, 248, 48, 104]],
    ['user:42', [194, 102, 10, 174, 82]],
    ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', [39, 120, 201, 26, 107]],
]

ADDED = [
    'apple',
    'banana',
    '',
    'café',
    '😀',
]

SERIALIZED = 'gAIAACAAgQACgBAACAECAAADAQAICCCACQACAAAgBCE'

PROBES = [
    ['apple', True],
    ['banana', True],
    ['', True],
    ['café', True],
    ['😀', True],
    ['cherry', False],
    ['user:42', False],
    ['zzz', False],
    ['Apple', False],
]

COUNT_ESTIMATE = 5

UNION_WITH_CHERRY = 'gAIAACAAgQACgBAACAESAAADIQAICGCACQCCAAAgBCE'

UNION_COUNT = 6


class BloomFilterTest(unittest.TestCase):
    def test_hash_and_size(self):
        for text, hexdigest in FNV:
            self.assertEqual("%016x" % fnv1a64(text.encode("utf-8")), hexdigest, text)
        for n, p, m, k in SIZE_FOR:
            self.assertEqual(bloom_size_for(n, p), (m, k), (n, p))
        for n, p in INVALID_SIZE:
            with self.assertRaises(BloomError, msg=(n, p)):
                bloom_size_for(n, p)

    def test_filter_state(self):
        f = BloomFilter(M, K)
        for item, positions in POSITIONS:
            self.assertEqual(f.positions(item), positions, item)
        for item in ADDED:
            f.add(item)
        self.assertEqual(f.serialize(), SERIALIZED)
        for item, expected in PROBES:
            self.assertEqual(f.might_contain(item), expected, item)
        self.assertEqual(f.count_estimate(), COUNT_ESTIMATE)
        g = BloomFilter.deserialize(M, K, SERIALIZED)
        self.assertEqual(g.serialize(), SERIALIZED)
        cherry = BloomFilter(M, K)
        cherry.add("cherry")
        u = f.union(cherry)
        self.assertEqual(u.serialize(), UNION_WITH_CHERRY)
        self.assertEqual(u.count_estimate(), UNION_COUNT)

    def test_invalid_state(self):
        for text in ["AAAA", "A", "*" * 43]:
            with self.assertRaises(BloomError, msg=text):
                BloomFilter.deserialize(M, K, text)
        with self.assertRaises(BloomError):
            BloomFilter(M, K).union(BloomFilter(M, K + 1))
        with self.assertRaises(BloomError):
            BloomFilter(4, 1)
        full = BloomFilter(8, 1, b"\xff")
        self.assertIsNone(full.count_estimate())


if __name__ == "__main__":
    unittest.main()
