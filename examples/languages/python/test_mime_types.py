# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 10 shared vector set; do not edit the literals by hand.
import unittest

from mime_types import content_type_for, extension_for, mime_type_for

TYPE_FOR = [
    ['index.html', 'text/html'],
    ['APP.JS', 'text/javascript'],
    ['data.json', 'application/json'],
    ['photo.JPG', 'image/jpeg'],
    ['x.tar.gz', 'application/gzip'],
    ['video.webm', 'video/webm'],
    ['font.woff2', 'font/woff2'],
    ['doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['noext', None],
    ['json', 'application/json'],
    ['.png', 'image/png'],
    ['a.unknown', None],
    ['style.css', 'text/css'],
    ['feed.xml', 'application/xml'],
    ['pic.svg', 'image/svg+xml'],
]
EXTENSION_FOR = [
    ['image/jpeg', 'jpg'],
    ['text/html; charset=UTF-8', 'html'],
    ['Application/JSON', 'json'],
    ['text/javascript', 'js'],
    ['application/x-unknown', None],
    ['video/mp4', 'mp4'],
]
CONTENT_TYPE = [
    ['a.html', 'text/html; charset=utf-8'],
    ['a.json', 'application/json; charset=utf-8'],
    ['a.png', 'image/png'],
    ['a.svg', 'image/svg+xml; charset=utf-8'],
    ['a.bin', 'application/octet-stream'],
    ['a.zzz', 'application/octet-stream'],
    ['readme.md', 'text/markdown; charset=utf-8'],
]


class MimeTypesTest(unittest.TestCase):
    def test_type_for(self):
        for name, expected in TYPE_FOR:
            self.assertEqual(mime_type_for(name), expected, name)

    def test_extension_for(self):
        for mime, expected in EXTENSION_FOR:
            self.assertEqual(extension_for(mime), expected, mime)

    def test_content_type(self):
        for name, expected in CONTENT_TYPE:
            self.assertEqual(content_type_for(name), expected, name)


if __name__ == "__main__":
    unittest.main()
