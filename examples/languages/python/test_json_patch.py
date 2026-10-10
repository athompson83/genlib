# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 8 shared vector set (vectors.json); do not edit by hand.
import copy
import json
import unittest

from json_patch import apply_patch, canonical, create_patch, get_pointer, merge_patch

# All documents are JSON text; results are canonical JSON text.
# [doc, patch, result]
APPLY = [['{"foo":"bar"}', '[{"op":"add","path":"/baz","value":"qux"}]', '{"baz":"qux","foo":"bar"}'],
 ['{"foo":["bar","baz"]}', '[{"op":"add","path":"/foo/1","value":"qux"}]', '{"foo":["bar","qux","baz"]}'],
 ['{"baz":"qux","foo":"bar"}', '[{"op":"remove","path":"/baz"}]', '{"foo":"bar"}'],
 ['{"foo":["bar","qux","baz"]}', '[{"op":"remove","path":"/foo/1"}]', '{"foo":["bar","baz"]}'],
 ['{"baz":"qux","foo":"bar"}', '[{"op":"replace","path":"/baz","value":"boo"}]', '{"baz":"boo","foo":"bar"}'],
 ['{"foo":{"bar":"baz","waldo":"fred"},"qux":{"corge":"grault"}}',
  '[{"from":"/foo/waldo","op":"move","path":"/qux/thud"}]',
  '{"foo":{"bar":"baz"},"qux":{"corge":"grault","thud":"fred"}}'],
 ['{"foo":["all","grass","cows","eat"]}',
  '[{"from":"/foo/1","op":"move","path":"/foo/3"}]',
  '{"foo":["all","cows","eat","grass"]}'],
 ['{"baz":"qux","foo":["a",2,"c"]}',
  '[{"op":"test","path":"/baz","value":"qux"},{"op":"test","path":"/foo/1","value":2}]',
  '{"baz":"qux","foo":["a",2,"c"]}'],
 ['{"foo":"bar"}',
  '[{"op":"add","path":"/child","value":{"grandchild":{}}}]',
  '{"child":{"grandchild":{}},"foo":"bar"}'],
 ['{"foo":"bar"}', '[{"op":"add","path":"/baz","value":"qux","xyz":123}]', '{"baz":"qux","foo":"bar"}'],
 ['{"foo":["bar"]}', '[{"op":"add","path":"/foo/-","value":["abc","def"]}]', '{"foo":["bar",["abc","def"]]}'],
 ['{"/":9,"~1":10}',
  '[{"op":"test","path":"/~01","value":10},{"op":"replace","path":"/~1","value":1}]',
  '{"/":1,"~1":10}'],
 ['{"a":1}', '[{"op":"replace","path":"","value":[1,2]}]', '[1,2]'],
 ['{"a":1}', '[{"op":"add","path":"","value":"root"}]', '"root"'],
 ['{"a":{"b":1}}',
  '[{"from":"/a","op":"copy","path":"/c"},{"op":"replace","path":"/c/b","value":2}]',
  '{"a":{"b":1},"c":{"b":2}}'],
 ['{"a":[1,2]}', '[{"from":"/a/0","op":"move","path":"/a/0"}]', '{"a":[1,2]}'],
 ['{"n":1}', '[{"op":"test","path":"/n","value":1}]', '{"n":1}'],
 ['{"a":{"b":[1,{"c":null}]}}',
  '[{"op":"test","path":"/a/b/1/c","value":null},{"op":"remove","path":"/a/b/0"}]',
  '{"a":{"b":[{"c":null}]}}']]
# [doc, patch]: must raise ValueError
APPLY_INVALID = [['{"baz":"qux"}', '[{"op":"add","path":"/baz/bat","value":"qux"}]'],
 ['{"foo":"bar"}', '[{"op":"test","path":"/baz","value":"qux"}]'],
 ['{"foo":["bar"]}', '[{"op":"add","path":"/foo/2","value":1}]'],
 ['{"foo":["bar"]}', '[{"op":"add","path":"/foo/01","value":1}]'],
 ['{"foo":["bar"]}', '[{"op":"remove","path":"/foo/-"}]'],
 ['{"a":1}', '[{"op":"remove","path":"/b"}]'],
 ['{"a":1}', '[{"op":"replace","path":"/b","value":1}]'],
 ['{"a":{"b":1}}', '[{"from":"/a","op":"move","path":"/a/b/c"}]'],
 ['{"a":1}', '[{"op":"frobnicate","path":"/a"}]'],
 ['{"a":1}', '[{"op":"add","path":"/b"}]'],
 ['{"a":1}', '[{"op":"add","value":1}]'],
 ['{"a":1}', '[{"op":"add","path":"a","value":1}]'],
 ['{"a~b":1}', '[{"op":"remove","path":"/a~b"}]'],
 ['{"a":1}', '[{"op":"remove","path":""}]'],
 ['{"a":true}', '[{"op":"test","path":"/a","value":1}]'],
 ['{"a":1}', '[{"op":"test","path":"/a","value":"1"}]'],
 ['{"a":1}', '[{"op":"add","path":"/b","value":2},{"op":"test","path":"/b","value":3}]'],
 ['{"a":1}', '{"op":"add","path":"/b","value":2}']]
# [doc, pointer, result]
POINTER = [['{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}',
  '',
  '{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}'],
 ['{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}',
  '/foo',
  '["bar","baz"]'],
 ['{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}',
  '/foo/0',
  '"bar"'],
 ['{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}', '/', '0'],
 ['{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}',
  '/a~1b',
  '1'],
 ['{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}',
  '/c%d',
  '2'],
 ['{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}',
  '/e^f',
  '3'],
 ['{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}',
  '/g|h',
  '4'],
 ['{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}',
  '/i\\j',
  '5'],
 ['{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}',
  '/k"l',
  '6'],
 ['{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}', '/ ', '7'],
 ['{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}',
  '/m~0n',
  '8']]
# pointers that fail against {"foo":["bar","baz"],"m~n":8}
POINTER_INVALID = ['/foo/2', '/foo/-', '/foo/01', 'foo', '/nope', '/m~2n', '/foo/0/x']
# [target, patch, result]
MERGE = [['{"a":"b"}', '{"a":"c"}', '{"a":"c"}'],
 ['{"a":"b"}', '{"b":"c"}', '{"a":"b","b":"c"}'],
 ['{"a":"b"}', '{"a":null}', '{}'],
 ['{"a":"b","b":"c"}', '{"a":null}', '{"b":"c"}'],
 ['{"a":["b"]}', '{"a":"c"}', '{"a":"c"}'],
 ['{"a":"c"}', '{"a":["b"]}', '{"a":["b"]}'],
 ['{"a":{"b":"c"}}', '{"a":{"b":"d","c":null}}', '{"a":{"b":"d"}}'],
 ['{"a":[{"b":"c"}]}', '{"a":[1]}', '{"a":[1]}'],
 ['["a","b"]', '["c","d"]', '["c","d"]'],
 ['{"a":"b"}', '["c"]', '["c"]'],
 ['{"a":"foo"}', 'null', 'null'],
 ['{"a":"foo"}', '"bar"', '"bar"'],
 ['{"e":null}', '{"a":1}', '{"a":1,"e":null}'],
 ['[1,2]', '{"a":"b","c":null}', '{"a":"b"}'],
 ['{}', '{"a":{"bb":{"ccc":null}}}', '{"a":{"bb":{}}}']]
# [a, b, patch]
CREATE = [['{"a":1,"b":[1,2,3]}',
  '{"a":2,"b":[1],"c":true}',
  '[{"op":"replace","path":"/a","value":2},{"op":"remove","path":"/b/2"},{"op":"remove","path":"/b/1"},{"op":"add","path":"/c","value":true}]'],
 ['{"x":{"y":{"z":1}}}', '{"x":{"y":{"w":[null],"z":1}}}', '[{"op":"add","path":"/x/y/w","value":[null]}]'],
 ['[1,2]', '[1,2,3,4]', '[{"op":"add","path":"/2","value":3},{"op":"add","path":"/3","value":4}]'],
 ['{"a/b":1,"m~n":2}',
  '{"a/b":3}',
  '[{"op":"replace","path":"/a~1b","value":3},{"op":"remove","path":"/m~0n"}]'],
 ['"s"', '{"k":"s"}', '[{"op":"replace","path":"","value":{"k":"s"}}]'],
 ['{"k":[1,{"q":1}]}',
  '{"k":[2,{"q":2}]}',
  '[{"op":"replace","path":"/k/0","value":2},{"op":"replace","path":"/k/1/q","value":2}]'],
 ['{"same":1}', '{"same":1}', '[]'],
 ['null', 'false', '[{"op":"replace","path":"","value":false}]'],
 ['{"Z":3,"a":2,"b":1,"é":4}',
  '{}',
  '[{"op":"remove","path":"/Z"},{"op":"remove","path":"/a"},{"op":"remove","path":"/b"},{"op":"remove","path":"/é"}]'],
 ['[]', '[[]]', '[{"op":"add","path":"/0","value":[]}]'],
 ['{"n":[1,2,3]}',
  '{"n":[3,2,1]}',
  '[{"op":"replace","path":"/n/0","value":3},{"op":"replace","path":"/n/2","value":1}]']]
# [text, canonical]
PARSE_VALID = [[' {"a" : [1, -2, 3.5e2, true, false, null, "x\\n\\u00e9\\ud83d\\ude00"]} ',
  '{"a":[1,-2,350,true,false,null,"x\\né😀"]}'],
 ['"\\u0001\\"\\\\/"', '"\\u0001\\"\\\\/"'],
 ['[]', '[]'],
 ['{}', '{}'],
 ['-0', '0'],
 ['1E+2', '100']]


class JsonPatchTest(unittest.TestCase):
    def test_apply(self):
        for doc, patch, expected in APPLY:
            value = json.loads(doc)
            before = copy.deepcopy(value)
            self.assertEqual(canonical(apply_patch(value, json.loads(patch))), expected, patch)
            self.assertEqual(value, before, "input must not change")

    def test_apply_invalid(self):
        for doc, patch in APPLY_INVALID:
            value = json.loads(doc)
            before = copy.deepcopy(value)
            with self.assertRaises(ValueError, msg=patch):
                apply_patch(value, json.loads(patch))
            self.assertEqual(value, before, "a failed patch must not change the input")

    def test_pointer(self):
        for doc, pointer, expected in POINTER:
            self.assertEqual(canonical(get_pointer(json.loads(doc), pointer)), expected, pointer)
        doc = {"foo": ["bar", "baz"], "m~n": 8}
        for pointer in POINTER_INVALID:
            with self.assertRaises(ValueError, msg=pointer):
                get_pointer(doc, pointer)

    def test_merge(self):
        for target, patch, expected in MERGE:
            value = json.loads(target)
            before = copy.deepcopy(value)
            self.assertEqual(canonical(merge_patch(value, json.loads(patch))), expected, patch)
            self.assertEqual(value, before)

    def test_create(self):
        for a, b, expected in CREATE:
            va, vb = json.loads(a), json.loads(b)
            patch = create_patch(va, vb)
            self.assertEqual(canonical(patch), expected, (a, b))
            self.assertEqual(canonical(apply_patch(va, patch)), canonical(vb), (a, b))

    def test_canonical(self):
        for text, expected in PARSE_VALID:
            self.assertEqual(canonical(json.loads(text)), expected, text)
        self.assertEqual(canonical({"b": [1.0, 2.5, None], "a": "\u001f\b\t/é"}), '{"a":"\\u001f\\b\\t/é","b":[1,2.5,null]}')
        with self.assertRaises(ValueError):
            canonical(float("nan"))


if __name__ == "__main__":
    unittest.main()
