// SPDX-License-Identifier: Apache-2.0
/// RFC 5545 recurrence rule expansion in UTC for FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, COUNT, UNTIL, BYDAY
/// (with ordinals for MONTHLY and YEARLY), BYMONTHDAY and BYMONTH. Matches python-dateutil for every rule it accepts;
/// rejects BYSETPOS, WKST, BYHOUR and every other part. Every occurrence keeps the start's time of day.
library;

const _maxPeriods = 100000;
const _weekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const _allowed = {'FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH'};
final _start = RegExp(r'^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z$');
final _until = RegExp(r'^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$');
final _byDay = RegExp(r'^([+-]?[0-9]{1,2})?(MO|TU|WE|TH|FR|SA|SU)$');
final _number = RegExp(r'^[+-]?[0-9]{1,4}$');

class _Rule {
  final String freq;
  final int interval;
  final int? count;
  final DateTime? until;
  final List<(int, int)> byDay;
  final List<int> byMonthDay, byMonth;
  _Rule(this.freq, this.interval, this.count, this.until, this.byDay, this.byMonthDay, this.byMonth);
}

/// Expands [rule] from [dtstartIsoUtc] (`YYYY-MM-DDTHH:MM:SSZ`) into at most [limit] (1..1000) occurrences in the same
/// format. Candidates before the start are skipped; expansion stops after UNTIL (inclusive), COUNT, the limit or 100000
/// periods. Throws [FormatException] for a malformed start or an unsupported or invalid rule and [RangeError] for a bad
/// limit.
List<String> expandRRule(String dtstartIsoUtc, String rule, {int limit = 50}) {
  if (limit < 1 || limit > 1000) throw RangeError.range(limit, 1, 1000, 'limit');
  final s = _parseDate(_start, dtstartIsoUtc, 'DTSTART must be YYYY-MM-DDTHH:MM:SSZ');
  final r = _parseRule(rule);
  final startWd = s.weekday - 1;
  // dateutil defaults apply only when no day-level filter is given.
  var byDay = r.byDay, byMonthDay = r.byMonthDay, byMonth = r.byMonth;
  if (byDay.isEmpty && byMonthDay.isEmpty) {
    if (r.freq == 'WEEKLY') {
      byDay = [(0, startWd)];
    } else if (r.freq == 'MONTHLY') {
      byMonthDay = [s.day];
    } else if (r.freq == 'YEARLY') {
      byMonthDay = [s.day];
      if (byMonth.isEmpty) byMonth = [s.month];
    }
  }
  final monthScope = r.freq == 'MONTHLY' || (r.freq == 'YEARLY' && r.byMonth.isNotEmpty);
  final out = <String>[];
  for (var k = 0; k < _maxPeriods; k++) {
    // Period k as (year, month, day) of its first day plus its length; day overflow normalizes via DateTime.utc.
    int y, mo, d, length;
    if (r.freq == 'DAILY') {
      (y, mo, d, length) = (s.year, s.month, s.day + k * r.interval, 1);
    } else if (r.freq == 'WEEKLY') {
      (y, mo, d, length) = (s.year, s.month, s.day - startWd + 7 * k * r.interval, 7);
    } else if (r.freq == 'MONTHLY') {
      final mi = s.month - 1 + k * r.interval;
      (y, mo, d) = (s.year + mi ~/ 12, mi % 12 + 1, 1);
      if (y > 9999) break;
      length = _daysInMonth(y, mo);
    } else {
      (y, mo, d) = (s.year + k * r.interval, 1, 1);
      if (y > 9999) break;
      length = _isLeap(y) ? 366 : 365;
    }
    final first = DateTime.utc(y, mo, d, s.hour, s.minute, s.second);
    if (DateTime.utc(y, mo, d + length - 1).year > 9999) break;
    var stop = false;
    for (var i = 0; i < length; i++) {
      final c = DateTime.utc(first.year, first.month, first.day + i, s.hour, s.minute, s.second);
      if (!_matches(c, byDay, byMonthDay, byMonth, monthScope)) continue;
      if (c.isBefore(s)) continue;
      if (r.until != null && c.isAfter(r.until!)) {
        stop = true;
        break;
      }
      out.add(_format(c));
      if ((r.count != null && out.length >= r.count!) || out.length >= limit) {
        stop = true;
        break;
      }
    }
    if (stop) break;
    if (r.until != null && first.isAfter(r.until!)) break;
  }
  return out;
}

bool _matches(DateTime d, List<(int, int)> byDay, List<int> byMonthDay, List<int> byMonth, bool monthScope) {
  if (byMonth.isNotEmpty && !byMonth.contains(d.month)) return false;
  final nd = _daysInMonth(d.year, d.month);
  if (byMonthDay.isNotEmpty && !byMonthDay.any((x) => d.day == (x > 0 ? x : nd + x + 1))) return false;
  if (byDay.isEmpty) return true;
  final wd = d.weekday - 1;
  for (final (n, w) in byDay) {
    if (w != wd) continue;
    if (n == 0) return true;
    // Ordinal among this weekday's days in the month, or in the year (YEARLY without BYMONTH).
    final pos = monthScope ? d.day : _dayOfYear(d);
    final len = monthScope ? nd : (_isLeap(d.year) ? 366 : 365);
    if (n > 0 ? (pos - 1) ~/ 7 + 1 == n : (len - pos) ~/ 7 + 1 == -n) return true;
  }
  return false;
}

_Rule _parseRule(String rule) {
  final parts = <String, String>{};
  for (final p in rule.split(';')) {
    final eq = p.indexOf('=');
    if (eq < 0) throw FormatException('malformed rule part', p);
    final key = p.substring(0, eq);
    if (parts.containsKey(key)) throw FormatException('duplicate rule part', key);
    parts[key] = p.substring(eq + 1);
  }
  for (final key in parts.keys) {
    if (!_allowed.contains(key)) throw FormatException('unsupported rule part', key);
  }
  final freq = parts['FREQ'];
  if (freq == null) throw const FormatException('FREQ is required');
  if (!const ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].contains(freq)) throw FormatException('unsupported FREQ', freq);
  if (parts.containsKey('COUNT') && parts.containsKey('UNTIL')) throw const FormatException('COUNT and UNTIL cannot both be set');
  final interval = parts.containsKey('INTERVAL') ? _num(parts['INTERVAL']!, 1, 9999, false) : 1;
  final count = parts.containsKey('COUNT') ? _num(parts['COUNT']!, 1, 9999, false) : null;
  final until = parts.containsKey('UNTIL') ? _parseDate(_until, parts['UNTIL']!, 'UNTIL must be YYYYMMDDTHHMMSSZ') : null;
  final byDay = <(int, int)>[];
  if (parts.containsKey('BYDAY')) {
    final ordinalLimit = freq == 'MONTHLY' || (freq == 'YEARLY' && parts.containsKey('BYMONTH')) ? 5 : 53;
    var plain = false, ordinal = false;
    for (final d in parts['BYDAY']!.split(',')) {
      final m = _byDay.firstMatch(d);
      if (m == null) throw FormatException('invalid BYDAY value', d);
      var n = 0;
      if (m.group(1) != null) {
        n = int.parse(m.group(1)!);
        if ((freq != 'MONTHLY' && freq != 'YEARLY') || n == 0 || n.abs() > ordinalLimit) {
          throw FormatException('invalid BYDAY ordinal', d);
        }
        ordinal = true;
      } else {
        plain = true;
      }
      byDay.add((n, _weekdays.indexOf(m.group(2)!)));
    }
    if (plain && ordinal) throw const FormatException('BYDAY cannot mix plain and ordinal weekdays');
  }
  final byMonthDay = <int>[];
  if (parts.containsKey('BYMONTHDAY')) {
    byMonthDay.addAll(parts['BYMONTHDAY']!.split(',').map((x) => _num(x, 1, 31, true)));
  }
  final byMonth = <int>[];
  if (parts.containsKey('BYMONTH')) {
    byMonth.addAll(parts['BYMONTH']!.split(',').map((x) => _num(x, 1, 12, false)));
  }
  return _Rule(freq, interval, count, until, byDay, byMonthDay, byMonth);
}

int _num(String s, int lo, int hi, bool signed) {
  if (!_number.hasMatch(s) || (!signed && s.startsWith('-'))) throw FormatException('invalid rule number', s);
  final v = int.parse(s);
  if (v.abs() < lo || v.abs() > hi) throw FormatException('rule number out of range', s);
  return v;
}

DateTime _parseDate(RegExp pattern, String text, String message) {
  final m = pattern.firstMatch(text);
  if (m == null) throw FormatException(message, text);
  final g = [for (var i = 1; i <= 6; i++) int.parse(m.group(i)!)];
  final (y, mo, d, h, mi, sec) = (g[0], g[1], g[2], g[3], g[4], g[5]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > _daysInMonth(y, mo) || h > 23 || mi > 59 || sec > 59) {
    throw FormatException(message, text);
  }
  return DateTime.utc(y, mo, d, h, mi, sec);
}

int _daysInMonth(int y, int m) => DateTime.utc(y, m + 1, 0).day;

bool _isLeap(int y) => y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);

int _dayOfYear(DateTime d) => DateTime.utc(d.year, d.month, d.day).difference(DateTime.utc(d.year)).inDays + 1;

String _format(DateTime c) {
  String two(int v) => v.toString().padLeft(2, '0');
  return '${c.year.toString().padLeft(4, '0')}-${two(c.month)}-${two(c.day)}T${two(c.hour)}:${two(c.minute)}:${two(c.second)}Z';
}
