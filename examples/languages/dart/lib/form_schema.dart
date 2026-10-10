// SPDX-License-Identifier: Apache-2.0
/// Server-side form validation returning ordered error codes per field.
library;

enum FieldType { string, number, integer, boolean, email, date }

class FormField {
  final String name;
  final FieldType type;
  final bool required;
  final int? minLength, maxLength;
  final num? min, max;
  final String? pattern;
  final List<String>? allowed; // the spec's `enum` (a reserved word in Dart)
  const FormField(this.name, this.type,
      {this.required = false, this.minLength, this.maxLength, this.min, this.max, this.pattern, this.allowed});
}

/// Validates [values] (iterated in insertion order) against the ordered [schema].
/// Returns an insertion-ordered map of field -> error codes (only fields with errors).
/// Missing, null and empty-string values of optional fields are treated as absent.
Map<String, List<String>> validateForm(List<FormField> schema, Map<String, Object?> values, {bool allowUnknown = false}) {
  final names = <String>{};
  final result = <String, List<String>>{};
  for (final field in schema) {
    if (!names.add(field.name)) throw ArgumentError("duplicate schema field '${field.name}'");
    final codes = _checkField(field, values[field.name]);
    if (codes.isNotEmpty) result[field.name] = codes;
  }
  if (!allowUnknown) {
    for (final key in values.keys) {
      if (!names.contains(key)) result[key] = const ['unknown'];
    }
  }
  return result;
}

List<String> _checkField(FormField f, Object? value) {
  final codes = <String>[];
  if (value == null || value == '') {
    if (f.required) codes.add('required');
    return codes;
  }
  final typeOk = switch (f.type) {
    FieldType.boolean => value is bool,
    FieldType.number => value is num && value.isFinite,
    FieldType.integer => value is num && value.isFinite && value == value.truncateToDouble(),
    _ => value is String,
  };
  if (!typeOk) return ['type'];
  if (value is String) {
    final length = value.runes.length;
    if (f.minLength != null && length < f.minLength!) codes.add('minLength');
    if (f.maxLength != null && length > f.maxLength!) codes.add('maxLength');
    if (f.pattern != null && !RegExp('^(?:${f.pattern})\$').hasMatch(value)) codes.add('pattern');
    if (f.allowed != null && !f.allowed!.contains(value)) codes.add('enum');
    if (f.type == FieldType.email && !_isEmail(value)) codes.add('email');
    if (f.type == FieldType.date && !_isDate(value)) codes.add('date');
  } else if (value is num) {
    if (f.min != null && value < f.min!) codes.add('min');
    if (f.max != null && value > f.max!) codes.add('max');
  }
  return codes;
}

bool _isEmail(String s) {
  if (s.length > 254 || RegExp(r'\s').hasMatch(s)) return false;
  final at = s.indexOf('@');
  if (at <= 0 || at != s.lastIndexOf('@')) return false;
  return s.substring(at + 1).contains('.');
}

bool _isDate(String s) {
  final m = RegExp(r'^([0-9]{4})-([0-9]{2})-([0-9]{2})$').firstMatch(s);
  if (m == null) return false;
  final year = int.parse(m[1]!), month = int.parse(m[2]!), day = int.parse(m[3]!);
  if (month < 1 || month > 12 || day < 1) return false;
  final leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (month == 2 && leap ? 29 : days[month - 1]);
}
