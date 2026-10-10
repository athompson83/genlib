// SPDX-License-Identifier: Apache-2.0
/// RFC 6350 vCard 4.0 export with TEXT escaping and 75-octet UTF-8-safe line folding.
library;

import 'dart:convert';

/// Structured name (N): family; given; additional; prefix; suffix.
class VCardName {
  final String? family, given, additional, prefix, suffix;
  const VCardName({this.family, this.given, this.additional, this.prefix, this.suffix});
}

/// An EMAIL or TEL value with an optional lowercase TYPE parameter such as `work` or `cell`.
class VCardTypedValue {
  final String value;
  final String? type;
  const VCardTypedValue(this.value, {this.type});
}

/// Delivery address (ADR) with an optional TYPE parameter.
class VCardAddress {
  final String? type, poBox, extended, street, locality, region, postalCode, country;
  const VCardAddress(
      {this.type, this.poBox, this.extended, this.street, this.locality, this.region, this.postalCode, this.country});
}

/// Contact fields for [buildVcard]; only [fn] is required.
class VCardContact {
  final String fn;
  final VCardName? n;
  final String? org, title, note, uid;
  final List<VCardTypedValue> emails, phones;
  final VCardAddress? address;
  final List<String> urls;
  const VCardContact(this.fn,
      {this.n,
      this.org,
      this.title,
      this.emails = const [],
      this.phones = const [],
      this.address,
      this.urls = const [],
      this.note,
      this.uid});
}

final _control = RegExp(r'[\x00-\x09\x0b-\x1f\x7f]');
final _type = RegExp(r'^[a-z][a-z0-9-]*$');
final _email = RegExp(r'^[^\s@]+@[^\s@]+$');
final _phone = RegExp(r'^\+?[0-9][0-9 ().-]{1,30}$');
final _url = RegExp(r'^https?://\S+$');

/// Builds a vCard with CRLF line endings in the order BEGIN, VERSION, FN, N, ORG, TITLE, EMAIL, TEL, ADR, URL, NOTE,
/// UID, END. Throws [ArgumentError] for a blank FN, a control character other than newline in a text value, or an
/// invalid TYPE, email, phone or http(s) URL.
String buildVcard(VCardContact c) {
  if (c.fn.trim().isEmpty) throw ArgumentError.value(c.fn, 'fn', 'is required');
  final lines = ['BEGIN:VCARD', 'VERSION:4.0', 'FN:${escapeVcardText(c.fn)}'];
  final n = c.n;
  if (n != null) lines.add('N:${[n.family, n.given, n.additional, n.prefix, n.suffix].map(escapeVcardText).join(';')}');
  if (c.org?.isNotEmpty ?? false) lines.add('ORG:${escapeVcardText(c.org)}');
  if (c.title?.isNotEmpty ?? false) lines.add('TITLE:${escapeVcardText(c.title)}');
  for (final e in c.emails) {
    if (!_email.hasMatch(e.value)) throw ArgumentError.value(e.value, 'email', 'is not an email address');
    lines.add('EMAIL${_typeParam(e.type)}:${escapeVcardText(e.value)}');
  }
  for (final p in c.phones) {
    if (!_phone.hasMatch(p.value)) throw ArgumentError.value(p.value, 'phone', 'is not a phone number');
    lines.add('TEL${_typeParam(p.type)}:${p.value}');
  }
  final a = c.address;
  if (a != null) {
    final parts = [a.poBox, a.extended, a.street, a.locality, a.region, a.postalCode, a.country];
    lines.add('ADR${_typeParam(a.type)}:${parts.map(escapeVcardText).join(';')}');
  }
  for (final u in c.urls) {
    if (!_url.hasMatch(u)) throw ArgumentError.value(u, 'url', 'must be an http(s) URL');
    lines.add('URL:$u');
  }
  if (c.note?.isNotEmpty ?? false) lines.add('NOTE:${escapeVcardText(c.note)}');
  if (c.uid?.isNotEmpty ?? false) lines.add('UID:${escapeVcardText(c.uid)}');
  lines.add('END:VCARD');
  final out = StringBuffer();
  for (final line in lines) {
    _fold(out, line);
  }
  return out.toString();
}

/// Escapes a TEXT value: backslash, comma, semicolon and newline; other control characters throw [ArgumentError].
String escapeVcardText(String? value) {
  if (value == null) return '';
  if (_control.hasMatch(value)) throw ArgumentError.value(value, 'value', 'control characters are not allowed');
  return value.replaceAll(r'\', r'\\').replaceAll(',', r'\,').replaceAll(';', r'\;').replaceAll('\n', r'\n');
}

String _typeParam(String? type) {
  if (type == null) return '';
  if (!_type.hasMatch(type)) throw ArgumentError.value(type, 'type', 'must match [a-z][a-z0-9-]*');
  return ';TYPE=$type';
}

void _fold(StringBuffer out, String content) {
  var limit = 75, used = 0;
  for (final rune in content.runes) {
    final ch = String.fromCharCode(rune);
    final octets = utf8.encode(ch).length;
    if (used + octets > limit) {
      out.write('\r\n ');
      used = 0;
      limit = 74;
    }
    out.write(ch);
    used += octets;
  }
  out.write('\r\n');
}
