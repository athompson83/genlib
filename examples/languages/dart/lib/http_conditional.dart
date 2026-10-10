// SPDX-License-Identifier: Apache-2.0
/// Entity tags, IMF-fixdate HTTP dates and RFC 9110 section 13 conditional request evaluation.
library;

final _entityTag = RegExp(r'^(?:W/)?"[\x21\x23-\x7e\x80-\xff]*"$');
const _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
final _fixDate = RegExp(
  r'^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), ([0-9]{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) '
  r'([0-9]{4}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) GMT$',
);

/// A parsed If-Match/If-None-Match value: the wildcard `*` or a list of valid entity tags.
class EntityTags {
  final bool isWildcard;
  final List<String> tags;
  const EntityTags(this.isWildcard, this.tags);
}

/// Parses If-Match/If-None-Match: `*` after trimming, or the valid entity tags among comma-separated items.
EntityTags parseEtags(String header) {
  final h = _trimSpTab(header);
  if (h == '*') return const EntityTags(true, []);
  return EntityTags(false, h.split(',').map(_trimSpTab).where(_entityTag.hasMatch).toList());
}

/// Strong comparison: neither tag is weak and both are identical.
bool strongMatch(String a, String b) => !a.startsWith('W/') && !b.startsWith('W/') && a == b;

/// Weak comparison: identical after removing a leading `W/`.
bool weakMatch(String a, String b) => _opaque(a) == _opaque(b);

/// Returns 200, 304 or 412 following RFC 9110 13.2.2: If-Match, else If-Unmodified-Since; then If-None-Match, else
/// If-Modified-Since (GET/HEAD only). Null arguments are "not sent" or "unknown"; [lastModified] is unix seconds and
/// dates that are not an exact IMF-fixdate are ignored.
int evaluateConditional({
  required String method,
  String? etag,
  int? lastModified,
  String? ifMatch,
  String? ifNoneMatch,
  String? ifModifiedSince,
  String? ifUnmodifiedSince,
}) {
  final safe = method == 'GET' || method == 'HEAD';
  if (ifMatch != null) {
    final tags = parseEtags(ifMatch);
    if (tags.isWildcard) {
      if (etag == null) return 412;
    } else if (etag == null || !tags.tags.any((t) => strongMatch(t, etag))) {
      return 412;
    }
  } else if (ifUnmodifiedSince != null && lastModified != null) {
    final d = parseHttpDate(ifUnmodifiedSince);
    if (d != null && lastModified > d) return 412;
  }
  if (ifNoneMatch != null) {
    final tags = parseEtags(ifNoneMatch);
    final hit = etag != null && (tags.isWildcard || tags.tags.any((t) => weakMatch(t, etag)));
    if (hit) return safe ? 304 : 412;
  } else if (ifModifiedSince != null && safe && lastModified != null) {
    final d = parseHttpDate(ifModifiedSince);
    if (d != null && lastModified <= d) return 304;
  }
  return 200;
}

/// Formats unix seconds as an IMF-fixdate, for example `Wed, 21 Oct 2026 07:28:00 GMT`.
String formatHttpDate(int unixSeconds) {
  final days = unixSeconds ~/ 86400 - (unixSeconds % 86400 != 0 && unixSeconds < 0 ? 1 : 0);
  final secs = unixSeconds - days * 86400;
  final (y, m, d) = civilFromDays(days);
  if (y < 1 || y > 9999) throw RangeError('year must be 1..9999');
  String two(int v) => v.toString().padLeft(2, '0');
  return '${_days[(days + 3) % 7]}, ${two(d)} ${_months[m - 1]} ${y.toString().padLeft(4, '0')} '
      '${two(secs ~/ 3600)}:${two(secs ~/ 60 % 60)}:${two(secs % 60)} GMT';
}

/// Parses an exact IMF-fixdate (it must round-trip, weekday included) to unix seconds, or null.
int? parseHttpDate(String text) {
  final m = _fixDate.firstMatch(text);
  if (m == null) return null;
  final day = int.parse(m.group(2)!), month = _months.indexOf(m.group(3)!) + 1, year = int.parse(m.group(4)!);
  final h = int.parse(m.group(5)!), mi = int.parse(m.group(6)!), s = int.parse(m.group(7)!);
  if (year < 1 || day < 1 || day > daysInMonth(year, month) || h > 23 || mi > 59 || s > 59) return null;
  final days = daysFromCivil(year, month, day);
  if (_days[(days + 3) % 7] != m.group(1)) return null;
  return days * 86400 + h * 3600 + mi * 60 + s;
}

/// Days in [month] (1-12) of the proleptic Gregorian [year].
int daysInMonth(int year, int month) => month == 2
    ? (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) ? 29 : 28)
    : const [4, 6, 9, 11].contains(month)
    ? 30
    : 31;

/// Days since 1970-01-01 for a proleptic Gregorian civil date.
int daysFromCivil(int y, int m, int d) {
  y -= m <= 2 ? 1 : 0;
  final era = (y >= 0 ? y : y - 399) ~/ 400;
  final yoe = y - era * 400;
  final doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) ~/ 5 + d - 1;
  final doe = yoe * 365 + yoe ~/ 4 - yoe ~/ 100 + doy;
  return era * 146097 + doe - 719468;
}

/// The proleptic Gregorian civil date `(year, month, day)` for days since 1970-01-01.
(int, int, int) civilFromDays(int z) {
  z += 719468;
  final era = (z >= 0 ? z : z - 146096) ~/ 146097;
  final doe = z - era * 146097;
  final yoe = (doe - doe ~/ 1460 + doe ~/ 36524 - doe ~/ 146096) ~/ 365;
  final doy = doe - (365 * yoe + yoe ~/ 4 - yoe ~/ 100);
  final mp = (5 * doy + 2) ~/ 153;
  final d = doy - (153 * mp + 2) ~/ 5 + 1;
  final m = mp < 10 ? mp + 3 : mp - 9;
  return (yoe + era * 400 + (m <= 2 ? 1 : 0), m, d);
}

String _opaque(String e) => e.startsWith('W/') ? e.substring(2) : e;

String _trimSpTab(String s) => s.replaceFirst(RegExp(r'^[ \t]+'), '').replaceFirst(RegExp(r'[ \t]+$'), '');
