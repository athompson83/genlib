// SPDX-License-Identifier: Apache-2.0
/// Next run time of a standard 5-field cron expression, evaluated in UTC with the Vixie day-matching rule.
library;

final _item = RegExp(r'^(\*|[0-9]{1,2}(?:-[0-9]{1,2})?)(?:/([0-9]{1,2}))?$');
final _iso = RegExp(r'^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.[0-9]+)?)?Z$');

/// First minute strictly after [afterIsoUtc] (seconds truncated) matching [expression], as `YYYY-MM-DDTHH:MM:00Z`.
/// Throws [FormatException] for invalid input and [StateError] when nothing matches within 5 years.
String nextRun(String expression, String afterIsoUtc) {
  final f = expression.trim().split(RegExp(r'\s+'));
  if (f.length != 5) throw FormatException('cron expression must have 5 fields', expression);
  final minutes = _field(f[0], 0, 59), hours = _field(f[1], 0, 23), dom = _field(f[2], 1, 31), months = _field(f[3], 1, 12);
  final dowRaw = _field(f[4], 0, 7);
  final dow = [for (var i = 0; i < 7; i++) dowRaw[i] || (i == 0 && dowRaw[7])];
  final either = !f[2].startsWith('*') && !f[4].startsWith('*');

  final after = _parseUtc(afterIsoUtc);
  final start = DateTime.utc(after.year, after.month, after.day, after.hour, after.minute).add(const Duration(minutes: 1));
  final limit = DateTime.utc(start.year + 5, start.month, start.day);
  for (var day = DateTime.utc(start.year, start.month, start.day); !day.isAfter(limit); day = DateTime.utc(day.year, day.month, day.day + 1)) {
    if (!months[day.month]) continue;
    final d = dom[day.day], w = dow[day.weekday % 7];
    if (either ? !(d || w) : !(d && w)) continue;
    final first = day.year == start.year && day.month == start.month && day.day == start.day;
    for (var h = first ? start.hour : 0; h < 24; h++) {
      if (!hours[h]) continue;
      for (var m = first && h == start.hour ? start.minute : 0; m < 60; m++) {
        if (minutes[m]) {
          String two(int n) => n.toString().padLeft(2, '0');
          return '${day.year.toString().padLeft(4, '0')}-${two(day.month)}-${two(day.day)}T${two(h)}:${two(m)}:00Z';
        }
      }
    }
  }
  throw StateError('no matching time within 5 years');
}

List<bool> _field(String text, int min, int max) {
  final allowed = List<bool>.filled(max + 1, false);
  for (final part in text.split(',')) {
    final m = _item.firstMatch(part);
    if (m == null) throw FormatException('invalid cron field item', part);
    var lo = min, hi = max;
    if (m[1] != '*') {
      final bounds = m[1]!.split('-');
      lo = int.parse(bounds[0]);
      hi = bounds.length == 2 ? int.parse(bounds[1]) : (m[2] != null ? max : lo);
    }
    final step = m[2] == null ? 1 : int.parse(m[2]!);
    if (lo < min || hi > max || lo > hi) throw FormatException('cron value out of range (allowed $min-$max)', part);
    if (step < 1) throw FormatException('cron step must be >= 1', part);
    for (var v = lo; v <= hi; v += step) {
      allowed[v] = true;
    }
  }
  return allowed;
}

DateTime _parseUtc(String text) {
  final m = _iso.firstMatch(text);
  if (m == null) throw FormatException('after must be an ISO 8601 UTC timestamp like 2026-10-10T12:00:00Z', text);
  final n = [for (var i = 1; i <= 6; i++) m[i] == null ? 0 : int.parse(m[i]!)];
  final d = DateTime.utc(n[0], n[1], n[2], n[3], n[4], n[5]);
  if (d.year != n[0] || d.month != n[1] || d.day != n[2] || d.hour != n[3] || d.minute != n[4] || d.second != n[5]) {
    throw FormatException('after is not a valid date and time', text);
  }
  return d;
}
