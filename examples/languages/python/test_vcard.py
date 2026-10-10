# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 7 shared vector set.
import unittest

from vcard import build_vcard

CASES = [[{'address': {'country': 'United Kingdom',
               'locality': 'London',
               'postalCode': 'SW1Y 4LB',
               'street': "12 St. James's Sq",
               'type': 'home'},
   'emails': [{'type': 'work', 'value': 'ada@example.com'}],
   'fn': 'Ada Lovelace',
   'n': {'family': 'Lovelace', 'given': 'Ada', 'prefix': 'Countess'},
   'note': 'First line\nSecond; with, punctuation \\ backslash',
   'org': 'Analytical Engines, Ltd.',
   'phones': [{'type': 'cell', 'value': '+44 20 7946 0000'}],
   'title': 'Programmer',
   'uid': 'urn:uuid:01a0c450-6c7b-7102-8304-05060708090a',
   'urls': ['https://example.com/ada']},
  'BEGIN:VCARD\r\n'
  'VERSION:4.0\r\n'
  'FN:Ada Lovelace\r\n'
  'N:Lovelace;Ada;;Countess;\r\n'
  'ORG:Analytical Engines\\, Ltd.\r\n'
  'TITLE:Programmer\r\n'
  'EMAIL;TYPE=work:ada@example.com\r\n'
  'TEL;TYPE=cell:+44 20 7946 0000\r\n'
  "ADR;TYPE=home:;;12 St. James's Sq;London;;SW1Y 4LB;United Kingdom\r\n"
  'URL:https://example.com/ada\r\n'
  'NOTE:First line\\nSecond\\; with\\, punctuation \\\\ backslash\r\n'
  'UID:urn:uuid:01a0c450-6c7b-7102-8304-05060708090a\r\n'
  'END:VCARD\r\n'],
 [{'fn': 'Zoë Ångström'}, 'BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Zoë Ångström\r\nEND:VCARD\r\n'],
 [{'fn': 'Long Note', 'note': 'éééééééééééééééééééééééééééééééééééééééééééééééééééééééééééé'},
  'BEGIN:VCARD\r\n'
  'VERSION:4.0\r\n'
  'FN:Long Note\r\n'
  'NOTE:ééééééééééééééééééééééééééééééééééé\r\n'
  ' ééééééééééééééééééééééééé\r\n'
  'END:VCARD\r\n']]
INVALID = [{'fn': ''},
 {'fn': '   '},
 {'emails': [{'value': 'not an email'}], 'fn': 'A'},
 {'fn': 'A', 'phones': [{'value': 'call me'}]},
 {'fn': 'A', 'urls': ['javascript:alert(1)']},
 {'emails': [{'type': 'Work', 'value': 'a@b.c'}], 'fn': 'A'},
 {'fn': 'Tab\there'}]


class VCardTest(unittest.TestCase):
    def test_cases_are_byte_exact(self):
        for contact, expected in CASES:
            self.assertEqual(build_vcard(contact), expected)

    def test_lines_are_folded_at_75_octets(self):
        for _, expected in CASES:
            for line in expected.split("\r\n"):
                self.assertLessEqual(len(line.encode()), 75)

    def test_invalid(self):
        for contact in INVALID:
            with self.assertRaises(ValueError, msg=repr(contact)):
                build_vcard(contact)


if __name__ == "__main__":
    unittest.main()
