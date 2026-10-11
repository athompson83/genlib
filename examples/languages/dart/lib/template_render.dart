// SPDX-License-Identifier: Apache-2.0
/// A logic-less Mustache subset over JSON-like data (`jsonDecode` values): `{{path}}` HTML-escaped (& < > " '),
/// `{{{path}}}` raw, `{{#path}}..{{/path}}` sections (lists iterate with '.' as the item, looking names up in the item
/// first and then the outer scopes; other truthy values render once and maps push a scope), `{{^path}}..{{/path}}`
/// inverted sections and `{{! comment }}`. Paths use names and `[n]` indexes. Values: null '', booleans 'true'/'false',
/// whole numbers without '.0', other numbers in Dart's shortest round-trip form, strings as is; lists and maps are an
/// error. No partials, custom delimiters or lambdas. Failures throw [TemplateException].
library;

/// A malformed template (bad tag, bad name, mismatched or unclosed section) or a list/map rendered as text.
class TemplateException implements Exception {
  final String message;
  const TemplateException(this.message);
  @override
  String toString() => 'TemplateException: $message';
}

final _name = RegExp(r'^(?:\.|[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[(?:0|[1-9][0-9]*)\])*)$');
final _part = RegExp(r'[A-Za-z_][A-Za-z0-9_-]*|\[\d+\]');

// Python str.isspace() code points (the reference's `\s`).
bool _isSpace(int c) =>
    (c >= 9 && c <= 13) ||
    (c >= 0x1C && c <= 0x20) ||
    c == 0x85 ||
    c == 0xA0 ||
    c == 0x1680 ||
    (c >= 0x2000 && c <= 0x200A) ||
    c == 0x2028 ||
    c == 0x2029 ||
    c == 0x202F ||
    c == 0x205F ||
    c == 0x3000;

String _escape(String s) => s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

String _str(Object? v) {
  if (v == null) return '';
  if (v is bool) return v ? 'true' : 'false';
  if (v is int) return '$v';
  if (v is double) {
    if (v.isFinite && v == v.truncateToDouble()) return BigInt.from(v).toString();
    return '$v';
  }
  if (v is String) return v;
  throw const TemplateException('cannot render a list or object');
}

Object? _lookup(List<Object?> stack, String path) {
  if (path == '.') return stack.last;
  final parts = _part.allMatches(path).map((m) => m.group(0)!).toList();
  final first = parts.first;
  for (final scope in stack.reversed) {
    if (scope is Map && scope.containsKey(first)) {
      Object? cur = scope[first];
      for (final p in parts.skip(1)) {
        if (p.startsWith('[')) {
          final i = int.tryParse(p.substring(1, p.length - 1));
          cur = cur is List && i != null && i < cur.length ? cur[i] : null;
        } else {
          cur = cur is Map ? cur[p] : null;
        }
        if (cur == null) return null;
      }
      return cur;
    }
  }
  return null;
}

sealed class _Node {}

class _Text extends _Node {
  final String text;
  _Text(this.text);
}

class _Var extends _Node {
  final String name;
  final bool raw;
  _Var(this.name, this.raw);
}

class _Section extends _Node {
  final String name;
  final bool inverted;
  final List<_Node> body = [];
  _Section(this.name, this.inverted);
}

/// One `{{...}}` tag as the reference regex `\{\{(\{)?\s*([#^/!]?)\s*(.*?)\s*(\})?\}\}` matches it.
class _Tag {
  final int start, end;
  final bool triple, close;
  final String sigil, name;
  _Tag(this.start, this.end, this.triple, this.sigil, this.name, this.close);
}

_Tag? _nextTag(List<int> t, int from) {
  for (var s = from; s + 1 < t.length; s++) {
    if (t[s] != 0x7B || t[s + 1] != 0x7B) continue;
    var a = s + 2;
    final triple = a < t.length && t[a] == 0x7B;
    if (triple) a++;
    var j = -1;
    for (var x = a; x + 1 < t.length; x++) {
      if (t[x] == 0x7D && t[x + 1] == 0x7D) {
        j = x;
        break;
      }
    }
    if (j < 0) return null; // no '}}' after this '{{', so no later tag can match either
    var p = a;
    while (p < j && _isSpace(t[p])) {
      p++;
    }
    var sigil = '';
    if (p < j && '#^/!'.codeUnits.contains(t[p])) {
      sigil = String.fromCharCode(t[p]);
      p++;
      while (p < j && _isSpace(t[p])) {
        p++;
      }
    }
    var q = j;
    while (q > p && _isSpace(t[q - 1])) {
      q--;
    }
    final close = j + 2 < t.length && t[j + 2] == 0x7D;
    return _Tag(s, close ? j + 3 : j + 2, triple, sigil, String.fromCharCodes(t.sublist(p, q)), close);
  }
  return null;
}

List<_Node> _parse(String template) {
  final t = template.runes.toList();
  final root = <_Node>[];
  final stack = <(String, List<_Node>)>[('', root)];
  var pos = 0;
  while (true) {
    final m = _nextTag(t, pos);
    if (m == null) break;
    if (m.start > pos) stack.last.$2.add(_Text(String.fromCharCodes(t.sublist(pos, m.start))));
    pos = m.end;
    if (m.sigil == '!') continue;
    if (m.triple != m.close || (m.triple && m.sigil.isNotEmpty)) throw const TemplateException('bad triple-brace tag');
    if (!_name.hasMatch(m.name)) throw TemplateException("bad tag name '${m.name}'");
    if (m.sigil == '#' || m.sigil == '^') {
      final node = _Section(m.name, m.sigil == '^');
      stack.last.$2.add(node);
      stack.add((m.name, node.body));
    } else if (m.sigil == '/') {
      if (stack.length == 1 || stack.last.$1 != m.name) throw const TemplateException('mismatched close tag');
      stack.removeLast();
    } else {
      stack.last.$2.add(_Var(m.name, m.triple));
    }
  }
  final rest = String.fromCharCodes(t.sublist(pos));
  if (rest.contains('{{')) throw const TemplateException('unclosed tag');
  if (rest.isNotEmpty) stack.last.$2.add(_Text(rest));
  if (stack.length > 1) throw const TemplateException('unclosed section');
  return root;
}

bool _truthy(Object? v) => !(v == null ||
    v == false ||
    (v is num && v == 0) ||
    v == '' ||
    (v is List && v.isEmpty) ||
    (v is Map && v.isEmpty));

void _run(List<_Node> nodes, List<Object?> stack, bool escape, StringBuffer out) {
  for (final n in nodes) {
    switch (n) {
      case _Text(:final text):
        out.write(text);
      case _Var(:final name, :final raw):
        final s = _str(_lookup(stack, name));
        out.write(escape && !raw ? _escape(s) : s);
      case _Section(:final name, :final inverted, :final body):
        final v = _lookup(stack, name);
        if (inverted) {
          if (!_truthy(v)) _run(body, stack, escape, out);
        } else if (v is List) {
          for (final item in v) {
            _run(body, [...stack, item], escape, out);
          }
        } else if (_truthy(v)) {
          _run(body, v is Map ? [...stack, v] : stack, escape, out);
        }
    }
  }
}

/// Renders [template] against [data]; with [escape] false, `{{path}}` is not HTML-escaped either.
String renderTemplate(String template, Object? data, {bool escape = true}) {
  final out = StringBuffer();
  _run(_parse(template), [data], escape, out);
  return out.toString();
}
