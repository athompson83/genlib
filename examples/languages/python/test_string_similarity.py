# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 6 shared vector set.
import unittest

from string_similarity import damerau_osa, jaro, jaro_winkler, levenshtein, similarity_ratio

# Columns: a, b, levenshtein, osa, jaro, jaroWinkler, ratio
PAIRS = [('kitten', 'sitting', 3, 3, 0.746031746031746, 0.746031746031746, 0.5714285714285714),
 ('flaw', 'lawn', 2, 2, 0.8333333333333334, 0.8333333333333334, 0.5),
 ('', '', 0, 0, 1.0, 1.0, 1.0),
 ('', 'abc', 3, 3, 0.0, 0.0, 0.0),
 ('abc', 'abc', 0, 0, 1.0, 1.0, 1.0),
 ('ca', 'abc', 3, 3, 0.0, 0.0, 0.0),
 ('MARTHA', 'MARHTA', 2, 1, 0.9444444444444445, 0.9611111111111111, 0.6666666666666667),
 ('DIXON', 'DICKSONX', 4, 4, 0.7666666666666666, 0.8133333333333332, 0.5),
 ('DWAYNE', 'DUANE', 2, 2, 0.8222222222222223, 0.8400000000000001, 0.6666666666666667),
 ('café', 'cafe', 1, 1, 0.8333333333333334, 0.8833333333333334, 0.75),
 ('naïve', 'naive', 1, 1, 0.8666666666666667, 0.8933333333333333, 0.8),
 ('🙂ab', 'ab🙂', 2, 2, 0.0, 0.0, 0.33333333333333337),
 ('JELLYFISH', 'SMELLYFISH', 2, 2, 0.8962962962962964, 0.8962962962962964, 0.8)]


class StringSimilarityTests(unittest.TestCase):
    def test_pairs(self):
        for a, b, lev, osa, j, jw, ratio in PAIRS:
            self.assertEqual(levenshtein(a, b), lev, (a, b))
            self.assertEqual(damerau_osa(a, b), osa, (a, b))
            self.assertAlmostEqual(jaro(a, b), j, delta=1e-12, msg=(a, b))
            self.assertAlmostEqual(jaro_winkler(a, b), jw, delta=1e-12, msg=(a, b))
            self.assertAlmostEqual(similarity_ratio(a, b), ratio, delta=1e-12, msg=(a, b))


if __name__ == "__main__":
    unittest.main()
