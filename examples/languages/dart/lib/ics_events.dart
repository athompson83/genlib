// SPDX-License-Identifier: Apache-2.0
/// RFC 5545 VCALENDAR writer with TEXT escaping and 75-octet line folding.
library;

import 'dart:convert';

import 'src/web_text.dart';

/// One calendar event. [start]/[end] are both UTC `YYYY-MM-DDTHH:MM:SSZ` or both dates `YYYY-MM-DD`;
/// [dtstamp] is UTC. [url], when present, must be an absolute http(s) URL.
class IcsEvent {
  final String uid, dtstamp, start, end, summary;
  final String? description, location, url;
  const IcsEvent(
      {required this.uid,
      required this.dtstamp,
      required this.start,
      required this.end,
      required this.summary,
      this.description,
      this.location,
      this.url});
}

final _utc = RegExp(r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$');
final _date = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

/// Builds a PUBLISH calendar; every line ends with CRLF.
String icsCalendar(List<IcsEvent> events, String prodId) {
  if (prodId.isEmpty) throw ArgumentError.value(prodId, 'prodId', 'is required');
  final out = StringBuffer();
  void line(String content) => _fold(out, content);
  line('BEGIN:VCALENDAR');
  line('VERSION:2.0');
  line('PRODID:${escapeIcsText(prodId)}');
  line('CALSCALE:GREGORIAN');
  line('METHOD:PUBLISH');
  for (final e in events) {
    if (e.uid.isEmpty) throw ArgumentError.value(e.uid, 'uid', 'is required');
    if (e.summary.isEmpty) throw ArgumentError.value(e.summary, 'summary', 'is required');
    if (_kind(e.dtstamp) != 'T') throw ArgumentError.value(e.dtstamp, 'dtstamp', 'must be UTC YYYY-MM-DDTHH:MM:SSZ');
    final startKind = _kind(e.start), endKind = _kind(e.end);
    if (startKind == '?' || endKind == '?') throw ArgumentError('start and end must be UTC date-times or dates');
    if (startKind != endKind) throw ArgumentError('start and end must be the same kind');
    if (e.end.compareTo(e.start) <= 0) throw ArgumentError('end must be after start');
    if (e.url != null && !isAbsoluteHttpUrl(e.url)) throw ArgumentError.value(e.url, 'url', 'must be an absolute http(s) URL');
    line('BEGIN:VEVENT');
    line('UID:${escapeIcsText(e.uid)}');
    line('DTSTAMP:${_compact(e.dtstamp)}');
    line('${startKind == 'D' ? 'DTSTART;VALUE=DATE' : 'DTSTART'}:${_compact(e.start)}');
    line('${endKind == 'D' ? 'DTEND;VALUE=DATE' : 'DTEND'}:${_compact(e.end)}');
    line('SUMMARY:${escapeIcsText(e.summary)}');
    if (e.description != null) line('DESCRIPTION:${escapeIcsText(e.description!)}');
    if (e.location != null) line('LOCATION:${escapeIcsText(e.location!)}');
    if (e.url != null) line('URL:${e.url}');
    line('END:VEVENT');
  }
  line('END:VCALENDAR');
  return out.toString();
}

/// Escapes backslash, semicolon and comma; CRLF, LF (and a lone CR) become backslash + n.
String escapeIcsText(String value) => value
    .replaceAll(r'\', r'\\')
    .replaceAll(';', r'\;')
    .replaceAll(',', r'\,')
    .replaceAll(RegExp('\r\n|\n|\r'), r'\n');

// 'T' for a valid UTC date-time, 'D' for a valid date, '?' otherwise.
String _kind(String value) {
  final t = _utc.firstMatch(value);
  if (t != null) {
    final p = [for (var i = 1; i <= 6; i++) int.parse(t.group(i)!)];
    final d = DateTime.utc(p[0], p[1], p[2], p[3], p[4], p[5]);
    final ok = d.year == p[0] && d.month == p[1] && d.day == p[2] && d.hour == p[3] && d.minute == p[4] && d.second == p[5];
    return ok ? 'T' : '?';
  }
  final m = _date.firstMatch(value);
  if (m != null) {
    final p = [for (var i = 1; i <= 3; i++) int.parse(m.group(i)!)];
    final d = DateTime.utc(p[0], p[1], p[2]);
    return d.year == p[0] && d.month == p[1] && d.day == p[2] ? 'D' : '?';
  }
  return '?';
}

String _compact(String value) => value.replaceAll('-', '').replaceAll(':', '');

void _fold(StringBuffer out, String content) {
  var limit = 75, used = 0;
  for (final rune in content.runes) {
    final ch = String.fromCharCode(rune);
    final octets = utf8.encode(ch).length;
    if (used + octets > limit) {
      out.write('\r\n ');
      used = 0;
      limit = 74;
    }
    out.write(ch);
    used += octets;
  }
  out.write('\r\n');
}
