# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 9 shared vector set; do not edit the literals by hand.
import unittest

from sse import SseParser, format_comment, format_sse, parse_sse

PARSE = [['data: YHOO\ndata: +2\ndata: 10\n\n', [{'data': 'YHOO\n+2\n10', 'event': 'message', 'id': ''}], None],
 [': test stream\n\ndata: first event\nid: 1\n\ndata:second event\nid\n\ndata:  third event\n',
  [{'data': 'first event', 'event': 'message', 'id': '1'},
   {'data': 'second event', 'event': 'message', 'id': ''}],
  None],
 ['data\n\ndata\ndata\n\ndata:',
  [{'data': '', 'event': 'message', 'id': ''}, {'data': '\n', 'event': 'message', 'id': ''}],
  None],
 ['data:test\n\ndata: test\n\n',
  [{'data': 'test', 'event': 'message', 'id': ''}, {'data': 'test', 'event': 'message', 'id': ''}],
  None],
 ['event: add\ndata: 73857293\n\nevent: remove\ndata: 2153\n\nevent: add\ndata: 113411\n\n',
  [{'data': '73857293', 'event': 'add', 'id': ''},
   {'data': '2153', 'event': 'remove', 'id': ''},
   {'data': '113411', 'event': 'add', 'id': ''}],
  None],
 ['\ufeffdata: bom\n\n', [{'data': 'bom', 'event': 'message', 'id': ''}], None],
 ['data: a\r\ndata: b\r\rdata: c\n\n',
  [{'data': 'a\nb', 'event': 'message', 'id': ''}, {'data': 'c', 'event': 'message', 'id': ''}],
  None],
 ['id: 7\ndata: x\n\ndata: y\n\nid\ndata: z\n\n',
  [{'data': 'x', 'event': 'message', 'id': '7'},
   {'data': 'y', 'event': 'message', 'id': '7'},
   {'data': 'z', 'event': 'message', 'id': ''}],
  None],
 ['id: a\x00b\ndata: nul\n\n', [{'data': 'nul', 'event': 'message', 'id': ''}], None],
 ['retry: 1500\ndata: r\n\nretry: x\ndata: s\n\n',
  [{'data': 'r', 'event': 'message', 'id': ''}, {'data': 's', 'event': 'message', 'id': ''}],
  1500],
 ['event\ndata: e\n\n', [{'data': 'e', 'event': 'message', 'id': ''}], None],
 ['unknown: q\ndata: u\n\n', [{'data': 'u', 'event': 'message', 'id': ''}], None],
 [':\n:comment\ndata: ok\n\n', [{'data': 'ok', 'event': 'message', 'id': ''}], None],
 ['data: no blank line at end', [], None]]
CHUNKED = [[['data: YHO', 'O\ndata: +2\n', 'data', ': 10\n\n'],
  [{'data': 'YHOO\n+2\n10', 'event': 'message', 'id': ''}]],
 [[': te', 'st stream\n\ndata: first event\nid: 1\n\ndata:s', 'econd event\nid\n\ndata: ', ' third event\n'],
  [{'data': 'first event', 'event': 'message', 'id': '1'},
   {'data': 'second event', 'event': 'message', 'id': ''}]],
 [['da', 'ta\n\nda', 'ta\ndata', '\n\ndata:'],
  [{'data': '', 'event': 'message', 'id': ''}, {'data': '\n', 'event': 'message', 'id': ''}]],
 [['data', ':t', 'est\n\nd', 'ata: test\n\n'],
  [{'data': 'test', 'event': 'message', 'id': ''}, {'data': 'test', 'event': 'message', 'id': ''}]],
 [['event: add\ndata: 73857293\n\nevent', ': remove\ndata: 21', '53\n\nevent: a', 'dd\ndata: 113411\n\n'],
  [{'data': '73857293', 'event': 'add', 'id': ''},
   {'data': '2153', 'event': 'remove', 'id': ''},
   {'data': '113411', 'event': 'add', 'id': ''}]],
 [['\ufeffd', 'at', 'a: bo', 'm\n\n'], [{'data': 'bom', 'event': 'message', 'id': ''}]],
 [['d', 'ata: a', '\r\ndata: b\r\rdata: ', 'c\n\n'],
  [{'data': 'a\nb', 'event': 'message', 'id': ''}, {'data': 'c', 'event': 'message', 'id': ''}]],
 [['id: 7\ndata: ', 'x\n\ndat', 'a: y\n\nid\n', 'data: z\n\n'],
  [{'data': 'x', 'event': 'message', 'id': '7'},
   {'data': 'y', 'event': 'message', 'id': '7'},
   {'data': 'z', 'event': 'message', 'id': ''}]],
 [['id:', ' a\x00', 'b\ndata:', ' nul\n\n'], [{'data': 'nul', 'event': 'message', 'id': ''}]],
 [['r', 'etry: 15', '00\ndata: r\n\nretry: x', '\ndata: s\n\n'],
  [{'data': 'r', 'event': 'message', 'id': ''}, {'data': 's', 'event': 'message', 'id': ''}]]]
FORMAT = [['hello', None, None, None, 'data: hello\n\n'],
 ['a\nb\r\nc', 'update', '42', None, 'event: update\nid: 42\ndata: a\ndata: b\ndata: c\n\n'],
 ['', None, None, 3000, 'retry: 3000\ndata: \n\n'],
 ['{"x":1}', 'json', '', None, 'event: json\nid: \ndata: {"x":1}\n\n']]
FORMAT_INVALID = [['x', 'a\nb', None, None], ['x', None, 'a\rb', None], ['x', None, 'a\x00', None], ['x', None, None, -1]]
COMMENT = [['', ':\n\n'], ['ping', ': ping\n\n']]


class SseTest(unittest.TestCase):
    def test_parse(self):
        for text, events, retry in PARSE:
            self.assertEqual(parse_sse(text), events, text)
            parser = SseParser()
            parser.feed(text)
            self.assertEqual(parser.retry, retry, text)

    def test_chunked(self):
        for chunks, events in CHUNKED:
            parser = SseParser()
            got = []
            for chunk in chunks:
                got += parser.feed(chunk)
            self.assertEqual(got, events, chunks)

    def test_crlf_split_across_chunks(self):
        parser = SseParser()
        self.assertEqual(parser.feed("data: a\r"), [])
        self.assertEqual(parser.feed("\n\r\n"), [{"event": "message", "data": "a", "id": ""}])
        # only a BOM at the very start of the stream is dropped; later it is part of the field name
        self.assertEqual(parser.feed("\ufeffdata: b\n\n"), [])

    def test_format(self):
        for data, event, id_, retry, expected in FORMAT:
            self.assertEqual(format_sse(data, event, id_, retry), expected)
            self.assertEqual(parse_sse(expected)[0]["data"], data.replace("\r\n", "\n").replace("\r", "\n"))
        for data, event, id_, retry in FORMAT_INVALID:
            with self.assertRaises(ValueError):
                format_sse(data, event, id_, retry)
        for text, expected in COMMENT:
            self.assertEqual(format_comment(text), expected)
        with self.assertRaises(ValueError):
            format_comment("a\nb")


if __name__ == "__main__":
    unittest.main()
