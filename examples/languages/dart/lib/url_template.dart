// SPDX-License-Identifier: Apache-2.0
/// RFC 6570 URI Template expansion, levels 1-4. Expressions are `{op? varspec(,varspec)*}` with operators none,
/// `+ # . / ; ? &`; a varspec is a name with an optional `:prefix` (1..9999, strings only, by code point) or `*`
/// (explode). Values are a String, a List<String> or an ordered Map<String, String> (Dart map literals keep insertion
/// order); a missing or null name, an empty list and an empty map are undefined and skipped. Unreserved characters are
/// kept; `+` and `#` (and template literals) also keep reserved characters and existing %XX triplets (RFC 6570 3.1);
/// everything else is percent-encoded as UTF-8 with uppercase hex. Invalid templates throw [UrlTemplateException].
library;

import 'dart:convert';

/// A malformed template or a value that cannot be expanded.
class UrlTemplateException implements Exception {
  final String message;
  const UrlTemplateException(this.message);
  @override
  String toString() => 'UrlTemplateException: $message';
}

const _unreserved = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
const _reserved = ":/?#[]@!\$&'()*+,;=";
final _varname = RegExp(r'^(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})(?:\.?(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2}))*$');
final _varspec = RegExp(r'^([^:*]+)(?::([0-9]+)|(\*))?$');

// Operator table: first, separator, named, if-empty, allow reserved (RFC 6570 Appendix A).
const _ops = <String, (String, String, bool, String, bool)>{
  '': ('', ',', false, '', false),
  '+': ('', ',', false, '', true),
  '#': ('#', ',', false, '', true),
  '.': ('.', '.', false, '', false),
  '/': ('/', '/', false, '', false),
  ';': (';', ';', true, '', false),
  '?': ('?', '&', true, '=', false),
  '&': ('&', '&', true, '=', false),
};

bool _isHex(int c) => (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);

String _enc(String s, bool allowReserved) {
  final cps = s.runes.toList();
  final out = StringBuffer();
  for (var i = 0; i < cps.length; i++) {
    final c = cps[i];
    if (allowReserved && c == 0x25 && i + 2 < cps.length && _isHex(cps[i + 1]) && _isHex(cps[i + 2])) {
      out.writeCharCode(c);
      out.writeCharCode(cps[i + 1]);
      out.writeCharCode(cps[i + 2]);
      i += 2;
      continue;
    }
    final ch = String.fromCharCode(c);
    if (c < 0x80 && (_unreserved.contains(ch) || (allowReserved && _reserved.contains(ch)))) {
      out.write(ch);
    } else {
      for (final b in utf8.encode(ch)) {
        out.write('%${b.toRadixString(16).toUpperCase().padLeft(2, '0')}');
      }
    }
  }
  return out.toString();
}

(String, int?, bool) _parseVarspec(String spec) {
  final m = _varspec.firstMatch(spec);
  if (m == null || !_varname.hasMatch(m.group(1)!)) throw UrlTemplateException('bad varspec: $spec');
  int? prefix;
  final digits = m.group(2);
  if (digits != null) {
    final value = digits.length > 5 ? 0 : int.parse(digits);
    if (digits.startsWith('0') || value < 1 || value > 9999) throw UrlTemplateException('bad prefix: $spec');
    prefix = value;
  }
  return (m.group(1)!, prefix, m.group(3) != null);
}

String _expand(String expr, Map<String, Object?> variables) {
  if (expr.isEmpty) throw const UrlTemplateException('empty expression');
  final f = expr[0];
  if ('=,!@|'.contains(f)) throw UrlTemplateException('reserved operator: $f');
  final op = '+#./;?&'.contains(f) ? f : '';
  final (first, sep, named, ifemp, allow) = _ops[op]!;
  final parts = <String>[];
  for (final spec in expr.substring(op.length).split(',')) {
    final (name, prefix, explode) = _parseVarspec(spec);
    final value = variables[name];
    if (value == null || (value is List && value.isEmpty) || (value is Map && value.isEmpty)) continue;
    if (value is String) {
      final v = prefix != null ? String.fromCharCodes(value.runes.take(prefix)) : value;
      if (named) {
        parts.add(_enc(name, allow) + (v.isEmpty ? ifemp : '=${_enc(v, allow)}'));
      } else {
        parts.add(_enc(v, allow));
      }
      continue;
    }
    if (prefix != null) throw UrlTemplateException('prefix on composite value: $name');
    if (value is List) {
      final items = [for (final x in value) x is String ? x : throw UrlTemplateException('unsupported list item in $name')];
      if (!explode) {
        final joined = items.map((x) => _enc(x, allow)).join(',');
        parts.add(named ? '${_enc(name, allow)}=$joined' : joined);
      } else if (named) {
        parts.add(items.map((x) => _enc(name, allow) + (x.isEmpty ? ifemp : '=${_enc(x, allow)}')).join(sep));
      } else {
        parts.add(items.map((x) => _enc(x, allow)).join(sep));
      }
    } else if (value is Map) {
      final entries = [
        for (final e in value.entries)
          (e.key is String && e.value is String) ? (e.key as String, e.value as String) : throw UrlTemplateException('unsupported map entry in $name'),
      ];
      if (!explode) {
        final joined = entries.map((e) => '${_enc(e.$1, allow)},${_enc(e.$2, allow)}').join(',');
        parts.add(named ? '${_enc(name, allow)}=$joined' : joined);
      } else {
        parts.add(entries
            .map((e) => _enc(e.$1, allow) + (named ? (e.$2.isEmpty ? ifemp : '=${_enc(e.$2, allow)}') : '=${_enc(e.$2, allow)}'))
            .join(sep));
      }
    } else {
      throw UrlTemplateException('unsupported value type for $name');
    }
  }
  return parts.isEmpty ? '' : first + parts.join(sep);
}

/// Expands an RFC 6570 template with String, List<String> or ordered Map<String, String> variables.
String expandTemplate(String template, Map<String, Object?> variables) {
  final out = StringBuffer();
  final cps = template.runes.toList();
  var i = 0;
  while (i < cps.length) {
    final c = cps[i];
    if (c == 0x7B) {
      final j = cps.indexOf(0x7D, i);
      if (j < 0) throw const UrlTemplateException('unclosed expression');
      out.write(_expand(String.fromCharCodes(cps.sublist(i + 1, j)), variables));
      i = j + 1;
    } else if (c == 0x7D) {
      throw const UrlTemplateException('stray }');
    } else if (c == 0x25 && i + 2 < cps.length && _isHex(cps[i + 1]) && _isHex(cps[i + 2])) {
      // RFC 6570 section 3.1: a pct-encoded triplet in a literal is copied as-is.
      out.write(String.fromCharCodes(cps.sublist(i, i + 3)));
      i += 3;
    } else {
      out.write(_enc(String.fromCharCode(c), true));
      i++;
    }
  }
  return out.toString();
}
