// SPDX-License-Identifier: Apache-2.0
// Checks for line-diff v2, slugify and json-patch. Vector literals are generated from the shared vectors.json.
import GenlibSwift

private let unifiedVectors: [(String, String, Int, String)] = [
    ("", "", 3, ""),
    ("", "", 0, ""),
    ("", "", 1, ""),
    ("a\n", "a\n", 3, ""),
    ("a\n", "a\n", 0, ""),
    ("a\n", "a\n", 1, ""),
    ("", "a\n", 3, "--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n"),
    ("", "a\n", 0, "--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n"),
    ("", "a\n", 1, "--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n"),
    ("a\n", "", 3, "--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n"),
    ("a\n", "", 0, "--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n"),
    ("a\n", "", 1, "--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n"),
    ("a\nb\nc\n", "a\nc\n", 3, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-b\n c\n"),
    ("a\nb\nc\n", "a\nc\n", 0, "--- a\n+++ b\n@@ -2 +1,0 @@\n-b\n"),
    ("a\nb\nc\n", "a\nc\n", 1, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-b\n c\n"),
    ("a\nb\nc\n", "a\nB\nc\n", 3, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n"),
    ("a\nb\nc\n", "a\nB\nc\n", 0, "--- a\n+++ b\n@@ -2 +2 @@\n-b\n+B\n"),
    ("a\nb\nc\n", "a\nB\nc\n", 1, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n"),
    ("a\nb", "a\nb\n", 3, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n"),
    ("a\nb", "a\nb\n", 0, "--- a\n+++ b\n@@ -2 +2 @@\n-b\n\\ No newline at end of file\n+b\n"),
    ("a\nb", "a\nb\n", 1, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n"),
    ("a\nb\n", "a\nb", 3, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n"),
    ("a\nb\n", "a\nb", 0, "--- a\n+++ b\n@@ -2 +2 @@\n-b\n+b\n\\ No newline at end of file\n"),
    ("a\nb\n", "a\nb", 1, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n"),
    ("x", "y", 3, "--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n"),
    ("x", "y", 0, "--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n"),
    ("x", "y", 1, "--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n"),
    ("a\n\nb\n", "a\nb\n", 3, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-\n b\n"),
    ("a\n\nb\n", "a\nb\n", 0, "--- a\n+++ b\n@@ -2 +1,0 @@\n-\n"),
    ("a\n\nb\n", "a\nb\n", 1, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-\n b\n"),
    ("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n", 3, "--- a\n+++ b\n@@ -1,6 +1,6 @@\n 1\n 2\n-3\n+X\n 4\n 5\n 6\n@@ -8,5 +8,5 @@\n 8\n 9\n 10\n-11\n+Y\n 12\n"),
    ("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n", 0, "--- a\n+++ b\n@@ -3 +3 @@\n-3\n+X\n@@ -11 +11 @@\n-11\n+Y\n"),
    ("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n", 1, "--- a\n+++ b\n@@ -2,3 +2,3 @@\n 2\n-3\n+X\n 4\n@@ -10,3 +10,3 @@\n 10\n-11\n+Y\n 12\n"),
    ("a\nb\na\nb\n", "b\na\nb\na\n", 3, "--- a\n+++ b\n@@ -1,4 +1,4 @@\n-a\n b\n a\n b\n+a\n"),
    ("a\nb\na\nb\n", "b\na\nb\na\n", 0, "--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n@@ -4,0 +4 @@\n+a\n"),
    ("a\nb\na\nb\n", "b\na\nb\na\n", 1, "--- a\n+++ b\n@@ -1,2 +1 @@\n-a\n b\n@@ -4 +3,2 @@\n b\n+a\n"),
    ("line 5\nline 5\nline 4\n", "}\nline 5\nline 4\n", 3, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n-line 5\n+}\n line 5\n line 4\n"),
    ("line 5\nline 5\nline 4\n", "}\nline 5\nline 4\n", 0, "--- a\n+++ b\n@@ -1 +1 @@\n-line 5\n+}\n"),
    ("line 5\nline 5\nline 4\n", "}\nline 5\nline 4\n", 1, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n-line 5\n+}\n line 5\n"),
    ("{\n}\n{\n}\n", "{\n}\n{\nx\n}\n{\n}\n", 3, "--- a\n+++ b\n@@ -1,4 +1,7 @@\n {\n }\n {\n+x\n }\n+{\n+}\n"),
    ("{\n}\n{\n}\n", "{\n}\n{\nx\n}\n{\n}\n", 0, "--- a\n+++ b\n@@ -3,0 +4 @@\n+x\n@@ -4,0 +6,2 @@\n+{\n+}\n"),
    ("{\n}\n{\n}\n", "{\n}\n{\nx\n}\n{\n}\n", 1, "--- a\n+++ b\n@@ -3,2 +3,5 @@\n {\n+x\n }\n+{\n+}\n"),
    ("same\nsame\nsame\n", "same\nsame\n", 3, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n same\n same\n-same\n"),
    ("same\nsame\nsame\n", "same\nsame\n", 0, "--- a\n+++ b\n@@ -3 +2,0 @@\n-same\n"),
    ("same\nsame\nsame\n", "same\nsame\n", 1, "--- a\n+++ b\n@@ -2,2 +2 @@\n same\n-same\n"),
    ("p\nq\nr\n", "a\nb\nc\n", 3, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n"),
    ("p\nq\nr\n", "a\nb\nc\n", 0, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n"),
    ("p\nq\nr\n", "a\nb\nc\n", 1, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n"),
    ("line 0\nline 4\nline 3\nline 3\nline 2\nline 1\n    return x\n", "line 4\nline 2\n{\nline 1\nline 3\n", 3, "--- a\n+++ b\n@@ -1,7 +1,5 @@\n-line 0\n line 4\n-line 3\n-line 3\n line 2\n+{\n line 1\n-    return x\n+line 3\n"),
    ("    return x\nline 2\nline 0\nline 0\n\nline 0\nline 2\n    return x\nline 2\n}\nline 2\n    return x\nline 0\n", "    return x\nline 2\nline 0\nline 0\nline 0\nline 2\n    return x\nline 2\n}\n}\nline 2\n    return x\n{\nline 0\n", 3, "--- a\n+++ b\n@@ -2,12 +2,13 @@\n line 2\n line 0\n line 0\n-\n line 0\n line 2\n     return x\n line 2\n }\n+}\n line 2\n     return x\n+{\n line 0\n"),
    ("line 2\nline 5\nline 5\nline 3\n{\nline 4\n    return x\n{\n{\nline 1\n}\n{\nline 2\n\n    return x\nline 3\nline 2\nline 7\nline 6\nline 4\n{\n    return x\n", "line 2\nline 3\nline 5\nline 5\nline 3\n{\n    return x\n{\n{\nline 1\n}\nline 5\nline 2\n\n    return x\nline 3\nline 2\nline 7\nline 6\nline 4\n{\n    return x\n\n", 3, "--- a\n+++ b\n@@ -1,15 +1,15 @@\n line 2\n+line 3\n line 5\n line 5\n line 3\n {\n-line 4\n     return x\n {\n {\n line 1\n }\n-{\n+line 5\n line 2\n \n     return x\n@@ -20,3 +20,4 @@\n line 4\n {\n     return x\n+\n"),
    ("line 3\n    return x\n\nline 6\n    return x\n\nline 2\nline 4\nline 2\nline 3\n}\n}\nline 4\n{\nline 6\n{\nline 6\nline 5\nline 3\nline 2\n", "line 3\nline 1\n    return x\nline 0\nline 6\n\nline 2\nline 4\nline 2\nline 3\n}\n}\n{\n{\n}\nline 6\n{\nline 4\nline 5\nline 3\nline 2\n", 3, "--- a\n+++ b\n@@ -1,8 +1,8 @@\n line 3\n+line 1\n     return x\n-\n+line 0\n line 6\n-    return x\n \n line 2\n line 4\n@@ -10,11 +10,12 @@\n line 3\n }\n }\n-line 4\n {\n+{\n+}\n line 6\n {\n-line 6\n+line 4\n line 5\n line 3\n line 2\n"),
    ("line 2\n    return x\nline 0\n\nline 2\nline 1\n\nline 3\nline 2\n}\nline 2\nline 0\n}\n    return x\nline 0\nline 1\n}\n\nline 3\nline 0\nline 3\nline 1\nline 1\n    return x\nline 1\nline 2\nline 2\n", "    return x\nline 0\n\nline 2\nline 1\n\nline 2\n}\nline 2\nline 0\n}\n    return x\n    return x\nline 0\nline 1\n}\n\nline 3\n{\nline 0\nline 3\nline 1\n    return x\nline 1\nline 2\nline 2\n", 3, "--- a\n+++ b\n@@ -1,26 +1,25 @@\n-line 2\n     return x\n line 0\n \n line 2\n line 1\n \n-line 3\n line 2\n }\n line 2\n line 0\n }\n     return x\n+    return x\n line 0\n line 1\n }\n \n line 3\n+{\n line 0\n line 3\n line 1\n-line 1\n     return x\n line 1\n line 2\n"),
    ("", "line 1\n", 3, "--- a\n+++ b\n@@ -0,0 +1 @@\n+line 1\n"),
    ("line 0\n{\nline 1\n\n    return x\n}\nline 1\n{\nline 1\n    return x\n{\n{\n}\nline 1\n}\n}\nline 1\nline 0\nline 0\n    return x\n}\n", "line 0\nline 0\nline 1\n\n    return x\n}\n{\nline 1\n    return x\nline 0\n{\n{\n}\nline 1\n    return x\n}\n}\nline 1\nline 0\nline 0\n}\n", 3, "--- a\n+++ b\n@@ -1,21 +1,21 @@\n line 0\n-{\n+line 0\n line 1\n \n     return x\n }\n-line 1\n {\n line 1\n     return x\n+line 0\n {\n {\n }\n line 1\n+    return x\n }\n }\n line 1\n line 0\n line 0\n-    return x\n }\n"),
    ("\nline 1\n    return x\nline 0\n\n    return x\n    return x\n    return x\n}\nline 0\nline 0\n{\n}\n    return x\nline 0\nline 0\n    return x", "line 1\n    return x\nline 0\n\n    return x\n    return x\n    return x\n}\nline 0\nline 0\n{\nline 0\n}\n    return x\nline 0\n    return x\n", 3, "--- a\n+++ b\n@@ -1,4 +1,3 @@\n-\n line 1\n     return x\n line 0\n@@ -10,8 +9,8 @@\n line 0\n line 0\n {\n+line 0\n }\n     return x\n line 0\n-line 0\n-    return x\n\\ No newline at end of file\n+    return x\n"),
    ("line 4\nline 6\n    return x\n    return x\n\n{\n    return x\nline 7\nline 2\nline 3\nline 4\nline 3\nline 0\n}\n    return x\n\nline 0\n    return x\nline 5\nline 0\nline 0\n}\nline 7\n\n\nline 2\nline 0\n\nline 1\n", "line 4\nline 6\n    return x\n\n{\n    return x\nline 7\nline 6\nline 2\nline 3\nline 4\nline 3\nline 0\n}\n    return x\n\nline 0\n    return x\nline 5\nline 0\nline 0\n}\nline 7\n\n\nline 2\nline 0\n\nline 1", 3, "--- a\n+++ b\n@@ -1,11 +1,11 @@\n line 4\n line 6\n     return x\n-    return x\n \n {\n     return x\n line 7\n+line 6\n line 2\n line 3\n line 4\n@@ -26,4 +26,4 @@\n line 2\n line 0\n \n-line 1\n+line 1\n\\ No newline at end of file\n"),
    ("}\nline 0\n}\nline 0\n\n{\n}\n}\n}\nline 2\nline 2\nline 1\n{\n{\nline 2\nline 1\nline 2\n\nline 1\n{\n{\nline 2\n\nline 2\n    return x\nline 0\nline 0\n\n}\n}\nline 0\nline 0\n}\nline 1\n}\nline 2\nline 1", "}\nline 0\n}\nline 0\n\n{\n}\n}\n}\nline 2\nline 2\nline 1\n{\n{\nline 2\nline 1\nline 2\n\nline 1\n{\n{\nline 2\n\nline 1\n    return x\nline 0\nline 0\n\n}\nline 0\nline 0\n}\nline 1\nline 0\n}\nline 2\nline 2\nline 1\n", 3, "--- a\n+++ b\n@@ -21,17 +21,18 @@\n {\n line 2\n \n-line 2\n+line 1\n     return x\n line 0\n line 0\n \n }\n-}\n line 0\n line 0\n }\n line 1\n+line 0\n }\n line 2\n-line 1\n\\ No newline at end of file\n+line 2\n+line 1\n"),
    ("line 0\nline 0\n{\n}\nline 1\nline 2\nline 2\n}\nline 1\n{\nline 2\nline 1\n{\n{\n    return x\nline 2\n", "line 0\nline 0\nline 0\nline 0\nline 1\nline 2\nline 2\nline 0\nline 1\n}\nline 1\n}\n{\nline 2\nline 1\n{\n{\n    return x\n{\nline 2\n", 3, "--- a\n+++ b\n@@ -1,16 +1,20 @@\n line 0\n line 0\n-{\n-}\n+line 0\n+line 0\n line 1\n line 2\n line 2\n+line 0\n+line 1\n }\n line 1\n+}\n {\n line 2\n line 1\n {\n {\n     return x\n+{\n line 2\n"),
    ("\nline 0\n\nline 1\n    return x\nline 1\n    return x\nline 0\n\n{\n}\n{\n    return x\nline 1\nline 1\nline 1\nline 1\n}\nline 0\n", "\nline 0\n\nline 1\n    return x\nline 1\n    return x\n    return x\n\n{\n}\n}\n{\n    return x\nline 1\nline 1\nline 1\nline 1\n}\nline 0\n", 3, "--- a\n+++ b\n@@ -5,10 +5,11 @@\n     return x\n line 1\n     return x\n-line 0\n+    return x\n \n {\n }\n+}\n {\n     return x\n line 1\n"),
    ("line 0\n}\nline 1\nline 1\n}\n\n\nline 1\nline 1\nline 0\n    return x\nline 1\n}\n\n\nline 0\n\n\n    return x\n{\n}\n    return x\n{\n\n", "line 0\n}\nline 1\nline 1\n}\n\n\nline 1\nline 1\nline 0\n    return x\nline 1\n}\n\n\nline 0\n\n\n    return x\n{\n}\n    return x\n{\n", 3, "--- a\n+++ b\n@@ -21,4 +21,3 @@\n }\n     return x\n {\n-\n"),
    ("line 2\nline 0\nline 0\n}\n\nline 2\n{\n    return x\nline 2\n\n}\n}\nline 0\n\n}\nline 1\nline 2\nline 0\n{\n\nline 0\n}\n    return x\n}\n{\n{\n{\n{\n{\nline 1\nline 2\n\nline 0\n{\nline 2\n}\nline 2\n", "line 2\nline 0\nline 0\n}\n\nline 2\n{\n    return x\nline 2\n\n}\n}\nline 0\n\n}\nline 1\nline 2\nline 0\n{\n}\n\nline 0\n}\n    return x\n}\n{\n{\n{\n{\n{\nline 1\nline 2\n\nline 0\n{\nline 2\n}\nline 2\n", 3, "--- a\n+++ b\n@@ -17,6 +17,7 @@\n line 2\n line 0\n {\n+}\n \n line 0\n }\n"),
    ("    return x\nline 2\nline 3\n}\n}\nline 2\nline 4\n}\n    return x\nline 0\nline 4\nline 4\nline 3\n}\n\n{\n{\n{\n", "    return x\nline 2\nline 3\n}\n}\nline 1\nline 2\n}\n    return x\nline 4\nline 4\nline 3\n}\n\n{\n{\n{\n", 3, "--- a\n+++ b\n@@ -3,11 +3,10 @@\n line 3\n }\n }\n+line 1\n line 2\n-line 4\n }\n     return x\n-line 0\n line 4\n line 4\n line 3\n"),
    ("line 0\nline 0\nline 1\n\n}\n    return x\n    return x\nline 0\n\n", "    return x\nline 0\nline 0\n}\n}\n    return x\nline 0\n    return x\n\n", 3, "--- a\n+++ b\n@@ -1,9 +1,9 @@\n+    return x\n line 0\n line 0\n-line 1\n-\n }\n-    return x\n+}\n     return x\n line 0\n+    return x\n \n"),
    ("line 7\nline 2\nline 7\n{\n\n\n}\n", "line 7\nline 2\nline 7\n\nline 3\nline 7\n\n    return x\n", 3, "--- a\n+++ b\n@@ -1,7 +1,8 @@\n line 7\n line 2\n line 7\n-{\n \n+line 3\n+line 7\n \n-}\n+    return x\n"),
    ("line 7\n{\nline 3\nline 4\nline 7\nline 1\n    return x\nline 4\nline 3\nline 4\nline 5\nline 5\n\nline 1\nline 2\nline 2\nline 3\nline 6\n    return x\nline 2\n    return x\nline 3\nline 1\nline 6\nline 6\nline 5\n\nline 7\nline 6\nline 0\nline 3\nline 6\nline 6", "line 7\n{\nline 3\nline 4\nline 7\nline 1\n    return x\nline 4\nline 3\nline 4\nline 5\nline 5\n\nline 1\nline 2\nline 2\nline 3\nline 6\n    return x\nline 2\n    return x\nline 3\nline 1\nline 6\nline 6\nline 5\n\nline 7\nline 6\nline 0\nline 3\nline 6\nline 6\n", 3, "--- a\n+++ b\n@@ -30,4 +30,4 @@\n line 0\n line 3\n line 6\n-line 6\n\\ No newline at end of file\n+line 6\n"),
    ("line 0\n\nline 4\n}\n}\n    return x\n    return x\nline 3\n{\nline 3\nline 4\n}\n{\nline 0\n}\n\n}\nline 2\n{\nline 2\n    return x\nline 0\n}\nline 0\nline 1\n}\nline 2\n{\nline 2\nline 0\n", "line 0\n\nline 4\n}\n}\n    return x\nline 3\n{\nline 3\nline 4\n}\n}\n{\nline 0\n}\n\n}\nline 2\n{\nline 2\n    return x\nline 0\n}\nline 0\nline 1\n}\nline 1\n{\nline 2\nline 0\n", 3, "--- a\n+++ b\n@@ -4,12 +4,12 @@\n }\n }\n     return x\n-    return x\n line 3\n {\n line 3\n line 4\n }\n+}\n {\n line 0\n }\n@@ -24,7 +24,7 @@\n line 0\n line 1\n }\n-line 2\n+line 1\n {\n line 2\n line 0\n"),
    ("line 1\n    return x\nline 0\n    return x\nline 0\nline 0\nline 1\nline 1\nline 0\n{\nline 1\nline 1\nline 1\n}\n    return x\nline 0\n{\nline 1\n}\n    return x\n\n\n", "line 1\n    return x\nline 0\n    return x\nline 0\n\nline 0\nline 1\nline 1\nline 0\n{\nline 1\nline 1\nline 1\n}\n    return x\nline 0\n{\nline 1\n}\n    return x\n\n\nline 0\n", 3, "--- a\n+++ b\n@@ -3,6 +3,7 @@\n line 0\n     return x\n line 0\n+\n line 0\n line 1\n line 1\n@@ -20,3 +21,4 @@\n     return x\n \n \n+line 0\n"),
    ("{\n{\nline 3\nline 1\nline 3\nline 1\n\nline 1\nline 0\n}\n{\n}\nline 1\n}\nline 0\n{\n    return x\nline 1\n{\n}\n    return x\nline 2\n{\nline 2\n\n    return x\n    return x\n{\n\n}\nline 3\nline 1\n\n    return x\nline 3\n    return x\n", "{\n{\nline 3\nline 1\nline 3\nline 1\n\nline 1\nline 0\n}\n{\n}\nline 1\n}\nline 0\n{\nline 1\n}\n    return x\nline 2\n{\nline 2\n\n    return x\n    return x\n{\n}\nline 3\nline 2\n    return x\nline 3\n    return x\nline 3\n", 3, "--- a\n+++ b\n@@ -14,9 +14,7 @@\n }\n line 0\n {\n-    return x\n line 1\n-{\n }\n     return x\n line 2\n@@ -26,11 +24,10 @@\n     return x\n     return x\n {\n-\n }\n line 3\n-line 1\n-\n+line 2\n     return x\n line 3\n     return x\n+line 3\n"),
    ("    return x\n\n\nline 0\nline 1\nline 4\nline 3\nline 6\nline 3\nline 4\n    return x\n{\nline 5\n\n}\n}\nline 5\nline 6\n}\nline 5\nline 5\n\nline 4\nline 4\nline 4\nline 3\nline 1\nline 3\nline 5\nline 1\n", "    return x\n\n\nline 1\nline 4\nline 2\nline 6\nline 4\nline 4\n{\nline 5\n\n}\nline 5\nline 6\n}\nline 5\nline 4\nline 4\nline 4\nline 3\nline 1\nline 3\nline 5\nline 1\n", 3, "--- a\n+++ b\n@@ -1,25 +1,20 @@\n     return x\n \n \n-line 0\n line 1\n line 4\n-line 3\n+line 2\n line 6\n-line 3\n line 4\n-    return x\n+line 4\n {\n line 5\n \n }\n-}\n line 5\n line 6\n }\n line 5\n-line 5\n-\n line 4\n line 4\n line 4\n"),
    ("\n    return x\nline 1\n    return x\n}\nline 0\nline 0\n{\n\n}\n}\n}\n\nline 1\nline 0\n\n}\nline 0\nline 0\n}\n}\nline 0\n{\n    return x\n    return x\nline 0\nline 1\nline 1\n{\n\nline 0\nline 1\nline 0\n{\n}\n", "\n    return x\nline 1\n}\nline 0\nline 0\n{\n\n}\n}\n}\n\nline 1\nline 0\n\n}\nline 0\nline 0\n}\n}\nline 0\n{\n    return x\n}\n    return x\nline 0\n\nline 1\n{\n\nline 0\nline 1\nline 0\n{\n}\n", 3, "--- a\n+++ b\n@@ -1,7 +1,6 @@\n \n     return x\n line 1\n-    return x\n }\n line 0\n line 0\n@@ -22,9 +21,10 @@\n line 0\n {\n     return x\n+}\n     return x\n line 0\n-line 1\n+\n line 1\n {\n \n"),
    ("{\nline 3\nline 4\n{\nline 1\nline 2\nline 3\nline 2\n\nline 1\nline 2\nline 0\nline 6\n", "{\nline 3\nline 4\nline 2\nline 3\nline 4\nline 2\n\nline 1\n{\nline 7\nline 0\nline 6", 3, "--- a\n+++ b\n@@ -1,13 +1,13 @@\n {\n line 3\n line 4\n-{\n-line 1\n line 2\n line 3\n+line 4\n line 2\n \n line 1\n-line 2\n+{\n+line 7\n line 0\n-line 6\n+line 6\n\\ No newline at end of file\n"),
    ("line 1\nline 0\nline 2\nline 4\n}\n    return x\n}\nline 4\nline 7\n", "line 1\nline 0\nline 2\nline 4\n    return x\n}\n    return x\n}\nline 4\nline 7\n", 3, "--- a\n+++ b\n@@ -2,6 +2,7 @@\n line 0\n line 2\n line 4\n+    return x\n }\n     return x\n }\n"),
    ("}\nline 1\n    return x\nline 0\n\nline 5\n    return x\nline 4\nline 0\nline 1\nline 3\n    return x\n    return x\nline 0\nline 4\n    return x\nline 0\nline 2\n}\n{\n}\nline 4\nline 2\n    return x\n\n}\nline 1\n}\nline 5\n\nline 5\n", "}\nline 1\n    return x\nline 0\n\n    return x\nline 4\nline 0\nline 1\nline 5\nline 3\n    return x\n    return x\nline 0\nline 4\n    return x\nline 0\nline 2\n}\n{\nline 4\nline 2\n    return x\n{\n\n}\nline 1\n}\nline 5\n\nline 4\nline 5\n", 3, "--- a\n+++ b\n@@ -3,11 +3,11 @@\n     return x\n line 0\n \n-line 5\n     return x\n line 4\n line 0\n line 1\n+line 5\n line 3\n     return x\n     return x\n@@ -18,14 +18,15 @@\n line 2\n }\n {\n-}\n line 4\n line 2\n     return x\n+{\n \n }\n line 1\n }\n line 5\n \n+line 4\n line 5\n"),
    ("line 0\n{\n\nline 7\nline 6\nline 0\nline 3\n\nline 5\n}\nline 7\n{\nline 7\nline 0\nline 3\nline 4\n\nline 2\nline 4\nline 7\n    return x\nline 7\nline 1\nline 0\n{\n}\nline 3\n    return x\nline 2\nline 4\n\nline 0\n", "line 0\n{\n\nline 7\nline 6\nline 0\nline 3\n{\nline 1\n\nline 6\nline 5\n}\nline 7\n{\nline 7\nline 0\nline 7\nline 3\nline 6\nline 4\nline 7\nline 2\nline 4\nline 7\n    return x\nline 7\nline 1\nline 0\n{\n}\nline 3\n    return x\nline 4\n\nline 0\n", 3, "--- a\n+++ b\n@@ -5,16 +5,21 @@\n line 6\n line 0\n line 3\n+{\n+line 1\n \n+line 6\n line 5\n }\n line 7\n {\n line 7\n line 0\n+line 7\n line 3\n+line 6\n line 4\n-\n+line 7\n line 2\n line 4\n line 7\n@@ -26,7 +31,6 @@\n }\n line 3\n     return x\n-line 2\n line 4\n \n line 0\n"),
    ("    return x\nline 4\nline 0\nline 4\nline 4\n{\nline 2\n{\n    return x\n{\n\n\n    return x\n    return x\n}\n{\n\nline 3\nline 3\n}\nline 3\n", "    return x\nline 4\nline 0\n{\nline 4\n{\nline 2\n{\n    return x\n{\n\n\n}\n    return x\n    return x\nline 2\nline 2\nline 3\nline 3\n}\nline 3\n", 3, "--- a\n+++ b\n@@ -1,7 +1,7 @@\n     return x\n line 4\n line 0\n-line 4\n+{\n line 4\n {\n line 2\n@@ -10,11 +10,11 @@\n {\n \n \n+}\n     return x\n     return x\n-}\n-{\n-\n+line 2\n+line 2\n line 3\n line 3\n }\n"),
    ("line 6\n    return x\nline 2\nline 1\n\nline 4\nline 5\n{\nline 6\n", "line 6\n    return x\nline 2\nline 1\n\nline 4\nline 5\n{\n    return x\n", 3, "--- a\n+++ b\n@@ -6,4 +6,4 @@\n line 4\n line 5\n {\n-line 6\n+    return x\n"),
    ("}\nline 0\n{\nline 1\nline 3\n    return x\n    return x\nline 4\nline 3\nline 1\nline 6\nline 1\n    return x\nline 1\n\nline 2\nline 4\nline 0\nline 0\nline 5\nline 0\nline 4\nline 5\nline 5\nline 6\nline 2\nline 3\n}\nline 6\n{\n    return x\n", "}\nline 0\nline 1\nline 3\n    return x\n    return x\nline 4\nline 3\nline 1\nline 6\nline 1\n    return x\n{\nline 1\n\nline 2\nline 4\nline 0\nline 0\nline 5\nline 0\nline 4\nline 5\nline 5\nline 6\nline 2\nline 3\n}\nline 6\n{\n    return x\n", 3, "--- a\n+++ b\n@@ -1,6 +1,5 @@\n }\n line 0\n-{\n line 1\n line 3\n     return x\n@@ -11,6 +10,7 @@\n line 6\n line 1\n     return x\n+{\n line 1\n \n line 2\n"),
    ("line 3\n}\nline 4\n}\nline 4\nline 0\n}\nline 4\n{\n", "line 3\n}\nline 4\n}\nline 4\n}\nline 4\n{\n", 3, "--- a\n+++ b\n@@ -3,7 +3,6 @@\n line 4\n }\n line 4\n-line 0\n }\n line 4\n {\n"),
    ("{\n    return x\nline 1\nline 3\n{\n}\n\n\nline 0\n{\n\nline 0", "{\n    return x\nline 1\nline 3\n{\n}\n\n\nline 0\n{\n\nline 0\n", 3, "--- a\n+++ b\n@@ -9,4 +9,4 @@\n line 0\n {\n \n-line 0\n\\ No newline at end of file\n+line 0\n"),
    ("line 3\n}\nline 5\nline 3\n{\nline 3\n}\nline 4\n{\n    return x\n{\n{\nline 2\n{\nline 1\n{\n{\nline 0\n", "line 3\n}\n}\nline 5\n{\nline 3\n}\nline 4\n{\n{\n{\nline 2\n{\n{\n{\nline 0\n", 3, "--- a\n+++ b\n@@ -1,18 +1,16 @@\n line 3\n }\n+}\n line 5\n-line 3\n {\n line 3\n }\n line 4\n {\n-    return x\n {\n {\n line 2\n {\n-line 1\n {\n {\n line 0\n"),
    ("{\n{\nline 4\nline 2\nline 4\n}\nline 4\nline 5\nline 1\n}\nline 1\nline 2\nline 3\n\n{\nline 5\nline 1\n\nline 0\nline 4\n{\nline 1\n}\n", "{\n{\nline 4\nline 2\nline 4\n}\nline 4\nline 1\n}\nline 1\nline 2\nline 3\n\n{\nline 5\nline 1\n\nline 0\nline 4\nline 5\n{\nline 4\nline 1\n}\n", 3, "--- a\n+++ b\n@@ -5,7 +5,6 @@\n line 4\n }\n line 4\n-line 5\n line 1\n }\n line 1\n@@ -18,6 +17,8 @@\n \n line 0\n line 4\n+line 5\n {\n+line 4\n line 1\n }\n"),
    ("    return x\nline 4\n{\nline 6\nline 1\nline 2\nline 0\nline 0\nline 4\nline 7\nline 1\nline 1\nline 3\n\nline 2\nline 6\nline 7\nline 5\n{\n    return x\n    return x\n\nline 6\n}\n    return x\n    return x\nline 2\nline 6\n{", "    return x\nline 4\n{\nline 6\nline 1\nline 2\nline 0\nline 0\nline 4\nline 7\nline 1\nline 1\nline 3\n}\nline 2\nline 6\nline 7\nline 5\n{\n    return x\n    return x\n\nline 6\n}\n    return x\n    return x\nline 2\nline 6\n{\n", 3, "--- a\n+++ b\n@@ -11,7 +11,7 @@\n line 1\n line 1\n line 3\n-\n+}\n line 2\n line 6\n line 7\n@@ -26,4 +26,4 @@\n     return x\n line 2\n line 6\n-{\n\\ No newline at end of file\n+{\n"),
    ("line 3\n\n\nline 3\nline 5\nline 1\n    return x\nline 5\n}\n    return x\nline 5\nline 0\nline 6\nline 4\nline 3\nline 1\n\nline 1\n    return x\nline 3\n    return x\n    return x\n{\n", "line 3\n\n\nline 3\nline 5\nline 1\n    return x\nline 5\n}\n    return x\nline 5\nline 0\nline 6\nline 4\nline 3\nline 1\n\nline 1\n    return x\nline 3\n    return x\n    return x\n{\n", 3, ""),
    ("line 1\nline 0\n    return x\n    return x\n}\nline 1\n}\nline 1\n    return x\n    return x\nline 1\nline 2\n    return x\nline 1\n    return x\n}\nline 0\nline 2\n    return x\nline 1\nline 1\n}\nline 2\n    return x\nline 1\nline 0\n{\n    return x\nline 0\nline 1\nline 0\nline 2\n    return x\n    return x\nline 1\n}\n", "line 1\nline 0\n    return x\n    return x\n\n}\nline 1\n}\nline 1\n    return x\n    return x\nline 1\nline 2\n    return x\nline 1\n    return x\n}\nline 2\n    return x\nline 1\nline 1\n}\nline 2\n}\n    return x\nline 1\nline 0\n{\n}\nline 0\nline 1\nline 0\nline 2\n    return x\n    return x\nline 1\n}\n", 3, "--- a\n+++ b\n@@ -2,6 +2,7 @@\n line 0\n     return x\n     return x\n+\n }\n line 1\n }\n@@ -14,18 +15,18 @@\n line 1\n     return x\n }\n-line 0\n line 2\n     return x\n line 1\n line 1\n }\n line 2\n+}\n     return x\n line 1\n line 0\n {\n-    return x\n+}\n line 0\n line 1\n line 0\n"),
    ("line 4\n\n    return x\nline 0\nline 0\n\nline 6\nline 6\n    return x\nline 1\n\n\nline 1\nline 1\nline 5\n{\nline 2\nline 1\nline 2\nline 4\n{\n    return x\n{\n}\nline 5\nline 6\n{\n}\nline 4\n\n}\n{\nline 6\n", "line 4\n\n    return x\nline 0\nline 0\n\nline 6\n    return x\nline 6\n    return x\nline 1\n\n\nline 1\nline 1\nline 5\n{\nline 2\nline 1\nline 2\nline 4\n{\n    return x\n{\n}\nline 5\nline 6\n{\n}\nline 4\n\n}\n{\nline 6\n", 3, "--- a\n+++ b\n@@ -5,6 +5,7 @@\n line 0\n \n line 6\n+    return x\n line 6\n     return x\n line 1\n"),
    ("line 6\n\nline 3\nline 6\nline 5\n\nline 6\nline 6\nline 1\nline 5\nline 6\nline 5\n    return x\n", "line 6\nline 5\n\nline 6\nline 6\nline 1\nline 1\nline 5\nline 6\nline 5\n    return x\n", 3, "--- a\n+++ b\n@@ -1,12 +1,10 @@\n line 6\n-\n-line 3\n-line 6\n line 5\n \n line 6\n line 6\n line 1\n+line 1\n line 5\n line 6\n line 5\n"),
    ("line 0\n}\n}\n}\nline 2\n{\nline 0\n\nline 2\n    return x\n{\n    return x\n\n    return x\n{\nline 0\nline 2\n}\nline 2\nline 2\nline 0\n}\n}\nline 1\nline 1\n{\n\nline 1\n    return x\nline 0\nline 2\n    return x\n}\nline 2\nline 0", "line 0\n}\n}\n}\nline 2\n{\nline 0\n\nline 2\n    return x\n{\n    return x\n\n    return x\n{\nline 0\nline 2\nline 0\n}\nline 2\nline 0\n}\n}\nline 1\nline 1\n{\n\n    return x\nline 1\n    return x\nline 0\nline 2\n    return x\n}\nline 2\nline 0\nline 0\n", 3, "--- a\n+++ b\n@@ -15,9 +15,9 @@\n {\n line 0\n line 2\n+line 0\n }\n line 2\n-line 2\n line 0\n }\n }\n@@ -25,6 +25,7 @@\n line 1\n {\n \n+    return x\n line 1\n     return x\n line 0\n@@ -32,4 +33,5 @@\n     return x\n }\n line 2\n-line 0\n\\ No newline at end of file\n+line 0\n+line 0\n"),
]

private let diffLineVectors: [(String, String, [DiffOp])] = [
    ("", "", [] as [DiffOp]),
    ("a\n", "a\n", [DiffOp("=", "a")]),
    ("", "a\n", [DiffOp("+", "a")]),
    ("a\n", "", [DiffOp("-", "a")]),
    ("a\nb\nc\n", "a\nc\n", [DiffOp("=", "a"), DiffOp("-", "b"), DiffOp("=", "c")]),
    ("a\nb\nc\n", "a\nB\nc\n", [DiffOp("=", "a"), DiffOp("-", "b"), DiffOp("+", "B"), DiffOp("=", "c")]),
    ("a\nb", "a\nb\n", [DiffOp("=", "a"), DiffOp("-", "b"), DiffOp("+", "b")]),
    ("a\nb\n", "a\nb", [DiffOp("=", "a"), DiffOp("-", "b"), DiffOp("+", "b")]),
    ("x", "y", [DiffOp("-", "x"), DiffOp("+", "y")]),
    ("a\n\nb\n", "a\nb\n", [DiffOp("=", "a"), DiffOp("-", ""), DiffOp("=", "b")]),
    ("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n", [DiffOp("=", "1"), DiffOp("=", "2"), DiffOp("-", "3"), DiffOp("+", "X"), DiffOp("=", "4"), DiffOp("=", "5"), DiffOp("=", "6"), DiffOp("=", "7"), DiffOp("=", "8"), DiffOp("=", "9"), DiffOp("=", "10"), DiffOp("-", "11"), DiffOp("+", "Y"), DiffOp("=", "12")]),
    ("a\nb\na\nb\n", "b\na\nb\na\n", [DiffOp("-", "a"), DiffOp("=", "b"), DiffOp("=", "a"), DiffOp("=", "b"), DiffOp("+", "a")]),
]

private let slugCases: [(String, String, Int, String)] = [
    ("Hello, World!", "-", 0, "hello-world"),
    ("Cr\u{e8}me br\u{fb}l\u{e9}e & Caf\u{e9}", "-", 0, "creme-brulee-cafe"),
    ("Stra\u{df}e in \u{141}\u{f3}d\u{17a}", "-", 0, "strasse-in-lodz"),
    ("don't stop", "-", 0, "dont-stop"),
    ("don\u{2019}t stop", "-", 0, "dont-stop"),
    ("  --Already--slugged--  ", "-", 0, "already-slugged"),
    ("\u{65e5}\u{672c}\u{8a9e} title 2026", "-", 0, "title-2026"),
    ("\u{c6}r\u{f8}sk\u{f8}bing \u{152}UVRE", "-", 0, "aeroskobing-oeuvre"),
    ("Cre\u{300}me bru\u{302}le\u{301}e", "-", 0, "creme-brulee"),
    ("\u{c0}\u{c1}\u{c2}\u{c3}\u{c4}\u{c5} \u{e0}\u{e1}\u{e2}\u{e3}\u{e4}\u{e5} \u{c7}\u{e7} \u{d1}\u{f1}", "-", 0, "aaaaaa-aaaaaa-cc-nn"),
    ("\u{132}ssel \u{140} \u{138} \u{17f} \u{149}", "-", 0, "ijssel-l-q-s-n"),
    ("C# and C++", "-", 0, "c-and-c"),
    ("100% pure", "-", 0, "100-pure"),
    ("", "-", 0, ""),
    ("---", "-", 0, ""),
    ("a_b.c-d", "-", 0, "a-b-c-d"),
    ("Emoji \u{1f600} test", "-", 0, "emoji-test"),
    ("\u{ff26}\u{ff55}\u{ff4c}\u{ff4c} width", "-", 0, "width"),
    ("\u{1c5}emal (outside the table)", "-", 0, "emal-outside-the-table"),
    ("\u{ff} \u{178}", "-", 0, "y-y"),
    ("MiXeD CaSe 42", "-", 0, "mixed-case-42"),
    ("Hello, World!", "_", 0, "hello_world"),
    ("Hello, World!", ".", 0, "hello.world"),
    ("Cr\u{e8}me br\u{fb}l\u{e9}e & Caf\u{e9}", "_", 0, "creme_brulee_cafe"),
    ("Cr\u{e8}me br\u{fb}l\u{e9}e & Caf\u{e9}", ".", 0, "creme.brulee.cafe"),
    ("Stra\u{df}e in \u{141}\u{f3}d\u{17a}", "_", 0, "strasse_in_lodz"),
    ("Stra\u{df}e in \u{141}\u{f3}d\u{17a}", ".", 0, "strasse.in.lodz"),
    ("don't stop", "_", 0, "dont_stop"),
    ("don't stop", ".", 0, "dont.stop"),
    ("The quick brown fox jumps", "-", 12, "the-quick"),
    ("The quick brown fox jumps", "-", 9, "the-quick"),
    ("The quick brown fox jumps", "-", 10, "the-quick"),
    ("Supercalifragilistic", "-", 5, "super"),
    ("ab cd", "-", 3, "ab"),
    ("ab cd", "-", 2, "ab"),
    ("ab cd", "-", 5, "ab-cd"),
    ("ab cd", "-", 100, "ab-cd"),
    ("a b", "-", 1, "a"),
]

private let slugInvalid: [(String, String, Int)] = [
    ("x", "/", 0),
    ("x", "", 0),
    ("x", "--", 0),
    ("x", "-", -1),
]

private let slugUnique: [(String, [String], String)] = [
    ("post", [] as [String], "post"),
    ("post", ["post"], "post-2"),
    ("post", ["post", "post-2", "post-3"], "post-4"),
    ("post", ["post-2"], "post"),
    ("a", ["a", "a-2", "a-4"], "a-3"),
]

private let slugTable: [(UInt32, String)] = [
    (0xC0, "A"),
    (0xC1, "A"),
    (0xC2, "A"),
    (0xC3, "A"),
    (0xC4, "A"),
    (0xC5, "A"),
    (0xC6, "AE"),
    (0xC7, "C"),
    (0xC8, "E"),
    (0xC9, "E"),
    (0xCA, "E"),
    (0xCB, "E"),
    (0xCC, "I"),
    (0xCD, "I"),
    (0xCE, "I"),
    (0xCF, "I"),
    (0xD0, "D"),
    (0xD1, "N"),
    (0xD2, "O"),
    (0xD3, "O"),
    (0xD4, "O"),
    (0xD5, "O"),
    (0xD6, "O"),
    (0xD8, "O"),
    (0xD9, "U"),
    (0xDA, "U"),
    (0xDB, "U"),
    (0xDC, "U"),
    (0xDD, "Y"),
    (0xDE, "TH"),
    (0xDF, "ss"),
    (0xE0, "a"),
    (0xE1, "a"),
    (0xE2, "a"),
    (0xE3, "a"),
    (0xE4, "a"),
    (0xE5, "a"),
    (0xE6, "ae"),
    (0xE7, "c"),
    (0xE8, "e"),
    (0xE9, "e"),
    (0xEA, "e"),
    (0xEB, "e"),
    (0xEC, "i"),
    (0xED, "i"),
    (0xEE, "i"),
    (0xEF, "i"),
    (0xF0, "d"),
    (0xF1, "n"),
    (0xF2, "o"),
    (0xF3, "o"),
    (0xF4, "o"),
    (0xF5, "o"),
    (0xF6, "o"),
    (0xF8, "o"),
    (0xF9, "u"),
    (0xFA, "u"),
    (0xFB, "u"),
    (0xFC, "u"),
    (0xFD, "y"),
    (0xFE, "th"),
    (0xFF, "y"),
    (0x100, "A"),
    (0x101, "a"),
    (0x102, "A"),
    (0x103, "a"),
    (0x104, "A"),
    (0x105, "a"),
    (0x106, "C"),
    (0x107, "c"),
    (0x108, "C"),
    (0x109, "c"),
    (0x10A, "C"),
    (0x10B, "c"),
    (0x10C, "C"),
    (0x10D, "c"),
    (0x10E, "D"),
    (0x10F, "d"),
    (0x110, "D"),
    (0x111, "d"),
    (0x112, "E"),
    (0x113, "e"),
    (0x114, "E"),
    (0x115, "e"),
    (0x116, "E"),
    (0x117, "e"),
    (0x118, "E"),
    (0x119, "e"),
    (0x11A, "E"),
    (0x11B, "e"),
    (0x11C, "G"),
    (0x11D, "g"),
    (0x11E, "G"),
    (0x11F, "g"),
    (0x120, "G"),
    (0x121, "g"),
    (0x122, "G"),
    (0x123, "g"),
    (0x124, "H"),
    (0x125, "h"),
    (0x126, "H"),
    (0x127, "h"),
    (0x128, "I"),
    (0x129, "i"),
    (0x12A, "I"),
    (0x12B, "i"),
    (0x12C, "I"),
    (0x12D, "i"),
    (0x12E, "I"),
    (0x12F, "i"),
    (0x130, "I"),
    (0x131, "i"),
    (0x132, "IJ"),
    (0x133, "ij"),
    (0x134, "J"),
    (0x135, "j"),
    (0x136, "K"),
    (0x137, "k"),
    (0x138, "q"),
    (0x139, "L"),
    (0x13A, "l"),
    (0x13B, "L"),
    (0x13C, "l"),
    (0x13D, "L"),
    (0x13E, "l"),
    (0x13F, "L"),
    (0x140, "l"),
    (0x141, "L"),
    (0x142, "l"),
    (0x143, "N"),
    (0x144, "n"),
    (0x145, "N"),
    (0x146, "n"),
    (0x147, "N"),
    (0x148, "n"),
    (0x149, "n"),
    (0x14A, "N"),
    (0x14B, "n"),
    (0x14C, "O"),
    (0x14D, "o"),
    (0x14E, "O"),
    (0x14F, "o"),
    (0x150, "O"),
    (0x151, "o"),
    (0x152, "OE"),
    (0x153, "oe"),
    (0x154, "R"),
    (0x155, "r"),
    (0x156, "R"),
    (0x157, "r"),
    (0x158, "R"),
    (0x159, "r"),
    (0x15A, "S"),
    (0x15B, "s"),
    (0x15C, "S"),
    (0x15D, "s"),
    (0x15E, "S"),
    (0x15F, "s"),
    (0x160, "S"),
    (0x161, "s"),
    (0x162, "T"),
    (0x163, "t"),
    (0x164, "T"),
    (0x165, "t"),
    (0x166, "T"),
    (0x167, "t"),
    (0x168, "U"),
    (0x169, "u"),
    (0x16A, "U"),
    (0x16B, "u"),
    (0x16C, "U"),
    (0x16D, "u"),
    (0x16E, "U"),
    (0x16F, "u"),
    (0x170, "U"),
    (0x171, "u"),
    (0x172, "U"),
    (0x173, "u"),
    (0x174, "W"),
    (0x175, "w"),
    (0x176, "Y"),
    (0x177, "y"),
    (0x178, "Y"),
    (0x179, "Z"),
    (0x17A, "z"),
    (0x17B, "Z"),
    (0x17C, "z"),
    (0x17D, "Z"),
    (0x17E, "z"),
    (0x17F, "s"),
]

private let patchApply: [(String, String, String)] = [
    ("{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/baz\",\"value\":\"qux\"}]", "{\"baz\":\"qux\",\"foo\":\"bar\"}"),
    ("{\"foo\":[\"bar\",\"baz\"]}", "[{\"op\":\"add\",\"path\":\"/foo/1\",\"value\":\"qux\"}]", "{\"foo\":[\"bar\",\"qux\",\"baz\"]}"),
    ("{\"baz\":\"qux\",\"foo\":\"bar\"}", "[{\"op\":\"remove\",\"path\":\"/baz\"}]", "{\"foo\":\"bar\"}"),
    ("{\"foo\":[\"bar\",\"qux\",\"baz\"]}", "[{\"op\":\"remove\",\"path\":\"/foo/1\"}]", "{\"foo\":[\"bar\",\"baz\"]}"),
    ("{\"baz\":\"qux\",\"foo\":\"bar\"}", "[{\"op\":\"replace\",\"path\":\"/baz\",\"value\":\"boo\"}]", "{\"baz\":\"boo\",\"foo\":\"bar\"}"),
    ("{\"foo\":{\"bar\":\"baz\",\"waldo\":\"fred\"},\"qux\":{\"corge\":\"grault\"}}", "[{\"from\":\"/foo/waldo\",\"op\":\"move\",\"path\":\"/qux/thud\"}]", "{\"foo\":{\"bar\":\"baz\"},\"qux\":{\"corge\":\"grault\",\"thud\":\"fred\"}}"),
    ("{\"foo\":[\"all\",\"grass\",\"cows\",\"eat\"]}", "[{\"from\":\"/foo/1\",\"op\":\"move\",\"path\":\"/foo/3\"}]", "{\"foo\":[\"all\",\"cows\",\"eat\",\"grass\"]}"),
    ("{\"baz\":\"qux\",\"foo\":[\"a\",2,\"c\"]}", "[{\"op\":\"test\",\"path\":\"/baz\",\"value\":\"qux\"},{\"op\":\"test\",\"path\":\"/foo/1\",\"value\":2}]", "{\"baz\":\"qux\",\"foo\":[\"a\",2,\"c\"]}"),
    ("{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/child\",\"value\":{\"grandchild\":{}}}]", "{\"child\":{\"grandchild\":{}},\"foo\":\"bar\"}"),
    ("{\"foo\":\"bar\"}", "[{\"op\":\"add\",\"path\":\"/baz\",\"value\":\"qux\",\"xyz\":123}]", "{\"baz\":\"qux\",\"foo\":\"bar\"}"),
    ("{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/-\",\"value\":[\"abc\",\"def\"]}]", "{\"foo\":[\"bar\",[\"abc\",\"def\"]]}"),
    ("{\"/\":9,\"~1\":10}", "[{\"op\":\"test\",\"path\":\"/~01\",\"value\":10},{\"op\":\"replace\",\"path\":\"/~1\",\"value\":1}]", "{\"/\":1,\"~1\":10}"),
    ("{\"a\":1}", "[{\"op\":\"replace\",\"path\":\"\",\"value\":[1,2]}]", "[1,2]"),
    ("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"\",\"value\":\"root\"}]", "\"root\""),
    ("{\"a\":{\"b\":1}}", "[{\"from\":\"/a\",\"op\":\"copy\",\"path\":\"/c\"},{\"op\":\"replace\",\"path\":\"/c/b\",\"value\":2}]", "{\"a\":{\"b\":1},\"c\":{\"b\":2}}"),
    ("{\"a\":[1,2]}", "[{\"from\":\"/a/0\",\"op\":\"move\",\"path\":\"/a/0\"}]", "{\"a\":[1,2]}"),
    ("{\"n\":1}", "[{\"op\":\"test\",\"path\":\"/n\",\"value\":1}]", "{\"n\":1}"),
    ("{\"a\":{\"b\":[1,{\"c\":null}]}}", "[{\"op\":\"test\",\"path\":\"/a/b/1/c\",\"value\":null},{\"op\":\"remove\",\"path\":\"/a/b/0\"}]", "{\"a\":{\"b\":[{\"c\":null}]}}"),
]

private let patchApplyInvalid: [(String, String)] = [
    ("{\"baz\":\"qux\"}", "[{\"op\":\"add\",\"path\":\"/baz/bat\",\"value\":\"qux\"}]"),
    ("{\"foo\":\"bar\"}", "[{\"op\":\"test\",\"path\":\"/baz\",\"value\":\"qux\"}]"),
    ("{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/2\",\"value\":1}]"),
    ("{\"foo\":[\"bar\"]}", "[{\"op\":\"add\",\"path\":\"/foo/01\",\"value\":1}]"),
    ("{\"foo\":[\"bar\"]}", "[{\"op\":\"remove\",\"path\":\"/foo/-\"}]"),
    ("{\"a\":1}", "[{\"op\":\"remove\",\"path\":\"/b\"}]"),
    ("{\"a\":1}", "[{\"op\":\"replace\",\"path\":\"/b\",\"value\":1}]"),
    ("{\"a\":{\"b\":1}}", "[{\"from\":\"/a\",\"op\":\"move\",\"path\":\"/a/b/c\"}]"),
    ("{\"a\":1}", "[{\"op\":\"frobnicate\",\"path\":\"/a\"}]"),
    ("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"/b\"}]"),
    ("{\"a\":1}", "[{\"op\":\"add\",\"value\":1}]"),
    ("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"a\",\"value\":1}]"),
    ("{\"a~b\":1}", "[{\"op\":\"remove\",\"path\":\"/a~b\"}]"),
    ("{\"a\":1}", "[{\"op\":\"remove\",\"path\":\"\"}]"),
    ("{\"a\":true}", "[{\"op\":\"test\",\"path\":\"/a\",\"value\":1}]"),
    ("{\"a\":1}", "[{\"op\":\"test\",\"path\":\"/a\",\"value\":\"1\"}]"),
    ("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"/b\",\"value\":2},{\"op\":\"test\",\"path\":\"/b\",\"value\":3}]"),
    ("{\"a\":1}", "{\"op\":\"add\",\"path\":\"/b\",\"value\":2}"),
]

private let pointerVectors: [(String, String, String)] = [
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "", "{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/foo", "[\"bar\",\"baz\"]"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/foo/0", "\"bar\""),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/", "0"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/a~1b", "1"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/c%d", "2"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/e^f", "3"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/g|h", "4"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/i\\j", "5"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/k\"l", "6"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/ ", "7"),
    ("{\"\":0,\" \":7,\"a/b\":1,\"c%d\":2,\"e^f\":3,\"foo\":[\"bar\",\"baz\"],\"g|h\":4,\"i\\\\j\":5,\"k\\\"l\":6,\"m~n\":8}", "/m~0n", "8"),
]

private let pointerInvalid: [String] = [
    "/foo/2",
    "/foo/-",
    "/foo/01",
    "foo",
    "/nope",
    "/m~2n",
    "/foo/0/x",
]

private let mergeVectors: [(String, String, String)] = [
    ("{\"a\":\"b\"}", "{\"a\":\"c\"}", "{\"a\":\"c\"}"),
    ("{\"a\":\"b\"}", "{\"b\":\"c\"}", "{\"a\":\"b\",\"b\":\"c\"}"),
    ("{\"a\":\"b\"}", "{\"a\":null}", "{}"),
    ("{\"a\":\"b\",\"b\":\"c\"}", "{\"a\":null}", "{\"b\":\"c\"}"),
    ("{\"a\":[\"b\"]}", "{\"a\":\"c\"}", "{\"a\":\"c\"}"),
    ("{\"a\":\"c\"}", "{\"a\":[\"b\"]}", "{\"a\":[\"b\"]}"),
    ("{\"a\":{\"b\":\"c\"}}", "{\"a\":{\"b\":\"d\",\"c\":null}}", "{\"a\":{\"b\":\"d\"}}"),
    ("{\"a\":[{\"b\":\"c\"}]}", "{\"a\":[1]}", "{\"a\":[1]}"),
    ("[\"a\",\"b\"]", "[\"c\",\"d\"]", "[\"c\",\"d\"]"),
    ("{\"a\":\"b\"}", "[\"c\"]", "[\"c\"]"),
    ("{\"a\":\"foo\"}", "null", "null"),
    ("{\"a\":\"foo\"}", "\"bar\"", "\"bar\""),
    ("{\"e\":null}", "{\"a\":1}", "{\"a\":1,\"e\":null}"),
    ("[1,2]", "{\"a\":\"b\",\"c\":null}", "{\"a\":\"b\"}"),
    ("{}", "{\"a\":{\"bb\":{\"ccc\":null}}}", "{\"a\":{\"bb\":{}}}"),
]

private let createVectors: [(String, String, String)] = [
    ("{\"a\":1,\"b\":[1,2,3]}", "{\"a\":2,\"b\":[1],\"c\":true}", "[{\"op\":\"replace\",\"path\":\"/a\",\"value\":2},{\"op\":\"remove\",\"path\":\"/b/2\"},{\"op\":\"remove\",\"path\":\"/b/1\"},{\"op\":\"add\",\"path\":\"/c\",\"value\":true}]"),
    ("{\"x\":{\"y\":{\"z\":1}}}", "{\"x\":{\"y\":{\"w\":[null],\"z\":1}}}", "[{\"op\":\"add\",\"path\":\"/x/y/w\",\"value\":[null]}]"),
    ("[1,2]", "[1,2,3,4]", "[{\"op\":\"add\",\"path\":\"/2\",\"value\":3},{\"op\":\"add\",\"path\":\"/3\",\"value\":4}]"),
    ("{\"a/b\":1,\"m~n\":2}", "{\"a/b\":3}", "[{\"op\":\"replace\",\"path\":\"/a~1b\",\"value\":3},{\"op\":\"remove\",\"path\":\"/m~0n\"}]"),
    ("\"s\"", "{\"k\":\"s\"}", "[{\"op\":\"replace\",\"path\":\"\",\"value\":{\"k\":\"s\"}}]"),
    ("{\"k\":[1,{\"q\":1}]}", "{\"k\":[2,{\"q\":2}]}", "[{\"op\":\"replace\",\"path\":\"/k/0\",\"value\":2},{\"op\":\"replace\",\"path\":\"/k/1/q\",\"value\":2}]"),
    ("{\"same\":1}", "{\"same\":1}", "[]"),
    ("null", "false", "[{\"op\":\"replace\",\"path\":\"\",\"value\":false}]"),
    ("{\"Z\":3,\"a\":2,\"b\":1,\"\u{e9}\":4}", "{}", "[{\"op\":\"remove\",\"path\":\"/Z\"},{\"op\":\"remove\",\"path\":\"/a\"},{\"op\":\"remove\",\"path\":\"/b\"},{\"op\":\"remove\",\"path\":\"/\u{e9}\"}]"),
    ("[]", "[[]]", "[{\"op\":\"add\",\"path\":\"/0\",\"value\":[]}]"),
    ("{\"n\":[1,2,3]}", "{\"n\":[3,2,1]}", "[{\"op\":\"replace\",\"path\":\"/n/0\",\"value\":3},{\"op\":\"replace\",\"path\":\"/n/2\",\"value\":1}]"),
]

private let parseInvalid: [String] = [
    "",
    "{",
    "{\"a\":1,}",
    "[1,]",
    "01",
    "1.",
    ".5",
    "+1",
    "{'a':1}",
    "{\"a\" 1}",
    "\"\\x\"",
    "\"a",
    "tru",
    "nul",
    "[1 2]",
    "\"\t\"",
    "{\"a\":1}x",
    "NaN",
    "1e",
    "\"\\ud800\"",
]

private let parseValid: [(String, String)] = [
    (" {\"a\" : [1, -2, 3.5e2, true, false, null, \"x\\n\\u00e9\\ud83d\\ude00\"]} ", "{\"a\":[1,-2,350,true,false,null,\"x\\n\u{e9}\u{1f600}\"]}"),
    ("\"\\u0001\\\"\\\\/\"", "\"\\u0001\\\"\\\\/\""),
    ("[]", "[]"),
    ("{}", "{}"),
    ("-0", "0"),
    ("1E+2", "100"),
]
/// Byte-exact string comparison (Swift String == ignores canonical-equivalence differences).
private func eqBytes(_ c: inout Checks, _ name: String, _ expected: String, _ actual: @autoclosure () throws -> String) {
    c.eq(name, Array(expected.utf8), Array(try actual().utf8))
}

private func lines(_ text: String) -> [String] {
    var parts = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
    if text.hasSuffix("\n") || text.isEmpty { parts.removeLast() }
    return parts
}

func runLineDiffV2Checks(_ c: inout Checks) {
    for (a, b, context, want) in unifiedVectors {
        eqBytes(&c, "unifiedDiff \(a.debugDescription) -> \(b.debugDescription) context \(context)", want,
                try LineDiff.unifiedDiff(a, b, context: context))
    }
    for (a, b, want) in diffLineVectors { c.eq("diffLines \(a.debugDescription) -> \(b.debugDescription)", want, try LineDiff.diffLines(a, b)) }
    // Property: the operations replay both texts' lines in order.
    for (a, b, _, _) in unifiedVectors {
        guard let ops = try? LineDiff.diffLines(a, b) else { c.check("diffLines replay \(a.debugDescription)", false); continue }
        let oldSide = ops.filter { $0.op != "+" }.map(\.line), newSide = ops.filter { $0.op != "-" }.map(\.line)
        c.check("diffLines replay \(a.debugDescription) -> \(b.debugDescription)", oldSide == lines(a) && newSide == lines(b))
    }
    c.eq("diffLines keeps CR in lines", [DiffOp("-", "a\r"), DiffOp("+", "a")], try LineDiff.diffLines("a\r\n", "a\n"))
    c.throwsError("unifiedDiff rejects negative context", { _ = try LineDiff.unifiedDiff("a", "b", context: -1) },
                  where: { $0 is LineDiffError })
    let huge = String(repeating: "x\n", count: 500_001)
    c.throwsError("diffLines rejects more than 1,000,000 lines", { _ = try LineDiff.diffLines(huge, huge) },
                  where: { $0 is LineDiffError })

    // 3,000 lines with no common line: 3,000 deletions and 3,000 insertions.
    let a3 = (0..<3000).map { "a\($0)\n" }.joined(), b3 = (0..<3000).map { "b\($0)\n" }.joined()
    let ops3 = (try? LineDiff.diffLines(a3, b3)) ?? []
    c.check("diffLines disjoint 3000 lines", ops3.filter { $0.op == "-" }.count == 3000
            && ops3.filter { $0.op == "+" }.count == 3000 && ops3.count == 6000)

    // 100,000 lines with 20 scattered edits runs in linear memory and well under 10 s.
    var bigA: [String] = [], bigB: [String] = []
    for i in 0..<100_000 {
        bigA.append("line \(i)")
        bigB.append(i % 5000 == 1234 ? "edited \(i)" : "line \(i)")
    }
    let textA = bigA.joined(separator: "\n") + "\n", textB = bigB.joined(separator: "\n") + "\n"
    let clock = ContinuousClock()
    var bigOps: [DiffOp] = []
    let elapsed = clock.measure { bigOps = (try? LineDiff.diffLines(textA, textB)) ?? [] }
    c.check("diffLines 100,000 lines with 20 edits", bigOps.filter { $0.op == "-" }.count == 20
            && bigOps.filter { $0.op == "+" }.count == 20 && bigOps.count == 100_020)
    c.check("diffLines 100,000 lines finishes in under 10 s (took \(elapsed))", elapsed < .seconds(10))
}

func runSlugifyChecks(_ c: inout Checks) {
    for (text, sep, maxLength, want) in slugCases {
        eqBytes(&c, "slugify \(text.debugDescription) \(sep) \(maxLength)", want, try Slugify.slugify(text, separator: sep, maxLength: maxLength))
    }
    for (text, sep, maxLength) in slugInvalid {
        c.throwsError("slugify rejects \(sep.debugDescription) \(maxLength)", { _ = try Slugify.slugify(text, separator: sep, maxLength: maxLength) },
                      where: { $0 is SlugifyError })
    }
    for (base, taken, want) in slugUnique {
        c.eq("uniqueSlug \(base) \(taken)", want, try Slugify.uniqueSlug(base, taken: Set(taken)))
        c.eq("uniqueSlug predicate \(base) \(taken)", want, try Slugify.uniqueSlug(base, isTaken: { taken.contains($0) }))
    }
    c.throwsError("uniqueSlug rejects empty base", { _ = try Slugify.uniqueSlug("", taken: []) }, where: { $0 is SlugifyError })
    c.eq("uniqueSlug separator", "post_2", try Slugify.uniqueSlug("post", taken: ["post"], separator: "_"))
    var tableOK = true
    for (cp, want) in slugTable where (try? Slugify.slugify(String(Unicode.Scalar(cp)!))) != want.lowercased() {
        tableOK = false
        print("  table mismatch U+\(String(cp, radix: 16))")
    }
    c.check("slugify transliteration table (\(slugTable.count) entries)", tableOK && slugTable.count == 190)
    c.eq("slugify outside table x/÷", "a-b", try Slugify.slugify("a\u{D7}b\u{F7}"))
}

private func json(_ text: String) -> JsonPatch.Value {
    do { return try JsonPatch.parse(text) } catch { fatalError("bad test JSON \(text): \(error)") }
}

func runJsonPatchChecks(_ c: inout Checks) {
    for (doc, patch, want) in patchApply {
        let d = json(doc), before = JsonPatch.canonical(d)
        eqBytes(&c, "applyPatch \(patch)", want, JsonPatch.canonical(try JsonPatch.applyPatch(d, json(patch))))
        c.check("applyPatch leaves input unchanged \(patch)", JsonPatch.canonical(d) == before)
    }
    for (doc, patch) in patchApplyInvalid {
        c.throwsError("applyPatch rejects \(patch) on \(doc)", { _ = try JsonPatch.applyPatch(json(doc), json(patch)) },
                      where: { $0 is JsonPatchError })
    }
    for (doc, pointer, want) in pointerVectors {
        eqBytes(&c, "getPointer \(pointer.debugDescription)", want, JsonPatch.canonical(try JsonPatch.getPointer(json(doc), pointer)))
    }
    let pointerDoc = json("{\"foo\":[\"bar\",\"baz\"],\"m~n\":8}")
    for pointer in pointerInvalid {
        c.throwsError("getPointer rejects \(pointer.debugDescription)", { _ = try JsonPatch.getPointer(pointerDoc, pointer) },
                      where: { $0 is JsonPatchError })
    }
    for (target, patch, want) in mergeVectors {
        eqBytes(&c, "mergePatch \(target) \(patch)", want, JsonPatch.canonical(JsonPatch.mergePatch(json(target), json(patch))))
    }
    for (a, b, want) in createVectors {
        let patch = JsonPatch.createPatch(json(a), json(b))
        eqBytes(&c, "createPatch \(a) -> \(b)", want, JsonPatch.canonical(patch))
        c.eq("applyPatch(createPatch) \(a) -> \(b)", json(b), try JsonPatch.applyPatch(json(a), patch))
    }
    for text in parseInvalid {
        c.throwsError("parse rejects \(text.debugDescription)", { _ = try JsonPatch.parse(text) }, where: { $0 is JsonPatchError })
    }
    for (text, want) in parseValid { eqBytes(&c, "parse \(text.debugDescription)", want, JsonPatch.canonical(try JsonPatch.parse(text))) }
    c.check("equality: 1 == 1.0", JsonPatch.Value.number(1) == json("1.0"))
    c.check("equality: true != 1", JsonPatch.Value.bool(true) != .number(1))
    c.check("equality ignores member order", json("{\"a\":1,\"b\":[2]}") == json("{\"b\":[2.0],\"a\":1}"))
    c.check("equality compares strings by scalars", JsonPatch.Value.string("\u{E9}") != .string("e\u{301}"))
    eqBytes(&c, "canonical numbers", "[2,-3,0.5,100000000000000000000,0]",
            JsonPatch.canonical(.array([.number(2.0), .number(-3), .number(0.5), .number(1e20), .number(-0.0)])))
    eqBytes(&c, "canonical escapes", "\"\\u0001\\u001f\\b\\f\\n\\r\\t\\\"\\\\/é\"",
            JsonPatch.canonical(.string("\u{1}\u{1F}\u{8}\u{C}\n\r\t\"\\/é")))
    c.throwsError("parse rejects deep nesting", { _ = try JsonPatch.parse(String(repeating: "[", count: 600) + String(repeating: "]", count: 600)) },
                  where: { $0 is JsonPatchError })
    c.eq("createPatch equal -> []", JsonPatch.Value.array([]), JsonPatch.createPatch(json("{\"a\":[1]}"), json("{\"a\":[1.0]}")))
}

func runWave8Checks(_ c: inout Checks) {
    runLineDiffV2Checks(&c)
    runSlugifyChecks(&c)
    runJsonPatchChecks(&c)
}
