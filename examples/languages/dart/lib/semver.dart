// SPDX-License-Identifier: Apache-2.0
/// Strict SemVer 2.0.0 parsing and precedence, plus npm node-semver style range matching.
library;

const _num = '0|[1-9][0-9]*';
const _preId = '(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)';
const _pre = '(?:-($_preId(?:\\.$_preId)*))?';
const _build = r'(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?';
final _full = RegExp('^($_num)\\.($_num)\\.($_num)$_pre$_build\$');
final _partial = RegExp('^v?($_num|[xX*])(?:\\.($_num|[xX*])(?:\\.($_num|[xX*])$_pre$_build)?)?\$');
final _hyphen = RegExp(r'^(\S+)\s+-\s+(\S+)$');
final _opSpace = RegExp(r'(<=|>=|<|>|=|\^|~>|~)\s+');
final _token = RegExp(r'^(<=|>=|<|>|=|\^|~>|~)?(.+)$');
final _whitespace = RegExp(r'\s+');
final _allDigits = RegExp(r'^[0-9]+$');

/// A parsed SemVer 2.0.0 version. Build metadata is kept but ignored by [compareVersions].
class SemVersion {
  final int major, minor, patch;
  final List<String> prerelease, build;
  const SemVersion(this.major, this.minor, this.patch, [this.prerelease = const [], this.build = const []]);

  @override
  String toString() =>
      '$major.$minor.$patch${prerelease.isEmpty ? '' : '-${prerelease.join('.')}'}${build.isEmpty ? '' : '+${build.join('.')}'}';
}

/// Parses a strict SemVer 2.0.0 string; throws [FormatException] when invalid.
SemVersion parseVersion(String text) {
  final m = _full.firstMatch(text);
  if (m == null) throw FormatException('invalid semantic version', text);
  return SemVersion(_number(m[1]!), _number(m[2]!), _number(m[3]!), _split(m[4]), _split(m[5]));
}

/// Precedence per SemVer 2.0.0 section 11; returns -1, 0 or 1.
int compareVersions(SemVersion a, SemVersion b) {
  var c = a.major.compareTo(b.major);
  if (c == 0) c = a.minor.compareTo(b.minor);
  if (c == 0) c = a.patch.compareTo(b.patch);
  if (c != 0) return c.sign;
  if (a.prerelease.isEmpty || b.prerelease.isEmpty) {
    return (b.prerelease.isEmpty ? 0 : 1) - (a.prerelease.isEmpty ? 0 : 1);
  }
  final n = a.prerelease.length < b.prerelease.length ? a.prerelease.length : b.prerelease.length;
  for (var i = 0; i < n; i++) {
    c = _compareIdentifier(a.prerelease[i], b.prerelease[i]);
    if (c != 0) return c;
  }
  return a.prerelease.length.compareTo(b.prerelease.length).sign;
}

/// Parses both strings and compares them.
int compare(String a, String b) => compareVersions(parseVersion(a), parseVersion(b));

/// True when [version] satisfies the npm-style [range]; throws [FormatException] for invalid input.
bool satisfies(String version, String range) {
  final v = parseVersion(version);
  for (final rawSet in range.split('||')) {
    final set = _parseSet(rawSet.trim());
    if (!set.every((c) => _test(c, v))) continue;
    if (v.prerelease.isEmpty) return true;
    if (set.any((c) =>
        !c.synthetic &&
        c.version.prerelease.isNotEmpty &&
        c.version.major == v.major &&
        c.version.minor == v.minor &&
        c.version.patch == v.patch)) {
      return true;
    }
  }
  return false;
}

class _Comparator {
  final String op;
  final SemVersion version;
  final bool synthetic; // generated "-0" bounds do not admit prereleases
  const _Comparator(this.op, this.version, [this.synthetic = false]);
}

class _Partial {
  final int? major, minor, patch;
  final List<String> prerelease;
  const _Partial(this.major, this.minor, this.patch, this.prerelease);
  SemVersion get floor => SemVersion(major ?? 0, minor ?? 0, patch ?? 0, prerelease);
}

List<_Comparator> _parseSet(String set) {
  final result = <_Comparator>[];
  if (set.isEmpty) return result; // empty set matches every release
  final h = _hyphen.firstMatch(set);
  if (h != null) {
    final from = _parsePartial(h[1]!), to = _parsePartial(h[2]!);
    if (from.major != null) result.add(_Comparator('>=', from.floor));
    if (to.major != null) {
      if (to.minor == null) {
        result.add(_upper(_inc(to.major!), 0, 0));
      } else if (to.patch == null) {
        result.add(_upper(to.major!, _inc(to.minor!), 0));
      } else {
        result.add(_Comparator('<=', to.floor));
      }
    }
    return result;
  }
  final tokens = set.replaceAllMapped(_opSpace, (m) => m[1]!).split(_whitespace).where((t) => t.isNotEmpty);
  for (final token in tokens) {
    final t = _token.firstMatch(token)!;
    final op = t[1] ?? '';
    final p = _parsePartial(t[2]!);
    switch (op) {
      case '^':
        _caret(p, result);
      case '~' || '~>':
        _tilde(p, result);
      default:
        _xRange(op, p, result);
    }
  }
  return result;
}

void _caret(_Partial p, List<_Comparator> r) {
  final major = p.major, minor = p.minor, patch = p.patch;
  if (major == null) return;
  if (minor == null) {
    r..add(_Comparator('>=', SemVersion(major, 0, 0)))..add(_upper(_inc(major), 0, 0));
  } else if (patch == null) {
    r..add(_Comparator('>=', SemVersion(major, minor, 0)))..add(major == 0 ? _upper(0, _inc(minor), 0) : _upper(_inc(major), 0, 0));
  } else {
    r
      ..add(_Comparator('>=', p.floor))
      ..add(major != 0 ? _upper(_inc(major), 0, 0) : minor != 0 ? _upper(0, _inc(minor), 0) : _upper(0, 0, _inc(patch)));
  }
}

void _tilde(_Partial p, List<_Comparator> r) {
  final major = p.major, minor = p.minor;
  if (major == null) return;
  if (minor == null) {
    r..add(_Comparator('>=', SemVersion(major, 0, 0)))..add(_upper(_inc(major), 0, 0));
  } else {
    r..add(_Comparator('>=', p.floor))..add(_upper(major, _inc(minor), 0));
  }
}

void _xRange(String op, _Partial p, List<_Comparator> r) {
  if (op.isEmpty) op = '=';
  final major = p.major;
  if (major == null) {
    if (op == '<' || op == '>') r.add(const _Comparator('<', SemVersion(0, 0, 0, ['0']), true)); // matches nothing
    return;
  }
  if (p.minor != null && p.patch != null) {
    r.add(_Comparator(op, p.floor));
    return;
  }
  final minorX = p.minor == null;
  final minor = p.minor ?? 0;
  switch (op) {
    case '=':
      r..add(_Comparator('>=', SemVersion(major, minor, 0)))..add(minorX ? _upper(_inc(major), 0, 0) : _upper(major, _inc(minor), 0));
    case '>':
      r.add(_Comparator('>=', minorX ? SemVersion(_inc(major), 0, 0) : SemVersion(major, _inc(minor), 0)));
    case '>=':
      r.add(_Comparator('>=', SemVersion(major, minor, 0)));
    case '<':
      r.add(_Comparator('<', SemVersion(major, minor, 0, const ['0']), true));
    case '<=':
      r.add(minorX ? _upper(_inc(major), 0, 0) : _upper(major, _inc(minor), 0));
  }
}

_Comparator _upper(int major, int minor, int patch) => _Comparator('<', SemVersion(major, minor, patch, const ['0']), true);

int _inc(int n) {
  if (n == 9223372036854775807) throw const FormatException('version number too large');
  return n + 1;
}

bool _test(_Comparator c, SemVersion v) {
  final cmp = compareVersions(v, c.version);
  return switch (c.op) { '<' => cmp < 0, '<=' => cmp <= 0, '>' => cmp > 0, '>=' => cmp >= 0, _ => cmp == 0 };
}

_Partial _parsePartial(String text) {
  final m = _partial.firstMatch(text);
  if (m == null) throw FormatException('invalid range version', text);
  final major = _part(m[1]);
  final minor = major == null ? null : _part(m[2]);
  final patch = minor == null ? null : _part(m[3]);
  return _Partial(major, minor, patch, patch == null ? const [] : _split(m[4]));
}

int? _part(String? s) => s == null || s == 'x' || s == 'X' || s == '*' ? null : _number(s);

int _number(String digits) => int.tryParse(digits) ?? (throw FormatException('version number too large', digits));

List<String> _split(String? s) => s == null ? const [] : s.split('.');

int _compareIdentifier(String a, String b) {
  final an = _allDigits.hasMatch(a), bn = _allDigits.hasMatch(b);
  if (an && bn) return a.length != b.length ? (a.length - b.length).sign : a.compareTo(b).sign;
  if (an != bn) return an ? -1 : 1;
  return a.compareTo(b).sign;
}
