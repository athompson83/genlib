// SPDX-License-Identifier: Apache-2.0
import 'dart:convert';

import 'package:genlib_validation_example/csv_safe.dart';
import 'package:genlib_validation_example/ics_events.dart';
import 'package:genlib_validation_example/money.dart';
import 'package:genlib_validation_example/signed_cursors.dart';

import 'src/checks.dart';

String _show(List<List<String>> rows) => jsonEncode(rows);

void runCsvSafeTests(Checks c) {
  const rows = [
    ['id', 'name', 'note'],
    ['1', 'Ada, Lovelace', 'said "hi"'],
    ['2', '=SUM(A1)', 'line1\nline2'],
    ['3', ' padded', '-5'],
  ];
  c.eq('csv write vector', 'id,name,note\r\n1,"Ada, Lovelace","said ""hi"""\r\n2,\'=SUM(A1),"line1\nline2"\r\n3," padded",\'-5\r\n',
      writeCsv(rows));
  c.eq('csv neutralize off', '=1\r\n', writeCsv(const [['=1']], neutralizeFormulas: false));
  c.eq('csv empty rows', '', writeCsv(const []));
  c.eq(
      'csv parse vector',
      _show(const [
        ['a', 'b'],
        ['x,1', 'say "hi"'],
        ['multi\nline', ''],
      ]),
      _show(parseCsv('a,b\r\n"x,1","say ""hi"""\n"multi\nline",\n')));
  c.eq('csv parse BOM', _show(const [['a']]), _show(parseCsv('﻿a\n')));
  c.eq('csv parse empty', 0, parseCsv('').length);
  for (final bad in ['a,"b', 'a"b', '"a"x']) {
    c.throws<FormatException>('csv parse error $bad', () => parseCsv(bad));
  }
  c.eq('csv round trip', _show(rows), _show(parseCsv(writeCsv(rows, neutralizeFormulas: false))));
}

void runMoneyTests(Checks c) {
  c.eq('toMinor 12.34 USD', 1234, toMinor('12.34', 'USD'));
  c.eq('toMinor -0.5 USD', -50, toMinor('-0.5', 'USD'));
  c.eq('toMinor 1000 JPY', 1000, toMinor('1000', 'JPY'));
  c.eq('toMinor 1.234 BHD', 1234, toMinor('1.234', 'BHD'));
  c.eq('toMinor 7 USD', 700, toMinor('7', 'USD'));
  for (final (amount, currency) in [
    ('1.5', 'JPY'), ('12.345', 'USD'), ('1,000.00', 'USD'), ('.5', 'USD'), ('12', 'XXX'), ('12', 'usd'), //
    ('5.', 'USD'), ('1e3', 'USD'), (' 1', 'USD'), ('+1', 'USD'),
  ]) {
    c.throws<ArgumentError>('toMinor error "$amount" $currency', () => toMinor(amount, currency));
  }
  c.throws<RangeError>('toMinor overflow', () => toMinor('99999999999999999999', 'USD'));
  c.eq('format 1234 USD', '12.34', formatMinor(1234, 'USD'));
  c.eq('format -5 USD', '-0.05', formatMinor(-5, 'USD'));
  c.eq('format 500 JPY', '500', formatMinor(500, 'JPY'));
  c.eq('format 1 BHD', '0.001', formatMinor(1, 'BHD'));
  c.eq('format 0 EUR', '0.00', formatMinor(0, 'EUR'));
  c.eq('applyRate 1999 0.0825', 165, applyRate(1999, '0.0825'));
  c.eq('applyRate 25 0.5', 12, applyRate(25, '0.5'));
  c.eq('applyRate 35 0.5', 18, applyRate(35, '0.5'));
  c.eq('applyRate -25 0.5', -12, applyRate(-25, '0.5'));
  c.eq('applyRate 1000 1.07', 1070, applyRate(1000, '1.07'));
  c.throws<ArgumentError>('applyRate 10 fraction digits', () => applyRate(1, '0.0000000001'));
  c.throws<RangeError>('applyRate overflow', () => applyRate(9223372036854775807, '2'));
  c.eq('allocate 100 [1,1,1]', '[34, 33, 33]', allocate(100, [1, 1, 1]).toString());
  c.eq('allocate 5 [3,7]', '[2, 3]', allocate(5, [3, 7]).toString());
  c.eq('allocate -100 [1,1,1]', '[-34, -33, -33]', allocate(-100, [1, 1, 1]).toString());
  c.eq('allocate 1000 [0,1]', '[0, 1000]', allocate(1000, [0, 1]).toString());
  c.eq('allocate 1 [3,7]', '[0, 1]', allocate(1, [3, 7]).toString());
  c.eq('allocate 1 [0,1,1]', '[0, 1, 0]', allocate(1, [0, 1, 1]).toString());
  c.eq('allocate 10 [1,8]', '[1, 9]', allocate(10, [1, 8]).toString());
  c.throws<ArgumentError>('allocate empty', () => allocate(1, []));
  c.throws<ArgumentError>('allocate zero sum', () => allocate(1, [0, 0]));
  c.throws<ArgumentError>('allocate negative ratio', () => allocate(1, [2, -1]));
}

void runSignedCursorsTests(Checks c) {
  final secret = ascii.encode('0123456789abcdef0123456789abcdef');
  const vector = 'djEKMTc5MDAwMDAwMAoyMDI2LTEwLTAxVDEyOjAwOjAwWgo0Mg.T2z74zcZhdSIFHTOhu4Wc0MNbTN2t71UXXeQpcLoUUc';
  bool kind(CursorException e, CursorErrorKind k, String prefix) => e.kind == k && e.message.startsWith(prefix);
  c.eq('cursor encode vector', vector, encodeCursor(const ['2026-10-01T12:00:00Z', '42'], secret, 1790000000));
  c.eq('cursor decode vector', '2026-10-01T12:00:00Z|42', decodeCursor(vector, secret, 1789999999).join('|'));
  c.throws<CursorException>('cursor expired', () => decodeCursor(vector, secret, 1790000000),
      (e) => kind(e, CursorErrorKind.expired, 'expired'));
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var badSignatures = 0;
  for (final ch in alphabet.split('')) {
    if (ch == vector[vector.length - 1]) continue;
    try {
      decodeCursor(vector.substring(0, vector.length - 1) + ch, secret, 0);
    } on CursorException catch (e) {
      if (kind(e, CursorErrorKind.badSignature, 'bad signature')) badSignatures++;
    }
  }
  c.eq('cursor every last-char change is bad signature', 63, badSignatures);
  c.throws<CursorException>('cursor first sig char changed', () => decodeCursor(vector.replaceFirst('.T2z', '.U2z'), secret, 0),
      (e) => e.kind == CursorErrorKind.badSignature);
  c.throws<CursorException>('cursor no dot', () => decodeCursor(vector.replaceAll('.', ''), secret, 0),
      (e) => kind(e, CursorErrorKind.malformed, 'malformed'));
  c.throws<CursorException>('cursor padding', () => decodeCursor('$vector=', secret, 0), (e) => e.kind == CursorErrorKind.malformed);
  c.throws<CursorException>('cursor empty sig', () => decodeCursor(vector.substring(0, vector.indexOf('.') + 1), secret, 0),
      (e) => e.kind == CursorErrorKind.malformed);
  c.throws<CursorException>('cursor bad char', () => decodeCursor('dj+K.${vector.split('.')[1]}', secret, 0),
      (e) => e.kind == CursorErrorKind.malformed);
  c.throws<CursorException>('cursor other secret', () => decodeCursor(vector, ascii.encode('fedcba9876543210fedcba9876543210'), 0),
      (e) => e.kind == CursorErrorKind.badSignature);
  c.throws<ArgumentError>('cursor encode 31-byte secret', () => encodeCursor(const ['a'], List.filled(31, 0), 1));
  c.throws<ArgumentError>('cursor decode 31-byte secret', () => decodeCursor(vector, List.filled(31, 0), 0));
  c.throws<ArgumentError>('cursor no values', () => encodeCursor(const [], secret, 1));
  c.throws<ArgumentError>('cursor 17 values', () => encodeCursor(List.filled(17, 'a'), secret, 1));
  c.throws<ArgumentError>('cursor newline value', () => encodeCursor(const ['a\nb'], secret, 1));
  c.throws<RangeError>('cursor expiresAt 0', () => encodeCursor(const ['a'], secret, 0));
}

void runIcsEventsTests(Checks c) {
  const first = IcsEvent(
      uid: 'evt-1@example.com',
      dtstamp: '2026-10-10T12:00:00Z',
      start: '2026-10-20T15:00:00Z',
      end: '2026-10-20T16:30:00Z',
      summary: 'Office hours; Q&A, live',
      description:
          'Bring questions.\nRoom 4 \\ east wing. A folding test with café, then more words so the second line also runs past seventy-four octets and folds again.',
      location: 'Room 4, Main St.',
      url: 'https://example.com/e/1');
  const second = IcsEvent(
      uid: 'evt-2@example.com', dtstamp: '2026-10-10T12:00:00Z', start: '2026-12-24', end: '2026-12-25', summary: 'Holiday');
  final out = icsCalendar(const [first, second], '-//Acme//Genlib//EN');
  c.eq(
      'ics vector',
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Acme//Genlib//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nBEGIN:VEVENT\r\nUID:evt-1@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART:20261020T150000Z\r\nDTEND:20261020T163000Z\r\nSUMMARY:Office hours\\; Q&A\\, live\r\nDESCRIPTION:Bring questions.\\nRoom 4 \\\\ east wing. A folding test with caf\r\n é\\, then more words so the second line also runs past seventy-four octets\r\n  and folds again.\r\nLOCATION:Room 4\\, Main St.\r\nURL:https://example.com/e/1\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:evt-2@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20261225\r\nSUMMARY:Holiday\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
      out);
  c.check('ics lines within 75 octets', out.split('\r\n').every((l) => utf8.encode(l).length <= 75));
  IcsEvent withField({String? uid, String? dtstamp, String? start, String? end, String? url}) => IcsEvent(
      uid: uid ?? first.uid,
      dtstamp: dtstamp ?? first.dtstamp,
      start: start ?? first.start,
      end: end ?? first.end,
      summary: first.summary,
      url: url ?? first.url);
  c.throws<ArgumentError>('ics end equals start', () => icsCalendar([withField(end: first.start)], 'p'));
  c.throws<ArgumentError>('ics date start utc end', () => icsCalendar([withField(start: '2026-10-20')], 'p'));
  c.throws<ArgumentError>('ics empty uid', () => icsCalendar([withField(uid: '')], 'p'));
  c.throws<ArgumentError>('ics ftp url', () => icsCalendar([withField(url: 'ftp://x')], 'p'));
  c.throws<ArgumentError>('ics date dtstamp', () => icsCalendar([withField(dtstamp: '2026-10-10')], 'p'));
  c.throws<ArgumentError>('ics invalid month', () => icsCalendar([withField(start: '2026-13-20T15:00:00Z')], 'p'));
}
