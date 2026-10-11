# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 11 shared vector set; do not edit the literals by hand.
import copy
import unittest

from dotted_path import PathError, delete_path, get_path, has_path, parse_path, set_path

DATA = {'user': {'name': 'Ada', 'tags': ['a', 'b'], 'addr': [{'city': 'Paris'}, {'city': 'Rome'}], 'x.y': {'z': 1}}, 'n': 0, 'nil': None}
PARSE = [
    ['', []],
    ['a', ['a']],
    ['a.b.c', ['a', 'b', 'c']],
    ['a[0]', ['a', 0]],
    ['a[0][1].b', ['a', 0, 1, 'b']],
    ['["x.y"].z', ['x.y', 'z']],
    ['user["x.y"].z', ['user', 'x.y', 'z']],
    ['a["q\\"t"]', ['a', 'q"t']],
]
GET = [
    ['user.name', 'Ada'],
    ['user.tags[1]', 'b'],
    ['user.addr[1].city', 'Rome'],
    ['user["x.y"].z', 1],
    ['user.missing', 'DEF'],
    ['user.tags[5]', 'DEF'],
    ['user.name.first', 'DEF'],
    ['n', 0],
    ['nil', None],
    ['', {'user': {'name': 'Ada', 'tags': ['a', 'b'], 'addr': [{'city': 'Paris'}, {'city': 'Rome'}], 'x.y': {'z': 1}}, 'n': 0, 'nil': None}],
    ['user.tags.0', 'DEF'],
]
HAS = [
    ['user.name', True],
    ['nil', True],
    ['user.nope', False],
    ['user.tags[2]', False],
]
SET = [
    [{}, 'a.b', 1, {'a': {'b': 1}}],
    [{}, 'a[0].b', 1, {'a': [{'b': 1}]}],
    [{'a': [1]}, 'a[1]', 2, {'a': [1, 2]}],
    [{'a': {'b': 1}}, 'a.c', [1, 2], {'a': {'b': 1, 'c': [1, 2]}}],
    [None, 'x', True, {'x': True}],
    [{'a': 1}, '', {'z': 2}, {'z': 2}],
    [{}, '["k.v"]', 3, {'k.v': 3}],
]
INVALID_SET = [
    [{'a': [1]}, 'a[3]', 0],
    [{'a': 1}, 'a.b', 0],
    [{'a': {}}, 'a[0]', 0],
]
DELETE = [
    [{'a': {'b': 1, 'c': 2}}, 'a.b', {'a': {'c': 2}}],
    [{'a': [1, 2, 3]}, 'a[0]', {'a': [2, 3]}],
    [{'a': 1}, 'b', {'a': 1}],
    [{'a': [1]}, 'a[4]', {'a': [1]}],
]
INVALID_PARSE = [
    'a.',
    '.a',
    'a..b',
    'a[01]',
    'a[x]',
    'a["x',
    'a[1',
    'a[-1]',
]


class DottedPathTest(unittest.TestCase):
    def test_parse(self):
        for path, expected in PARSE:
            self.assertEqual(parse_path(path), expected, path)

    def test_get_has(self):
        for path, expected in GET:
            self.assertEqual(get_path(DATA, path, "DEF"), expected, path)
        for path, expected in HAS:
            self.assertEqual(has_path(DATA, path), expected, path)
        self.assertIsNone(get_path(DATA, "user.missing"))

    def test_set_and_delete_never_mutate(self):
        for data, path, value, expected in SET:
            before = copy.deepcopy(data)
            self.assertEqual(set_path(data, path, value), expected, path)
            self.assertEqual(data, before, path)
        for data, path, expected in DELETE:
            before = copy.deepcopy(data)
            self.assertEqual(delete_path(data, path), expected, path)
            self.assertEqual(data, before, path)
        nested = {"a": {"b": [1]}}
        out = set_path(nested, "a.c", 2)
        out["a"]["b"].append(9)
        self.assertEqual(nested, {"a": {"b": [1]}})

    def test_invalid(self):
        for data, path, value in INVALID_SET:
            with self.assertRaises(PathError, msg=path):
                set_path(data, path, value)
        for path in INVALID_PARSE:
            with self.assertRaises(PathError, msg=path):
                parse_path(path)


if __name__ == "__main__":
    unittest.main()
