// SPDX-License-Identifier: Apache-2.0
// Wave 9 capability checks: SSE, text chunking, vector math, circuit breaker, business days, natural sort, file
// signatures and color conversion. Every vector is generated from the shared wave 9 reference vectors (caps10 vectors.json);
// keep them identical across languages.
import 'package:genlib_validation_example/business_days.dart';
import 'package:genlib_validation_example/circuit_breaker.dart';
import 'package:genlib_validation_example/color_convert.dart';
import 'package:genlib_validation_example/file_signature.dart';
import 'package:genlib_validation_example/natural_sort.dart';
import 'package:genlib_validation_example/sse.dart';
import 'package:genlib_validation_example/text_chunking.dart';
import 'package:genlib_validation_example/vector_math.dart';

import 'src/checks.dart';

String _events(Iterable<SseEvent> evs) => evs.map((e) => '${e.event}\u{241F}${e.data}\u{241F}${e.id}').join('\u{241E}');
String _join(Iterable<String> xs) => xs.join('\u{241E}');
List<int> _hex(String h) => [for (var i = 0; i < h.length; i += 2) int.parse(h.substring(i, i + 2), radix: 16)];
void _near(Checks c, String name, double expected, double actual, [double tol = 1e-9]) {
  final ok = (expected - actual).abs() <= tol;
  if (!ok) print('  expected <$expected> got <$actual>');
  c.check(name, ok);
}

void runSseTests(Checks c) {
  {
    final p = SseParser();
    c.eq('sse parse 0 data: YHOO\\ndata: +2\\ndata: 10\\n\\n', 'message\u{241F}YHOO\n+2\n10\u{241F}', _events(p.feed('data: YHOO\ndata: +2\ndata: 10\n\n')));
    c.eq("sse parse 0 retry", null, p.retry);
  }
  {
    final p = SseParser();
    c.eq('sse parse 1 : test stream\\n\\ndata: first event\\nid: ...', 'message\u{241F}first event\u{241F}1\u{241E}message\u{241F}second event\u{241F}', _events(p.feed(': test stream\n\ndata: first event\nid: 1\n\ndata:second event\nid\n\ndata:  third event\n')));
    c.eq("sse parse 1 retry", null, p.retry);
  }
  {
    final p = SseParser();
    c.eq('sse parse 2 data\\n\\ndata\\ndata\\n\\ndata:', 'message\u{241F}\u{241F}\u{241E}message\u{241F}\n\u{241F}', _events(p.feed('data\n\ndata\ndata\n\ndata:')));
    c.eq("sse parse 2 retry", null, p.retry);
  }
  {
    final p = SseParser();
    c.eq('sse parse 3 data:test\\n\\ndata: test\\n\\n', 'message\u{241F}test\u{241F}\u{241E}message\u{241F}test\u{241F}', _events(p.feed('data:test\n\ndata: test\n\n')));
    c.eq("sse parse 3 retry", null, p.retry);
  }
  {
    final p = SseParser();
    c.eq('sse parse 4 event: add\\ndata: 73857293\\n\\nevent: rem...', 'add\u{241F}73857293\u{241F}\u{241E}remove\u{241F}2153\u{241F}\u{241E}add\u{241F}113411\u{241F}', _events(p.feed('event: add\ndata: 73857293\n\nevent: remove\ndata: 2153\n\nevent: add\ndata: 113411\n\n')));
    c.eq("sse parse 4 retry", null, p.retry);
  }
  {
    final p = SseParser();
    c.eq('sse parse 5 <BOM>data: bom\\n\\n', 'message\u{241F}bom\u{241F}', _events(p.feed('\u{FEFF}data: bom\n\n')));
    c.eq("sse parse 5 retry", null, p.retry);
  }
  {
    final p = SseParser();
    c.eq('sse parse 6 data: a\\r\\ndata: b\\r\\rdata: c\\n\\n', 'message\u{241F}a\nb\u{241F}\u{241E}message\u{241F}c\u{241F}', _events(p.feed('data: a\r\ndata: b\r\rdata: c\n\n')));
    c.eq("sse parse 6 retry", null, p.retry);
  }
  {
    final p = SseParser();
    c.eq('sse parse 7 id: 7\\ndata: x\\n\\ndata: y\\n\\nid\\ndata: z...', 'message\u{241F}x\u{241F}7\u{241E}message\u{241F}y\u{241F}7\u{241E}message\u{241F}z\u{241F}', _events(p.feed('id: 7\ndata: x\n\ndata: y\n\nid\ndata: z\n\n')));
    c.eq("sse parse 7 retry", null, p.retry);
  }
  {
    final p = SseParser();
    c.eq('sse parse 8 id: a\\0b\\ndata: nul\\n\\n', 'message\u{241F}nul\u{241F}', _events(p.feed('id: a\u{0}b\ndata: nul\n\n')));
    c.eq("sse parse 8 retry", null, p.retry);
  }
  {
    final p = SseParser();
    c.eq('sse parse 9 retry: 1500\\ndata: r\\n\\nretry: x\\ndata: ...', 'message\u{241F}r\u{241F}\u{241E}message\u{241F}s\u{241F}', _events(p.feed('retry: 1500\ndata: r\n\nretry: x\ndata: s\n\n')));
    c.eq("sse parse 9 retry", 1500, p.retry);
  }
  {
    final p = SseParser();
    c.eq('sse parse 10 event\\ndata: e\\n\\n', 'message\u{241F}e\u{241F}', _events(p.feed('event\ndata: e\n\n')));
    c.eq("sse parse 10 retry", null, p.retry);
  }
  {
    final p = SseParser();
    c.eq('sse parse 11 unknown: q\\ndata: u\\n\\n', 'message\u{241F}u\u{241F}', _events(p.feed('unknown: q\ndata: u\n\n')));
    c.eq("sse parse 11 retry", null, p.retry);
  }
  {
    final p = SseParser();
    c.eq('sse parse 12 :\\n:comment\\ndata: ok\\n\\n', 'message\u{241F}ok\u{241F}', _events(p.feed(':\n:comment\ndata: ok\n\n')));
    c.eq("sse parse 12 retry", null, p.retry);
  }
  {
    final p = SseParser();
    c.eq('sse parse 13 data: no blank line at end', '', _events(p.feed('data: no blank line at end')));
    c.eq("sse parse 13 retry", null, p.retry);
  }
  {
    final p = SseParser();
    c.eq("sse chunked 0", 'message\u{241F}YHOO\n+2\n10\u{241F}', _events([for (final ch in <String>['data: YHO', 'O\ndata: +2\n', 'data', ': 10\n\n']) ...p.feed(ch)]));
  }
  {
    final p = SseParser();
    c.eq("sse chunked 1", 'message\u{241F}first event\u{241F}1\u{241E}message\u{241F}second event\u{241F}', _events([for (final ch in <String>[': te', 'st stream\n\ndata: first event\nid: 1\n\ndata:s', 'econd event\nid\n\ndata: ', ' third event\n']) ...p.feed(ch)]));
  }
  {
    final p = SseParser();
    c.eq("sse chunked 2", 'message\u{241F}\u{241F}\u{241E}message\u{241F}\n\u{241F}', _events([for (final ch in <String>['da', 'ta\n\nda', 'ta\ndata', '\n\ndata:']) ...p.feed(ch)]));
  }
  {
    final p = SseParser();
    c.eq("sse chunked 3", 'message\u{241F}test\u{241F}\u{241E}message\u{241F}test\u{241F}', _events([for (final ch in <String>['data', ':t', 'est\n\nd', 'ata: test\n\n']) ...p.feed(ch)]));
  }
  {
    final p = SseParser();
    c.eq("sse chunked 4", 'add\u{241F}73857293\u{241F}\u{241E}remove\u{241F}2153\u{241F}\u{241E}add\u{241F}113411\u{241F}', _events([for (final ch in <String>['event: add\ndata: 73857293\n\nevent', ': remove\ndata: 21', '53\n\nevent: a', 'dd\ndata: 113411\n\n']) ...p.feed(ch)]));
  }
  {
    final p = SseParser();
    c.eq("sse chunked 5", 'message\u{241F}bom\u{241F}', _events([for (final ch in <String>['\u{FEFF}d', 'at', 'a: bo', 'm\n\n']) ...p.feed(ch)]));
  }
  {
    final p = SseParser();
    c.eq("sse chunked 6", 'message\u{241F}a\nb\u{241F}\u{241E}message\u{241F}c\u{241F}', _events([for (final ch in <String>['d', 'ata: a', '\r\ndata: b\r\rdata: ', 'c\n\n']) ...p.feed(ch)]));
  }
  {
    final p = SseParser();
    c.eq("sse chunked 7", 'message\u{241F}x\u{241F}7\u{241E}message\u{241F}y\u{241F}7\u{241E}message\u{241F}z\u{241F}', _events([for (final ch in <String>['id: 7\ndata: ', 'x\n\ndat', 'a: y\n\nid\n', 'data: z\n\n']) ...p.feed(ch)]));
  }
  {
    final p = SseParser();
    c.eq("sse chunked 8", 'message\u{241F}nul\u{241F}', _events([for (final ch in <String>['id:', ' a\u{0}', 'b\ndata:', ' nul\n\n']) ...p.feed(ch)]));
  }
  {
    final p = SseParser();
    c.eq("sse chunked 9", 'message\u{241F}r\u{241F}\u{241E}message\u{241F}s\u{241F}', _events([for (final ch in <String>['r', 'etry: 15', '00\ndata: r\n\nretry: x', '\ndata: s\n\n']) ...p.feed(ch)]));
  }
  c.eq("sse parseSse one-shot", 'message\u{241F}YHOO\n+2\n10\u{241F}', _events(parseSse('data: YHOO\ndata: +2\ndata: 10\n\n')));
  c.eq("sse format 0", 'data: hello\n\n', formatSse('hello'));
  c.eq("sse format 1", 'event: update\nid: 42\ndata: a\ndata: b\ndata: c\n\n', formatSse('a\nb\r\nc', event: 'update', id: '42'));
  c.eq("sse format 2", 'retry: 3000\ndata: \n\n', formatSse('', retry: 3000));
  c.eq("sse format 3", 'event: json\nid: \ndata: {"x":1}\n\n', formatSse('{"x":1}', event: 'json', id: ''));
  c.throws<ArgumentError>("sse format invalid 0", () => formatSse('x', event: 'a\nb'));
  c.throws<ArgumentError>("sse format invalid 1", () => formatSse('x', id: 'a\rb'));
  c.throws<ArgumentError>("sse format invalid 2", () => formatSse('x', id: 'a\u{0}'));
  c.throws<ArgumentError>("sse format invalid 3", () => formatSse('x', retry: -1));
  c.eq('sse comment ', ':\n\n', formatComment(''));
  c.eq('sse comment ping', ': ping\n\n', formatComment('ping'));
  c.throws<ArgumentError>('sse comment line break', () => formatComment('a\nb'));
}

void runTextChunkingTests(Checks c) {
  const cases = <(String, int, int, List<String>)>[
    ('First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.', 60, 0, <String>['First paragraph. It has two sentences.', 'Second paragraph is a bit longer and keeps going.', 'Another sentence here! And a question?\n\nThird.']),
    ('First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.', 40, 15, <String>['First paragraph. It has two sentences.', 'Second paragraph is a bit longer and', 'bit longer and keeps going.', 'keeps going. Another sentence here!', 'And a question?\n\nThird.']),
    ('First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.', 10, 0, <String>['First para', 'graph. It', 'has two se', 'ntences.', 'Second', 'paragraph', 'is a bit', 'longer', 'and keeps', 'going.', 'Another', 'sentence', 'here! And', 'a question', '?\n\nThird.']),
    ('First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.', 10, 4, <String>['First para', 'paragraph.', 'aph. It', 'It has', 'has two se', 'sentences.', 'ces.', '.\n\nSecond', 'paragraph', 'is a bit', 'longer', 'and keeps', 'going.', 'Another', 'sentence', 'here! And', 'And a ques', 'question?', 'on?', 'n?\n\nThird.']),
    ('First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.', 4, 0, <String>['Firs', 't pa', 'ragr', 'aph.', 'It', 'has', 'two', 'sent', 'ence', 's.', 'Seco', 'nd p', 'arag', 'raph', 'is', 'a', 'bit', 'long', 'er', 'and', 'keep', 's go', 'ing.', 'Ano', 'ther', 'sen', 'tenc', 'e he', 're!', 'And', 'a qu', 'esti', 'on?', 'Thi', 'rd.']),
    ('First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.', 9, 4, <String>['First par', 'paragraph', 'raph. It', 'It has', 'has two s', 'sentences', 'nces.', 'Second', 'paragraph', 'raph is', 'is a', 'a bit', 'longer', 'and', 'keeps', 'going.', 'Another', 'sentence', 'here!', 'And a que', 'question?', 'ion?', '?\n\nThird.']),
    ('First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.', 1, 0, <String>['F', 'i', 'r', 's', 't', 'p', 'a', 'r', 'a', 'g', 'r', 'a', 'p', 'h', '.', 'I', 't', 'h', 'a', 's', 't', 'w', 'o', 's', 'e', 'n', 't', 'e', 'n', 'c', 'e', 's', '.', 'S', 'e', 'c', 'o', 'n', 'd', 'p', 'a', 'r', 'a', 'g', 'r', 'a', 'p', 'h', 'i', 's', 'a', 'b', 'i', 't', 'l', 'o', 'n', 'g', 'e', 'r', 'a', 'n', 'd', 'k', 'e', 'e', 'p', 's', 'g', 'o', 'i', 'n', 'g', '.', 'A', 'n', 'o', 't', 'h', 'e', 'r', 's', 'e', 'n', 't', 'e', 'n', 'c', 'e', 'h', 'e', 'r', 'e', '!', 'A', 'n', 'd', 'a', 'q', 'u', 'e', 's', 't', 'i', 'o', 'n', '?', 'T', 'h', 'i', 'r', 'd', '.']),
    ('First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.', 200, 50, <String>['First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.']),
    ('abcdefghij', 60, 0, <String>['abcdefghij']),
    ('abcdefghij', 40, 15, <String>['abcdefghij']),
    ('abcdefghij', 10, 0, <String>['abcdefghij']),
    ('abcdefghij', 10, 4, <String>['abcdefghij']),
    ('abcdefghij', 4, 0, <String>['abcd', 'efgh', 'ij']),
    ('abcdefghij', 9, 4, <String>['abcdefghi', 'fghij']),
    ('abcdefghij', 1, 0, <String>['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']),
    ('abcdefghij', 200, 50, <String>['abcdefghij']),
    ('one two three four five', 60, 0, <String>['one two three four five']),
    ('one two three four five', 40, 15, <String>['one two three four five']),
    ('one two three four five', 10, 0, <String>['one two', 'three', 'four five']),
    ('one two three four five', 10, 4, <String>['one two', 'two three', 'four five']),
    ('one two three four five', 4, 0, <String>['one', 'two', 'thre', 'e fo', 'ur', 'five']),
    ('one two three four five', 9, 4, <String>['one two', 'three', 'four five']),
    ('one two three four five', 1, 0, <String>['o', 'n', 'e', 't', 'w', 'o', 't', 'h', 'r', 'e', 'e', 'f', 'o', 'u', 'r', 'f', 'i', 'v', 'e']),
    ('one two three four five', 200, 50, <String>['one two three four five']),
    ('A. B. C.', 60, 0, <String>['A. B. C.']),
    ('A. B. C.', 40, 15, <String>['A. B. C.']),
    ('A. B. C.', 10, 0, <String>['A. B. C.']),
    ('A. B. C.', 10, 4, <String>['A. B. C.']),
    ('A. B. C.', 4, 0, <String>['A.', 'B.', 'C.']),
    ('A. B. C.', 9, 4, <String>['A. B. C.']),
    ('A. B. C.', 1, 0, <String>['A', '.', 'B', '.', 'C', '.']),
    ('A. B. C.', 200, 50, <String>['A. B. C.']),
    ('  \n\n  ', 60, 0, <String>[]),
    ('  \n\n  ', 40, 15, <String>[]),
    ('  \n\n  ', 10, 0, <String>[]),
    ('  \n\n  ', 10, 4, <String>[]),
    ('  \n\n  ', 4, 0, <String>[]),
    ('  \n\n  ', 9, 4, <String>[]),
    ('  \n\n  ', 1, 0, <String>[]),
    ('  \n\n  ', 200, 50, <String>[]),
    ('', 60, 0, <String>[]),
    ('', 40, 15, <String>[]),
    ('', 10, 0, <String>[]),
    ('', 10, 4, <String>[]),
    ('', 4, 0, <String>[]),
    ('', 9, 4, <String>[]),
    ('', 1, 0, <String>[]),
    ('', 200, 50, <String>[]),
    ('Line one\nLine two\nLine three\nLine four', 60, 0, <String>['Line one\nLine two\nLine three\nLine four']),
    ('Line one\nLine two\nLine three\nLine four', 40, 15, <String>['Line one\nLine two\nLine three\nLine four']),
    ('Line one\nLine two\nLine three\nLine four', 10, 0, <String>['Line one', 'Line two', 'Line', 'three', 'Line four']),
    ('Line one\nLine two\nLine three\nLine four', 10, 4, <String>['Line one', 'Line two', 'Line', 'three', 'Line four']),
    ('Line one\nLine two\nLine three\nLine four', 4, 0, <String>['Line', 'one', 'Line', 'two', 'Line', 'thr', 'ee\nL', 'ine', 'four']),
    ('Line one\nLine two\nLine three\nLine four', 9, 4, <String>['Line one', 'Line two', 'Line', 'three', 'Line four']),
    ('Line one\nLine two\nLine three\nLine four', 1, 0, <String>['L', 'i', 'n', 'e', 'o', 'n', 'e', 'L', 'i', 'n', 'e', 't', 'w', 'o', 'L', 'i', 'n', 'e', 't', 'h', 'r', 'e', 'e', 'L', 'i', 'n', 'e', 'f', 'o', 'u', 'r']),
    ('Line one\nLine two\nLine three\nLine four', 200, 50, <String>['Line one\nLine two\nLine three\nLine four']),
    ('Short.', 60, 0, <String>['Short.']),
    ('Short.', 40, 15, <String>['Short.']),
    ('Short.', 10, 0, <String>['Short.']),
    ('Short.', 10, 4, <String>['Short.']),
    ('Short.', 4, 0, <String>['Shor', 't.']),
    ('Short.', 9, 4, <String>['Short.']),
    ('Short.', 1, 0, <String>['S', 'h', 'o', 'r', 't', '.']),
    ('Short.', 200, 50, <String>['Short.']),
    ('Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.', 60, 0, <String>['Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.']),
    ('Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.', 40, 15, <String>['Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.']),
    ('Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.', 10, 0, <String>['Caf\u{E9}', 'na\u{EF}ve', 'r\u{E9}sum\u{E9} \u{2014}', '\u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002}', 'End.']),
    ('Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.', 10, 4, <String>['Caf\u{E9}', 'na\u{EF}ve', 'r\u{E9}sum\u{E9} \u{2014}', '\u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002}', 'End.']),
    ('Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.', 4, 0, <String>['Caf\u{E9}', 'na\u{EF}', 've r', '\u{E9}sum', '\u{E9} \u{2014}', '\u{65E5}\u{672C}\u{8A9E}\u{306E}', '\u{30C6}\u{30AD}\u{30B9}\u{30C8}', '\u{3002}', 'End.']),
    ('Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.', 9, 4, <String>['Caf\u{E9}', 'na\u{EF}ve', 'r\u{E9}sum\u{E9} \u{2014}', '\u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}', '\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002}', '\u{30B9}\u{30C8}\u{3002} End.']),
    ('Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.', 1, 0, <String>['C', 'a', 'f', '\u{E9}', 'n', 'a', '\u{EF}', 'v', 'e', 'r', '\u{E9}', 's', 'u', 'm', '\u{E9}', '\u{2014}', '\u{65E5}', '\u{672C}', '\u{8A9E}', '\u{306E}', '\u{30C6}', '\u{30AD}', '\u{30B9}', '\u{30C8}', '\u{3002}', 'E', 'n', 'd', '.']),
    ('Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.', 200, 50, <String>['Caf\u{E9} na\u{EF}ve r\u{E9}sum\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E}\u{306E}\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{3002} End.']),
    ('xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy', 60, 0, <String>['xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy']),
    ('xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy', 40, 15, <String>['xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy']),
    ('xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy', 10, 0, <String>['xxxxxxxxxx', 'xxxxxxxxxx', 'xxxxx', 'yyyyy']),
    ('xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy', 10, 4, <String>['xxxxxxxxxx', 'xxxxxxxxxx', 'xxxxxxxxxx', 'xxxxxxx', 'xxx yyyyy']),
    ('xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy', 4, 0, <String>['xxxx', 'xxxx', 'xxxx', 'xxxx', 'xxxx', 'xxxx', 'x yy', 'yyy']),
    ('xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy', 9, 4, <String>['xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxx', 'xxx yyyyy']),
    ('xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy', 1, 0, <String>['x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'y', 'y', 'y', 'y', 'y']),
    ('xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy', 200, 50, <String>['xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy']),
    ('Mr. Smith went. Then? Yes! Done.', 60, 0, <String>['Mr. Smith went. Then? Yes! Done.']),
    ('Mr. Smith went. Then? Yes! Done.', 40, 15, <String>['Mr. Smith went. Then? Yes! Done.']),
    ('Mr. Smith went. Then? Yes! Done.', 10, 0, <String>['Mr. Smith', 'went.', 'Then?', 'Yes! Done.']),
    ('Mr. Smith went. Then? Yes! Done.', 10, 4, <String>['Mr. Smith', 'went.', 'Then?', 'Yes! Done.']),
    ('Mr. Smith went. Then? Yes! Done.', 4, 0, <String>['Mr.', 'Smit', 'h we', 'nt.', 'Then', '? Ye', 's! D', 'one.']),
    ('Mr. Smith went. Then? Yes! Done.', 9, 4, <String>['Mr.', 'Smith', 'went.', 'Then?', 'Yes!', 'Done.']),
    ('Mr. Smith went. Then? Yes! Done.', 1, 0, <String>['M', 'r', '.', 'S', 'm', 'i', 't', 'h', 'w', 'e', 'n', 't', '.', 'T', 'h', 'e', 'n', '?', 'Y', 'e', 's', '!', 'D', 'o', 'n', 'e', '.']),
    ('Mr. Smith went. Then? Yes! Done.', 200, 50, <String>['Mr. Smith went. Then? Yes! Done.']),
  ];
  for (final (text, max, overlap, expected) in cases) {
    final label = (text.length > 30 ? text.substring(0, 30) : text).replaceAll('\n', r'\n');
    c.eq('chunk text max=$max overlap=$overlap $label', _join(expected), _join(chunkText(text, max, overlap: overlap)));
  }
  c.throws<RangeError>("chunk text invalid max=0 overlap=0", () => chunkText('x', 0, overlap: 0));
  c.throws<RangeError>("chunk text invalid max=5 overlap=5", () => chunkText('x', 5, overlap: 5));
  c.throws<RangeError>("chunk text invalid max=5 overlap=-1", () => chunkText('x', 5, overlap: -1));
  c.throws<RangeError>("chunk text invalid max=-3 overlap=0", () => chunkText('x', -3, overlap: 0));
}

void runVectorMathTests(Checks c) {
  _near(c, "vector dot 0", 32, dot(<double>[1, 2, 3], <double>[4, 5, 6]));
  _near(c, "vector cosine 0", 0.9746318461970762, cosine(<double>[1, 2, 3], <double>[4, 5, 6]));
  _near(c, "vector dot 1", 0, dot(<double>[1, 0], <double>[0, 1]));
  _near(c, "vector cosine 1", 0.0, cosine(<double>[1, 0], <double>[0, 1]));
  _near(c, "vector dot 2", -2, dot(<double>[1, 1], <double>[-1, -1]));
  _near(c, "vector cosine 2", -0.9999999999999998, cosine(<double>[1, 1], <double>[-1, -1]));
  _near(c, "vector dot 3", 0, dot(<double>[0, 0], <double>[1, 2]));
  _near(c, "vector cosine 3", 0.0, cosine(<double>[0, 0], <double>[1, 2]));
  _near(c, "vector dot 4", 25, dot(<double>[3, 4], <double>[3, 4]));
  _near(c, "vector cosine 4", 1.0, cosine(<double>[3, 4], <double>[3, 4]));
  _near(c, "vector dot 5", -1.375, dot(<double>[0.5, -1.5, 2], <double>[2, 0.25, -1]));
  _near(c, "vector cosine 5", -0.23969749850222494, cosine(<double>[0.5, -1.5, 2], <double>[2, 0.25, -1]));
  _near(c, "vector norm 0", 5.0, norm(<double>[3, 4]));
  _near(c, "vector norm 1", 0.0, norm(<double>[0, 0, 0]));
  _near(c, "vector norm 2", 2.0, norm(<double>[1, 1, 1, 1]));
  _near(c, "vector norm 3", 2.5, norm(<double>[-2.5]));
  {
    final n = normalize(<double>[3, 4]), e = <double>[0.6, 0.8];
    c.check("vector normalize 0", n.length == e.length && [for (var i = 0; i < n.length; i++) (n[i] - e[i]).abs() <= 1e-9].every((x) => x));
  }
  {
    final n = normalize(<double>[0, 5]), e = <double>[0.0, 1.0];
    c.check("vector normalize 1", n.length == e.length && [for (var i = 0; i < n.length; i++) (n[i] - e[i]).abs() <= 1e-9].every((x) => x));
  }
  {
    final n = normalize(<double>[1, 1, 1, 1]), e = <double>[0.5, 0.5, 0.5, 0.5];
    c.check("vector normalize 2", n.length == e.length && [for (var i = 0; i < n.length; i++) (n[i] - e[i]).abs() <= 1e-9].every((x) => x));
  }
  {
    final r = topK(<double>[1, 0], <List<double>>[<double>[1, 0], <double>[0.99, 0.1], <double>[0, 1], <double>[0.7, 0.7], <double>[-1, 0]], 0);
    const e = <(int, double)>[];
    c.check("vector topK 0", r.length == e.length && [for (var i = 0; i < r.length; i++) r[i].$1 == e[i].$1 && (r[i].$2 - e[i].$2).abs() <= 1e-9].every((x) => x));
  }
  {
    final r = topK(<double>[1, 0], <List<double>>[<double>[1, 0], <double>[0.99, 0.1], <double>[0, 1], <double>[0.7, 0.7], <double>[-1, 0]], 1);
    const e = <(int, double)>[(0, 1.0)];
    c.check("vector topK 1", r.length == e.length && [for (var i = 0; i < r.length; i++) r[i].$1 == e[i].$1 && (r[i].$2 - e[i].$2).abs() <= 1e-9].every((x) => x));
  }
  {
    final r = topK(<double>[1, 0], <List<double>>[<double>[1, 0], <double>[0.99, 0.1], <double>[0, 1], <double>[0.7, 0.7], <double>[-1, 0]], 3);
    const e = <(int, double)>[(0, 1.0), (1, 0.9949371890224981), (3, 0.7071067811865476)];
    c.check("vector topK 2", r.length == e.length && [for (var i = 0; i < r.length; i++) r[i].$1 == e[i].$1 && (r[i].$2 - e[i].$2).abs() <= 1e-9].every((x) => x));
  }
  {
    final r = topK(<double>[1, 0], <List<double>>[<double>[1, 0], <double>[0.99, 0.1], <double>[0, 1], <double>[0.7, 0.7], <double>[-1, 0]], 10);
    const e = <(int, double)>[(0, 1.0), (1, 0.9949371890224981), (3, 0.7071067811865476), (2, 0.0), (4, -1.0)];
    c.check("vector topK 3", r.length == e.length && [for (var i = 0; i < r.length; i++) r[i].$1 == e[i].$1 && (r[i].$2 - e[i].$2).abs() <= 1e-9].every((x) => x));
  }
  {
    final r = topK(<double>[0.2, 0.5, 0.1], <List<double>>[<double>[0.1, 0.4, 0.2], <double>[0.9, 0.1, 0.0], <double>[0.2, 0.5, 0.1], <double>[0.0, 0.0, 1.0], <double>[0.3, 0.3, 0.3], <double>[0.21, 0.49, 0.12]], 3);
    const e = <(int, double)>[(2, 1.0), (5, 0.9990003934498585), (0, 0.956182887467515)];
    c.check("vector topK 4", r.length == e.length && [for (var i = 0; i < r.length; i++) r[i].$1 == e[i].$1 && (r[i].$2 - e[i].$2).abs() <= 1e-9].every((x) => x));
  }
  c.eq("vector mmr 0", "0,1,4", mmr(<double>[1, 0], <List<double>>[<double>[1, 0], <double>[0.99, 0.1], <double>[0, 1], <double>[0.7, 0.7], <double>[-1, 0]], 3, lambda: 0.5).join(","));
  c.eq("vector mmr 1", "0,1,3", mmr(<double>[1, 0], <List<double>>[<double>[1, 0], <double>[0.99, 0.1], <double>[0, 1], <double>[0.7, 0.7], <double>[-1, 0]], 3, lambda: 1.0).join(","));
  c.eq("vector mmr 2", "0,4,2", mmr(<double>[1, 0], <List<double>>[<double>[1, 0], <double>[0.99, 0.1], <double>[0, 1], <double>[0.7, 0.7], <double>[-1, 0]], 3, lambda: 0.0).join(","));
  c.eq("vector mmr 3", "0,1,3,2,4", mmr(<double>[1, 0], <List<double>>[<double>[1, 0], <double>[0.99, 0.1], <double>[0, 1], <double>[0.7, 0.7], <double>[-1, 0]], 5, lambda: 0.7).join(","));
  c.eq("vector mmr 4", "2,0,1", mmr(<double>[0.2, 0.5, 0.1], <List<double>>[<double>[0.1, 0.4, 0.2], <double>[0.9, 0.1, 0.0], <double>[0.2, 0.5, 0.1], <double>[0.0, 0.0, 1.0], <double>[0.3, 0.3, 0.3], <double>[0.21, 0.49, 0.12]], 3, lambda: 0.5).join(","));
  c.eq("vector mmr 5", "2,3,1,4", mmr(<double>[0.2, 0.5, 0.1], <List<double>>[<double>[0.1, 0.4, 0.2], <double>[0.9, 0.1, 0.0], <double>[0.2, 0.5, 0.1], <double>[0.0, 0.0, 1.0], <double>[0.3, 0.3, 0.3], <double>[0.21, 0.49, 0.12]], 4, lambda: 0.3).join(","));
  // invalid: length mismatch: cosine([1,2],[1,2,3]); empty: dot([],[]); normalize([0,0]); top_k k=-1; mmr lambda=1.5
  c.throws<ArgumentError>('vector invalid length mismatch', () => cosine([1, 2], [1, 2, 3]));
  c.throws<ArgumentError>('vector invalid empty', () => dot([], []));
  c.throws<ArgumentError>('vector invalid normalize zero', () => normalize([0, 0]));
  c.throws<RangeError>('vector invalid topK k=-1', () => topK([1, 0], [[1, 0]], -1));
  c.throws<RangeError>('vector invalid mmr lambda=1.5', () => mmr([1, 0], [[1, 0]], 1, lambda: 1.5));
}

void runCircuitBreakerTests(Checks c) {
  {
    final cb = CircuitBreaker(failureThreshold: 2, cooldownMs: 1000, halfOpenMax: 1);
    c.eq("breaker 0.0 allow@0", true, cb.allow(0));
    cb.recordFailure(0);
    c.eq("breaker 0.2 state@0", 'closed', cb.state(0));
    cb.recordFailure(10);
    c.eq("breaker 0.4 state@10", 'open', cb.state(10));
    c.eq("breaker 0.5 allow@500", false, cb.allow(500));
    c.eq("breaker 0.6 retry_after@500", 510, cb.retryAfterMs(500));
    c.eq("breaker 0.7 state@1010", 'half_open', cb.state(1010));
    c.eq("breaker 0.8 allow@1010", true, cb.allow(1010));
    c.eq("breaker 0.9 allow@1011", false, cb.allow(1011));
    cb.recordSuccess(1020);
    c.eq("breaker 0.11 state@1020", 'closed', cb.state(1020));
    c.eq("breaker 0.12 allow@1021", true, cb.allow(1021));
  }
  {
    final cb = CircuitBreaker(failureThreshold: 3, cooldownMs: 500, halfOpenMax: 2);
    cb.recordFailure(0);
    cb.recordSuccess(1);
    cb.recordFailure(2);
    cb.recordFailure(3);
    c.eq("breaker 1.4 state@3", 'closed', cb.state(3));
    cb.recordFailure(4);
    c.eq("breaker 1.6 state@4", 'open', cb.state(4));
    c.eq("breaker 1.7 state@503", 'open', cb.state(503));
    c.eq("breaker 1.8 allow@504", true, cb.allow(504));
    c.eq("breaker 1.9 allow@505", true, cb.allow(505));
    c.eq("breaker 1.10 allow@506", false, cb.allow(506));
    cb.recordFailure(507);
    c.eq("breaker 1.12 state@507", 'open', cb.state(507));
    c.eq("breaker 1.13 retry_after@600", 407, cb.retryAfterMs(600));
    c.eq("breaker 1.14 state@1007", 'half_open', cb.state(1007));
    c.eq("breaker 1.15 allow@1008", true, cb.allow(1008));
    cb.recordSuccess(1009);
    c.eq("breaker 1.17 state@1009", 'closed', cb.state(1009));
  }
  {
    final cb = CircuitBreaker(failureThreshold: 1, cooldownMs: 0, halfOpenMax: 1);
    cb.recordFailure(5);
    c.eq("breaker 2.1 state@5", 'half_open', cb.state(5));
    c.eq("breaker 2.2 allow@5", true, cb.allow(5));
    c.eq("breaker 2.3 allow@5", false, cb.allow(5));
    cb.recordFailure(6);
    c.eq("breaker 2.5 state@6", 'half_open', cb.state(6));
    c.eq("breaker 2.6 allow@6", true, cb.allow(6));
  }
  c.throws<RangeError>("breaker invalid 0,1000,1", () => CircuitBreaker(failureThreshold: 0, cooldownMs: 1000, halfOpenMax: 1));
  c.throws<RangeError>("breaker invalid 1,-1,1", () => CircuitBreaker(failureThreshold: 1, cooldownMs: -1, halfOpenMax: 1));
  c.throws<RangeError>("breaker invalid 1,1000,0", () => CircuitBreaker(failureThreshold: 1, cooldownMs: 1000, halfOpenMax: 0));
}

void runBusinessDaysTests(Checks c) {
  c.eq("business is 2026-10-10 SA/SU", false, isBusinessDay('2026-10-10', holidays: <String>[], weekend: <String>['SA', 'SU']));
  c.eq("business is 2026-10-12 SA/SU", true, isBusinessDay('2026-10-12', holidays: <String>[], weekend: <String>['SA', 'SU']));
  c.eq("business is 2026-12-25 SA/SU", false, isBusinessDay('2026-12-25', holidays: <String>['2026-12-25', '2026-12-28', '2027-01-01'], weekend: <String>['SA', 'SU']));
  c.eq("business is 2026-10-16 FR/SA", false, isBusinessDay('2026-10-16', holidays: <String>[], weekend: <String>['FR', 'SA']));
  c.eq("business add 2026-10-09 1 SA/SU", '2026-10-12', addBusinessDays('2026-10-09', 1, holidays: <String>[], weekend: <String>['SA', 'SU']));
  c.eq("business add 2026-10-12 -1 SA/SU", '2026-10-09', addBusinessDays('2026-10-12', -1, holidays: <String>[], weekend: <String>['SA', 'SU']));
  c.eq("business add 2026-10-10 0 SA/SU", '2026-10-12', addBusinessDays('2026-10-10', 0, holidays: <String>[], weekend: <String>['SA', 'SU']));
  c.eq("business add 2026-10-12 0 SA/SU", '2026-10-12', addBusinessDays('2026-10-12', 0, holidays: <String>[], weekend: <String>['SA', 'SU']));
  c.eq("business add 2026-12-23 3 SA/SU", '2026-12-30', addBusinessDays('2026-12-23', 3, holidays: <String>['2026-12-25', '2026-12-28', '2027-01-01'], weekend: <String>['SA', 'SU']));
  c.eq("business add 2026-12-31 -5 SA/SU", '2026-12-22', addBusinessDays('2026-12-31', -5, holidays: <String>['2026-12-25', '2026-12-28', '2027-01-01'], weekend: <String>['SA', 'SU']));
  c.eq("business add 2028-02-28 1 SA/SU", '2028-02-29', addBusinessDays('2028-02-28', 1, holidays: <String>[], weekend: <String>['SA', 'SU']));
  c.eq("business add 2026-10-14 10 FR/SA", '2026-10-28', addBusinessDays('2026-10-14', 10, holidays: <String>[], weekend: <String>['FR', 'SA']));
  c.eq("business add 2026-01-01 260 SA/SU", '2026-12-31', addBusinessDays('2026-01-01', 260, holidays: <String>[], weekend: <String>['SA', 'SU']));
  c.eq("business add 2026-10-11 0 ", '2026-10-11', addBusinessDays('2026-10-11', 0, holidays: <String>[], weekend: <String>[]));
  c.eq("business between 2026-10-01 2026-11-01 SA/SU", 21, businessDaysBetween('2026-10-01', '2026-11-01', holidays: <String>['2026-10-12'], weekend: <String>['SA', 'SU']));
  c.eq("business between 2026-11-01 2026-10-01 SA/SU", -22, businessDaysBetween('2026-11-01', '2026-10-01', holidays: <String>[], weekend: <String>['SA', 'SU']));
  c.eq("business between 2026-10-12 2026-10-12 SA/SU", 0, businessDaysBetween('2026-10-12', '2026-10-12', holidays: <String>[], weekend: <String>['SA', 'SU']));
  c.eq("business between 2026-12-21 2027-01-04 SA/SU", 7, businessDaysBetween('2026-12-21', '2027-01-04', holidays: <String>['2026-12-25', '2026-12-28', '2027-01-01'], weekend: <String>['SA', 'SU']));
  c.eq("business between 2026-01-01 2027-01-01 SA/SU", 261, businessDaysBetween('2026-01-01', '2027-01-01', holidays: <String>[], weekend: <String>['SA', 'SU']));
  c.eq("business between 2026-10-01 2026-10-31 FR/SA", 21, businessDaysBetween('2026-10-01', '2026-10-31', holidays: <String>[], weekend: <String>['FR', 'SA']));
  c.eq("business between 2026-10-10 2026-10-12 SA/SU", 0, businessDaysBetween('2026-10-10', '2026-10-12', holidays: <String>['2026-10-11'], weekend: <String>['SA', 'SU']));
  c.throws<FormatException>("business invalid 2026-02-30 1", () => addBusinessDays('2026-02-30', 1));
  c.throws<FormatException>("business invalid 2026-1-01 1", () => addBusinessDays('2026-1-01', 1));
  c.throws<RangeError>("business invalid 2026-01-01 100001", () => addBusinessDays('2026-01-01', 100001));
  c.eq('business default weekend', false, isBusinessDay('2026-10-10'));
  c.throws<ArgumentError>('business all-week weekend', () => isBusinessDay('2026-10-10', weekend: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']));
  c.throws<ArgumentError>('business bad weekend day', () => isBusinessDay('2026-10-10', weekend: ['XX']));
}

void runNaturalSortTests(Checks c) {
  c.eq("natural sort 0", _join(<String>['', '9', '10', 'A', 'a', 'b', 'file1', 'File1.txt', 'file1.txt', 'file01.txt', 'file2.txt', 'file10.txt', 'x02y1', 'x2y9', 'x2y10']), _join(naturalSort(<String>['file10.txt', 'file2.txt', 'File1.txt', 'file1.txt', 'file01.txt', 'a', 'A', 'b', '10', '9', 'x2y10', 'x2y9', 'x02y1', '', 'file1'])));
  c.eq("natural sort 1", _join(<String>['v1.2.0', 'v1.2.10', 'v1.9.9', 'v1.10.0', 'v10.0']), _join(naturalSort(<String>['v1.10.0', 'v1.2.0', 'v1.9.9', 'v10.0', 'v1.2.10'])));
  c.eq("natural sort 2", _join(<String>['img1.png', 'IMG2.png', 'img10.png', 'img12.png']), _join(naturalSort(<String>['img12.png', 'img10.png', 'IMG2.png', 'img1.png'])));
  c.eq("natural sort 3", _join(<String>['a', 'a0', 'a00', 'a000', 'a1', 'a01']), _join(naturalSort(<String>['a0', 'a00', 'a000', 'a', 'a1', 'a01'])));
  c.eq("natural sort 4", _join(<String>['1x', '_x', 'a', 'Z', 'z', '\u{C4}']), _join(naturalSort(<String>['\u{C4}', 'Z', 'a', 'z', '_x', '1x'])));
  c.eq('natural compare a2 a10', -1, naturalCompare('a2', 'a10'));
  c.eq('natural compare reversed a2 a10', 1, naturalCompare('a10', 'a2'));
  c.eq('natural compare a10 a2', 1, naturalCompare('a10', 'a2'));
  c.eq('natural compare reversed a10 a2', -1, naturalCompare('a2', 'a10'));
  c.eq('natural compare abc ABC', 1, naturalCompare('abc', 'ABC'));
  c.eq('natural compare reversed abc ABC', -1, naturalCompare('ABC', 'abc'));
  c.eq('natural compare x01 x1', 1, naturalCompare('x01', 'x1'));
  c.eq('natural compare reversed x01 x1', -1, naturalCompare('x1', 'x01'));
  c.eq('natural compare x1 x1', 0, naturalCompare('x1', 'x1'));
  c.eq('natural compare reversed x1 x1', 0, naturalCompare('x1', 'x1'));
  c.eq('natural compare  a', -1, naturalCompare('', 'a'));
  c.eq('natural compare reversed  a', 1, naturalCompare('a', ''));
  c.eq('natural compare a 1', 1, naturalCompare('a', '1'));
  c.eq('natural compare reversed a 1', -1, naturalCompare('1', 'a'));
  c.eq('natural compare 99999999999999999999 100000000000000000000', -1, naturalCompare('99999999999999999999', '100000000000000000000'));
  c.eq('natural compare reversed 99999999999999999999 100000000000000000000', 1, naturalCompare('100000000000000000000', '99999999999999999999'));
  c.eq('natural compare astral by code point', -1, naturalCompare('\u{FF5E}', '\u{1F600}'));
}

void runFileSignatureTests(Checks c) {
  c.eq('file signature detect png', ('image/png', 'png'), detectFileType(_hex('89504e470d0a1a0a0000000d49484452')));
  c.eq('file signature detect jpg', ('image/jpeg', 'jpg'), detectFileType(_hex('ffd8ffe000104a464946')));
  c.eq('file signature detect gif', ('image/gif', 'gif'), detectFileType(_hex('4749463839610100')));
  c.eq('file signature detect webp', ('image/webp', 'webp'), detectFileType(_hex('52494646240000005745425056503820')));
  c.eq('file signature detect wav', ('audio/wav', 'wav'), detectFileType(_hex('524946462400000057415645666d7420')));
  c.eq('file signature detect avi', ('video/x-msvideo', 'avi'), detectFileType(_hex('5249464624000000415649204c495354')));
  c.eq('file signature detect bmp', ('image/bmp', 'bmp'), detectFileType(_hex('424d0000000000000000000000000000')));
  c.eq('file signature detect ico', ('image/x-icon', 'ico'), detectFileType(_hex('000001000100')));
  c.eq('file signature detect tif', ('image/tiff', 'tif'), detectFileType(_hex('49492a000800')));
  c.eq('file signature detect tif-be', ('image/tiff', 'tif'), detectFileType(_hex('4d4d002a0008')));
  c.eq('file signature detect pdf', ('application/pdf', 'pdf'), detectFileType(_hex('255044462d312e370a')));
  c.eq('file signature detect zip', ('application/zip', 'zip'), detectFileType(_hex('504b03041400')));
  c.eq('file signature detect zip-empty', ('application/zip', 'zip'), detectFileType(_hex('504b0506000000000000000000000000000000000000')));
  c.eq('file signature detect gz', ('application/gzip', 'gz'), detectFileType(_hex('1f8b0800')));
  c.eq('file signature detect 7z', ('application/x-7z-compressed', '7z'), detectFileType(_hex('377abcaf271c0004')));
  c.eq('file signature detect rar', ('application/vnd.rar', 'rar'), detectFileType(_hex('526172211a070100')));
  c.eq('file signature detect sqlite', ('application/vnd.sqlite3', 'sqlite'), detectFileType(_hex('53514c69746520666f726d61742033001000')));
  c.eq('file signature detect wasm', ('application/wasm', 'wasm'), detectFileType(_hex('0061736d01000000')));
  c.eq('file signature detect ogg', ('audio/ogg', 'ogg'), detectFileType(_hex('4f6767530002')));
  c.eq('file signature detect flac', ('audio/flac', 'flac'), detectFileType(_hex('664c614300000022')));
  c.eq('file signature detect mp3-id3', ('audio/mpeg', 'mp3'), detectFileType(_hex('494433040000')));
  c.eq('file signature detect mp3-frame', ('audio/mpeg', 'mp3'), detectFileType(_hex('fffb9064')));
  c.eq('file signature detect webm', ('video/webm', 'webm'), detectFileType(_hex('1a45dfa39f4286')));
  c.eq('file signature detect mp4', ('video/mp4', 'mp4'), detectFileType(_hex('000000206674797069736f6d00000200')));
  c.eq('file signature detect mov', ('video/quicktime', 'mov'), detectFileType(_hex('00000014667479707174202000000000')));
  c.eq('file signature detect heic', ('image/heic', 'heic'), detectFileType(_hex('00000018667479706865696300000000')));
  c.eq('file signature detect avif', ('image/avif', 'avif'), detectFileType(_hex('0000001c667479706176696600000000')));
  c.eq('file signature detect m4a', ('audio/mp4', 'm4a'), detectFileType(_hex('00000020667479704d34412000000000')));
  c.eq('file signature detect woff', ('font/woff', 'woff'), detectFileType(_hex('774f464600010000')));
  c.eq('file signature detect woff2', ('font/woff2', 'woff2'), detectFileType(_hex('774f463200010000')));
  c.eq('file signature detect text', null, detectFileType(_hex('68656c6c6f20776f726c64')));
  c.eq('file signature detect empty', null, detectFileType(_hex('')));
  c.eq('file signature detect short-png', null, detectFileType(_hex('89504e47')));
  c.eq('file signature detect bm-short', null, detectFileType(_hex('424d0000')));
  c.eq('file signature detect ff-not-mp3', null, detectFileType(_hex('ffe10000')));
  c.eq('file signature detect html', null, detectFileType(_hex('3c21444f43545950452068746d6c3e')));
  c.eq('file signature extension a.png 89504e47', true, matchesExtension(_hex('89504e470d0a1a0a0000000d49484452'), 'a.png'));
  c.eq('file signature extension a.PNG 89504e47', true, matchesExtension(_hex('89504e470d0a1a0a0000000d49484452'), 'a.PNG'));
  c.eq('file signature extension a.jpg 89504e47', false, matchesExtension(_hex('89504e470d0a1a0a0000000d49484452'), 'a.jpg'));
  c.eq('file signature extension photo.jpeg ffd8ffe0', true, matchesExtension(_hex('ffd8ffe000104a464946'), 'photo.jpeg'));
  c.eq('file signature extension report.docx 504b0304', true, matchesExtension(_hex('504b03041400'), 'report.docx'));
  c.eq('file signature extension x.xlsx 504b0304', true, matchesExtension(_hex('504b03041400'), 'x.xlsx'));
  c.eq('file signature extension x.pdf.exe 25504446', false, matchesExtension(_hex('255044462d312e370a'), 'x.pdf.exe'));
  c.eq('file signature extension IMG_1.HEIF 00000018', true, matchesExtension(_hex('00000018667479706865696300000000'), 'IMG_1.HEIF'));
  c.eq('file signature extension a.txt 68656c6c', false, matchesExtension(_hex('68656c6c6f20776f726c64'), 'a.txt'));
  c.eq('file signature extension noext 89504e47', false, matchesExtension(_hex('89504e470d0a1a0a0000000d49484452'), 'noext'));
  c.eq('file signature extension scan.tiff 49492a00', true, matchesExtension(_hex('49492a000800'), 'scan.tiff'));
  c.eq('file signature extension song.mp3 49443304', true, matchesExtension(_hex('494433040000'), 'song.mp3'));
  c.eq('file signature extension a.tar.gz 1f8b0800', true, matchesExtension(_hex('1f8b0800'), 'a.tar.gz'));
}

void runColorConvertTests(Checks c) {
  {
    final (r, g, b, a) = parseHex('#000');
    _near(c, "color parse #000 r", 0.0, r, 1e-6);
    _near(c, "color parse #000 g", 0.0, g, 1e-6);
    _near(c, "color parse #000 b", 0.0, b, 1e-6);
    _near(c, "color parse #000 a", 1.0, a, 1e-6);
    c.eq("color hex round trip #000", '#000000', toHex(r, g, b, a));
  }
  {
    final (r, g, b, a) = parseHex('#fff');
    _near(c, "color parse #fff r", 1.0, r, 1e-6);
    _near(c, "color parse #fff g", 1.0, g, 1e-6);
    _near(c, "color parse #fff b", 1.0, b, 1e-6);
    _near(c, "color parse #fff a", 1.0, a, 1e-6);
    c.eq("color hex round trip #fff", '#ffffff', toHex(r, g, b, a));
  }
  {
    final (r, g, b, a) = parseHex('#f00');
    _near(c, "color parse #f00 r", 1.0, r, 1e-6);
    _near(c, "color parse #f00 g", 0.0, g, 1e-6);
    _near(c, "color parse #f00 b", 0.0, b, 1e-6);
    _near(c, "color parse #f00 a", 1.0, a, 1e-6);
    c.eq("color hex round trip #f00", '#ff0000', toHex(r, g, b, a));
  }
  {
    final (r, g, b, a) = parseHex('#0f8');
    _near(c, "color parse #0f8 r", 0.0, r, 1e-6);
    _near(c, "color parse #0f8 g", 1.0, g, 1e-6);
    _near(c, "color parse #0f8 b", 0.5333333333333333, b, 1e-6);
    _near(c, "color parse #0f8 a", 1.0, a, 1e-6);
    c.eq("color hex round trip #0f8", '#00ff88', toHex(r, g, b, a));
  }
  {
    final (r, g, b, a) = parseHex('#336699');
    _near(c, "color parse #336699 r", 0.2, r, 1e-6);
    _near(c, "color parse #336699 g", 0.4, g, 1e-6);
    _near(c, "color parse #336699 b", 0.6, b, 1e-6);
    _near(c, "color parse #336699 a", 1.0, a, 1e-6);
    c.eq("color hex round trip #336699", '#336699', toHex(r, g, b, a));
  }
  {
    final (r, g, b, a) = parseHex('#336699cc');
    _near(c, "color parse #336699cc r", 0.2, r, 1e-6);
    _near(c, "color parse #336699cc g", 0.4, g, 1e-6);
    _near(c, "color parse #336699cc b", 0.6, b, 1e-6);
    _near(c, "color parse #336699cc a", 0.8, a, 1e-6);
    c.eq("color hex round trip #336699cc", '#336699cc', toHex(r, g, b, a));
  }
  {
    final (r, g, b, a) = parseHex('#ABCDEF');
    _near(c, "color parse #ABCDEF r", 0.6705882352941176, r, 1e-6);
    _near(c, "color parse #ABCDEF g", 0.803921568627451, g, 1e-6);
    _near(c, "color parse #ABCDEF b", 0.9372549019607843, b, 1e-6);
    _near(c, "color parse #ABCDEF a", 1.0, a, 1e-6);
    c.eq("color hex round trip #ABCDEF", '#abcdef', toHex(r, g, b, a));
  }
  {
    final (r, g, b, a) = parseHex('#12345678');
    _near(c, "color parse #12345678 r", 0.07058823529411765, r, 1e-6);
    _near(c, "color parse #12345678 g", 0.20392156862745098, g, 1e-6);
    _near(c, "color parse #12345678 b", 0.33725490196078434, b, 1e-6);
    _near(c, "color parse #12345678 a", 0.47058823529411764, a, 1e-6);
    c.eq("color hex round trip #12345678", '#12345678', toHex(r, g, b, a));
  }
  {
    final (r, g, b, a) = parseHex('#7f7f7f');
    _near(c, "color parse #7f7f7f r", 0.4980392156862745, r, 1e-6);
    _near(c, "color parse #7f7f7f g", 0.4980392156862745, g, 1e-6);
    _near(c, "color parse #7f7f7f b", 0.4980392156862745, b, 1e-6);
    _near(c, "color parse #7f7f7f a", 1.0, a, 1e-6);
    c.eq("color hex round trip #7f7f7f", '#7f7f7f', toHex(r, g, b, a));
  }
  {
    final (r, g, b, a) = parseHex('#808080');
    _near(c, "color parse #808080 r", 0.5019607843137255, r, 1e-6);
    _near(c, "color parse #808080 g", 0.5019607843137255, g, 1e-6);
    _near(c, "color parse #808080 b", 0.5019607843137255, b, 1e-6);
    _near(c, "color parse #808080 a", 1.0, a, 1e-6);
    c.eq("color hex round trip #808080", '#808080', toHex(r, g, b, a));
  }
  c.throws<FormatException>('color hex invalid 336699', () => parseHex('336699'));
  c.throws<FormatException>('color hex invalid #12', () => parseHex('#12'));
  c.throws<FormatException>('color hex invalid #12345', () => parseHex('#12345'));
  c.throws<FormatException>('color hex invalid #1234567', () => parseHex('#1234567'));
  c.throws<FormatException>('color hex invalid #ggg', () => parseHex('#ggg'));
  c.throws<FormatException>('color hex invalid #', () => parseHex('#'));
  c.throws<FormatException>('color hex invalid rgb(1,2,3)', () => parseHex('rgb(1,2,3)'));
  c.throws<FormatException>('color hex invalid #3366999', () => parseHex('#3366999'));
  c.eq("color toHex 0.5/0.5/0.5", '#808080', toHex(0.5, 0.5, 0.5));
  c.eq("color toHex 1.2/-0.1/0.5", '#ff0080', toHex(1.2, -0.1, 0.5));
  c.eq("color toHex 0.001/0.999/0.5", '#00ff80', toHex(0.001, 0.999, 0.5));
  c.eq("color toHex 0.2/0.4/0.6/0.5", '#33669980', toHex(0.2, 0.4, 0.6, 0.5));
  c.eq("color toHex 0.2/0.4/0.6/1.0", '#336699', toHex(0.2, 0.4, 0.6, 1.0));
  c.eq("color toHex 0.00196078431372549/0.0058823529411764705/0.00980392156862745", '#010203', toHex(0.00196078431372549, 0.0058823529411764705, 0.00980392156862745));
  {
    final (r, g, b, _) = parseHex('#000');
    final (h, s, l) = rgbToHsl(r, g, b);
    _near(c, "color hsl #000 h", 0.0, h, 1e-6);
    _near(c, "color hsl #000 s", 0.0, s, 1e-6);
    _near(c, "color hsl #000 l", 0.0, l, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#fff');
    final (h, s, l) = rgbToHsl(r, g, b);
    _near(c, "color hsl #fff h", 0.0, h, 1e-6);
    _near(c, "color hsl #fff s", 0.0, s, 1e-6);
    _near(c, "color hsl #fff l", 1.0, l, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#f00');
    final (h, s, l) = rgbToHsl(r, g, b);
    _near(c, "color hsl #f00 h", 0.0, h, 1e-6);
    _near(c, "color hsl #f00 s", 1.0, s, 1e-6);
    _near(c, "color hsl #f00 l", 0.5, l, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#0f0');
    final (h, s, l) = rgbToHsl(r, g, b);
    _near(c, "color hsl #0f0 h", 120.0, h, 1e-6);
    _near(c, "color hsl #0f0 s", 1.0, s, 1e-6);
    _near(c, "color hsl #0f0 l", 0.5, l, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#00f');
    final (h, s, l) = rgbToHsl(r, g, b);
    _near(c, "color hsl #00f h", 240.0, h, 1e-6);
    _near(c, "color hsl #00f s", 1.0, s, 1e-6);
    _near(c, "color hsl #00f l", 0.5, l, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#336699');
    final (h, s, l) = rgbToHsl(r, g, b);
    _near(c, "color hsl #336699 h", 210.0, h, 1e-6);
    _near(c, "color hsl #336699 s", 0.49999999999999994, s, 1e-6);
    _near(c, "color hsl #336699 l", 0.4, l, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#ff8000');
    final (h, s, l) = rgbToHsl(r, g, b);
    _near(c, "color hsl #ff8000 h", 30.11764705882353, h, 1e-6);
    _near(c, "color hsl #ff8000 s", 1.0, s, 1e-6);
    _near(c, "color hsl #ff8000 l", 0.5, l, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#808080');
    final (h, s, l) = rgbToHsl(r, g, b);
    _near(c, "color hsl #808080 h", 0.0, h, 1e-6);
    _near(c, "color hsl #808080 s", 0.0, s, 1e-6);
    _near(c, "color hsl #808080 l", 0.5019607843137255, l, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#c0ffee');
    final (h, s, l) = rgbToHsl(r, g, b);
    _near(c, "color hsl #c0ffee h", 163.80952380952382, h, 1e-6);
    _near(c, "color hsl #c0ffee s", 1.0, s, 1e-6);
    _near(c, "color hsl #c0ffee l", 0.8764705882352941, l, 1e-6);
  }
  {
    final (r, g, b) = hslToRgb(0.0, 1.0, 0.5);
    _near(c, "color hslToRgb 0 r", 1.0, r, 1e-6);
    _near(c, "color hslToRgb 0 g", 0.0, g, 1e-6);
    _near(c, "color hslToRgb 0 b", 0.0, b, 1e-6);
  }
  {
    final (r, g, b) = hslToRgb(120.0, 1.0, 0.5);
    _near(c, "color hslToRgb 120 r", 0.0, r, 1e-6);
    _near(c, "color hslToRgb 120 g", 1.0, g, 1e-6);
    _near(c, "color hslToRgb 120 b", 0.0, b, 1e-6);
  }
  {
    final (r, g, b) = hslToRgb(240.0, 1.0, 0.5);
    _near(c, "color hslToRgb 240 r", 0.0, r, 1e-6);
    _near(c, "color hslToRgb 240 g", 0.0, g, 1e-6);
    _near(c, "color hslToRgb 240 b", 1.0, b, 1e-6);
  }
  {
    final (r, g, b) = hslToRgb(210.0, 0.5, 0.4);
    _near(c, "color hslToRgb 210 r", 0.2, r, 1e-6);
    _near(c, "color hslToRgb 210 g", 0.4, g, 1e-6);
    _near(c, "color hslToRgb 210 b", 0.6000000000000001, b, 1e-6);
  }
  {
    final (r, g, b) = hslToRgb(360.0, 1.0, 0.5);
    _near(c, "color hslToRgb 360 r", 1.0, r, 1e-6);
    _near(c, "color hslToRgb 360 g", 0.0, g, 1e-6);
    _near(c, "color hslToRgb 360 b", 0.0, b, 1e-6);
  }
  {
    final (r, g, b) = hslToRgb(-30.0, 1.0, 0.5);
    _near(c, "color hslToRgb -30 r", 1.0, r, 1e-6);
    _near(c, "color hslToRgb -30 g", 0.0, g, 1e-6);
    _near(c, "color hslToRgb -30 b", 0.5, b, 1e-6);
  }
  {
    final (r, g, b) = hslToRgb(90.0, 0.0, 0.3);
    _near(c, "color hslToRgb 90 r", 0.3, r, 1e-6);
    _near(c, "color hslToRgb 90 g", 0.3, g, 1e-6);
    _near(c, "color hslToRgb 90 b", 0.3, b, 1e-6);
  }
  {
    final (r, g, b) = hslToRgb(30.0, 1.0, 0.75);
    _near(c, "color hslToRgb 30 r", 1.0, r, 1e-6);
    _near(c, "color hslToRgb 30 g", 0.75, g, 1e-6);
    _near(c, "color hslToRgb 30 b", 0.5, b, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#000');
    final (l, ch, h) = rgbToOklch(r, g, b);
    _near(c, "color oklch #000 L", 0.0, l, 1e-6);
    _near(c, "color oklch #000 C", 0.0, ch, 1e-6);
    _near(c, "color oklch #000 h", 0.0, h, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#fff');
    final (l, ch, h) = rgbToOklch(r, g, b);
    _near(c, "color oklch #fff L", 0.9999999934735462, l, 1e-6);
    _near(c, "color oklch #fff C", 3.727399553519285e-08, ch, 1e-6);
    _near(c, "color oklch #fff h", 0.0, h, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#f00');
    final (l, ch, h) = rgbToOklch(r, g, b);
    _near(c, "color oklch #f00 L", 0.6279553606145516, l, 1e-6);
    _near(c, "color oklch #f00 C", 0.2576833077361567, ch, 1e-6);
    _near(c, "color oklch #f00 h", 29.233885192342633, h, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#0f0');
    final (l, ch, h) = rgbToOklch(r, g, b);
    _near(c, "color oklch #0f0 L", 0.8664396115356694, l, 1e-6);
    _near(c, "color oklch #0f0 C", 0.2948272403370166, ch, 1e-6);
    _near(c, "color oklch #0f0 h", 142.49533888780996, h, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#00f');
    final (l, ch, h) = rgbToOklch(r, g, b);
    _near(c, "color oklch #00f L", 0.4520137183853429, l, 1e-6);
    _near(c, "color oklch #00f C", 0.31321437166460114, ch, 1e-6);
    _near(c, "color oklch #00f h", 264.052020638055, h, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#336699');
    final (l, ch, h) = rgbToOklch(r, g, b);
    _near(c, "color oklch #336699 L", 0.49931445292373877, l, 1e-6);
    _near(c, "color oklch #336699 C", 0.09866435965710138, ch, 1e-6);
    _near(c, "color oklch #336699 h", 250.43305370947127, h, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#808080');
    final (l, ch, h) = rgbToOklch(r, g, b);
    _near(c, "color oklch #808080 L", 0.5998708017071177, l, 1e-6);
    _near(c, "color oklch #808080 C", 2.2359581629199253e-08, ch, 1e-6);
    _near(c, "color oklch #808080 h", 0.0, h, 1e-6);
  }
  {
    final (r, g, b, _) = parseHex('#ff8000');
    final (l, ch, h) = rgbToOklch(r, g, b);
    _near(c, "color oklch #ff8000 L", 0.7318948427227374, l, 1e-6);
    _near(c, "color oklch #ff8000 C", 0.1858032156306402, ch, 1e-6);
    _near(c, "color oklch #ff8000 h", 52.984679593971286, h, 1e-6);
  }
  {
    final (r, g, b) = oklchToRgb(0.627955, 0.257683, 29.2339);
    _near(c, "color oklchToRgb 0.627955 r", 0.9999989995226538, r, 1e-6);
    _near(c, "color oklchToRgb 0.627955 g", 2.4989239385060646e-06, g, 1e-6);
    _near(c, "color oklchToRgb 0.627955 b", -3.5938127559420605e-08, b, 1e-6);
  }
  {
    final (r, g, b) = oklchToRgb(0.7, 0.1, 200.0);
    _near(c, "color oklchToRgb 0.7 r", 0.25183094033414793, r, 1e-6);
    _near(c, "color oklchToRgb 0.7 g", 0.6942495954401551, g, 1e-6);
    _near(c, "color oklchToRgb 0.7 b", 0.7170636897415913, b, 1e-6);
  }
  {
    final (r, g, b) = oklchToRgb(0.5, 0.4, 150.0);
    _near(c, "color oklchToRgb 0.5 r", -2.5595884674002214, r, 1e-6);
    _near(c, "color oklchToRgb 0.5 g", 0.5687880047974224, g, 1e-6);
    _near(c, "color oklchToRgb 0.5 b", -0.8622713129274896, b, 1e-6);
  }
  {
    final (r, g, b) = oklchToRgb(1.0, 0.0, 0.0);
    _near(c, "color oklchToRgb 1 r", 0.9999999999999999, r, 1e-6);
    _near(c, "color oklchToRgb 1 g", 0.9999999999999999, g, 1e-6);
    _near(c, "color oklchToRgb 1 b", 0.9999999999999999, b, 1e-6);
  }
  {
    final (r, g, b) = oklchToRgb(0.0, 0.0, 0.0);
    _near(c, "color oklchToRgb 0 r", 0.0, r, 1e-6);
    _near(c, "color oklchToRgb 0 g", 0.0, g, 1e-6);
    _near(c, "color oklchToRgb 0 b", 0.0, b, 1e-6);
  }
  c.eq("color inGamut 0.25183094033414793", true, inGamut(0.25183094033414793, 0.6942495954401551, 0.7170636897415913));
  c.eq("color inGamut -2.5595884674002214", false, inGamut(-2.5595884674002214, 0.5687880047974224, -0.8622713129274896));
}
