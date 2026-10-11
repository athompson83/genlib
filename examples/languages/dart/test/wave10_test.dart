// SPDX-License-Identifier: Apache-2.0
// Wave 10 capability checks: glob matching, dotenv, query strings, MIME types, data: URLs, ISO weeks, topological sort,
// Link, Content-Disposition and Cache-Control headers. Every vector is generated from the shared wave 10 reference
// vectors (caps11 vectors.json) by a script; keep them identical across languages.
import 'package:genlib_validation_example/cache_control.dart';
import 'package:genlib_validation_example/content_disposition.dart';
import 'package:genlib_validation_example/data_uri.dart';
import 'package:genlib_validation_example/dotenv.dart';
import 'package:genlib_validation_example/glob_match.dart';
import 'package:genlib_validation_example/iso_week.dart';
import 'package:genlib_validation_example/link_header.dart';
import 'package:genlib_validation_example/mime_types.dart';
import 'package:genlib_validation_example/query_string.dart';
import 'package:genlib_validation_example/topo_sort.dart';

import 'src/checks.dart';

String _kv(Map<String, Object?> m) => m.entries.map((e) => '${e.key}\u{241F}${e.value}').join('\u{241E}');
String _pairs(Iterable<(String, String)> ps) => ps.map((p) => '${p.$1}\u{241F}${p.$2}').join('\u{241E}');
String _join(Iterable<String> xs) => xs.join('\u{241E}');
String _levels(List<List<String>> ls) => ls.map((l) => l.join(',')).join('|');
String _hexOf(List<int> b) => b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
List<int> _hex(String h) => [for (var i = 0; i < h.length; i += 2) int.parse(h.substring(i, i + 2), radix: 16)];
String _links(List<Link> ls) => ls.map((l) => '${l.uri}\u{241D}${_kv(l.params)}').join('\u{241C}');
String _cc(Map<String, Object> m) => m.entries
    .map((e) => '${e.key}\u{241F}${e.value is bool ? 'T' : e.value is int ? 'I:${e.value}' : 'S:${e.value}'}')
    .join('\u{241E}');

void runGlobMatchTests(Checks c) {
  c.eq('glob match 0 *.js a.js', true, globMatch('*.js', 'a.js', dot: false));
  c.eq('glob match 1 *.js a/b.js', false, globMatch('*.js', 'a/b.js', dot: false));
  c.eq('glob match 2 **/*.js a/b/c.js', true, globMatch('**/*.js', 'a/b/c.js', dot: false));
  c.eq('glob match 3 **/*.js c.js', true, globMatch('**/*.js', 'c.js', dot: false));
  c.eq('glob match 4 src/** src', true, globMatch('src/**', 'src', dot: false));
  c.eq('glob match 5 src/** src/a/b.ts', true, globMatch('src/**', 'src/a/b.ts', dot: false));
  c.eq('glob match 6 src/**/test/*.py src/test/x.py', true, globMatch('src/**/test/*.py', 'src/test/x.py', dot: false));
  c.eq('glob match 7 src/**/test/*.py src/a/b/test/x.py', true,
      globMatch('src/**/test/*.py', 'src/a/b/test/x.py', dot: false));
  c.eq('glob match 8 a?c abc', true, globMatch('a?c', 'abc', dot: false));
  c.eq('glob match 9 a?c a/c', false, globMatch('a?c', 'a/c', dot: false));
  c.eq('glob match 10 [a-c]x bx', true, globMatch('[a-c]x', 'bx', dot: false));
  c.eq('glob match 11 [!a-c]x bx', false, globMatch('[!a-c]x', 'bx', dot: false));
  c.eq('glob match 12 [!a-c]x dx', true, globMatch('[!a-c]x', 'dx', dot: false));
  c.eq('glob match 13 [^0-9] x', true, globMatch('[^0-9]', 'x', dot: false));
  c.eq('glob match 14 []a] a', true, globMatch('[]a]', 'a', dot: false));
  c.eq('glob match 15 []a] ]', true, globMatch('[]a]', ']', dot: false));
  c.eq('glob match 16 *.{js,ts} x.ts', true, globMatch('*.{js,ts}', 'x.ts', dot: false));
  c.eq('glob match 17 *.{js,ts} x.tsx', false, globMatch('*.{js,ts}', 'x.tsx', dot: false));
  c.eq('glob match 18 {src,lib}/**/*.go lib/x/y.go', true, globMatch('{src,lib}/**/*.go', 'lib/x/y.go', dot: false));
  c.eq('glob match 19 .* .env', true, globMatch('.*', '.env', dot: false));
  c.eq('glob match 20 * .env', false, globMatch('*', '.env', dot: false));
  c.eq('glob match 21 * .env', true, globMatch('*', '.env', dot: true));
  c.eq('glob match 22 **/x .git/x', false, globMatch('**/x', '.git/x', dot: false));
  c.eq('glob match 23 **/x .git/x', true, globMatch('**/x', '.git/x', dot: true));
  c.eq('glob match 24 a\\*b a*b', true, globMatch('a\\*b', 'a*b', dot: false));
  c.eq('glob match 25 a\\*b axb', false, globMatch('a\\*b', 'axb', dot: false));
  c.eq('glob match 26 * ', true, globMatch('*', '', dot: false));
  c.eq('glob match 27 ** a/b/c', true, globMatch('**', 'a/b/c', dot: false));
  c.eq('glob match 28 a/**/b a/b', true, globMatch('a/**/b', 'a/b', dot: false));
  c.eq('glob match 29 a/**/b a/x/y/b', true, globMatch('a/**/b', 'a/x/y/b', dot: false));
  c.eq('glob match 30 *.txt notes.TXT', false, globMatch('*.txt', 'notes.TXT', dot: false));
  c.eq('glob match 31 [a-z]*.md Readme.md', false, globMatch('[a-z]*.md', 'Readme.md', dot: false));
  c.eq('glob match 32 docs/* docs/a/b', false, globMatch('docs/*', 'docs/a/b', dot: false));
  c.eq('glob match 33 ? \u00e9', true, globMatch('?', '\u{E9}', dot: false));
  c.throws<FormatException>('glob invalid 0 [abc', () => globMatch('[abc', 'x'));
  c.throws<FormatException>('glob invalid 1 {a,b', () => globMatch('{a,b', 'x'));
  c.throws<FormatException>('glob invalid 2 a{b{c}}', () => globMatch('a{b{c}}', 'x'));
  c.throws<FormatException>('glob invalid 3 ', () => globMatch('', 'x'));
  c.throws<FormatException>('glob invalid 4 x\\', () => globMatch('x\\', 'x'));
  c.eq('glob filter', 'a.js\u{241E}b/c.js', _join(globFilter('**/*.js', ['a.js', 'b/c.js', 'd.ts', '.h/e.js'])));
}

void runDotenvTests(Checks c) {
  c.eq('dotenv parse 0 A=1\nB=two\n', 'A\u{241F}1\u{241E}B\u{241F}two', _kv(parseDotenv('A=1\nB=two\n')));
  c.eq('dotenv parse 1 # c\n\nexport KEY = value with...', 'KEY\u{241F}value with spaces',
      _kv(parseDotenv('# c\n\nexport KEY = value with spaces  # comment\n')));
  c.eq('dotenv parse 2 Q=\"a\\nb\\t\\\"c\\\" \\\\ \\H...', 'Q\u{241F}a\nb\t"c" \\ \$HOME',
      _kv(parseDotenv('Q="a\\nb\\t\\"c\\" \\\\ \\\$HOME"\n')));
  c.eq('dotenv parse 3 S=raw {X} \\n\n', 'S\u{241F}raw \${X} \\n', _kv(parseDotenv('S=\'raw \${X} \\n\'\n')));
  c.eq('dotenv parse 4 M=\"line1\nline2\"\nN=after\n', 'M\u{241F}line1\nline2\u{241E}N\u{241F}after',
      _kv(parseDotenv('M="line1\nline2"\nN=after\n')));
  c.eq('dotenv parse 5 E=\nF= \n', 'E\u{241F}\u{241E}F\u{241F}', _kv(parseDotenv('E=\nF= \n')));
  c.eq('dotenv parse 6 DUP=1\nDUP=2\n', 'DUP\u{241F}2', _kv(parseDotenv('DUP=1\nDUP=2\n')));
  c.eq('dotenv parse 7 URL=https://x.test/#frag\n', 'URL\u{241F}https://x.test/#frag',
      _kv(parseDotenv('URL=https://x.test/#frag\n')));
  c.eq('dotenv parse 8 H=a#b\n', 'H\u{241F}a#b', _kv(parseDotenv('H=a#b\n')));
  c.eq('dotenv parse 9 K.x_y=1\n', 'K.x_y\u{241F}1', _kv(parseDotenv('K.x_y=1\n')));
  c.eq('dotenv parse 10 W=\"x\" # trailing ok\n', 'W\u{241F}x', _kv(parseDotenv('W="x" # trailing ok\n')));
  c.eq('dotenv parse 11 CRLF=1\r\nNEXT=2\r\n', 'CRLF\u{241F}1\u{241E}NEXT\u{241F}2',
      _kv(parseDotenv('CRLF=1\r\nNEXT=2\r\n')));
  c.eq('dotenv expand 0 A=1\nB={A}-x\n', 'A\u{241F}1\u{241E}B\u{241F}1-x',
      _kv(parseDotenv('A=1\nB=\${A}-x\n', expand: true, vars: const {})));
  c.eq('dotenv expand 1 B={A}\nA=1\n', 'B\u{241F}env\u{241E}A\u{241F}1',
      _kv(parseDotenv('B=\${A}\nA=1\n', expand: true, vars: {'A': 'env'})));
  c.eq('dotenv expand 2 P={MISSING:-fallback}\nQ={EMPT...', 'P\u{241F}fallback\u{241E}Q\u{241F}d',
      _kv(parseDotenv('P=\${MISSING:-fallback}\nQ=\${EMPTY:-d}\n', expand: true, vars: {'EMPTY': ''})));
  c.eq('dotenv expand 3 S={A}\nT=\"{A}\"\nU=\"\\{A}\"\...', 'S\u{241F}\${A}\u{241E}T\u{241F}v\u{241E}U\u{241F}\${A}',
      _kv(parseDotenv('S=\'\${A}\'\nT="\${A}"\nU="\\\${A}"\n', expand: true, vars: {'A': 'v'})));
  c.throws<FormatException>(
      'dotenv invalid 0 NOEQUALS\n', () => parseDotenv('NOEQUALS\n'), (e) => e.message.startsWith('line '));
  c.throws<FormatException>(
      'dotenv invalid 1 1BAD=x\n', () => parseDotenv('1BAD=x\n'), (e) => e.message.startsWith('line '));
  c.throws<FormatException>('dotenv invalid 2 A=unterminated\n', () => parseDotenv('A=\'unterminated\n'),
      (e) => e.message.startsWith('line '));
  c.throws<FormatException>('dotenv invalid 3 A=\"never closed\nB=1\n', () => parseDotenv('A="never closed\nB=1\n'),
      (e) => e.message.startsWith('line '));
  c.throws<FormatException>(
      'dotenv invalid 4 A=\"x\" junk\n', () => parseDotenv('A="x" junk\n'), (e) => e.message.startsWith('line '));
  c.throws<FormatException>(
      'dotenv invalid 5 -K=v\n', () => parseDotenv('-K=v\n'), (e) => e.message.startsWith('line '));
}

void runQueryStringTests(Checks c) {
  c.eq('query parse 0 a=1&b=2', 'a\u{241F}1\u{241E}b\u{241F}2', _pairs(parseQuery('a=1&b=2')));
  c.eq('query parse 1 ?a=1&a=2', 'a\u{241F}1\u{241E}a\u{241F}2', _pairs(parseQuery('?a=1&a=2')));
  c.eq('query parse 2 x=a+b%20c', 'x\u{241F}a b c', _pairs(parseQuery('x=a+b%20c')));
  c.eq('query parse 3 e=%E2%82%AC', 'e\u{241F}\u{20AC}', _pairs(parseQuery('e=%E2%82%AC')));
  c.eq('query parse 4 bad=%zz&ok=1', 'bad\u{241F}%zz\u{241E}ok\u{241F}1', _pairs(parseQuery('bad=%zz&ok=1')));
  c.eq('query parse 5 %', '%\u{241F}', _pairs(parseQuery('%')));
  c.eq('query parse 6 &&a&&', 'a\u{241F}', _pairs(parseQuery('&&a&&')));
  c.eq('query parse 7 k=v=w', 'k\u{241F}v=w', _pairs(parseQuery('k=v=w')));
  c.eq('query parse 8 =v', '\u{241F}v', _pairs(parseQuery('=v')));
  c.eq('query parse 9 emoji=%F0%9F%98%80', 'emoji\u{241F}\u{1F600}', _pairs(parseQuery('emoji=%F0%9F%98%80')));
  c.eq('query parse 10 invalid=%FF', 'invalid\u{241F}\u{FFFD}', _pairs(parseQuery('invalid=%FF')));
  c.eq('query parse 11 plus=%2B', 'plus\u{241F}+', _pairs(parseQuery('plus=%2B')));
  c.eq('query stringify 0', 'a=1&b=x+y', stringifyQuery([('a', '1'), ('b', 'x y')]));
  c.eq('query stringify 1', 'q=a%26b%3Dc&e=%E2%82%AC', stringifyQuery([('q', 'a&b=c'), ('e', '\u{20AC}')]));
  c.eq('query stringify 2', '*-._=%7E%21%27%28%29', stringifyQuery([('*-._', '~!\'()')]));
  c.eq('query stringify 3', 'k=&=v', stringifyQuery([('k', ''), ('', 'v')]));
  c.eq('query getAll 0', '1\u{241E}3', _join(getAll(parseQuery('a=1&b=2&a=3'), 'a')));
}

void runMimeTypesTests(Checks c) {
  c.eq('mime typeFor 0 index.html', 'text/html', mimeTypeFor('index.html'));
  c.eq('mime typeFor 1 APP.JS', 'text/javascript', mimeTypeFor('APP.JS'));
  c.eq('mime typeFor 2 data.json', 'application/json', mimeTypeFor('data.json'));
  c.eq('mime typeFor 3 photo.JPG', 'image/jpeg', mimeTypeFor('photo.JPG'));
  c.eq('mime typeFor 4 x.tar.gz', 'application/gzip', mimeTypeFor('x.tar.gz'));
  c.eq('mime typeFor 5 video.webm', 'video/webm', mimeTypeFor('video.webm'));
  c.eq('mime typeFor 6 font.woff2', 'font/woff2', mimeTypeFor('font.woff2'));
  c.eq('mime typeFor 7 doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      mimeTypeFor('doc.docx'));
  c.eq('mime typeFor 8 noext', null, mimeTypeFor('noext'));
  c.eq('mime typeFor 9 json', 'application/json', mimeTypeFor('json'));
  c.eq('mime typeFor 10 .png', 'image/png', mimeTypeFor('.png'));
  c.eq('mime typeFor 11 a.unknown', null, mimeTypeFor('a.unknown'));
  c.eq('mime typeFor 12 style.css', 'text/css', mimeTypeFor('style.css'));
  c.eq('mime typeFor 13 feed.xml', 'application/xml', mimeTypeFor('feed.xml'));
  c.eq('mime typeFor 14 pic.svg', 'image/svg+xml', mimeTypeFor('pic.svg'));
  c.eq('mime extensionFor 0 image/jpeg', 'jpg', extensionFor('image/jpeg'));
  c.eq('mime extensionFor 1 text/html; charset=UTF-8', 'html', extensionFor('text/html; charset=UTF-8'));
  c.eq('mime extensionFor 2 Application/JSON', 'json', extensionFor('Application/JSON'));
  c.eq('mime extensionFor 3 text/javascript', 'js', extensionFor('text/javascript'));
  c.eq('mime extensionFor 4 application/x-unknown', null, extensionFor('application/x-unknown'));
  c.eq('mime extensionFor 5 video/mp4', 'mp4', extensionFor('video/mp4'));
  c.eq('mime contentType 0 a.html', 'text/html; charset=utf-8', contentTypeFor('a.html'));
  c.eq('mime contentType 1 a.json', 'application/json; charset=utf-8', contentTypeFor('a.json'));
  c.eq('mime contentType 2 a.png', 'image/png', contentTypeFor('a.png'));
  c.eq('mime contentType 3 a.svg', 'image/svg+xml; charset=utf-8', contentTypeFor('a.svg'));
  c.eq('mime contentType 4 a.bin', 'application/octet-stream', contentTypeFor('a.bin'));
  c.eq('mime contentType 5 a.zzz', 'application/octet-stream', contentTypeFor('a.zzz'));
  c.eq('mime contentType 6 readme.md', 'text/markdown; charset=utf-8', contentTypeFor('readme.md'));
}

void runDataUriTests(Checks c) {
  {
    final r = parseDataUri('data:,Hello%2C%20World!');
    c.eq('data uri parse 0 mime', 'text/plain', r.mime);
    c.eq('data uri parse 0 params', 'charset\u{241F}US-ASCII', _kv(r.params));
    c.eq('data uri parse 0 base64', false, r.base64);
    c.eq('data uri parse 0 data', '48656c6c6f2c20576f726c6421', _hexOf(r.data));
  }
  {
    final r = parseDataUri('data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==');
    c.eq('data uri parse 1 mime', 'text/plain', r.mime);
    c.eq('data uri parse 1 params', '', _kv(r.params));
    c.eq('data uri parse 1 base64', true, r.base64);
    c.eq('data uri parse 1 data', '48656c6c6f2c20576f726c6421', _hexOf(r.data));
  }
  {
    final r = parseDataUri('data:text/html;charset=utf-8,%3Ch1%3EHi%3C%2Fh1%3E');
    c.eq('data uri parse 2 mime', 'text/html', r.mime);
    c.eq('data uri parse 2 params', 'charset\u{241F}utf-8', _kv(r.params));
    c.eq('data uri parse 2 base64', false, r.base64);
    c.eq('data uri parse 2 data', '3c68313e48693c2f68313e', _hexOf(r.data));
  }
  {
    final r = parseDataUri('DATA:image/png;BASE64,iVBORw0KGgo=');
    c.eq('data uri parse 3 mime', 'image/png', r.mime);
    c.eq('data uri parse 3 params', '', _kv(r.params));
    c.eq('data uri parse 3 base64', true, r.base64);
    c.eq('data uri parse 3 data', '89504e470d0a1a0a', _hexOf(r.data));
  }
  {
    final r = parseDataUri('data:;base64,SGk');
    c.eq('data uri parse 4 mime', 'text/plain', r.mime);
    c.eq('data uri parse 4 params', 'charset\u{241F}US-ASCII', _kv(r.params));
    c.eq('data uri parse 4 base64', true, r.base64);
    c.eq('data uri parse 4 data', '4869', _hexOf(r.data));
  }
  {
    final r = parseDataUri('data:text/plain;charset=utf-8;foo=bar,x');
    c.eq('data uri parse 5 mime', 'text/plain', r.mime);
    c.eq('data uri parse 5 params', 'charset\u{241F}utf-8\u{241E}foo\u{241F}bar', _kv(r.params));
    c.eq('data uri parse 5 base64', false, r.base64);
    c.eq('data uri parse 5 data', '78', _hexOf(r.data));
  }
  {
    final r = parseDataUri('data:application/json,%7B%22a%22%3A1%7D');
    c.eq('data uri parse 6 mime', 'application/json', r.mime);
    c.eq('data uri parse 6 params', '', _kv(r.params));
    c.eq('data uri parse 6 base64', false, r.base64);
    c.eq('data uri parse 6 data', '7b2261223a317d', _hexOf(r.data));
  }
  {
    final r = parseDataUri('data:bogus,x');
    c.eq('data uri parse 7 mime', 'text/plain', r.mime);
    c.eq('data uri parse 7 params', 'charset\u{241F}US-ASCII', _kv(r.params));
    c.eq('data uri parse 7 base64', false, r.base64);
    c.eq('data uri parse 7 data', '78', _hexOf(r.data));
  }
  {
    final r = parseDataUri('data:text/plain;base64,SG Vs\nbG8=');
    c.eq('data uri parse 8 mime', 'text/plain', r.mime);
    c.eq('data uri parse 8 params', '', _kv(r.params));
    c.eq('data uri parse 8 base64', true, r.base64);
    c.eq('data uri parse 8 data', '48656c6c6f', _hexOf(r.data));
  }
  {
    final r = parseDataUri('data:;charset=utf-8,%E2%82%AC');
    c.eq('data uri parse 9 mime', 'text/plain', r.mime);
    c.eq('data uri parse 9 params', 'charset\u{241F}utf-8', _kv(r.params));
    c.eq('data uri parse 9 base64', false, r.base64);
    c.eq('data uri parse 9 data', 'e282ac', _hexOf(r.data));
  }
  {
    final r = parseDataUri('data:,a%zzb');
    c.eq('data uri parse 10 mime', 'text/plain', r.mime);
    c.eq('data uri parse 10 params', 'charset\u{241F}US-ASCII', _kv(r.params));
    c.eq('data uri parse 10 base64', false, r.base64);
    c.eq('data uri parse 10 data', '61257a7a62', _hexOf(r.data));
  }
  c.eq('data uri build 0', 'data:text/plain,Hello,%20World!',
      buildDataUri(_hex('48656c6c6f2c20576f726c6421'), mime: 'text/plain', useBase64: null));
  c.eq('data uri build 1', 'data:image/png;base64,iVBORw0K',
      buildDataUri(_hex('89504e470d0a'), mime: 'image/png', useBase64: null));
  c.eq('data uri build 2', 'data:application/json,%7B%22a%22:1%7D',
      buildDataUri(_hex('7b2261223a317d'), mime: 'application/json', useBase64: null));
  c.eq('data uri build 3', 'data:text/plain;charset=utf-8,%E2%82%AC%20&%20%C3%BC',
      buildDataUri(_hex('e282ac202620c3bc'), mime: 'text/plain;charset=utf-8', useBase64: null));
  c.eq('data uri build 4', 'data:text/plain;base64,//4=',
      buildDataUri(_hex('fffe'), mime: 'text/plain', useBase64: null));
  c.eq('data uri build 5', 'data:text/plain;base64,YWJj',
      buildDataUri(_hex('616263'), mime: 'text/plain', useBase64: true));
  c.eq('data uri build 6', 'data:application/octet-stream;base64,',
      buildDataUri(_hex(''), mime: 'application/octet-stream', useBase64: null));
  c.eq('data uri build 7', 'data:text/plain,a%20b/c?d',
      buildDataUri(_hex('6120622f633f64'), mime: 'text/plain', useBase64: false));
  c.throws<FormatException>('data uri invalid parse 0 text/plain,x', () => parseDataUri('text/plain,x'));
  c.throws<FormatException>('data uri invalid parse 1 data:text/plain', () => parseDataUri('data:text/plain'));
  c.throws<FormatException>('data uri invalid parse 2 data:;base64,a', () => parseDataUri('data:;base64,a'));
  c.throws<FormatException>('data uri invalid parse 3 data:;base64,@@@@', () => parseDataUri('data:;base64,@@@@'));
  c.throws<FormatException>(
      'data uri invalid parse 4 data:;base64,SGVsbG8=x', () => parseDataUri('data:;base64,SGVsbG8=x'));
  c.throws<FormatException>('data uri invalid build 0', () => buildDataUri(_hex('00'), mime: 'not a type'));
  c.throws<FormatException>('data uri invalid build 1', () => buildDataUri(_hex('00'), mime: 'text/plain; charset'));
}

void runIsoWeekTests(Checks c) {
  c.eq('iso week 0 2021-1-3', (2020, 53, 7), isoWeek(2021, 1, 3));
  c.eq('iso week format 0', '2020-W53-7', formatIsoWeek(2021, 1, 3));
  c.eq('iso week roundtrip 0', (2021, 1, 3), fromIsoWeek(2020, 53, 7));
  c.eq('iso week 1 2021-1-4', (2021, 1, 1), isoWeek(2021, 1, 4));
  c.eq('iso week format 1', '2021-W01-1', formatIsoWeek(2021, 1, 4));
  c.eq('iso week roundtrip 1', (2021, 1, 4), fromIsoWeek(2021, 1, 1));
  c.eq('iso week 2 2020-12-31', (2020, 53, 4), isoWeek(2020, 12, 31));
  c.eq('iso week format 2', '2020-W53-4', formatIsoWeek(2020, 12, 31));
  c.eq('iso week roundtrip 2', (2020, 12, 31), fromIsoWeek(2020, 53, 4));
  c.eq('iso week 3 2026-10-11', (2026, 41, 7), isoWeek(2026, 10, 11));
  c.eq('iso week format 3', '2026-W41-7', formatIsoWeek(2026, 10, 11));
  c.eq('iso week roundtrip 3', (2026, 10, 11), fromIsoWeek(2026, 41, 7));
  c.eq('iso week 4 2008-12-29', (2009, 1, 1), isoWeek(2008, 12, 29));
  c.eq('iso week format 4', '2009-W01-1', formatIsoWeek(2008, 12, 29));
  c.eq('iso week roundtrip 4', (2008, 12, 29), fromIsoWeek(2009, 1, 1));
  c.eq('iso week 5 2010-1-3', (2009, 53, 7), isoWeek(2010, 1, 3));
  c.eq('iso week format 5', '2009-W53-7', formatIsoWeek(2010, 1, 3));
  c.eq('iso week roundtrip 5', (2010, 1, 3), fromIsoWeek(2009, 53, 7));
  c.eq('iso week 6 2015-12-31', (2015, 53, 4), isoWeek(2015, 12, 31));
  c.eq('iso week format 6', '2015-W53-4', formatIsoWeek(2015, 12, 31));
  c.eq('iso week roundtrip 6', (2015, 12, 31), fromIsoWeek(2015, 53, 4));
  c.eq('iso week 7 2016-1-1', (2015, 53, 5), isoWeek(2016, 1, 1));
  c.eq('iso week format 7', '2015-W53-5', formatIsoWeek(2016, 1, 1));
  c.eq('iso week roundtrip 7', (2016, 1, 1), fromIsoWeek(2015, 53, 5));
  c.eq('iso week 8 2024-12-30', (2025, 1, 1), isoWeek(2024, 12, 30));
  c.eq('iso week format 8', '2025-W01-1', formatIsoWeek(2024, 12, 30));
  c.eq('iso week roundtrip 8', (2024, 12, 30), fromIsoWeek(2025, 1, 1));
  c.eq('iso week 9 1-1-1', (1, 1, 1), isoWeek(1, 1, 1));
  c.eq('iso week format 9', '0001-W01-1', formatIsoWeek(1, 1, 1));
  c.eq('iso week roundtrip 9', (1, 1, 1), fromIsoWeek(1, 1, 1));
  c.eq('iso week 10 9999-12-31', (9999, 52, 5), isoWeek(9999, 12, 31));
  c.eq('iso week format 10', '9999-W52-5', formatIsoWeek(9999, 12, 31));
  c.eq('iso week roundtrip 10', (9999, 12, 31), fromIsoWeek(9999, 52, 5));
  c.eq('iso weeksInYear 2015', 53, weeksInYear(2015));
  c.eq('iso weeksInYear 2016', 52, weeksInYear(2016));
  c.eq('iso weeksInYear 2020', 53, weeksInYear(2020));
  c.eq('iso weeksInYear 2021', 52, weeksInYear(2021));
  c.eq('iso weeksInYear 2026', 53, weeksInYear(2026));
  c.eq('iso weeksInYear 2032', 53, weeksInYear(2032));
  c.eq('iso weeksInYear 2037', 53, weeksInYear(2037));
  c.eq('iso fromIsoWeek 0', (2021, 1, 1), fromIsoWeek(2020, 53, 5));
  c.eq('iso fromIsoWeek 1', (2025, 12, 29), fromIsoWeek(2026, 1, 1));
  c.eq('iso fromIsoWeek 2', (2008, 12, 29), fromIsoWeek(2009, 1, 1));
  c.eq('iso parse 0 2026-W41-7', (2026, 10, 11), parseIsoWeek('2026-W41-7'));
  c.eq('iso parse 1 2026W417', (2026, 10, 11), parseIsoWeek('2026W417'));
  c.eq('iso parse 2 2026-W41', (2026, 10, 5), parseIsoWeek('2026-W41'));
  c.eq('iso parse 3 2020-W53-5', (2021, 1, 1), parseIsoWeek('2020-W53-5'));
  c.throws<FormatException>('iso invalid 0 2021-W53-1', () => parseIsoWeek('2021-W53-1'));
  c.throws<FormatException>('iso invalid 1 2026-W00-1', () => parseIsoWeek('2026-W00-1'));
  c.throws<FormatException>('iso invalid 2 2026-W10-8', () => parseIsoWeek('2026-W10-8'));
  c.throws<FormatException>('iso invalid 3 26-W10-1', () => parseIsoWeek('26-W10-1'));
  c.throws<FormatException>('iso invalid 4 2026-w10-1', () => parseIsoWeek('2026-w10-1'));
  c.throws<FormatException>('iso invalid 5 2026-W1-1', () => parseIsoWeek('2026-W1-1'));
  c.throws<FormatException>('iso invalid date 2021-02-29', () => isoWeek(2021, 2, 29));
}

void runTopoSortTests(Checks c) {
  c.eq('topo sort 0', 'b\u{241E}c\u{241E}a\u{241E}d', _join(topoSort(['a', 'b', 'c', 'd'], [('c', 'a'), ('a', 'd')])));
  c.eq('topo sort 1', 'x', _join(topoSort(['x'], [])));
  c.eq('topo sort 2', 'a\u{241E}b\u{241E}c', _join(topoSort(['a', 'b', 'c'], [])));
  c.eq(
      'topo sort 3',
      'shirt\u{241E}tie\u{241E}trousers\u{241E}belt\u{241E}jacket\u{241E}socks\u{241E}shoes\u{241E}watch',
      _join(topoSort([
        'shirt',
        'tie',
        'jacket',
        'belt',
        'trousers',
        'shoes',
        'socks',
        'watch'
      ], [
        ('shirt', 'tie'),
        ('tie', 'jacket'),
        ('shirt', 'belt'),
        ('belt', 'jacket'),
        ('trousers', 'belt'),
        ('trousers', 'shoes'),
        ('socks', 'shoes')
      ])));
  c.eq('topo sort 4', 'a\u{241E}b', _join(topoSort(['a', 'b'], [('a', 'b'), ('a', 'b')])));
  c.eq('topo levels 0', 'b,c|a|d', _levels(topoLevels(['a', 'b', 'c', 'd'], [('c', 'a'), ('a', 'd')])));
  c.eq('topo levels 1', 'x', _levels(topoLevels(['x'], [])));
  c.eq('topo levels 2', 'a,b,c', _levels(topoLevels(['a', 'b', 'c'], [])));
  c.eq(
      'topo levels 3',
      'shirt,trousers,socks,watch|tie,belt,shoes|jacket',
      _levels(topoLevels([
        'shirt',
        'tie',
        'jacket',
        'belt',
        'trousers',
        'shoes',
        'socks',
        'watch'
      ], [
        ('shirt', 'tie'),
        ('tie', 'jacket'),
        ('shirt', 'belt'),
        ('belt', 'jacket'),
        ('trousers', 'belt'),
        ('trousers', 'shoes'),
        ('socks', 'shoes')
      ])));
  c.eq('topo levels 4', 'a|b', _levels(topoLevels(['a', 'b'], [('a', 'b'), ('a', 'b')])));
  c.throws<CycleException>('topo cycle sort 0', () => topoSort(['a', 'b', 'c'], [('a', 'b'), ('b', 'c'), ('c', 'b')]),
      (e) => e.message == 'cycle: b -> c -> b');
  c.throws<CycleException>(
      'topo cycle levels 0',
      () => topoLevels(['a', 'b', 'c'], [('a', 'b'), ('b', 'c'), ('c', 'b')]),
      (e) => e.message == 'cycle: b -> c -> b');
  c.throws<CycleException>(
      'topo cycle sort 1', () => topoSort(['a'], [('a', 'a')]), (e) => e.message == 'cycle: a -> a');
  c.throws<CycleException>(
      'topo cycle levels 1', () => topoLevels(['a'], [('a', 'a')]), (e) => e.message == 'cycle: a -> a');
  c.throws<CycleException>(
      'topo cycle sort 2',
      () => topoSort(['p', 'q', 'r', 's'], [('p', 'q'), ('q', 'r'), ('r', 'p'), ('r', 's')]),
      (e) => e.message == 'cycle: p -> q -> r -> p');
  c.throws<CycleException>(
      'topo cycle levels 2',
      () => topoLevels(['p', 'q', 'r', 's'], [('p', 'q'), ('q', 'r'), ('r', 'p'), ('r', 's')]),
      (e) => e.message == 'cycle: p -> q -> r -> p');
  c.throws<CycleException>('topo cycle sort 3', () => topoSort(['z', 'a', 'b'], [('a', 'z'), ('a', 'b'), ('b', 'a')]),
      (e) => e.message == 'cycle: a -> b -> a');
  c.throws<CycleException>(
      'topo cycle levels 3',
      () => topoLevels(['z', 'a', 'b'], [('a', 'z'), ('a', 'b'), ('b', 'a')]),
      (e) => e.message == 'cycle: a -> b -> a');
  c.throws<CycleException>('topo cycle sort 4', () => topoSort(['z', 'a', 'b'], [('a', 'b'), ('b', 'a'), ('a', 'z')]),
      (e) => e.message == 'cycle: a -> b -> a');
  c.throws<CycleException>(
      'topo cycle levels 4',
      () => topoLevels(['z', 'a', 'b'], [('a', 'b'), ('b', 'a'), ('a', 'z')]),
      (e) => e.message == 'cycle: a -> b -> a');
  c.throws<CycleException>(
      'topo cycle sort 5',
      () => topoSort(['s', 'x', 'y', 'd'], [('x', 'd'), ('x', 'y'), ('y', 'x'), ('d', 's')]),
      (e) => e.message == 'cycle: x -> y -> x');
  c.throws<CycleException>(
      'topo cycle levels 5',
      () => topoLevels(['s', 'x', 'y', 'd'], [('x', 'd'), ('x', 'y'), ('y', 'x'), ('d', 's')]),
      (e) => e.message == 'cycle: x -> y -> x');
  c.throws<ArgumentError>('topo invalid sort 0', () => topoSort(['a'], [('a', 'b')]));
  c.throws<ArgumentError>('topo invalid levels 0', () => topoLevels(['a'], [('a', 'b')]));
  c.throws<ArgumentError>('topo invalid sort 1', () => topoSort(['a', 'a'], []));
  c.throws<ArgumentError>('topo invalid levels 1', () => topoLevels(['a', 'a'], []));
}

void runLinkHeaderTests(Checks c) {
  c.eq(
      'link parse 0 <https://api.test/items?page=2...',
      'https://api.test/items?page=2\u{241D}rel\u{241F}next\u{241C}https://api.test/items?page=9\u{241D}rel\u{241F}last',
      _links(
          parseLinkHeader('<https://api.test/items?page=2>; rel="next", <https://api.test/items?page=9>; rel="last"')));
  c.eq(
      'link parse 1 <https://x/?a=1,2>; rel=next; ...',
      'https://x/?a=1,2\u{241D}rel\u{241F}next\u{241E}title\u{241F}a, "b"; c',
      _links(parseLinkHeader('<https://x/?a=1,2>; rel=next; title="a, \\"b\\"; c"')));
  c.eq(
      'link parse 2 </TheBook/chapter2>; rel=\"pre...',
      '/TheBook/chapter2\u{241D}rel\u{241F}previous\u{241E}title\u{241F}letztes Kapitel\u{241C}/TheBook/chapter4\u{241D}rel\u{241F}next\u{241E}title\u{241F}n\u{E4}chstes Kapitel',
      _links(parseLinkHeader(
          '</TheBook/chapter2>; rel="previous"; title*=UTF-8\'de\'letztes%20Kapitel, </TheBook/chapter4>; rel="next"; title*=UTF-8\'de\'n%c3%a4chstes%20Kapitel')));
  c.eq(
      'link parse 3 <http://example.org/>; REL=\"S...',
      'http://example.org/\u{241D}rel\u{241F}start index\u{241E}anchor\u{241F}#x\u{241E}hreflang\u{241F}en',
      _links(parseLinkHeader('<http://example.org/>; REL="Start Index"; anchor="#x"; rel=ignored; hreflang=en')));
  c.eq('link parse 4 <a>;rel=x;crossorigin', 'a\u{241D}rel\u{241F}x\u{241E}crossorigin\u{241F}',
      _links(parseLinkHeader('<a>;rel=x;crossorigin')));
  c.eq('link parse 5 ', '', _links(parseLinkHeader('')));
  c.eq('link parse 6   ,  <a>; rel=x ,', 'a\u{241D}rel\u{241F}x', _links(parseLinkHeader('  ,  <a>; rel=x ,')));
  c.eq(
      'link rel 0 LAST',
      'https://api.test/items?page=9',
      findRel(
              parseLinkHeader(
                  '<https://api.test/items?page=2>; rel="next", <https://api.test/items?page=9>; rel="last"'),
              'LAST')
          ?.uri);
  c.eq(
      'link rel 1 prev',
      null,
      findRel(
              parseLinkHeader(
                  '<https://api.test/items?page=2>; rel="next", <https://api.test/items?page=9>; rel="last"'),
              'prev')
          ?.uri);
  c.eq(
      'link format 0',
      '</a>; rel="next"',
      formatLinkHeader([
        Link('/a', {'rel': 'next'})
      ]));
  c.eq(
      'link format 1',
      '</b>; rel="prev"; title="Page \\"1\\""; type="text/html", </c>; rel="next"; title*=UTF-8\'\'%E2%82%AC%20x',
      formatLinkHeader([
        Link('/b', {'rel': 'prev', 'title': 'Page "1"', 'type': 'text/html'}),
        Link('/c', {'rel': 'next', 'title': '\u{20AC} x'})
      ]));
  c.throws<FormatException>('link invalid 0 https://x; rel=next', () => parseLinkHeader('https://x; rel=next'));
  c.throws<FormatException>('link invalid 1 <https://x', () => parseLinkHeader('<https://x'));
  c.throws<FormatException>('link invalid 2 <a>; title=\"x', () => parseLinkHeader('<a>; title="x'));
  c.throws<FormatException>('link invalid 3 <a> rel=x', () => parseLinkHeader('<a> rel=x'));
  c.throws<FormatException>('link invalid 4 <a>; title*=UTF-8%zz', () => parseLinkHeader('<a>; title*=UTF-8\'\'%zz'));
  c.throws<FormatException>('link invalid 5 <a>; title*=KOI8-Rx', () => parseLinkHeader('<a>; title*=KOI8-R\'\'x'));
}

void runContentDispositionTests(Checks c) {
  c.eq('disposition build 0 report.pdf', 'attachment; filename="report.pdf"',
      buildContentDisposition('report.pdf', inline: false));
  c.eq('disposition build 1 caf\u00e9.pdf', 'attachment; filename="caf_.pdf"; filename*=UTF-8\'\'caf%C3%A9.pdf',
      buildContentDisposition('caf\u{E9}.pdf', inline: false));
  c.eq('disposition build 2 ../etc/passwd', 'attachment; filename="_etc_passwd"',
      buildContentDisposition('../etc/passwd', inline: false));
  c.eq('disposition build 3 a\"b\\c.txt', 'attachment; filename="a_b_c.txt"',
      buildContentDisposition('a"b\\c.txt', inline: false));
  c.eq('disposition build 4   .hidden  ', 'attachment; filename="hidden"',
      buildContentDisposition('  .hidden  ', inline: false));
  c.eq('disposition build 5 ', 'attachment; filename="download"', buildContentDisposition('', inline: false));
  c.eq(
      'disposition build 6 \u65e5\u672c\u8a9e.txt',
      'inline; filename="___.txt"; filename*=UTF-8\'\'%E6%97%A5%E6%9C%AC%E8%AA%9E.txt',
      buildContentDisposition('\u{65E5}\u{672C}\u{8A9E}.txt', inline: true));
  c.eq('disposition build 7 tab\there.csv', 'attachment; filename="tab_here.csv"',
      buildContentDisposition('tab\there.csv', inline: false));
  c.eq('disposition build 8 100% sure+ok.txt', 'attachment; filename="100% sure+ok.txt"',
      buildContentDisposition('100% sure+ok.txt', inline: false));
  {
    final r = parseContentDisposition('attachment; filename="x.txt"');
    c.eq('disposition parse 0 type', 'attachment', r.type);
    c.eq('disposition parse 0 filename', 'x.txt', r.filename);
    c.eq('disposition parse 0 params', 'filename\u{241F}x.txt', _kv(r.params));
  }
  {
    final r = parseContentDisposition('attachment; filename=x.txt');
    c.eq('disposition parse 1 type', 'attachment', r.type);
    c.eq('disposition parse 1 filename', 'x.txt', r.filename);
    c.eq('disposition parse 1 params', 'filename\u{241F}x.txt', _kv(r.params));
  }
  {
    final r = parseContentDisposition('INLINE');
    c.eq('disposition parse 2 type', 'inline', r.type);
    c.eq('disposition parse 2 filename', null, r.filename);
    c.eq('disposition parse 2 params', '', _kv(r.params));
  }
  {
    final r = parseContentDisposition('attachment; filename="a.txt"; filename*=UTF-8\'\'%E2%82%AC%20rates.txt');
    c.eq('disposition parse 3 type', 'attachment', r.type);
    c.eq('disposition parse 3 filename', '\u{20AC} rates.txt', r.filename);
    c.eq('disposition parse 3 params', 'filename\u{241F}\u{20AC} rates.txt', _kv(r.params));
  }
  {
    final r = parseContentDisposition('attachment; filename*=iso-8859-1\'en\'%A3%20rates.txt');
    c.eq('disposition parse 4 type', 'attachment', r.type);
    c.eq('disposition parse 4 filename', '\u{A3} rates.txt', r.filename);
    c.eq('disposition parse 4 params', 'filename\u{241F}\u{A3} rates.txt', _kv(r.params));
  }
  {
    final r = parseContentDisposition('attachment; filename="..\\\\..\\\\evil.exe"');
    c.eq('disposition parse 5 type', 'attachment', r.type);
    c.eq('disposition parse 5 filename', '_.._evil.exe', r.filename);
    c.eq('disposition parse 5 params', 'filename\u{241F}..\\..\\evil.exe', _kv(r.params));
  }
  {
    final r = parseContentDisposition('attachment; filename="\\"quoted\\".txt"; size=100');
    c.eq('disposition parse 6 type', 'attachment', r.type);
    c.eq('disposition parse 6 filename', '_quoted_.txt', r.filename);
    c.eq('disposition parse 6 params', 'filename\u{241F}"quoted".txt\u{241E}size\u{241F}100', _kv(r.params));
  }
  {
    final r = parseContentDisposition('form-data; name="file"; filename="photo.jpg"');
    c.eq('disposition parse 7 type', 'form-data', r.type);
    c.eq('disposition parse 7 filename', 'photo.jpg', r.filename);
    c.eq('disposition parse 7 params', 'name\u{241F}file\u{241E}filename\u{241F}photo.jpg', _kv(r.params));
  }
  c.throws<FormatException>('disposition invalid 0 ; filename=x', () => parseContentDisposition('; filename=x'));
  c.throws<FormatException>(
      'disposition invalid 1 attachment; filename=\"open', () => parseContentDisposition('attachment; filename="open'));
  c.throws<FormatException>('disposition invalid 2 attachment; filename*=UTF-8%G0',
      () => parseContentDisposition('attachment; filename*=UTF-8\'\'%G0'));
  c.throws<FormatException>(
      'disposition invalid 3 attachment filename=x', () => parseContentDisposition('attachment filename=x'));
  c.eq('disposition sanitize', '_.._x', sanitizeFilename('../../x'));
}

void runCacheControlTests(Checks c) {
  c.eq('cache-control parse 0 public, max-age=600', 'public\u{241F}T\u{241E}max-age\u{241F}I:600',
      _cc(parseCacheControl('public, max-age=600')));
  c.eq('cache-control parse 1 no-store', 'no-store\u{241F}T', _cc(parseCacheControl('no-store')));
  c.eq(
      'cache-control parse 2 private=\"set-cookie, x-y\", m...',
      'private\u{241F}S:set-cookie, x-y\u{241E}max-age\u{241F}I:0',
      _cc(parseCacheControl('private="set-cookie, x-y", max-age=0')));
  c.eq(
      'cache-control parse 3 max-age=\"120\", s-maxage=60, ...',
      'max-age\u{241F}I:120\u{241E}s-maxage\u{241F}I:60\u{241E}must-revalidate\u{241F}T',
      _cc(parseCacheControl('max-age="120", s-maxage=60, must-revalidate')));
  c.eq('cache-control parse 4 max-age=abc, max-age=30', 'max-age\u{241F}I:30',
      _cc(parseCacheControl('max-age=abc, max-age=30')));
  c.eq('cache-control parse 5 MAX-AGE=5, Max-Age=9', 'max-age\u{241F}I:5',
      _cc(parseCacheControl('MAX-AGE=5, Max-Age=9')));
  c.eq('cache-control parse 6 max-stale', 'max-stale\u{241F}T', _cc(parseCacheControl('max-stale')));
  c.eq('cache-control parse 7 max-stale=120, min-fresh=10', 'max-stale\u{241F}I:120\u{241E}min-fresh\u{241F}I:10',
      _cc(parseCacheControl('max-stale=120, min-fresh=10')));
  c.eq(
      'cache-control parse 8 stale-while-revalidate=30, imm...',
      'stale-while-revalidate\u{241F}I:30\u{241E}immutable\u{241F}T',
      _cc(parseCacheControl('stale-while-revalidate=30, immutable')));
  c.eq('cache-control parse 9 ,, public ,,', 'public\u{241F}T', _cc(parseCacheControl(',, public ,,')));
  c.eq('cache-control parse 10 no-cache=\"Set-Cookie\"', 'no-cache\u{241F}S:Set-Cookie',
      _cc(parseCacheControl('no-cache="Set-Cookie"')));
  c.eq('cache-control parse 11 foo=bar, baz=\"q\\\"t\"', 'foo\u{241F}S:bar\u{241E}baz\u{241F}S:q"t',
      _cc(parseCacheControl('foo=bar, baz="q\\"t"')));
  c.eq('cache-control format 0', 'public, max-age=600',
      formatCacheControl(<String, Object>{'public': true, 'max-age': 600}));
  c.eq('cache-control format 1', 'private="set-cookie, x", no-cache',
      formatCacheControl(<String, Object>{'private': 'set-cookie, x', 'no-cache': true}));
  c.eq('cache-control format 2', 's-maxage=0, stale-if-error=86400',
      formatCacheControl(<String, Object>{'s-maxage': 0, 'stale-if-error': 86400}));
  c.eq('cache-control freshness 0 max-age=600', 600, cacheFreshness(parseCacheControl('max-age=600'), shared: false));
  c.eq('cache-control freshness 1 max-age=600, s-maxage=60', 60,
      cacheFreshness(parseCacheControl('max-age=600, s-maxage=60'), shared: true));
  c.eq('cache-control freshness 2 max-age=600, s-maxage=60', 600,
      cacheFreshness(parseCacheControl('max-age=600, s-maxage=60'), shared: false));
  c.eq('cache-control freshness 3 no-store, max-age=600', 0,
      cacheFreshness(parseCacheControl('no-store, max-age=600'), shared: false));
  c.eq('cache-control freshness 4 no-cache', 0, cacheFreshness(parseCacheControl('no-cache'), shared: true));
  c.eq('cache-control freshness 5 public', null, cacheFreshness(parseCacheControl('public'), shared: false));
  c.throws<FormatException>('cache-control invalid 0', () => parseCacheControl('private="unterminated'));
}
