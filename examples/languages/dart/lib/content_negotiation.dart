// SPDX-License-Identifier: Apache-2.0
/// Server-driven content negotiation for Accept (media types) and Accept-Language (RFC 4647 basic filtering). The most
/// specific matching range sets each candidate's q; the highest q above zero wins and ties go to the earlier entry.
library;

final _mediaRange = RegExp(r"^[!#$%&'*+.^_`|~0-9a-z-]+/[!#$%&'*+.^_`|~0-9a-z-]+$");
final _languageRange = RegExp(r'^(\*|[a-z]{1,8}(-[a-z0-9]{1,8})*)$');
final _qValue = RegExp(r'^(0(\.[0-9]{0,3})?|1(\.0{0,3})?)$');

/// Picks the best of [available] (`type/subtype`) for an Accept header; a null or blank header selects the first
/// available type, and no acceptable type returns null. Ranges: exact (3) beats `type/*` (2) beats `*/*` (1).
String? negotiateMediaType(String? acceptHeader, List<String> available) {
  if (acceptHeader == null || acceptHeader.trim().isEmpty) return available.isEmpty ? null : available.first;
  final ranges = _parseAccept(acceptHeader).where((r) => _mediaRange.hasMatch(r.$1)).toList();
  return _best(available, ranges, (candidate, range) {
    final t = candidate.toLowerCase().split('/');
    if (t.length != 2) throw ArgumentError.value(candidate, 'available', 'must be type/subtype');
    final r = range.split('/');
    if (r[0] == t[0] && r[1] == t[1]) return 3;
    if (r[0] == t[0] && r[1] == '*') return 2;
    return r[0] == '*' && r[1] == '*' ? 1 : 0;
  });
}

/// Picks the best of [available] language tags for an Accept-Language header (returned in its original case). `*`
/// matches everything (specificity 1); a range matches a tag equal to it or starting with range + `-` (2 + dashes).
String? negotiateLanguage(String? acceptLanguage, List<String> available) {
  if (acceptLanguage == null || acceptLanguage.trim().isEmpty) return available.isEmpty ? null : available.first;
  final ranges = _parseAccept(acceptLanguage).where((r) => _languageRange.hasMatch(r.$1)).toList();
  return _best(available, ranges, (candidate, range) {
    if (range == '*') return 1;
    final tag = candidate.toLowerCase();
    return tag == range || tag.startsWith('$range-') ? 2 + '-'.allMatches(range).length : 0;
  });
}

String? _best(List<String> available, List<(String, double)> ranges, int Function(String, String) specificity) {
  String? best;
  var bestQ = 0.0;
  for (final candidate in available) {
    var matchSpec = 0;
    var matchQ = 0.0;
    for (final (value, q) in ranges) {
      final spec = specificity(candidate, value);
      if (spec > matchSpec) {
        matchSpec = spec;
        matchQ = q;
      }
    }
    if (matchSpec > 0 && matchQ > bestQ) {
      best = candidate;
      bestQ = matchQ;
    }
  }
  return best;
}

String _trimSpTab(String s) => s.replaceFirst(RegExp(r'^[ \t]+'), '').replaceFirst(RegExp(r'[ \t]+$'), '');

List<(String, double)> _parseAccept(String header) {
  final items = <(String, double)>[];
  for (final part in header.split(',')) {
    final item = _trimSpTab(part);
    if (item.isEmpty) continue;
    final bits = item.split(';').map(_trimSpTab).toList();
    final q = _parseQ(bits.skip(1));
    if (q == null) continue;
    items.add((bits[0].toLowerCase(), q));
  }
  return items;
}

double? _parseQ(Iterable<String> parameters) {
  var q = 1.0;
  for (final p in parameters) {
    final eq = p.indexOf('=');
    final key = eq < 0 ? p : p.substring(0, eq);
    if (key.trim().toLowerCase() != 'q') continue;
    final value = eq < 0 ? '' : p.substring(eq + 1).trim();
    if (!_qValue.hasMatch(value)) return null;
    var milli = (value.codeUnitAt(0) - 0x30) * 1000;
    for (var i = 2, scale = 100; i < value.length; i++, scale ~/= 10) {
      milli += (value.codeUnitAt(i) - 0x30) * scale;
    }
    q = milli / 1000;
  }
  return q;
}
