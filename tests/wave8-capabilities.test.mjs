// SPDX-License-Identifier: Apache-2.0
// Vector tests for the wave 8 TypeScript recipes: line-diff v2 performance (vectors are in
// tests/wave7-capabilities.test.mjs), portable slugify and JSON Pointer/Patch/Merge Patch. Every vector is
// generated from the shared wave 8 vector set used by every language; do not edit the literals by hand.
// Compiled with the same generated-tsconfig approach and strict flags as tests/wave7-capabilities.test.mjs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const recipeDir = join(root, 'examples/recipes');
const names = ['line-diff', 'slugify-portable', 'json-patch'];
const out = mkdtempSync(join(tmpdir(), 'genlib-wave8-'));
after(() => rmSync(out, { recursive: true, force: true }));
const compilerOptions = {
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitReturns: true,
  noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true,
  target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  rootDir: recipeDir, outDir: out,
};
const project = join(out, 'tsconfig.wave8.json');
writeFileSync(project, JSON.stringify({ compilerOptions, files: names.map((n) => join(recipeDir, `${n}.ts`)) }));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'pipe' });
writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);
const findTop = (...words) => JSON.parse(execFileSync(process.execPath, ['tools/agent-recipes.mjs', 'find', ...words], { cwd: root, encoding: 'utf8' })).matches[0]?.id;

// [text, separator, maxLength, expected]
const SLUG_CASES = [
  ["Hello, World!","-",0,"hello-world"],
  ["Crème brûlée & Café","-",0,"creme-brulee-cafe"],
  ["Straße in Łódź","-",0,"strasse-in-lodz"],
  ["don't stop","-",0,"dont-stop"],
  ["don’t stop","-",0,"dont-stop"],
  ["  --Already--slugged--  ","-",0,"already-slugged"],
  ["日本語 title 2026","-",0,"title-2026"],
  ["Ærøskøbing ŒUVRE","-",0,"aeroskobing-oeuvre"],
  ["Crème brûlée","-",0,"creme-brulee"],
  ["ÀÁÂÃÄÅ àáâãäå Çç Ññ","-",0,"aaaaaa-aaaaaa-cc-nn"],
  ["Ĳssel ŀ ĸ ſ ŉ","-",0,"ijssel-l-q-s-n"],
  ["C# and C++","-",0,"c-and-c"],
  ["100% pure","-",0,"100-pure"],
  ["","-",0,""],
  ["---","-",0,""],
  ["a_b.c-d","-",0,"a-b-c-d"],
  ["Emoji 😀 test","-",0,"emoji-test"],
  ["Ｆｕｌｌ width","-",0,"width"],
  ["ǅemal (outside the table)","-",0,"emal-outside-the-table"],
  ["ÿ Ÿ","-",0,"y-y"],
  ["MiXeD CaSe 42","-",0,"mixed-case-42"],
  ["Hello, World!","_",0,"hello_world"],
  ["Hello, World!",".",0,"hello.world"],
  ["Crème brûlée & Café","_",0,"creme_brulee_cafe"],
  ["Crème brûlée & Café",".",0,"creme.brulee.cafe"],
  ["Straße in Łódź","_",0,"strasse_in_lodz"],
  ["Straße in Łódź",".",0,"strasse.in.lodz"],
  ["don't stop","_",0,"dont_stop"],
  ["don't stop",".",0,"dont.stop"],
  ["The quick brown fox jumps","-",12,"the-quick"],
  ["The quick brown fox jumps","-",9,"the-quick"],
  ["The quick brown fox jumps","-",10,"the-quick"],
  ["Supercalifragilistic","-",5,"super"],
  ["ab cd","-",3,"ab"],
  ["ab cd","-",2,"ab"],
  ["ab cd","-",5,"ab-cd"],
  ["ab cd","-",100,"ab-cd"],
  ["a b","-",1,"a"],
];
// [text, separator, maxLength]: must throw RangeError
const SLUG_INVALID = [
  ["x","/",0],
  ["x","",0],
  ["x","--",0],
  ["x","-",-1],
];
// [base, taken, expected]
const SLUG_UNIQUE = [
  ["post",[],"post"],
  ["post",["post"],"post-2"],
  ["post",["post","post-2","post-3"],"post-4"],
  ["post",["post-2"],"post"],
  ["a",["a","a-2","a-4"],"a-3"],
];
// transliteration table for U+00C0..U+017F
const SLUG_TABLE = {"À":"A","Á":"A","Â":"A","Ã":"A","Ä":"A","Å":"A","Æ":"AE","Ç":"C","È":"E","É":"E","Ê":"E","Ë":"E","Ì":"I","Í":"I","Î":"I","Ï":"I","Ð":"D","Ñ":"N","Ò":"O","Ó":"O","Ô":"O","Õ":"O","Ö":"O","Ø":"O","Ù":"U","Ú":"U","Û":"U","Ü":"U","Ý":"Y","Þ":"TH","ß":"ss","à":"a","á":"a","â":"a","ã":"a","ä":"a","å":"a","æ":"ae","ç":"c","è":"e","é":"e","ê":"e","ë":"e","ì":"i","í":"i","î":"i","ï":"i","ð":"d","ñ":"n","ò":"o","ó":"o","ô":"o","õ":"o","ö":"o","ø":"o","ù":"u","ú":"u","û":"u","ü":"u","ý":"y","þ":"th","ÿ":"y","Ā":"A","ā":"a","Ă":"A","ă":"a","Ą":"A","ą":"a","Ć":"C","ć":"c","Ĉ":"C","ĉ":"c","Ċ":"C","ċ":"c","Č":"C","č":"c","Ď":"D","ď":"d","Đ":"D","đ":"d","Ē":"E","ē":"e","Ĕ":"E","ĕ":"e","Ė":"E","ė":"e","Ę":"E","ę":"e","Ě":"E","ě":"e","Ĝ":"G","ĝ":"g","Ğ":"G","ğ":"g","Ġ":"G","ġ":"g","Ģ":"G","ģ":"g","Ĥ":"H","ĥ":"h","Ħ":"H","ħ":"h","Ĩ":"I","ĩ":"i","Ī":"I","ī":"i","Ĭ":"I","ĭ":"i","Į":"I","į":"i","İ":"I","ı":"i","Ĳ":"IJ","ĳ":"ij","Ĵ":"J","ĵ":"j","Ķ":"K","ķ":"k","ĸ":"q","Ĺ":"L","ĺ":"l","Ļ":"L","ļ":"l","Ľ":"L","ľ":"l","Ŀ":"L","ŀ":"l","Ł":"L","ł":"l","Ń":"N","ń":"n","Ņ":"N","ņ":"n","Ň":"N","ň":"n","ŉ":"n","Ŋ":"N","ŋ":"n","Ō":"O","ō":"o","Ŏ":"O","ŏ":"o","Ő":"O","ő":"o","Œ":"OE","œ":"oe","Ŕ":"R","ŕ":"r","Ŗ":"R","ŗ":"r","Ř":"R","ř":"r","Ś":"S","ś":"s","Ŝ":"S","ŝ":"s","Ş":"S","ş":"s","Š":"S","š":"s","Ţ":"T","ţ":"t","Ť":"T","ť":"t","Ŧ":"T","ŧ":"t","Ũ":"U","ũ":"u","Ū":"U","ū":"u","Ŭ":"U","ŭ":"u","Ů":"U","ů":"u","Ű":"U","ű":"u","Ų":"U","ų":"u","Ŵ":"W","ŵ":"w","Ŷ":"Y","ŷ":"y","Ÿ":"Y","Ź":"Z","ź":"z","Ż":"Z","ż":"z","Ž":"Z","ž":"z","ſ":"s"};
// JSON documents are JSON text; results are canonical JSON text.
// [doc, patch, result]
const PATCH_APPLY = [
  ["{\"foo\":\"bar\"}","[{\"op\":\"add\",\"path\":\"/baz\",\"value\":\"qux\"}]","{\"baz\":\"qux\",\"foo\":\"bar\"}"],
  ["{\"foo\":[\"bar\",\"baz\"]}","[{\"op\":\"add\",\"path\":\"/foo/1\",\"value\":\"qux\"}]","{\"foo\":[\"bar\",\"qux\",\"baz\"]}"],
  ["{\"baz\":\"qux\",\"foo\":\"bar\"}","[{\"op\":\"remove\",\"path\":\"/baz\"}]","{\"foo\":\"bar\"}"],
  ["{\"foo\":[\"bar\",\"qux\",\"baz\"]}","[{\"op\":\"remove\",\"path\":\"/foo/1\"}]","{\"foo\":[\"bar\",\"baz\"]}"],
  ["{\"baz\":\"qux\",\"foo\":\"bar\"}","[{\"op\":\"replace\",\"path\":\"/baz\",\"value\":\"boo\"}]","{\"baz\":\"boo\",\"foo\":\"bar\"}"],
  ["{\"foo\":{\"bar\":\"baz\",\"waldo\":\"fred\"},\"qux\":{\"corge\":\"grault\"}}","[{\"from\":\"/foo/waldo\",\"op\":\"move\",\"path\":\"/qux/thud\"}]","{\"foo\":{\"bar\":\"baz\"},\"qux\":{\"corge\":\"grault\",\"thud\":\"fred\"}}"],
  ["{\"foo\":[\"all\",\"grass\",\"cows\",\"eat\"]}","[{\"from\":\"/foo/1\",\"op\":\"move\",\"path\":\"/foo/3\"}]","{\"foo\":[\"all\",\"cows\",\"eat\",\"grass\"]}"],
  ["{\"baz\":\"qux\",\"foo\":[\"a\",2,\"c\"]}","[{\"op\":\"test\",\"path\":\"/baz\",\"value\":\"qux\"},{\"op\":\"test\",\"path\":\"/foo/1\",\"value\":2}]","{\"baz\":\"qux\",\"foo\":[\"a\",2,\"c\"]}"],
  ["{\"foo\":\"bar\"}","[{\"op\":\"add\",\"path\":\"/child\",\"value\":{\"grandchild\":{}}}]","{\"child\":{\"grandchild\":{}},\"foo\":\"bar\"}"],
  ["{\"foo\":\"bar\"}","[{\"op\":\"add\",\"path\":\"/baz\",\"value\":\"qux\",\"xyz\":123}]","{\"baz\":\"qux\",\"foo\":\"bar\"}"],
  ["{\"foo\":[\"bar\"]}","[{\"op\":\"add\",\"path\":\"/foo/-\",\"value\":[\"abc\",\"def\"]}]","{\"foo\":[\"bar\",[\"abc\",\"def\"]]}"],
  ["{\"/\":9,\"~1\":10}","[{\"op\":\"test\",\"path\":\"/~01\",\"value\":10},{\"op\":\"replace\",\"path\":\"/~1\",\"value\":1}]","{\"/\":1,\"~1\":10}"],
  ["{\"a\":1}","[{\"op\":\"replace\",\"path\":\"\",\"value\":[1,2]}]","[1,2]"],
  ["{\"a\":1}","[{\"op\":\"add\",\"path\":\"\",\"value\":\"root\"}]","\"root\""],
  ["{\"a\":{\"b\":1}}","[{\"from\":\"/a\",\"op\":\"copy\",\"path\":\"/c\"},{\"op\":\"replace\",\"path\":\"/c/b\",\"value\":2}]","{\"a\":{\"b\":1},\"c\":{\"b\":2}}"],
  ["{\"a\":[1,2]}","[{\"from\":\"/a/0\",\"op\":\"move\",\"path\":\"/a/0\"}]","{\"a\":[1,2]}"],
  ["{\"n\":1}","[{\"op\":\"test\",\"path\":\"/n\",\"value\":1}]","{\"n\":1}"],
  ["{\"a\":{\"b\":[1,{\"c\":null}]}}","[{\"op\":\"test\",\"path\":\"/a/b/1/c\",\"value\":null},{\"op\":\"remove\",\"path\":\"/a/b/0\"}]","{\"a\":{\"b\":[{\"c\":null}]}}"],
];
// [doc, patch]: must throw JsonPatchError and leave doc unchanged
const PATCH_APPLY_INVALID = [
  ["{\"baz\":\"qux\"}","[{\"op\":\"add\",\"path\":\"/baz/bat\",\"value\":\"qux\"}]"],
  ["{\"foo\":\"bar\"}","[{\"op\":\"test\",\"path\":\"/baz\",\"value\":\"qux\"}]"],
  ["{\"foo\":[\"bar\"]}","[{\"op\":\"add\",\"path\":\"/foo/2\",\"value\":1}]"],
  ["{\"foo\":[\"bar\"]}","[{\"op\":\"add\",\"path\":\"/foo/01\",\"value\":1}]"],
  ["{\"foo\":[\"bar\"]}","[{\"op\":\"remove\",\"path\":\"/foo/-\"}]"],
  ["{\"a\":1}","[{\"op\":\"remove\",\"path\":\"/b\"}]"],
  ["{\"a\":1}","[{\"op\":\"replace\",\"path\":\"/b\",\"value\":1}]"],
  ["{\"a\":{\"b\":1}}","[{\"from\":\"/a\",\"op\":\"move\",\"path\":\"/a/b/c\"}]"],
  ["{\"a\":1}","[{\"op\":\"frobnicate\",\"path\":\"/a\"}]"],
  ["{\"a\":1}","[{\"op\":\"add\",\"path\":\"/b\"}]"],
  ["{\"a\":1}","[{\"op\":\"add\",\"value\":1}]"],
  ["{\"a\":1}","[{\"op\":\"add\",\"path\":\"a\",\"value\":1}]"],
  ["{\"a~b\":1}","[{\"op\":\"remove\",\"path\":\"/a~b\"}]"],
  ["{\"a\":1}","[{\"op\":\"remove\",\"path\":\"\"}]"],
  ["{\"a\":true}","[{\"op\":\"test\",\"path\":\"/a\",\"value\":1}]"],
  ["{\"a\":1}","[{\"op\":\"test\",\"path\":\"/a\",\"value\":\"1\"}]"],
  ["{\"a\":1}","[{\"op\":\"add\",\"path\":\"/b\",\"value\":2},{\"op\":\"test\",\"path\":\"/b\",\"value\":3}]"],
  ["{\"a\":1}","{\"op\":\"add\",\"path\":\"/b\",\"value\":2}"],
];
// [doc, pointer, result]
const POINTER = [
  ["{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}","","{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}"],
  ["{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}","/foo","[\"bar\",\"baz\"]"],
  ["{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}","/foo/0","\"bar\""],
  ["{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}","/","0"],
  ["{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}","/a~1b","1"],
  ["{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}","/c%d","2"],
  ["{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}","/e^f","3"],
  ["{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}","/g|h","4"],
  ["{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}","/i\\j","5"],
  ["{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}","/k\"l","6"],
  ["{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}","/ ","7"],
  ["{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}","/m~0n","8"],
];
// pointers that fail against {"foo":["bar","baz"],"m~n":8}
const POINTER_INVALID = ["/foo/2","/foo/-","/foo/01","foo","/nope","/m~2n","/foo/0/x"];
// [target, patch, result]
const MERGE = [
  ["{\"a\":\"b\"}","{\"a\":\"c\"}","{\"a\":\"c\"}"],
  ["{\"a\":\"b\"}","{\"b\":\"c\"}","{\"a\":\"b\",\"b\":\"c\"}"],
  ["{\"a\":\"b\"}","{\"a\":null}","{}"],
  ["{\"a\":\"b\",\"b\":\"c\"}","{\"a\":null}","{\"b\":\"c\"}"],
  ["{\"a\":[\"b\"]}","{\"a\":\"c\"}","{\"a\":\"c\"}"],
  ["{\"a\":\"c\"}","{\"a\":[\"b\"]}","{\"a\":[\"b\"]}"],
  ["{\"a\":{\"b\":\"c\"}}","{\"a\":{\"b\":\"d\",\"c\":null}}","{\"a\":{\"b\":\"d\"}}"],
  ["{\"a\":[{\"b\":\"c\"}]}","{\"a\":[1]}","{\"a\":[1]}"],
  ["[\"a\",\"b\"]","[\"c\",\"d\"]","[\"c\",\"d\"]"],
  ["{\"a\":\"b\"}","[\"c\"]","[\"c\"]"],
  ["{\"a\":\"foo\"}","null","null"],
  ["{\"a\":\"foo\"}","\"bar\"","\"bar\""],
  ["{\"e\":null}","{\"a\":1}","{\"a\":1,\"e\":null}"],
  ["[1,2]","{\"a\":\"b\",\"c\":null}","{\"a\":\"b\"}"],
  ["{}","{\"a\":{\"bb\":{\"ccc\":null}}}","{\"a\":{\"bb\":{}}}"],
];
// [a, b, patch]
const CREATE = [
  ["{\"a\":1,\"b\":[1,2,3]}","{\"a\":2,\"b\":[1],\"c\":true}","[{\"op\":\"replace\",\"path\":\"/a\",\"value\":2},{\"op\":\"remove\",\"path\":\"/b/2\"},{\"op\":\"remove\",\"path\":\"/b/1\"},{\"op\":\"add\",\"path\":\"/c\",\"value\":true}]"],
  ["{\"x\":{\"y\":{\"z\":1}}}","{\"x\":{\"y\":{\"w\":[null],\"z\":1}}}","[{\"op\":\"add\",\"path\":\"/x/y/w\",\"value\":[null]}]"],
  ["[1,2]","[1,2,3,4]","[{\"op\":\"add\",\"path\":\"/2\",\"value\":3},{\"op\":\"add\",\"path\":\"/3\",\"value\":4}]"],
  ["{\"a/b\":1,\"m~n\":2}","{\"a/b\":3}","[{\"op\":\"replace\",\"path\":\"/a~1b\",\"value\":3},{\"op\":\"remove\",\"path\":\"/m~0n\"}]"],
  ["\"s\"","{\"k\":\"s\"}","[{\"op\":\"replace\",\"path\":\"\",\"value\":{\"k\":\"s\"}}]"],
  ["{\"k\":[1,{\"q\":1}]}","{\"k\":[2,{\"q\":2}]}","[{\"op\":\"replace\",\"path\":\"/k/0\",\"value\":2},{\"op\":\"replace\",\"path\":\"/k/1/q\",\"value\":2}]"],
  ["{\"same\":1}","{\"same\":1}","[]"],
  ["null","false","[{\"op\":\"replace\",\"path\":\"\",\"value\":false}]"],
  ["{\"Z\":3,\"a\":2,\"b\":1,\"é\":4}","{}","[{\"op\":\"remove\",\"path\":\"/Z\"},{\"op\":\"remove\",\"path\":\"/a\"},{\"op\":\"remove\",\"path\":\"/b\"},{\"op\":\"remove\",\"path\":\"/é\"}]"],
  ["[]","[[]]","[{\"op\":\"add\",\"path\":\"/0\",\"value\":[]}]"],
  ["{\"n\":[1,2,3]}","{\"n\":[3,2,1]}","[{\"op\":\"replace\",\"path\":\"/n/0\",\"value\":3},{\"op\":\"replace\",\"path\":\"/n/2\",\"value\":1}]"],
];
// [text, canonical]
const PARSE_VALID = [
  [" {\"a\" : [1, -2, 3.5e2, true, false, null, \"x\\n\\u00e9\\ud83d\\ude00\"]} ","{\"a\":[1,-2,350,true,false,null,\"x\\né😀\"]}"],
  ["\"\\u0001\\\"\\\\/\"","\"\\u0001\\\"\\\\/\""],
  ["[]","[]"],
  ["{}","{}"],
  ["-0","0"],
  ["1E+2","100"],
];

test('line diff v2 handles large inputs in linear memory', async () => {
  const { diffLines, unifiedDiff } = await load('line-diff');
  // Lines repeat, so every line also occurs in the other text and Myers does the real work.
  const aLines = Array.from({ length: 100000 }, (_, i) => `line ${i % 997}`), bLines = [...aLines];
  for (let k = 0; k < 20; k++) bLines[k * 4999 + 7] = `line ${(k * 4999 + 500) % 997}`;
  const a = aLines.join('\n') + '\n', b = bLines.join('\n') + '\n';
  const started = performance.now();
  const ops = diffLines(a, b);
  assert.ok(performance.now() - started < 10000);
  const removed = ops.filter(([op]) => op === '-').length;
  assert.equal(removed, ops.filter(([op]) => op === '+').length);
  assert.ok(removed > 0 && removed <= 20);
  assert.deepEqual(ops.filter(([op]) => op !== '+').map(([, l]) => l), aLines);
  assert.deepEqual(ops.filter(([op]) => op !== '-').map(([, l]) => l), bLines);
  assert.ok(unifiedDiff(a, b).startsWith('--- a\n+++ b\n@@ '));
});

test('line diff v2 with no common line deletes and inserts everything', async () => {
  const { diffLines } = await load('line-diff');
  const a = Array.from({ length: 3000 }, (_, i) => `a${i}\n`).join(''), b = Array.from({ length: 3000 }, (_, i) => `b${i}\n`).join('');
  const ops = diffLines(a, b).map(([op]) => op);
  assert.equal(ops.filter((op) => op === '-').length, 3000);
  assert.equal(ops.filter((op) => op === '+').length, 3000);
  assert.ok(!ops.includes('='));
});

test('portable slugify matches the shared vectors', async () => {
  const { slugify, uniqueSlug, transliterate } = await load('slugify-portable');
  for (const [text, separator, maxLength, expected] of SLUG_CASES) assert.equal(slugify(text, separator, maxLength), expected, JSON.stringify([text, separator, maxLength]));
  for (const [text, separator, maxLength] of SLUG_INVALID) assert.throws(() => slugify(text, separator, maxLength), RangeError, JSON.stringify([text, separator, maxLength]));
  assert.throws(() => slugify('x', '-', 1.5), RangeError);
  for (const [base, taken, expected] of SLUG_UNIQUE) {
    assert.equal(uniqueSlug(base, new Set(taken)), expected, base);
    assert.equal(uniqueSlug(base, (s) => taken.includes(s)), expected, base);
  }
  assert.equal(uniqueSlug('a', new Set(['a']), '_'), 'a_2');
  assert.throws(() => uniqueSlug('', new Set()), RangeError);
  const table = {};
  for (let cp = 0xc0; cp <= 0x17f; cp++) { const t = transliterate(cp); if (t !== undefined) table[String.fromCodePoint(cp)] = t; }
  assert.deepEqual(table, SLUG_TABLE);
  assert.equal(Object.keys(table).length, 190);
});

test('JSON Patch, Pointer, Merge Patch and createPatch match the shared vectors', async () => {
  const m = await load('json-patch');
  for (const [doc, patch, expected] of PATCH_APPLY) {
    const value = JSON.parse(doc);
    assert.equal(m.canonical(m.applyPatch(value, JSON.parse(patch))), expected, patch);
    assert.equal(m.canonical(value), m.canonical(JSON.parse(doc)), 'input must not change');
  }
  for (const [doc, patch] of PATCH_APPLY_INVALID) {
    const value = JSON.parse(doc);
    assert.throws(() => m.applyPatch(value, JSON.parse(patch)), m.JsonPatchError, patch);
    assert.equal(m.canonical(value), m.canonical(JSON.parse(doc)), 'a failed patch must not change the input');
  }
  for (const [doc, pointer, expected] of POINTER) assert.equal(m.canonical(m.getPointer(JSON.parse(doc), pointer)), expected, pointer);
  for (const pointer of POINTER_INVALID) assert.throws(() => m.getPointer({ foo: ['bar', 'baz'], 'm~n': 8 }, pointer), m.JsonPatchError, pointer);
  for (const [target, patch, expected] of MERGE) {
    const value = JSON.parse(target);
    assert.equal(m.canonical(m.mergePatch(value, JSON.parse(patch))), expected, patch);
    assert.equal(m.canonical(value), m.canonical(JSON.parse(target)));
  }
  for (const [a, b, expected] of CREATE) {
    const patch = m.createPatch(JSON.parse(a), JSON.parse(b));
    assert.equal(m.canonical(patch), expected, a + ' -> ' + b);
    assert.equal(m.canonical(m.applyPatch(JSON.parse(a), patch)), m.canonical(JSON.parse(b)), a + ' -> ' + b);
  }
  for (const [text, expected] of PARSE_VALID) assert.equal(m.canonical(JSON.parse(text)), expected, text);
});

test('JSON Patch keeps __proto__ as a member and orders keys by code point', async () => {
  const m = await load('json-patch');
  const doc = m.applyPatch({}, [{ op: 'add', path: '/__proto__', value: { polluted: true } }]);
  assert.equal(m.canonical(doc), '{"__proto__":{"polluted":true}}');
  assert.equal({}.polluted, undefined);
  assert.equal(m.canonical({ '\u{1F600}': 1, '\uFF61': 2, b: [1.5, -0, 1e21] }), '{"b":[1.5,0,1000000000000000000000],"\uFF61":2,"\u{1F600}":1}');
  assert.equal(m.canonical('\u001f\b"/é'), '"\\u001f\\b\\"/é"');
  assert.ok(m.jsonEqual({ a: 1, b: [true] }, { b: [true], a: 1.0 }));
  assert.ok(!m.jsonEqual(true, 1));
  assert.throws(() => m.canonical(Number.NaN), m.JsonPatchError);
  assert.throws(() => m.applyPatch({}, { op: 'add', path: '/a', value: 1 }), m.JsonPatchError);
});

test('agent-recipes find routes wave 8 phrasings to the new recipes', () => {
  assert.equal(findTop('json', 'patch'), 'json-patch');
  assert.equal(findTop('rfc', '6902'), 'json-patch');
  assert.equal(findTop('merge', 'patch'), 'json-patch');
  assert.equal(findTop('json', 'pointer'), 'json-patch');
  assert.equal(findTop('json', 'diff'), 'json-patch');
  assert.equal(findTop('slugify'), 'slugify');
  assert.equal(findTop('permalink'), 'slugify');
  assert.equal(findTop('gnu', 'diff'), 'unified-line-diff');
  // existing recipes keep their routes
  assert.equal(findTop('url', 'slug'), 'slugify-and-unique-slug');
  assert.equal(findTop('deep', 'merge'), 'deep-merge-and-pick-omit');
  assert.equal(findTop('unified', 'diff'), 'unified-line-diff');
});
