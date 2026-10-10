// SPDX-License-Identifier: Apache-2.0

package natsort

import (
	"reflect"
	"testing"
)

func TestSorted(t *testing.T) {
	for _, c := range []struct{ in, want []string }{
		{[]string{"file10.txt", "file2.txt", "File1.txt", "file1.txt", "file01.txt", "a", "A", "b", "10", "9", "x2y10", "x2y9", "x02y1", "", "file1"}, []string{"", "9", "10", "A", "a", "b", "file1", "File1.txt", "file1.txt", "file01.txt", "file2.txt", "file10.txt", "x02y1", "x2y9", "x2y10"}},
		{[]string{"v1.10.0", "v1.2.0", "v1.9.9", "v10.0", "v1.2.10"}, []string{"v1.2.0", "v1.2.10", "v1.9.9", "v1.10.0", "v10.0"}},
		{[]string{"img12.png", "img10.png", "IMG2.png", "img1.png"}, []string{"img1.png", "IMG2.png", "img10.png", "img12.png"}},
		{[]string{"a0", "a00", "a000", "a", "a1", "a01"}, []string{"a", "a0", "a00", "a000", "a1", "a01"}},
		{[]string{"\u00c4", "Z", "a", "z", "_x", "1x"}, []string{"1x", "_x", "a", "Z", "z", "\u00c4"}},
	} {
		in := append([]string(nil), c.in...)
		if got := Sort(c.in); !reflect.DeepEqual(got, c.want) {
			t.Errorf("Sort(%q) = %q, want %q", c.in, got, c.want)
		}
		if !reflect.DeepEqual(in, c.in) {
			t.Error("Sort modified its input")
		}
	}
}

func TestCompare(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want int
	}{
		{"a2", "a10", -1},
		{"a10", "a2", 1},
		{"abc", "ABC", 1},
		{"x01", "x1", 1},
		{"x1", "x1", 0},
		{"", "a", -1},
		{"a", "1", 1},
		{"99999999999999999999", "100000000000000000000", -1},
	} {
		if got := Compare(c.a, c.b); got != c.want {
			t.Errorf("Compare(%q, %q) = %d, want %d", c.a, c.b, got, c.want)
		}
	}
}
