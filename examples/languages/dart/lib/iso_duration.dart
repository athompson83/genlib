// SPDX-License-Identifier: Apache-2.0
/// ISO 8601 durations (`P1Y2M3DT4H5M6.5S`, `P2W`): parse, exact length and canonical formatting.
library;

/// The components of a parsed duration; seconds and their fraction are stored as [milliseconds].
class IsoDuration {
  final int years, months, weeks, days, hours, minutes, milliseconds;
  const IsoDuration({this.years = 0, this.months = 0, this.weeks = 0, this.days = 0, this.hours = 0, this.minutes = 0, this.milliseconds = 0});

  @override
  bool operator ==(Object other) =>
      other is IsoDuration &&
      other.years == years &&
      other.months == months &&
      other.weeks == weeks &&
      other.days == days &&
      other.hours == hours &&
      other.minutes == minutes &&
      other.milliseconds == milliseconds;

  @override
  int get hashCode => Object.hash(years, months, weeks, days, hours, minutes, milliseconds);

  @override
  String toString() => 'IsoDuration(y=$years, mo=$months, w=$weeks, d=$days, h=$hours, mi=$minutes, ms=$milliseconds)';
}

final _pattern = RegExp(r'^P(?:([0-9]+)Y)?(?:([0-9]+)M)?(?:([0-9]+)W)?(?:([0-9]+)D)?'
    r'(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)(?:\.([0-9]{1,3}))?S)?)?$');
const _maxInt = 9223372036854775807;

/// Parses an uppercase ISO 8601 duration; throws [FormatException] for anything outside the grammar.
IsoDuration parseDuration(String s) {
  final m = _pattern.firstMatch(s);
  if (m == null || s.endsWith('T') || List.generate(7, (i) => m.group(i + 1)).every((g) => g == null)) {
    throw FormatException('invalid ISO 8601 duration', s);
  }
  int n(int group) {
    final g = m.group(group);
    if (g == null) return 0;
    final v = int.tryParse(g);
    if (v == null) throw FormatException('duration component too large', s);
    return v;
  }

  final seconds = n(7);
  if (seconds > _maxInt ~/ 1000 - 1) throw FormatException('duration seconds too large', s);
  final frac = m.group(8);
  return IsoDuration(
    years: n(1),
    months: n(2),
    weeks: n(3),
    days: n(4),
    hours: n(5),
    minutes: n(6),
    milliseconds: seconds * 1000 + (frac == null ? 0 : int.parse(frac.padRight(3, '0'))),
  );
}

/// The exact length in milliseconds (a week is 7 days, a day 24 hours). Throws [ArgumentError] when
/// years or months are set (their length depends on the calendar) and [RangeError] on overflow.
int durationMilliseconds(IsoDuration d) {
  if (d.years != 0 || d.months != 0) throw ArgumentError('years and months have no exact length');
  final total = ((((BigInt.from(d.weeks) * BigInt.from(7) + BigInt.from(d.days)) * BigInt.from(24) + BigInt.from(d.hours)) * BigInt.from(60) +
                  BigInt.from(d.minutes)) *
              BigInt.from(60000)) +
      BigInt.from(d.milliseconds);
  if (total.bitLength > 63 || total.isNegative) throw RangeError('duration exceeds 64-bit milliseconds');
  return total.toInt();
}

/// Formats non-negative milliseconds as days, hours, minutes and seconds (`PT0S` for zero).
String formatDuration(int milliseconds) {
  if (milliseconds < 0) throw RangeError.value(milliseconds, 'milliseconds', 'must be >= 0');
  final d = milliseconds ~/ 86400000, h = milliseconds % 86400000 ~/ 3600000;
  final mi = milliseconds % 3600000 ~/ 60000, s = milliseconds % 60000 ~/ 1000, f = milliseconds % 1000;
  final out = StringBuffer('P');
  if (d > 0) out.write('${d}D');
  final t = StringBuffer();
  if (h > 0) t.write('${h}H');
  if (mi > 0) t.write('${mi}M');
  if (s > 0 || f > 0) {
    t.write(s);
    if (f > 0) t.write('.${f.toString().padLeft(3, '0').replaceFirst(RegExp(r'0+$'), '')}');
    t.write('S');
  }
  if (t.isNotEmpty) out.write('T$t');
  return out.length == 1 ? 'PT0S' : out.toString();
}
