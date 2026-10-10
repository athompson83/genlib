// SPDX-License-Identifier: Apache-2.0

package utmlinks

import (
	"reflect"
	"strings"
	"testing"
)

func TestBuildURL(t *testing.T) {
	cases := []struct {
		base string
		p    Params
		want string
	}{
		{"https://ex.com/p?ref=a#top", Params{Source: "Newsletter", Medium: "email", Campaign: "Fall Sale"},
			"https://ex.com/p?ref=a&utm_source=newsletter&utm_medium=email&utm_campaign=fall%20sale#top"},
		{"https://ex.com/?utm_source=old", Params{Source: "x", Medium: "y", Campaign: "z", Content: "Hero CTA"},
			"https://ex.com/?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=hero%20cta"},
		{"http://ex.com", Params{Source: " A ", Medium: "b", Campaign: "c!*'()", Term: "k", ID: "Q4"},
			"http://ex.com?utm_id=q4&utm_source=a&utm_medium=b&utm_campaign=c%21%2A%27%28%29&utm_term=k"},
		{"https://ex.com/?utm_medium=a&k=1&utm_medium=b", Params{Source: "s", Medium: "m", Campaign: "c"},
			"https://ex.com/?utm_medium=m&k=1&utm_source=s&utm_campaign=c"},
		{"https://ex.com/", Params{Source: "café", Medium: "m", Campaign: "c"},
			"https://ex.com/?utm_source=caf%C3%A9&utm_medium=m&utm_campaign=c"},
	}
	for _, c := range cases {
		if got, err := BuildURL(c.base, c.p); err != nil || got != c.want {
			t.Fatalf("%s: got %q err %v", c.base, got, err)
		}
	}
	if _, err := BuildURL("https://ex.com/", Params{Source: " ", Medium: "m", Campaign: "c"}); err == nil || !strings.Contains(err.Error(), "source is required") {
		t.Fatalf("required: %v", err)
	}
	for _, bad := range []string{"/p", "mailto:a@b.c", "https://ex.com/a b"} {
		if _, err := BuildURL(bad, Params{Source: "s", Medium: "m", Campaign: "c"}); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}

func TestParse(t *testing.T) {
	got, err := Parse("https://ex.com/?a=1&utm_campaign=fall%20sale&utm_source=news+letter&utm_source=dup")
	want := []Field{{"source", "news letter"}, {"campaign", "fall sale"}}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v err %v", got, err)
	}
	got, _ = Parse("https://ex.com/?utm_content=c&utm_term=t&utm_id=i&utm_medium=m")
	if want := []Field{{"id", "i"}, {"medium", "m"}, {"term", "t"}, {"content", "c"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("order: %v", got)
	}
	if got, _ := Parse("https://ex.com/#utm_source=x"); len(got) != 0 {
		t.Fatalf("fragment: %v", got)
	}
	if _, err := Parse("https://ex.com/?utm_source=%E0%A4%A"); err == nil || !strings.Contains(err.Error(), "percent-encoding") {
		t.Fatalf("bad escape: %v", err)
	}
}

func TestStripTracking(t *testing.T) {
	cases := map[string]string{
		"https://ex.com/p?id=7&utm_source=x&gclid=abc&b=2#s":        "https://ex.com/p?id=7&b=2#s",
		"https://ex.com/?fbclid=1":                                  "https://ex.com/",
		"https://ex.com/?q=a%20b&msclkid=1&_hsenc=2&igshid=3&x=%2F": "https://ex.com/?q=a%20b&x=%2F",
	}
	for in, want := range cases {
		if got, err := StripTracking(in); err != nil || got != want {
			t.Fatalf("%s: got %q err %v", in, got, err)
		}
	}
	if _, err := StripTracking("ex.com/?a=1"); err == nil {
		t.Fatal("accepted relative URL")
	}
}
