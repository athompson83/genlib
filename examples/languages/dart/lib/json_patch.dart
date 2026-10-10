// SPDX-License-Identifier: Apache-2.0
/// RFC 6901 JSON Pointer, RFC 6902 JSON Patch, RFC 7396 JSON Merge Patch and a deterministic patch generator over
/// native JSON values as produced by `jsonDecode` (Map<String, Object?>, List, String, num, bool, null). Every
/// operation returns a new value and never changes its inputs. Numbers compare numerically (1 equals 1.0) and booleans
/// are never numbers; whole numbers print without a decimal point and other numbers in Dart's shortest round-trip form.
library;

/// A JSON Pointer or JSON Patch failure: bad pointer, missing target, failed test or malformed operation.
class JsonPatchException implements Exception {
  final String message;
  const JsonPatchException(this.message);
  @override
  String toString() => 'JsonPatchException: $message';
}

// ---- values

/// Deep equality: numbers compare numerically, booleans are never numbers and object member order is ignored.
bool jsonEquals(Object? a, Object? b) {
  if (a is num && b is num) return a == b;
  if (a is Map && b is Map) {
    if (a.length != b.length) return false;
    for (final e in a.entries) {
      if (!b.containsKey(e.key) || !jsonEquals(e.value, b[e.key])) return false;
    }
    return true;
  }
  if (a is List && b is List) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!jsonEquals(a[i], b[i])) return false;
    }
    return true;
  }
  if (a is Map || a is List || b is Map || b is List) return false;
  return a == b;
}

Object? _copy(Object? v) {
  if (v is Map) return <String, Object?>{for (final e in v.entries) e.key as String: _copy(e.value)};
  if (v is List) return <Object?>[for (final x in v) _copy(x)];
  return v;
}

/// Code point order (String.compareTo orders UTF-16 code units, which differs above U+FFFF).
int _compareCodePoints(String a, String b) {
  final x = a.runes.iterator, y = b.runes.iterator;
  while (true) {
    final hasX = x.moveNext(), hasY = y.moveNext();
    if (!hasX || !hasY) return hasX ? 1 : (hasY ? -1 : 0);
    if (x.current != y.current) return x.current < y.current ? -1 : 1;
  }
}

/// Compact JSON with object keys in code point order; whole numbers print without a decimal point; strings escape
/// only \" \\ \b \f \n \r \t and other characters below U+0020 (\u00XX, lowercase hex).
String canonical(Object? value) {
  final out = StringBuffer();
  _write(out, value);
  return out.toString();
}

void _write(StringBuffer out, Object? v) {
  if (v == null) {
    out.write('null');
  } else if (v is bool) {
    out.write(v ? 'true' : 'false');
  } else if (v is int) {
    out.write(v);
  } else if (v is double) {
    if (v.isNaN || v.isInfinite) throw JsonPatchException('$v is not a JSON number');
    out.write(v == v.truncateToDouble() ? BigInt.from(v).toString() : v.toString());
  } else if (v is String) {
    _writeString(out, v);
  } else if (v is List) {
    out.write('[');
    for (var i = 0; i < v.length; i++) {
      if (i > 0) out.write(',');
      _write(out, v[i]);
    }
    out.write(']');
  } else if (v is Map) {
    final keys = [for (final k in v.keys) k as String]..sort(_compareCodePoints);
    out.write('{');
    for (var i = 0; i < keys.length; i++) {
      if (i > 0) out.write(',');
      _writeString(out, keys[i]);
      out.write(':');
      _write(out, v[keys[i]]);
    }
    out.write('}');
  } else {
    throw JsonPatchException('not a JSON value: ${v.runtimeType}');
  }
}

void _writeString(StringBuffer out, String s) {
  out.write('"');
  for (final c in s.codeUnits) {
    switch (c) {
      case 0x22:
        out.write(r'\"');
      case 0x5C:
        out.write(r'\\');
      case 0x08:
        out.write(r'\b');
      case 0x0C:
        out.write(r'\f');
      case 0x0A:
        out.write(r'\n');
      case 0x0D:
        out.write(r'\r');
      case 0x09:
        out.write(r'\t');
      default:
        if (c < 0x20) {
          out.write('\\u00${c.toRadixString(16).padLeft(2, '0')}');
        } else {
          out.writeCharCode(c);
        }
    }
  }
  out.write('"');
}

// ---- RFC 6901 pointers

final _badEscape = RegExp(r'~(?![01])');
final _arrayIndex = RegExp(r'^(0|[1-9][0-9]*)$');

List<String> _parsePointer(Object? p) {
  if (p is! String) throw const JsonPatchException('pointer must be a string');
  if (p.isEmpty) return <String>[];
  if (!p.startsWith('/')) throw const JsonPatchException('pointer must be empty or start with "/"');
  return [
    for (final t in p.substring(1).split('/'))
      if (_badEscape.hasMatch(t))
        throw const JsonPatchException('bad escape in pointer')
      else
        t.replaceAll('~1', '/').replaceAll('~0', '~'),
  ];
}

String _escapeToken(String t) => t.replaceAll('~', '~0').replaceAll('/', '~1');

int _index(String token, int n, bool allowEnd) {
  if (allowEnd && token == '-') return n;
  if (!_arrayIndex.hasMatch(token)) throw JsonPatchException('bad array index $token');
  final i = int.tryParse(token);
  if (i == null || i > n || (i == n && !allowEnd)) throw const JsonPatchException('array index out of range');
  return i;
}

Object? _get(Object? doc, Iterable<String> tokens) {
  var cur = doc;
  for (final t in tokens) {
    if (cur is Map) {
      if (!cur.containsKey(t)) throw JsonPatchException('no member $t');
      cur = cur[t];
    } else if (cur is List) {
      cur = cur[_index(t, cur.length, false)];
    } else {
      throw const JsonPatchException('cannot index a scalar');
    }
  }
  return cur;
}

/// The value at an RFC 6901 pointer (`''` is the whole document), as a copy. Throws [JsonPatchException].
Object? getPointer(Object? doc, String pointer) => _copy(_get(doc, _parsePointer(pointer)));

// ---- RFC 6902 patches

Object? _add(Object? doc, List<String> tokens, Object? value) {
  if (tokens.isEmpty) return value;
  final parent = _get(doc, tokens.take(tokens.length - 1)), last = tokens.last;
  if (parent is Map) {
    parent[last] = value;
  } else if (parent is List) {
    parent.insert(_index(last, parent.length, true), value);
  } else {
    throw const JsonPatchException('cannot add to a scalar');
  }
  return doc;
}

Object? _remove(Object? doc, List<String> tokens) {
  if (tokens.isEmpty) throw const JsonPatchException('cannot remove the root');
  final parent = _get(doc, tokens.take(tokens.length - 1)), last = tokens.last;
  if (parent is Map) {
    if (!parent.containsKey(last)) throw JsonPatchException('no member $last');
    return parent.remove(last);
  }
  if (parent is List) return parent.removeAt(_index(last, parent.length, false));
  throw const JsonPatchException('cannot remove from a scalar');
}

bool _startsWith(List<String> path, List<String> prefix) {
  if (path.length < prefix.length) return false;
  for (var i = 0; i < prefix.length; i++) {
    if (path[i] != prefix[i]) return false;
  }
  return true;
}

/// Applies an RFC 6902 patch atomically and returns a new document; [doc] is never changed. Throws
/// [JsonPatchException] for a malformed patch, a missing target or a failed test.
Object? applyPatch(Object? doc, Object? patch) {
  if (patch is! List) throw const JsonPatchException('patch must be an array');
  var result = _copy(doc);
  for (final op in patch) {
    if (op is! Map || op['op'] is! String) throw const JsonPatchException('operation needs "op"');
    if (!op.containsKey('path')) throw const JsonPatchException('operation needs "path"');
    final kind = op['op'] as String, path = _parsePointer(op['path']);
    if ((kind == 'add' || kind == 'replace' || kind == 'test') && !op.containsKey('value')) {
      throw JsonPatchException('$kind needs "value"');
    }
    if ((kind == 'move' || kind == 'copy') && !op.containsKey('from')) throw JsonPatchException('$kind needs "from"');
    switch (kind) {
      case 'add':
        result = _add(result, path, _copy(op['value']));
      case 'remove':
        _remove(result, path);
      case 'replace':
        _get(result, path);
        if (path.isEmpty) {
          result = _copy(op['value']);
        } else {
          _remove(result, path);
          result = _add(result, path, _copy(op['value']));
        }
      case 'move':
        final from = _parsePointer(op['from']);
        if (from.length == path.length && _startsWith(path, from)) {
          _get(result, path);
          continue;
        }
        if (_startsWith(path, from)) throw const JsonPatchException('cannot move a value into itself');
        final value = _remove(result, from);
        result = _add(result, path, value);
      case 'copy':
        result = _add(result, path, _copy(_get(result, _parsePointer(op['from']))));
      case 'test':
        if (!jsonEquals(_get(result, path), op['value'])) throw JsonPatchException('test failed at ${op['path']}');
      default:
        throw JsonPatchException('unknown op $kind');
    }
  }
  return result;
}

/// RFC 7396 merge patch; returns a new value.
Object? mergePatch(Object? target, Object? patch) {
  if (patch is! Map) return _copy(patch);
  final out = target is Map ? _copy(target) as Map<String, Object?> : <String, Object?>{};
  for (final e in patch.entries) {
    final k = e.key as String;
    if (e.value == null) {
      out.remove(k);
    } else {
      out[k] = mergePatch(out[k], e.value);
    }
  }
  return out;
}

/// A deterministic RFC 6902 patch turning [a] into [b]: objects member by member in code point order, arrays index
/// by index (then removals from the end and appends), otherwise a replace.
List<Map<String, Object?>> createPatch(Object? a, Object? b) {
  final ops = <Map<String, Object?>>[];
  _create(a, b, '', ops);
  return ops;
}

void _create(Object? a, Object? b, String path, List<Map<String, Object?>> ops) {
  if (jsonEquals(a, b)) return;
  if (a is Map && b is Map) {
    final keys = {for (final k in a.keys) k as String, for (final k in b.keys) k as String}.toList()
      ..sort(_compareCodePoints);
    for (final k in keys) {
      final p = '$path/${_escapeToken(k)}';
      if (!b.containsKey(k)) {
        ops.add({'op': 'remove', 'path': p});
      } else if (!a.containsKey(k)) {
        ops.add({'op': 'add', 'path': p, 'value': _copy(b[k])});
      } else {
        _create(a[k], b[k], p, ops);
      }
    }
    return;
  }
  if (a is List && b is List) {
    final common = a.length < b.length ? a.length : b.length;
    for (var i = 0; i < common; i++) {
      _create(a[i], b[i], '$path/$i', ops);
    }
    for (var i = a.length - 1; i >= b.length; i--) {
      ops.add({'op': 'remove', 'path': '$path/$i'});
    }
    for (var i = a.length; i < b.length; i++) {
      ops.add({'op': 'add', 'path': '$path/$i', 'value': _copy(b[i])});
    }
    return;
  }
  ops.add({'op': 'replace', 'path': path, 'value': _copy(b)});
}
