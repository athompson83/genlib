// SPDX-License-Identifier: Apache-2.0
// Wave 12 capability checks: URI templates, Bloom filters, descriptive statistics, interval sets, shell quoting,
// number words, pagination windows, text wrapping, Markdown tables and NDJSON. Every vector is generated from the
// shared wave 12 reference vectors (caps13 vectors.json) by a script; keep them identical across languages.
import 'dart:convert';

import 'package:genlib_validation_example/bloom_filter.dart';
import 'package:genlib_validation_example/interval_merge.dart';
import 'package:genlib_validation_example/markdown_table.dart';
import 'package:genlib_validation_example/ndjson.dart';
import 'package:genlib_validation_example/number_words.dart';
import 'package:genlib_validation_example/pagination_window.dart';
import 'package:genlib_validation_example/shell_quote.dart';
import 'package:genlib_validation_example/stats_summary.dart';
import 'package:genlib_validation_example/text_wrap.dart';
import 'package:genlib_validation_example/url_template.dart';

import 'src/checks.dart';

/// Deep equality for lists, maps and scalars (records compare by value).
bool _deq(Object? a, Object? b) {
  if (a is List && b is List) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!_deq(a[i], b[i])) return false;
    }
    return true;
  }
  if (a is Map && b is Map) {
    if (a.length != b.length) return false;
    for (final k in a.keys) {
      if (!b.containsKey(k) || !_deq(a[k], b[k])) return false;
    }
    return true;
  }
  return a == b;
}

void _same(Checks c, String name, Object? expected, Object? actual) {
  final ok = _deq(expected, actual);
  if (!ok) print('  expected <$expected> got <$actual>');
  c.check(name, ok);
}

/// Relative tolerance 1e-9 (absolute near zero).
void _close(Checks c, String name, double expected, double actual) {
  final scale = expected.abs() > actual.abs() ? expected.abs() : actual.abs();
  final ok = (expected - actual).abs() <= 1e-9 * (scale > 1 ? scale : 1);
  if (!ok) print('  expected <$expected> got <$actual>');
  c.check(name, ok);
}

String _u64hex(int h) => BigInt.from(h).toUnsigned(64).toRadixString(16).padLeft(16, '0');
String _hist(Histogram h) => '${h.counts.join(',')}|${h.below}|${h.above}';

final _templateVars = <String, Object?>{
  'count': <String>['one', 'two', 'three'],
  'dom': <String>['example', 'com'],
  'dub': 'me/too',
  'hello': 'Hello World!',
  'half': '50%',
  'var': 'value',
  'who': 'fred',
  'base': 'http://example.com/home/',
  'path': '/foo/bar',
  'list': <String>['red', 'green', 'blue'],
  'keys': <String, String>{'semi': ';', 'dot': '.', 'comma': ','},
  'v': '6',
  'x': '1024',
  'y': '768',
  'empty': '',
  'empty_keys': <String, String>{},
  'empty_list': <String>[],
  'utf': 'café ☃',
  'emoji': '😀x',
};

void runUrlTemplateTests(Checks c) {
  c.eq('url-template 0', 'value', expandTemplate('{var}', _templateVars));
  c.eq('url-template 1', 'Hello%20World%21', expandTemplate('{hello}', _templateVars));
  c.eq('url-template 2', '50%25', expandTemplate('{half}', _templateVars));
  c.eq('url-template 3', 'OX', expandTemplate('O{empty}X', _templateVars));
  c.eq('url-template 4', 'OX', expandTemplate('O{undef}X', _templateVars));
  c.eq('url-template 5', '1024,768', expandTemplate('{x,y}', _templateVars));
  c.eq('url-template 6', '1024,Hello%20World%21,768', expandTemplate('{x,hello,y}', _templateVars));
  c.eq('url-template 7', '?1024,', expandTemplate('?{x,empty}', _templateVars));
  c.eq('url-template 8', '?1024', expandTemplate('?{x,undef}', _templateVars));
  c.eq('url-template 9', '?768', expandTemplate('?{undef,y}', _templateVars));
  c.eq('url-template 10', 'val', expandTemplate('{var:3}', _templateVars));
  c.eq('url-template 11', 'value', expandTemplate('{var:30}', _templateVars));
  c.eq('url-template 12', 'red,green,blue', expandTemplate('{list}', _templateVars));
  c.eq('url-template 13', 'red,green,blue', expandTemplate('{list*}', _templateVars));
  c.eq('url-template 14', 'semi,%3B,dot,.,comma,%2C', expandTemplate('{keys}', _templateVars));
  c.eq('url-template 15', 'semi=%3B,dot=.,comma=%2C', expandTemplate('{keys*}', _templateVars));
  c.eq('url-template 16', 'value', expandTemplate('{+var}', _templateVars));
  c.eq('url-template 17', 'Hello%20World!', expandTemplate('{+hello}', _templateVars));
  c.eq('url-template 18', '50%25', expandTemplate('{+half}', _templateVars));
  c.eq('url-template 19', 'http%3A%2F%2Fexample.com%2Fhome%2Findex', expandTemplate('{base}index', _templateVars));
  c.eq('url-template 20', 'http://example.com/home/index', expandTemplate('{+base}index', _templateVars));
  c.eq('url-template 21', '/foo/b/here', expandTemplate('{+path:6}/here', _templateVars));
  c.eq('url-template 22', 'red,green,blue', expandTemplate('{+list}', _templateVars));
  c.eq('url-template 23', 'semi=;,dot=.,comma=,', expandTemplate('{+keys*}', _templateVars));
  c.eq('url-template 24', '#value', expandTemplate('{#var}', _templateVars));
  c.eq('url-template 25', '#Hello%20World!', expandTemplate('{#hello}', _templateVars));
  c.eq('url-template 26', '#/foo/b/here', expandTemplate('{#path:6}/here', _templateVars));
  c.eq('url-template 27', '#semi=;,dot=.,comma=,', expandTemplate('{#keys*}', _templateVars));
  c.eq('url-template 28', 'X.value', expandTemplate('X{.var}', _templateVars));
  c.eq('url-template 29', 'X.val', expandTemplate('X{.var:3}', _templateVars));
  c.eq('url-template 30', 'X.red.green.blue', expandTemplate('X{.list*}', _templateVars));
  c.eq('url-template 31', '.example.com', expandTemplate('{.dom*}', _templateVars));
  c.eq('url-template 32', '/value', expandTemplate('{/var}', _templateVars));
  c.eq('url-template 33', '/v/value', expandTemplate('{/var:1,var}', _templateVars));
  c.eq('url-template 34', '/red/green/blue/%2Ffoo', expandTemplate('{/list*,path:4}', _templateVars));
  c.eq('url-template 35', '/semi=%3B/dot=./comma=%2C', expandTemplate('{/keys*}', _templateVars));
  c.eq('url-template 36', ';hello=Hello', expandTemplate('{;hello:5}', _templateVars));
  c.eq('url-template 37', ';list=red;list=green;list=blue', expandTemplate('{;list*}', _templateVars));
  c.eq('url-template 38', ';semi=%3B;dot=.;comma=%2C', expandTemplate('{;keys*}', _templateVars));
  c.eq('url-template 39', ';x=1024;y=768;empty', expandTemplate('{;x,y,empty}', _templateVars));
  c.eq('url-template 40', '?x=1024&y=768&empty=', expandTemplate('{?x,y,empty}', _templateVars));
  c.eq('url-template 41', '?var=val', expandTemplate('{?var:3}', _templateVars));
  c.eq('url-template 42', '?list=red,green,blue', expandTemplate('{?list}', _templateVars));
  c.eq('url-template 43', '?list=red&list=green&list=blue', expandTemplate('{?list*}', _templateVars));
  c.eq('url-template 44', '?keys=semi,%3B,dot,.,comma,%2C', expandTemplate('{?keys}', _templateVars));
  c.eq('url-template 45', '?semi=%3B&dot=.&comma=%2C', expandTemplate('{?keys*}', _templateVars));
  c.eq('url-template 46', '&var=val', expandTemplate('{&var:3}', _templateVars));
  c.eq('url-template 47', '&semi=%3B&dot=.&comma=%2C', expandTemplate('{&keys*}', _templateVars));
  c.eq('url-template 48', '', expandTemplate('{?empty_keys*}', _templateVars));
  c.eq('url-template 49', '', expandTemplate('{?empty_list}', _templateVars));
  c.eq('url-template 50', '/one/two/three', expandTemplate('{/count*}', _templateVars));
  c.eq('url-template 51', 'caf%C3%A9%20%E2%98%83', expandTemplate('{utf}', _templateVars));
  c.eq('url-template 52', 'caf%C3%A9%20%E2%98%83', expandTemplate('{+utf}', _templateVars));
  c.eq('url-template 53', '%F0%9F%98%80', expandTemplate('{emoji:1}', _templateVars));
  c.eq('url-template 54', '?utf=caf%C3%A9%20%E2%98%83', expandTemplate('{?utf}', _templateVars));
  c.eq('url-template 55', 'map?1024,768#Hello%20World%21', expandTemplate('map?{x,y}#{hello}', _templateVars));
  c.eq('url-template 56', 'literal%20kept/value', expandTemplate('literal%20kept/{var}', _templateVars));
  c.eq('url-template 57', 'sp%20acevalue', expandTemplate('sp ace{var}', _templateVars));
  c.throws<UrlTemplateException>('url-template invalid 0', () => expandTemplate('{var', _templateVars));
  c.throws<UrlTemplateException>('url-template invalid 1', () => expandTemplate('var}', _templateVars));
  c.throws<UrlTemplateException>('url-template invalid 2', () => expandTemplate('{}', _templateVars));
  c.throws<UrlTemplateException>('url-template invalid 3', () => expandTemplate('{=var}', _templateVars));
  c.throws<UrlTemplateException>('url-template invalid 4', () => expandTemplate('{!var}', _templateVars));
  c.throws<UrlTemplateException>('url-template invalid 5', () => expandTemplate('{@var}', _templateVars));
  c.throws<UrlTemplateException>('url-template invalid 6', () => expandTemplate('{|var}', _templateVars));
  c.throws<UrlTemplateException>('url-template invalid 7', () => expandTemplate('{var:0}', _templateVars));
  c.throws<UrlTemplateException>('url-template invalid 8', () => expandTemplate('{var:10000}', _templateVars));
  c.throws<UrlTemplateException>('url-template invalid 9', () => expandTemplate('{va r}', _templateVars));
  c.throws<UrlTemplateException>('url-template invalid 10', () => expandTemplate('{list:3}', _templateVars));
  c.throws<UrlTemplateException>('url-template invalid 11', () => expandTemplate('{keys:2}', _templateVars));
  c.throws<UrlTemplateException>('url-template invalid 12', () => expandTemplate('{var:01}', _templateVars));
}

void runBloomFilterTests(Checks c) {
  c.eq('bloom fnv1a64 0', 'f74a62a458befdbf', _u64hex(fnv1a64(utf8.encode('apple'))));
  c.eq('bloom fnv1a64 1', 'b4d3b6b1c372c890', _u64hex(fnv1a64(utf8.encode('banana'))));
  c.eq('bloom fnv1a64 2', 'cbf29ce484222325', _u64hex(fnv1a64(utf8.encode(''))));
  c.eq('bloom fnv1a64 3', '48e8823acfa40d89', _u64hex(fnv1a64(utf8.encode('café'))));
  c.eq('bloom fnv1a64 4', 'feff073875020288', _u64hex(fnv1a64(utf8.encode('😀'))));
  c.eq('bloom fnv1a64 5', '6c151ea4dcd221c2', _u64hex(fnv1a64(utf8.encode('user:42'))));
  c.eq('bloom fnv1a64 6', '060324515a7b4e27', _u64hex(fnv1a64(utf8.encode('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))));
  c.eq('bloom sizeFor 0', '8/6', () { final r = bloomSizeFor(1, 0.5); return '${r.m}/${r.k}'; }());
  c.eq('bloom sizeFor 1', '96/7', () { final r = bloomSizeFor(10, 0.01); return '${r.m}/${r.k}'; }());
  c.eq('bloom sizeFor 2', '959/7', () { final r = bloomSizeFor(100, 0.01); return '${r.m}/${r.k}'; }());
  c.eq('bloom sizeFor 3', '14378/10', () { final r = bloomSizeFor(1000, 0.001); return '${r.m}/${r.k}'; }());
  c.eq('bloom sizeFor 4', '31177/4', () { final r = bloomSizeFor(5000, 0.05); return '${r.m}/${r.k}'; }());
  c.eq('bloom sizeFor 5', '8/2', () { final r = bloomSizeFor(3, 0.3); return '${r.m}/${r.k}'; }());
  c.throws<BloomException>('bloom invalid size 0', () => bloomSizeFor(0, 0.1));
  c.throws<BloomException>('bloom invalid size 1', () => bloomSizeFor(10, 0.0));
  c.throws<BloomException>('bloom invalid size 2', () => bloomSizeFor(10, 1.0));
  c.throws<BloomException>('bloom invalid size 3', () => bloomSizeFor(10, 1.5));
  final b = BloomFilter(256, 5);
  _same(c, 'bloom positions 0', <int>[191, 99, 7, 171, 79], b.positions('apple'));
  _same(c, 'bloom positions 1', <int>[144, 65, 242, 163, 84], b.positions('banana'));
  _same(c, 'bloom positions 2', <int>[37, 9, 237, 209, 181], b.positions(''));
  _same(c, 'bloom positions 3', <int>[137, 195, 253, 55, 113], b.positions('café'));
  _same(c, 'bloom positions 4', <int>[136, 192, 248, 48, 104], b.positions('😀'));
  _same(c, 'bloom positions 5', <int>[194, 102, 10, 174, 82], b.positions('user:42'));
  _same(c, 'bloom positions 6', <int>[39, 120, 201, 26, 107], b.positions('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
  b.add('apple');
  b.add('banana');
  b.add('');
  b.add('café');
  b.add('😀');
  c.eq('bloom serialized', 'gAIAACAAgQACgBAACAECAAADAQAICCCACQACAAAgBCE', b.serialize());
  c.eq('bloom probe 0', true, b.mightContain('apple'));
  c.eq('bloom probe 1', true, b.mightContain('banana'));
  c.eq('bloom probe 2', true, b.mightContain(''));
  c.eq('bloom probe 3', true, b.mightContain('café'));
  c.eq('bloom probe 4', true, b.mightContain('😀'));
  c.eq('bloom probe 5', false, b.mightContain('cherry'));
  c.eq('bloom probe 6', false, b.mightContain('user:42'));
  c.eq('bloom probe 7', false, b.mightContain('zzz'));
  c.eq('bloom probe 8', false, b.mightContain('Apple'));
  c.eq('bloom count estimate', 5, b.countEstimate());
  c.eq('bloom deserialize round trip', 'gAIAACAAgQACgBAACAECAAADAQAICCCACQACAAAgBCE', BloomFilter.deserialize(256, 5, 'gAIAACAAgQACgBAACAECAAADAQAICCCACQACAAAgBCE').serialize());
  c.throws<BloomException>('bloom deserialize wrong length', () => BloomFilter.deserialize(256, 5, 'AAAA'));
  final cherry = BloomFilter(256, 5)..add('cherry');
  final u = b.union(cherry);
  c.eq('bloom union with cherry', 'gAIAACAAgQACgBAACAESAAADIQAICGCACQCCAAAgBCE', u.serialize());
  c.eq('bloom union count', 6, u.countEstimate());
  c.throws<BloomException>('bloom union mismatch', () => b.union(BloomFilter(256, 6)));
  c.throws<BloomException>('bloom bad params', () => BloomFilter(7, 1));
  final full = BloomFilter(8, 1);
  for (var i = 0; i < 200; i++) {
    full.add('x$i');
  }
  c.eq('bloom saturated estimate', null, full.countEstimate());
}

void runStatsSummaryTests(Checks c) {
  {
    final s = summary(<num>[1]);
    c.eq('stats summary 0 count', 1, s.count);
    _close(c, 'stats summary 0 sum', 1.0, s.sum);
    _close(c, 'stats summary 0 min', 1.0, s.min);
    _close(c, 'stats summary 0 max', 1.0, s.max);
    _close(c, 'stats summary 0 mean', 1.0, s.mean);
    _close(c, 'stats summary 0 median', 1.0, s.median);
    _close(c, 'stats summary 0 variance', 0.0, s.variance);
    _close(c, 'stats summary 0 stddev', 0.0, s.stddev);
    _close(c, 'stats summary 0 p25', 1.0, s.p25);
    _close(c, 'stats summary 0 p75', 1.0, s.p75);
    _close(c, 'stats summary 0 p90', 1.0, s.p90);
    _close(c, 'stats summary 0 p95', 1.0, s.p95);
    _close(c, 'stats summary 0 p99', 1.0, s.p99);
  }
  {
    final s = summary(<num>[1, 2]);
    c.eq('stats summary 1 count', 2, s.count);
    _close(c, 'stats summary 1 sum', 3.0, s.sum);
    _close(c, 'stats summary 1 min', 1.0, s.min);
    _close(c, 'stats summary 1 max', 2.0, s.max);
    _close(c, 'stats summary 1 mean', 1.5, s.mean);
    _close(c, 'stats summary 1 median', 1.5, s.median);
    _close(c, 'stats summary 1 variance', 0.5, s.variance);
    _close(c, 'stats summary 1 stddev', 0.7071067811865476, s.stddev);
    _close(c, 'stats summary 1 p25', 1.25, s.p25);
    _close(c, 'stats summary 1 p75', 1.75, s.p75);
    _close(c, 'stats summary 1 p90', 1.9, s.p90);
    _close(c, 'stats summary 1 p95', 1.95, s.p95);
    _close(c, 'stats summary 1 p99', 1.99, s.p99);
  }
  {
    final s = summary(<num>[3, 1, 2]);
    c.eq('stats summary 2 count', 3, s.count);
    _close(c, 'stats summary 2 sum', 6.0, s.sum);
    _close(c, 'stats summary 2 min', 1.0, s.min);
    _close(c, 'stats summary 2 max', 3.0, s.max);
    _close(c, 'stats summary 2 mean', 2.0, s.mean);
    _close(c, 'stats summary 2 median', 2.0, s.median);
    _close(c, 'stats summary 2 variance', 1.0, s.variance);
    _close(c, 'stats summary 2 stddev', 1.0, s.stddev);
    _close(c, 'stats summary 2 p25', 1.5, s.p25);
    _close(c, 'stats summary 2 p75', 2.5, s.p75);
    _close(c, 'stats summary 2 p90', 2.8, s.p90);
    _close(c, 'stats summary 2 p95', 2.9, s.p95);
    _close(c, 'stats summary 2 p99', 2.98, s.p99);
  }
  {
    final s = summary(<num>[2, 4, 4, 4, 5, 5, 7, 9]);
    c.eq('stats summary 3 count', 8, s.count);
    _close(c, 'stats summary 3 sum', 40.0, s.sum);
    _close(c, 'stats summary 3 min', 2.0, s.min);
    _close(c, 'stats summary 3 max', 9.0, s.max);
    _close(c, 'stats summary 3 mean', 5.0, s.mean);
    _close(c, 'stats summary 3 median', 4.5, s.median);
    _close(c, 'stats summary 3 variance', 4.571428571428571, s.variance);
    _close(c, 'stats summary 3 stddev', 2.138089935299395, s.stddev);
    _close(c, 'stats summary 3 p25', 4.0, s.p25);
    _close(c, 'stats summary 3 p75', 5.5, s.p75);
    _close(c, 'stats summary 3 p90', 7.6, s.p90);
    _close(c, 'stats summary 3 p95', 8.3, s.p95);
    _close(c, 'stats summary 3 p99', 8.86, s.p99);
  }
  {
    final s = summary(<num>[1.5, 2.5, -3.25, 10, 0]);
    c.eq('stats summary 4 count', 5, s.count);
    _close(c, 'stats summary 4 sum', 10.75, s.sum);
    _close(c, 'stats summary 4 min', -3.25, s.min);
    _close(c, 'stats summary 4 max', 10.0, s.max);
    _close(c, 'stats summary 4 mean', 2.15, s.mean);
    _close(c, 'stats summary 4 median', 1.5, s.median);
    _close(c, 'stats summary 4 variance', 23.9875, s.variance);
    _close(c, 'stats summary 4 stddev', 4.897703543498729, s.stddev);
    _close(c, 'stats summary 4 p25', 0.0, s.p25);
    _close(c, 'stats summary 4 p75', 2.5, s.p75);
    _close(c, 'stats summary 4 p90', 7.000000000000001, s.p90);
    _close(c, 'stats summary 4 p95', 8.499999999999998, s.p95);
    _close(c, 'stats summary 4 p99', 9.7, s.p99);
  }
  {
    final s = summary(<num>[10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    c.eq('stats summary 5 count', 10, s.count);
    _close(c, 'stats summary 5 sum', 550.0, s.sum);
    _close(c, 'stats summary 5 min', 10.0, s.min);
    _close(c, 'stats summary 5 max', 100.0, s.max);
    _close(c, 'stats summary 5 mean', 55.0, s.mean);
    _close(c, 'stats summary 5 median', 55.0, s.median);
    _close(c, 'stats summary 5 variance', 916.6666666666666, s.variance);
    _close(c, 'stats summary 5 stddev', 30.276503540974915, s.stddev);
    _close(c, 'stats summary 5 p25', 32.5, s.p25);
    _close(c, 'stats summary 5 p75', 77.5, s.p75);
    _close(c, 'stats summary 5 p90', 91.0, s.p90);
    _close(c, 'stats summary 5 p95', 95.5, s.p95);
    _close(c, 'stats summary 5 p99', 99.1, s.p99);
  }
  {
    final s = summary(<num>[1000000004.0, 1000000007.0, 1000000013.0, 1000000016.0]);
    c.eq('stats summary 6 count', 4, s.count);
    _close(c, 'stats summary 6 sum', 4000000040.0, s.sum);
    _close(c, 'stats summary 6 min', 1000000004.0, s.min);
    _close(c, 'stats summary 6 max', 1000000016.0, s.max);
    _close(c, 'stats summary 6 mean', 1000000010.0, s.mean);
    _close(c, 'stats summary 6 median', 1000000010.0, s.median);
    _close(c, 'stats summary 6 variance', 30.0, s.variance);
    _close(c, 'stats summary 6 stddev', 5.477225575051661, s.stddev);
    _close(c, 'stats summary 6 p25', 1000000006.25, s.p25);
    _close(c, 'stats summary 6 p75', 1000000013.75, s.p75);
    _close(c, 'stats summary 6 p90', 1000000015.1, s.p90);
    _close(c, 'stats summary 6 p95', 1000000015.55, s.p95);
    _close(c, 'stats summary 6 p99', 1000000015.91, s.p99);
  }
  _close(c, 'stats percentile 0', 2.0, percentile(<num>[2, 4, 4, 4, 5, 5, 7, 9], 0));
  _close(c, 'stats percentile 1', 3.4, percentile(<num>[2, 4, 4, 4, 5, 5, 7, 9], 10));
  _close(c, 'stats percentile 2', 4.0, percentile(<num>[2, 4, 4, 4, 5, 5, 7, 9], 33.3));
  _close(c, 'stats percentile 3', 4.5, percentile(<num>[2, 4, 4, 4, 5, 5, 7, 9], 50));
  _close(c, 'stats percentile 4', 8.986, percentile(<num>[2, 4, 4, 4, 5, 5, 7, 9], 99.9));
  _close(c, 'stats percentile 5', 9.0, percentile(<num>[2, 4, 4, 4, 5, 5, 7, 9], 100));
  _close(c, 'stats percentile 6', -3.25, percentile(<num>[1.5, 2.5, -3.25, 10, 0], 0));
  _close(c, 'stats percentile 7', -1.95, percentile(<num>[1.5, 2.5, -3.25, 10, 0], 10));
  _close(c, 'stats percentile 8', 0.4979999999999998, percentile(<num>[1.5, 2.5, -3.25, 10, 0], 33.3));
  _close(c, 'stats percentile 9', 1.5, percentile(<num>[1.5, 2.5, -3.25, 10, 0], 50));
  _close(c, 'stats percentile 10', 9.970000000000002, percentile(<num>[1.5, 2.5, -3.25, 10, 0], 99.9));
  _close(c, 'stats percentile 11', 10.0, percentile(<num>[1.5, 2.5, -3.25, 10, 0], 100));
  _close(c, 'stats percentile 12', 10.0, percentile(<num>[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0));
  _close(c, 'stats percentile 13', 19.0, percentile(<num>[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 10));
  _close(c, 'stats percentile 14', 39.97, percentile(<num>[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 33.3));
  _close(c, 'stats percentile 15', 55.0, percentile(<num>[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 50));
  _close(c, 'stats percentile 16', 99.91, percentile(<num>[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 99.9));
  _close(c, 'stats percentile 17', 100.0, percentile(<num>[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 100));
  c.eq('stats histogram 0', '1,3,3|1|1', _hist(histogram(<num>[1, 2, 2.5, 3, 5, 9, -1, 10, 11], <num>[0, 2, 5, 10])));
  c.eq('stats histogram 1', '1|0|0', _hist(histogram(<num>[0.5], <num>[0, 1])));
  c.throws<StatsException>('stats invalid summary 0', () => summary(<num>[]));
  c.throws<StatsException>('stats invalid percentile 0', () => percentile(<num>[1, 2], -1));
  c.throws<StatsException>('stats invalid percentile 1', () => percentile(<num>[1, 2], 100.5));
  c.throws<StatsException>('stats invalid edges 0', () => histogram(<num>[1], <num>[0]));
  c.throws<StatsException>('stats invalid edges 1', () => histogram(<num>[1], <num>[1, 1]));
  c.throws<StatsException>('stats invalid edges 2', () => histogram(<num>[1], <num>[2, 1]));
  c.throws<StatsException>('stats non-finite', () => summary(<num>[1, double.nan]));
}

void runIntervalMergeTests(Checks c) {
  _same(c, 'intervals merge 0', <Interval>[(1, 6), (8, 10), (15, 20)], merge(<Interval>[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)]));
  _same(c, 'intervals merge 1', <Interval>[(1, 3), (5, 7)], merge(<Interval>[(5, 7), (1, 2), (2, 3)]));
  _same(c, 'intervals merge 2', <Interval>[], merge(<Interval>[]));
  _same(c, 'intervals merge 3', <Interval>[(-5, 4)], merge(<Interval>[(-5, -1), (-3, 4)]));
  _same(c, 'intervals intersect 0', <Interval>[(1, 2), (5, 6), (8, 9), (17, 20)], intersect(<Interval>[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)], <Interval>[(0, 2), (5, 9), (17, 30)]));
  _same(c, 'intervals intersect 1', <Interval>[], intersect(<Interval>[(1, 2)], <Interval>[(2, 3)]));
  _same(c, 'intervals intersect 2', <Interval>[(10, 20), (30, 40)], intersect(<Interval>[(0, 100)], <Interval>[(10, 20), (30, 40)]));
  _same(c, 'intervals subtract 0', <Interval>[(2, 5), (9, 10), (15, 17)], subtract(<Interval>[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)], <Interval>[(0, 2), (5, 9), (17, 30)]));
  _same(c, 'intervals subtract 1', <Interval>[(0, 2), (3, 5), (7, 10)], subtract(<Interval>[(0, 10)], <Interval>[(2, 3), (5, 7)]));
  _same(c, 'intervals subtract 2', <Interval>[], subtract(<Interval>[(0, 10)], <Interval>[(0, 10)]));
  _same(c, 'intervals subtract 3', <Interval>[(0, 10)], subtract(<Interval>[(0, 10)], <Interval>[]));
  _same(c, 'intervals gaps 0', <Interval>[(0, 1), (6, 8), (10, 15), (20, 25)], gaps(<Interval>[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)], 0, 25));
  _same(c, 'intervals gaps 1', <Interval>[(3, 5)], gaps(<Interval>[], 3, 5));
  c.eq('intervals total 0', 12, total(<Interval>[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)]));
  c.eq('intervals total 1', 19, total(<Interval>[(0, 2), (5, 9), (17, 30)]));
  c.eq('intervals overlaps 0', true, overlaps((1, 3), (2, 4)));
  c.eq('intervals overlaps 1', false, overlaps((1, 3), (3, 4)));
  c.eq('intervals overlaps 2', true, overlaps((5, 9), (6, 7)));
  c.eq('intervals overlaps 3', false, overlaps((1, 2), (5, 6)));
  c.eq('intervals contains 0', false, contains(<Interval>[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)], 6));
  c.eq('intervals contains 1', true, contains(<Interval>[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)], 5));
  c.eq('intervals contains 2', false, contains(<Interval>[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)], 20));
  c.eq('intervals contains 3', true, contains(<Interval>[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)], 19));
  c.eq('intervals contains 4', false, contains(<Interval>[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)], 0));
  c.throws<IntervalException>('intervals invalid merge 0', () => merge(<Interval>[(3, 3)]));
  c.throws<IntervalException>('intervals invalid overlaps 0', () => overlaps((3, 3), (0, 1)));
  c.throws<IntervalException>('intervals invalid merge 1', () => merge(<Interval>[(5, 1)]));
  c.throws<IntervalException>('intervals invalid overlaps 1', () => overlaps((5, 1), (0, 1)));
  c.throws<IntervalException>('intervals invalid gaps bounds', () => gaps(<Interval>[], 5, 5));
}

void runShellQuoteTests(Checks c) {
  c.eq('shell quote 0', '\'\'', shellQuote(''));
  c.eq('shell quote 1', 'abc', shellQuote('abc'));
  c.eq('shell quote 2', '\'a b\'', shellQuote('a b'));
  c.eq('shell quote 3', '\'it\'\\\'\'s\'', shellQuote('it\'s'));
  c.eq('shell quote 4', '\'a"b\'', shellQuote('a"b'));
  c.eq('shell quote 5', '\'\$HOME\'', shellQuote('\$HOME'));
  c.eq('shell quote 6', '\'*.txt\'', shellQuote('*.txt'));
  c.eq('shell quote 7', 'x=1', shellQuote('x=1'));
  c.eq('shell quote 8', 'path/to/file.txt', shellQuote('path/to/file.txt'));
  c.eq('shell quote 9', '\'tab\there\'', shellQuote('tab\there'));
  c.eq('shell quote 10', '\'line\nbreak\'', shellQuote('line\nbreak'));
  c.eq('shell quote 11', '\'é\'', shellQuote('é'));
  c.eq('shell quote 12', '-n', shellQuote('-n'));
  c.eq('shell quote 13', '\'~user\'', shellQuote('~user'));
  c.eq('shell quote 14', '\'!bang\'', shellQuote('!bang'));
  c.eq('shell quote 15', '\'\'\\\'\'\'\\\'\'\'', shellQuote('\'\''));
  c.eq('shell join 0', 'ls -la \'my file\' \'it\'\\\'\'s\'', shellJoin(<String>['ls', '-la', 'my file', 'it\'s']));
  c.eq('shell join 1', '', shellJoin(<String>[]));
  _same(c, 'shell split 0', <String>['a', 'b', 'c'], shellSplit('a b  c'));
  _same(c, 'shell split 1', <String>['a b', 'c'], shellSplit('\'a b\' c'));
  _same(c, 'shell split 2', <String>['a b', 'c'], shellSplit('"a b" c'));
  _same(c, 'shell split 3', <String>['a b'], shellSplit('a\\ b'));
  _same(c, 'shell split 4', <String>['say "hi"'], shellSplit('"say \\"hi\\""'));
  _same(c, 'shell split 5', <String>['keep \\n and \\x'], shellSplit('"keep \\n and \\x"'));
  _same(c, 'shell split 6', <String>['no \\escape'], shellSplit('\'no \\escape\''));
  _same(c, 'shell split 7', <String>['xyzw'], shellSplit('x"y"\'z\'w'));
  _same(c, 'shell split 8', <String>['', ''], shellSplit('\'\' ""'));
  _same(c, 'shell split 9', <String>['a', 'b', 'c'], shellSplit('a\tb\nc'));
  _same(c, 'shell split 10', <String>['echo', '\$HOME', '*.txt', '~'], shellSplit('echo \$HOME *.txt ~'));
  _same(c, 'shell split 11', <String>['ab'], shellSplit('"a\\\nb"'));
  _same(c, 'shell split 12', <String>['ab'], shellSplit('a\\\nb'));
  _same(c, 'shell split 13', <String>[], shellSplit('# comment'));
  _same(c, 'shell split 14', <String>['cmd'], shellSplit('cmd # trailing comment'));
  _same(c, 'shell split 15', <String>['a#b'], shellSplit('a#b'));
  _same(c, 'shell split 16', <String>['\$x'], shellSplit('"\$x"'));
  _same(c, 'shell split 17', <String>['lead', 'trail'], shellSplit('  lead  trail  '));
  _same(c, 'shell roundtrip 0', <String>[''], shellSplit(shellQuote('')));
  _same(c, 'shell roundtrip 1', <String>['abc'], shellSplit(shellQuote('abc')));
  _same(c, 'shell roundtrip 2', <String>['a b'], shellSplit(shellQuote('a b')));
  _same(c, 'shell roundtrip 3', <String>['it\'s'], shellSplit(shellQuote('it\'s')));
  _same(c, 'shell roundtrip 4', <String>['a"b'], shellSplit(shellQuote('a"b')));
  _same(c, 'shell roundtrip 5', <String>['\$HOME'], shellSplit(shellQuote('\$HOME')));
  _same(c, 'shell roundtrip 6', <String>['*.txt'], shellSplit(shellQuote('*.txt')));
  _same(c, 'shell roundtrip 7', <String>['x=1'], shellSplit(shellQuote('x=1')));
  _same(c, 'shell roundtrip 8', <String>['path/to/file.txt'], shellSplit(shellQuote('path/to/file.txt')));
  _same(c, 'shell roundtrip 9', <String>['tab\there'], shellSplit(shellQuote('tab\there')));
  _same(c, 'shell roundtrip 10', <String>['line\nbreak'], shellSplit(shellQuote('line\nbreak')));
  _same(c, 'shell roundtrip 11', <String>['é'], shellSplit(shellQuote('é')));
  _same(c, 'shell roundtrip 12', <String>['-n'], shellSplit(shellQuote('-n')));
  _same(c, 'shell roundtrip 13', <String>['~user'], shellSplit(shellQuote('~user')));
  _same(c, 'shell roundtrip 14', <String>['!bang'], shellSplit(shellQuote('!bang')));
  _same(c, 'shell roundtrip 15', <String>['\'\''], shellSplit(shellQuote('\'\'')));
  c.throws<ShellQuoteException>('shell invalid split 0', () => shellSplit('\'open'));
  c.throws<ShellQuoteException>('shell invalid split 1', () => shellSplit('"open'));
  c.throws<ShellQuoteException>('shell invalid split 2', () => shellSplit('trail\\'));
  c.throws<ShellQuoteException>('shell invalid split 3', () => shellSplit('"bad \\'));
}

void runNumberWordsTests(Checks c) {
  c.eq('number words 0', 'zero', numberToWords(0));
  c.eq('number words 1', 'one', numberToWords(1));
  c.eq('number words 2', 'seven', numberToWords(7));
  c.eq('number words 3', 'ten', numberToWords(10));
  c.eq('number words 4', 'eleven', numberToWords(11));
  c.eq('number words 5', 'thirteen', numberToWords(13));
  c.eq('number words 6', 'nineteen', numberToWords(19));
  c.eq('number words 7', 'twenty', numberToWords(20));
  c.eq('number words 8', 'twenty-one', numberToWords(21));
  c.eq('number words 9', 'forty-two', numberToWords(42));
  c.eq('number words 10', 'ninety-nine', numberToWords(99));
  c.eq('number words 11', 'one hundred', numberToWords(100));
  c.eq('number words 12', 'one hundred one', numberToWords(101));
  c.eq('number words 13', 'one hundred ten', numberToWords(110));
  c.eq('number words 14', 'one hundred fifteen', numberToWords(115));
  c.eq('number words 15', 'nine hundred ninety-nine', numberToWords(999));
  c.eq('number words 16', 'one thousand', numberToWords(1000));
  c.eq('number words 17', 'one thousand one', numberToWords(1001));
  c.eq('number words 18', 'one thousand ten', numberToWords(1010));
  c.eq('number words 19', 'one thousand one hundred', numberToWords(1100));
  c.eq('number words 20', 'two thousand twenty-four', numberToWords(2024));
  c.eq('number words 21', 'twelve thousand three hundred forty-five', numberToWords(12345));
  c.eq('number words 22', 'one hundred thousand', numberToWords(100000));
  c.eq('number words 23', 'nine hundred ninety-nine thousand nine hundred ninety-nine', numberToWords(999999));
  c.eq('number words 24', 'one million', numberToWords(1000000));
  c.eq('number words 25', 'one million one', numberToWords(1000001));
  c.eq('number words 26', 'one million two hundred thirty-four thousand five hundred sixty-seven', numberToWords(1234567));
  c.eq('number words 27', 'one billion', numberToWords(1000000000));
  c.eq('number words 28', 'one billion two million three thousand four', numberToWords(1002003004));
  c.eq('number words 29', 'nine hundred ninety-nine trillion nine hundred ninety-nine billion nine hundred ninety-nine million nine hundred ninety-nine thousand nine hundred ninety-nine', numberToWords(999999999999999));
  c.eq('number words 30', 'negative one', numberToWords(-1));
  c.eq('number words 31', 'negative forty-two', numberToWords(-42));
  c.eq('number words 32', 'negative one million', numberToWords(-1000000));
  c.eq('number ordinal words 0', 'zeroth', ordinalWords(0));
  c.eq('number ordinal words 1', 'first', ordinalWords(1));
  c.eq('number ordinal words 2', 'second', ordinalWords(2));
  c.eq('number ordinal words 3', 'third', ordinalWords(3));
  c.eq('number ordinal words 4', 'fourth', ordinalWords(4));
  c.eq('number ordinal words 5', 'fifth', ordinalWords(5));
  c.eq('number ordinal words 6', 'eighth', ordinalWords(8));
  c.eq('number ordinal words 7', 'ninth', ordinalWords(9));
  c.eq('number ordinal words 8', 'eleventh', ordinalWords(11));
  c.eq('number ordinal words 9', 'twelfth', ordinalWords(12));
  c.eq('number ordinal words 10', 'twentieth', ordinalWords(20));
  c.eq('number ordinal words 11', 'twenty-first', ordinalWords(21));
  c.eq('number ordinal words 12', 'twenty-second', ordinalWords(22));
  c.eq('number ordinal words 13', 'twenty-third', ordinalWords(23));
  c.eq('number ordinal words 14', 'thirtieth', ordinalWords(30));
  c.eq('number ordinal words 15', 'fortieth', ordinalWords(40));
  c.eq('number ordinal words 16', 'ninety-ninth', ordinalWords(99));
  c.eq('number ordinal words 17', 'one hundredth', ordinalWords(100));
  c.eq('number ordinal words 18', 'one hundred first', ordinalWords(101));
  c.eq('number ordinal words 19', 'one hundred second', ordinalWords(102));
  c.eq('number ordinal words 20', 'one hundred eleventh', ordinalWords(111));
  c.eq('number ordinal words 21', 'one hundred twelfth', ordinalWords(112));
  c.eq('number ordinal words 22', 'one thousandth', ordinalWords(1000));
  c.eq('number ordinal words 23', 'one thousand first', ordinalWords(1001));
  c.eq('number ordinal words 24', 'one millionth', ordinalWords(1000000));
  c.eq('number ordinal words 25', 'two thousand twenty-third', ordinalWords(2023));
  c.eq('number ordinal suffix 0', '0th', ordinalSuffix(0));
  c.eq('number ordinal suffix 1', '1st', ordinalSuffix(1));
  c.eq('number ordinal suffix 2', '2nd', ordinalSuffix(2));
  c.eq('number ordinal suffix 3', '3rd', ordinalSuffix(3));
  c.eq('number ordinal suffix 4', '4th', ordinalSuffix(4));
  c.eq('number ordinal suffix 5', '11th', ordinalSuffix(11));
  c.eq('number ordinal suffix 6', '12th', ordinalSuffix(12));
  c.eq('number ordinal suffix 7', '13th', ordinalSuffix(13));
  c.eq('number ordinal suffix 8', '14th', ordinalSuffix(14));
  c.eq('number ordinal suffix 9', '21st', ordinalSuffix(21));
  c.eq('number ordinal suffix 10', '22nd', ordinalSuffix(22));
  c.eq('number ordinal suffix 11', '23rd', ordinalSuffix(23));
  c.eq('number ordinal suffix 12', '101st', ordinalSuffix(101));
  c.eq('number ordinal suffix 13', '111th', ordinalSuffix(111));
  c.eq('number ordinal suffix 14', '112th', ordinalSuffix(112));
  c.eq('number ordinal suffix 15', '113th', ordinalSuffix(113));
  c.eq('number ordinal suffix 16', '1001st', ordinalSuffix(1001));
  c.eq('number ordinal suffix 17', '-1st', ordinalSuffix(-1));
  c.eq('number ordinal suffix 18', '-11th', ordinalSuffix(-11));
  c.eq('number ordinal suffix 19', '-22nd', ordinalSuffix(-22));
  c.eq('number money 0', 'one hundred twenty-three dollars and forty-five cents', moneyWords(12345, 'dollar', 'cent', 2));
  c.eq('number money 1', 'one dollar', moneyWords(100, 'dollar', 'cent', 2));
  c.eq('number money 2', 'zero dollars and one cent', moneyWords(1, 'dollar', 'cent', 2));
  c.eq('number money 3', 'one euro and one cent', moneyWords(101, 'euro', 'cent', 2));
  c.eq('number money 4', 'zero dollars', moneyWords(0, 'dollar', 'cent', 2));
  c.eq('number money 5', 'five hundred yens', moneyWords(500, 'yen', 'sen', 0));
  c.eq('number money 6', 'one dinar and one fils', moneyWords(1001, 'dinar', 'fils', 3));
  c.eq('number money 7', 'one pound and ninety-nine pennys', moneyWords(199, 'pound', 'penny', 2));
  c.throws<NumberWordsException>('number invalid words 0', () => numberToWords(1000000000000000));
  c.throws<NumberWordsException>('number invalid words 1', () => numberToWords(-1000000000000000));
  c.throws<NumberWordsException>('number invalid ordinal 0', () => ordinalWords(-1));
  c.throws<NumberWordsException>('number invalid money', () => moneyWords(-1, 'dollar', 'cent'));
}

void runPaginationWindowTests(Checks c) {
  c.eq('pagination page count 0', 1, pageCount(0, 10));
  c.eq('pagination page count 1', 1, pageCount(1, 10));
  c.eq('pagination page count 2', 1, pageCount(10, 10));
  c.eq('pagination page count 3', 2, pageCount(11, 10));
  c.eq('pagination page count 4', 40, pageCount(999, 25));
  c.eq('pagination page count 5', 5, pageCount(5, 1));
  c.eq('pagination offset 0', 0, pageOffset(1, 20));
  c.eq('pagination offset 1', 40, pageOffset(3, 20));
  _same(c, 'pagination window 0', <int?>[1], pageWindow(1, 1, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 1', <int?>[1, 2], pageWindow(1, 2, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 2', <int?>[1, 2], pageWindow(2, 2, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 3', <int?>[1, 2, 3], pageWindow(1, 3, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 4', <int?>[1, 2, 3], pageWindow(2, 3, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 5', <int?>[1, 2, 3], pageWindow(3, 3, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 6', <int?>[1, 2, 3, 4, 5], pageWindow(1, 5, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 7', <int?>[1, 2, 3, 4, 5], pageWindow(2, 5, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 8', <int?>[1, 2, 3, 4, 5], pageWindow(3, 5, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 9', <int?>[1, 2, 3, 4, 5], pageWindow(4, 5, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 10', <int?>[1, 2, 3, 4, 5], pageWindow(5, 5, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 11', <int?>[1, 2, 3, 4, 5, 6, 7], pageWindow(1, 7, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 12', <int?>[1, 2, 3, 4, 5, 6, 7], pageWindow(2, 7, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 13', <int?>[1, 2, 3, 4, 5, 6, 7], pageWindow(3, 7, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 14', <int?>[1, 2, 3, 4, 5, 6, 7], pageWindow(4, 7, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 15', <int?>[1, 2, 3, 4, 5, 6, 7], pageWindow(5, 7, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 16', <int?>[1, 2, 3, 4, 5, 6, 7], pageWindow(6, 7, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 17', <int?>[1, 2, 3, 4, 5, 6, 7], pageWindow(7, 7, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 18', <int?>[1, 2, 3, 4, 5, null, 8], pageWindow(1, 8, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 19', <int?>[1, 2, 3, 4, 5, null, 8], pageWindow(2, 8, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 20', <int?>[1, 2, 3, 4, 5, null, 8], pageWindow(3, 8, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 21', <int?>[1, 2, 3, 4, 5, null, 8], pageWindow(4, 8, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 22', <int?>[1, null, 4, 5, 6, 7, 8], pageWindow(6, 8, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 23', <int?>[1, null, 4, 5, 6, 7, 8], pageWindow(7, 8, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 24', <int?>[1, null, 4, 5, 6, 7, 8], pageWindow(8, 8, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 25', <int?>[1, 2, 3, 4, 5, null, 10], pageWindow(1, 10, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 26', <int?>[1, 2, 3, 4, 5, null, 10], pageWindow(2, 10, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 27', <int?>[1, 2, 3, 4, 5, null, 10], pageWindow(3, 10, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 28', <int?>[1, 2, 3, 4, 5, null, 10], pageWindow(4, 10, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 29', <int?>[1, null, 4, 5, 6, null, 10], pageWindow(5, 10, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 30', <int?>[1, null, 6, 7, 8, 9, 10], pageWindow(8, 10, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 31', <int?>[1, null, 6, 7, 8, 9, 10], pageWindow(9, 10, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 32', <int?>[1, null, 6, 7, 8, 9, 10], pageWindow(10, 10, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 33', <int?>[1, 2, 3, 4, 5, null, 20], pageWindow(1, 20, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 34', <int?>[1, 2, 3, 4, 5, null, 20], pageWindow(2, 20, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 35', <int?>[1, 2, 3, 4, 5, null, 20], pageWindow(3, 20, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 36', <int?>[1, 2, 3, 4, 5, null, 20], pageWindow(4, 20, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 37', <int?>[1, null, 9, 10, 11, null, 20], pageWindow(10, 20, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 38', <int?>[1, null, 16, 17, 18, 19, 20], pageWindow(18, 20, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 39', <int?>[1, null, 16, 17, 18, 19, 20], pageWindow(19, 20, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 40', <int?>[1, null, 16, 17, 18, 19, 20], pageWindow(20, 20, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 41', <int?>[1, 2, 3, 4, 5, null, 100], pageWindow(1, 100, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 42', <int?>[1, 2, 3, 4, 5, null, 100], pageWindow(2, 100, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 43', <int?>[1, 2, 3, 4, 5, null, 100], pageWindow(3, 100, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 44', <int?>[1, 2, 3, 4, 5, null, 100], pageWindow(4, 100, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 45', <int?>[1, null, 49, 50, 51, null, 100], pageWindow(50, 100, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 46', <int?>[1, null, 96, 97, 98, 99, 100], pageWindow(98, 100, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 47', <int?>[1, null, 96, 97, 98, 99, 100], pageWindow(99, 100, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 48', <int?>[1, null, 96, 97, 98, 99, 100], pageWindow(100, 100, siblings: 1, boundaries: 1));
  _same(c, 'pagination window 49', <int?>[1, null, 8, 9, 10, 11, 12, null, 20], pageWindow(10, 20, siblings: 2, boundaries: 1));
  _same(c, 'pagination window 50', <int?>[1, null, 10, null, 20], pageWindow(10, 20, siblings: 0, boundaries: 1));
  _same(c, 'pagination window 51', <int?>[1, 2, null, 9, 10, 11, null, 19, 20], pageWindow(10, 20, siblings: 1, boundaries: 2));
  _same(c, 'pagination window 52', <int?>[1, 2, 3, 4, 5, 6, 7, 8, null, 19, 20], pageWindow(1, 20, siblings: 2, boundaries: 2));
  _same(c, 'pagination window 53', <int?>[1, 2, null, 13, 14, 15, 16, 17, 18, 19, 20], pageWindow(20, 20, siblings: 2, boundaries: 2));
  _same(c, 'pagination window 54', <int?>[1, 2, 3, null, 47, 48, 49, 50, 51, 52, 53, null, 98, 99, 100], pageWindow(50, 100, siblings: 3, boundaries: 3));
  c.throws<PaginationException>('pagination invalid window 0', () => pageWindow(0, 10, siblings: 1, boundaries: 1));
  c.throws<PaginationException>('pagination invalid window 1', () => pageWindow(11, 10, siblings: 1, boundaries: 1));
  c.throws<PaginationException>('pagination invalid window 2', () => pageWindow(1, 0, siblings: 1, boundaries: 1));
  c.throws<PaginationException>('pagination invalid window 3', () => pageWindow(1, 10, siblings: 6, boundaries: 1));
  c.throws<PaginationException>('pagination invalid window 4', () => pageWindow(1, 10, siblings: 1, boundaries: 0));
  c.throws<PaginationException>('pagination invalid page count 0', () => pageCount(-1, 10));
  c.throws<PaginationException>('pagination invalid page count 1', () => pageCount(5, 0));
  c.throws<PaginationException>('pagination invalid page count 2', () => pageCount(5, 1001));
  c.throws<PaginationException>('pagination invalid offset', () => pageOffset(0, 10));
}

void runTextWrapTests(Checks c) {
  c.eq('text wrap 0', 'T\nh\ne\nq\nu\ni\nc\nk\nb\nr\no\nw\nn\nf\no\nx\nj\nu\nm\np\ns\no\nv\ne\nr\nt\nh\ne\nl\na\nz\ny\nd\no\ng', wrapText('The quick brown fox jumps over the lazy dog', 1));
  c.eq('text wrap 1', 'The\nquick\nbrown\nfox\njumps\nover\nthe\nlazy\ndog', wrapText('The quick brown fox jumps over the lazy dog', 5));
  c.eq('text wrap 2', 'The quick\nbrown fox\njumps over\nthe lazy\ndog', wrapText('The quick brown fox jumps over the lazy dog', 10));
  c.eq('text wrap 3', 'The quick brown fox\njumps over the lazy\ndog', wrapText('The quick brown fox jumps over the lazy dog', 20));
  c.eq('text wrap 4', 'a\nb\nc', wrapText('a  b\t\tc', 1));
  c.eq('text wrap 5', 'a b c', wrapText('a  b\t\tc', 5));
  c.eq('text wrap 6', 'a b c', wrapText('a  b\t\tc', 10));
  c.eq('text wrap 7', 'a b c', wrapText('a  b\t\tc', 20));
  c.eq('text wrap 8', 's\nu\np\ne\nr\nc\na\nl\ni\nf\nr\na\ng\ni\nl\ni\ns\nt\ni\nc\ne\nx\np\ni\na\nl\ni\nd\no\nc\ni\no\nu\ns\nw\no\nr\nd', wrapText('supercalifragilisticexpialidocious word', 1));
  c.eq('text wrap 9', 'super\ncalif\nragil\nistic\nexpia\nlidoc\nious\nword', wrapText('supercalifragilisticexpialidocious word', 5));
  c.eq('text wrap 10', 'supercalif\nragilistic\nexpialidoc\nious word', wrapText('supercalifragilisticexpialidocious word', 10));
  c.eq('text wrap 11', 'supercalifragilistic\nexpialidocious word', wrapText('supercalifragilisticexpialidocious word', 20));
  c.eq('text wrap 12', 'l\ni\nn\ne\no\nn\ne\nl\ni\nn\ne\nt\nw\no\ni\ns\nl\no\nn\ng\ne\nr\nt\nh\na\nn\nt\ne\nn\n\ne\nn\nd', wrapText('line one\nline two is longer than ten\n\nend', 1));
  c.eq('text wrap 13', 'line\none\nline\ntwo\nis\nlonge\nr\nthan\nten\n\nend', wrapText('line one\nline two is longer than ten\n\nend', 5));
  c.eq('text wrap 14', 'line one\nline two\nis longer\nthan ten\n\nend', wrapText('line one\nline two is longer than ten\n\nend', 10));
  c.eq('text wrap 15', 'line one\nline two is longer\nthan ten\n\nend', wrapText('line one\nline two is longer than ten\n\nend', 20));
  c.eq('text wrap 16', 'c\na\nf\né\n😀\n😀\n😀\nn\na\nï\nv\ne', wrapText('café 😀😀😀 naïve', 1));
  c.eq('text wrap 17', 'café\n😀😀😀\nnaïve', wrapText('café 😀😀😀 naïve', 5));
  c.eq('text wrap 18', 'café 😀😀😀\nnaïve', wrapText('café 😀😀😀 naïve', 10));
  c.eq('text wrap 19', 'café 😀😀😀 naïve', wrapText('café 😀😀😀 naïve', 20));
  c.eq('text wrap 20', 't\nr\na\ni\nl\ni\nn\ng', wrapText('trailing   ', 1));
  c.eq('text wrap 21', 'trail\ning', wrapText('trailing   ', 5));
  c.eq('text wrap 22', 'trailing', wrapText('trailing   ', 10));
  c.eq('text wrap 23', 'trailing', wrapText('trailing   ', 20));
  c.eq('text wrap 24', '', wrapText('', 1));
  c.eq('text wrap 25', '', wrapText('', 5));
  c.eq('text wrap 26', '', wrapText('', 10));
  c.eq('text wrap 27', '', wrapText('', 20));
  c.eq('text wrap 28', 'c\nr\nl\nf\na\nn\nd\nc\nr', wrapText('crlf\r\nand\rcr', 1));
  c.eq('text wrap 29', 'crlf\nand\ncr', wrapText('crlf\r\nand\rcr', 5));
  c.eq('text wrap 30', 'crlf\nand\ncr', wrapText('crlf\r\nand\rcr', 10));
  c.eq('text wrap 31', 'crlf\nand\ncr', wrapText('crlf\r\nand\rcr', 20));
  c.eq('text truncate 0', 'The quick…', truncateText('The quick brown fox jumps', 15, '…'));
  c.eq('text truncate 1', 'The quick brown fox jumps', truncateText('The quick brown fox jumps', 100, '…'));
  c.eq('text truncate 2', 'Supercali…', truncateText('Supercalifragilistic', 10, '…'));
  c.eq('text truncate 3', 'Hello...', truncateText('Hello world', 8, '...'));
  c.eq('text truncate 4', 'Hi there you', truncateText('Hi there you', 12, '…'));
  c.eq('text truncate 5', 'a b…', truncateText('a b c d e f g', 6, '…'));
  c.eq('text truncate 6', '😀😀…', truncateText('😀😀😀😀', 3, '…'));
  c.eq('text truncate 7', 'abc', truncateText('abc', 3, '...'));
  c.eq('text truncate 8', '...', truncateText('abcd', 3, '...'));
  c.throws<TextWrapException>('text invalid wrap 0', () => wrapText('abc', 0));
  c.throws<TextWrapException>('text invalid truncate 0', () => truncateText('long text', 2, '...'));
  c.throws<TextWrapException>('text invalid truncate 1', () => truncateText('long text', 0, ''));
  c.eq('text truncate default ellipsis', 'Hello…', truncateText('Hello world', 7));
}

void runMarkdownTableTests(Checks c) {
  c.eq('markdown table 0', '| Name  | Qty |\n| ----- | --- |\n| Apple | 3   |\n| Kiwi  | 12  |', markdownTable(<String>['Name', 'Qty'], <List<String>>[<String>['Apple', '3'], <String>['Kiwi', '12']], null));
  c.eq('markdown table 1', '| a   |   b |  c  |\n| :-- | --: | :-: |\n| 1   |   2 |  3  |', markdownTable(<String>['a', 'b', 'c'], <List<String>>[<String>['1', '2', '3']], <String?>['left', 'right', 'center']));
  c.eq('markdown table 2', '| Pipe\\|col   | Text           |\n| ----------- | -------------- |\n| a\\|b        | line1<br>line2 |\n| back\\\\slash | crlf<br>x      |', markdownTable(<String>['Pipe|col', 'Text'], <List<String>>[<String>['a|b', 'line1\nline2'], <String>['back\\slash', 'crlf\r\nx']], null));
  c.eq('markdown table 3', '|  x  |\n| :-: |', markdownTable(<String>['x'], <List<String>>[], <String?>['center']));
  c.eq('markdown table 4', '|  Café | 😀   |\n| ----: | --- |\n| naïve | ok  |', markdownTable(<String>['Café', '😀'], <List<String>>[<String>['naïve', 'ok']], <String?>['right', null]));
  c.eq('markdown table 5', '|    wide    |\n| :--------: |\n| abcdefghij |', markdownTable(<String>['wide'], <List<String>>[<String>['abcdefghij']], <String?>['center']));
  c.throws<MarkdownTableException>('markdown table invalid 0', () => markdownTable(<String>[], <List<String>>[], null));
  c.throws<MarkdownTableException>('markdown table invalid 1', () => markdownTable(<String>['a', 'b'], <List<String>>[<String>['1']], null));
  c.throws<MarkdownTableException>('markdown table invalid 2', () => markdownTable(<String>['a'], <List<String>>[<String>['1']], <String?>['middle']));
}

void runNdjsonTests(Checks c) {
  _same(c, 'ndjson parse 0', <Object?>[<String, Object?>{'a': 1}, <String, Object?>{'b': <Object?>[1, 2]}], parseNdjson('{"a":1}\n{"b":[1,2]}\n'));
  _same(c, 'ndjson parse 1', <Object?>[1, 'x', true, null], parseNdjson('\n  \n1\r\n"x"\ntrue\nnull\n'));
  _same(c, 'ndjson parse 2', <Object?>[], parseNdjson(''));
  _same(c, 'ndjson parse 3', <Object?>[<String, Object?>{'k': 'café'}], parseNdjson('{"k":"café"}'));
  c.throws<NdjsonException>('ndjson invalid parse 0', () => parseNdjson('{"a":1}\n{bad}\n'), (e) => e.line == 2);
  c.throws<NdjsonException>('ndjson invalid parse 1', () => parseNdjson('1 2'), (e) => e.line == 1);
  c.throws<NdjsonException>('ndjson invalid parse 2', () => parseNdjson('{"a":1}\n\n[1,'), (e) => e.line == 3);
  c.eq('ndjson stringify 0', '{"a":1,"b":[true,null,"x"]}\n', stringifyNdjson(<Object?>[<String, Object?>{'a': 1, 'b': <Object?>[true, null, 'x']}]));
  c.eq('ndjson stringify 1', '1\n"two"\nfalse\n', stringifyNdjson(<Object?>[1, 'two', false]));
  c.eq('ndjson stringify 2', '', stringifyNdjson(<Object?>[]));
  c.eq('ndjson stringify 3', '{"q":"say \\"hi\\"\\\\ \\n\\t\\u0001 café"}\n', stringifyNdjson(<Object?>[<String, Object?>{'q': 'say "hi"\\ \n\t\u{1} café'}]));
  c.eq('ndjson stringify 4', '{"z":1,"a":2}\n', stringifyNdjson(<Object?>[<String, Object?>{'z': 1, 'a': 2}]));
  c.eq('ndjson stringify 5', '[]\n{}\n', stringifyNdjson(<Object?>[<Object?>[], <String, Object?>{}]));
  c.eq('ndjson stringify 6', '-42\n0\n', stringifyNdjson(<Object?>[-42, 0]));
  c.eq('ndjson round trip', '{"b":1,"a":[true]}\n', stringifyNdjson(parseNdjson('{"b":1,"a":[true]}')));
}
