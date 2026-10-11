# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 10 shared vector set; do not edit the literals by hand.
import unittest

from content_disposition import (
    DispositionError,
    build_content_disposition,
    parse_content_disposition,
    sanitize_filename,
)

BUILD = [
    ['report.pdf', False, 'attachment; filename="report.pdf"'],
    ['café.pdf', False, 'attachment; filename="caf_.pdf"; filename*=UTF-8\'\'caf%C3%A9.pdf'],
    ['../etc/passwd', False, 'attachment; filename="_etc_passwd"'],
    ['a"b\\c.txt', False, 'attachment; filename="a_b_c.txt"'],
    ['  .hidden  ', False, 'attachment; filename="hidden"'],
    ['', False, 'attachment; filename="download"'],
    ['日本語.txt', True, 'inline; filename="___.txt"; filename*=UTF-8\'\'%E6%97%A5%E6%9C%AC%E8%AA%9E.txt'],
    ['tab\there.csv', False, 'attachment; filename="tab_here.csv"'],
    ['100% sure+ok.txt', False, 'attachment; filename="100% sure+ok.txt"'],
]
PARSE = [
    ['attachment; filename="x.txt"', {'type': 'attachment', 'filename': 'x.txt', 'params': {'filename': 'x.txt'}}],
    ['attachment; filename=x.txt', {'type': 'attachment', 'filename': 'x.txt', 'params': {'filename': 'x.txt'}}],
    ['INLINE', {'type': 'inline', 'filename': None, 'params': {}}],
    ['attachment; filename="a.txt"; filename*=UTF-8\'\'%E2%82%AC%20rates.txt', {'type': 'attachment', 'filename': '€ rates.txt', 'params': {'filename': '€ rates.txt'}}],
    ["attachment; filename*=iso-8859-1'en'%A3%20rates.txt", {'type': 'attachment', 'filename': '£ rates.txt', 'params': {'filename': '£ rates.txt'}}],
    ['attachment; filename="..\\\\..\\\\evil.exe"', {'type': 'attachment', 'filename': '_.._evil.exe', 'params': {'filename': '..\\..\\evil.exe'}}],
    ['attachment; filename="\\"quoted\\".txt"; size=100', {'type': 'attachment', 'filename': '_quoted_.txt', 'params': {'filename': '"quoted".txt', 'size': '100'}}],
    ['form-data; name="file"; filename="photo.jpg"', {'type': 'form-data', 'filename': 'photo.jpg', 'params': {'name': 'file', 'filename': 'photo.jpg'}}],
]
INVALID = [
    '; filename=x',
    'attachment; filename="open',
    "attachment; filename*=UTF-8''%G0",
    'attachment filename=x',
]


class ContentDispositionTest(unittest.TestCase):
    def test_build(self):
        for filename, inline, expected in BUILD:
            header = build_content_disposition(filename, inline)
            self.assertEqual(header, expected, filename)
            self.assertEqual(parse_content_disposition(header)["filename"], sanitize_filename(filename))

    def test_parse(self):
        for header, expected in PARSE:
            got = parse_content_disposition(header)
            self.assertEqual(got, expected, header)
            self.assertEqual(list(got["params"]), list(expected["params"]), header)

    def test_invalid(self):
        for header in INVALID:
            with self.assertRaises(DispositionError, msg=header):
                parse_content_disposition(header)

    def test_sanitize(self):
        self.assertEqual(sanitize_filename(" ..a/b\\c\x7f.. "), "a_b_c_")
        self.assertEqual(sanitize_filename("..."), "download")


if __name__ == "__main__":
    unittest.main()
