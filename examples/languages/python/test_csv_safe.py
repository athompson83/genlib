# SPDX-License-Identifier: Apache-2.0
import unittest

from csv_safe import parse_csv, write_csv

ROWS = [["id", "name", "note"], ["1", "Ada, Lovelace", 'said "hi"'], ["2", "=SUM(A1)", "line1\nline2"],
        ["3", " padded", "-5"]]
CSV = ('id,name,note\r\n1,"Ada, Lovelace","said ""hi"""\r\n2,\'=SUM(A1),"line1\nline2"\r\n'
       '3," padded",\'-5\r\n')


class WriteTests(unittest.TestCase):
    def test_vector(self):
        self.assertEqual(write_csv(ROWS), CSV)

    def test_neutralization_off_and_empty(self):
        self.assertEqual(write_csv([["=1"]], neutralize_formulas=False), "=1\r\n")
        self.assertEqual(write_csv([]), "")
        self.assertEqual(write_csv([["+1", "@x", "\tt", "\rr", "trail "]]), "'+1,'@x,'\tt,\"'\rr\",\"trail \"\r\n")

    def test_rejects_non_strings(self):
        with self.assertRaises(TypeError):
            write_csv([[1]])


class ParseTests(unittest.TestCase):
    def test_vectors(self):
        self.assertEqual(parse_csv('a,b\r\n"x,1","say ""hi"""\n"multi\nline",\n'),
                         [["a", "b"], ["x,1", 'say "hi"'], ["multi\nline", ""]])
        self.assertEqual(parse_csv("\ufeffa\n"), [["a"]])
        self.assertEqual(parse_csv(""), [])
        self.assertEqual(parse_csv("a,b"), [["a", "b"]])

    def test_errors(self):
        for bad in ('a,"b', 'a"b', '"a"x'):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                parse_csv(bad)

    def test_round_trip(self):
        self.assertEqual(parse_csv(write_csv(ROWS, False)), ROWS)
        self.assertEqual(parse_csv(CSV)[2][1], "'=SUM(A1)")


if __name__ == "__main__":
    unittest.main()
