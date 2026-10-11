// SPDX-License-Identifier: Apache-2.0
// Wave 11 capability checks: punycode, base58, Roman numerals, dotted paths, template rendering, INI,
// PII masking, password generation and HTML escaping. Every vector is generated from the shared wave 11 reference
// vectors (caps12 vectors.json) by a script; keep them identical across languages.
import 'dart:convert';

import 'package:genlib_validation_example/base58.dart';
import 'package:genlib_validation_example/dotted_path.dart';
import 'package:genlib_validation_example/html_escape.dart';
import 'package:genlib_validation_example/ini_parse.dart';
import 'package:genlib_validation_example/password_generate.dart';
import 'package:genlib_validation_example/pii_mask.dart';
import 'package:genlib_validation_example/punycode.dart';
import 'package:genlib_validation_example/roman_numerals.dart';
import 'package:genlib_validation_example/template_render.dart';

import 'src/checks.dart';

String _hexOf(List<int> b) => b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
List<int> _hex(String h) => [for (var i = 0; i < h.length; i += 2) int.parse(h.substring(i, i + 2), radix: 16)];

/// Deterministic test byte source: cycles through the given bytes (passgen_ref.byte_source).
int Function() _src(String hex) {
  final b = _hex(hex);
  var i = 0;
  return () => b[i++ % b.length];
}

Map<String, Map<String, String>> _iniDoc(Object? json) => {
      for (final e in (json as Map<String, dynamic>).entries) e.key: Map<String, String>.from(e.value as Map),
    };

void runPunycodeTests(Checks c) {
  c.eq('punycode encode 0', 'bcher-kva', punycodeEncode('bücher'));
  c.eq('punycode encode 1', 'mnchen-3ya', punycodeEncode('münchen'));
  c.eq('punycode encode 2', 'wgv71a119e', punycodeEncode('日本語'));
  c.eq('punycode encode 3', 'tda', punycodeEncode('ü'));
  c.eq('punycode encode 4', 'abc-', punycodeEncode('abc'));
  c.eq('punycode encode 5', 'Maana-pta', punycodeEncode('Mañana'));
  c.eq('punycode encode 6', 'hxargifdar', punycodeEncode('ελληνικά'));
  c.eq('punycode encode 7', '80aafi6cg', punycodeEncode('правда'));
  c.eq('punycode encode 8', 'e28h', punycodeEncode('😀'));
  c.eq('punycode encode 9', 'a-b-', punycodeEncode('a-b'));
  c.eq('punycode encode 10', '--', punycodeEncode('-'));
  c.eq('punycode encode 11', 'mgbmm8erar', punycodeEncode('الحريه'));
  c.eq('punycode encode 12', 'Hello-Another-Way--fc4qua05auwb3674vfr0b', punycodeEncode('Hello-Another-Way-それぞれの場所'));
  c.eq('punycode encode 13', 'BER-ska', punycodeEncode('ÜBER'));
  c.eq('punycode encode 14', 'x-bga22n', punycodeEncode('xé́'));
  c.eq('punycode decode 0', 'bücher', punycodeDecode('bcher-kva'));
  c.eq('punycode decode 1', 'münchen', punycodeDecode('mnchen-3ya'));
  c.eq('punycode decode 2', '日本語', punycodeDecode('wgv71a119e'));
  c.eq('punycode decode 3', 'ü', punycodeDecode('tda'));
  c.eq('punycode decode 4', 'abc', punycodeDecode('abc-'));
  c.eq('punycode decode 5', 'Mañana', punycodeDecode('Maana-pta'));
  c.eq('punycode decode 6', 'ελληνικά', punycodeDecode('hxargifdar'));
  c.eq('punycode decode 7', 'правда', punycodeDecode('80aafi6cg'));
  c.eq('punycode decode 8', '😀', punycodeDecode('e28h'));
  c.eq('punycode decode 9', 'a-b', punycodeDecode('a-b-'));
  c.eq('punycode decode 10', '-', punycodeDecode('--'));
  c.eq('punycode decode 11', 'الحريه', punycodeDecode('mgbmm8erar'));
  c.eq('punycode decode 12', 'Hello-Another-Way-それぞれの場所', punycodeDecode('Hello-Another-Way--fc4qua05auwb3674vfr0b'));
  c.eq('punycode decode 13', 'ÜBER', punycodeDecode('BER-ska'));
  c.eq('punycode decode 14', 'xé́', punycodeDecode('x-bga22n'));
  c.eq('punycode decode 15', 'bücher', punycodeDecode('bcher-kva'));
  c.eq('punycode domainToAscii 0', 'xn--bcher-kva.example', domainToAscii('Bücher.Example'));
  c.eq('punycode domainToAscii 1', 'example.com', domainToAscii('EXAMPLE.com'));
  c.eq('punycode domainToAscii 2', 'xn--wgv71a119e.jp.', domainToAscii('日本語.jp.'));
  c.eq('punycode domainToAscii 3', 'xn--mnchen-3ya.de', domainToAscii('münchen.de'));
  c.eq('punycode domainToAscii 4', 'a.b.c', domainToAscii('a.b.c'));
  c.eq('punycode domainToUnicode 0', 'bücher.example', domainToUnicode('xn--bcher-kva.example'));
  c.eq('punycode domainToUnicode 1', '日本語.jp', domainToUnicode('XN--wgv71a119e.jp'));
  c.eq('punycode domainToUnicode 2', 'plain.com', domainToUnicode('plain.com'));
  c.throws<PunycodeException>('punycode invalid decode 0', () => punycodeDecode('bcher-kv!'));
  c.throws<PunycodeException>('punycode invalid decode 1', () => punycodeDecode('a-99999999999999999999'));
  c.throws<PunycodeException>('punycode invalid decode 2', () => punycodeDecode('ü-abc'));
  c.throws<PunycodeException>('punycode invalid decode 3', () => punycodeDecode('xyzzy123456789zzzz'));
  c.throws<PunycodeException>('punycode invalid domain 0', () => domainToAscii('a..b'));
  c.throws<PunycodeException>('punycode invalid domain 1', () => domainToAscii('.x'));
  c.throws<PunycodeException>('punycode invalid domain 2',
      () => domainToAscii('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.com'));
  c.throws<PunycodeException>('punycode invalid domain 3',
      () => domainToAscii('üüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüü.com'));
}

void runBase58Tests(Checks c) {
  c.eq('base58 encode 0', '', base58Encode(_hex('')));
  c.eq('base58 decode 0', '', _hexOf(base58Decode('')));
  c.eq('base58 encode 1', '1', base58Encode(_hex('00')));
  c.eq('base58 decode 1', '00', _hexOf(base58Decode('1')));
  c.eq('base58 encode 2', '112', base58Encode(_hex('000001')));
  c.eq('base58 decode 2', '000001', _hexOf(base58Decode('112')));
  c.eq('base58 encode 3', 'StV1DL6CwTryKyV', base58Encode(_hex('68656c6c6f20776f726c64')));
  c.eq('base58 decode 3', '68656c6c6f20776f726c64', _hexOf(base58Decode('StV1DL6CwTryKyV')));
  c.eq('base58 encode 4', '1kA3B2yGe2z4', base58Encode(_hex('00010203040506070809')));
  c.eq('base58 decode 4', '00010203040506070809', _hexOf(base58Decode('1kA3B2yGe2z4')));
  c.eq('base58 encode 5', 'jpXCZedGfVQ', base58Encode(_hex('ffffffffffffffff')));
  c.eq('base58 decode 5', 'ffffffffffffffff', _hexOf(base58Decode('jpXCZedGfVQ')));
  c.eq('base58 encode 6', '11Cn8eVZg', base58Encode(_hex('000068656c6c6f')));
  c.eq('base58 decode 6', '000068656c6c6f', _hexOf(base58Decode('11Cn8eVZg')));
  c.eq('base58 check encode 0', '1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs',
      base58CheckEncode(_hex('00f54a5851e9372b87810a8e60cdd2e7cfd80b6e31')));
  c.eq('base58 check decode 0', '00f54a5851e9372b87810a8e60cdd2e7cfd80b6e31',
      _hexOf(base58CheckDecode('1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs')));
  c.eq('base58 check encode 1', '5HwoXVkHoRM8sL2KmNRS217n1g8mPPBomrY7yehCuXC1115WWsh',
      base58CheckEncode(_hex('801111111111111111111111111111111111111111111111111111111111111111')));
  c.eq('base58 check decode 1', '801111111111111111111111111111111111111111111111111111111111111111',
      _hexOf(base58CheckDecode('5HwoXVkHoRM8sL2KmNRS217n1g8mPPBomrY7yehCuXC1115WWsh')));
  c.eq('base58 check encode 2', '3QJmnh', base58CheckEncode(_hex('')));
  c.eq('base58 check decode 2', '', _hexOf(base58CheckDecode('3QJmnh')));
  c.throws<Base58Exception>('base58 invalid decode 0', () => base58Decode('0OIl'));
  c.throws<Base58Exception>('base58 invalid decode 1', () => base58Decode('abc+'));
  c.throws<Base58Exception>('base58 invalid check 0', () => base58CheckDecode('1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAt'));
  c.throws<Base58Exception>('base58 invalid check 1', () => base58CheckDecode('1'));
  c.throws<Base58Exception>('base58 invalid check 2', () => base58CheckDecode(''));
}

void runRomanNumeralsTests(Checks c) {
  c.eq('roman to 1', 'I', toRoman(1));
  c.eq('roman to 4', 'IV', toRoman(4));
  c.eq('roman to 9', 'IX', toRoman(9));
  c.eq('roman to 14', 'XIV', toRoman(14));
  c.eq('roman to 40', 'XL', toRoman(40));
  c.eq('roman to 90', 'XC', toRoman(90));
  c.eq('roman to 400', 'CD', toRoman(400));
  c.eq('roman to 1994', 'MCMXCIV', toRoman(1994));
  c.eq('roman to 2026', 'MMXXVI', toRoman(2026));
  c.eq('roman to 3888', 'MMMDCCCLXXXVIII', toRoman(3888));
  c.eq('roman to 3999', 'MMMCMXCIX', toRoman(3999));
  c.eq('roman from I', 1, fromRoman('I'));
  c.eq('roman from iv', 4, fromRoman('iv'));
  c.eq('roman from MCMXCIV', 1994, fromRoman('MCMXCIV'));
  c.eq('roman from mmxxvi', 2026, fromRoman('mmxxvi'));
  c.eq('roman from MMMCMXCIX', 3999, fromRoman('MMMCMXCIX'));
  c.throws<RomanNumeralException>('roman invalid to 0', () => toRoman(0));
  c.throws<RomanNumeralException>('roman invalid to 4000', () => toRoman(4000));
  c.throws<RomanNumeralException>('roman invalid to -5', () => toRoman(-5));
  c.throws<RomanNumeralException>('roman invalid from ', () => fromRoman(''));
  c.throws<RomanNumeralException>('roman invalid from IIII', () => fromRoman('IIII'));
  c.throws<RomanNumeralException>('roman invalid from IC', () => fromRoman('IC'));
  c.throws<RomanNumeralException>('roman invalid from VX', () => fromRoman('VX'));
  c.throws<RomanNumeralException>('roman invalid from MMMM', () => fromRoman('MMMM'));
  c.throws<RomanNumeralException>('roman invalid from ABC', () => fromRoman('ABC'));
  c.throws<RomanNumeralException>('roman invalid from IIV', () => fromRoman('IIV'));
  c.throws<RomanNumeralException>('roman invalid from XM', () => fromRoman('XM'));
}

void runDottedPathTests(Checks c) {
  final data = jsonDecode(
      '{"user":{"name":"Ada","tags":["a","b"],"addr":[{"city":"Paris"},{"city":"Rome"}],"x.y":{"z":1}},"n":0,"nil":null}');
  c.eq('dotted path parse 0', '[]', jsonEncode(parsePath('')));
  c.eq('dotted path parse 1', '["a"]', jsonEncode(parsePath('a')));
  c.eq('dotted path parse 2', '["a","b","c"]', jsonEncode(parsePath('a.b.c')));
  c.eq('dotted path parse 3', '["a",0]', jsonEncode(parsePath('a[0]')));
  c.eq('dotted path parse 4', '["a",0,1,"b"]', jsonEncode(parsePath('a[0][1].b')));
  c.eq('dotted path parse 5', '["x.y","z"]', jsonEncode(parsePath('["x.y"].z')));
  c.eq('dotted path parse 6', '["user","x.y","z"]', jsonEncode(parsePath('user["x.y"].z')));
  c.eq('dotted path parse 7', '["a","q\\"t"]', jsonEncode(parsePath('a["q\\"t"]')));
  c.eq('dotted path get 0 user.name', '"Ada"', jsonEncode(getPath(data, 'user.name', 'DEF')));
  c.eq('dotted path get 1 user.tags[1]', '"b"', jsonEncode(getPath(data, 'user.tags[1]', 'DEF')));
  c.eq('dotted path get 2 user.addr[1].city', '"Rome"', jsonEncode(getPath(data, 'user.addr[1].city', 'DEF')));
  c.eq('dotted path get 3 user["x.y"].z', '1', jsonEncode(getPath(data, 'user["x.y"].z', 'DEF')));
  c.eq('dotted path get 4 user.missing', '"DEF"', jsonEncode(getPath(data, 'user.missing', 'DEF')));
  c.eq('dotted path get 5 user.tags[5]', '"DEF"', jsonEncode(getPath(data, 'user.tags[5]', 'DEF')));
  c.eq('dotted path get 6 user.name.first', '"DEF"', jsonEncode(getPath(data, 'user.name.first', 'DEF')));
  c.eq('dotted path get 7 n', '0', jsonEncode(getPath(data, 'n', 'DEF')));
  c.eq('dotted path get 8 nil', 'null', jsonEncode(getPath(data, 'nil', 'DEF')));
  c.eq(
      'dotted path get 9 ',
      '{"user":{"name":"Ada","tags":["a","b"],"addr":[{"city":"Paris"},{"city":"Rome"}],"x.y":{"z":1}},"n":0,"nil":null}',
      jsonEncode(getPath(data, '', 'DEF')));
  c.eq('dotted path get 10 user.tags.0', '"DEF"', jsonEncode(getPath(data, 'user.tags.0', 'DEF')));
  c.eq('dotted path get default null', null, getPath(data, 'user.missing'));
  c.eq('dotted path has 0 user.name', true, hasPath(data, 'user.name'));
  c.eq('dotted path has 1 nil', true, hasPath(data, 'nil'));
  c.eq('dotted path has 2 user.nope', false, hasPath(data, 'user.nope'));
  c.eq('dotted path has 3 user.tags[2]', false, hasPath(data, 'user.tags[2]'));
  {
    final input = jsonDecode('{}');
    c.eq('dotted path set 0', '{"a":{"b":1}}', jsonEncode(setPath(input, 'a.b', jsonDecode('1'))));
    c.eq('dotted path set 0 leaves input', '{}', jsonEncode(input));
  }
  {
    final input = jsonDecode('{}');
    c.eq('dotted path set 1', '{"a":[{"b":1}]}', jsonEncode(setPath(input, 'a[0].b', jsonDecode('1'))));
    c.eq('dotted path set 1 leaves input', '{}', jsonEncode(input));
  }
  {
    final input = jsonDecode('{"a":[1]}');
    c.eq('dotted path set 2', '{"a":[1,2]}', jsonEncode(setPath(input, 'a[1]', jsonDecode('2'))));
    c.eq('dotted path set 2 leaves input', '{"a":[1]}', jsonEncode(input));
  }
  {
    final input = jsonDecode('{"a":{"b":1}}');
    c.eq('dotted path set 3', '{"a":{"b":1,"c":[1,2]}}', jsonEncode(setPath(input, 'a.c', jsonDecode('[1,2]'))));
    c.eq('dotted path set 3 leaves input', '{"a":{"b":1}}', jsonEncode(input));
  }
  {
    final input = jsonDecode('null');
    c.eq('dotted path set 4', '{"x":true}', jsonEncode(setPath(input, 'x', jsonDecode('true'))));
    c.eq('dotted path set 4 leaves input', 'null', jsonEncode(input));
  }
  {
    final input = jsonDecode('{"a":1}');
    c.eq('dotted path set 5', '{"z":2}', jsonEncode(setPath(input, '', jsonDecode('{"z":2}'))));
    c.eq('dotted path set 5 leaves input', '{"a":1}', jsonEncode(input));
  }
  {
    final input = jsonDecode('{}');
    c.eq('dotted path set 6', '{"k.v":3}', jsonEncode(setPath(input, '["k.v"]', jsonDecode('3'))));
    c.eq('dotted path set 6 leaves input', '{}', jsonEncode(input));
  }
  c.throws<PathException>('dotted path invalid set 0', () => setPath(jsonDecode('{"a":[1]}'), 'a[3]', jsonDecode('0')));
  c.throws<PathException>('dotted path invalid set 1', () => setPath(jsonDecode('{"a":1}'), 'a.b', jsonDecode('0')));
  c.throws<PathException>('dotted path invalid set 2', () => setPath(jsonDecode('{"a":{}}'), 'a[0]', jsonDecode('0')));
  {
    final input = jsonDecode('{"a":{"b":1,"c":2}}');
    c.eq('dotted path delete 0', '{"a":{"c":2}}', jsonEncode(deletePath(input, 'a.b')));
    c.eq('dotted path delete 0 leaves input', '{"a":{"b":1,"c":2}}', jsonEncode(input));
  }
  {
    final input = jsonDecode('{"a":[1,2,3]}');
    c.eq('dotted path delete 1', '{"a":[2,3]}', jsonEncode(deletePath(input, 'a[0]')));
    c.eq('dotted path delete 1 leaves input', '{"a":[1,2,3]}', jsonEncode(input));
  }
  {
    final input = jsonDecode('{"a":1}');
    c.eq('dotted path delete 2', '{"a":1}', jsonEncode(deletePath(input, 'b')));
    c.eq('dotted path delete 2 leaves input', '{"a":1}', jsonEncode(input));
  }
  {
    final input = jsonDecode('{"a":[1]}');
    c.eq('dotted path delete 3', '{"a":[1]}', jsonEncode(deletePath(input, 'a[4]')));
    c.eq('dotted path delete 3 leaves input', '{"a":[1]}', jsonEncode(input));
  }
  c.throws<PathException>('dotted path invalid parse 0', () => parsePath('a.'));
  c.throws<PathException>('dotted path invalid parse 1', () => parsePath('.a'));
  c.throws<PathException>('dotted path invalid parse 2', () => parsePath('a..b'));
  c.throws<PathException>('dotted path invalid parse 3', () => parsePath('a[01]'));
  c.throws<PathException>('dotted path invalid parse 4', () => parsePath('a[x]'));
  c.throws<PathException>('dotted path invalid parse 5', () => parsePath('a["x'));
  c.throws<PathException>('dotted path invalid parse 6', () => parsePath('a[1'));
  c.throws<PathException>('dotted path invalid parse 7', () => parsePath('a[-1]'));
}

void runTemplateRenderTests(Checks c) {
  final data = jsonDecode(
      '{"name":"Ada <3","html":"<b>x</b>","n":3,"f":2.5,"g":4.0,"t":true,"z":0,"e":"","items":[{"name":"one"},{"name":"two","extra":"!"}],"nums":[1,2],"user":{"first":"Grace","tags":["x"]},"empty":[],"obj":{"k":"v"}}');
  c.eq('template render 0', 'Hello Ada &lt;3!', renderTemplate('Hello {{name}}!', data));
  c.eq('template render 1', '<b>x</b> vs &lt;b&gt;x&lt;/b&gt;', renderTemplate('{{{html}}} vs {{html}}', data));
  c.eq('template render 2', '3 2.5 4 true 0 [] []',
      renderTemplate('{{ n }} {{f}} {{g}} {{t}} {{z}} [{{e}}] [{{missing}}]', data));
  c.eq('template render 3', '<one><two!>', renderTemplate('{{#items}}<{{name}}{{extra}}>{{/items}}', data));
  c.eq('template render 4', '1,2,', renderTemplate('{{#nums}}{{.}},{{/nums}}', data));
  c.eq('template render 5', 'yeszeronone',
      renderTemplate('{{#t}}yes{{/t}}{{#z}}no{{/z}}{{^z}}zero{{/z}}{{^empty}}none{{/empty}}', data));
  c.eq('template render 6', 'Grace Ada &lt;3', renderTemplate('{{#user}}{{first}} {{name}}{{/user}}', data));
  c.eq('template render 7', 'Grace x', renderTemplate('{{user.first}} {{user.tags[0]}}', data));
  c.eq('template render 8', 'ab', renderTemplate('a{{! comment }}b', data));
  c.eq('template render 9', 'v', renderTemplate('{{#obj}}{{k}}{{/obj}}', data));
  c.eq('template render 10', '[two]', renderTemplate('{{#items}}{{#extra}}[{{name}}]{{/extra}}{{/items}}', data));
  c.eq('template render 11', 'no tags', renderTemplate('no tags', data));
  c.eq('template raw mode 0', '<b>x</b>', renderTemplate('{{html}}', data, escape: false));
  c.throws<TemplateException>('template invalid 0', () => renderTemplate('{{', data));
  c.throws<TemplateException>('template invalid 1', () => renderTemplate('{{#a}}x', data));
  c.throws<TemplateException>('template invalid 2', () => renderTemplate('{{#a}}x{{/b}}', data));
  c.throws<TemplateException>('template invalid 3', () => renderTemplate('{{/a}}', data));
  c.throws<TemplateException>('template invalid 4', () => renderTemplate('{{ bad name }}', data));
  c.throws<TemplateException>('template invalid 5', () => renderTemplate('{{{x}}', data));
  c.throws<TemplateException>('template invalid 6', () => renderTemplate('{{obj}}', data));
  c.throws<TemplateException>('template invalid 7', () => renderTemplate('{{items}}', data));
}

void runIniParseTests(Checks c) {
  c.eq('ini parse 0', '{"":{"a":"1","b":"two"}}', jsonEncode(parseIni('a=1\nb = two\n')));
  c.eq('ini parse 1', '{"":{},"db":{"host":"localhost","port":"5432"}}',
      jsonEncode(parseIni('[db]\nhost = localhost ; comment\nport: 5432\n')));
  c.eq('ini parse 2', '{"":{},"s":{"k":"quoted \\"x\\" \\\\ ;#"}}',
      jsonEncode(parseIni('; c\n# c\n\n[s]\nk="quoted \\"x\\" \\\\ ;#"\n')));
  c.eq('ini parse 3', '{"":{},"s":{"flag":"","x":"a#b","y":"a"}}',
      jsonEncode(parseIni('[s]\nflag\nx = a#b\ny = a #b\n')));
  c.eq('ini parse 4', '{"":{},"a":{"k":"3","j":"4"},"b":{"k":"2"}}',
      jsonEncode(parseIni('[a]\nk=1\n[b]\nk=2\n[a]\nk=3\nj=4\n')));
  c.eq('ini parse 5', '{"":{"k":"v = w"}}', jsonEncode(parseIni('k: v = w\n')));
  c.eq('ini parse 6', '{"":{},"spaced name":{"K":"V","k2":"v2"}}',
      jsonEncode(parseIni('[ spaced name ]\nK=V\r\nk2=v2\r\n')));
  c.eq('ini parse 7', '{"":{}}', jsonEncode(parseIni('')));
  c.eq('ini stringify 0', 'a = 1\n\n[s]\nk = v\ne = ""\nsp = " x"\nq = "a\\"b;c"\n',
      stringifyIni(_iniDoc(jsonDecode('{"":{"a":"1"},"s":{"k":"v","e":"","sp":" x","q":"a\\"b;c"}}'))));
  c.eq('ini stringify 0 round trip', '{"":{"a":"1"},"s":{"k":"v","e":"","sp":" x","q":"a\\"b;c"}}',
      jsonEncode(parseIni('a = 1\n\n[s]\nk = v\ne = ""\nsp = " x"\nq = "a\\"b;c"\n')));
  c.eq('ini stringify 1', '[only]\nx = y\n', stringifyIni(_iniDoc(jsonDecode('{"":{},"only":{"x":"y"}}'))));
  c.eq('ini stringify 1 round trip', '{"":{},"only":{"x":"y"}}', jsonEncode(parseIni('[only]\nx = y\n')));
  c.eq('ini stringify 2', '', stringifyIni(_iniDoc(jsonDecode('{"":{}}'))));
  c.eq('ini stringify 2 round trip', '{"":{}}', jsonEncode(parseIni('')));
  c.throws<FormatException>('ini invalid 0', () => parseIni('[unterminated\n'), (e) => e.message.startsWith('line '));
  c.throws<FormatException>('ini invalid 1', () => parseIni('[]\n'), (e) => e.message.startsWith('line '));
  c.throws<FormatException>('ini invalid 2', () => parseIni('=v\n'), (e) => e.message.startsWith('line '));
  c.throws<FormatException>('ini invalid 3', () => parseIni('k="open\n'), (e) => e.message.startsWith('line '));
  c.throws<FormatException>('ini invalid 4', () => parseIni('[a]]\n'), (e) => e.message.startsWith('line '));
}

void runPiiMaskTests(Checks c) {
  c.eq('pii email 0', 'j*******@example.com', maskEmail('jane.doe@example.com'));
  c.eq('pii email 1', 'a***@b.co', maskEmail('a@b.co'));
  c.eq('pii email 2', 'a***@x.io', maskEmail('ab@x.io'));
  c.eq('pii email 3', 'é****@ex.fr', maskEmail('émile@ex.fr'));
  c.eq('pii phone 0', '+1 (***) ***-0123', maskPhone('+1 (415) 555-0123'));
  c.eq('pii phone 1', '+44 ** **** 0958', maskPhone('+44 20 7946 0958'));
  c.eq('pii phone 2', '******5678', maskPhone('0612345678'));
  c.eq('pii phone 3', '***-**23-99', maskPhone('555-0123-99'));
  c.eq('pii card 0', '**** **** **** 1111', maskCard('4111 1111 1111 1111'));
  c.eq('pii card 1', '****-****-****-1111', maskCard('4111-1111-1111-1111'));
  c.eq('pii card 2', '***********0005', maskCard('378282246310005'));
  c.eq('pii card 3', '************9424', maskCard('6011000990139424'));
  c.eq('pii middle 0', 'se********en', maskMiddle('secret-token', keepStart: 2, keepEnd: 2));
  c.eq('pii middle 1', 'a*c', maskMiddle('abc', keepStart: 1, keepEnd: 1));
  c.eq('pii middle 2', '**', maskMiddle('ab', keepStart: 1, keepEnd: 1));
  c.eq('pii middle 3', '********', maskMiddle('password', keepStart: 0, keepEnd: 0));
  c.eq('pii middle 4', 'h****', maskMiddle('héllo', keepStart: 1, keepEnd: 0));
  c.eq('pii redact 0', 'contact j***@example.com today', redact('contact jane@example.com today'));
  c.eq('pii redact 1', 'card **** **** **** 1111 exp', redact('card 4111 1111 1111 1111 exp'));
  c.eq('pii redact 2', 'order 1234 5678 9012 3456 ok', redact('order 1234 5678 9012 3456 ok'));
  c.eq('pii redact 3', 'two a***@b.io, c***@e.org', redact('two a@b.io, c.d@e.org'));
  c.eq('pii redact 4', 'id ************1111x', redact('id 4111111111111111x'));
  c.throws<PiiMaskException>('pii invalid email 0', () => maskEmail('nope'));
  c.throws<PiiMaskException>('pii invalid email 1', () => maskEmail('a@b@c'));
  c.throws<PiiMaskException>('pii invalid email 2', () => maskEmail('@x.com'));
  c.throws<PiiMaskException>('pii invalid email 3', () => maskEmail('x@'));
  c.throws<PiiMaskException>('pii invalid phone 0', () => maskPhone('123'));
  c.throws<PiiMaskException>('pii invalid phone 1', () => maskPhone('+1 55'));
  c.throws<PiiMaskException>('pii invalid card 0', () => maskCard('4111'));
  c.throws<PiiMaskException>('pii invalid card 1', () => maskCard('4111 1111 1111 1111 1111 1'));
  c.throws<PiiMaskException>('pii invalid card 2', () => maskCard('4111a1111111111'));
}

void runPasswordGenerateTests(Checks c) {
  {
    final src = _src('00ff10a37c55e2019b');
    c.eq('password random index 0', '0,6,3,4,5,6', [for (var k = 0; k < 6; k++) randomIndex(10, src)].join(','));
  }
  {
    final src = _src('ffff0102a0b0');
    c.eq('password random index 1', '258,36,258,36,258,36',
        [for (var k = 0; k < 6; k++) randomIndex(300, src)].join(','));
  }
  {
    final src = _src('00');
    c.eq('password random index 2', '0,0,0,0,0,0', [for (var k = 0; k < 6; k++) randomIndex(1, src)].join(','));
  }
  {
    final src = _src('ab');
    c.eq('password random index 3', '171,171,171,171,171,171',
        [for (var k = 0; k < 6; k++) randomIndex(256, src)].join(','));
  }
  {
    final src = _src('f0f8fc00');
    c.eq('password random index 4', '54,0,54,0,54,0', [for (var k = 0; k < 6; k++) randomIndex(62, src)].join(','));
  }
  c.eq(
      'password generate 0',
      'jl__j_ad3WbbdqQa',
      generatePassword(
          length: 16,
          classes: ["lower", "upper", "digits", "symbols"],
          nextByte: _src('00ff10a37c55e2019b'),
          excludeAmbiguous: false));
  c.eq(
      'password generate 1',
      'hkjibfmdnge4',
      generatePassword(
          length: 12,
          classes: ["lower", "digits"],
          nextByte: _src('0102030405060708090a0b0c0d0e0f'),
          excludeAmbiguous: true));
  c.eq(
      'password generate 2',
      'X7x#',
      generatePassword(
          length: 4, classes: ["upper", "lower", "digits", "symbols"], nextByte: _src('7f'), excludeAmbiguous: false));
  c.eq(
      'password generate 3',
      '!!!!!!!!!!!!!!!!!!!!',
      generatePassword(
          length: 20, classes: ["symbols"], nextByte: _src('ffffffffffffffff00'), excludeAmbiguous: false));
  c.eq(
      'password passphrase 0',
      'river-stone-cloud-maple',
      generatePassphrase(["apple", "river", "stone", "cloud", "maple"],
          count: 4, separator: '-', nextByte: _src('0102030405')));
  c.eq('password passphrase 1', 'b a b',
      generatePassphrase(["a", "b"], count: 3, separator: ' ', nextByte: _src('ff00')));
  c.eq('password entropy 0', 99.97, entropyBits(76, 16));
  c.eq('password entropy 1', 19.93, entropyBits(10, 6));
  c.eq('password entropy 2', 64.62, entropyBits(7776, 5));
  c.eq('password entropy 3', 1.0, entropyBits(2, 1));
  c.throws<ArgumentError>(
      'password invalid generate 0',
      () =>
          generatePassword(length: 3, classes: <String>["lower", "upper", "digits", "symbols"], nextByte: _src('00')));
  c.throws<ArgumentError>(
      'password invalid generate 1', () => generatePassword(length: 8, classes: <String>[], nextByte: _src('00')));
  c.throws<ArgumentError>('password invalid generate 2',
      () => generatePassword(length: 8, classes: <String>["lower", "lower"], nextByte: _src('00')));
  c.throws<ArgumentError>('password invalid generate 3',
      () => generatePassword(length: 8, classes: <String>["emoji"], nextByte: _src('00')));
  c.throws<ArgumentError>('password invalid generate 4',
      () => generatePassword(length: 1025, classes: <String>["lower"], nextByte: _src('00')));
  c.throws<ArgumentError>(
      'password invalid passphrase 0', () => generatePassphrase(["a"], count: 3, nextByte: _src('00')));
  c.throws<ArgumentError>(
      'password invalid passphrase 1', () => generatePassphrase(["a", "b"], count: 0, nextByte: _src('00')));
  c.throws<ArgumentError>(
      'password invalid passphrase 2', () => generatePassphrase(["a", "b"], count: 65, nextByte: _src('00')));
  c.throws<ArgumentError>(
      'password invalid passphrase 3', () => generatePassphrase(["a", ""], count: 2, nextByte: _src('00')));
  final secure = generatePassword();
  c.check('password secure default length', secure.length == 16);
  c.check(
      'password secure default has every class',
      [RegExp('[a-z]'), RegExp('[A-Z]'), RegExp('[0-9]'), RegExp(r'[!#$%&*+\-=?@^_~]')]
          .every((r) => r.hasMatch(secure)));
  c.check('password secure randomIndex in range', randomIndex(7) < 7);
}

void runHtmlEscapeTests(Checks c) {
  c.eq('html escape 0', '&lt;a href=&quot;x&quot;&gt;', escapeHtml('<a href="x">'));
  c.eq('html escape 1', 'Tom &amp; Jerry&#39;s', escapeHtml('Tom & Jerry\'s'));
  c.eq('html escape 2', 'plain', escapeHtml('plain'));
  c.eq('html escape 3', '', escapeHtml(''));
  c.eq('html unescape 0', '<p>', unescapeHtml('&lt;p&gt;'));
  c.eq('html unescape 1', '© © ©', unescapeHtml('&#169; &#xA9; &#XA9;'));
  c.eq('html unescape 2', '&amp;', unescapeHtml('&amp;amp;'));
  c.eq('html unescape 3', '&amp no semicolon', unescapeHtml('&amp no semicolon'));
  c.eq('html unescape 4', '&bogus; &AMP;', unescapeHtml('&bogus; &AMP;'));
  c.eq('html unescape 5', '€ Ÿ', unescapeHtml('&#128; &#x9F;'));
  c.eq('html unescape 6', '� � �', unescapeHtml('&#0; &#xD800; &#1114112;'));
  c.eq('html unescape 7', '€5 — …', unescapeHtml('&euro;5 &mdash; &hellip;'));
  c.eq('html unescape 8', '&#99999999999;', unescapeHtml('&#99999999999;'));
  c.eq('html strip 0', 'Hello world', stripTags('<p>Hello <b>world</b></p>'));
  c.eq('html strip 1', 'ab', stripTags('a<script>alert(1)</script>b'));
  c.eq('html strip 2', 'x & y', stripTags('<STYLE>p{}</STYLE>x &amp; y'));
  c.eq('html strip 3', '1 < 2 and 3>1', stripTags('1 < 2 and 3>1'));
  c.eq('html strip 4', 't', stripTags('<!-- c -->t'));
  c.eq('html strip 5', 'unclosed ', stripTags('unclosed <script>evil'));
}
