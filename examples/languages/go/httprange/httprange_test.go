// SPDX-License-Identifier: Apache-2.0

package httprange

import (
	"reflect"
	"strings"
	"testing"
)

func r(pairs ...int64) Result {
	var out [][2]int64
	for i := 0; i < len(pairs); i += 2 {
		out = append(out, [2]int64{pairs[i], pairs[i+1]})
	}
	return Result{Kind: Ranges, Ranges: out}
}

func TestVectors(t *testing.T) {
	none := Result{Kind: None}
	unsat := Result{Kind: Unsatisfiable, ContentRange: "bytes */10000"}
	for _, c := range []struct {
		header string
		want   Result
	}{
		{"bytes=0-499", r(0, 499)},
		{"bytes=500-999", r(500, 999)},
		{"bytes=-500", r(9500, 9999)},
		{"bytes=9500-", r(9500, 9999)},
		{"bytes=0-0,-1", r(0, 0, 9999, 9999)},
		{"bytes= 0-1 , 5-6", r(0, 1, 5, 6)},
		{"BYTES=0-99", r(0, 99)},
		{"bytes=9999-20000", r(9999, 9999)},
		{"bytes=10000-", unsat},
		{"bytes=-0", unsat},
		{"bytes=-20000", r(0, 9999)},
		{"bytes=500-400", none},
		{"items=0-1", none},
		{"bytes=", none},
		{"bytes=0-1,", none},
		{"bytes=abc", none},
		{"bytes=1-2-3", none},
		{"", none}, // absent header
		{"bytes=10000-10001,20000-", unsat},
	} {
		if got := ParseRange(c.header, 10000); !reflect.DeepEqual(got, c.want) {
			t.Errorf("ParseRange(%q) = %+v, want %+v", c.header, got, c.want)
		}
	}
	empty := Result{Kind: Unsatisfiable, ContentRange: "bytes */0"}
	for _, h := range []string{"bytes=0-", "bytes=-5"} {
		if got := ParseRange(h, 0); !reflect.DeepEqual(got, empty) {
			t.Errorf("ParseRange(%q, 0) = %+v", h, got)
		}
	}
	if got := ContentRange(0, 499, 10000); got != "bytes 0-499/10000" {
		t.Errorf("ContentRange = %q", got)
	}
}

func TestLimits(t *testing.T) {
	many := "bytes=" + strings.TrimSuffix(strings.Repeat("0-1,", 101), ",")
	if got := ParseRange(many, 10); got.Kind != None {
		t.Errorf("101 specs = %+v", got)
	}
	if got := ParseRange("bytes=99999999999999999999-99999999999999999998", 10); got.Kind != None {
		t.Errorf("huge reversed range = %+v", got)
	}
	if got := ParseRange("bytes=0-99999999999999999999", 10); !reflect.DeepEqual(got, r(0, 9)) {
		t.Errorf("huge end = %+v", got)
	}
}
