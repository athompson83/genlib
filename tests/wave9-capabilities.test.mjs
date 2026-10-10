// SPDX-License-Identifier: Apache-2.0
// Vector tests for the wave 9 TypeScript recipes: server-sent events, text chunking, vector math, circuit
// breaker, business days, natural sort, file signatures and color conversion. Every vector is generated from
// the shared wave 9 vector set used by every language; do not edit the literals by hand.
// Compiled with the same generated-tsconfig approach and strict flags as tests/wave8-capabilities.test.mjs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const recipeDir = join(root, 'examples/recipes');
const names = ['sse', 'text-chunking', 'vector-math', 'circuit-breaker', 'business-days', 'natural-sort', 'file-signature', 'color-convert'];
const out = mkdtempSync(join(tmpdir(), 'genlib-wave9-'));
after(() => rmSync(out, { recursive: true, force: true }));
const compilerOptions = {
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitReturns: true,
  noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true,
  target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  rootDir: recipeDir, outDir: out,
};
const project = join(out, 'tsconfig.wave9.json');
writeFileSync(project, JSON.stringify({ compilerOptions, files: names.map((n) => join(recipeDir, `${n}.ts`)) }));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'pipe' });
writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);
const findTop = (...words) => JSON.parse(execFileSync(process.execPath, ['tools/agent-recipes.mjs', 'find', ...words], { cwd: root, encoding: 'utf8' })).matches[0]?.id;
const near = (got, want, eps, label) => assert.ok(Math.abs(got - want) <= eps, `${label}: ${got} vs ${want}`);
const nearAll = (got, want, eps, label) => {
  assert.equal(got.length, want.length, label);
  got.forEach((g, i) => near(g, want[i], eps, label));
};
const bytes = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

// [text, events, final retry]
const SSE_PARSE = [
  ["data: YHOO\ndata: +2\ndata: 10\n\n", [{"event": "message", "data": "YHOO\n+2\n10", "id": ""}], null],
  [": test stream\n\ndata: first event\nid: 1\n\ndata:second event\nid\n\ndata:  third event\n", [{"event": "message", "data": "first event", "id": "1"}, {"event": "message", "data": "second event", "id": ""}], null],
  ["data\n\ndata\ndata\n\ndata:", [{"event": "message", "data": "", "id": ""}, {"event": "message", "data": "\n", "id": ""}], null],
  ["data:test\n\ndata: test\n\n", [{"event": "message", "data": "test", "id": ""}, {"event": "message", "data": "test", "id": ""}], null],
  ["event: add\ndata: 73857293\n\nevent: remove\ndata: 2153\n\nevent: add\ndata: 113411\n\n", [{"event": "add", "data": "73857293", "id": ""}, {"event": "remove", "data": "2153", "id": ""}, {"event": "add", "data": "113411", "id": ""}], null],
  ["﻿data: bom\n\n", [{"event": "message", "data": "bom", "id": ""}], null],
  ["data: a\r\ndata: b\r\rdata: c\n\n", [{"event": "message", "data": "a\nb", "id": ""}, {"event": "message", "data": "c", "id": ""}], null],
  ["id: 7\ndata: x\n\ndata: y\n\nid\ndata: z\n\n", [{"event": "message", "data": "x", "id": "7"}, {"event": "message", "data": "y", "id": "7"}, {"event": "message", "data": "z", "id": ""}], null],
  ["id: a\u0000b\ndata: nul\n\n", [{"event": "message", "data": "nul", "id": ""}], null],
  ["retry: 1500\ndata: r\n\nretry: x\ndata: s\n\n", [{"event": "message", "data": "r", "id": ""}, {"event": "message", "data": "s", "id": ""}], 1500],
  ["event\ndata: e\n\n", [{"event": "message", "data": "e", "id": ""}], null],
  ["unknown: q\ndata: u\n\n", [{"event": "message", "data": "u", "id": ""}], null],
  [":\n:comment\ndata: ok\n\n", [{"event": "message", "data": "ok", "id": ""}], null],
  ["data: no blank line at end", [], null],
];

// [chunks, events]
const SSE_CHUNKED = [
  [["data: YHO", "O\ndata: +2\n", "data", ": 10\n\n"], [{"event": "message", "data": "YHOO\n+2\n10", "id": ""}]],
  [[": te", "st stream\n\ndata: first event\nid: 1\n\ndata:s", "econd event\nid\n\ndata: ", " third event\n"], [{"event": "message", "data": "first event", "id": "1"}, {"event": "message", "data": "second event", "id": ""}]],
  [["da", "ta\n\nda", "ta\ndata", "\n\ndata:"], [{"event": "message", "data": "", "id": ""}, {"event": "message", "data": "\n", "id": ""}]],
  [["data", ":t", "est\n\nd", "ata: test\n\n"], [{"event": "message", "data": "test", "id": ""}, {"event": "message", "data": "test", "id": ""}]],
  [["event: add\ndata: 73857293\n\nevent", ": remove\ndata: 21", "53\n\nevent: a", "dd\ndata: 113411\n\n"], [{"event": "add", "data": "73857293", "id": ""}, {"event": "remove", "data": "2153", "id": ""}, {"event": "add", "data": "113411", "id": ""}]],
  [["﻿d", "at", "a: bo", "m\n\n"], [{"event": "message", "data": "bom", "id": ""}]],
  [["d", "ata: a", "\r\ndata: b\r\rdata: ", "c\n\n"], [{"event": "message", "data": "a\nb", "id": ""}, {"event": "message", "data": "c", "id": ""}]],
  [["id: 7\ndata: ", "x\n\ndat", "a: y\n\nid\n", "data: z\n\n"], [{"event": "message", "data": "x", "id": "7"}, {"event": "message", "data": "y", "id": "7"}, {"event": "message", "data": "z", "id": ""}]],
  [["id:", " a\u0000", "b\ndata:", " nul\n\n"], [{"event": "message", "data": "nul", "id": ""}]],
  [["r", "etry: 15", "00\ndata: r\n\nretry: x", "\ndata: s\n\n"], [{"event": "message", "data": "r", "id": ""}, {"event": "message", "data": "s", "id": ""}]],
];

// [data, event, id, retry, expected] (null = absent)
const SSE_FORMAT = [
  ["hello", null, null, null, "data: hello\n\n"],
  ["a\nb\r\nc", "update", "42", null, "event: update\nid: 42\ndata: a\ndata: b\ndata: c\n\n"],
  ["", null, null, 3000, "retry: 3000\ndata: \n\n"],
  ["{\"x\":1}", "json", "", null, "event: json\nid: \ndata: {\"x\":1}\n\n"],
];

// [data, event, id, retry]: must throw RangeError
const SSE_FORMAT_INVALID = [
  ["x", "a\nb", null, null],
  ["x", null, "a\rb", null],
  ["x", null, "a\u0000", null],
  ["x", null, null, -1],
];

// [text, expected]
const SSE_COMMENT = [
  ["", ":\n\n"],
  ["ping", ": ping\n\n"],
];

// [text, maxChars, overlap, chunks]
const CHUNK_CASES = [
  ["First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 60, 0, ["First paragraph. It has two sentences.", "Second paragraph is a bit longer and keeps going.", "Another sentence here! And a question?\n\nThird."]],
  ["First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 40, 15, ["First paragraph. It has two sentences.", "Second paragraph is a bit longer and", "bit longer and keeps going.", "keeps going. Another sentence here!", "And a question?\n\nThird."]],
  ["First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 10, 0, ["First para", "graph. It", "has two se", "ntences.", "Second", "paragraph", "is a bit", "longer", "and keeps", "going.", "Another", "sentence", "here! And", "a question", "?\n\nThird."]],
  ["First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 10, 4, ["First para", "paragraph.", "aph. It", "It has", "has two se", "sentences.", "ces.", ".\n\nSecond", "paragraph", "is a bit", "longer", "and keeps", "going.", "Another", "sentence", "here! And", "And a ques", "question?", "on?", "n?\n\nThird."]],
  ["First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 4, 0, ["Firs", "t pa", "ragr", "aph.", "It", "has", "two", "sent", "ence", "s.", "Seco", "nd p", "arag", "raph", "is", "a", "bit", "long", "er", "and", "keep", "s go", "ing.", "Ano", "ther", "sen", "tenc", "e he", "re!", "And", "a qu", "esti", "on?", "Thi", "rd."]],
  ["First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 9, 4, ["First par", "paragraph", "raph. It", "It has", "has two s", "sentences", "nces.", "Second", "paragraph", "raph is", "is a", "a bit", "longer", "and", "keeps", "going.", "Another", "sentence", "here!", "And a que", "question?", "ion?", "?\n\nThird."]],
  ["First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 1, 0, ["F", "i", "r", "s", "t", "p", "a", "r", "a", "g", "r", "a", "p", "h", ".", "I", "t", "h", "a", "s", "t", "w", "o", "s", "e", "n", "t", "e", "n", "c", "e", "s", ".", "S", "e", "c", "o", "n", "d", "p", "a", "r", "a", "g", "r", "a", "p", "h", "i", "s", "a", "b", "i", "t", "l", "o", "n", "g", "e", "r", "a", "n", "d", "k", "e", "e", "p", "s", "g", "o", "i", "n", "g", ".", "A", "n", "o", "t", "h", "e", "r", "s", "e", "n", "t", "e", "n", "c", "e", "h", "e", "r", "e", "!", "A", "n", "d", "a", "q", "u", "e", "s", "t", "i", "o", "n", "?", "T", "h", "i", "r", "d", "."]],
  ["First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 200, 50, ["First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird."]],
  ["abcdefghij", 60, 0, ["abcdefghij"]],
  ["abcdefghij", 40, 15, ["abcdefghij"]],
  ["abcdefghij", 10, 0, ["abcdefghij"]],
  ["abcdefghij", 10, 4, ["abcdefghij"]],
  ["abcdefghij", 4, 0, ["abcd", "efgh", "ij"]],
  ["abcdefghij", 9, 4, ["abcdefghi", "fghij"]],
  ["abcdefghij", 1, 0, ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]],
  ["abcdefghij", 200, 50, ["abcdefghij"]],
  ["one two three four five", 60, 0, ["one two three four five"]],
  ["one two three four five", 40, 15, ["one two three four five"]],
  ["one two three four five", 10, 0, ["one two", "three", "four five"]],
  ["one two three four five", 10, 4, ["one two", "two three", "four five"]],
  ["one two three four five", 4, 0, ["one", "two", "thre", "e fo", "ur", "five"]],
  ["one two three four five", 9, 4, ["one two", "three", "four five"]],
  ["one two three four five", 1, 0, ["o", "n", "e", "t", "w", "o", "t", "h", "r", "e", "e", "f", "o", "u", "r", "f", "i", "v", "e"]],
  ["one two three four five", 200, 50, ["one two three four five"]],
  ["A. B. C.", 60, 0, ["A. B. C."]],
  ["A. B. C.", 40, 15, ["A. B. C."]],
  ["A. B. C.", 10, 0, ["A. B. C."]],
  ["A. B. C.", 10, 4, ["A. B. C."]],
  ["A. B. C.", 4, 0, ["A.", "B.", "C."]],
  ["A. B. C.", 9, 4, ["A. B. C."]],
  ["A. B. C.", 1, 0, ["A", ".", "B", ".", "C", "."]],
  ["A. B. C.", 200, 50, ["A. B. C."]],
  ["  \n\n  ", 60, 0, []],
  ["  \n\n  ", 40, 15, []],
  ["  \n\n  ", 10, 0, []],
  ["  \n\n  ", 10, 4, []],
  ["  \n\n  ", 4, 0, []],
  ["  \n\n  ", 9, 4, []],
  ["  \n\n  ", 1, 0, []],
  ["  \n\n  ", 200, 50, []],
  ["", 60, 0, []],
  ["", 40, 15, []],
  ["", 10, 0, []],
  ["", 10, 4, []],
  ["", 4, 0, []],
  ["", 9, 4, []],
  ["", 1, 0, []],
  ["", 200, 50, []],
  ["Line one\nLine two\nLine three\nLine four", 60, 0, ["Line one\nLine two\nLine three\nLine four"]],
  ["Line one\nLine two\nLine three\nLine four", 40, 15, ["Line one\nLine two\nLine three\nLine four"]],
  ["Line one\nLine two\nLine three\nLine four", 10, 0, ["Line one", "Line two", "Line", "three", "Line four"]],
  ["Line one\nLine two\nLine three\nLine four", 10, 4, ["Line one", "Line two", "Line", "three", "Line four"]],
  ["Line one\nLine two\nLine three\nLine four", 4, 0, ["Line", "one", "Line", "two", "Line", "thr", "ee\nL", "ine", "four"]],
  ["Line one\nLine two\nLine three\nLine four", 9, 4, ["Line one", "Line two", "Line", "three", "Line four"]],
  ["Line one\nLine two\nLine three\nLine four", 1, 0, ["L", "i", "n", "e", "o", "n", "e", "L", "i", "n", "e", "t", "w", "o", "L", "i", "n", "e", "t", "h", "r", "e", "e", "L", "i", "n", "e", "f", "o", "u", "r"]],
  ["Line one\nLine two\nLine three\nLine four", 200, 50, ["Line one\nLine two\nLine three\nLine four"]],
  ["Short.", 60, 0, ["Short."]],
  ["Short.", 40, 15, ["Short."]],
  ["Short.", 10, 0, ["Short."]],
  ["Short.", 10, 4, ["Short."]],
  ["Short.", 4, 0, ["Shor", "t."]],
  ["Short.", 9, 4, ["Short."]],
  ["Short.", 1, 0, ["S", "h", "o", "r", "t", "."]],
  ["Short.", 200, 50, ["Short."]],
  ["Café naïve résumé — 日本語のテキスト。 End.", 60, 0, ["Café naïve résumé — 日本語のテキスト。 End."]],
  ["Café naïve résumé — 日本語のテキスト。 End.", 40, 15, ["Café naïve résumé — 日本語のテキスト。 End."]],
  ["Café naïve résumé — 日本語のテキスト。 End.", 10, 0, ["Café", "naïve", "résumé —", "日本語のテキスト。", "End."]],
  ["Café naïve résumé — 日本語のテキスト。 End.", 10, 4, ["Café", "naïve", "résumé —", "日本語のテキスト。", "End."]],
  ["Café naïve résumé — 日本語のテキスト。 End.", 4, 0, ["Café", "naï", "ve r", "ésum", "é —", "日本語の", "テキスト", "。", "End."]],
  ["Café naïve résumé — 日本語のテキスト。 End.", 9, 4, ["Café", "naïve", "résumé —", "— 日本語のテキス", "のテキスト。", "スト。 End."]],
  ["Café naïve résumé — 日本語のテキスト。 End.", 1, 0, ["C", "a", "f", "é", "n", "a", "ï", "v", "e", "r", "é", "s", "u", "m", "é", "—", "日", "本", "語", "の", "テ", "キ", "ス", "ト", "。", "E", "n", "d", "."]],
  ["Café naïve résumé — 日本語のテキスト。 End.", 200, 50, ["Café naïve résumé — 日本語のテキスト。 End."]],
  ["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 60, 0, ["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"]],
  ["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 40, 15, ["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"]],
  ["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 10, 0, ["xxxxxxxxxx", "xxxxxxxxxx", "xxxxx", "yyyyy"]],
  ["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 10, 4, ["xxxxxxxxxx", "xxxxxxxxxx", "xxxxxxxxxx", "xxxxxxx", "xxx yyyyy"]],
  ["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 4, 0, ["xxxx", "xxxx", "xxxx", "xxxx", "xxxx", "xxxx", "x yy", "yyy"]],
  ["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 9, 4, ["xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxx", "xxx yyyyy"]],
  ["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 1, 0, ["x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "y", "y", "y", "y", "y"]],
  ["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 200, 50, ["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"]],
  ["Mr. Smith went. Then? Yes! Done.", 60, 0, ["Mr. Smith went. Then? Yes! Done."]],
  ["Mr. Smith went. Then? Yes! Done.", 40, 15, ["Mr. Smith went. Then? Yes! Done."]],
  ["Mr. Smith went. Then? Yes! Done.", 10, 0, ["Mr. Smith", "went.", "Then?", "Yes! Done."]],
  ["Mr. Smith went. Then? Yes! Done.", 10, 4, ["Mr. Smith", "went.", "Then?", "Yes! Done."]],
  ["Mr. Smith went. Then? Yes! Done.", 4, 0, ["Mr.", "Smit", "h we", "nt.", "Then", "? Ye", "s! D", "one."]],
  ["Mr. Smith went. Then? Yes! Done.", 9, 4, ["Mr.", "Smith", "went.", "Then?", "Yes!", "Done."]],
  ["Mr. Smith went. Then? Yes! Done.", 1, 0, ["M", "r", ".", "S", "m", "i", "t", "h", "w", "e", "n", "t", ".", "T", "h", "e", "n", "?", "Y", "e", "s", "!", "D", "o", "n", "e", "."]],
  ["Mr. Smith went. Then? Yes! Done.", 200, 50, ["Mr. Smith went. Then? Yes! Done."]],
];

// [text, maxChars, overlap]: must throw RangeError
const CHUNK_INVALID = [
  ["x", 0, 0],
  ["x", 5, 5],
  ["x", 5, -1],
  ["x", -3, 0],
];

// [a, b, dot, cosine]
const VM_PAIRS = [
  [[1, 2, 3], [4, 5, 6], 32, 0.9746318461970762],
  [[1, 0], [0, 1], 0, 0.0],
  [[1, 1], [-1, -1], -2, -0.9999999999999998],
  [[0, 0], [1, 2], 0, 0.0],
  [[3, 4], [3, 4], 25, 1.0],
  [[0.5, -1.5, 2], [2, 0.25, -1], -1.375, -0.23969749850222494],
];

// [a, norm]
const VM_NORM = [
  [[3, 4], 5.0],
  [[0, 0, 0], 0.0],
  [[1, 1, 1, 1], 2.0],
  [[-2.5], 2.5],
];

// [a, normalized]
const VM_NORMALIZE = [
  [[3, 4], [0.6, 0.8]],
  [[0, 5], [0.0, 1.0]],
  [[1, 1, 1, 1], [0.5, 0.5, 0.5, 0.5]],
];

// [query, vectors, k, [[index, score], ...]]
const VM_TOPK = [
  [[1, 0], [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]], 0, []],
  [[1, 0], [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]], 1, [[0, 1.0]]],
  [[1, 0], [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]], 3, [[0, 1.0], [1, 0.9949371890224981], [3, 0.7071067811865476]]],
  [[1, 0], [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]], 10, [[0, 1.0], [1, 0.9949371890224981], [3, 0.7071067811865476], [2, 0.0], [4, -1.0]]],
  [[0.2, 0.5, 0.1], [[0.1, 0.4, 0.2], [0.9, 0.1, 0.0], [0.2, 0.5, 0.1], [0.0, 0.0, 1.0], [0.3, 0.3, 0.3], [0.21, 0.49, 0.12]], 3, [[2, 1.0], [5, 0.9990003934498585], [0, 0.956182887467515]]],
];

// [query, vectors, k, lambda, indices]
const VM_MMR = [
  [[1, 0], [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]], 3, 0.5, [0, 1, 4]],
  [[1, 0], [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]], 3, 1.0, [0, 1, 3]],
  [[1, 0], [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]], 3, 0.0, [0, 4, 2]],
  [[1, 0], [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]], 5, 0.7, [0, 1, 3, 2, 4]],
  [[0.2, 0.5, 0.1], [[0.1, 0.4, 0.2], [0.9, 0.1, 0.0], [0.2, 0.5, 0.1], [0.0, 0.0, 1.0], [0.3, 0.3, 0.3], [0.21, 0.49, 0.12]], 3, 0.5, [2, 0, 1]],
  [[0.2, 0.5, 0.1], [[0.1, 0.4, 0.2], [0.9, 0.1, 0.0], [0.2, 0.5, 0.1], [0.0, 0.0, 1.0], [0.3, 0.3, 0.3], [0.21, 0.49, 0.12]], 4, 0.3, [2, 3, 1, 4]],
];

// [[threshold, cooldownMs, halfOpenMax], [[op, now, expected], ...]]
const CB_SCRIPTS = [
  [[2, 1000, 1], [["allow", 0, true], ["failure", 0, null], ["state", 0, "closed"], ["failure", 10, null], ["state", 10, "open"], ["allow", 500, false], ["retry_after", 500, 510], ["state", 1010, "half_open"], ["allow", 1010, true], ["allow", 1011, false], ["success", 1020, null], ["state", 1020, "closed"], ["allow", 1021, true]]],
  [[3, 500, 2], [["failure", 0, null], ["success", 1, null], ["failure", 2, null], ["failure", 3, null], ["state", 3, "closed"], ["failure", 4, null], ["state", 4, "open"], ["state", 503, "open"], ["allow", 504, true], ["allow", 505, true], ["allow", 506, false], ["failure", 507, null], ["state", 507, "open"], ["retry_after", 600, 407], ["state", 1007, "half_open"], ["allow", 1008, true], ["success", 1009, null], ["state", 1009, "closed"]]],
  [[1, 0, 1], [["failure", 5, null], ["state", 5, "half_open"], ["allow", 5, true], ["allow", 5, false], ["failure", 6, null], ["state", 6, "half_open"], ["allow", 6, true]]],
];

// [threshold, cooldownMs, halfOpenMax]: must throw RangeError
const CB_INVALID = [
  [0, 1000, 1],
  [1, -1, 1],
  [1, 1000, 0],
];

// [date, holidays, weekend, expected]
const BD_IS = [
  ["2026-10-10", [], ["SA", "SU"], false],
  ["2026-10-12", [], ["SA", "SU"], true],
  ["2026-12-25", ["2026-12-25", "2026-12-28", "2027-01-01"], ["SA", "SU"], false],
  ["2026-10-16", [], ["FR", "SA"], false],
];

// [date, n, holidays, weekend, expected]
const BD_ADD = [
  ["2026-10-09", 1, [], ["SA", "SU"], "2026-10-12"],
  ["2026-10-12", -1, [], ["SA", "SU"], "2026-10-09"],
  ["2026-10-10", 0, [], ["SA", "SU"], "2026-10-12"],
  ["2026-10-12", 0, [], ["SA", "SU"], "2026-10-12"],
  ["2026-12-23", 3, ["2026-12-25", "2026-12-28", "2027-01-01"], ["SA", "SU"], "2026-12-30"],
  ["2026-12-31", -5, ["2026-12-25", "2026-12-28", "2027-01-01"], ["SA", "SU"], "2026-12-22"],
  ["2028-02-28", 1, [], ["SA", "SU"], "2028-02-29"],
  ["2026-10-14", 10, [], ["FR", "SA"], "2026-10-28"],
  ["2026-01-01", 260, [], ["SA", "SU"], "2026-12-31"],
  ["2026-10-11", 0, [], [], "2026-10-11"],
];

// [start, end, holidays, weekend, expected]
const BD_BETWEEN = [
  ["2026-10-01", "2026-11-01", ["2026-10-12"], ["SA", "SU"], 21],
  ["2026-11-01", "2026-10-01", [], ["SA", "SU"], -22],
  ["2026-10-12", "2026-10-12", [], ["SA", "SU"], 0],
  ["2026-12-21", "2027-01-04", ["2026-12-25", "2026-12-28", "2027-01-01"], ["SA", "SU"], 7],
  ["2026-01-01", "2027-01-01", [], ["SA", "SU"], 261],
  ["2026-10-01", "2026-10-31", [], ["FR", "SA"], 21],
  ["2026-10-10", "2026-10-12", ["2026-10-11"], ["SA", "SU"], 0],
];

// [date, n]: addBusinessDays must throw RangeError
const BD_INVALID = [
  ["2026-02-30", 1],
  ["2026-1-01", 1],
  ["2026-01-01", 100001],
];

// [items, sorted]
const NS_SORTED = [
  [["file10.txt", "file2.txt", "File1.txt", "file1.txt", "file01.txt", "a", "A", "b", "10", "9", "x2y10", "x2y9", "x02y1", "", "file1"], ["", "9", "10", "A", "a", "b", "file1", "File1.txt", "file1.txt", "file01.txt", "file2.txt", "file10.txt", "x02y1", "x2y9", "x2y10"]],
  [["v1.10.0", "v1.2.0", "v1.9.9", "v10.0", "v1.2.10"], ["v1.2.0", "v1.2.10", "v1.9.9", "v1.10.0", "v10.0"]],
  [["img12.png", "img10.png", "IMG2.png", "img1.png"], ["img1.png", "IMG2.png", "img10.png", "img12.png"]],
  [["a0", "a00", "a000", "a", "a1", "a01"], ["a", "a0", "a00", "a000", "a1", "a01"]],
  [["Ä", "Z", "a", "z", "_x", "1x"], ["1x", "_x", "a", "Z", "z", "Ä"]],
];

// [a, b, expected]
const NS_COMPARE = [
  ["a2", "a10", -1],
  ["a10", "a2", 1],
  ["abc", "ABC", 1],
  ["x01", "x1", 1],
  ["x1", "x1", 0],
  ["", "a", -1],
  ["a", "1", 1],
  ["99999999999999999999", "100000000000000000000", -1],
];

// [name, hex bytes, [mime, extension] | null]
const FS_DETECT = [
  ["png", "89504e470d0a1a0a0000000d49484452", ["image/png", "png"]],
  ["jpg", "ffd8ffe000104a464946", ["image/jpeg", "jpg"]],
  ["gif", "4749463839610100", ["image/gif", "gif"]],
  ["webp", "52494646240000005745425056503820", ["image/webp", "webp"]],
  ["wav", "524946462400000057415645666d7420", ["audio/wav", "wav"]],
  ["avi", "5249464624000000415649204c495354", ["video/x-msvideo", "avi"]],
  ["bmp", "424d0000000000000000000000000000", ["image/bmp", "bmp"]],
  ["ico", "000001000100", ["image/x-icon", "ico"]],
  ["tif", "49492a000800", ["image/tiff", "tif"]],
  ["tif-be", "4d4d002a0008", ["image/tiff", "tif"]],
  ["pdf", "255044462d312e370a", ["application/pdf", "pdf"]],
  ["zip", "504b03041400", ["application/zip", "zip"]],
  ["zip-empty", "504b0506000000000000000000000000000000000000", ["application/zip", "zip"]],
  ["gz", "1f8b0800", ["application/gzip", "gz"]],
  ["7z", "377abcaf271c0004", ["application/x-7z-compressed", "7z"]],
  ["rar", "526172211a070100", ["application/vnd.rar", "rar"]],
  ["sqlite", "53514c69746520666f726d61742033001000", ["application/vnd.sqlite3", "sqlite"]],
  ["wasm", "0061736d01000000", ["application/wasm", "wasm"]],
  ["ogg", "4f6767530002", ["audio/ogg", "ogg"]],
  ["flac", "664c614300000022", ["audio/flac", "flac"]],
  ["mp3-id3", "494433040000", ["audio/mpeg", "mp3"]],
  ["mp3-frame", "fffb9064", ["audio/mpeg", "mp3"]],
  ["webm", "1a45dfa39f4286", ["video/webm", "webm"]],
  ["mp4", "000000206674797069736f6d00000200", ["video/mp4", "mp4"]],
  ["mov", "00000014667479707174202000000000", ["video/quicktime", "mov"]],
  ["heic", "00000018667479706865696300000000", ["image/heic", "heic"]],
  ["avif", "0000001c667479706176696600000000", ["image/avif", "avif"]],
  ["m4a", "00000020667479704d34412000000000", ["audio/mp4", "m4a"]],
  ["woff", "774f464600010000", ["font/woff", "woff"]],
  ["woff2", "774f463200010000", ["font/woff2", "woff2"]],
  ["text", "68656c6c6f20776f726c64", null],
  ["empty", "", null],
  ["short-png", "89504e47", null],
  ["bm-short", "424d0000", null],
  ["ff-not-mp3", "ffe10000", null],
  ["html", "3c21444f43545950452068746d6c3e", null],
];

// [hex bytes, filename, expected]
const FS_EXTENSION = [
  ["89504e470d0a1a0a0000000d49484452", "a.png", true],
  ["89504e470d0a1a0a0000000d49484452", "a.PNG", true],
  ["89504e470d0a1a0a0000000d49484452", "a.jpg", false],
  ["ffd8ffe000104a464946", "photo.jpeg", true],
  ["504b03041400", "report.docx", true],
  ["504b03041400", "x.xlsx", true],
  ["255044462d312e370a", "x.pdf.exe", false],
  ["00000018667479706865696300000000", "IMG_1.HEIF", true],
  ["68656c6c6f20776f726c64", "a.txt", false],
  ["89504e470d0a1a0a0000000d49484452", "noext", false],
  ["49492a000800", "scan.tiff", true],
  ["494433040000", "song.mp3", true],
  ["1f8b0800", "a.tar.gz", true],
];

// [text, [r, g, b, a], toHex(parseHex(text))]
const COLOR_HEX = [
  ["#000", [0.0, 0.0, 0.0, 1.0], "#000000"],
  ["#fff", [1.0, 1.0, 1.0, 1.0], "#ffffff"],
  ["#f00", [1.0, 0.0, 0.0, 1.0], "#ff0000"],
  ["#0f8", [0.0, 1.0, 0.5333333333333333, 1.0], "#00ff88"],
  ["#336699", [0.2, 0.4, 0.6, 1.0], "#336699"],
  ["#336699cc", [0.2, 0.4, 0.6, 0.8], "#336699cc"],
  ["#ABCDEF", [0.6705882352941176, 0.803921568627451, 0.9372549019607843, 1.0], "#abcdef"],
  ["#12345678", [0.07058823529411765, 0.20392156862745098, 0.33725490196078434, 0.47058823529411764], "#12345678"],
  ["#7f7f7f", [0.4980392156862745, 0.4980392156862745, 0.4980392156862745, 1.0], "#7f7f7f"],
  ["#808080", [0.5019607843137255, 0.5019607843137255, 0.5019607843137255, 1.0], "#808080"],
];

// must throw RangeError
const COLOR_HEX_INVALID = ["336699", "#12", "#12345", "#1234567", "#ggg", "#", "rgb(1,2,3)", "#3366999"];

// [channels, expected]
const COLOR_TO_HEX = [
  [[0.5, 0.5, 0.5], "#808080"],
  [[1.2, -0.1, 0.5], "#ff0080"],
  [[0.001, 0.999, 0.5], "#00ff80"],
  [[0.2, 0.4, 0.6, 0.5], "#33669980"],
  [[0.2, 0.4, 0.6, 1.0], "#336699"],
  [[0.00196078431372549, 0.0058823529411764705, 0.00980392156862745], "#010203"],
];

// [hex, [h, s, l]]
const COLOR_HSL = [
  ["#000", [0.0, 0.0, 0.0]],
  ["#fff", [0.0, 0.0, 1.0]],
  ["#f00", [0.0, 1.0, 0.5]],
  ["#0f0", [120.0, 1.0, 0.5]],
  ["#00f", [240.0, 1.0, 0.5]],
  ["#336699", [210.0, 0.49999999999999994, 0.4]],
  ["#ff8000", [30.11764705882353, 1.0, 0.5]],
  ["#808080", [0.0, 0.0, 0.5019607843137255]],
  ["#c0ffee", [163.80952380952382, 1.0, 0.8764705882352941]],
];

// [[h, s, l], [r, g, b]]
const COLOR_HSL_TO_RGB = [
  [[0, 1, 0.5], [1.0, 0.0, 0.0]],
  [[120, 1, 0.5], [0.0, 1.0, 0.0]],
  [[240, 1, 0.5], [0.0, 0.0, 1.0]],
  [[210, 0.5, 0.4], [0.2, 0.4, 0.6000000000000001]],
  [[360, 1, 0.5], [1.0, 0.0, 0.0]],
  [[-30, 1, 0.5], [1.0, 0.0, 0.5]],
  [[90, 0, 0.3], [0.3, 0.3, 0.3]],
  [[30, 1, 0.75], [1.0, 0.75, 0.5]],
];

// [hex, [L, C, h]]
const COLOR_OKLCH = [
  ["#000", [0.0, 0.0, 0.0]],
  ["#fff", [0.9999999934735462, 3.727399553519285e-08, 0.0]],
  ["#f00", [0.6279553606145516, 0.2576833077361567, 29.233885192342633]],
  ["#0f0", [0.8664396115356694, 0.2948272403370166, 142.49533888780996]],
  ["#00f", [0.4520137183853429, 0.31321437166460114, 264.052020638055]],
  ["#336699", [0.49931445292373877, 0.09866435965710138, 250.43305370947127]],
  ["#808080", [0.5998708017071177, 2.2359581629199253e-08, 0.0]],
  ["#ff8000", [0.7318948427227374, 0.1858032156306402, 52.984679593971286]],
];

// [[L, C, h], [r, g, b]]
const COLOR_OKLCH_TO_RGB = [
  [[0.627955, 0.257683, 29.2339], [0.9999989995226538, 2.4989239385060646e-06, -3.5938127559420605e-08]],
  [[0.7, 0.1, 200], [0.25183094033414793, 0.6942495954401551, 0.7170636897415913]],
  [[0.5, 0.4, 150], [-2.5595884674002214, 0.5687880047974224, -0.8622713129274896]],
  [[1, 0, 0], [0.9999999999999999, 0.9999999999999999, 0.9999999999999999]],
  [[0, 0, 0], [0.0, 0.0, 0.0]],
];

// [[r, g, b], expected]
const COLOR_IN_GAMUT = [
  [[0.25183094033414793, 0.6942495954401551, 0.7170636897415913], true],
  [[-2.5595884674002214, 0.5687880047974224, -0.8622713129274896], false],
];

test('server-sent events parse, chunk and format like the shared vectors', async () => {
  const { SseParser, parseSse, formatSse, formatComment } = await load('sse');
  for (const [text, events, retry] of SSE_PARSE) {
    assert.deepEqual(parseSse(text), events, JSON.stringify(text));
    const parser = new SseParser();
    parser.feed(text);
    assert.equal(parser.retry, retry, JSON.stringify(text));
  }
  for (const [chunks, events] of SSE_CHUNKED) {
    const parser = new SseParser();
    assert.deepEqual(chunks.flatMap((c) => parser.feed(c)), events, JSON.stringify(chunks));
  }
  const split = new SseParser();
  assert.deepEqual(split.feed('data: a\r'), []);
  assert.deepEqual(split.feed('\n\r\n'), [{ event: 'message', data: 'a', id: '' }]);
  assert.deepEqual(split.feed('﻿data: b\n\n'), [], 'only a BOM at the very start of the stream is dropped');
  for (const [data, event, id, retry, expected] of SSE_FORMAT) {
    assert.equal(formatSse(data, event, id, retry), expected);
    assert.equal(parseSse(expected)[0].data, data.replace(/\r\n|\r/g, '\n'));
  }
  assert.equal(formatSse('x', undefined, undefined, 5), 'retry: 5\ndata: x\n\n');
  for (const [data, event, id, retry] of SSE_FORMAT_INVALID) assert.throws(() => formatSse(data, event, id, retry), RangeError, JSON.stringify([event, id, retry]));
  for (const [text, expected] of SSE_COMMENT) assert.equal(formatComment(text), expected);
  assert.equal(formatComment(), ':\n\n');
  assert.throws(() => formatComment('a\nb'), RangeError);
});

test('text chunking matches the shared vectors and counts code points', async () => {
  const { chunkText } = await load('text-chunking');
  for (const [text, max, overlap, expected] of CHUNK_CASES) {
    const got = chunkText(text, max, overlap);
    assert.deepEqual(got, expected, JSON.stringify([text, max, overlap]));
    for (const c of got) assert.ok(c.length > 0 && Array.from(c).length <= max);
  }
  for (const [text, max, overlap] of CHUNK_INVALID) assert.throws(() => chunkText(text, max, overlap), RangeError, JSON.stringify([max, overlap]));
  assert.throws(() => chunkText('x', 1.5), RangeError);
  assert.deepEqual(chunkText('\u{1F600}'.repeat(5), 2), ['\u{1F600}\u{1F600}', '\u{1F600}\u{1F600}', '\u{1F600}']);
});

test('vector math matches the shared vectors', async () => {
  const { dot, norm, cosine, normalize, topK, mmr } = await load('vector-math');
  for (const [a, b, d, c] of VM_PAIRS) {
    near(dot(a, b), d, 1e-9, 'dot');
    near(cosine(a, b), c, 1e-9, 'cosine');
  }
  for (const [a, n] of VM_NORM) near(norm(a), n, 1e-9, 'norm');
  for (const [a, expected] of VM_NORMALIZE) nearAll(normalize(a), expected, 1e-9, 'normalize');
  nearAll(normalize(new Float32Array([3, 4])), [0.6, 0.8], 1e-9, 'typed array');
  for (const [q, vs, k, expected] of VM_TOPK) {
    const got = topK(q, vs, k);
    assert.deepEqual(got.map(([i]) => i), expected.map(([i]) => i));
    got.forEach(([, s], i) => near(s, expected[i][1], 1e-9, 'topK score'));
  }
  for (const [q, vs, k, lambda, expected] of VM_MMR) assert.deepEqual(mmr(q, vs, k, lambda), expected, JSON.stringify([k, lambda]));
  // the shared invalid cases, by description
  assert.throws(() => cosine([1, 2], [1, 2, 3]), RangeError);
  assert.throws(() => dot([], []), RangeError);
  assert.throws(() => normalize([0, 0]), RangeError);
  assert.throws(() => topK([1], [[1]], -1), RangeError);
  assert.throws(() => mmr([1], [[1]], 1, 1.5), RangeError);
});

test('circuit breaker scripts match the shared vectors', async () => {
  const { CircuitBreaker } = await load('circuit-breaker');
  for (const [config, steps] of CB_SCRIPTS) {
    const breaker = new CircuitBreaker(...config);
    for (const [op, now, expected] of steps) {
      const got = op === 'allow' ? breaker.allow(now) : op === 'success' ? breaker.recordSuccess(now) : op === 'failure' ? breaker.recordFailure(now)
        : op === 'state' ? breaker.state(now) : breaker.retryAfterMs(now);
      assert.equal(got ?? null, expected, JSON.stringify([config, op, now]));
    }
  }
  for (const config of CB_INVALID) assert.throws(() => new CircuitBreaker(...config), RangeError, JSON.stringify(config));
  const defaults = new CircuitBreaker();
  for (let t = 0; t < 5; t++) defaults.recordFailure(t);
  assert.equal(defaults.retryAfterMs(4), 30000);
});

test('business days match the shared vectors', async () => {
  const { isBusinessDay, addBusinessDays, businessDaysBetween } = await load('business-days');
  for (const [date, holidays, weekend, expected] of BD_IS) assert.equal(isBusinessDay(date, holidays, weekend), expected, date);
  for (const [date, n, holidays, weekend, expected] of BD_ADD) assert.equal(addBusinessDays(date, n, holidays, weekend), expected, `${date} ${n}`);
  for (const [start, end, holidays, weekend, expected] of BD_BETWEEN) assert.equal(businessDaysBetween(start, end, holidays, weekend), expected, `${start} ${end}`);
  for (const [date, n] of BD_INVALID) assert.throws(() => addBusinessDays(date, n), RangeError, `${date} ${n}`);
  assert.throws(() => isBusinessDay('2026-10-10', [], ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']), RangeError);
  assert.throws(() => isBusinessDay('2026-10-10', [], ['XX']), RangeError);
  assert.throws(() => businessDaysBetween('2026-10-10', '2026-13-01'), RangeError);
  assert.ok(Object.is(businessDaysBetween('2026-10-12', '2026-10-10'), 0), 'no negative zero');
});

test('natural sort matches the shared vectors and compares by code point', async () => {
  const { naturalCompare, naturalSort } = await load('natural-sort');
  for (const [items, expected] of NS_SORTED) {
    const copy = [...items];
    assert.deepEqual(naturalSort(items), expected);
    assert.deepEqual(items, copy, 'input must not change');
  }
  for (const [a, b, expected] of NS_COMPARE) {
    assert.equal(naturalCompare(a, b), expected, `${a} ${b}`);
    assert.equal(naturalCompare(b, a), -expected || 0, `${b} ${a}`);
  }
  assert.equal(naturalCompare('｡', '\u{1F600}'), -1, 'U+FF61 sorts before U+1F600 by code point, unlike UTF-16 units');
});

test('file signatures match the shared vectors', async () => {
  const { detectFileType, matchesExtension } = await load('file-signature');
  for (const [name, hex, expected] of FS_DETECT) {
    const got = detectFileType(bytes(hex));
    assert.deepEqual(got && [got.mime, got.extension], expected, name);
  }
  for (const [hex, filename, expected] of FS_EXTENSION) assert.equal(matchesExtension(bytes(hex), filename), expected, filename);
  assert.equal(detectFileType(new Uint8Array([...new Uint8Array(64), 0x25, 0x50, 0x44, 0x46, 0x2d])), null, 'reads only 64 bytes');
  assert.deepEqual(detectFileType([0x25, 0x50, 0x44, 0x46, 0x2d]), { mime: 'application/pdf', extension: 'pdf' });
});

test('color conversions match the shared vectors', async () => {
  const c = await load('color-convert');
  for (const [text, rgba, canonical] of COLOR_HEX) {
    nearAll(c.parseHex(text), rgba, 1e-6, text);
    assert.equal(c.toHex(...c.parseHex(text)), canonical);
  }
  for (const text of COLOR_HEX_INVALID) assert.throws(() => c.parseHex(text), RangeError, text);
  for (const [channels, expected] of COLOR_TO_HEX) assert.equal(c.toHex(...channels), expected);
  for (const [hex, expected] of COLOR_HSL) nearAll(c.rgbToHsl(...c.parseHex(hex).slice(0, 3)), expected, 1e-6, hex);
  for (const [hsl, expected] of COLOR_HSL_TO_RGB) nearAll(c.hslToRgb(...hsl), expected, 1e-6, JSON.stringify(hsl));
  for (const [hex, expected] of COLOR_OKLCH) nearAll(c.rgbToOklch(...c.parseHex(hex).slice(0, 3)), expected, 1e-6, hex);
  for (const [lch, expected] of COLOR_OKLCH_TO_RGB) nearAll(c.oklchToRgb(...lch), expected, 1e-6, JSON.stringify(lch));
  for (const [rgb, expected] of COLOR_IN_GAMUT) assert.equal(c.inGamut(...rgb), expected);
});

test('agent-recipes find routes wave 9 phrasings to the new recipes', () => {
  assert.equal(findTop('server', 'sent', 'events'), 'sse-stream');
  assert.equal(findTop('eventsource'), 'sse-stream');
  assert.equal(findTop('chunk', 'text'), 'text-chunking');
  assert.equal(findTop('rag', 'splitter'), 'text-chunking');
  assert.equal(findTop('cosine', 'embeddings'), 'vector-math');
  assert.equal(findTop('maximal', 'marginal', 'relevance'), 'vector-math');
  assert.equal(findTop('circuit', 'breaker'), 'circuit-breaker');
  assert.equal(findTop('working', 'day', 'calculator'), 'business-days');
  assert.equal(findTop('natural', 'sort'), 'natural-sort');
  assert.equal(findTop('magic', 'bytes'), 'file-signature');
  assert.equal(findTop('sniff', 'file', 'type'), 'file-signature');
  assert.equal(findTop('hex', 'to', 'rgb'), 'color-convert');
  assert.equal(findTop('oklch'), 'color-convert');
  // existing recipes keep their routes
  assert.equal(findTop('business', 'days'), 'date-ranges-and-business-days');
  assert.equal(findTop('upload', 'file'), 'upload-preflight');
  assert.equal(findTop('contrast', 'wcag'), 'color-contrast-wcag');
  assert.equal(findTop('retry', 'backoff'), 'retry-backoff');
  assert.equal(findTop('event', 'emitter'), 'event-emitter-typed');
});
