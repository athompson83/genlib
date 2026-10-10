// SPDX-License-Identifier: Apache-2.0

package sse

import (
	"reflect"
	"testing"
)

func sp(s string) *string { return &s }
func ip(n int64) *int64   { return &n }

func TestParse(t *testing.T) {
	for _, c := range []struct {
		text     string
		want     []Event
		retry    int64
		hasRetry bool
	}{
		{"data: YHOO\ndata: +2\ndata: 10\n\n", []Event{{"message", "YHOO\n+2\n10", ""}}, 0, false},
		{": test stream\n\ndata: first event\nid: 1\n\ndata:second event\nid\n\ndata:  third event\n", []Event{{"message", "first event", "1"}, {"message", "second event", ""}}, 0, false},
		{"data\n\ndata\ndata\n\ndata:", []Event{{"message", "", ""}, {"message", "\n", ""}}, 0, false},
		{"data:test\n\ndata: test\n\n", []Event{{"message", "test", ""}, {"message", "test", ""}}, 0, false},
		{"event: add\ndata: 73857293\n\nevent: remove\ndata: 2153\n\nevent: add\ndata: 113411\n\n", []Event{{"add", "73857293", ""}, {"remove", "2153", ""}, {"add", "113411", ""}}, 0, false},
		{"\ufeffdata: bom\n\n", []Event{{"message", "bom", ""}}, 0, false},
		{"data: a\r\ndata: b\r\rdata: c\n\n", []Event{{"message", "a\nb", ""}, {"message", "c", ""}}, 0, false},
		{"id: 7\ndata: x\n\ndata: y\n\nid\ndata: z\n\n", []Event{{"message", "x", "7"}, {"message", "y", "7"}, {"message", "z", ""}}, 0, false},
		{"id: a\u0000b\ndata: nul\n\n", []Event{{"message", "nul", ""}}, 0, false},
		{"retry: 1500\ndata: r\n\nretry: x\ndata: s\n\n", []Event{{"message", "r", ""}, {"message", "s", ""}}, 1500, true},
		{"event\ndata: e\n\n", []Event{{"message", "e", ""}}, 0, false},
		{"unknown: q\ndata: u\n\n", []Event{{"message", "u", ""}}, 0, false},
		{":\n:comment\ndata: ok\n\n", []Event{{"message", "ok", ""}}, 0, false},
		{"data: no blank line at end", []Event{}, 0, false},
	} {
		p := NewParser()
		if got := p.Feed(c.text); !reflect.DeepEqual(got, c.want) {
			t.Errorf("Feed(%q) = %v, want %v", c.text, got, c.want)
		}
		if r, ok := p.Retry(); r != c.retry || ok != c.hasRetry {
			t.Errorf("Retry after %q = %d %v", c.text, r, ok)
		}
		if got := Parse(c.text); !reflect.DeepEqual(got, c.want) {
			t.Errorf("Parse(%q) = %v", c.text, got)
		}
	}
}

func TestChunked(t *testing.T) {
	for _, c := range []struct {
		chunks []string
		want   []Event
	}{
		{[]string{"data: YHO", "O\ndata: +2\n", "data", ": 10\n\n"}, []Event{{"message", "YHOO\n+2\n10", ""}}},
		{[]string{": te", "st stream\n\ndata: first event\nid: 1\n\ndata:s", "econd event\nid\n\ndata: ", " third event\n"}, []Event{{"message", "first event", "1"}, {"message", "second event", ""}}},
		{[]string{"da", "ta\n\nda", "ta\ndata", "\n\ndata:"}, []Event{{"message", "", ""}, {"message", "\n", ""}}},
		{[]string{"data", ":t", "est\n\nd", "ata: test\n\n"}, []Event{{"message", "test", ""}, {"message", "test", ""}}},
		{[]string{"event: add\ndata: 73857293\n\nevent", ": remove\ndata: 21", "53\n\nevent: a", "dd\ndata: 113411\n\n"}, []Event{{"add", "73857293", ""}, {"remove", "2153", ""}, {"add", "113411", ""}}},
		{[]string{"\ufeffd", "at", "a: bo", "m\n\n"}, []Event{{"message", "bom", ""}}},
		{[]string{"d", "ata: a", "\r\ndata: b\r\rdata: ", "c\n\n"}, []Event{{"message", "a\nb", ""}, {"message", "c", ""}}},
		{[]string{"id: 7\ndata: ", "x\n\ndat", "a: y\n\nid\n", "data: z\n\n"}, []Event{{"message", "x", "7"}, {"message", "y", "7"}, {"message", "z", ""}}},
		{[]string{"id:", " a\u0000", "b\ndata:", " nul\n\n"}, []Event{{"message", "nul", ""}}},
		{[]string{"r", "etry: 15", "00\ndata: r\n\nretry: x", "\ndata: s\n\n"}, []Event{{"message", "r", ""}, {"message", "s", ""}}},
	} {
		p, got := NewParser(), []Event{}
		for _, ch := range c.chunks {
			got = append(got, p.Feed(ch)...)
		}
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("chunks %q = %v, want %v", c.chunks, got, c.want)
		}
	}
}

func TestFormat(t *testing.T) {
	for _, c := range []struct {
		data string
		opts FormatOptions
		want string
	}{
		{"hello", FormatOptions{nil, nil, nil}, "data: hello\n\n"},
		{"a\nb\r\nc", FormatOptions{sp("update"), sp("42"), nil}, "event: update\nid: 42\ndata: a\ndata: b\ndata: c\n\n"},
		{"", FormatOptions{nil, nil, ip(3000)}, "retry: 3000\ndata: \n\n"},
		{"{\"x\":1}", FormatOptions{sp("json"), sp(""), nil}, "event: json\nid: \ndata: {\"x\":1}\n\n"},
	} {
		if got, err := Format(c.data, c.opts); err != nil || got != c.want {
			t.Errorf("Format(%q) = %q, %v, want %q", c.data, got, err, c.want)
		}
	}
	for _, c := range []struct {
		data string
		opts FormatOptions
	}{
		{"x", FormatOptions{sp("a\nb"), nil, nil}},
		{"x", FormatOptions{nil, sp("a\rb"), nil}},
		{"x", FormatOptions{nil, sp("a\u0000"), nil}},
		{"x", FormatOptions{nil, nil, ip(-1)}},
	} {
		if _, err := Format(c.data, c.opts); err == nil {
			t.Errorf("Format(%q, %+v) should fail", c.data, c.opts)
		}
	}
}

func TestComment(t *testing.T) {
	if got, err := FormatComment(""); err != nil || got != ":\n\n" {
		t.Errorf("FormatComment(%q) = %q", "", got)
	}
	if got, err := FormatComment("ping"); err != nil || got != ": ping\n\n" {
		t.Errorf("FormatComment(%q) = %q", "ping", got)
	}
	if _, err := FormatComment("a\nb"); err == nil {
		t.Error("multi-line comment should fail")
	}
}
