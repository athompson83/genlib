# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 12 shared vector set; do not edit the literals by hand.
import unittest
from ndjson import NdjsonError, parse_ndjson, stringify_ndjson

PARSE = [
    ['{"a":1}\n{"b":[1,2]}\n', [{'a': 1}, {'b': [1, 2]}]],
    ['\n  \n1\r\n"x"\ntrue\nnull\n', [1, 'x', True, None]],
    ['', []],
    ['{"k":"café"}', [{'k': 'café'}]],
]

INVALID_PARSE = [
    ['{"a":1}\n{bad}\n', 2],
    ['1 2', 1],
    ['{"a":1}\n\n[1,', 3],
]

STRINGIFY = [
    [[{'a': 1, 'b': [True, None, 'x']}], '{"a":1,"b":[true,null,"x"]}\n'],
    [[1, 'two', False], '1\n"two"\nfalse\n'],
    [[], ''],
    [[{'q': 'say "hi"\\ \n\t\x01 café'}], '{"q":"say \\"hi\\"\\\\ \\n\\t\\u0001 café"}\n'],
    [[{'z': 1, 'a': 2}], '{"z":1,"a":2}\n'],
    [[[], {}], '[]\n{}\n'],
    [[-42, 0], '-42\n0\n'],
]


class NdjsonTest(unittest.TestCase):
    def test_parse(self):
        for text, expected in PARSE:
            self.assertEqual(parse_ndjson(text), expected, text)

    def test_invalid_parse(self):
        for text, line in INVALID_PARSE:
            with self.assertRaises(NdjsonError, msg=text) as ctx:
                parse_ndjson(text)
            self.assertEqual(ctx.exception.line, line, text)
            self.assertIn("line %d" % line, str(ctx.exception))
        with self.assertRaises(NdjsonError):
            parse_ndjson("NaN")

    def test_stringify(self):
        for values, expected in STRINGIFY:
            self.assertEqual(stringify_ndjson(values), expected, values)
            self.assertEqual(parse_ndjson(expected), values)
        self.assertEqual(list(stringify_ndjson([{"z": 1, "a": 2}])), list('{"z":1,"a":2}\n'))
        for bad in [[float("nan")], [{1: "x"}], [object()]]:
            with self.assertRaises(NdjsonError):
                stringify_ndjson(bad)


if __name__ == "__main__":
    unittest.main()
