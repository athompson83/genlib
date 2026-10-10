# SPDX-License-Identifier: Apache-2.0
import unittest

from wcag_contrast import contrast_ratio, contrast_ratio2, passes, relative_luminance


class WcagTests(unittest.TestCase):
    def test_vectors(self):
        self.assertEqual(contrast_ratio2("#000", "#fff"), 21.0)
        self.assertEqual(contrast_ratio2("#767676", "#ffffff"), 4.54)
        self.assertEqual(contrast_ratio2("#1a73e8", "#ffffff"), 4.51)
        self.assertEqual(contrast_ratio2("#abc", "#aabbcc"), 1.0)
        self.assertEqual(contrast_ratio2("#ffff00", "#ffffff"), 1.07)

    def test_passes(self):
        self.assertTrue(passes(contrast_ratio("#767676", "#ffffff"), "AA", False))
        self.assertFalse(passes(contrast_ratio("#767676", "#ffffff"), "AAA", False))
        self.assertFalse(passes(contrast_ratio("#ffff00", "#ffffff"), "AA", True))
        self.assertTrue(passes(contrast_ratio("#000", "#FFF"), "AAA", False))
        self.assertTrue(passes(3.0, "AA", True))
        with self.assertRaises(ValueError):
            passes(5.0, "A")

    def test_luminance_and_validation(self):
        self.assertEqual(relative_luminance("#FFFFFF"), 1.0)
        self.assertEqual(relative_luminance("#000000"), 0.0)
        self.assertEqual(contrast_ratio("#fff", "#000"), contrast_ratio("#000", "#fff"))
        for bad in ("fff", "#ffff", "#ggg", "#fffffff", "", None):
            with self.assertRaises(ValueError):
                relative_luminance(bad)


if __name__ == "__main__":
    unittest.main()
