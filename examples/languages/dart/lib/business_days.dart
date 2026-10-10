// SPDX-License-Identifier: Apache-2.0
/// Business days over ISO dates ("YYYY-MM-DD", proleptic Gregorian) with configurable holidays and weekend days ("MO".."SU",
/// default Saturday and Sunday). Throws [FormatException] for malformed or impossible dates and [ArgumentError] for bad
/// weekends or counts.
library;

const _weekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
final _isoDate = RegExp(r'^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

DateTime _parse(String s) {
  if (!_isoDate.hasMatch(s)) throw FormatException('date must be YYYY-MM-DD', s);
  final y = int.parse(s.substring(0, 4)), m = int.parse(s.substring(5, 7)), d = int.parse(s.substring(8, 10));
  final date = DateTime.utc(y, m, d);
  if (y < 1 || date.year != y || date.month != m || date.day != d) throw FormatException('invalid date', s);
  return date;
}

String _format(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

int _weekday(DateTime d) => d.weekday - 1; // Monday = 0

DateTime _addDays(DateTime d, int n) => DateTime.utc(d.year, d.month, d.day + n);

int _dayNumber(DateTime d) => d.millisecondsSinceEpoch ~/ 86400000;

(Set<int>, Set<int>) _config(List<String> holidays, List<String> weekend) {
  final w = <int>{};
  for (final x in weekend) {
    final i = _weekdays.indexOf(x);
    if (i < 0) throw ArgumentError.value(x, 'weekend', 'weekend days are MO..SU');
    w.add(i);
  }
  if (w.length == 7) throw ArgumentError.value(weekend, 'weekend', 'weekend cannot be every day');
  return ({for (final h in holidays) _dayNumber(_parse(h))}, w);
}

/// True when [date] is neither a weekend day nor a holiday.
bool isBusinessDay(String date, {List<String> holidays = const [], List<String> weekend = const ['SA', 'SU']}) {
  final (h, w) = _config(holidays, weekend);
  final d = _parse(date);
  return !w.contains(_weekday(d)) && !h.contains(_dayNumber(d));
}

/// The date [n] business days after [date] (before it when n < 0, |n| <= 100000). n == 0 returns the date itself when it
/// is a business day, otherwise the next business day.
String addBusinessDays(String date, int n, {List<String> holidays = const [], List<String> weekend = const ['SA', 'SU']}) {
  if (n < -100000 || n > 100000) throw RangeError.value(n, 'n', 'must be within ±100000');
  final (h, w) = _config(holidays, weekend);
  var d = _parse(date);
  bool ok(DateTime x) => !w.contains(_weekday(x)) && !h.contains(_dayNumber(x));
  if (n == 0) {
    while (!ok(d)) {
      d = _addDays(d, 1);
    }
    return _format(d);
  }
  final step = n > 0 ? 1 : -1;
  var left = n.abs();
  while (left > 0) {
    d = _addDays(d, step);
    if (ok(d)) left--;
  }
  return _format(d);
}

/// Business days in [start, end) (start counted, end not); negative when end is before start. O(1) week arithmetic plus
/// holidays.
int businessDaysBetween(String start, String end, {List<String> holidays = const [], List<String> weekend = const ['SA', 'SU']}) {
  final (h, w) = _config(holidays, weekend);
  var a = _parse(start), b = _parse(end);
  var sign = 1;
  if (b.isBefore(a)) {
    (a, b) = (b, a);
    sign = -1;
  }
  final an = _dayNumber(a), bn = _dayNumber(b);
  final days = bn - an, full = days ~/ 7, rem = days % 7;
  var count = full * (7 - w.length);
  for (var i = 0; i < rem; i++) {
    if (!w.contains(_weekday(_addDays(a, full * 7 + i)))) count++;
  }
  // 1970-01-01 (day 0) was a Thursday (weekday 3).
  count -= h.where((x) => an <= x && x < bn && !w.contains((x + 3) % 7)).length;
  return sign * count;
}
