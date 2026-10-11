// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 10 capability vectors; DO NOT EDIT by hand.

package disposition

import (
	"errors"
	"reflect"
	"testing"
)

func TestBuild(t *testing.T) {
	for _, c := range []struct {
		name   string
		inline bool
		want   string
	}{
		{"report.pdf", false, "attachment; filename=\"report.pdf\""},
		{"caf\u00e9.pdf", false, "attachment; filename=\"caf_.pdf\"; filename*=UTF-8''caf%C3%A9.pdf"},
		{"../etc/passwd", false, "attachment; filename=\"_etc_passwd\""},
		{"a\"b\\c.txt", false, "attachment; filename=\"a_b_c.txt\""},
		{"  .hidden  ", false, "attachment; filename=\"hidden\""},
		{"", false, "attachment; filename=\"download\""},
		{"\u65e5\u672c\u8a9e.txt", true, "inline; filename=\"___.txt\"; filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.txt"},
		{"tab\there.csv", false, "attachment; filename=\"tab_here.csv\""},
		{"100% sure+ok.txt", false, "attachment; filename=\"100% sure+ok.txt\""},
	} {
		if got := Build(c.name, c.inline); got != c.want {
			t.Errorf("Build(%q) = %q, want %q", c.name, got, c.want)
		}
		d, err := Parse(c.want)
		if err != nil || d.Filename == nil || *d.Filename != Sanitize(c.name) {
			t.Errorf("round trip %q = %+v, %v", c.want, d, err)
		}
	}
}

func sp(s string) *string { return &s }

func TestParse(t *testing.T) {
	for _, c := range []struct {
		in   string
		want Disposition
	}{
		{"attachment; filename=\"x.txt\"", Disposition{"attachment", sp("x.txt"), []Param{{"filename", "x.txt"}}}},
		{"attachment; filename=x.txt", Disposition{"attachment", sp("x.txt"), []Param{{"filename", "x.txt"}}}},
		{"INLINE", Disposition{"inline", nil, []Param{}}},
		{"attachment; filename=\"a.txt\"; filename*=UTF-8''%E2%82%AC%20rates.txt", Disposition{"attachment", sp("\u20ac rates.txt"), []Param{{"filename", "\u20ac rates.txt"}}}},
		{"attachment; filename*=iso-8859-1'en'%A3%20rates.txt", Disposition{"attachment", sp("\u00a3 rates.txt"), []Param{{"filename", "\u00a3 rates.txt"}}}},
		{"attachment; filename=\"..\\\\..\\\\evil.exe\"", Disposition{"attachment", sp("_.._evil.exe"), []Param{{"filename", "..\\..\\evil.exe"}}}},
		{"attachment; filename=\"\\\"quoted\\\".txt\"; size=100", Disposition{"attachment", sp("_quoted_.txt"), []Param{{"filename", "\"quoted\".txt"}, {"size", "100"}}}},
		{"form-data; name=\"file\"; filename=\"photo.jpg\"", Disposition{"form-data", sp("photo.jpg"), []Param{{"name", "file"}, {"filename", "photo.jpg"}}}},
	} {
		if got, err := Parse(c.in); err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("Parse(%q) = %+v, %v; want %+v", c.in, got, err, c.want)
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, s := range []string{"; filename=x", "attachment; filename=\"open", "attachment; filename*=UTF-8''%G0", "attachment filename=x"} {
		if _, err := Parse(s); !errors.Is(err, ErrSyntax) {
			t.Errorf("Parse(%q) error = %v", s, err)
		}
	}
}

func TestSanitize(t *testing.T) {
	for _, c := range [][2]string{{"../../x", "_.._x"}, {"...", "download"}, {"a\x7fb", "a_b"}, {"ok.txt", "ok.txt"}} {
		if got := Sanitize(c[0]); got != c[1] {
			t.Errorf("Sanitize(%q) = %q, want %q", c[0], got, c[1])
		}
	}
}
