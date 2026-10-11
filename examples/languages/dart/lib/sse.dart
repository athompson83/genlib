// SPDX-License-Identifier: Apache-2.0
/// Server-sent events (WHATWG HTML event-stream interpretation): an incremental parser and a formatter.
library;

/// One dispatched event: type (default "message"), data lines joined with "\n" and the last event id.
typedef SseEvent = ({String event, String data, String id});

/// Incremental event-stream parser. Text may arrive in arbitrary chunks (also splitting a CRLF); the last event id
/// persists across events and [retry] holds the latest valid retry value in milliseconds.
class SseParser {
  final _buf = StringBuffer();
  final _data = <String>[];
  String _event = '', _lastId = '';
  bool _pendingCr = false, _first = true;

  /// Latest valid retry (reconnection delay) in milliseconds, null until one arrives.
  int? retry;

  /// Feeds a chunk of stream text and returns the events completed by it.
  List<SseEvent> feed(String text) {
    final out = <SseEvent>[];
    if (_first && text.isNotEmpty) {
      if (text.codeUnitAt(0) == 0xFEFF) text = text.substring(1);
      _first = false;
    }
    for (final ch in text.codeUnits) {
      if (_pendingCr) {
        _pendingCr = false;
        if (ch == 0x0A) continue;
      }
      if (ch == 0x0D) {
        _pendingCr = true;
        _line(_buf.toString(), out);
        _buf.clear();
      } else if (ch == 0x0A) {
        _line(_buf.toString(), out);
        _buf.clear();
      } else {
        _buf.writeCharCode(ch);
      }
    }
    return out;
  }

  void _line(String line, List<SseEvent> out) {
    if (line.isEmpty) {
      if (_data.isNotEmpty) out.add((event: _event.isEmpty ? 'message' : _event, data: _data.join('\n'), id: _lastId));
      _data.clear();
      _event = '';
      return;
    }
    if (line.startsWith(':')) return;
    final colon = line.indexOf(':');
    final field = colon < 0 ? line : line.substring(0, colon);
    var value = colon < 0 ? '' : line.substring(colon + 1);
    if (colon >= 0 && value.startsWith(' ')) value = value.substring(1);
    switch (field) {
      case 'data':
        _data.add(value);
      case 'event':
        _event = value;
      case 'id':
        if (!value.contains('\u0000')) _lastId = value;
      case 'retry':
        if (_digits.hasMatch(value)) {
          final ms = int.tryParse(value);
          if (ms != null) retry = ms;
        }
    }
  }
}

final _digits = RegExp(r'^[0-9]+$');

/// All complete events in [text]; an unterminated final event is dropped, as the spec requires.
List<SseEvent> parseSse(String text) => SseParser().feed(text);

/// One event as stream text ("event:", "id:", "retry:" when given, then one "data:" line per data line, then a blank line).
/// Throws [ArgumentError] for line breaks in [event] or [id], NUL in [id] or a negative [retry].
String formatSse(String data, {String? event, String? id, int? retry}) {
  bool breaks(String s) => s.contains('\r') || s.contains('\n');
  if (event != null && breaks(event)) throw ArgumentError.value(event, 'event', 'must not contain line breaks');
  if (id != null && breaks(id)) throw ArgumentError.value(id, 'id', 'must not contain line breaks');
  if (id != null && id.contains('\u0000')) throw ArgumentError.value(id, 'id', 'must not contain NUL');
  if (retry != null && retry < 0) throw RangeError.value(retry, 'retry', 'must not be negative');
  final out = StringBuffer();
  if (event != null) out.write('event: $event\n');
  if (id != null) out.write('id: $id\n');
  if (retry != null) out.write('retry: $retry\n');
  for (final line in data.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')) {
    out.write('data: $line\n');
  }
  out.write('\n');
  return out.toString();
}

/// A comment (keep-alive ping): ":\n\n" or ": text\n\n". Throws [ArgumentError] for line breaks.
String formatComment([String text = '']) {
  if (text.contains('\r') || text.contains('\n')) throw ArgumentError.value(text, 'text', 'comment must be one line');
  return ':${text.isEmpty ? '' : ' $text'}\n\n';
}
