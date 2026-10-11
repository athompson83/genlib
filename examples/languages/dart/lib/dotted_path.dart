// SPDX-License-Identifier: Apache-2.0
/// Dotted paths into JSON-like data as produced by `jsonDecode` (Map<String, Object?>, List, String, num, bool, null),
/// e.g. `user.addresses[0].city` or `a["x.y"]`. Grammar: names separated by '.', running until '.' or '[' (never
/// empty); `[n]` is a list index (no leading zeros except `0`); `["..."]` is a key with `\"` and `\\` escapes; '' is
/// the root. [getPath]/[hasPath] treat a missing key, an out-of-range index or a step into the wrong type as missing.
/// [setPath] and [deletePath] return a new structure and never change their inputs. Failures throw [PathException].
library;

/// A malformed path or a set through a scalar / beyond the end of a list.
class PathException implements Exception {
  final String message;
  const PathException(this.message);
  @override
  String toString() => 'PathException: $message';
}

final _index = RegExp(r'\[(0|[1-9][0-9]*)\]');

/// Parses a path into keys (String) and list indexes (int); '' is the root (empty list).
List<Object> parsePath(String path) {
  final out = <Object>[];
  final p = path;
  final n = p.length;
  var i = 0;
  while (i < n) {
    final c = p[i];
    if (c == '[') {
      if (i + 1 < n && p[i + 1] == '"') {
        var j = i + 2;
        final buf = StringBuffer();
        while (true) {
          if (j >= n) throw const PathException('unterminated quoted key');
          if (p[j] == r'\' && j + 1 < n) {
            buf.write(p[j + 1]);
            j += 2;
            continue;
          }
          if (p[j] == '"') break;
          buf.write(p[j]);
          j++;
        }
        if (j + 1 >= n || p[j + 1] != ']') throw const PathException('expected ]');
        out.add(buf.toString());
        i = j + 2;
      } else {
        final m = _index.matchAsPrefix(p, i);
        if (m == null) throw const PathException('bad index');
        // Indexes beyond the integer range can never be in range; saturate so get/has miss and set fails.
        out.add(int.tryParse(m.group(1)!) ?? 0x7FFFFFFFFFFFFFFF);
        i = m.end;
      }
      var needName = false;
      if (i < n && p[i] == '.') {
        i++;
        needName = true;
      }
      if (needName && i >= n) throw const PathException('trailing dot');
      continue;
    }
    if (c == '.') throw const PathException('empty segment');
    var j = i;
    while (j < n && p[j] != '.' && p[j] != '[') {
      j++;
    }
    out.add(p.substring(i, j));
    i = j;
    if (i < n && p[i] == '.') {
      i++;
      if (i >= n) throw const PathException('trailing dot');
    }
  }
  return out;
}

const _missing = Object();

Object? _step(Object? cur, Object k) {
  if (k is int) return cur is List && k < cur.length ? cur[k] : _missing;
  return cur is Map && cur.containsKey(k) ? cur[k] : _missing;
}

Object? _copy(Object? v) {
  if (v is Map) return <String, Object?>{for (final e in v.entries) e.key as String: _copy(e.value)};
  if (v is List) return <Object?>[for (final x in v) _copy(x)];
  return v;
}

/// Returns the value at [path], or [defaultValue] when any step is missing.
Object? getPath(Object? data, String path, [Object? defaultValue]) {
  var cur = data;
  for (final k in parsePath(path)) {
    cur = _step(cur, k);
    if (identical(cur, _missing)) return defaultValue;
  }
  return cur;
}

/// Reports whether every step of [path] exists (a present null counts as existing).
bool hasPath(Object? data, String path) {
  var cur = data;
  for (final k in parsePath(path)) {
    cur = _step(cur, k);
    if (identical(cur, _missing)) return false;
  }
  return true;
}

Object? _set(Object? cur, List<Object> keys, int at, Object? value) {
  if (at == keys.length) return _copy(value);
  final k = keys[at];
  cur ??= k is int ? <Object?>[] : <String, Object?>{};
  if (k is int) {
    if (cur is! List) throw const PathException('index on a non-list');
    if (k > cur.length) throw const PathException('index out of range');
    final copy = _copy(cur) as List<Object?>;
    final v = _set(k < copy.length ? copy[k] : null, keys, at + 1, value);
    if (k == copy.length) {
      copy.add(v);
    } else {
      copy[k] = v;
    }
    return copy;
  }
  if (cur is! Map) throw const PathException('key on a non-object');
  final copy = _copy(cur) as Map<String, Object?>;
  copy[k as String] = _set(copy[k], keys, at + 1, value);
  return copy;
}

/// Returns a new structure with [value] at [path], creating maps/lists; index == length appends.
Object? setPath(Object? data, String path, Object? value) => _set(data, parsePath(path), 0, value);

/// Returns a new structure without the key/index at [path] (lists shift); a missing path yields an unchanged copy.
Object? deletePath(Object? data, String path) {
  final keys = parsePath(path);
  if (keys.isEmpty) return null;
  Object? rec(Object? cur, int at) {
    final k = keys[at];
    if (identical(_step(cur, k), _missing)) return _copy(cur);
    final copy = _copy(cur);
    if (at + 1 < keys.length) {
      final child = rec(_step(cur, k), at + 1);
      if (copy is List) {
        copy[k as int] = child;
      } else {
        (copy as Map)[k] = child;
      }
    } else if (copy is List) {
      copy.removeAt(k as int);
    } else {
      (copy as Map).remove(k);
    }
    return copy;
  }

  return rec(data, 0);
}
