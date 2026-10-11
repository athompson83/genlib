# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 12 shared vector set; do not edit the literals by hand.
import unittest
from url_template import UrlTemplateError, expand_template

VARIABLES = {
    'count': ['one', 'two', 'three'],
    'dom': ['example', 'com'],
    'dub': 'me/too',
    'hello': 'Hello World!',
    'half': '50%',
    'var': 'value',
    'who': 'fred',
    'base': 'http://example.com/home/',
    'path': '/foo/bar',
    'list': ['red', 'green', 'blue'],
    'keys': {'semi': ';', 'dot': '.', 'comma': ','},
    'v': '6',
    'x': '1024',
    'y': '768',
    'empty': '',
    'empty_keys': {},
    'empty_list': [],
    'utf': 'café ☃',
    'emoji': '😀x',
}

CASES = [
    ['{var}', 'value'],
    ['{hello}', 'Hello%20World%21'],
    ['{half}', '50%25'],
    ['O{empty}X', 'OX'],
    ['O{undef}X', 'OX'],
    ['{x,y}', '1024,768'],
    ['{x,hello,y}', '1024,Hello%20World%21,768'],
    ['?{x,empty}', '?1024,'],
    ['?{x,undef}', '?1024'],
    ['?{undef,y}', '?768'],
    ['{var:3}', 'val'],
    ['{var:30}', 'value'],
    ['{list}', 'red,green,blue'],
    ['{list*}', 'red,green,blue'],
    ['{keys}', 'semi,%3B,dot,.,comma,%2C'],
    ['{keys*}', 'semi=%3B,dot=.,comma=%2C'],
    ['{+var}', 'value'],
    ['{+hello}', 'Hello%20World!'],
    ['{+half}', '50%25'],
    ['{base}index', 'http%3A%2F%2Fexample.com%2Fhome%2Findex'],
    ['{+base}index', 'http://example.com/home/index'],
    ['{+path:6}/here', '/foo/b/here'],
    ['{+list}', 'red,green,blue'],
    ['{+keys*}', 'semi=;,dot=.,comma=,'],
    ['{#var}', '#value'],
    ['{#hello}', '#Hello%20World!'],
    ['{#path:6}/here', '#/foo/b/here'],
    ['{#keys*}', '#semi=;,dot=.,comma=,'],
    ['X{.var}', 'X.value'],
    ['X{.var:3}', 'X.val'],
    ['X{.list*}', 'X.red.green.blue'],
    ['{.dom*}', '.example.com'],
    ['{/var}', '/value'],
    ['{/var:1,var}', '/v/value'],
    ['{/list*,path:4}', '/red/green/blue/%2Ffoo'],
    ['{/keys*}', '/semi=%3B/dot=./comma=%2C'],
    ['{;hello:5}', ';hello=Hello'],
    ['{;list*}', ';list=red;list=green;list=blue'],
    ['{;keys*}', ';semi=%3B;dot=.;comma=%2C'],
    ['{;x,y,empty}', ';x=1024;y=768;empty'],
    ['{?x,y,empty}', '?x=1024&y=768&empty='],
    ['{?var:3}', '?var=val'],
    ['{?list}', '?list=red,green,blue'],
    ['{?list*}', '?list=red&list=green&list=blue'],
    ['{?keys}', '?keys=semi,%3B,dot,.,comma,%2C'],
    ['{?keys*}', '?semi=%3B&dot=.&comma=%2C'],
    ['{&var:3}', '&var=val'],
    ['{&keys*}', '&semi=%3B&dot=.&comma=%2C'],
    ['{?empty_keys*}', ''],
    ['{?empty_list}', ''],
    ['{/count*}', '/one/two/three'],
    ['{utf}', 'caf%C3%A9%20%E2%98%83'],
    ['{+utf}', 'caf%C3%A9%20%E2%98%83'],
    ['{emoji:1}', '%F0%9F%98%80'],
    ['{?utf}', '?utf=caf%C3%A9%20%E2%98%83'],
    ['map?{x,y}#{hello}', 'map?1024,768#Hello%20World%21'],
    ['literal%20kept/{var}', 'literal%20kept/value'],
    ['sp ace{var}', 'sp%20acevalue'],
]

INVALID = [
    '{var',
    'var}',
    '{}',
    '{=var}',
    '{!var}',
    '{@var}',
    '{|var}',
    '{var:0}',
    '{var:10000}',
    '{va r}',
    '{list:3}',
    '{keys:2}',
    '{var:01}',
]


class UrlTemplateTest(unittest.TestCase):
    def test_cases(self):
        for template, expected in CASES:
            self.assertEqual(expand_template(template, VARIABLES), expected, template)

    def test_invalid(self):
        for template in INVALID:
            with self.assertRaises(UrlTemplateError, msg=template):
                expand_template(template, VARIABLES)
        with self.assertRaises(UrlTemplateError):
            expand_template("{n}", {"n": 5})

    def test_dict_order_and_none(self):
        self.assertEqual(expand_template("{?m*}", {"m": {"b": "2", "a": "1"}}), "?b=2&a=1")
        self.assertEqual(expand_template("{x}", {"x": None}), "")

    def test_literal_percent(self):
        self.assertEqual(expand_template("a%2Fb%zz%", {}), "a%2Fb%25zz%25")


if __name__ == "__main__":
    unittest.main()
