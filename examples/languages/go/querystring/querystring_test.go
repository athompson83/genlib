// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 10 capability vectors; DO NOT EDIT by hand.

package querystring

import (
	"reflect"
	"testing"
)

func TestParse(t *testing.T) {
	for _, c := range []struct {
		in   string
		want []Pair
	}{
		{"a=1&b=2", []Pair{{"a", "1"}, {"b", "2"}}},
		{"?a=1&a=2", []Pair{{"a", "1"}, {"a", "2"}}},
		{"x=a+b%20c", []Pair{{"x", "a b c"}}},
		{"e=%E2%82%AC", []Pair{{"e", "\u20ac"}}},
		{"bad=%zz&ok=1", []Pair{{"bad", "%zz"}, {"ok", "1"}}},
		{"%", []Pair{{"%", ""}}},
		{"&&a&&", []Pair{{"a", ""}}},
		{"k=v=w", []Pair{{"k", "v=w"}}},
		{"=v", []Pair{{"", "v"}}},
		{"emoji=%F0%9F%98%80", []Pair{{"emoji", "\U0001f600"}}},
		{"invalid=%FF", []Pair{{"invalid", "\ufffd"}}},
		{"plus=%2B", []Pair{{"plus", "+"}}},
	} {
		if got := Parse(c.in); !reflect.DeepEqual(got, c.want) {
			t.Errorf("Parse(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestStringify(t *testing.T) {
	for _, c := range []struct {
		in   []Pair
		want string
	}{
		{[]Pair{{"a", "1"}, {"b", "x y"}}, "a=1&b=x+y"},
		{[]Pair{{"q", "a&b=c"}, {"e", "\u20ac"}}, "q=a%26b%3Dc&e=%E2%82%AC"},
		{[]Pair{{"*-._", "~!'()"}}, "*-._=%7E%21%27%28%29"},
		{[]Pair{{"k", ""}, {"", "v"}}, "k=&=v"},
	} {
		if got := Stringify(c.in); got != c.want {
			t.Errorf("Stringify(%q) = %q, want %q", c.in, got, c.want)
		}
		if back := Parse(c.want); !reflect.DeepEqual(back, c.in) {
			t.Errorf("round trip %q = %q", c.want, back)
		}
	}
}

func TestGetAll(t *testing.T) {
	if got := GetAll(Parse("a=1&b=2&a=3"), "a"); !reflect.DeepEqual(got, []string{"1", "3"}) {
		t.Errorf("GetAll = %q", got)
	}
	if got := GetAll(nil, "a"); len(got) != 0 {
		t.Errorf("GetAll(nil) = %q", got)
	}
}

func TestInvalidUTF8Subparts(t *testing.T) {
	if got := Parse("x=%E2%82&y=%F0%9F%98%FF")[0][1]; got != "\ufffd" {
		t.Errorf("truncated sequence = %q", got)
	}
	if got := Parse("y=%F0%9F%98%FF")[0][1]; got != "\ufffd\ufffd" {
		t.Errorf("bad continuation = %q", got)
	}
}
