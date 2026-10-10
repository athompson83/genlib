// SPDX-License-Identifier: Apache-2.0
// Vector tests for the wave 7 TypeScript recipes: base encodings, vCard export, non-cryptographic hashing,
// feature-flag evaluation, human-readable units, unified line diff, NIST password policy and text
// sanitizing. Every vector is copied from the shared wave 7 vector set used by every language (hex strings
// are byte inputs; 64-bit integers are written as decimal strings and compared as BigInt). Compiled with
// the same generated-tsconfig approach and strict flags as tests/wave6-capabilities.test.mjs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const recipeDir = join(root, 'examples/recipes');
const names = ['base-encodings', 'vcard', 'hashing', 'feature-flags', 'human-units', 'line-diff', 'nist-password-policy', 'text-sanitize'];
const out = mkdtempSync(join(tmpdir(), 'genlib-wave7-'));
after(() => rmSync(out, { recursive: true, force: true }));
const compilerOptions = {
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitReturns: true,
  noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true,
  target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  rootDir: recipeDir, outDir: out,
};
const project = join(out, 'tsconfig.wave7.json');
writeFileSync(project, JSON.stringify({ compilerOptions, files: names.map((n) => join(recipeDir, `${n}.ts`)) }));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'pipe' });
writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);
const findTop = (...words) => JSON.parse(execFileSync(process.execPath, ['tools/agent-recipes.mjs', 'find', ...words], { cwd: root, encoding: 'utf8' })).matches[0]?.id;
const hex = (h) => Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16));
const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

// [hex input, rfc4648 padded, hex alphabet padded, rfc4648 unpadded]
const BASE32 = [
  ["", "", "", ""],
  ["66", "MY======", "CO======", "MY"],
  ["666f", "MZXQ====", "CPNG====", "MZXQ"],
  ["666f6f", "MZXW6===", "CPNMU===", "MZXW6"],
  ["666f6f62", "MZXW6YQ=", "CPNMUOG=", "MZXW6YQ"],
  ["666f6f6261", "MZXW6YTB", "CPNMUOJ1", "MZXW6YTB"],
  ["666f6f626172", "MZXW6YTBOI======", "CPNMUOJ1E8======", "MZXW6YTBOI"],
];
const BASE32_CASE_INSENSITIVE = [
  ["mzxw6ytboi======", "666f6f626172"],
];
// [text, padding]: decoding must fail
const BASE32_INVALID = [
  ["MZXW6YT", true],
  ["MZXW6YR=", true],
  ["MZ======", true],
  ["MZXW6YTB1=======", true],
  ["MZXR====", true],
  ["MZXW6===", false],
];
const BASE58 = [
  ["", ""],
  ["48656c6c6f20576f726c6421", "2NEpo7TZRRrLZSi2U"],
  ["0000287fb4cd", "11233QC4"],
  ["00", "1"],
  ["0000", "11"],
  ["ff", "5Q"],
  ["00eb15231dfceb60925886b67d065299925915aeb172c06647", "1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L"],
];
const BASE58_INVALID = [
  "0OIl",
  "abc0",
  "I",
];
const BASE64URL = [
  ["", ""],
  ["66", "Zg"],
  ["666f", "Zm8"],
  ["666f6f", "Zm9v"],
  ["666f6f62", "Zm9vYg"],
  ["666f6f6261", "Zm9vYmE"],
  ["666f6f626172", "Zm9vYmFy"],
  ["fbff", "-_8"],
  ["000102030405", "AAECAwQF"],
];
const BASE64URL_INVALID = [
  "Zg==",
  "Zh",
  "a",
  "+/",
  "Zm9v!",
];
const VCARD_CASES = [
  [{"fn": "Ada Lovelace", "n": {"family": "Lovelace", "given": "Ada", "prefix": "Countess"}, "org": "Analytical Engines, Ltd.", "title": "Programmer", "emails": [{"value": "ada@example.com", "type": "work"}], "phones": [{"value": "+44 20 7946 0000", "type": "cell"}], "address": {"type": "home", "street": "12 St. James's Sq", "locality": "London", "postalCode": "SW1Y 4LB", "country": "United Kingdom"}, "urls": ["https://example.com/ada"], "note": "First line\nSecond; with, punctuation \\ backslash", "uid": "urn:uuid:01a0c450-6c7b-7102-8304-05060708090a"}, "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Ada Lovelace\r\nN:Lovelace;Ada;;Countess;\r\nORG:Analytical Engines\\, Ltd.\r\nTITLE:Programmer\r\nEMAIL;TYPE=work:ada@example.com\r\nTEL;TYPE=cell:+44 20 7946 0000\r\nADR;TYPE=home:;;12 St. James's Sq;London;;SW1Y 4LB;United Kingdom\r\nURL:https://example.com/ada\r\nNOTE:First line\\nSecond\\; with\\, punctuation \\\\ backslash\r\nUID:urn:uuid:01a0c450-6c7b-7102-8304-05060708090a\r\nEND:VCARD\r\n"],
  [{"fn": "Zoë Ångström"}, "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Zoë Ångström\r\nEND:VCARD\r\n"],
  [{"fn": "Long Note", "note": "éééééééééééééééééééééééééééééééééééééééééééééééééééééééééééé"}, "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Long Note\r\nNOTE:ééééééééééééééééééééééééééééééééééé\r\n ééééééééééééééééééééééééé\r\nEND:VCARD\r\n"],
];
const VCARD_INVALID = [
  {"fn": ""},
  {"fn": "   "},
  {"fn": "A", "emails": [{"value": "not an email"}]},
  {"fn": "A", "phones": [{"value": "call me"}]},
  {"fn": "A", "urls": ["javascript:alert(1)"]},
  {"fn": "A", "emails": [{"value": "a@b.c", "type": "Work"}]},
  {"fn": "Tab\there"},
];
// [utf8 string, crc32, fnv1a32, fnv1a64 hex, murmur3_32 seed 0, murmur3_32 seed 42]
const HASH_STRINGS = [
  ["", 0, 2166136261, "cbf29ce484222325", 0, 142593372],
  ["a", 3904355907, 3826002220, "af63dc4c8601ec8c", 1009084850, 3001393763],
  ["foobar", 2666930069, 3214735720, "85944171f73967e8", 2764362941, 1018276128],
  ["123456789", 3421780262, 3146166556, "06d5573923c6cdfc", 3036607362, 3059026825],
  ["hello", 907060870, 1335831723, "a430d84680aabd0b", 613153351, 3806057185],
  ["The quick brown fox jumps over the lazy dog", 1095738169, 76545936, "f3f9b7f5e7e47110", 776992547, 880582914],
  ["héllo wörld", 354246585, 3558752674, "11824ab841812022", 2549609076, 857211688],
];
// [unsigned 64-bit key (decimal string), buckets, expected bucket]
const JUMP = [
  ["0", 1, 0],
  ["1", 10, 6],
  ["256", 1024, 520],
  ["3735928559", 100, 87],
  ["18446744073709551615", 1000, 313],
  ["12345678901234567", 7, 5],
  ["42", 2147483647, 1603940301],
];
const FLAG_CASES = [
  [{"key": "new-checkout", "rolloutPercent": 25}, "user-1", {"on": false, "reason": "excluded", "bucket": 4063, "variant": null}],
  [{"key": "new-checkout", "rolloutPercent": 25}, "user-2", {"on": true, "reason": "rollout", "bucket": 1682, "variant": null}],
  [{"key": "new-checkout", "rolloutPercent": 25}, "user-3", {"on": false, "reason": "excluded", "bucket": 9301, "variant": null}],
  [{"key": "new-checkout", "rolloutPercent": 25}, "user-42", {"on": false, "reason": "excluded", "bucket": 9926, "variant": null}],
  [{"key": "new-checkout", "rolloutPercent": 25}, "alice@example.com", {"on": false, "reason": "excluded", "bucket": 2919, "variant": null}],
  [{"key": "new-checkout", "rolloutPercent": 25, "allow": ["user-2"], "deny": ["user-1"]}, "user-1", {"on": false, "reason": "deny", "bucket": 4063, "variant": null}],
  [{"key": "new-checkout", "rolloutPercent": 25, "allow": ["user-2"], "deny": ["user-1"]}, "user-2", {"on": true, "reason": "allow", "bucket": 1682, "variant": null}],
  [{"key": "beta", "enabled": false, "allow": ["vip"]}, "vip", {"on": false, "reason": "disabled", "bucket": 3546, "variant": null}],
  [{"key": "banner", "rolloutPercent": 0}, "user-1", {"on": false, "reason": "excluded", "bucket": 6646, "variant": null}],
  [{"key": "banner", "rolloutPercent": 100}, "user-1", {"on": true, "reason": "rollout", "bucket": 6646, "variant": null}],
  [{"key": "banner", "rolloutPercent": 12.34}, "user-9", {"on": false, "reason": "excluded", "bucket": 7598, "variant": null}],
  [{"key": "pricing-test", "variants": [{"name": "control", "weight": 50}, {"name": "annual-first", "weight": 30}, {"name": "monthly-first", "weight": 20}]}, "u1", {"on": true, "reason": "rollout", "bucket": 4196, "variant": "monthly-first"}],
  [{"key": "pricing-test", "variants": [{"name": "control", "weight": 50}, {"name": "annual-first", "weight": 30}, {"name": "monthly-first", "weight": 20}]}, "u2", {"on": true, "reason": "rollout", "bucket": 7053, "variant": "control"}],
  [{"key": "pricing-test", "variants": [{"name": "control", "weight": 50}, {"name": "annual-first", "weight": 30}, {"name": "monthly-first", "weight": 20}]}, "u3", {"on": true, "reason": "rollout", "bucket": 9434, "variant": "annual-first"}],
  [{"key": "pricing-test", "variants": [{"name": "control", "weight": 50}, {"name": "annual-first", "weight": 30}, {"name": "monthly-first", "weight": 20}]}, "u4", {"on": true, "reason": "rollout", "bucket": 1339, "variant": "annual-first"}],
  [{"key": "pricing-test", "variants": [{"name": "control", "weight": 50}, {"name": "annual-first", "weight": 30}, {"name": "monthly-first", "weight": 20}]}, "u5", {"on": true, "reason": "rollout", "bucket": 3720, "variant": "annual-first"}],
  [{"key": "pricing-test", "variants": [{"name": "control", "weight": 50}, {"name": "annual-first", "weight": 30}, {"name": "monthly-first", "weight": 20}]}, "ünïcode", {"on": true, "reason": "rollout", "bucket": 9874, "variant": "control"}],
];
const FLAG_INVALID = [
  {"key": "bad key"},
  {"key": "k", "rolloutPercent": 101},
  {"key": "k", "rolloutPercent": 12.345},
  {"key": "k", "variants": [{"name": "a", "weight": 0}]},
  {"key": ""},
];
// [n (decimal string), base, decimals, expected]
const FORMAT_BYTES = [
  ["0", "si", 1, "0 B"],
  ["999", "si", 1, "999 B"],
  ["1000", "si", 1, "1 kB"],
  ["1536", "iec", 1, "1.5 KiB"],
  ["1536", "si", 1, "1.5 kB"],
  ["999950", "si", 1, "1 MB"],
  ["999949", "si", 1, "999.9 kB"],
  ["1048576", "iec", 2, "1 MiB"],
  ["123456789", "si", 2, "123.46 MB"],
  ["123456789", "iec", 0, "118 MiB"],
  ["9223372036854775807", "iec", 3, "8 EiB"],
  ["1023", "iec", 1, "1023 B"],
  ["1024", "iec", 1, "1 KiB"],
  ["5000000000000", "si", 1, "5 TB"],
];
// [text, expected bytes (decimal string)]
const PARSE_BYTES = [
  ["0", "0"],
  ["512", "512"],
  ["1kB", "1000"],
  ["1 KiB", "1024"],
  ["1.5 GiB", "1610612736"],
  ["2.25MB", "2250000"],
  [" 10 b ", "10"],
  ["1.0005 kB", "1001"],
  ["1.5", "2"],
  ["0.5 B", "1"],
  ["7 EiB", "8070450532247928832"],
];
const PARSE_INVALID = [
  "",
  "abc",
  "1 KB B",
  "1.5.2 MB",
  "-1 kB",
  "1 kbit",
  "1e3 B",
  "9 EiB",
  ".5 kB",
];
const FORMAT_DURATION = [
  [0, "0ms"],
  [850, "850ms"],
  [1000, "1s"],
  [45000, "45s"],
  [65000, "1m 5s"],
  [3600000, "1h"],
  [3725000, "1h 2m"],
  [90061000, "1d 1h"],
  [172800000, "2d"],
  [59999, "59s"],
];
const RELATIVE_TIME = [
  [0, "just now"],
  [30, "just now"],
  [-44, "just now"],
  [45, "in a minute"],
  [-89, "a minute ago"],
  [90, "in 2 minutes"],
  [150, "in 3 minutes"],
  [-2670, "45 minutes ago"],
  [2700, "in an hour"],
  [5399, "in an hour"],
  [5400, "in 2 hours"],
  [-75600, "21 hours ago"],
  [79200, "in a day"],
  [129599, "in a day"],
  [129600, "in 2 days"],
  [2246400, "in a month"],
  [-3974400, "2 months ago"],
  [15552000, "in 6 months"],
  [27648000, "in a year"],
  [-47347200, "2 years ago"],
  [63115200, "in 2 years"],
  [315569520, "in 10 years"],
];
const DIFF_OPS = [
  ["a\nb\nc\n", "a\nB\nc\n", [["=", "a"], ["-", "b"], ["+", "B"], ["=", "c"]]],
  ["", "x\n", [["+", "x"]]],
  ["x\n", "", [["-", "x"]]],
  ["one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n", "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nNINE\nten\n", [["=", "one"], ["-", "two"], ["+", "TWO"], ["=", "three"], ["=", "four"], ["=", "five"], ["=", "six"], ["=", "seven"], ["=", "eight"], ["-", "nine"], ["+", "NINE"], ["=", "ten"]]],
  ["1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\nY\n15\n16\n", [["=", "1"], ["=", "2"], ["-", "3"], ["+", "X"], ["=", "4"], ["=", "5"], ["=", "6"], ["=", "7"], ["=", "8"], ["=", "9"], ["=", "10"], ["=", "11"], ["=", "12"], ["=", "13"], ["-", "14"], ["+", "Y"], ["=", "15"], ["=", "16"]]],
  ["a\nb\n", "a\nb", [["=", "a"], ["-", "b"], ["+", "b"]]],
  ["a\nb", "a\nc", [["=", "a"], ["-", "b"], ["+", "c"]]],
  ["same\n", "same\n", [["=", "same"]]],
  ["a\nb\nc\nd\n", "b\nc\nd\ne\n", [["-", "a"], ["=", "b"], ["=", "c"], ["=", "d"], ["+", "e"]]],
  ["x\ny\n", "y\nx\n", [["-", "x"], ["=", "y"], ["+", "x"]]],
  ["a\nb\nd\nd\ne\nc\nb", "c\nd\nc\nd\nb\nb\na\nb\n", [["-", "a"], ["-", "b"], ["-", "d"], ["+", "c"], ["=", "d"], ["-", "e"], ["=", "c"], ["-", "b"], ["+", "d"], ["+", "b"], ["+", "b"], ["+", "a"], ["+", "b"]]],
  ["a\nd\nd\na\nb\na", "b\na\nc\ne\na\na\na\n", [["+", "b"], ["=", "a"], ["-", "d"], ["-", "d"], ["+", "c"], ["+", "e"], ["=", "a"], ["-", "b"], ["-", "a"], ["+", "a"], ["+", "a"]]],
  ["x", "x", [["=", "x"]]],
  ["x", "x\n", [["-", "x"], ["+", "x"]]],
  ["p\nq", "q\np", [["-", "p"], ["-", "q"], ["+", "q"], ["+", "p"]]],
];
// [a, b, expected] with fromName 'old.txt', toName 'new.txt', context 3 (patch reproduces the new text; GNU diff -u format)
const DIFF_UNIFIED = [
  ["a\nb\nc\n", "a\nB\nc\n", "--- old.txt\n+++ new.txt\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n"],
  ["", "x\n", "--- old.txt\n+++ new.txt\n@@ -0,0 +1 @@\n+x\n"],
  ["x\n", "", "--- old.txt\n+++ new.txt\n@@ -1 +0,0 @@\n-x\n"],
  ["one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n", "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nNINE\nten\n", "--- old.txt\n+++ new.txt\n@@ -1,10 +1,10 @@\n one\n-two\n+TWO\n three\n four\n five\n six\n seven\n eight\n-nine\n+NINE\n ten\n"],
  ["1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\nY\n15\n16\n", "--- old.txt\n+++ new.txt\n@@ -1,6 +1,6 @@\n 1\n 2\n-3\n+X\n 4\n 5\n 6\n@@ -11,6 +11,6 @@\n 11\n 12\n 13\n-14\n+Y\n 15\n 16\n"],
  ["a\nb\n", "a\nb", "--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n"],
  ["a\nb", "a\nc", "--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file\n"],
  ["same\n", "same\n", ""],
  ["a\nb\nc\nd\n", "b\nc\nd\ne\n", "--- old.txt\n+++ new.txt\n@@ -1,4 +1,4 @@\n-a\n b\n c\n d\n+e\n"],
  ["x\ny\n", "y\nx\n", "--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n-x\n y\n+x\n"],
  ["a\nb\nd\nd\ne\nc\nb", "c\nd\nc\nd\nb\nb\na\nb\n", "--- old.txt\n+++ new.txt\n@@ -1,7 +1,8 @@\n-a\n-b\n-d\n+c\n d\n-e\n c\n-b\n\\ No newline at end of file\n+d\n+b\n+b\n+a\n+b\n"],
  ["a\nd\nd\na\nb\na", "b\na\nc\ne\na\na\na\n", "--- old.txt\n+++ new.txt\n@@ -1,6 +1,7 @@\n+b\n a\n-d\n-d\n+c\n+e\n a\n-b\n-a\n\\ No newline at end of file\n+a\n+a\n"],
  ["x", "x", ""],
  ["x", "x\n", "--- old.txt\n+++ new.txt\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+x\n"],
  ["p\nq", "q\np", "--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n-p\n-q\n\\ No newline at end of file\n+q\n+p\n\\ No newline at end of file\n"],
];
const PASSWORD_CASES = [
  ["correct horse battery staple", {}, {"ok": true, "failures": []}],
  ["short", {}, {"ok": false, "failures": ["too-short"]}],
  ["Tr0ub4dor&3", {"minLength": 8}, {"ok": true, "failures": []}],
  ["password", {"minLength": 8, "blocklist": ["Password", "123456"]}, {"ok": false, "failures": ["blocklisted"]}],
  ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", {"maxLength": 64}, {"ok": false, "failures": ["too-long", "repetitive"]}],
  ["aaaa-unique-phrase-x", {}, {"ok": false, "failures": ["repetitive"]}],
  ["my-1234-long-passphrase", {}, {"ok": false, "failures": ["repetitive"]}],
  ["zyxw-backwards-phrase!", {}, {"ok": false, "failures": ["repetitive"]}],
  ["alice-secret-passphrase", {"context": ["alice", "example"]}, {"ok": false, "failures": ["contains-context"]}],
  ["tab\tinside-long-enough", {}, {"ok": false, "failures": ["control-characters"]}],
  ["ünïcödé-pässwörd-long", {}, {"ok": true, "failures": []}],
  ["😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀", {}, {"ok": false, "failures": ["repetitive"]}],
  ["ABCD-upper-sequence-x", {}, {"ok": false, "failures": ["repetitive"]}],
];
const FAILURE_ORDER = ["too-short", "too-long", "control-characters", "blocklisted", "contains-context", "repetitive"];
// [text, expected] or [text, options, expected]
const SANITIZE = [
  ["plain text", "plain text"],
  ["line1\r\nline2\rline3", "line1\nline2\nline3"],
  ["zero​width﻿bom", "zerowidthbom"],
  ["tab\there\u0000nuldelnel", "tab\therenuldelnel"],
  ["if (accessLevel != \"user‮ ⁦// Check if admin⁩ ⁦\") {", "if (accessLevel != \"user // Check if admin \") {"],
  ["emoji 👍🏽 and ZWJ 👨‍👩‍👧 family", "emoji 👍🏽 and ZWJ 👨‍👩‍👧 family"],
  ["café é", "café é"],
  ["a\nb\r\nc", {"allowNewlines": false}, "a b c"],
  ["abcdef", {"maxLength": 3}, "abc"],
  ["😀😀😀", {"maxLength": 2}, "😀😀"],
];
// [text, [[code point index, uppercase hex], ...]]
const FIND_BIDI = [
  ["plain text", []],
  ["line1\r\nline2\rline3", []],
  ["zero​width﻿bom", []],
  ["tab\there\u0000nuldelnel", []],
  ["if (accessLevel != \"user‮ ⁦// Check if admin⁩ ⁦\") {", [[24, "202E"], [26, "2066"], [44, "2069"], [46, "2066"]]],
  ["emoji 👍🏽 and ZWJ 👨‍👩‍👧 family", []],
  ["café é", []],
];
const NORMALIZE_WS = [
  ["  a   b\t\tc\n\nd  ", "a b c d"],
  ["", ""],
  [" \t\n ", ""],
  ["one", "one"],
];

test('base32, base58 and base64url match RFC 4648 and Bitcoin vectors and stay strict', async () => {
  const m = await load('base-encodings');
  for (const [h, padded, hexPadded, unpadded] of BASE32) {
    const bytes = hex(h);
    assert.equal(m.base32Encode(bytes), padded);
    assert.equal(m.base32Encode(bytes, 'hex'), hexPadded);
    assert.equal(m.base32Encode(bytes, 'rfc4648', false), unpadded);
    assert.equal(toHex(m.base32Decode(padded)), h);
    assert.equal(toHex(m.base32Decode(hexPadded, 'hex')), h);
    assert.equal(toHex(m.base32Decode(unpadded, 'rfc4648', false)), h);
  }
  for (const [text, h] of BASE32_CASE_INSENSITIVE) assert.equal(toHex(m.base32Decode(text)), h);
  for (const [text, padding] of BASE32_INVALID) assert.throws(() => m.base32Decode(text, 'rfc4648', padding), RangeError, text);
  assert.throws(() => m.base32Encode(new Uint8Array(1), 'base32hex'), RangeError);
  for (const [h, text] of BASE58) {
    assert.equal(m.base58Encode(hex(h)), text);
    assert.equal(toHex(m.base58Decode(text)), h);
  }
  for (const text of BASE58_INVALID) assert.throws(() => m.base58Decode(text), RangeError, text);
  for (const [h, text] of BASE64URL) {
    assert.equal(m.base64UrlEncode(hex(h)), text);
    assert.equal(toHex(m.base64UrlDecode(text)), h);
  }
  for (const text of BASE64URL_INVALID) assert.throws(() => m.base64UrlDecode(text), RangeError, text);
});

test('vCard 4.0 export is byte-exact, folded and validated', async () => {
  const { buildVcard } = await load('vcard');
  for (const [contact, expected] of VCARD_CASES) {
    assert.equal(buildVcard(contact), expected);
    for (const line of expected.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  }
  for (const contact of VCARD_INVALID) assert.throws(() => buildVcard(contact), RangeError, JSON.stringify(contact));
});

test('CRC-32, FNV-1a, MurmurHash3 and jump hash match the shared vectors', async () => {
  const m = await load('hashing');
  for (const [text, crc, f32, f64, m0, m42] of HASH_STRINGS) {
    assert.equal(m.crc32(text), crc, text);
    assert.equal(m.crc32(new TextEncoder().encode(text)), crc, text);
    assert.equal(m.fnv1a32(text), f32, text);
    assert.equal(m.fnv1a64(text).toString(16).padStart(16, '0'), f64, text);
    assert.equal(m.murmur3_32(text), m0, text);
    assert.equal(m.murmur3_32(text, 42), m42, text);
  }
  assert.equal(m.crc32('123456789'), 0xcbf43926);
  assert.equal(m.murmur3_32('', 1), 0x514e28b7);
  for (const [key, buckets, expected] of JUMP) assert.equal(m.jumpHash(BigInt(key), buckets), expected, `${key}/${buckets}`);
  for (const [key, buckets] of [[1n, 0], [1n, 2 ** 31], [-1n, 10], [2n ** 64n, 10]]) assert.throws(() => m.jumpHash(key, buckets), RangeError);
});

test('feature flags evaluate deterministically and only add users as the rollout grows', async () => {
  const { evaluateFlag } = await load('feature-flags');
  for (const [flag, userId, expected] of FLAG_CASES) assert.deepEqual(evaluateFlag(flag, userId), expected, `${flag.key}/${userId}`);
  for (const flag of FLAG_INVALID) assert.throws(() => evaluateFlag(flag, 'u'), RangeError, JSON.stringify(flag));
  const users = Array.from({ length: 200 }, (_v, i) => `user-${i}`);
  const onAt = (pct) => new Set(users.filter((u) => evaluateFlag({ key: 'grow', rolloutPercent: pct }, u).on));
  const [low, mid, high] = [onAt(10), onAt(30), onAt(75)];
  for (const u of low) assert.ok(mid.has(u));
  for (const u of mid) assert.ok(high.has(u));
});

test('human-readable units format and parse with integer rounding', async () => {
  const m = await load('human-units');
  for (const [n, base, decimals, expected] of FORMAT_BYTES) {
    assert.equal(m.formatBytes(BigInt(n), base, decimals), expected, n);
    if (Number.isSafeInteger(Number(n))) assert.equal(m.formatBytes(Number(n), base, decimals), expected, n);
  }
  for (const args of [[-1], [1, 'metric'], [1, 'si', 4], [2 ** 53]]) assert.throws(() => m.formatBytes(...args), RangeError);
  for (const [text, expected] of PARSE_BYTES) assert.equal(m.parseBytes(text), BigInt(expected), text);
  for (const text of PARSE_INVALID) assert.throws(() => m.parseBytes(text), RangeError, text);
  for (const [ms, expected] of FORMAT_DURATION) assert.equal(m.formatDuration(ms), expected, String(ms));
  for (const [delta, expected] of RELATIVE_TIME) assert.equal(m.relativeTime(delta), expected, String(delta));
});

test('line diff ops and unified output in the GNU diff -u format', async () => {
  const { diffLines, unifiedDiff } = await load('line-diff');
  for (const [a, b, expected] of DIFF_OPS) assert.deepEqual(diffLines(a, b), expected, JSON.stringify([a, b]));
  for (const [a, b, expected] of DIFF_UNIFIED) assert.equal(unifiedDiff(a, b, 'old.txt', 'new.txt'), expected, JSON.stringify([a, b]));
  const big = 'x\n'.repeat(2001);
  assert.throws(() => diffLines(big, big.replace(/x/g, 'y')), RangeError);
});

// Regression: a final line without a newline must only match another final line without one, or the
// patch loses its "No newline at end of file" marker. GNU patch must reproduce the new text exactly.
test('unified diffs apply with patch and reproduce the new text', async t => {
  try { execFileSync('patch', ['--version'], { stdio: 'ignore' }); } catch { t.skip('patch is not installed'); return; }
  const { unifiedDiff } = await load('line-diff');
  const dir = mkdtempSync(join(tmpdir(), 'genlib-diff-'));
  let seed = 7;
  const rand = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const text = () => { const lines = Array.from({ length: rand(9) }, () => 'abcde'[rand(5)]); return lines.join('\n') + (lines.length && rand(10) < 7 ? '\n' : ''); };
  try {
    for (let i = 0; i < 300; i++) {
      const a = text(), b = text(), diff = unifiedDiff(a, b, 'old.txt', 'new.txt');
      if (diff === '') { assert.equal(a, b); continue; }
      writeFileSync(join(dir, 'old.txt'), a); writeFileSync(join(dir, 'p.diff'), diff);
      execFileSync('patch', ['-s', '-o', join(dir, 'out.txt'), join(dir, 'old.txt'), join(dir, 'p.diff')], { stdio: 'pipe' });
      assert.equal(readFileSync(join(dir, 'out.txt'), 'utf8'), b, JSON.stringify([a, b]));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('NIST password policy reports failures in order', async () => {
  const m = await load('nist-password-policy');
  for (const [password, options, expected] of PASSWORD_CASES) assert.deepEqual(m.checkPassword(password, options), expected, password);
  assert.deepEqual([...m.FAILURE_ORDER], FAILURE_ORDER);
  assert.throws(() => m.checkPassword('x', { minLength: 0 }), RangeError);
  assert.throws(() => m.checkPassword('x', { minLength: 10, maxLength: 9 }), RangeError);
});

test('text sanitizing strips controls and finds Trojan Source bidi characters', async () => {
  const m = await load('text-sanitize');
  for (const row of SANITIZE) {
    const [text, options, expected] = row.length === 3 ? row : [row[0], undefined, row[1]];
    assert.equal(m.sanitizeText(text, options), expected, JSON.stringify(text));
  }
  for (const [text, expected] of FIND_BIDI) assert.deepEqual(m.findBidiControls(text), expected, JSON.stringify(text));
  for (const [text, expected] of NORMALIZE_WS) assert.equal(m.normalizeWhitespace(text), expected, JSON.stringify(text));
});

test('agent-recipes find routes wave 7 phrasings to the new recipes', () => {
  assert.equal(findTop('base58', 'base64url'), 'base-encodings');
  assert.equal(findTop('vcard', 'contact'), 'vcard-contacts');
  assert.equal(findTop('crc32', 'checksum'), 'non-crypto-hashing');
  assert.equal(findTop('jump', 'consistent', 'hash'), 'non-crypto-hashing');
  assert.equal(findTop('feature', 'flag', 'evaluation'), 'feature-flag-evaluation');
  assert.equal(findTop('human', 'readable', 'bytes'), 'human-readable-units');
  assert.equal(findTop('format', 'file', 'size'), 'human-readable-units');
  assert.equal(findTop('unified', 'diff'), 'unified-line-diff');
  assert.equal(findTop('nist', 'password', 'policy'), 'nist-password-policy');
  assert.equal(findTop('trojan', 'source'), 'text-sanitize-bidi');
  assert.equal(findTop('bidi', 'controls'), 'text-sanitize-bidi');
  // existing recipes keep their routes
  assert.equal(findTop('feature', 'flag', 'rollout'), 'feature-flag-percentage-rollout');
  assert.equal(findTop('password', 'rules'), 'password-strength-policy');
  assert.equal(findTop('diff', 'lines'), 'text-diff-lines');
});
