# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 11 shared vector set; do not edit the literals by hand.
import unittest

from template_render import TemplateError, render_template

DATA = {'name': 'Ada <3', 'html': '<b>x</b>', 'n': 3, 'f': 2.5, 'g': 4.0, 't': True, 'z': 0, 'e': '', 'items': [{'name': 'one'}, {'name': 'two', 'extra': '!'}], 'nums': [1, 2], 'user': {'first': 'Grace', 'tags': ['x']}, 'empty': [], 'obj': {'k': 'v'}}
RENDER = [
    ['Hello {{name}}!', 'Hello Ada &lt;3!'],
    ['{{{html}}} vs {{html}}', '<b>x</b> vs &lt;b&gt;x&lt;/b&gt;'],
    ['{{ n }} {{f}} {{g}} {{t}} {{z}} [{{e}}] [{{missing}}]', '3 2.5 4 true 0 [] []'],
    ['{{#items}}<{{name}}{{extra}}>{{/items}}', '<one><two!>'],
    ['{{#nums}}{{.}},{{/nums}}', '1,2,'],
    ['{{#t}}yes{{/t}}{{#z}}no{{/z}}{{^z}}zero{{/z}}{{^empty}}none{{/empty}}', 'yeszeronone'],
    ['{{#user}}{{first}} {{name}}{{/user}}', 'Grace Ada &lt;3'],
    ['{{user.first}} {{user.tags[0]}}', 'Grace x'],
    ['a{{! comment }}b', 'ab'],
    ['{{#obj}}{{k}}{{/obj}}', 'v'],
    ['{{#items}}{{#extra}}[{{name}}]{{/extra}}{{/items}}', '[two]'],
    ['no tags', 'no tags'],
]
RAW_MODE = [
    ['{{html}}', '<b>x</b>'],
]
INVALID = [
    '{{',
    '{{#a}}x',
    '{{#a}}x{{/b}}',
    '{{/a}}',
    '{{ bad name }}',
    '{{{x}}',
    '{{obj}}',
    '{{items}}',
]


class TemplateRenderTest(unittest.TestCase):
    def test_render(self):
        for template, expected in RENDER:
            self.assertEqual(render_template(template, DATA), expected, template)
        for template, expected in RAW_MODE:
            self.assertEqual(render_template(template, DATA, False), expected, template)

    def test_invalid(self):
        for template in INVALID:
            with self.assertRaises(TemplateError, msg=template):
                render_template(template, DATA)

    def test_scopes(self):
        data = {"who": "outer", "list": [{"x": 1}, {"who": "inner"}]}
        self.assertEqual(render_template("{{#list}}{{who}};{{/list}}", data), "outer;inner;")
        self.assertEqual(render_template("{{ x }}", {"x": 0.1}), "0.1")


if __name__ == "__main__":
    unittest.main()
