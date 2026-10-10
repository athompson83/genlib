// SPDX-License-Identifier: Apache-2.0
/// Hand-parsed IPv4/IPv6 addresses, CIDR membership and an SSRF guard ([isPublicIp]) with identical rules in every
/// Genlib language; no platform address parser is used.
///
/// SSRF use: resolve the hostname yourself, check EVERY resolved address with [isPublicIp], then connect to that checked
/// address (no second DNS lookup), and re-check after every redirect.
library;

import 'dart:typed_data';

final _dec = RegExp(r'^(0|[1-9][0-9]{0,2})$');
final _hexGroup = RegExp(r'^[0-9A-Fa-f]{1,4}$');
final _v6Chars = RegExp(r'^[0-9A-Fa-f:.]+$');

final _v4Special = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
].map(_parseCidr).toList();
final _v6Special = [
  '::/128',
  '::1/128',
  '100::/64',
  '2001::/23',
  '2001:db8::/32',
  '2002::/16',
  'fc00::/7',
  'fe80::/10',
  'ff00::/8',
].map(_parseCidr).toList();
const _nat64 = [0, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0];

/// Parses dotted IPv4 (four decimal parts 0-255, no leading zeros) to 4 bytes or RFC 4291 IPv6 text to 16 bytes.
/// Zone ids, brackets, whitespace and CIDR suffixes throw [FormatException].
Uint8List parseIp(String text) {
  final b = text.contains(':') ? _parseV6(text) : _parseV4(text);
  if (b == null) throw FormatException('invalid IP address', text);
  return b;
}

/// RFC 5952 text: lowercase, no leading zeros, longest zero run as `::`; IPv4-mapped as `::ffff:a.b.c.d`.
String canonicalIp(String text) => _format(parseIp(text));

/// True when [ip] is inside [cidr] (`address/prefix`). Different families never match. Throws [FormatException] for a
/// malformed CIDR, a CIDR with host bits set, or a malformed address.
bool cidrContains(String cidr, String ip) {
  final (net, prefix) = _parseCidr(cidr);
  final x = parseIp(ip);
  return x.length == net.length && _prefixEqual(net, x, prefix);
}

/// False for loopback, private, link-local, shared, documentation, multicast, reserved and other special ranges.
/// IPv4-mapped (`::ffff:0:0/96`) and NAT64 (`64:ff9b::/96`) addresses are judged by their embedded IPv4 address.
/// Throws [FormatException] for a malformed address.
bool isPublicIp(String ip) {
  var b = parseIp(ip);
  if (b.length == 16 && (_isMapped(b) || _startsWith(b, _nat64))) b = Uint8List.sublistView(b, 12);
  for (final (net, prefix) in b.length == 4 ? _v4Special : _v6Special) {
    if (_prefixEqual(net, b, prefix)) return false;
  }
  return true;
}

(Uint8List, int) _parseCidr(String cidr) {
  final slash = cidr.indexOf('/');
  if (slash < 0 || cidr.indexOf('/', slash + 1) >= 0) throw FormatException('CIDR must be address/prefix', cidr);
  final net = parseIp(cidr.substring(0, slash));
  final p = cidr.substring(slash + 1);
  if (!_dec.hasMatch(p)) throw FormatException('invalid CIDR prefix', cidr);
  final prefix = int.parse(p);
  if (prefix > net.length * 8) throw FormatException('CIDR prefix too long', cidr);
  for (var bit = prefix; bit < net.length * 8; bit++) {
    if (net[bit >> 3] & (0x80 >> (bit & 7)) != 0) throw FormatException('CIDR has host bits set', cidr);
  }
  return (net, prefix);
}

bool _prefixEqual(List<int> a, List<int> b, int prefix) {
  if (a.length != b.length) return false;
  for (var bit = 0; bit < prefix; bit++) {
    final mask = 0x80 >> (bit & 7);
    if (a[bit >> 3] & mask != b[bit >> 3] & mask) return false;
  }
  return true;
}

bool _startsWith(List<int> b, List<int> prefix) {
  for (var i = 0; i < prefix.length; i++) {
    if (b[i] != prefix[i]) return false;
  }
  return true;
}

bool _isMapped(List<int> b) => _startsWith(b, const [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff]);

Uint8List? _parseV4(String s) {
  final parts = s.split('.');
  if (parts.length != 4) return null;
  final out = Uint8List(4);
  for (var i = 0; i < 4; i++) {
    if (!_dec.hasMatch(parts[i])) return null;
    final v = int.parse(parts[i]);
    if (v > 255) return null;
    out[i] = v;
  }
  return out;
}

Uint8List? _parseV6(String s) {
  if ('::'.allMatches(s).length > 1 || !_v6Chars.hasMatch(s)) return null;
  List<int> tail = const [];
  if (s.contains('.')) {
    final i = s.lastIndexOf(':');
    final v4 = _parseV4(s.substring(i + 1));
    if (v4 == null) return null;
    tail = v4;
    s = i >= 1 && s[i - 1] == ':' ? s.substring(0, i + 1) : s.substring(0, i);
  }
  final need = tail.isEmpty ? 8 : 6;
  List<int> groups;
  final dc = s.indexOf('::');
  if (dc >= 0) {
    final a = _groups(s.substring(0, dc)), b = _groups(s.substring(dc + 2));
    if (a == null || b == null || a.length + b.length > need - 1) return null;
    groups = [...a, for (var i = 0; i < need - a.length - b.length; i++) 0, ...b];
  } else {
    final g = _groups(s);
    if (g == null || g.length != need) return null;
    groups = g;
  }
  final out = Uint8List(16);
  for (var i = 0; i < groups.length; i++) {
    out[2 * i] = groups[i] >> 8;
    out[2 * i + 1] = groups[i] & 0xff;
  }
  out.setRange(12, 12 + tail.length, tail);
  return out;
}

List<int>? _groups(String x) {
  if (x.isEmpty) return [];
  final result = <int>[];
  for (final h in x.split(':')) {
    if (!_hexGroup.hasMatch(h)) return null;
    result.add(int.parse(h, radix: 16));
  }
  return result;
}

String _format(Uint8List b) {
  if (b.length == 4) return b.join('.');
  if (_isMapped(b)) return '::ffff:${b.sublist(12).join('.')}';
  final g = [for (var i = 0; i < 8; i++) (b[2 * i] << 8) | b[2 * i + 1]];
  var best = -1, bestLen = 1;
  for (var i = 0; i < 8;) {
    if (g[i] != 0) {
      i++;
      continue;
    }
    var j = i;
    while (j < 8 && g[j] == 0) {
      j++;
    }
    if (j - i > bestLen) {
      best = i;
      bestLen = j - i;
    }
    i = j;
  }
  String hex(Iterable<int> xs) => xs.map((x) => x.toRadixString(16)).join(':');
  if (best < 0) return hex(g);
  return '${hex(g.sublist(0, best))}::${hex(g.sublist(best + bestLen))}';
}
