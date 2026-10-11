// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 10 capability vectors; DO NOT EDIT by hand.

package linkheader

import (
	"errors"
	"reflect"
	"testing"
)

func TestParse(t *testing.T) {
	for _, c := range []struct {
		in   string
		want []Link
	}{
		{"<https://api.test/items?page=2>; rel=\"next\", <https://api.test/items?page=9>; rel=\"last\"", []Link{{"https://api.test/items?page=2", []Param{{"rel", "next"}}}, {"https://api.test/items?page=9", []Param{{"rel", "last"}}}}},
		{"<https://x/?a=1,2>; rel=next; title=\"a, \\\"b\\\"; c\"", []Link{{"https://x/?a=1,2", []Param{{"rel", "next"}, {"title", "a, \"b\"; c"}}}}},
		{"</TheBook/chapter2>; rel=\"previous\"; title*=UTF-8'de'letztes%20Kapitel, </TheBook/chapter4>; rel=\"next\"; title*=UTF-8'de'n%c3%a4chstes%20Kapitel", []Link{{"/TheBook/chapter2", []Param{{"rel", "previous"}, {"title", "letztes Kapitel"}}}, {"/TheBook/chapter4", []Param{{"rel", "next"}, {"title", "n\u00e4chstes Kapitel"}}}}},
		{"<http://example.org/>; REL=\"Start Index\"; anchor=\"#x\"; rel=ignored; hreflang=en", []Link{{"http://example.org/", []Param{{"rel", "start index"}, {"anchor", "#x"}, {"hreflang", "en"}}}}},
		{"<a>;rel=x;crossorigin", []Link{{"a", []Param{{"rel", "x"}, {"crossorigin", ""}}}}},
		{"", []Link{}},
		{"  ,  <a>; rel=x ,", []Link{{"a", []Param{{"rel", "x"}}}}},
	} {
		if got, err := Parse(c.in); err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("Parse(%q) = %+v, %v; want %+v", c.in, got, err, c.want)
		}
	}
}

func TestFindRel(t *testing.T) {
	if ls, err := Parse("<https://api.test/items?page=2>; rel=\"next\", <https://api.test/items?page=9>; rel=\"last\""); err != nil {
		t.Fatal(err)
	} else if got := FindRel(ls, "LAST"); got == nil || got.URI != "https://api.test/items?page=9" {
		t.Errorf("FindRel(%q) = %+v", "LAST", got)
	}
	if ls, err := Parse("<https://api.test/items?page=2>; rel=\"next\", <https://api.test/items?page=9>; rel=\"last\""); err != nil {
		t.Fatal(err)
	} else if got := FindRel(ls, "prev"); got != nil {
		t.Errorf("FindRel(%q) = %+v, want nil", "prev", got)
	}
}

func TestFormat(t *testing.T) {
	for _, c := range []struct {
		in   []Link
		want string
	}{
		{[]Link{{"/a", []Param{{"rel", "next"}}}}, "</a>; rel=\"next\""},
		{[]Link{{"/b", []Param{{"rel", "prev"}, {"title", "Page \"1\""}, {"type", "text/html"}}}, {"/c", []Param{{"rel", "next"}, {"title", "\u20ac x"}}}}, "</b>; rel=\"prev\"; title=\"Page \\\"1\\\"\"; type=\"text/html\", </c>; rel=\"next\"; title*=UTF-8''%E2%82%AC%20x"},
	} {
		if got := Format(c.in); got != c.want {
			t.Errorf("Format(%+v) = %q, want %q", c.in, got, c.want)
		}
		if back, err := Parse(c.want); err != nil || !reflect.DeepEqual(back, c.in) {
			t.Errorf("round trip %q = %+v, %v", c.want, back, err)
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, s := range []string{"https://x; rel=next", "<https://x", "<a>; title=\"x", "<a> rel=x", "<a>; title*=UTF-8''%zz", "<a>; title*=KOI8-R''x"} {
		if _, err := Parse(s); !errors.Is(err, ErrSyntax) {
			t.Errorf("Parse(%q) error = %v", s, err)
		}
	}
}
