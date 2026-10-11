// SPDX-License-Identifier: Apache-2.0
// Vector tests for the wave 11 TypeScript recipes: Punycode, Base58Check (extends base-encodings), Roman numerals,
// dotted paths, logic-less templates, INI files, PII masking, password generation and HTML
// unescaping/tag stripping (extends html-escape). Every vector comes from tests/fixtures/wave11-vectors.json, the
// shared wave 11 vector set used by every language (bytes are hex strings); do not edit it by hand. Compiled with
// the same generated-tsconfig approach and strict flags as tests/wave10-capabilities.test.mjs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const recipeDir = join(root, 'examples/recipes');
const names = ['punycode', 'base-encodings', 'roman-numerals', 'dotted-path', 'template-render', 'ini-parse', 'pii-mask', 'password-generate', 'html-escape'];
const out = mkdtempSync(join(tmpdir(), 'genlib-wave11-'));
after(() => rmSync(out, { recursive: true, force: true }));
const compilerOptions = {
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitReturns: true,
  noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true,
  target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  rootDir: recipeDir, outDir: out,
};
const project = join(out, 'tsconfig.wave11.json');
writeFileSync(project, JSON.stringify({ compilerOptions, files: names.map((n) => join(recipeDir, `${n}.ts`)) }));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'pipe' });
writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);
const findTop = (...words) => JSON.parse(execFileSync(process.execPath, ['tools/agent-recipes.mjs', 'find', ...words], { cwd: root, encoding: 'utf8' })).matches[0]?.id;
const V = JSON.parse(readFileSync(join(root, 'tests/fixtures/wave11-vectors.json'), 'utf8'));
const bytes = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
const toHex = (data) => Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('');
const label = (x) => JSON.stringify(x);
// Deterministic test byte source: cycles through the given bytes (passgen_ref.byte_source).
const byteSource = (hex) => { const b = bytes(hex); let i = 0; return () => b[i++ % b.length]; };

test('Punycode and domain conversion match the shared vectors', async () => {
  const { punycodeEncode, punycodeDecode, domainToAscii, domainToUnicode, PunycodeError } = await load('punycode');
  const p = V.punycode;
  for (const [text, encoded] of p.encode) {
    assert.equal(punycodeEncode(text), encoded, text);
    assert.equal(punycodeDecode(encoded), text, encoded);
  }
  for (const [encoded, text] of p.decode) assert.equal(punycodeDecode(encoded), text, encoded);
  for (const [domain, expected] of p.domain_to_ascii) assert.equal(domainToAscii(domain), expected, domain);
  for (const [domain, expected] of p.domain_to_unicode) assert.equal(domainToUnicode(domain), expected, domain);
  for (const text of p.invalid_decode) assert.throws(() => punycodeDecode(text), PunycodeError, label(text));
  for (const domain of p.invalid_domain) assert.throws(() => domainToAscii(domain), PunycodeError, label(domain));
  assert.throws(() => punycodeDecode('a-\u{10FFFF}'), RangeError, 'non-ASCII digit');
  assert.equal(punycodeDecode('-a'), '\x80');
  assert.equal(domainToAscii('\u00dcBER.de'), 'xn--ber-ska.de', 'only ASCII is lowercased');
  assert.equal(punycodeEncode('\u{1F600}'), 'e28h', 'astral code points count once');
});

test('Base58 and Base58Check match the shared vectors', async () => {
  const { base58Encode, base58Decode, base58CheckEncode, base58CheckDecode } = await load('base-encodings');
  for (const [hex, text] of V.base58.encode) {
    assert.equal(base58Encode(bytes(hex)), text, hex);
    assert.equal(toHex(base58Decode(text)), hex, text);
  }
  for (const [hex, text] of V.base58.check) {
    assert.equal(await base58CheckEncode(bytes(hex)), text, hex);
    assert.equal(toHex(await base58CheckDecode(text)), hex, text);
  }
  for (const text of V.base58.invalid_decode) assert.throws(() => base58Decode(text), RangeError, label(text));
  for (const text of V.base58.invalid_check) await assert.rejects(base58CheckDecode(text), RangeError, label(text));
});

test('Roman numerals match the shared vectors', async () => {
  const { toRoman, fromRoman } = await load('roman-numerals');
  for (const [n, text] of V.roman.to) {
    assert.equal(toRoman(n), text);
    assert.equal(fromRoman(text), n);
  }
  for (const [text, n] of V.roman.from) assert.equal(fromRoman(text), n, text);
  for (const n of [...V.roman.invalid_to, 1.5, NaN]) assert.throws(() => toRoman(n), RangeError, String(n));
  for (const text of [...V.roman.invalid_from, '\u0131v']) assert.throws(() => fromRoman(text), RangeError, label(text));
  for (let n = 1; n < 4000; n++) assert.equal(fromRoman(toRoman(n).toLowerCase()), n);
});

test('dotted paths get, set and delete like the shared vectors without mutating input', async () => {
  const { parsePath, getPath, hasPath, setPath, deletePath, PathError } = await load('dotted-path');
  const d = V.dotted_path;
  for (const [path, expected] of d.parse) assert.deepEqual(parsePath(path), expected, path);
  for (const [path, expected] of d.get) assert.deepEqual(getPath(d.data, path, 'DEF'), expected, path);
  for (const [path, expected] of d.has) assert.equal(hasPath(d.data, path), expected, path);
  for (const [data, path, value, expected] of d.set) {
    const before = structuredClone(data);
    assert.deepEqual(setPath(data, path, value), expected, path);
    assert.deepEqual(data, before, `${path} must not mutate`);
  }
  for (const [data, path, value] of d.invalid_set) assert.throws(() => setPath(data, path, value), PathError, path);
  for (const [data, path, expected] of d.delete) {
    const before = structuredClone(data);
    assert.deepEqual(deletePath(data, path), expected, path);
    assert.deepEqual(data, before, `${path} must not mutate`);
  }
  for (const path of d.invalid_parse) assert.throws(() => parsePath(path), PathError, label(path));
  assert.equal(getPath({}, 'constructor', 'DEF'), 'DEF', 'own properties only');
  const polluted = setPath({}, '["__proto__"].x', 1);
  assert.equal(Object.keys(polluted)[0], '__proto__');
  assert.equal({}.x, undefined, 'no prototype pollution');
});

test('templates render like the shared vectors', async () => {
  const { renderTemplate, TemplateError } = await load('template-render');
  const t = V.template;
  for (const [template, expected] of t.render) assert.equal(renderTemplate(template, t.data), expected, template);
  for (const [template, expected] of t.raw_mode) assert.equal(renderTemplate(template, t.data, false), expected, template);
  for (const template of t.invalid) assert.throws(() => renderTemplate(template, t.data), TemplateError, label(template));
  assert.equal(renderTemplate('{{#list}}{{who}};{{/list}}', { who: 'outer', list: [{ x: 1 }, { who: 'inner' }] }), 'outer;inner;');
  assert.equal(renderTemplate('{{toString}}', {}), '', 'inherited properties are not looked up');
});

test('INI files parse and stringify like the shared vectors', async () => {
  const { parseIni, stringifyIni } = await load('ini-parse');
  const toMap = (obj) => new Map(Object.entries(obj).map(([k, v]) => [k, new Map(Object.entries(v))]));
  const plain = (m) => [...m].map(([k, v]) => [k, [...v]]);
  for (const [text, expected] of V.ini.parse) assert.deepEqual(plain(parseIni(text)), plain(toMap(expected)), label(text));
  for (const [data, expected] of V.ini.stringify) {
    assert.equal(stringifyIni(toMap(data)), expected);
    assert.deepEqual(plain(parseIni(expected)), plain(toMap({ '': {}, ...data })));
  }
  for (const text of V.ini.invalid) assert.throws(() => parseIni(text), RangeError, label(text));
  assert.throws(() => parseIni('a=1\n\n[x\n'), /^RangeError: line 3:/);
});

test('PII masking and redaction match the shared vectors', async () => {
  const { maskEmail, maskPhone, maskCard, maskMiddle, redact } = await load('pii-mask');
  const p = V.pii;
  for (const [text, expected] of p.email) assert.equal(maskEmail(text), expected, text);
  for (const [text, expected] of p.phone) assert.equal(maskPhone(text), expected, text);
  for (const [text, expected] of p.card) assert.equal(maskCard(text), expected, text);
  for (const [text, start, end, expected] of p.middle) assert.equal(maskMiddle(text, start, end), expected, text);
  for (const [text, expected] of p.redact) assert.equal(redact(text), expected, text);
  for (const text of p.invalid_email) assert.throws(() => maskEmail(text), RangeError, text);
  for (const text of p.invalid_phone) assert.throws(() => maskPhone(text), RangeError, text);
  for (const text of p.invalid_card) assert.throws(() => maskCard(text), RangeError, text);
  assert.equal(maskEmail('\u{1F600}x@ex.io'), '\u{1F600}***@ex.io', 'code points, not UTF-16 units');
  assert.equal(redact('a@b.io 4111111111111111', ['email']), 'a***@b.io 4111111111111111');
  assert.throws(() => maskMiddle('x', 1, 1, '**'), RangeError);
  assert.throws(() => redact('x', ['phone']), RangeError);
});

test('password generation matches the shared vectors and defaults to the CSPRNG', async () => {
  const { randomIndex, generatePassword, generatePassphrase, entropyBits, cryptoByte } = await load('password-generate');
  const p = V.password;
  for (const [n, hex, expected] of p.random_index) {
    const src = byteSource(hex);
    assert.deepEqual(Array.from({ length: 6 }, () => randomIndex(n, src)), expected, label([n, hex]));
  }
  for (const [length, classes, ambiguous, hex, expected] of p.password) {
    assert.equal(generatePassword(length, classes, byteSource(hex), ambiguous), expected, hex);
  }
  for (const [words, count, separator, hex, expected] of p.passphrase) {
    assert.equal(generatePassphrase(words, count, separator, byteSource(hex)), expected, hex);
  }
  for (const [size, length, expected] of p.entropy) assert.equal(entropyBits(size, length), expected);
  for (const [length, classes] of p.invalid_password) assert.throws(() => generatePassword(length, classes, byteSource('00')), RangeError, label([length, classes]));
  for (const [words, count] of p.invalid_passphrase) assert.throws(() => generatePassphrase(words, count, '-', byteSource('00')), RangeError, label([words, count]));
  assert.throws(() => randomIndex(0), RangeError);
  const b = cryptoByte();
  assert.ok(Number.isInteger(b) && b >= 0 && b <= 255);
  const pw = generatePassword();
  assert.equal(pw.length, 16);
  assert.match(pw, /[a-z]/); assert.match(pw, /[A-Z]/); assert.match(pw, /[0-9]/);
  assert.doesNotMatch(generatePassword(64, ['lower', 'upper', 'digits'], undefined, true), /[Il1O0o]/);
  assert.equal(generatePassphrase(['a', 'b', 'c'], 4).split('-').length, 4);
});

test('HTML escaping, unescaping and tag stripping match the shared vectors', async () => {
  const { escapeHtml, unescapeHtml, stripTags } = await load('html-escape');
  for (const [text, expected] of V.html.escape) {
    assert.equal(escapeHtml(text), expected, text);
    assert.equal(unescapeHtml(expected), text, expected);
  }
  for (const [text, expected] of V.html.unescape) assert.equal(unescapeHtml(text), expected, text);
  for (const [text, expected] of V.html.strip) assert.equal(stripTags(text), expected, text);
  assert.equal(unescapeHtml('&#x1F600; &toString; &#129;'), '\u{1F600} &toString; \x81');
  assert.equal(stripTags('x<script>evil\n'), 'x\n', 'an unclosed script ends before a final newline, as in every language');
  assert.equal(escapeHtml('`'), '&#96;', 'the TypeScript recipe also escapes backticks');
});

test('agent-recipes find routes wave 11 phrasings to the new recipes', () => {
  assert.equal(findTop('punycode'), 'punycode');
  assert.equal(findTop('unicode', 'domain'), 'punycode');
  assert.equal(findTop('base58check'), 'base-encodings');
  assert.equal(findTop('base58', 'checksum'), 'base-encodings');
  assert.equal(findTop('roman', 'numerals'), 'roman-numerals');
  assert.equal(findTop('get', 'nested', 'value'), 'dotted-path');
  assert.equal(findTop('nested', 'property'), 'dotted-path');
  assert.equal(findTop('mustache'), 'template-render');
  assert.equal(findTop('render', 'template'), 'template-render');
  assert.equal(findTop('time', 'ago'), 'human-readable-units');
  assert.equal(findTop('ini', 'file'), 'ini-parse');
  assert.equal(findTop('configparser'), 'ini-parse');
  assert.equal(findTop('redact', 'pii'), 'pii-mask');
  assert.equal(findTop('mask', 'credit', 'card'), 'pii-mask');
  assert.equal(findTop('generate', 'password'), 'password-generate');
  assert.equal(findTop('random', 'passphrase'), 'password-generate');
  assert.equal(findTop('strip', 'tags'), 'html-escape-and-safe-template');
  assert.equal(findTop('decode', 'html', 'entities'), 'html-escape-and-safe-template');
  // existing recipes keep their routes
  assert.equal(findTop('escape', 'html'), 'html-escape-and-safe-template');
  assert.equal(findTop('password', 'rules'), 'password-strength-policy');
  assert.equal(findTop('nist', 'password', 'policy'), 'nist-password-policy');
  assert.equal(findTop('path', 'traversal'), 'safe-filename-and-path-join');
  assert.equal(findTop('base58', 'base64url'), 'base-encodings');
  assert.equal(findTop('format', 'file', 'size'), 'human-readable-units');
  assert.equal(findTop('dotenv'), 'dotenv-parse');
  assert.equal(findTop('rate', 'limiter'), 'token-bucket');
});
