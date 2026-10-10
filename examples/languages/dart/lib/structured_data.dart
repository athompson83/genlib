// SPDX-License-Identifier: Apache-2.0
/// JSON-LD script elements and HTML meta / Open Graph / Twitter tags.
library;

import 'src/web_text.dart';

const _maxDepth = 64;
const _twitterCards = ['summary', 'summary_large_image', 'app', 'player'];

/// Serializes a map (insertion order) or list to compact JSON inside `<script type="application/ld+json">`,
/// escaping `<`, `>`, `&`, U+2028 and U+2029 as `\uXXXX` so the element cannot be closed early.
String jsonLdScript(Object value) {
  if (value is! Map && value is! List) throw ArgumentError.value(value, 'value', 'JSON-LD root must be a map or a list');
  final out = StringBuffer('<script type="application/ld+json">');
  _writeJson(out, value, 0);
  out.write('</script>');
  return out.toString();
}

/// Returns title, description, canonical, Open Graph and Twitter tags joined by `\n` (no trailing newline).
/// Null or empty optional values are omitted.
String metaTags({
  required String title,
  String? description,
  String? canonical,
  String? image,
  String? siteName,
  String type = 'website',
  String twitterCard = 'summary_large_image',
  String? locale,
}) {
  bool present(String? v) => v != null && v.isNotEmpty;
  if (title.trim().isEmpty) throw ArgumentError.value(title, 'title', 'must not be empty');
  if (present(canonical) && !isAbsoluteHttpUrl(canonical, httpsOnly: true)) {
    throw ArgumentError.value(canonical, 'canonical', 'must be an absolute https URL');
  }
  if (present(image) && !isAbsoluteHttpUrl(image, httpsOnly: true)) {
    throw ArgumentError.value(image, 'image', 'must be an absolute https URL');
  }
  if (type.trim().isEmpty) throw ArgumentError.value(type, 'type', 'must not be empty');
  if (!_twitterCards.contains(twitterCard)) {
    throw ArgumentError.value(twitterCard, 'twitterCard', 'must be one of ${_twitterCards.join(', ')}');
  }
  final lines = <String>['<title>${htmlEscape(title)}</title>'];
  void meta(String attr, String key, String? value) {
    if (present(value)) lines.add('<meta $attr="$key" content="${htmlEscape(value!)}">');
  }

  meta('name', 'description', description);
  if (present(canonical)) lines.add('<link rel="canonical" href="${htmlEscape(canonical!)}">');
  meta('property', 'og:title', title);
  meta('property', 'og:description', description);
  meta('property', 'og:url', canonical);
  meta('property', 'og:image', image);
  meta('property', 'og:site_name', siteName);
  meta('property', 'og:type', type);
  meta('property', 'og:locale', locale);
  meta('name', 'twitter:card', twitterCard);
  meta('name', 'twitter:title', title);
  meta('name', 'twitter:description', description);
  meta('name', 'twitter:image', image);
  return lines.join('\n');
}

void _writeJson(StringBuffer out, Object? value, int depth) {
  if (depth > _maxDepth) throw ArgumentError('JSON-LD nesting exceeds $_maxDepth levels');
  if (value == null) {
    out.write('null');
  } else if (value is bool) {
    out.write(value ? 'true' : 'false');
  } else if (value is String) {
    _writeString(out, value);
  } else if (value is int) {
    out.write(value);
  } else if (value is double) {
    if (!value.isFinite) throw ArgumentError.value(value, 'value', 'JSON-LD numbers must be finite');
    out.write(value == value.truncateToDouble() && value.abs() < 1e15 ? value.toInt().toString() : value.toString());
  } else if (value is Map) {
    out.write('{');
    var first = true;
    value.forEach((key, item) {
      if (key is! String) throw ArgumentError.value(key, 'key', 'JSON-LD keys must be strings');
      if (!first) out.write(',');
      first = false;
      _writeString(out, key);
      out.write(':');
      _writeJson(out, item, depth + 1);
    });
    out.write('}');
  } else if (value is List) {
    out.write('[');
    for (var i = 0; i < value.length; i++) {
      if (i > 0) out.write(',');
      _writeJson(out, value[i], depth + 1);
    }
    out.write(']');
  } else {
    throw ArgumentError.value(value, 'value', 'unsupported JSON-LD value type ${value.runtimeType}');
  }
}

void _writeString(StringBuffer out, String s) {
  out.write('"');
  for (final c in s.codeUnits) {
    switch (c) {
      case 0x22:
        out.write(r'\"');
      case 0x5c:
        out.write(r'\\');
      case 0x08:
        out.write(r'\b');
      case 0x0c:
        out.write(r'\f');
      case 0x0a:
        out.write(r'\n');
      case 0x0d:
        out.write(r'\r');
      case 0x09:
        out.write(r'\t');
      case 0x3c || 0x3e || 0x26 || 0x2028 || 0x2029:
        out.write('\\u${c.toRadixString(16).padLeft(4, '0')}');
      default:
        if (c < 0x20) {
          out.write('\\u${c.toRadixString(16).padLeft(4, '0')}');
        } else {
          out.writeCharCode(c);
        }
    }
  }
  out.write('"');
}
