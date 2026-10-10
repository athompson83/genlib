// SPDX-License-Identifier: Apache-2.0
// Wave 8 capability checks: line diff (v2), slugify and JSON Patch. Every vector is generated from the shared
// wave 8 reference vectors (caps9 vectors.json); keep them identical across languages.
import 'dart:convert';

import 'package:genlib_validation_example/json_patch.dart';
import 'package:genlib_validation_example/line_diff.dart';
import 'package:genlib_validation_example/slugify.dart';

import 'src/checks.dart';

String _show(String s) => s.replaceAll('\n', r'\n').replaceAll('\r', r'\r');

List<String> _lines(String t) {
  if (t.isEmpty) return const [];
  final p = t.split('\n');
  if (t.endsWith('\n')) p.removeLast();
  return p;
}

/// Rebuilds both texts' lines from the ops (`=` and `-` give a, `=` and `+` give b).
bool _rebuilds(String a, String b, List<DiffOp> ops) {
  bool same(List<String> x, List<String> y) => x.length == y.length && [for (var i = 0; i < x.length; i++) x[i] == y[i]].every((v) => v);
  return same(_lines(a), [for (final o in ops) if (o.$1 != '+') o.$2]) && same(_lines(b), [for (final o in ops) if (o.$1 != '-') o.$2]);
}

void runLineDiffTests(Checks c) {
  const lines = [
    ('', '', ''),
    ('a\n', 'a\n', '=a'),
    ('', 'a\n', '+a'),
    ('a\n', '', '-a'),
    ('a\nb\nc\n', 'a\nc\n', '=a|-b|=c'),
    ('a\nb\nc\n', 'a\nB\nc\n', '=a|-b|+B|=c'),
    ('a\nb', 'a\nb\n', '=a|-b|+b'),
    ('a\nb\n', 'a\nb', '=a|-b|+b'),
    ('x', 'y', '-x|+y'),
    ('a\n\nb\n', 'a\nb\n', '=a|-|=b'),
    ('1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n', '1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n', '=1|=2|-3|+X|=4|=5|=6|=7|=8|=9|=10|-11|+Y|=12'),
    ('a\nb\na\nb\n', 'b\na\nb\na\n', '-a|=b|=a|=b|+a'),
];
  for (final (a, b, expected) in lines) {
    final ops = diffLines(a, b);
    c.eq('diff lines ${_show(a)} -> ${_show(b)}', expected, ops.map((o) => '${o.$1}${o.$2}').join('|'));
    c.check('diff lines rebuild ${_show(a)} -> ${_show(b)}', _rebuilds(a, b, ops));
  }
  const unified = [
    ('', '', 3, ''),
    ('', '', 0, ''),
    ('', '', 1, ''),
    ('a\n', 'a\n', 3, ''),
    ('a\n', 'a\n', 0, ''),
    ('a\n', 'a\n', 1, ''),
    ('', 'a\n', 3, '--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n'),
    ('', 'a\n', 0, '--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n'),
    ('', 'a\n', 1, '--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n'),
    ('a\n', '', 3, '--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n'),
    ('a\n', '', 0, '--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n'),
    ('a\n', '', 1, '--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n'),
    ('a\nb\nc\n', 'a\nc\n', 3, '--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-b\n c\n'),
    ('a\nb\nc\n', 'a\nc\n', 0, '--- a\n+++ b\n@@ -2 +1,0 @@\n-b\n'),
    ('a\nb\nc\n', 'a\nc\n', 1, '--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-b\n c\n'),
    ('a\nb\nc\n', 'a\nB\nc\n', 3, '--- a\n+++ b\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n'),
    ('a\nb\nc\n', 'a\nB\nc\n', 0, '--- a\n+++ b\n@@ -2 +2 @@\n-b\n+B\n'),
    ('a\nb\nc\n', 'a\nB\nc\n', 1, '--- a\n+++ b\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n'),
    ('a\nb', 'a\nb\n', 3, '--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n'),
    ('a\nb', 'a\nb\n', 0, '--- a\n+++ b\n@@ -2 +2 @@\n-b\n\\ No newline at end of file\n+b\n'),
    ('a\nb', 'a\nb\n', 1, '--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n'),
    ('a\nb\n', 'a\nb', 3, '--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n'),
    ('a\nb\n', 'a\nb', 0, '--- a\n+++ b\n@@ -2 +2 @@\n-b\n+b\n\\ No newline at end of file\n'),
    ('a\nb\n', 'a\nb', 1, '--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n'),
    ('x', 'y', 3, '--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n'),
    ('x', 'y', 0, '--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n'),
    ('x', 'y', 1, '--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n'),
    ('a\n\nb\n', 'a\nb\n', 3, '--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-\n b\n'),
    ('a\n\nb\n', 'a\nb\n', 0, '--- a\n+++ b\n@@ -2 +1,0 @@\n-\n'),
    ('a\n\nb\n', 'a\nb\n', 1, '--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-\n b\n'),
    ('1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n', '1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n', 3, '--- a\n+++ b\n@@ -1,6 +1,6 @@\n 1\n 2\n-3\n+X\n 4\n 5\n 6\n@@ -8,5 +8,5 @@\n 8\n 9\n 10\n-11\n+Y\n 12\n'),
    ('1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n', '1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n', 0, '--- a\n+++ b\n@@ -3 +3 @@\n-3\n+X\n@@ -11 +11 @@\n-11\n+Y\n'),
    ('1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n', '1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n', 1, '--- a\n+++ b\n@@ -2,3 +2,3 @@\n 2\n-3\n+X\n 4\n@@ -10,3 +10,3 @@\n 10\n-11\n+Y\n 12\n'),
    ('a\nb\na\nb\n', 'b\na\nb\na\n', 3, '--- a\n+++ b\n@@ -1,4 +1,4 @@\n-a\n b\n a\n b\n+a\n'),
    ('a\nb\na\nb\n', 'b\na\nb\na\n', 0, '--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n@@ -4,0 +4 @@\n+a\n'),
    ('a\nb\na\nb\n', 'b\na\nb\na\n', 1, '--- a\n+++ b\n@@ -1,2 +1 @@\n-a\n b\n@@ -4 +3,2 @@\n b\n+a\n'),
    ('line 5\nline 5\nline 4\n', '}\nline 5\nline 4\n', 3, '--- a\n+++ b\n@@ -1,3 +1,3 @@\n-line 5\n+}\n line 5\n line 4\n'),
    ('line 5\nline 5\nline 4\n', '}\nline 5\nline 4\n', 0, '--- a\n+++ b\n@@ -1 +1 @@\n-line 5\n+}\n'),
    ('line 5\nline 5\nline 4\n', '}\nline 5\nline 4\n', 1, '--- a\n+++ b\n@@ -1,2 +1,2 @@\n-line 5\n+}\n line 5\n'),
    ('{\n}\n{\n}\n', '{\n}\n{\nx\n}\n{\n}\n', 3, '--- a\n+++ b\n@@ -1,4 +1,7 @@\n {\n }\n {\n+x\n }\n+{\n+}\n'),
    ('{\n}\n{\n}\n', '{\n}\n{\nx\n}\n{\n}\n', 0, '--- a\n+++ b\n@@ -3,0 +4 @@\n+x\n@@ -4,0 +6,2 @@\n+{\n+}\n'),
    ('{\n}\n{\n}\n', '{\n}\n{\nx\n}\n{\n}\n', 1, '--- a\n+++ b\n@@ -3,2 +3,5 @@\n {\n+x\n }\n+{\n+}\n'),
    ('same\nsame\nsame\n', 'same\nsame\n', 3, '--- a\n+++ b\n@@ -1,3 +1,2 @@\n same\n same\n-same\n'),
    ('same\nsame\nsame\n', 'same\nsame\n', 0, '--- a\n+++ b\n@@ -3 +2,0 @@\n-same\n'),
    ('same\nsame\nsame\n', 'same\nsame\n', 1, '--- a\n+++ b\n@@ -2,2 +2 @@\n same\n-same\n'),
    ('p\nq\nr\n', 'a\nb\nc\n', 3, '--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n'),
    ('p\nq\nr\n', 'a\nb\nc\n', 0, '--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n'),
    ('p\nq\nr\n', 'a\nb\nc\n', 1, '--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n'),
    ('line 0\nline 4\nline 3\nline 3\nline 2\nline 1\n    return x\n', 'line 4\nline 2\n{\nline 1\nline 3\n', 3, '--- a\n+++ b\n@@ -1,7 +1,5 @@\n-line 0\n line 4\n-line 3\n-line 3\n line 2\n+{\n line 1\n-    return x\n+line 3\n'),
    ('    return x\nline 2\nline 0\nline 0\n\nline 0\nline 2\n    return x\nline 2\n}\nline 2\n    return x\nline 0\n', '    return x\nline 2\nline 0\nline 0\nline 0\nline 2\n    return x\nline 2\n}\n}\nline 2\n    return x\n{\nline 0\n', 3, '--- a\n+++ b\n@@ -2,12 +2,13 @@\n line 2\n line 0\n line 0\n-\n line 0\n line 2\n     return x\n line 2\n }\n+}\n line 2\n     return x\n+{\n line 0\n'),
    ('line 2\nline 5\nline 5\nline 3\n{\nline 4\n    return x\n{\n{\nline 1\n}\n{\nline 2\n\n    return x\nline 3\nline 2\nline 7\nline 6\nline 4\n{\n    return x\n', 'line 2\nline 3\nline 5\nline 5\nline 3\n{\n    return x\n{\n{\nline 1\n}\nline 5\nline 2\n\n    return x\nline 3\nline 2\nline 7\nline 6\nline 4\n{\n    return x\n\n', 3, '--- a\n+++ b\n@@ -1,15 +1,15 @@\n line 2\n+line 3\n line 5\n line 5\n line 3\n {\n-line 4\n     return x\n {\n {\n line 1\n }\n-{\n+line 5\n line 2\n \n     return x\n@@ -20,3 +20,4 @@\n line 4\n {\n     return x\n+\n'),
    ('line 3\n    return x\n\nline 6\n    return x\n\nline 2\nline 4\nline 2\nline 3\n}\n}\nline 4\n{\nline 6\n{\nline 6\nline 5\nline 3\nline 2\n', 'line 3\nline 1\n    return x\nline 0\nline 6\n\nline 2\nline 4\nline 2\nline 3\n}\n}\n{\n{\n}\nline 6\n{\nline 4\nline 5\nline 3\nline 2\n', 3, '--- a\n+++ b\n@@ -1,8 +1,8 @@\n line 3\n+line 1\n     return x\n-\n+line 0\n line 6\n-    return x\n \n line 2\n line 4\n@@ -10,11 +10,12 @@\n line 3\n }\n }\n-line 4\n {\n+{\n+}\n line 6\n {\n-line 6\n+line 4\n line 5\n line 3\n line 2\n'),
    ('line 2\n    return x\nline 0\n\nline 2\nline 1\n\nline 3\nline 2\n}\nline 2\nline 0\n}\n    return x\nline 0\nline 1\n}\n\nline 3\nline 0\nline 3\nline 1\nline 1\n    return x\nline 1\nline 2\nline 2\n', '    return x\nline 0\n\nline 2\nline 1\n\nline 2\n}\nline 2\nline 0\n}\n    return x\n    return x\nline 0\nline 1\n}\n\nline 3\n{\nline 0\nline 3\nline 1\n    return x\nline 1\nline 2\nline 2\n', 3, '--- a\n+++ b\n@@ -1,26 +1,25 @@\n-line 2\n     return x\n line 0\n \n line 2\n line 1\n \n-line 3\n line 2\n }\n line 2\n line 0\n }\n     return x\n+    return x\n line 0\n line 1\n }\n \n line 3\n+{\n line 0\n line 3\n line 1\n-line 1\n     return x\n line 1\n line 2\n'),
    ('', 'line 1\n', 3, '--- a\n+++ b\n@@ -0,0 +1 @@\n+line 1\n'),
    ('line 0\n{\nline 1\n\n    return x\n}\nline 1\n{\nline 1\n    return x\n{\n{\n}\nline 1\n}\n}\nline 1\nline 0\nline 0\n    return x\n}\n', 'line 0\nline 0\nline 1\n\n    return x\n}\n{\nline 1\n    return x\nline 0\n{\n{\n}\nline 1\n    return x\n}\n}\nline 1\nline 0\nline 0\n}\n', 3, '--- a\n+++ b\n@@ -1,21 +1,21 @@\n line 0\n-{\n+line 0\n line 1\n \n     return x\n }\n-line 1\n {\n line 1\n     return x\n+line 0\n {\n {\n }\n line 1\n+    return x\n }\n }\n line 1\n line 0\n line 0\n-    return x\n }\n'),
    ('\nline 1\n    return x\nline 0\n\n    return x\n    return x\n    return x\n}\nline 0\nline 0\n{\n}\n    return x\nline 0\nline 0\n    return x', 'line 1\n    return x\nline 0\n\n    return x\n    return x\n    return x\n}\nline 0\nline 0\n{\nline 0\n}\n    return x\nline 0\n    return x\n', 3, '--- a\n+++ b\n@@ -1,4 +1,3 @@\n-\n line 1\n     return x\n line 0\n@@ -10,8 +9,8 @@\n line 0\n line 0\n {\n+line 0\n }\n     return x\n line 0\n-line 0\n-    return x\n\\ No newline at end of file\n+    return x\n'),
    ('line 4\nline 6\n    return x\n    return x\n\n{\n    return x\nline 7\nline 2\nline 3\nline 4\nline 3\nline 0\n}\n    return x\n\nline 0\n    return x\nline 5\nline 0\nline 0\n}\nline 7\n\n\nline 2\nline 0\n\nline 1\n', 'line 4\nline 6\n    return x\n\n{\n    return x\nline 7\nline 6\nline 2\nline 3\nline 4\nline 3\nline 0\n}\n    return x\n\nline 0\n    return x\nline 5\nline 0\nline 0\n}\nline 7\n\n\nline 2\nline 0\n\nline 1', 3, '--- a\n+++ b\n@@ -1,11 +1,11 @@\n line 4\n line 6\n     return x\n-    return x\n \n {\n     return x\n line 7\n+line 6\n line 2\n line 3\n line 4\n@@ -26,4 +26,4 @@\n line 2\n line 0\n \n-line 1\n+line 1\n\\ No newline at end of file\n'),
    ('}\nline 0\n}\nline 0\n\n{\n}\n}\n}\nline 2\nline 2\nline 1\n{\n{\nline 2\nline 1\nline 2\n\nline 1\n{\n{\nline 2\n\nline 2\n    return x\nline 0\nline 0\n\n}\n}\nline 0\nline 0\n}\nline 1\n}\nline 2\nline 1', '}\nline 0\n}\nline 0\n\n{\n}\n}\n}\nline 2\nline 2\nline 1\n{\n{\nline 2\nline 1\nline 2\n\nline 1\n{\n{\nline 2\n\nline 1\n    return x\nline 0\nline 0\n\n}\nline 0\nline 0\n}\nline 1\nline 0\n}\nline 2\nline 2\nline 1\n', 3, '--- a\n+++ b\n@@ -21,17 +21,18 @@\n {\n line 2\n \n-line 2\n+line 1\n     return x\n line 0\n line 0\n \n }\n-}\n line 0\n line 0\n }\n line 1\n+line 0\n }\n line 2\n-line 1\n\\ No newline at end of file\n+line 2\n+line 1\n'),
    ('line 0\nline 0\n{\n}\nline 1\nline 2\nline 2\n}\nline 1\n{\nline 2\nline 1\n{\n{\n    return x\nline 2\n', 'line 0\nline 0\nline 0\nline 0\nline 1\nline 2\nline 2\nline 0\nline 1\n}\nline 1\n}\n{\nline 2\nline 1\n{\n{\n    return x\n{\nline 2\n', 3, '--- a\n+++ b\n@@ -1,16 +1,20 @@\n line 0\n line 0\n-{\n-}\n+line 0\n+line 0\n line 1\n line 2\n line 2\n+line 0\n+line 1\n }\n line 1\n+}\n {\n line 2\n line 1\n {\n {\n     return x\n+{\n line 2\n'),
    ('\nline 0\n\nline 1\n    return x\nline 1\n    return x\nline 0\n\n{\n}\n{\n    return x\nline 1\nline 1\nline 1\nline 1\n}\nline 0\n', '\nline 0\n\nline 1\n    return x\nline 1\n    return x\n    return x\n\n{\n}\n}\n{\n    return x\nline 1\nline 1\nline 1\nline 1\n}\nline 0\n', 3, '--- a\n+++ b\n@@ -5,10 +5,11 @@\n     return x\n line 1\n     return x\n-line 0\n+    return x\n \n {\n }\n+}\n {\n     return x\n line 1\n'),
    ('line 0\n}\nline 1\nline 1\n}\n\n\nline 1\nline 1\nline 0\n    return x\nline 1\n}\n\n\nline 0\n\n\n    return x\n{\n}\n    return x\n{\n\n', 'line 0\n}\nline 1\nline 1\n}\n\n\nline 1\nline 1\nline 0\n    return x\nline 1\n}\n\n\nline 0\n\n\n    return x\n{\n}\n    return x\n{\n', 3, '--- a\n+++ b\n@@ -21,4 +21,3 @@\n }\n     return x\n {\n-\n'),
    ('line 2\nline 0\nline 0\n}\n\nline 2\n{\n    return x\nline 2\n\n}\n}\nline 0\n\n}\nline 1\nline 2\nline 0\n{\n\nline 0\n}\n    return x\n}\n{\n{\n{\n{\n{\nline 1\nline 2\n\nline 0\n{\nline 2\n}\nline 2\n', 'line 2\nline 0\nline 0\n}\n\nline 2\n{\n    return x\nline 2\n\n}\n}\nline 0\n\n}\nline 1\nline 2\nline 0\n{\n}\n\nline 0\n}\n    return x\n}\n{\n{\n{\n{\n{\nline 1\nline 2\n\nline 0\n{\nline 2\n}\nline 2\n', 3, '--- a\n+++ b\n@@ -17,6 +17,7 @@\n line 2\n line 0\n {\n+}\n \n line 0\n }\n'),
    ('    return x\nline 2\nline 3\n}\n}\nline 2\nline 4\n}\n    return x\nline 0\nline 4\nline 4\nline 3\n}\n\n{\n{\n{\n', '    return x\nline 2\nline 3\n}\n}\nline 1\nline 2\n}\n    return x\nline 4\nline 4\nline 3\n}\n\n{\n{\n{\n', 3, '--- a\n+++ b\n@@ -3,11 +3,10 @@\n line 3\n }\n }\n+line 1\n line 2\n-line 4\n }\n     return x\n-line 0\n line 4\n line 4\n line 3\n'),
    ('line 0\nline 0\nline 1\n\n}\n    return x\n    return x\nline 0\n\n', '    return x\nline 0\nline 0\n}\n}\n    return x\nline 0\n    return x\n\n', 3, '--- a\n+++ b\n@@ -1,9 +1,9 @@\n+    return x\n line 0\n line 0\n-line 1\n-\n }\n-    return x\n+}\n     return x\n line 0\n+    return x\n \n'),
    ('line 7\nline 2\nline 7\n{\n\n\n}\n', 'line 7\nline 2\nline 7\n\nline 3\nline 7\n\n    return x\n', 3, '--- a\n+++ b\n@@ -1,7 +1,8 @@\n line 7\n line 2\n line 7\n-{\n \n+line 3\n+line 7\n \n-}\n+    return x\n'),
    ('line 7\n{\nline 3\nline 4\nline 7\nline 1\n    return x\nline 4\nline 3\nline 4\nline 5\nline 5\n\nline 1\nline 2\nline 2\nline 3\nline 6\n    return x\nline 2\n    return x\nline 3\nline 1\nline 6\nline 6\nline 5\n\nline 7\nline 6\nline 0\nline 3\nline 6\nline 6', 'line 7\n{\nline 3\nline 4\nline 7\nline 1\n    return x\nline 4\nline 3\nline 4\nline 5\nline 5\n\nline 1\nline 2\nline 2\nline 3\nline 6\n    return x\nline 2\n    return x\nline 3\nline 1\nline 6\nline 6\nline 5\n\nline 7\nline 6\nline 0\nline 3\nline 6\nline 6\n', 3, '--- a\n+++ b\n@@ -30,4 +30,4 @@\n line 0\n line 3\n line 6\n-line 6\n\\ No newline at end of file\n+line 6\n'),
    ('line 0\n\nline 4\n}\n}\n    return x\n    return x\nline 3\n{\nline 3\nline 4\n}\n{\nline 0\n}\n\n}\nline 2\n{\nline 2\n    return x\nline 0\n}\nline 0\nline 1\n}\nline 2\n{\nline 2\nline 0\n', 'line 0\n\nline 4\n}\n}\n    return x\nline 3\n{\nline 3\nline 4\n}\n}\n{\nline 0\n}\n\n}\nline 2\n{\nline 2\n    return x\nline 0\n}\nline 0\nline 1\n}\nline 1\n{\nline 2\nline 0\n', 3, '--- a\n+++ b\n@@ -4,12 +4,12 @@\n }\n }\n     return x\n-    return x\n line 3\n {\n line 3\n line 4\n }\n+}\n {\n line 0\n }\n@@ -24,7 +24,7 @@\n line 0\n line 1\n }\n-line 2\n+line 1\n {\n line 2\n line 0\n'),
    ('line 1\n    return x\nline 0\n    return x\nline 0\nline 0\nline 1\nline 1\nline 0\n{\nline 1\nline 1\nline 1\n}\n    return x\nline 0\n{\nline 1\n}\n    return x\n\n\n', 'line 1\n    return x\nline 0\n    return x\nline 0\n\nline 0\nline 1\nline 1\nline 0\n{\nline 1\nline 1\nline 1\n}\n    return x\nline 0\n{\nline 1\n}\n    return x\n\n\nline 0\n', 3, '--- a\n+++ b\n@@ -3,6 +3,7 @@\n line 0\n     return x\n line 0\n+\n line 0\n line 1\n line 1\n@@ -20,3 +21,4 @@\n     return x\n \n \n+line 0\n'),
    ('{\n{\nline 3\nline 1\nline 3\nline 1\n\nline 1\nline 0\n}\n{\n}\nline 1\n}\nline 0\n{\n    return x\nline 1\n{\n}\n    return x\nline 2\n{\nline 2\n\n    return x\n    return x\n{\n\n}\nline 3\nline 1\n\n    return x\nline 3\n    return x\n', '{\n{\nline 3\nline 1\nline 3\nline 1\n\nline 1\nline 0\n}\n{\n}\nline 1\n}\nline 0\n{\nline 1\n}\n    return x\nline 2\n{\nline 2\n\n    return x\n    return x\n{\n}\nline 3\nline 2\n    return x\nline 3\n    return x\nline 3\n', 3, '--- a\n+++ b\n@@ -14,9 +14,7 @@\n }\n line 0\n {\n-    return x\n line 1\n-{\n }\n     return x\n line 2\n@@ -26,11 +24,10 @@\n     return x\n     return x\n {\n-\n }\n line 3\n-line 1\n-\n+line 2\n     return x\n line 3\n     return x\n+line 3\n'),
    ('    return x\n\n\nline 0\nline 1\nline 4\nline 3\nline 6\nline 3\nline 4\n    return x\n{\nline 5\n\n}\n}\nline 5\nline 6\n}\nline 5\nline 5\n\nline 4\nline 4\nline 4\nline 3\nline 1\nline 3\nline 5\nline 1\n', '    return x\n\n\nline 1\nline 4\nline 2\nline 6\nline 4\nline 4\n{\nline 5\n\n}\nline 5\nline 6\n}\nline 5\nline 4\nline 4\nline 4\nline 3\nline 1\nline 3\nline 5\nline 1\n', 3, '--- a\n+++ b\n@@ -1,25 +1,20 @@\n     return x\n \n \n-line 0\n line 1\n line 4\n-line 3\n+line 2\n line 6\n-line 3\n line 4\n-    return x\n+line 4\n {\n line 5\n \n }\n-}\n line 5\n line 6\n }\n line 5\n-line 5\n-\n line 4\n line 4\n line 4\n'),
    ('\n    return x\nline 1\n    return x\n}\nline 0\nline 0\n{\n\n}\n}\n}\n\nline 1\nline 0\n\n}\nline 0\nline 0\n}\n}\nline 0\n{\n    return x\n    return x\nline 0\nline 1\nline 1\n{\n\nline 0\nline 1\nline 0\n{\n}\n', '\n    return x\nline 1\n}\nline 0\nline 0\n{\n\n}\n}\n}\n\nline 1\nline 0\n\n}\nline 0\nline 0\n}\n}\nline 0\n{\n    return x\n}\n    return x\nline 0\n\nline 1\n{\n\nline 0\nline 1\nline 0\n{\n}\n', 3, '--- a\n+++ b\n@@ -1,7 +1,6 @@\n \n     return x\n line 1\n-    return x\n }\n line 0\n line 0\n@@ -22,9 +21,10 @@\n line 0\n {\n     return x\n+}\n     return x\n line 0\n-line 1\n+\n line 1\n {\n \n'),
    ('{\nline 3\nline 4\n{\nline 1\nline 2\nline 3\nline 2\n\nline 1\nline 2\nline 0\nline 6\n', '{\nline 3\nline 4\nline 2\nline 3\nline 4\nline 2\n\nline 1\n{\nline 7\nline 0\nline 6', 3, '--- a\n+++ b\n@@ -1,13 +1,13 @@\n {\n line 3\n line 4\n-{\n-line 1\n line 2\n line 3\n+line 4\n line 2\n \n line 1\n-line 2\n+{\n+line 7\n line 0\n-line 6\n+line 6\n\\ No newline at end of file\n'),
    ('line 1\nline 0\nline 2\nline 4\n}\n    return x\n}\nline 4\nline 7\n', 'line 1\nline 0\nline 2\nline 4\n    return x\n}\n    return x\n}\nline 4\nline 7\n', 3, '--- a\n+++ b\n@@ -2,6 +2,7 @@\n line 0\n line 2\n line 4\n+    return x\n }\n     return x\n }\n'),
    ('}\nline 1\n    return x\nline 0\n\nline 5\n    return x\nline 4\nline 0\nline 1\nline 3\n    return x\n    return x\nline 0\nline 4\n    return x\nline 0\nline 2\n}\n{\n}\nline 4\nline 2\n    return x\n\n}\nline 1\n}\nline 5\n\nline 5\n', '}\nline 1\n    return x\nline 0\n\n    return x\nline 4\nline 0\nline 1\nline 5\nline 3\n    return x\n    return x\nline 0\nline 4\n    return x\nline 0\nline 2\n}\n{\nline 4\nline 2\n    return x\n{\n\n}\nline 1\n}\nline 5\n\nline 4\nline 5\n', 3, '--- a\n+++ b\n@@ -3,11 +3,11 @@\n     return x\n line 0\n \n-line 5\n     return x\n line 4\n line 0\n line 1\n+line 5\n line 3\n     return x\n     return x\n@@ -18,14 +18,15 @@\n line 2\n }\n {\n-}\n line 4\n line 2\n     return x\n+{\n \n }\n line 1\n }\n line 5\n \n+line 4\n line 5\n'),
    ('line 0\n{\n\nline 7\nline 6\nline 0\nline 3\n\nline 5\n}\nline 7\n{\nline 7\nline 0\nline 3\nline 4\n\nline 2\nline 4\nline 7\n    return x\nline 7\nline 1\nline 0\n{\n}\nline 3\n    return x\nline 2\nline 4\n\nline 0\n', 'line 0\n{\n\nline 7\nline 6\nline 0\nline 3\n{\nline 1\n\nline 6\nline 5\n}\nline 7\n{\nline 7\nline 0\nline 7\nline 3\nline 6\nline 4\nline 7\nline 2\nline 4\nline 7\n    return x\nline 7\nline 1\nline 0\n{\n}\nline 3\n    return x\nline 4\n\nline 0\n', 3, '--- a\n+++ b\n@@ -5,16 +5,21 @@\n line 6\n line 0\n line 3\n+{\n+line 1\n \n+line 6\n line 5\n }\n line 7\n {\n line 7\n line 0\n+line 7\n line 3\n+line 6\n line 4\n-\n+line 7\n line 2\n line 4\n line 7\n@@ -26,7 +31,6 @@\n }\n line 3\n     return x\n-line 2\n line 4\n \n line 0\n'),
    ('    return x\nline 4\nline 0\nline 4\nline 4\n{\nline 2\n{\n    return x\n{\n\n\n    return x\n    return x\n}\n{\n\nline 3\nline 3\n}\nline 3\n', '    return x\nline 4\nline 0\n{\nline 4\n{\nline 2\n{\n    return x\n{\n\n\n}\n    return x\n    return x\nline 2\nline 2\nline 3\nline 3\n}\nline 3\n', 3, '--- a\n+++ b\n@@ -1,7 +1,7 @@\n     return x\n line 4\n line 0\n-line 4\n+{\n line 4\n {\n line 2\n@@ -10,11 +10,11 @@\n {\n \n \n+}\n     return x\n     return x\n-}\n-{\n-\n+line 2\n+line 2\n line 3\n line 3\n }\n'),
    ('line 6\n    return x\nline 2\nline 1\n\nline 4\nline 5\n{\nline 6\n', 'line 6\n    return x\nline 2\nline 1\n\nline 4\nline 5\n{\n    return x\n', 3, '--- a\n+++ b\n@@ -6,4 +6,4 @@\n line 4\n line 5\n {\n-line 6\n+    return x\n'),
    ('}\nline 0\n{\nline 1\nline 3\n    return x\n    return x\nline 4\nline 3\nline 1\nline 6\nline 1\n    return x\nline 1\n\nline 2\nline 4\nline 0\nline 0\nline 5\nline 0\nline 4\nline 5\nline 5\nline 6\nline 2\nline 3\n}\nline 6\n{\n    return x\n', '}\nline 0\nline 1\nline 3\n    return x\n    return x\nline 4\nline 3\nline 1\nline 6\nline 1\n    return x\n{\nline 1\n\nline 2\nline 4\nline 0\nline 0\nline 5\nline 0\nline 4\nline 5\nline 5\nline 6\nline 2\nline 3\n}\nline 6\n{\n    return x\n', 3, '--- a\n+++ b\n@@ -1,6 +1,5 @@\n }\n line 0\n-{\n line 1\n line 3\n     return x\n@@ -11,6 +10,7 @@\n line 6\n line 1\n     return x\n+{\n line 1\n \n line 2\n'),
    ('line 3\n}\nline 4\n}\nline 4\nline 0\n}\nline 4\n{\n', 'line 3\n}\nline 4\n}\nline 4\n}\nline 4\n{\n', 3, '--- a\n+++ b\n@@ -3,7 +3,6 @@\n line 4\n }\n line 4\n-line 0\n }\n line 4\n {\n'),
    ('{\n    return x\nline 1\nline 3\n{\n}\n\n\nline 0\n{\n\nline 0', '{\n    return x\nline 1\nline 3\n{\n}\n\n\nline 0\n{\n\nline 0\n', 3, '--- a\n+++ b\n@@ -9,4 +9,4 @@\n line 0\n {\n \n-line 0\n\\ No newline at end of file\n+line 0\n'),
    ('line 3\n}\nline 5\nline 3\n{\nline 3\n}\nline 4\n{\n    return x\n{\n{\nline 2\n{\nline 1\n{\n{\nline 0\n', 'line 3\n}\n}\nline 5\n{\nline 3\n}\nline 4\n{\n{\n{\nline 2\n{\n{\n{\nline 0\n', 3, '--- a\n+++ b\n@@ -1,18 +1,16 @@\n line 3\n }\n+}\n line 5\n-line 3\n {\n line 3\n }\n line 4\n {\n-    return x\n {\n {\n line 2\n {\n-line 1\n {\n {\n line 0\n'),
    ('{\n{\nline 4\nline 2\nline 4\n}\nline 4\nline 5\nline 1\n}\nline 1\nline 2\nline 3\n\n{\nline 5\nline 1\n\nline 0\nline 4\n{\nline 1\n}\n', '{\n{\nline 4\nline 2\nline 4\n}\nline 4\nline 1\n}\nline 1\nline 2\nline 3\n\n{\nline 5\nline 1\n\nline 0\nline 4\nline 5\n{\nline 4\nline 1\n}\n', 3, '--- a\n+++ b\n@@ -5,7 +5,6 @@\n line 4\n }\n line 4\n-line 5\n line 1\n }\n line 1\n@@ -18,6 +17,8 @@\n \n line 0\n line 4\n+line 5\n {\n+line 4\n line 1\n }\n'),
    ('    return x\nline 4\n{\nline 6\nline 1\nline 2\nline 0\nline 0\nline 4\nline 7\nline 1\nline 1\nline 3\n\nline 2\nline 6\nline 7\nline 5\n{\n    return x\n    return x\n\nline 6\n}\n    return x\n    return x\nline 2\nline 6\n{', '    return x\nline 4\n{\nline 6\nline 1\nline 2\nline 0\nline 0\nline 4\nline 7\nline 1\nline 1\nline 3\n}\nline 2\nline 6\nline 7\nline 5\n{\n    return x\n    return x\n\nline 6\n}\n    return x\n    return x\nline 2\nline 6\n{\n', 3, '--- a\n+++ b\n@@ -11,7 +11,7 @@\n line 1\n line 1\n line 3\n-\n+}\n line 2\n line 6\n line 7\n@@ -26,4 +26,4 @@\n     return x\n line 2\n line 6\n-{\n\\ No newline at end of file\n+{\n'),
    ('line 3\n\n\nline 3\nline 5\nline 1\n    return x\nline 5\n}\n    return x\nline 5\nline 0\nline 6\nline 4\nline 3\nline 1\n\nline 1\n    return x\nline 3\n    return x\n    return x\n{\n', 'line 3\n\n\nline 3\nline 5\nline 1\n    return x\nline 5\n}\n    return x\nline 5\nline 0\nline 6\nline 4\nline 3\nline 1\n\nline 1\n    return x\nline 3\n    return x\n    return x\n{\n', 3, ''),
    ('line 1\nline 0\n    return x\n    return x\n}\nline 1\n}\nline 1\n    return x\n    return x\nline 1\nline 2\n    return x\nline 1\n    return x\n}\nline 0\nline 2\n    return x\nline 1\nline 1\n}\nline 2\n    return x\nline 1\nline 0\n{\n    return x\nline 0\nline 1\nline 0\nline 2\n    return x\n    return x\nline 1\n}\n', 'line 1\nline 0\n    return x\n    return x\n\n}\nline 1\n}\nline 1\n    return x\n    return x\nline 1\nline 2\n    return x\nline 1\n    return x\n}\nline 2\n    return x\nline 1\nline 1\n}\nline 2\n}\n    return x\nline 1\nline 0\n{\n}\nline 0\nline 1\nline 0\nline 2\n    return x\n    return x\nline 1\n}\n', 3, '--- a\n+++ b\n@@ -2,6 +2,7 @@\n line 0\n     return x\n     return x\n+\n }\n line 1\n }\n@@ -14,18 +15,18 @@\n line 1\n     return x\n }\n-line 0\n line 2\n     return x\n line 1\n line 1\n }\n line 2\n+}\n     return x\n line 1\n line 0\n {\n-    return x\n+}\n line 0\n line 1\n line 0\n'),
    ('line 4\n\n    return x\nline 0\nline 0\n\nline 6\nline 6\n    return x\nline 1\n\n\nline 1\nline 1\nline 5\n{\nline 2\nline 1\nline 2\nline 4\n{\n    return x\n{\n}\nline 5\nline 6\n{\n}\nline 4\n\n}\n{\nline 6\n', 'line 4\n\n    return x\nline 0\nline 0\n\nline 6\n    return x\nline 6\n    return x\nline 1\n\n\nline 1\nline 1\nline 5\n{\nline 2\nline 1\nline 2\nline 4\n{\n    return x\n{\n}\nline 5\nline 6\n{\n}\nline 4\n\n}\n{\nline 6\n', 3, '--- a\n+++ b\n@@ -5,6 +5,7 @@\n line 0\n \n line 6\n+    return x\n line 6\n     return x\n line 1\n'),
    ('line 6\n\nline 3\nline 6\nline 5\n\nline 6\nline 6\nline 1\nline 5\nline 6\nline 5\n    return x\n', 'line 6\nline 5\n\nline 6\nline 6\nline 1\nline 1\nline 5\nline 6\nline 5\n    return x\n', 3, '--- a\n+++ b\n@@ -1,12 +1,10 @@\n line 6\n-\n-line 3\n-line 6\n line 5\n \n line 6\n line 6\n line 1\n+line 1\n line 5\n line 6\n line 5\n'),
    ('line 0\n}\n}\n}\nline 2\n{\nline 0\n\nline 2\n    return x\n{\n    return x\n\n    return x\n{\nline 0\nline 2\n}\nline 2\nline 2\nline 0\n}\n}\nline 1\nline 1\n{\n\nline 1\n    return x\nline 0\nline 2\n    return x\n}\nline 2\nline 0', 'line 0\n}\n}\n}\nline 2\n{\nline 0\n\nline 2\n    return x\n{\n    return x\n\n    return x\n{\nline 0\nline 2\nline 0\n}\nline 2\nline 0\n}\n}\nline 1\nline 1\n{\n\n    return x\nline 1\n    return x\nline 0\nline 2\n    return x\n}\nline 2\nline 0\nline 0\n', 3, '--- a\n+++ b\n@@ -15,9 +15,9 @@\n {\n line 0\n line 2\n+line 0\n }\n line 2\n-line 2\n line 0\n }\n }\n@@ -25,6 +25,7 @@\n line 1\n {\n \n+    return x\n line 1\n     return x\n line 0\n@@ -32,4 +33,5 @@\n     return x\n }\n line 2\n-line 0\n\\ No newline at end of file\n+line 0\n+line 0\n'),
];
  for (final (a, b, context, expected) in unified) {
    c.eq('unified diff ${_show(a)} -> ${_show(b)} context $context', expected, unifiedDiff(a, b, context: context));
    c.check('diff rebuild ${_show(a)} -> ${_show(b)}', _rebuilds(a, b, diffLines(a, b)));
  }
  c.throws<ArgumentError>('diff too large', () => diffLines('\n' * 500001, '\n' * 500000));
  c.throws<RangeError>('diff negative context', () => unifiedDiff('a\n', 'b\n', context: -1));
  final bigA = StringBuffer(), bigB = StringBuffer();
  for (var i = 0; i < 100000; i++) {
    bigA.write('line $i\n');
    bigB.write('${i % 5000 == 2500 ? 'edited' : 'line'} $i\n');
  }
  final watch = Stopwatch()..start();
  final bigOps = diffLines(bigA.toString(), bigB.toString());
  watch.stop();
  c.check('diff 100,000 lines with 20 edits under 10 s (${watch.elapsedMilliseconds} ms)', watch.elapsed.inSeconds < 10);
  c.check('diff 100,000 lines: 20 deletions and 20 insertions',
      bigOps.where((o) => o.$1 == '-').length == 20 && bigOps.where((o) => o.$1 == '+').length == 20 && bigOps.length == 100020);
  c.check('diff 100,000 lines rebuild', _rebuilds(bigA.toString(), bigB.toString(), bigOps));
  final noA = StringBuffer(), noB = StringBuffer();
  for (var i = 0; i < 3000; i++) {
    noA.write('a$i\n');
    noB.write('b$i\n');
  }
  final noOps = diffLines(noA.toString(), noB.toString());
  c.check('diff 3,000 lines with no common line',
      noOps.where((o) => o.$1 == '-').length == 3000 && noOps.where((o) => o.$1 == '+').length == 3000 && noOps.length == 6000);
}

void runSlugifyTests(Checks c) {
  const cases = [
    ('Hello, World!', '-', 0, 'hello-world'),
    ('Cr\u{E8}me br\u{FB}l\u{E9}e & Caf\u{E9}', '-', 0, 'creme-brulee-cafe'),
    ('Stra\u{DF}e in \u{141}\u{F3}d\u{17A}', '-', 0, 'strasse-in-lodz'),
    ('don\'t stop', '-', 0, 'dont-stop'),
    ('don\u{2019}t stop', '-', 0, 'dont-stop'),
    ('  --Already--slugged--  ', '-', 0, 'already-slugged'),
    ('\u{65E5}\u{672C}\u{8A9E} title 2026', '-', 0, 'title-2026'),
    ('\u{C6}r\u{F8}sk\u{F8}bing \u{152}UVRE', '-', 0, 'aeroskobing-oeuvre'),
    ('Cre\u{300}me bru\u{302}le\u{301}e', '-', 0, 'creme-brulee'),
    ('\u{C0}\u{C1}\u{C2}\u{C3}\u{C4}\u{C5} \u{E0}\u{E1}\u{E2}\u{E3}\u{E4}\u{E5} \u{C7}\u{E7} \u{D1}\u{F1}', '-', 0, 'aaaaaa-aaaaaa-cc-nn'),
    ('\u{132}ssel \u{140} \u{138} \u{17F} \u{149}', '-', 0, 'ijssel-l-q-s-n'),
    ('C# and C++', '-', 0, 'c-and-c'),
    ('100% pure', '-', 0, '100-pure'),
    ('', '-', 0, ''),
    ('---', '-', 0, ''),
    ('a_b.c-d', '-', 0, 'a-b-c-d'),
    ('Emoji \u{1F600} test', '-', 0, 'emoji-test'),
    ('\u{FF26}\u{FF55}\u{FF4C}\u{FF4C} width', '-', 0, 'width'),
    ('\u{1C5}emal (outside the table)', '-', 0, 'emal-outside-the-table'),
    ('\u{FF} \u{178}', '-', 0, 'y-y'),
    ('MiXeD CaSe 42', '-', 0, 'mixed-case-42'),
    ('Hello, World!', '_', 0, 'hello_world'),
    ('Hello, World!', '.', 0, 'hello.world'),
    ('Cr\u{E8}me br\u{FB}l\u{E9}e & Caf\u{E9}', '_', 0, 'creme_brulee_cafe'),
    ('Cr\u{E8}me br\u{FB}l\u{E9}e & Caf\u{E9}', '.', 0, 'creme.brulee.cafe'),
    ('Stra\u{DF}e in \u{141}\u{F3}d\u{17A}', '_', 0, 'strasse_in_lodz'),
    ('Stra\u{DF}e in \u{141}\u{F3}d\u{17A}', '.', 0, 'strasse.in.lodz'),
    ('don\'t stop', '_', 0, 'dont_stop'),
    ('don\'t stop', '.', 0, 'dont.stop'),
    ('The quick brown fox jumps', '-', 12, 'the-quick'),
    ('The quick brown fox jumps', '-', 9, 'the-quick'),
    ('The quick brown fox jumps', '-', 10, 'the-quick'),
    ('Supercalifragilistic', '-', 5, 'super'),
    ('ab cd', '-', 3, 'ab'),
    ('ab cd', '-', 2, 'ab'),
    ('ab cd', '-', 5, 'ab-cd'),
    ('ab cd', '-', 100, 'ab-cd'),
    ('a b', '-', 1, 'a'),
];
  for (final (text, separator, maxLength, expected) in cases) {
    c.eq('slugify \'$text\' \'$separator\' $maxLength', expected, slugify(text, separator: separator, maxLength: maxLength));
  }
  const invalid = [
    ('x', '/', 0),
    ('x', '', 0),
    ('x', '--', 0),
    ('x', '-', -1),
];
  for (final (text, separator, maxLength) in invalid) {
    c.throws<ArgumentError>('slugify invalid \'$separator\' $maxLength', () => slugify(text, separator: separator, maxLength: maxLength));
  }
  const unique = [
    ('post', <String>{}, 'post'),
    ('post', <String>{'post'}, 'post-2'),
    ('post', <String>{'post', 'post-2', 'post-3'}, 'post-4'),
    ('post', <String>{'post-2'}, 'post'),
    ('a', <String>{'a', 'a-2', 'a-4'}, 'a-3'),
];
  for (final (base, taken, expected) in unique) {
    c.eq('unique slug $base $taken', expected, uniqueSlug(base, taken));
  }
  c.throws<ArgumentError>('unique slug empty base', () => uniqueSlug('', <String>{}));
  c.eq('unique slug separator', 'post_2', uniqueSlug('post', {'post'}, separator: '_'));
}

void runJsonPatchTests(Checks c) {
  const apply = [
    ('{"foo":"bar"}', '[{"op":"add","path":"/baz","value":"qux"}]', '{"baz":"qux","foo":"bar"}'),
    ('{"foo":["bar","baz"]}', '[{"op":"add","path":"/foo/1","value":"qux"}]', '{"foo":["bar","qux","baz"]}'),
    ('{"baz":"qux","foo":"bar"}', '[{"op":"remove","path":"/baz"}]', '{"foo":"bar"}'),
    ('{"foo":["bar","qux","baz"]}', '[{"op":"remove","path":"/foo/1"}]', '{"foo":["bar","baz"]}'),
    ('{"baz":"qux","foo":"bar"}', '[{"op":"replace","path":"/baz","value":"boo"}]', '{"baz":"boo","foo":"bar"}'),
    ('{"foo":{"bar":"baz","waldo":"fred"},"qux":{"corge":"grault"}}', '[{"from":"/foo/waldo","op":"move","path":"/qux/thud"}]', '{"foo":{"bar":"baz"},"qux":{"corge":"grault","thud":"fred"}}'),
    ('{"foo":["all","grass","cows","eat"]}', '[{"from":"/foo/1","op":"move","path":"/foo/3"}]', '{"foo":["all","cows","eat","grass"]}'),
    ('{"baz":"qux","foo":["a",2,"c"]}', '[{"op":"test","path":"/baz","value":"qux"},{"op":"test","path":"/foo/1","value":2}]', '{"baz":"qux","foo":["a",2,"c"]}'),
    ('{"foo":"bar"}', '[{"op":"add","path":"/child","value":{"grandchild":{}}}]', '{"child":{"grandchild":{}},"foo":"bar"}'),
    ('{"foo":"bar"}', '[{"op":"add","path":"/baz","value":"qux","xyz":123}]', '{"baz":"qux","foo":"bar"}'),
    ('{"foo":["bar"]}', '[{"op":"add","path":"/foo/-","value":["abc","def"]}]', '{"foo":["bar",["abc","def"]]}'),
    ('{"/":9,"~1":10}', '[{"op":"test","path":"/~01","value":10},{"op":"replace","path":"/~1","value":1}]', '{"/":1,"~1":10}'),
    ('{"a":1}', '[{"op":"replace","path":"","value":[1,2]}]', '[1,2]'),
    ('{"a":1}', '[{"op":"add","path":"","value":"root"}]', '"root"'),
    ('{"a":{"b":1}}', '[{"from":"/a","op":"copy","path":"/c"},{"op":"replace","path":"/c/b","value":2}]', '{"a":{"b":1},"c":{"b":2}}'),
    ('{"a":[1,2]}', '[{"from":"/a/0","op":"move","path":"/a/0"}]', '{"a":[1,2]}'),
    ('{"n":1}', '[{"op":"test","path":"/n","value":1}]', '{"n":1}'),
    ('{"a":{"b":[1,{"c":null}]}}', '[{"op":"test","path":"/a/b/1/c","value":null},{"op":"remove","path":"/a/b/0"}]', '{"a":{"b":[{"c":null}]}}'),
];
  for (final (doc, patch, expected) in apply) {
    final d = jsonDecode(doc);
    c.eq('json patch $patch', expected, canonical(applyPatch(d, jsonDecode(patch))));
    c.eq('json patch leaves input $patch', doc, canonical(d));
  }
  const applyInvalid = [
    ('{"baz":"qux"}', '[{"op":"add","path":"/baz/bat","value":"qux"}]'),
    ('{"foo":"bar"}', '[{"op":"test","path":"/baz","value":"qux"}]'),
    ('{"foo":["bar"]}', '[{"op":"add","path":"/foo/2","value":1}]'),
    ('{"foo":["bar"]}', '[{"op":"add","path":"/foo/01","value":1}]'),
    ('{"foo":["bar"]}', '[{"op":"remove","path":"/foo/-"}]'),
    ('{"a":1}', '[{"op":"remove","path":"/b"}]'),
    ('{"a":1}', '[{"op":"replace","path":"/b","value":1}]'),
    ('{"a":{"b":1}}', '[{"from":"/a","op":"move","path":"/a/b/c"}]'),
    ('{"a":1}', '[{"op":"frobnicate","path":"/a"}]'),
    ('{"a":1}', '[{"op":"add","path":"/b"}]'),
    ('{"a":1}', '[{"op":"add","value":1}]'),
    ('{"a":1}', '[{"op":"add","path":"a","value":1}]'),
    ('{"a~b":1}', '[{"op":"remove","path":"/a~b"}]'),
    ('{"a":1}', '[{"op":"remove","path":""}]'),
    ('{"a":true}', '[{"op":"test","path":"/a","value":1}]'),
    ('{"a":1}', '[{"op":"test","path":"/a","value":"1"}]'),
    ('{"a":1}', '[{"op":"add","path":"/b","value":2},{"op":"test","path":"/b","value":3}]'),
    ('{"a":1}', '{"op":"add","path":"/b","value":2}'),
];
  for (final (doc, patch) in applyInvalid) {
    final d = jsonDecode(doc);
    c.throws<JsonPatchException>('json patch invalid $patch', () => applyPatch(d, jsonDecode(patch)));
    c.eq('json patch invalid leaves input $patch', doc, canonical(d));
  }
  const pointer = [
    ('{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}', '', '{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}'),
    ('{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}', '/foo', '["bar","baz"]'),
    ('{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}', '/foo/0', '"bar"'),
    ('{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}', '/', '0'),
    ('{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}', '/a~1b', '1'),
    ('{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}', '/c%d', '2'),
    ('{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}', '/e^f', '3'),
    ('{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}', '/g|h', '4'),
    ('{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}', '/i\\j', '5'),
    ('{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}', '/k"l', '6'),
    ('{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}', '/ ', '7'),
    ('{"":0," ":7,"a/b":1,"c%d":2,"e^f":3,"foo":["bar","baz"],"g|h":4,"i\\\\j":5,"k\\"l":6,"m~n":8}', '/m~0n', '8'),
];
  for (final (doc, p, expected) in pointer) {
    c.eq('json pointer \'$p\'', expected, canonical(getPointer(jsonDecode(doc), p)));
  }
  const pointerInvalid = [
    '/foo/2',
    '/foo/-',
    '/foo/01',
    'foo',
    '/nope',
    '/m~2n',
    '/foo/0/x',
];
  for (final p in pointerInvalid) {
    c.throws<JsonPatchException>('json pointer invalid \'$p\'', () => getPointer(jsonDecode('{"foo":["bar","baz"],"m~n":8}'), p));
  }
  const merge = [
    ('{"a":"b"}', '{"a":"c"}', '{"a":"c"}'),
    ('{"a":"b"}', '{"b":"c"}', '{"a":"b","b":"c"}'),
    ('{"a":"b"}', '{"a":null}', '{}'),
    ('{"a":"b","b":"c"}', '{"a":null}', '{"b":"c"}'),
    ('{"a":["b"]}', '{"a":"c"}', '{"a":"c"}'),
    ('{"a":"c"}', '{"a":["b"]}', '{"a":["b"]}'),
    ('{"a":{"b":"c"}}', '{"a":{"b":"d","c":null}}', '{"a":{"b":"d"}}'),
    ('{"a":[{"b":"c"}]}', '{"a":[1]}', '{"a":[1]}'),
    ('["a","b"]', '["c","d"]', '["c","d"]'),
    ('{"a":"b"}', '["c"]', '["c"]'),
    ('{"a":"foo"}', 'null', 'null'),
    ('{"a":"foo"}', '"bar"', '"bar"'),
    ('{"e":null}', '{"a":1}', '{"a":1,"e":null}'),
    ('[1,2]', '{"a":"b","c":null}', '{"a":"b"}'),
    ('{}', '{"a":{"bb":{"ccc":null}}}', '{"a":{"bb":{}}}'),
];
  for (final (target, patch, expected) in merge) {
    final t = jsonDecode(target);
    c.eq('merge patch $target $patch', expected, canonical(mergePatch(t, jsonDecode(patch))));
    c.eq('merge patch leaves input $target', target, canonical(t));
  }
  const create = [
    ('{"a":1,"b":[1,2,3]}', '{"a":2,"b":[1],"c":true}', '[{"op":"replace","path":"/a","value":2},{"op":"remove","path":"/b/2"},{"op":"remove","path":"/b/1"},{"op":"add","path":"/c","value":true}]'),
    ('{"x":{"y":{"z":1}}}', '{"x":{"y":{"w":[null],"z":1}}}', '[{"op":"add","path":"/x/y/w","value":[null]}]'),
    ('[1,2]', '[1,2,3,4]', '[{"op":"add","path":"/2","value":3},{"op":"add","path":"/3","value":4}]'),
    ('{"a/b":1,"m~n":2}', '{"a/b":3}', '[{"op":"replace","path":"/a~1b","value":3},{"op":"remove","path":"/m~0n"}]'),
    ('"s"', '{"k":"s"}', '[{"op":"replace","path":"","value":{"k":"s"}}]'),
    ('{"k":[1,{"q":1}]}', '{"k":[2,{"q":2}]}', '[{"op":"replace","path":"/k/0","value":2},{"op":"replace","path":"/k/1/q","value":2}]'),
    ('{"same":1}', '{"same":1}', '[]'),
    ('null', 'false', '[{"op":"replace","path":"","value":false}]'),
    ('{"Z":3,"a":2,"b":1,"\u{E9}":4}', '{}', '[{"op":"remove","path":"/Z"},{"op":"remove","path":"/a"},{"op":"remove","path":"/b"},{"op":"remove","path":"/\u{E9}"}]'),
    ('[]', '[[]]', '[{"op":"add","path":"/0","value":[]}]'),
    ('{"n":[1,2,3]}', '{"n":[3,2,1]}', '[{"op":"replace","path":"/n/0","value":3},{"op":"replace","path":"/n/2","value":1}]'),
];
  for (final (a, b, expected) in create) {
    final patch = createPatch(jsonDecode(a), jsonDecode(b));
    c.eq('create patch $a -> $b', expected, canonical(patch));
    c.check('create patch round trip $a -> $b', jsonEquals(applyPatch(jsonDecode(a), patch), jsonDecode(b)));
  }
  const parseValid = [
    (' {"a" : [1, -2, 3.5e2, true, false, null, "x\\n\\u00e9\\ud83d\\ude00"]} ', '{"a":[1,-2,350,true,false,null,"x\\n\u{E9}\u{1F600}"]}'),
    ('"\\u0001\\"\\\\/"', '"\\u0001\\"\\\\/"'),
    ('[]', '[]'),
    ('{}', '{}'),
    ('-0', '0'),
    ('1E+2', '100'),
];
  for (final (text, expected) in parseValid) {
    c.eq('canonical $text', expected, canonical(jsonDecode(text)));
  }
  c.check('json equal 1 == 1.0', jsonEquals(1, 1.0) && !jsonEquals(true, 1) && jsonEquals({'a': 1, 'b': 2}, {'b': 2, 'a': 1.0}));
  c.eq('canonical non-integer and control', '[1.5,"\\u001f\\b"]', canonical(jsonDecode('[1.5,"\\u001F\\b"]')));
  c.eq('canonical code point key order', '{"\u{FF5E}":2,"\u{1F600}":1}', canonical({'\u{1F600}': 1, '\u{FF5E}': 2}));
}
