// SPDX-License-Identifier: Apache-2.0
/// RFC 5545 recurrence rule expansion for a UTC subset: FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, COUNT, UNTIL,
/// BYDAY, BYMONTHDAY (MONTHLY) and BYMONTH (YEARLY). Every occurrence keeps the start's time of day.
library;

const _maxPeriods = 100000;
const _weekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const _allowed = {'FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH'};
final _start = RegExp(r'^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z$');
final _until = RegExp(r'^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$');
final _byDay = RegExp(r'^([+-]?[1-5])?(MO|TU|WE|TH|FR|SA|SU)$');
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
  final out = <String>[];
  DateTime at(int y, int m, int d) => DateTime.utc(y, m, d, s.hour, s.minute, s.second);
  for (var k = 0; k < _maxPeriods; k++) {
    final candidates = <DateTime>[];
    if (r.freq == 'DAILY') {
      final c = at(s.year, s.month, s.day + k * r.interval);
      if (c.year > 9999) break;
      candidates.add(c);
    } else if (r.freq == 'WEEKLY') {
      final days = r.byDay.isNotEmpty ? (r.byDay.map((x) => x.$2).toSet().toList()..sort()) : [startWd];
      final monday = s.day - startWd + 7 * k * r.interval;
      if (at(s.year, s.month, monday + 6).year > 9999) break;
      for (final wd in days) {
        candidates.add(at(s.year, s.month, monday + wd));
      }
    } else if (r.freq == 'MONTHLY') {
      final mi = s.month - 1 + k * r.interval;
      final y = s.year + mi ~/ 12, mo = mi % 12 + 1;
      if (y > 9999) break;
      final nd = _daysInMonth(y, mo);
      final days = <int>{};
      if (r.byDay.isNotEmpty) {
        for (final (n, wd) in r.byDay) {
          final ds = [
            for (var d = 1; d <= nd; d++)
              if (DateTime.utc(y, mo, d).weekday - 1 == wd) d,
          ];
          if (n == 0) {
            days.addAll(ds);
          } else if (n.abs() <= ds.length) {
            days.add(n > 0 ? ds[n - 1] : ds[ds.length + n]);
          }
        }
      } else if (r.byMonthDay.isNotEmpty) {
        for (final md in r.byMonthDay) {
          final d = md > 0 ? md : nd + md + 1;
          if (d >= 1 && d <= nd) days.add(d);
        }
      } else if (s.day <= nd) {
        days.add(s.day);
      }
      for (final d in days) {
        candidates.add(at(y, mo, d));
      }
    } else {
      final y = s.year + k * r.interval;
      if (y > 9999) break;
      for (final mo in r.byMonth.isNotEmpty ? r.byMonth : [s.month]) {
        if (s.day <= _daysInMonth(y, mo)) candidates.add(at(y, mo, s.day));
      }
    }
    candidates.sort();
    var stop = false;
    for (final c in candidates) {
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
    if (r.until != null && (candidates.isEmpty ? s : candidates.first).isAfter(r.until!)) break;
  }
  return out;
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
    if (freq == 'DAILY' || freq == 'YEARLY') throw const FormatException('BYDAY is only supported with WEEKLY or MONTHLY');
    for (final d in parts['BYDAY']!.split(',')) {
      final m = _byDay.firstMatch(d);
      if (m == null) throw FormatException('invalid BYDAY value', d);
      final n = m.group(1) == null ? 0 : int.parse(m.group(1)!);
      if (n != 0 && freq != 'MONTHLY') throw const FormatException('BYDAY ordinals are only supported with MONTHLY');
      byDay.add((n, _weekdays.indexOf(m.group(2)!)));
    }
  }
  final byMonthDay = <int>[];
  if (parts.containsKey('BYMONTHDAY')) {
    if (freq != 'MONTHLY') throw const FormatException('BYMONTHDAY is only supported with MONTHLY');
    if (byDay.isNotEmpty) throw const FormatException('BYDAY and BYMONTHDAY cannot be combined');
    byMonthDay.addAll(parts['BYMONTHDAY']!.split(',').map((x) => _num(x, 1, 31, true)));
  }
  final byMonth = <int>[];
  if (parts.containsKey('BYMONTH')) {
    if (freq != 'YEARLY') throw const FormatException('BYMONTH is only supported with YEARLY');
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

String _format(DateTime c) {
  String two(int v) => v.toString().padLeft(2, '0');
  return '${c.year.toString().padLeft(4, '0')}-${two(c.month)}-${two(c.day)}T${two(c.hour)}:${two(c.minute)}:${two(c.second)}Z';
}
