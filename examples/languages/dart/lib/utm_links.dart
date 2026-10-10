// SPDX-License-Identifier: Apache-2.0
/// Builds, parses and cleans campaign-tagged URLs without touching unrelated query parameters.
library;

import 'src/encoding.dart';
import 'src/web_text.dart';

/// UTM keys (without the `utm_` prefix) in output order.
const utmKeys = ['id', 'source', 'medium', 'campaign', 'term', 'content'];

const _trackingParams = {
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'twclid', 'li_fat_id', 'mc_cid', 'mc_eid', '_hsenc', //
  '_hsmi', 'yclid', 'igshid',
};

/// Appends utm_id, utm_source, utm_medium, utm_campaign, utm_term and utm_content (trimmed, lowercased,
/// RFC 3986 encoded) after existing parameters; an existing utm_* of the same name is replaced in place.
/// Blank optional values are skipped. The fragment stays last.
String buildUtmUrl(String baseUrl,
    {required String source, required String medium, required String campaign, String? term, String? content, String? id}) {
  if (!isAbsoluteHttpUrl(baseUrl)) throw ArgumentError.value(baseUrl, 'baseUrl', 'must be an absolute http(s) URL');
  String required(String v, String name) {
    final t = v.trim();
    if (t.isEmpty) throw ArgumentError.value(v, name, 'is required');
    return t.toLowerCase();
  }

  final values = <String, String?>{
    'id': id?.trim().toLowerCase(),
    'source': required(source, 'source'),
    'medium': required(medium, 'medium'),
    'campaign': required(campaign, 'campaign'),
    'term': term?.trim().toLowerCase(),
    'content': content?.trim().toLowerCase(),
  };
  final parts = splitUrl(baseUrl);
  final segments = (parts.query ?? '').split('&').where((s) => s.isNotEmpty).toList();
  for (final key in utmKeys) {
    final value = values[key];
    if (value == null || value.isEmpty) continue;
    final name = 'utm_$key';
    final segment = '$name=${percentEncode(value)}';
    final index = segments.indexWhere((s) => paramName(s) == name);
    if (index < 0) {
      segments.add(segment);
      continue;
    }
    segments[index] = segment;
    for (var i = segments.length - 1; i > index; i--) {
      if (paramName(segments[i]) == name) segments.removeAt(i);
    }
  }
  return joinUrl(parts.head, segments, parts.fragment);
}

/// Reads utm_* parameters into an ordered map keyed without the `utm_` prefix
/// (order: id, source, medium, campaign, term, content; first occurrence wins; `+` is a space).
Map<String, String> parseUtm(String url) {
  if (!isAbsoluteHttpUrl(url)) throw ArgumentError.value(url, 'url', 'must be an absolute http(s) URL');
  final found = <String, String>{};
  for (final segment in (splitUrl(url).query ?? '').split('&')) {
    if (segment.isEmpty) continue;
    final eq = segment.indexOf('=');
    final name = formDecode(eq < 0 ? segment : segment.substring(0, eq));
    if (!name.startsWith('utm_')) continue;
    final key = name.substring(4);
    if (!utmKeys.contains(key) || found.containsKey(key)) continue;
    found[key] = formDecode(eq < 0 ? '' : segment.substring(eq + 1));
  }
  return {for (final key in utmKeys) if (found.containsKey(key)) key: found[key]!};
}

/// Removes utm_* and known click identifiers, keeping other parameters (order and encoding) and the fragment.
String stripTracking(String url) {
  if (!isAbsoluteHttpUrl(url)) throw ArgumentError.value(url, 'url', 'must be an absolute http(s) URL');
  final parts = splitUrl(url);
  final kept = (parts.query ?? '').split('&').where((s) {
    if (s.isEmpty) return false;
    final name = paramName(s);
    return !name.startsWith('utm_') && !_trackingParams.contains(name);
  }).toList();
  return joinUrl(parts.head, kept, parts.fragment);
}
