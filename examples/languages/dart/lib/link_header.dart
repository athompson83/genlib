// SPDX-License-Identifier: Apache-2.0
/// HTTP Link header (RFC 8288): parse into ordered links, find a link by rel, format back. Commas inside <...> and quoted
/// strings do not split; parameter names are lowercased; RFC 8187 `name*` values win over the plain form and are stored
/// without '*'; otherwise the first occurrence wins; rel is lowercased with whitespace collapsed. Throws
/// [FormatException] on malformed input.
library;

import 'src/header_params.dart';

/// One link-value: target URI and ordered parameters.
class Link {
  /// The URI between '<' and '>', as written.
  final String uri;

  /// Parameters in order (names lowercased, without '*').
  final Map<String, String> params;

  const Link(this.uri, this.params);
}

final _unquoted = RegExp(r'[^,;\s]*');

/// Parses a Link header value into links in order; an empty value gives [].
List<Link> parseLinkHeader(String s) {
  var i = 0;
  final n = s.length;
  final links = <Link>[];
  void ws() {
    while (i < n && (s[i] == ' ' || s[i] == '\t')) {
      i++;
    }
  }

  while (true) {
    ws();
    if (i >= n) break;
    if (s[i] == ',') {
      i++;
      continue;
    }
    if (s[i] != '<') throw const FormatException('expected <');
    final end = s.indexOf('>', i);
    if (end < 0) throw const FormatException('unterminated <');
    final uri = s.substring(i + 1, end);
    i = end + 1;
    final params = <String, String>{};
    final ext = <String>{};
    while (true) {
      ws();
      if (i >= n || s[i] == ',') break;
      if (s[i] != ';') throw const FormatException('expected ;');
      i++;
      ws();
      final m = headerTokenPrefix.matchAsPrefix(s, i);
      if (m == null) throw const FormatException('expected parameter name');
      final name = m.group(0)!.toLowerCase();
      i = m.end;
      ws();
      var val = '';
      if (i < n && s[i] == '=') {
        i++;
        ws();
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
          final u = _unquoted.matchAsPrefix(s, i)!;
          val = u.group(0)!;
          i = u.end;
        }
      }
      if (name.endsWith('*')) {
        final base = name.substring(0, name.length - 1);
        params[base] = decodeExtValue(val);
        ext.add(base);
      } else if (!ext.contains(name) && !params.containsKey(name)) {
        params[name] = val;
      }
    }
    final rel = params['rel'];
    if (rel != null) params['rel'] = rel.toLowerCase().split(RegExp(r'\s+')).where((x) => x.isNotEmpty).join(' ');
    links.add(Link(uri, params));
  }
  return links;
}

/// The first link whose rel list contains [rel] (case-insensitive), else null.
Link? findRel(List<Link> links, String rel) {
  final want = rel.toLowerCase();
  for (final l in links) {
    if ((l.params['rel'] ?? '').split(RegExp(r'\s+')).contains(want)) return l;
  }
  return null;
}

/// Formats links as `<uri>; rel="next"; ...` joined with ", "; non-printable-ASCII values use `name*=UTF-8''<pct>`.
String formatLinkHeader(List<Link> links) => links.map((l) {
      final parts = ['<${l.uri}>'];
      l.params.forEach((k, v) {
        if (v.runes.any((c) => c > 0x7E || c < 0x20)) {
          parts.add("$k*=UTF-8''${encodeAttrChars(v)}");
        } else {
          parts.add(headerToken.hasMatch(v) && k != 'rel' ? '$k=$v' : '$k=${quoteHeaderValue(v)}');
        }
      });
      return parts.join('; ');
    }).join(', ');
