// SPDX-License-Identifier: Apache-2.0

package linediff

import (
	"reflect"
	"strings"
	"testing"
)

type c struct{ a, b, ops, unified string }

// ops are written as "=a|-b|+B" for compactness.
var cases = []c{
	{"a\nb\nc\n", "a\nB\nc\n", "=a|-b|+B|=c", "--- old.txt\n+++ new.txt\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n"},
	{"", "x\n", "+x", "--- old.txt\n+++ new.txt\n@@ -0,0 +1 @@\n+x\n"},
	{"x\n", "", "-x", "--- old.txt\n+++ new.txt\n@@ -1 +0,0 @@\n-x\n"},
	{"one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n", "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nNINE\nten\n", "=one|-two|+TWO|=three|=four|=five|=six|=seven|=eight|-nine|+NINE|=ten", "--- old.txt\n+++ new.txt\n@@ -1,10 +1,10 @@\n one\n-two\n+TWO\n three\n four\n five\n six\n seven\n eight\n-nine\n+NINE\n ten\n"},
	{"1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\nY\n15\n16\n", "=1|=2|-3|+X|=4|=5|=6|=7|=8|=9|=10|=11|=12|=13|-14|+Y|=15|=16", "--- old.txt\n+++ new.txt\n@@ -1,6 +1,6 @@\n 1\n 2\n-3\n+X\n 4\n 5\n 6\n@@ -11,6 +11,6 @@\n 11\n 12\n 13\n-14\n+Y\n 15\n 16\n"},
	{"a\nb\n", "a\nb", "=a|-b|+b", "--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n"},
	{"a\nb", "a\nc", "=a|-b|+c", "--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file\n"},
	{"same\n", "same\n", "=same", ""},
	{"a\nb\nc\nd\n", "b\nc\nd\ne\n", "-a|=b|=c|=d|+e", "--- old.txt\n+++ new.txt\n@@ -1,4 +1,4 @@\n-a\n b\n c\n d\n+e\n"},
	{"x\ny\n", "y\nx\n", "-x|=y|+x", "--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n-x\n y\n+x\n"},
	{"a\nb\nd\nd\ne\nc\nb", "c\nd\nc\nd\nb\nb\na\nb\n", "-a|-b|-d|+c|=d|-e|=c|-b|+d|+b|+b|+a|+b", "--- old.txt\n+++ new.txt\n@@ -1,7 +1,8 @@\n-a\n-b\n-d\n+c\n d\n-e\n c\n-b\n\\ No newline at end of file\n+d\n+b\n+b\n+a\n+b\n"},
	{"a\nd\nd\na\nb\na", "b\na\nc\ne\na\na\na\n", "+b|=a|-d|-d|+c|+e|=a|-b|-a|+a|+a", "--- old.txt\n+++ new.txt\n@@ -1,6 +1,7 @@\n+b\n a\n-d\n-d\n+c\n+e\n a\n-b\n-a\n\\ No newline at end of file\n+a\n+a\n"},
	{"x", "x", "=x", ""},
	{"x", "x\n", "-x|+x", "--- old.txt\n+++ new.txt\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+x\n"},
	{"p\nq", "q\np", "-p|-q|+q|+p", "--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n-p\n-q\n\\ No newline at end of file\n+q\n+p\n\\ No newline at end of file\n"},
}

func TestLines(t *testing.T) {
	for _, tc := range cases {
		var want []Op
		for _, s := range strings.Split(tc.ops, "|") {
			want = append(want, Op{s[:1], s[1:]})
		}
		if got, err := Lines(tc.a, tc.b); err != nil || !reflect.DeepEqual(got, want) {
			t.Errorf("Lines(%q, %q) = %v, %v; want %v", tc.a, tc.b, got, err, want)
		}
	}
}

func TestUnified(t *testing.T) {
	for _, tc := range cases {
		if got, err := Unified(tc.a, tc.b, "old.txt", "new.txt", 3); err != nil || got != tc.unified {
			t.Errorf("Unified(%q, %q) = %q, %v; want %q", tc.a, tc.b, got, err, tc.unified)
		}
	}
}

func TestLimit(t *testing.T) {
	big := strings.Repeat("x\n", 2001)
	if _, err := Lines(big, big); err == nil {
		t.Error("Lines over 4,000,000 pairs want error")
	}
	if _, err := Unified("a\n", "b\n", "a", "b", -1); err == nil {
		t.Error("negative context want error")
	}
}
