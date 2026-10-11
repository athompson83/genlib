// SPDX-License-Identifier: Apache-2.0
/// Cache-Control (RFC 9111): parse into an ordered map whose values are `true` (bare directive), an [int] (delta-seconds
/// directives) or a [String]; format back; compute freshness seconds. Names are lowercased and the first occurrence
/// wins; invalid delta values are dropped (as are values beyond a 64-bit int); unparseable items are skipped to the next
/// comma. Throws [FormatException] on an unterminated quote.
library;

import 'src/header_params.dart';

const _delta = {'max-age', 's-maxage', 'stale-while-revalidate', 'stale-if-error', 'max-stale', 'min-fresh'};
final _digits = RegExp(r'^[0-9]+$');

/// Parses a Cache-Control value into {directive: true | int | String} in order.
Map<String, Object> parseCacheControl(String s) {
  final out = <String, Object>{};
  var i = 0;
  final n = s.length;
  int nextComma(int from) {
    final j = s.indexOf(',', from);
    return j < 0 ? n : j;
  }

  while (i < n) {
    while (i < n && (s[i] == ' ' || s[i] == '\t' || s[i] == ',')) {
      i++;
    }
    if (i >= n) break;
    final m = headerTokenPrefix.matchAsPrefix(s, i);
    if (m == null) {
      i = nextComma(i);
      continue;
    }
    final name = m.group(0)!.toLowerCase();
    i = m.end;
    Object val = true;
    while (i < n && (s[i] == ' ' || s[i] == '\t')) {
      i++;
    }
    if (i < n && s[i] == '=') {
      i++;
      while (i < n && (s[i] == ' ' || s[i] == '\t')) {
        i++;
      }
      if (i < n && s[i] == '"') {
        i++;
        final buf = StringBuffer();
        while (true) {
          if (i >= n) throw const FormatException('unterminated quote');
          final c = s[i];
          if (c == '\\' && i + 1 < n) {
            buf.write(s[i + 1]);
            i += 2;
            continue;
          }
          if (c == '"') {
            i++;
            break;
          }
          buf.write(c);
          i++;
        }
        val = buf.toString();
      } else {
        final t = headerTokenPrefix.matchAsPrefix(s, i);
        val = t?.group(0) ?? '';
        if (t != null) i = t.end;
      }
    }
    i = nextComma(i);
    if (_delta.contains(name)) {
      if (val == true && name != 'max-stale') continue;
      if (val is String) {
        final v = _digits.hasMatch(val) ? int.tryParse(val) : null;
        if (v == null) continue;
        val = v;
      }
    }
    out.putIfAbsent(name, () => val);
  }
  return out;
}

/// Formats directives in order: true -> name, int -> name=N, strings quoted unless they are tokens.
String formatCacheControl(Map<String, Object> d) => d.entries.map((e) {
      final v = e.value;
      if (v == true) return e.key;
      if (v is int) return '${e.key}=$v';
      final s = v.toString();
      return headerToken.hasMatch(s) ? '${e.key}=$s' : '${e.key}=${quoteHeaderValue(s)}';
    }).join(', ');

/// Freshness lifetime in seconds: 0 for no-store/no-cache, s-maxage for [shared] caches, else max-age, else null.
int? cacheFreshness(Map<String, Object> d, {bool shared = false}) {
  if (d.containsKey('no-store') || d.containsKey('no-cache')) return 0;
  final s = d['s-maxage'];
  if (shared && s is int) return s;
  final m = d['max-age'];
  return m is int ? m : null;
}
