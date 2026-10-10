// SPDX-License-Identifier: Apache-2.0
/// Full-jitter exponential backoff and HTTP Retry-After parsing.
library;

/// floor(randomFraction * min(capMs, baseMs * 2^attempt)); the cap is applied before any overflow can occur.
int backoffDelay(int attempt, int baseMs, int capMs, double randomFraction) {
  if (attempt < 0) throw RangeError.value(attempt, 'attempt', 'must be >= 0');
  if (baseMs <= 0) throw RangeError.value(baseMs, 'baseMs', 'must be > 0');
  if (capMs < baseMs) throw RangeError.value(capMs, 'capMs', 'must be >= baseMs');
  if (!(randomFraction >= 0 && randomFraction < 1)) {
    throw RangeError.value(randomFraction, 'randomFraction', 'must be in [0, 1)');
  }
  var ceiling = capMs;
  if (attempt < 63 && baseMs <= (capMs >> attempt)) {
    final grown = baseMs << attempt;
    if (grown < ceiling) ceiling = grown;
  }
  return (randomFraction * ceiling).floor();
}

const _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
final _imfFixdate = RegExp(r'^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), ([0-9]{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) '
    r'([0-9]{4}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) GMT$');
final _digits = RegExp(r'^[0-9]+$');

/// Milliseconds to wait for a Retry-After value: delay-seconds, or an IMF-fixdate relative to [nowMs] (never negative).
/// Returns null when the value is neither form; throws [RangeError] for an out-of-range number of seconds.
int? retryAfterMs(String headerValue, int nowMs) {
  final v = headerValue.trim();
  if (_digits.hasMatch(v)) {
    final seconds = int.tryParse(v);
    if (seconds == null || seconds > 9223372036854775807 ~/ 1000) throw RangeError.value(v.length, 'headerValue', 'seconds out of range');
    return seconds * 1000;
  }
  final m = _imfFixdate.firstMatch(v);
  if (m == null) return null;
  final n = [for (var i = 4; i <= 7; i++) int.parse(m[i]!)];
  final day = int.parse(m[2]!), month = _months.indexOf(m[3]!) + 1;
  final date = DateTime.utc(n[0], month, day, n[1], n[2], n[3]);
  // Reject rolled-over values (e.g. 31 Feb or 25:00) and a weekday that does not match the date.
  if (date.year != n[0] || date.month != month || date.day != day || date.hour != n[1] || date.minute != n[2] ||
      date.second != n[3] || _days[date.weekday - 1] != m[1]) {
    return null;
  }
  final delta = date.millisecondsSinceEpoch - nowMs;
  return delta > 0 ? delta : 0;
}
