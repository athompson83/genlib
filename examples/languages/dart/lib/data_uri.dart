// SPDX-License-Identifier: Apache-2.0
/// data: URLs (RFC 2397 with simplified WHATWG fetch rules). [parseDataUri] lowercases the media type (default
/// text/plain with charset US-ASCII), keeps parameters in order (first wins), percent-decodes the body to bytes and
/// strictly decodes base64. [buildDataUri] picks base64 for binary or non-text types unless told otherwise. Throws
/// [FormatException].
library;

import 'dart:convert';
import 'dart:typed_data';

import 'src/header_params.dart';

/// A parsed data: URL.
class DataUri {
  /// Lowercased `type/subtype`.
  final String mime;

  /// Parameters in order (names lowercased, values as given).
  final Map<String, String> params;

  /// Whether the body was base64.
  final bool base64;

  /// The decoded body bytes.
  final Uint8List data;

  const DataUri(this.mime, this.params, this.base64, this.data);
}

const _tchar = r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+";
final _mime = RegExp('^$_tchar/$_tchar\$');
final _mediaType = RegExp('^$_tchar/$_tchar(?:\\s*;\\s*$_tchar=[^;,\\s]+)*\$');
final _b64Suffix = RegExp(r';\s*base64\s*$', caseSensitive: false);
const _b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/// Parses a data: URL; throws [FormatException] when it is not one or its base64 body is invalid.
DataUri parseDataUri(String url) {
  if (url.length < 5 || url.substring(0, 5).toLowerCase() != 'data:') throw const FormatException('not a data: URL');
  final rest = url.substring(5);
  final comma = rest.indexOf(',');
  if (comma < 0) throw const FormatException('missing comma');
  var header = rest.substring(0, comma).trim();
  final body = rest.substring(comma + 1);
  var isB64 = false;
  final m = _b64Suffix.firstMatch(header);
  if (m != null) {
    isB64 = true;
    header = header.substring(0, m.start);
  }
  final parts = header.split(';');
  var mime = parts[0].trim().toLowerCase();
  var params = <String, String>{};
  for (final p in parts.skip(1)) {
    final eq = p.indexOf('=');
    if (eq < 0) continue;
    final k = p.substring(0, eq).trim().toLowerCase();
    if (k.isNotEmpty && !params.containsKey(k)) params[k] = p.substring(eq + 1).trim();
  }
  if (!_mime.hasMatch(mime)) {
    mime = 'text/plain';
    if (!params.containsKey('charset')) params = {'charset': 'US-ASCII', ...params};
  }
  var data = percentDecodeBytes(body);
  if (isB64) {
    final s = [
      for (final b in data)
        if (b != 0x09 && b != 0x0A && b != 0x0C && b != 0x0D && b != 0x20) b
    ];
    var end = s.length;
    if (end >= 2 && s[end - 1] == 0x3D && s[end - 2] == 0x3D) {
      end -= 2;
    } else if (end >= 1 && s[end - 1] == 0x3D) {
      end -= 1;
    }
    final chars = s.sublist(0, end);
    if (chars.length % 4 == 1 || chars.any((c) => !_b64.codeUnits.contains(c))) {
      throw const FormatException('invalid base64');
    }
    // Clear unused trailing bits so decoding is lenient about them, like the reference.
    final rem = chars.length % 4;
    if (rem != 0) {
      final v = _b64.indexOf(String.fromCharCode(chars.last));
      chars[chars.length - 1] = _b64.codeUnitAt(rem == 2 ? v & 0x30 : v & 0x3C);
    }
    final padded = String.fromCharCodes(chars) + '=' * ((4 - rem) % 4);
    data = base64.decode(padded);
  }
  return DataUri(mime, params, isB64, Uint8List.fromList(data));
}

bool _keep(int b) =>
    (b >= 0x41 && b <= 0x5A) ||
    (b >= 0x61 && b <= 0x7A) ||
    (b >= 0x30 && b <= 0x39) ||
    "-_.!~*'();/?:@&=+\$,".codeUnits.contains(b);

/// Builds a data: URL. [useBase64] null picks base64 unless [mime] is textual and [data] is valid UTF-8.
String buildDataUri(List<int> data, {String mime = 'application/octet-stream', bool? useBase64}) {
  if (!_mediaType.hasMatch(mime)) throw const FormatException('invalid media type');
  if (useBase64 == null) {
    final base = mime.split(';')[0].trim().toLowerCase();
    final textual = base.startsWith('text/') ||
        base.endsWith('+json') ||
        base.endsWith('+xml') ||
        base == 'application/json' ||
        base == 'application/xml' ||
        base == 'application/javascript';
    useBase64 = !(textual && strictUtf8(data) != null);
  }
  if (useBase64) return 'data:$mime;base64,${base64.encode(data)}';
  final sb = StringBuffer('data:$mime,');
  for (final b in data) {
    if (_keep(b)) {
      sb.writeCharCode(b);
    } else {
      sb.write('%${b.toRadixString(16).toUpperCase().padLeft(2, '0')}');
    }
  }
  return sb.toString();
}
