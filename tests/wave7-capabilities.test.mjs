// SPDX-License-Identifier: Apache-2.0
// Vector tests for the wave 7 TypeScript recipes: base encodings, vCard export, non-cryptographic hashing,
// feature-flag evaluation, human-readable units, unified line diff, NIST password policy and text
// sanitizing. Every vector is copied from the shared wave 7 vector set used by every language (line-diff
// vectors come from the wave 8 set for line-diff v2; hex strings
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
  [{"key": "new-checkout", "rolloutPercent": 25}, "user-1", {"on": true, "reason": "rollout", "bucket": 849, "variant": null}],
  [{"key": "new-checkout", "rolloutPercent": 25}, "user-2", {"on": false, "reason": "excluded", "bucket": 5308, "variant": null}],
  [{"key": "new-checkout", "rolloutPercent": 25}, "user-3", {"on": false, "reason": "excluded", "bucket": 5247, "variant": null}],
  [{"key": "new-checkout", "rolloutPercent": 25}, "user-42", {"on": false, "reason": "excluded", "bucket": 9209, "variant": null}],
  [{"key": "new-checkout", "rolloutPercent": 25}, "alice@example.com", {"on": false, "reason": "excluded", "bucket": 9060, "variant": null}],
  [{"key": "new-checkout", "rolloutPercent": 25, "allow": ["user-2"], "deny": ["user-1"]}, "user-1", {"on": false, "reason": "deny", "bucket": 849, "variant": null}],
  [{"key": "new-checkout", "rolloutPercent": 25, "allow": ["user-2"], "deny": ["user-1"]}, "user-2", {"on": true, "reason": "allow", "bucket": 5308, "variant": null}],
  [{"key": "beta", "enabled": false, "allow": ["vip"]}, "vip", {"on": false, "reason": "disabled", "bucket": 8844, "variant": null}],
  [{"key": "banner", "rolloutPercent": 0}, "user-1", {"on": false, "reason": "excluded", "bucket": 6875, "variant": null}],
  [{"key": "banner", "rolloutPercent": 100}, "user-1", {"on": true, "reason": "rollout", "bucket": 6875, "variant": null}],
  [{"key": "banner", "rolloutPercent": 12.34}, "user-9", {"on": false, "reason": "excluded", "bucket": 8197, "variant": null}],
  [{"key": "pricing-test", "variants": [{"name": "control", "weight": 50}, {"name": "annual-first", "weight": 30}, {"name": "monthly-first", "weight": 20}]}, "u1", {"on": true, "reason": "rollout", "bucket": 6435, "variant": "control"}],
  [{"key": "pricing-test", "variants": [{"name": "control", "weight": 50}, {"name": "annual-first", "weight": 30}, {"name": "monthly-first", "weight": 20}]}, "u2", {"on": true, "reason": "rollout", "bucket": 401, "variant": "annual-first"}],
  [{"key": "pricing-test", "variants": [{"name": "control", "weight": 50}, {"name": "annual-first", "weight": 30}, {"name": "monthly-first", "weight": 20}]}, "u3", {"on": true, "reason": "rollout", "bucket": 9955, "variant": "monthly-first"}],
  [{"key": "pricing-test", "variants": [{"name": "control", "weight": 50}, {"name": "annual-first", "weight": 30}, {"name": "monthly-first", "weight": 20}]}, "u4", {"on": true, "reason": "rollout", "bucket": 8249, "variant": "annual-first"}],
  [{"key": "pricing-test", "variants": [{"name": "control", "weight": 50}, {"name": "annual-first", "weight": 30}, {"name": "monthly-first", "weight": 20}]}, "u5", {"on": true, "reason": "rollout", "bucket": 6254, "variant": "control"}],
  [{"key": "pricing-test", "variants": [{"name": "control", "weight": 50}, {"name": "annual-first", "weight": 30}, {"name": "monthly-first", "weight": 20}]}, "ünïcode", {"on": true, "reason": "rollout", "bucket": 7068, "variant": "control"}],
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
// Line-diff vectors from the shared wave 8 vector set (line-diff v2: Myers, slide and align).
// [a, b, [[op, line], ...]]
const DIFF_OPS = [
  ["","",[]],
  ["a\n","a\n",[["=","a"]]],
  ["","a\n",[["+","a"]]],
  ["a\n","",[["-","a"]]],
  ["a\nb\nc\n","a\nc\n",[["=","a"],["-","b"],["=","c"]]],
  ["a\nb\nc\n","a\nB\nc\n",[["=","a"],["-","b"],["+","B"],["=","c"]]],
  ["a\nb","a\nb\n",[["=","a"],["-","b"],["+","b"]]],
  ["a\nb\n","a\nb",[["=","a"],["-","b"],["+","b"]]],
  ["x","y",[["-","x"],["+","y"]]],
  ["a\n\nb\n","a\nb\n",[["=","a"],["-",""],["=","b"]]],
  ["1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n","1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n",[["=","1"],["=","2"],["-","3"],["+","X"],["=","4"],["=","5"],["=","6"],["=","7"],["=","8"],["=","9"],["=","10"],["-","11"],["+","Y"],["=","12"]]],
  ["a\nb\na\nb\n","b\na\nb\na\n",[["-","a"],["=","b"],["=","a"],["=","b"],["+","a"]]],
];
// [a, b, context, expected] with fromName 'a' and toName 'b'
const DIFF_UNIFIED = [
  ["","",3,""],
  ["","",0,""],
  ["","",1,""],
  ["a\n","a\n",3,""],
  ["a\n","a\n",0,""],
  ["a\n","a\n",1,""],
  ["","a\n",3,"--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n"],
  ["","a\n",0,"--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n"],
  ["","a\n",1,"--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n"],
  ["a\n","",3,"--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n"],
  ["a\n","",0,"--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n"],
  ["a\n","",1,"--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n"],
  ["a\nb\nc\n","a\nc\n",3,"--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-b\n c\n"],
  ["a\nb\nc\n","a\nc\n",0,"--- a\n+++ b\n@@ -2 +1,0 @@\n-b\n"],
  ["a\nb\nc\n","a\nc\n",1,"--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-b\n c\n"],
  ["a\nb\nc\n","a\nB\nc\n",3,"--- a\n+++ b\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n"],
  ["a\nb\nc\n","a\nB\nc\n",0,"--- a\n+++ b\n@@ -2 +2 @@\n-b\n+B\n"],
  ["a\nb\nc\n","a\nB\nc\n",1,"--- a\n+++ b\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n"],
  ["a\nb","a\nb\n",3,"--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n"],
  ["a\nb","a\nb\n",0,"--- a\n+++ b\n@@ -2 +2 @@\n-b\n\\ No newline at end of file\n+b\n"],
  ["a\nb","a\nb\n",1,"--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n"],
  ["a\nb\n","a\nb",3,"--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n"],
  ["a\nb\n","a\nb",0,"--- a\n+++ b\n@@ -2 +2 @@\n-b\n+b\n\\ No newline at end of file\n"],
  ["a\nb\n","a\nb",1,"--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n"],
  ["x","y",3,"--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n"],
  ["x","y",0,"--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n"],
  ["x","y",1,"--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n"],
  ["a\n\nb\n","a\nb\n",3,"--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-\n b\n"],
  ["a\n\nb\n","a\nb\n",0,"--- a\n+++ b\n@@ -2 +1,0 @@\n-\n"],
  ["a\n\nb\n","a\nb\n",1,"--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-\n b\n"],
  ["1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n","1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n",3,"--- a\n+++ b\n@@ -1,6 +1,6 @@\n 1\n 2\n-3\n+X\n 4\n 5\n 6\n@@ -8,5 +8,5 @@\n 8\n 9\n 10\n-11\n+Y\n 12\n"],
  ["1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n","1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n",0,"--- a\n+++ b\n@@ -3 +3 @@\n-3\n+X\n@@ -11 +11 @@\n-11\n+Y\n"],
  ["1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n","1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n",1,"--- a\n+++ b\n@@ -2,3 +2,3 @@\n 2\n-3\n+X\n 4\n@@ -10,3 +10,3 @@\n 10\n-11\n+Y\n 12\n"],
  ["a\nb\na\nb\n","b\na\nb\na\n",3,"--- a\n+++ b\n@@ -1,4 +1,4 @@\n-a\n b\n a\n b\n+a\n"],
  ["a\nb\na\nb\n","b\na\nb\na\n",0,"--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n@@ -4,0 +4 @@\n+a\n"],
  ["a\nb\na\nb\n","b\na\nb\na\n",1,"--- a\n+++ b\n@@ -1,2 +1 @@\n-a\n b\n@@ -4 +3,2 @@\n b\n+a\n"],
  ["line 5\nline 5\nline 4\n","}\nline 5\nline 4\n",3,"--- a\n+++ b\n@@ -1,3 +1,3 @@\n-line 5\n+}\n line 5\n line 4\n"],
  ["line 5\nline 5\nline 4\n","}\nline 5\nline 4\n",0,"--- a\n+++ b\n@@ -1 +1 @@\n-line 5\n+}\n"],
  ["line 5\nline 5\nline 4\n","}\nline 5\nline 4\n",1,"--- a\n+++ b\n@@ -1,2 +1,2 @@\n-line 5\n+}\n line 5\n"],
  ["{\n}\n{\n}\n","{\n}\n{\nx\n}\n{\n}\n",3,"--- a\n+++ b\n@@ -1,4 +1,7 @@\n {\n }\n {\n+x\n }\n+{\n+}\n"],
  ["{\n}\n{\n}\n","{\n}\n{\nx\n}\n{\n}\n",0,"--- a\n+++ b\n@@ -3,0 +4 @@\n+x\n@@ -4,0 +6,2 @@\n+{\n+}\n"],
  ["{\n}\n{\n}\n","{\n}\n{\nx\n}\n{\n}\n",1,"--- a\n+++ b\n@@ -3,2 +3,5 @@\n {\n+x\n }\n+{\n+}\n"],
  ["same\nsame\nsame\n","same\nsame\n",3,"--- a\n+++ b\n@@ -1,3 +1,2 @@\n same\n same\n-same\n"],
  ["same\nsame\nsame\n","same\nsame\n",0,"--- a\n+++ b\n@@ -3 +2,0 @@\n-same\n"],
  ["same\nsame\nsame\n","same\nsame\n",1,"--- a\n+++ b\n@@ -2,2 +2 @@\n same\n-same\n"],
  ["p\nq\nr\n","a\nb\nc\n",3,"--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n"],
  ["p\nq\nr\n","a\nb\nc\n",0,"--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n"],
  ["p\nq\nr\n","a\nb\nc\n",1,"--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n"],
  ["line 0\nline 4\nline 3\nline 3\nline 2\nline 1\n    return x\n","line 4\nline 2\n{\nline 1\nline 3\n",3,"--- a\n+++ b\n@@ -1,7 +1,5 @@\n-line 0\n line 4\n-line 3\n-line 3\n line 2\n+{\n line 1\n-    return x\n+line 3\n"],
  ["    return x\nline 2\nline 0\nline 0\n\nline 0\nline 2\n    return x\nline 2\n}\nline 2\n    return x\nline 0\n","    return x\nline 2\nline 0\nline 0\nline 0\nline 2\n    return x\nline 2\n}\n}\nline 2\n    return x\n{\nline 0\n",3,"--- a\n+++ b\n@@ -2,12 +2,13 @@\n line 2\n line 0\n line 0\n-\n line 0\n line 2\n     return x\n line 2\n }\n+}\n line 2\n     return x\n+{\n line 0\n"],
  ["line 2\nline 5\nline 5\nline 3\n{\nline 4\n    return x\n{\n{\nline 1\n}\n{\nline 2\n\n    return x\nline 3\nline 2\nline 7\nline 6\nline 4\n{\n    return x\n","line 2\nline 3\nline 5\nline 5\nline 3\n{\n    return x\n{\n{\nline 1\n}\nline 5\nline 2\n\n    return x\nline 3\nline 2\nline 7\nline 6\nline 4\n{\n    return x\n\n",3,"--- a\n+++ b\n@@ -1,15 +1,15 @@\n line 2\n+line 3\n line 5\n line 5\n line 3\n {\n-line 4\n     return x\n {\n {\n line 1\n }\n-{\n+line 5\n line 2\n \n     return x\n@@ -20,3 +20,4 @@\n line 4\n {\n     return x\n+\n"],
  ["line 3\n    return x\n\nline 6\n    return x\n\nline 2\nline 4\nline 2\nline 3\n}\n}\nline 4\n{\nline 6\n{\nline 6\nline 5\nline 3\nline 2\n","line 3\nline 1\n    return x\nline 0\nline 6\n\nline 2\nline 4\nline 2\nline 3\n}\n}\n{\n{\n}\nline 6\n{\nline 4\nline 5\nline 3\nline 2\n",3,"--- a\n+++ b\n@@ -1,8 +1,8 @@\n line 3\n+line 1\n     return x\n-\n+line 0\n line 6\n-    return x\n \n line 2\n line 4\n@@ -10,11 +10,12 @@\n line 3\n }\n }\n-line 4\n {\n+{\n+}\n line 6\n {\n-line 6\n+line 4\n line 5\n line 3\n line 2\n"],
  ["line 2\n    return x\nline 0\n\nline 2\nline 1\n\nline 3\nline 2\n}\nline 2\nline 0\n}\n    return x\nline 0\nline 1\n}\n\nline 3\nline 0\nline 3\nline 1\nline 1\n    return x\nline 1\nline 2\nline 2\n","    return x\nline 0\n\nline 2\nline 1\n\nline 2\n}\nline 2\nline 0\n}\n    return x\n    return x\nline 0\nline 1\n}\n\nline 3\n{\nline 0\nline 3\nline 1\n    return x\nline 1\nline 2\nline 2\n",3,"--- a\n+++ b\n@@ -1,26 +1,25 @@\n-line 2\n     return x\n line 0\n \n line 2\n line 1\n \n-line 3\n line 2\n }\n line 2\n line 0\n }\n     return x\n+    return x\n line 0\n line 1\n }\n \n line 3\n+{\n line 0\n line 3\n line 1\n-line 1\n     return x\n line 1\n line 2\n"],
  ["","line 1\n",3,"--- a\n+++ b\n@@ -0,0 +1 @@\n+line 1\n"],
  ["line 0\n{\nline 1\n\n    return x\n}\nline 1\n{\nline 1\n    return x\n{\n{\n}\nline 1\n}\n}\nline 1\nline 0\nline 0\n    return x\n}\n","line 0\nline 0\nline 1\n\n    return x\n}\n{\nline 1\n    return x\nline 0\n{\n{\n}\nline 1\n    return x\n}\n}\nline 1\nline 0\nline 0\n}\n",3,"--- a\n+++ b\n@@ -1,21 +1,21 @@\n line 0\n-{\n+line 0\n line 1\n \n     return x\n }\n-line 1\n {\n line 1\n     return x\n+line 0\n {\n {\n }\n line 1\n+    return x\n }\n }\n line 1\n line 0\n line 0\n-    return x\n }\n"],
  ["\nline 1\n    return x\nline 0\n\n    return x\n    return x\n    return x\n}\nline 0\nline 0\n{\n}\n    return x\nline 0\nline 0\n    return x","line 1\n    return x\nline 0\n\n    return x\n    return x\n    return x\n}\nline 0\nline 0\n{\nline 0\n}\n    return x\nline 0\n    return x\n",3,"--- a\n+++ b\n@@ -1,4 +1,3 @@\n-\n line 1\n     return x\n line 0\n@@ -10,8 +9,8 @@\n line 0\n line 0\n {\n+line 0\n }\n     return x\n line 0\n-line 0\n-    return x\n\\ No newline at end of file\n+    return x\n"],
  ["line 4\nline 6\n    return x\n    return x\n\n{\n    return x\nline 7\nline 2\nline 3\nline 4\nline 3\nline 0\n}\n    return x\n\nline 0\n    return x\nline 5\nline 0\nline 0\n}\nline 7\n\n\nline 2\nline 0\n\nline 1\n","line 4\nline 6\n    return x\n\n{\n    return x\nline 7\nline 6\nline 2\nline 3\nline 4\nline 3\nline 0\n}\n    return x\n\nline 0\n    return x\nline 5\nline 0\nline 0\n}\nline 7\n\n\nline 2\nline 0\n\nline 1",3,"--- a\n+++ b\n@@ -1,11 +1,11 @@\n line 4\n line 6\n     return x\n-    return x\n \n {\n     return x\n line 7\n+line 6\n line 2\n line 3\n line 4\n@@ -26,4 +26,4 @@\n line 2\n line 0\n \n-line 1\n+line 1\n\\ No newline at end of file\n"],
  ["}\nline 0\n}\nline 0\n\n{\n}\n}\n}\nline 2\nline 2\nline 1\n{\n{\nline 2\nline 1\nline 2\n\nline 1\n{\n{\nline 2\n\nline 2\n    return x\nline 0\nline 0\n\n}\n}\nline 0\nline 0\n}\nline 1\n}\nline 2\nline 1","}\nline 0\n}\nline 0\n\n{\n}\n}\n}\nline 2\nline 2\nline 1\n{\n{\nline 2\nline 1\nline 2\n\nline 1\n{\n{\nline 2\n\nline 1\n    return x\nline 0\nline 0\n\n}\nline 0\nline 0\n}\nline 1\nline 0\n}\nline 2\nline 2\nline 1\n",3,"--- a\n+++ b\n@@ -21,17 +21,18 @@\n {\n line 2\n \n-line 2\n+line 1\n     return x\n line 0\n line 0\n \n }\n-}\n line 0\n line 0\n }\n line 1\n+line 0\n }\n line 2\n-line 1\n\\ No newline at end of file\n+line 2\n+line 1\n"],
  ["line 0\nline 0\n{\n}\nline 1\nline 2\nline 2\n}\nline 1\n{\nline 2\nline 1\n{\n{\n    return x\nline 2\n","line 0\nline 0\nline 0\nline 0\nline 1\nline 2\nline 2\nline 0\nline 1\n}\nline 1\n}\n{\nline 2\nline 1\n{\n{\n    return x\n{\nline 2\n",3,"--- a\n+++ b\n@@ -1,16 +1,20 @@\n line 0\n line 0\n-{\n-}\n+line 0\n+line 0\n line 1\n line 2\n line 2\n+line 0\n+line 1\n }\n line 1\n+}\n {\n line 2\n line 1\n {\n {\n     return x\n+{\n line 2\n"],
  ["\nline 0\n\nline 1\n    return x\nline 1\n    return x\nline 0\n\n{\n}\n{\n    return x\nline 1\nline 1\nline 1\nline 1\n}\nline 0\n","\nline 0\n\nline 1\n    return x\nline 1\n    return x\n    return x\n\n{\n}\n}\n{\n    return x\nline 1\nline 1\nline 1\nline 1\n}\nline 0\n",3,"--- a\n+++ b\n@@ -5,10 +5,11 @@\n     return x\n line 1\n     return x\n-line 0\n+    return x\n \n {\n }\n+}\n {\n     return x\n line 1\n"],
  ["line 0\n}\nline 1\nline 1\n}\n\n\nline 1\nline 1\nline 0\n    return x\nline 1\n}\n\n\nline 0\n\n\n    return x\n{\n}\n    return x\n{\n\n","line 0\n}\nline 1\nline 1\n}\n\n\nline 1\nline 1\nline 0\n    return x\nline 1\n}\n\n\nline 0\n\n\n    return x\n{\n}\n    return x\n{\n",3,"--- a\n+++ b\n@@ -21,4 +21,3 @@\n }\n     return x\n {\n-\n"],
  ["line 2\nline 0\nline 0\n}\n\nline 2\n{\n    return x\nline 2\n\n}\n}\nline 0\n\n}\nline 1\nline 2\nline 0\n{\n\nline 0\n}\n    return x\n}\n{\n{\n{\n{\n{\nline 1\nline 2\n\nline 0\n{\nline 2\n}\nline 2\n","line 2\nline 0\nline 0\n}\n\nline 2\n{\n    return x\nline 2\n\n}\n}\nline 0\n\n}\nline 1\nline 2\nline 0\n{\n}\n\nline 0\n}\n    return x\n}\n{\n{\n{\n{\n{\nline 1\nline 2\n\nline 0\n{\nline 2\n}\nline 2\n",3,"--- a\n+++ b\n@@ -17,6 +17,7 @@\n line 2\n line 0\n {\n+}\n \n line 0\n }\n"],
  ["    return x\nline 2\nline 3\n}\n}\nline 2\nline 4\n}\n    return x\nline 0\nline 4\nline 4\nline 3\n}\n\n{\n{\n{\n","    return x\nline 2\nline 3\n}\n}\nline 1\nline 2\n}\n    return x\nline 4\nline 4\nline 3\n}\n\n{\n{\n{\n",3,"--- a\n+++ b\n@@ -3,11 +3,10 @@\n line 3\n }\n }\n+line 1\n line 2\n-line 4\n }\n     return x\n-line 0\n line 4\n line 4\n line 3\n"],
  ["line 0\nline 0\nline 1\n\n}\n    return x\n    return x\nline 0\n\n","    return x\nline 0\nline 0\n}\n}\n    return x\nline 0\n    return x\n\n",3,"--- a\n+++ b\n@@ -1,9 +1,9 @@\n+    return x\n line 0\n line 0\n-line 1\n-\n }\n-    return x\n+}\n     return x\n line 0\n+    return x\n \n"],
  ["line 7\nline 2\nline 7\n{\n\n\n}\n","line 7\nline 2\nline 7\n\nline 3\nline 7\n\n    return x\n",3,"--- a\n+++ b\n@@ -1,7 +1,8 @@\n line 7\n line 2\n line 7\n-{\n \n+line 3\n+line 7\n \n-}\n+    return x\n"],
  ["line 7\n{\nline 3\nline 4\nline 7\nline 1\n    return x\nline 4\nline 3\nline 4\nline 5\nline 5\n\nline 1\nline 2\nline 2\nline 3\nline 6\n    return x\nline 2\n    return x\nline 3\nline 1\nline 6\nline 6\nline 5\n\nline 7\nline 6\nline 0\nline 3\nline 6\nline 6","line 7\n{\nline 3\nline 4\nline 7\nline 1\n    return x\nline 4\nline 3\nline 4\nline 5\nline 5\n\nline 1\nline 2\nline 2\nline 3\nline 6\n    return x\nline 2\n    return x\nline 3\nline 1\nline 6\nline 6\nline 5\n\nline 7\nline 6\nline 0\nline 3\nline 6\nline 6\n",3,"--- a\n+++ b\n@@ -30,4 +30,4 @@\n line 0\n line 3\n line 6\n-line 6\n\\ No newline at end of file\n+line 6\n"],
  ["line 0\n\nline 4\n}\n}\n    return x\n    return x\nline 3\n{\nline 3\nline 4\n}\n{\nline 0\n}\n\n}\nline 2\n{\nline 2\n    return x\nline 0\n}\nline 0\nline 1\n}\nline 2\n{\nline 2\nline 0\n","line 0\n\nline 4\n}\n}\n    return x\nline 3\n{\nline 3\nline 4\n}\n}\n{\nline 0\n}\n\n}\nline 2\n{\nline 2\n    return x\nline 0\n}\nline 0\nline 1\n}\nline 1\n{\nline 2\nline 0\n",3,"--- a\n+++ b\n@@ -4,12 +4,12 @@\n }\n }\n     return x\n-    return x\n line 3\n {\n line 3\n line 4\n }\n+}\n {\n line 0\n }\n@@ -24,7 +24,7 @@\n line 0\n line 1\n }\n-line 2\n+line 1\n {\n line 2\n line 0\n"],
  ["line 1\n    return x\nline 0\n    return x\nline 0\nline 0\nline 1\nline 1\nline 0\n{\nline 1\nline 1\nline 1\n}\n    return x\nline 0\n{\nline 1\n}\n    return x\n\n\n","line 1\n    return x\nline 0\n    return x\nline 0\n\nline 0\nline 1\nline 1\nline 0\n{\nline 1\nline 1\nline 1\n}\n    return x\nline 0\n{\nline 1\n}\n    return x\n\n\nline 0\n",3,"--- a\n+++ b\n@@ -3,6 +3,7 @@\n line 0\n     return x\n line 0\n+\n line 0\n line 1\n line 1\n@@ -20,3 +21,4 @@\n     return x\n \n \n+line 0\n"],
  ["{\n{\nline 3\nline 1\nline 3\nline 1\n\nline 1\nline 0\n}\n{\n}\nline 1\n}\nline 0\n{\n    return x\nline 1\n{\n}\n    return x\nline 2\n{\nline 2\n\n    return x\n    return x\n{\n\n}\nline 3\nline 1\n\n    return x\nline 3\n    return x\n","{\n{\nline 3\nline 1\nline 3\nline 1\n\nline 1\nline 0\n}\n{\n}\nline 1\n}\nline 0\n{\nline 1\n}\n    return x\nline 2\n{\nline 2\n\n    return x\n    return x\n{\n}\nline 3\nline 2\n    return x\nline 3\n    return x\nline 3\n",3,"--- a\n+++ b\n@@ -14,9 +14,7 @@\n }\n line 0\n {\n-    return x\n line 1\n-{\n }\n     return x\n line 2\n@@ -26,11 +24,10 @@\n     return x\n     return x\n {\n-\n }\n line 3\n-line 1\n-\n+line 2\n     return x\n line 3\n     return x\n+line 3\n"],
  ["    return x\n\n\nline 0\nline 1\nline 4\nline 3\nline 6\nline 3\nline 4\n    return x\n{\nline 5\n\n}\n}\nline 5\nline 6\n}\nline 5\nline 5\n\nline 4\nline 4\nline 4\nline 3\nline 1\nline 3\nline 5\nline 1\n","    return x\n\n\nline 1\nline 4\nline 2\nline 6\nline 4\nline 4\n{\nline 5\n\n}\nline 5\nline 6\n}\nline 5\nline 4\nline 4\nline 4\nline 3\nline 1\nline 3\nline 5\nline 1\n",3,"--- a\n+++ b\n@@ -1,25 +1,20 @@\n     return x\n \n \n-line 0\n line 1\n line 4\n-line 3\n+line 2\n line 6\n-line 3\n line 4\n-    return x\n+line 4\n {\n line 5\n \n }\n-}\n line 5\n line 6\n }\n line 5\n-line 5\n-\n line 4\n line 4\n line 4\n"],
  ["\n    return x\nline 1\n    return x\n}\nline 0\nline 0\n{\n\n}\n}\n}\n\nline 1\nline 0\n\n}\nline 0\nline 0\n}\n}\nline 0\n{\n    return x\n    return x\nline 0\nline 1\nline 1\n{\n\nline 0\nline 1\nline 0\n{\n}\n","\n    return x\nline 1\n}\nline 0\nline 0\n{\n\n}\n}\n}\n\nline 1\nline 0\n\n}\nline 0\nline 0\n}\n}\nline 0\n{\n    return x\n}\n    return x\nline 0\n\nline 1\n{\n\nline 0\nline 1\nline 0\n{\n}\n",3,"--- a\n+++ b\n@@ -1,7 +1,6 @@\n \n     return x\n line 1\n-    return x\n }\n line 0\n line 0\n@@ -22,9 +21,10 @@\n line 0\n {\n     return x\n+}\n     return x\n line 0\n-line 1\n+\n line 1\n {\n \n"],
  ["{\nline 3\nline 4\n{\nline 1\nline 2\nline 3\nline 2\n\nline 1\nline 2\nline 0\nline 6\n","{\nline 3\nline 4\nline 2\nline 3\nline 4\nline 2\n\nline 1\n{\nline 7\nline 0\nline 6",3,"--- a\n+++ b\n@@ -1,13 +1,13 @@\n {\n line 3\n line 4\n-{\n-line 1\n line 2\n line 3\n+line 4\n line 2\n \n line 1\n-line 2\n+{\n+line 7\n line 0\n-line 6\n+line 6\n\\ No newline at end of file\n"],
  ["line 1\nline 0\nline 2\nline 4\n}\n    return x\n}\nline 4\nline 7\n","line 1\nline 0\nline 2\nline 4\n    return x\n}\n    return x\n}\nline 4\nline 7\n",3,"--- a\n+++ b\n@@ -2,6 +2,7 @@\n line 0\n line 2\n line 4\n+    return x\n }\n     return x\n }\n"],
  ["}\nline 1\n    return x\nline 0\n\nline 5\n    return x\nline 4\nline 0\nline 1\nline 3\n    return x\n    return x\nline 0\nline 4\n    return x\nline 0\nline 2\n}\n{\n}\nline 4\nline 2\n    return x\n\n}\nline 1\n}\nline 5\n\nline 5\n","}\nline 1\n    return x\nline 0\n\n    return x\nline 4\nline 0\nline 1\nline 5\nline 3\n    return x\n    return x\nline 0\nline 4\n    return x\nline 0\nline 2\n}\n{\nline 4\nline 2\n    return x\n{\n\n}\nline 1\n}\nline 5\n\nline 4\nline 5\n",3,"--- a\n+++ b\n@@ -3,11 +3,11 @@\n     return x\n line 0\n \n-line 5\n     return x\n line 4\n line 0\n line 1\n+line 5\n line 3\n     return x\n     return x\n@@ -18,14 +18,15 @@\n line 2\n }\n {\n-}\n line 4\n line 2\n     return x\n+{\n \n }\n line 1\n }\n line 5\n \n+line 4\n line 5\n"],
  ["line 0\n{\n\nline 7\nline 6\nline 0\nline 3\n\nline 5\n}\nline 7\n{\nline 7\nline 0\nline 3\nline 4\n\nline 2\nline 4\nline 7\n    return x\nline 7\nline 1\nline 0\n{\n}\nline 3\n    return x\nline 2\nline 4\n\nline 0\n","line 0\n{\n\nline 7\nline 6\nline 0\nline 3\n{\nline 1\n\nline 6\nline 5\n}\nline 7\n{\nline 7\nline 0\nline 7\nline 3\nline 6\nline 4\nline 7\nline 2\nline 4\nline 7\n    return x\nline 7\nline 1\nline 0\n{\n}\nline 3\n    return x\nline 4\n\nline 0\n",3,"--- a\n+++ b\n@@ -5,16 +5,21 @@\n line 6\n line 0\n line 3\n+{\n+line 1\n \n+line 6\n line 5\n }\n line 7\n {\n line 7\n line 0\n+line 7\n line 3\n+line 6\n line 4\n-\n+line 7\n line 2\n line 4\n line 7\n@@ -26,7 +31,6 @@\n }\n line 3\n     return x\n-line 2\n line 4\n \n line 0\n"],
  ["    return x\nline 4\nline 0\nline 4\nline 4\n{\nline 2\n{\n    return x\n{\n\n\n    return x\n    return x\n}\n{\n\nline 3\nline 3\n}\nline 3\n","    return x\nline 4\nline 0\n{\nline 4\n{\nline 2\n{\n    return x\n{\n\n\n}\n    return x\n    return x\nline 2\nline 2\nline 3\nline 3\n}\nline 3\n",3,"--- a\n+++ b\n@@ -1,7 +1,7 @@\n     return x\n line 4\n line 0\n-line 4\n+{\n line 4\n {\n line 2\n@@ -10,11 +10,11 @@\n {\n \n \n+}\n     return x\n     return x\n-}\n-{\n-\n+line 2\n+line 2\n line 3\n line 3\n }\n"],
  ["line 6\n    return x\nline 2\nline 1\n\nline 4\nline 5\n{\nline 6\n","line 6\n    return x\nline 2\nline 1\n\nline 4\nline 5\n{\n    return x\n",3,"--- a\n+++ b\n@@ -6,4 +6,4 @@\n line 4\n line 5\n {\n-line 6\n+    return x\n"],
  ["}\nline 0\n{\nline 1\nline 3\n    return x\n    return x\nline 4\nline 3\nline 1\nline 6\nline 1\n    return x\nline 1\n\nline 2\nline 4\nline 0\nline 0\nline 5\nline 0\nline 4\nline 5\nline 5\nline 6\nline 2\nline 3\n}\nline 6\n{\n    return x\n","}\nline 0\nline 1\nline 3\n    return x\n    return x\nline 4\nline 3\nline 1\nline 6\nline 1\n    return x\n{\nline 1\n\nline 2\nline 4\nline 0\nline 0\nline 5\nline 0\nline 4\nline 5\nline 5\nline 6\nline 2\nline 3\n}\nline 6\n{\n    return x\n",3,"--- a\n+++ b\n@@ -1,6 +1,5 @@\n }\n line 0\n-{\n line 1\n line 3\n     return x\n@@ -11,6 +10,7 @@\n line 6\n line 1\n     return x\n+{\n line 1\n \n line 2\n"],
  ["line 3\n}\nline 4\n}\nline 4\nline 0\n}\nline 4\n{\n","line 3\n}\nline 4\n}\nline 4\n}\nline 4\n{\n",3,"--- a\n+++ b\n@@ -3,7 +3,6 @@\n line 4\n }\n line 4\n-line 0\n }\n line 4\n {\n"],
  ["{\n    return x\nline 1\nline 3\n{\n}\n\n\nline 0\n{\n\nline 0","{\n    return x\nline 1\nline 3\n{\n}\n\n\nline 0\n{\n\nline 0\n",3,"--- a\n+++ b\n@@ -9,4 +9,4 @@\n line 0\n {\n \n-line 0\n\\ No newline at end of file\n+line 0\n"],
  ["line 3\n}\nline 5\nline 3\n{\nline 3\n}\nline 4\n{\n    return x\n{\n{\nline 2\n{\nline 1\n{\n{\nline 0\n","line 3\n}\n}\nline 5\n{\nline 3\n}\nline 4\n{\n{\n{\nline 2\n{\n{\n{\nline 0\n",3,"--- a\n+++ b\n@@ -1,18 +1,16 @@\n line 3\n }\n+}\n line 5\n-line 3\n {\n line 3\n }\n line 4\n {\n-    return x\n {\n {\n line 2\n {\n-line 1\n {\n {\n line 0\n"],
  ["{\n{\nline 4\nline 2\nline 4\n}\nline 4\nline 5\nline 1\n}\nline 1\nline 2\nline 3\n\n{\nline 5\nline 1\n\nline 0\nline 4\n{\nline 1\n}\n","{\n{\nline 4\nline 2\nline 4\n}\nline 4\nline 1\n}\nline 1\nline 2\nline 3\n\n{\nline 5\nline 1\n\nline 0\nline 4\nline 5\n{\nline 4\nline 1\n}\n",3,"--- a\n+++ b\n@@ -5,7 +5,6 @@\n line 4\n }\n line 4\n-line 5\n line 1\n }\n line 1\n@@ -18,6 +17,8 @@\n \n line 0\n line 4\n+line 5\n {\n+line 4\n line 1\n }\n"],
  ["    return x\nline 4\n{\nline 6\nline 1\nline 2\nline 0\nline 0\nline 4\nline 7\nline 1\nline 1\nline 3\n\nline 2\nline 6\nline 7\nline 5\n{\n    return x\n    return x\n\nline 6\n}\n    return x\n    return x\nline 2\nline 6\n{","    return x\nline 4\n{\nline 6\nline 1\nline 2\nline 0\nline 0\nline 4\nline 7\nline 1\nline 1\nline 3\n}\nline 2\nline 6\nline 7\nline 5\n{\n    return x\n    return x\n\nline 6\n}\n    return x\n    return x\nline 2\nline 6\n{\n",3,"--- a\n+++ b\n@@ -11,7 +11,7 @@\n line 1\n line 1\n line 3\n-\n+}\n line 2\n line 6\n line 7\n@@ -26,4 +26,4 @@\n     return x\n line 2\n line 6\n-{\n\\ No newline at end of file\n+{\n"],
  ["line 3\n\n\nline 3\nline 5\nline 1\n    return x\nline 5\n}\n    return x\nline 5\nline 0\nline 6\nline 4\nline 3\nline 1\n\nline 1\n    return x\nline 3\n    return x\n    return x\n{\n","line 3\n\n\nline 3\nline 5\nline 1\n    return x\nline 5\n}\n    return x\nline 5\nline 0\nline 6\nline 4\nline 3\nline 1\n\nline 1\n    return x\nline 3\n    return x\n    return x\n{\n",3,""],
  ["line 1\nline 0\n    return x\n    return x\n}\nline 1\n}\nline 1\n    return x\n    return x\nline 1\nline 2\n    return x\nline 1\n    return x\n}\nline 0\nline 2\n    return x\nline 1\nline 1\n}\nline 2\n    return x\nline 1\nline 0\n{\n    return x\nline 0\nline 1\nline 0\nline 2\n    return x\n    return x\nline 1\n}\n","line 1\nline 0\n    return x\n    return x\n\n}\nline 1\n}\nline 1\n    return x\n    return x\nline 1\nline 2\n    return x\nline 1\n    return x\n}\nline 2\n    return x\nline 1\nline 1\n}\nline 2\n}\n    return x\nline 1\nline 0\n{\n}\nline 0\nline 1\nline 0\nline 2\n    return x\n    return x\nline 1\n}\n",3,"--- a\n+++ b\n@@ -2,6 +2,7 @@\n line 0\n     return x\n     return x\n+\n }\n line 1\n }\n@@ -14,18 +15,18 @@\n line 1\n     return x\n }\n-line 0\n line 2\n     return x\n line 1\n line 1\n }\n line 2\n+}\n     return x\n line 1\n line 0\n {\n-    return x\n+}\n line 0\n line 1\n line 0\n"],
  ["line 4\n\n    return x\nline 0\nline 0\n\nline 6\nline 6\n    return x\nline 1\n\n\nline 1\nline 1\nline 5\n{\nline 2\nline 1\nline 2\nline 4\n{\n    return x\n{\n}\nline 5\nline 6\n{\n}\nline 4\n\n}\n{\nline 6\n","line 4\n\n    return x\nline 0\nline 0\n\nline 6\n    return x\nline 6\n    return x\nline 1\n\n\nline 1\nline 1\nline 5\n{\nline 2\nline 1\nline 2\nline 4\n{\n    return x\n{\n}\nline 5\nline 6\n{\n}\nline 4\n\n}\n{\nline 6\n",3,"--- a\n+++ b\n@@ -5,6 +5,7 @@\n line 0\n \n line 6\n+    return x\n line 6\n     return x\n line 1\n"],
  ["line 6\n\nline 3\nline 6\nline 5\n\nline 6\nline 6\nline 1\nline 5\nline 6\nline 5\n    return x\n","line 6\nline 5\n\nline 6\nline 6\nline 1\nline 1\nline 5\nline 6\nline 5\n    return x\n",3,"--- a\n+++ b\n@@ -1,12 +1,10 @@\n line 6\n-\n-line 3\n-line 6\n line 5\n \n line 6\n line 6\n line 1\n+line 1\n line 5\n line 6\n line 5\n"],
  ["line 0\n}\n}\n}\nline 2\n{\nline 0\n\nline 2\n    return x\n{\n    return x\n\n    return x\n{\nline 0\nline 2\n}\nline 2\nline 2\nline 0\n}\n}\nline 1\nline 1\n{\n\nline 1\n    return x\nline 0\nline 2\n    return x\n}\nline 2\nline 0","line 0\n}\n}\n}\nline 2\n{\nline 0\n\nline 2\n    return x\n{\n    return x\n\n    return x\n{\nline 0\nline 2\nline 0\n}\nline 2\nline 0\n}\n}\nline 1\nline 1\n{\n\n    return x\nline 1\n    return x\nline 0\nline 2\n    return x\n}\nline 2\nline 0\nline 0\n",3,"--- a\n+++ b\n@@ -15,9 +15,9 @@\n {\n line 0\n line 2\n+line 0\n }\n line 2\n-line 2\n line 0\n }\n }\n@@ -25,6 +25,7 @@\n line 1\n {\n \n+    return x\n line 1\n     return x\n line 0\n@@ -32,4 +33,5 @@\n     return x\n }\n line 2\n-line 0\n\\ No newline at end of file\n+line 0\n+line 0\n"],
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

// Regression: plain FNV-1a's low bit is the parity of the input bytes, so two 50/50 experiments whose
// keys differ in a few characters put every subject in the same half of both. fmix32 decorrelates them.
test('feature flag buckets are independent across experiments and uniform', async () => {
  const { evaluateFlag } = await load('feature-flags');
  const subjects = Array.from({ length: 10000 }, (_v, i) => `u${i}`);
  const bucket = (key, u) => evaluateFlag({ key }, u).bucket;
  const variant = (key, u) => evaluateFlag({ key, variants: [{ name: 'a', weight: 1 }, { name: 'b', weight: 1 }] }, u).variant === 'a' ? 0 : 1;
  for (const [k1, k2] of [['checkout-a', 'checkout-b'], ['exp1', 'exp2']]) {
    const parity = chiSquare2x2(subjects, (u) => bucket(k1, u) % 2, (u) => bucket(k2, u) % 2);
    assert.ok(parity < 10.83, `bucket parity ${k1}/${k2} chi-square ${parity.toFixed(2)} (p <= 0.001)`);
    const arms = chiSquare2x2(subjects, (u) => variant(k1, u), (u) => variant(k2, u));
    assert.ok(arms < 10.83, `50/50 variants ${k1}/${k2} chi-square ${arms.toFixed(2)} (p <= 0.001)`);
  }
  const perBucket = new Array(100).fill(0);
  for (const u of subjects) perBucket[bucket('checkout-a', u) % 100]++;
  assert.ok(perBucket.every((n) => Math.abs(n - 100) <= 40), `uniform buckets: ${Math.min(...perBucket)}..${Math.max(...perBucket)}`);
});

// Chi-square statistic of the 2x2 contingency table of two 0/1 assignments over the same subjects.
function chiSquare2x2(subjects, x, y) {
  const t = [[0, 0], [0, 0]];
  for (const s of subjects) t[x(s)][y(s)]++;
  let chi = 0;
  for (const i of [0, 1]) for (const j of [0, 1]) {
    const expected = ((t[i][0] + t[i][1]) * (t[0][j] + t[1][j])) / subjects.length;
    chi += (t[i][j] - expected) ** 2 / expected;
  }
  return chi;
}

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

test('line diff ops and unified output match the shared vectors', async () => {
  const { diffLines, unifiedDiff } = await load('line-diff');
  for (const [a, b, expected] of DIFF_OPS) assert.deepEqual(diffLines(a, b), expected, JSON.stringify([a, b]));
  for (const [a, b, context, expected] of DIFF_UNIFIED) assert.equal(unifiedDiff(a, b, 'a', 'b', context), expected, JSON.stringify([a, b, context]));
  for (const context of [-1, 1.5]) assert.throws(() => unifiedDiff('a\n', 'b\n', 'a', 'b', context), RangeError);
  const big = 'x\n'.repeat(500001);
  assert.throws(() => diffLines(big, big), RangeError);
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
