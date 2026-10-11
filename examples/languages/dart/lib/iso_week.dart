// SPDX-License-Identifier: Apache-2.0
/// ISO 8601 week dates (weeks start Monday; week 1 holds the year's first Thursday) over the proleptic Gregorian calendar,
/// years 1..9999, with plain day arithmetic. Invalid dates and out-of-range weeks throw [FormatException].
library;

int _daysFromCivil(int y0, int m, int d) {
  final y = m <= 2 ? y0 - 1 : y0;
  final era = (y >= 0 ? y : y - 399) ~/ 400;
  final yoe = y - era * 400;
  final doy = (153 * (m > 2 ? m - 3 : m + 9) + 2) ~/ 5 + d - 1;
  final doe = yoe * 365 + yoe ~/ 4 - yoe ~/ 100 + doy;
  return era * 146097 + doe - 719468;
}

(int, int, int) _civil(int z0) {
  final z = z0 + 719468;
  final era = (z >= 0 ? z : z - 146096) ~/ 146097;
  final doe = z - era * 146097;
  final yoe = (doe - doe ~/ 1460 + doe ~/ 36524 - doe ~/ 146096) ~/ 365;
  final doy = doe - (365 * yoe + yoe ~/ 4 - yoe ~/ 100);
  final mp = (5 * doy + 2) ~/ 153;
  final d = doy - (153 * mp + 2) ~/ 5 + 1;
  final m = mp < 10 ? mp + 3 : mp - 9;
  return (m <= 2 ? yoe + era * 400 + 1 : yoe + era * 400, m, d);
}

bool _leap(int y) => y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);

int _dayNumber(int y, int m, int d) {
  const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 || d > (m == 2 && _leap(y) ? 29 : dim[m - 1])) {
    throw FormatException('invalid date $y-$m-$d');
  }
  return _daysFromCivil(y, m, d);
}

int _weekday(int z) => ((z % 7) + 3) % 7 + 1; // 1970-01-01 (day 0) was a Thursday.

/// (weekYear, week, weekday 1=Mon..7=Sun) for a calendar date.
(int, int, int) isoWeek(int year, int month, int day) {
  final z = _dayNumber(year, month, day);
  final wd = _weekday(z);
  final thursday = z - wd + 4;
  final wy = _civil(thursday).$1;
  return (wy, (thursday - _daysFromCivil(wy, 1, 1)) ~/ 7 + 1, wd);
}

/// 52 or 53: the number of ISO weeks in [year] (1..9999).
int weeksInYear(int year) => isoWeek(year, 12, 28).$2;

/// The calendar date (y, m, d) of an ISO week date; week must be 1..weeksInYear and weekday 1..7.
(int, int, int) fromIsoWeek(int weekYear, int week, int weekday) {
  if (weekYear < 1 || weekYear > 9999 || weekday < 1 || weekday > 7 || week < 1 || week > weeksInYear(weekYear)) {
    throw const FormatException('invalid ISO week date');
  }
  final jan4 = _daysFromCivil(weekYear, 1, 4);
  final r = _civil(jan4 - (_weekday(jan4) - 1) + (week - 1) * 7 + weekday - 1);
  if (r.$1 < 1 || r.$1 > 9999) throw const FormatException('date out of range');
  return r;
}

/// "YYYY-Www-D" for a calendar date.
String formatIsoWeek(int year, int month, int day) {
  final (wy, w, wd) = isoWeek(year, month, day);
  return '${wy.toString().padLeft(4, '0')}-W${w.toString().padLeft(2, '0')}-$wd';
}

final _pattern = RegExp(r'^([0-9]{4})-?W([0-9]{2})(?:-?([1-7]))?$');

/// Parses "YYYY-Www-D", "YYYYWwwD" or "YYYY-Www" (weekday 1) to a calendar date (y, m, d).
(int, int, int) parseIsoWeek(String s) {
  final m = _pattern.firstMatch(s);
  if (m == null) throw FormatException('not an ISO week date', s);
  return fromIsoWeek(int.parse(m.group(1)!), int.parse(m.group(2)!), int.parse(m.group(3) ?? '1'));
}
