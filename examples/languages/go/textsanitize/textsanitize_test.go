// SPDX-License-Identifier: Apache-2.0

package textsanitize

import (
	"reflect"
	"testing"
)

const trojan = "if (accessLevel != \"user\u202e \u2066// Check if admin\u2069 \u2066\") {"

func TestSanitize(t *testing.T) {
	for _, c := range []struct {
		in    string
		allow bool
		max   int
		want  string
	}{
		{"plain text", true, -1, "plain text"},
		{"line1\r\nline2\rline3", true, -1, "line1\nline2\nline3"},
		{"zero\u200bwidth\ufeffbom", true, -1, "zerowidthbom"},
		{"tab\there\x00nul\x7fdel\u0085nel", true, -1, "tab\therenuldelnel"},
		{trojan, true, -1, "if (accessLevel != \"user // Check if admin \") {"},
		{"emoji \U0001F44D\U0001F3FD and ZWJ \U0001F468\u200d\U0001F469\u200d\U0001F467 family", true, -1, "emoji \U0001F44D\U0001F3FD and ZWJ \U0001F468\u200d\U0001F469\u200d\U0001F467 family"},
		{"caf\u00e9 e\u0301", true, -1, "caf\u00e9 e\u0301"},
		{"a\nb\r\nc", false, -1, "a b c"},
		{"abcdef", true, 3, "abc"},
		{"\U0001F600\U0001F600\U0001F600", true, 2, "\U0001F600\U0001F600"},
	} {
		if got := Sanitize(c.in, c.allow, c.max); got != c.want {
			t.Errorf("Sanitize(%q, %v, %d) = %q, want %q", c.in, c.allow, c.max, got, c.want)
		}
	}
}

func TestFindBidi(t *testing.T) {
	for _, s := range []string{"plain text", "line1\r\nline2\rline3", "zero\u200bwidth\ufeffbom", "tab\there\x00nul\x7fdel\u0085nel",
		"emoji \U0001F44D\U0001F3FD and ZWJ \U0001F468\u200d\U0001F469\u200d\U0001F467 family", "caf\u00e9 e\u0301"} {
		if got := FindBidiControls(s); len(got) != 0 {
			t.Errorf("FindBidiControls(%q) = %v, want none", s, got)
		}
	}
	want := []BidiControl{{24, "202E"}, {26, "2066"}, {44, "2069"}, {46, "2066"}}
	if got := FindBidiControls(trojan); !reflect.DeepEqual(got, want) {
		t.Errorf("FindBidiControls(trojan) = %v, want %v", got, want)
	}
}

func TestNormalizeWhitespace(t *testing.T) {
	for _, c := range [][2]string{{"  a   b\t\tc\n\nd  ", "a b c d"}, {"", ""}, {" \t\n ", ""}, {"one", "one"}} {
		if got := NormalizeWhitespace(c[0]); got != c[1] {
			t.Errorf("NormalizeWhitespace(%q) = %q, want %q", c[0], got, c[1])
		}
	}
}
