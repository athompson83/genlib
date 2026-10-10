// SPDX-License-Identifier: Apache-2.0

package csvsafe

import (
	"reflect"
	"testing"
)

var rows = [][]string{{"id", "name", "note"}, {"1", "Ada, Lovelace", `said "hi"`}, {"2", "=SUM(A1)", "line1\nline2"},
	{"3", " padded", "-5"}}

const vector = "id,name,note\r\n1,\"Ada, Lovelace\",\"said \"\"hi\"\"\"\r\n2,'=SUM(A1),\"line1\nline2\"\r\n3,\" padded\",'-5\r\n"

func TestWrite(t *testing.T) {
	if got := Write(rows, true); got != vector {
		t.Fatalf("got %q", got)
	}
	if got := Write([][]string{{"=1"}}, false); got != "=1\r\n" {
		t.Fatalf("off: %q", got)
	}
	if got := Write(nil, true); got != "" {
		t.Fatalf("empty: %q", got)
	}
	if got := Write([][]string{{"+1", "@x", "\tt", "\rr", "trail "}}, true); got != "'+1,'@x,'\tt,\"'\rr\",\"trail \"\r\n" {
		t.Fatalf("starts: %q", got)
	}
}

func TestParse(t *testing.T) {
	cases := []struct {
		in   string
		want [][]string
	}{
		{"a,b\r\n\"x,1\",\"say \"\"hi\"\"\"\n\"multi\nline\",\n", [][]string{{"a", "b"}, {"x,1", `say "hi"`}, {"multi\nline", ""}}},
		{"\ufeffa\n", [][]string{{"a"}}},
		{"", [][]string{}},
		{"a,b", [][]string{{"a", "b"}}},
	}
	for _, c := range cases {
		if got, err := Parse(c.in); err != nil || !reflect.DeepEqual(got, c.want) {
			t.Fatalf("%q: got %q err %v", c.in, got, err)
		}
	}
	for _, bad := range []string{"a,\"b", "a\"b", "\"a\"x"} {
		if _, err := Parse(bad); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}

func TestRoundTrip(t *testing.T) {
	if got, err := Parse(Write(rows, false)); err != nil || !reflect.DeepEqual(got, rows) {
		t.Fatalf("got %q err %v", got, err)
	}
	if got, _ := Parse(vector); got[2][1] != "'=SUM(A1)" {
		t.Fatalf("parse must not un-neutralize: %q", got[2][1])
	}
}
