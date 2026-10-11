// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 10 capability vectors; DO NOT EDIT by hand.

package cachecontrol

import (
	"errors"
	"math"
	"reflect"
	"testing"
)

func TestParse(t *testing.T) {
	for _, c := range []struct {
		in   string
		want []Directive
	}{
		{"public, max-age=600", []Directive{{"public", Value{Kind: Flag}}, {"max-age", Value{Kind: Seconds, Seconds: 600}}}},
		{"no-store", []Directive{{"no-store", Value{Kind: Flag}}}},
		{"private=\"set-cookie, x-y\", max-age=0", []Directive{{"private", Value{Kind: Text, Text: "set-cookie, x-y"}}, {"max-age", Value{Kind: Seconds, Seconds: 0}}}},
		{"max-age=\"120\", s-maxage=60, must-revalidate", []Directive{{"max-age", Value{Kind: Seconds, Seconds: 120}}, {"s-maxage", Value{Kind: Seconds, Seconds: 60}}, {"must-revalidate", Value{Kind: Flag}}}},
		{"max-age=abc, max-age=30", []Directive{{"max-age", Value{Kind: Seconds, Seconds: 30}}}},
		{"MAX-AGE=5, Max-Age=9", []Directive{{"max-age", Value{Kind: Seconds, Seconds: 5}}}},
		{"max-stale", []Directive{{"max-stale", Value{Kind: Flag}}}},
		{"max-stale=120, min-fresh=10", []Directive{{"max-stale", Value{Kind: Seconds, Seconds: 120}}, {"min-fresh", Value{Kind: Seconds, Seconds: 10}}}},
		{"stale-while-revalidate=30, immutable", []Directive{{"stale-while-revalidate", Value{Kind: Seconds, Seconds: 30}}, {"immutable", Value{Kind: Flag}}}},
		{",, public ,,", []Directive{{"public", Value{Kind: Flag}}}},
		{"no-cache=\"Set-Cookie\"", []Directive{{"no-cache", Value{Kind: Text, Text: "Set-Cookie"}}}},
		{"foo=bar, baz=\"q\\\"t\"", []Directive{{"foo", Value{Kind: Text, Text: "bar"}}, {"baz", Value{Kind: Text, Text: "q\"t"}}}},
	} {
		if got, err := Parse(c.in); err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("Parse(%q) = %+v, %v; want %+v", c.in, got, err, c.want)
		}
	}
	if got, _ := Parse("max-age=99999999999999999999999"); len(got) != 1 || got[0].Value.Seconds != math.MaxInt64 {
		t.Errorf("huge max-age = %+v", got)
	}
}

func TestFormat(t *testing.T) {
	for _, c := range []struct {
		in   []Directive
		want string
	}{
		{[]Directive{{"public", Value{Kind: Flag}}, {"max-age", Value{Kind: Seconds, Seconds: 600}}}, "public, max-age=600"},
		{[]Directive{{"private", Value{Kind: Text, Text: "set-cookie, x"}}, {"no-cache", Value{Kind: Flag}}}, "private=\"set-cookie, x\", no-cache"},
		{[]Directive{{"s-maxage", Value{Kind: Seconds, Seconds: 0}}, {"stale-if-error", Value{Kind: Seconds, Seconds: 86400}}}, "s-maxage=0, stale-if-error=86400"},
	} {
		if got := Format(c.in); got != c.want {
			t.Errorf("Format(%+v) = %q, want %q", c.in, got, c.want)
		}
		if back, err := Parse(c.want); err != nil || !reflect.DeepEqual(back, c.in) {
			t.Errorf("round trip %q = %+v, %v", c.want, back, err)
		}
	}
}

func TestFreshness(t *testing.T) {
	for _, c := range []struct {
		in     string
		shared bool
		want   int64
		ok     bool
	}{
		{"max-age=600", false, 600, true},
		{"max-age=600, s-maxage=60", true, 60, true},
		{"max-age=600, s-maxage=60", false, 600, true},
		{"no-store, max-age=600", false, 0, true},
		{"no-cache", true, 0, true},
		{"public", false, 0, false},
	} {
		ds, err := Parse(c.in)
		if err != nil {
			t.Fatal(err)
		}
		if got, ok := Freshness(ds, c.shared); got != c.want || ok != c.ok {
			t.Errorf("Freshness(%q, %v) = %d, %v", c.in, c.shared, got, ok)
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, s := range []string{"private=\"unterminated"} {
		if _, err := Parse(s); !errors.Is(err, ErrSyntax) {
			t.Errorf("Parse(%q) error = %v", s, err)
		}
	}
}
