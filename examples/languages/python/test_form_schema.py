# SPDX-License-Identifier: Apache-2.0
import unittest

from form_schema import validate

S = [
    {"name": "name", "type": "string", "required": True, "minLength": 2, "maxLength": 5},
    {"name": "age", "type": "integer", "min": 18, "max": 120},
    {"name": "email", "type": "email", "required": True},
    {"name": "plan", "type": "string", "enum": ["free", "pro"]},
    {"name": "code", "type": "string", "pattern": r"[A-Z]{3}-\d{2}"},
    {"name": "start", "type": "date"},
]


class FormSchemaTests(unittest.TestCase):
    def test_vectors(self):
        self.assertEqual(validate(S, {"name": "Al", "age": 30, "email": "a@b.co", "plan": "pro",
                                      "code": "ABC-12", "start": "2024-02-29"}), {})
        self.assertEqual(validate(S, {"name": "", "email": "bad"}), {"name": ["required"], "email": ["email"]})
        third = validate(S, {"name": "Abcdef", "age": 17.5, "email": "a@b.co", "plan": "team",
                             "code": "abc-12", "start": "2023-02-29"})
        self.assertEqual(list(third.items()), [("name", ["maxLength"]), ("age", ["type"]), ("plan", ["enum"]),
                                               ("code", ["pattern"]), ("start", ["date"])])
        self.assertEqual(validate(S, {"name": "Al", "email": "a@b.co", "age": "30"}), {"age": ["type"]})
        self.assertEqual(validate(S, {"name": "Al", "email": "a@b.co", "extra": 1}), {"extra": ["unknown"]})
        self.assertEqual(validate(S, {"name": "Al", "email": "a@b.co", "extra": 1}, allow_unknown=True), {})
        self.assertEqual(validate(S, {"name": "Al", "email": "a@b.co", "age": 121}), {"age": ["max"]})
        self.assertEqual(validate(S, {"name": "Ā", "email": "a@b.co"}), {"name": ["minLength"]})

    def test_extra_cases(self):
        self.assertEqual(validate(S, {"name": None, "email": "a@b.co", "age": True, "start": "1900-02-29"}),
                         {"name": ["required"], "age": ["type"], "start": ["date"]})
        self.assertEqual(validate(S, {"name": "Al", "email": "a@@b.co"}), {"email": ["email"]})
        self.assertEqual(validate(S, {"name": "Al", "email": "a@b.co", "start": "2000-02-29", "code": "ABC-12x"}),
                         {"code": ["pattern"]})
        self.assertEqual(validate(S, {"name": "Al", "email": "a@b.co", "code": "ABC-١٢"}), {"code": ["pattern"]})
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate([{"name": "x", "type": "string"}, {"name": "x", "type": "number"}], {})


if __name__ == "__main__":
    unittest.main()
